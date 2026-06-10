const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");

const {
    ensureTuTienProfile,
    updateTuTienProfile,
    consumeShopItem,
    addShopItem,
    getInventory,
    getShop,
} = require("./database");
const sharedCombat = require("./utils/combat");
const tuTienConfig = require("./config/tutien");
const quest = require("./quest");
const skillConfig = require("./config/kynang");
const chestConfig = require("./config/chest");
const bicanh = require("./bicanh");

const skillTierNames = skillConfig.skillTierNames || {};
const activeSkills = Array.isArray(skillConfig.activeSkills)
    ? skillConfig.activeSkills
    : [];
const passiveSkills = Array.isArray(skillConfig.passiveSkills)
    ? skillConfig.passiveSkills
    : [];

function normalizeVietnamese(text) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d");
}

function containsPigKeyword(text) {
    const normalized = normalizeVietnamese(text);

    return (
        normalized.includes("lon") ||
        normalized.includes("tru") ||
        normalized.includes("pig") ||
        normalized.includes("heo")
    );
}

function formatNumber(number) {
    return Number(number || 0).toLocaleString("vi-VN");
}

function getRealms() {
    if (Array.isArray(tuTienConfig.realms) && tuTienConfig.realms.length > 0) {
        return tuTienConfig.realms;
    }

    return [
        {
            name: "Phàm Lợn",
            maxExp: 500,
            breakthroughChance: 0.9,
        },
    ];
}

function getRealm(profile) {
    const realms = getRealms();

    return realms[profile.realmIndex || 0] || realms[0];
}

function getRealmName(profile) {
    const realm = getRealm(profile);

    return `${realm.name} - Tầng ${profile.floor || 1}`;
}

function getMaxExp(profile) {
    return getRealm(profile).maxExp;
}

function getRootById(rootId) {
    const roots = Array.isArray(tuTienConfig.spiritualRoots)
        ? tuTienConfig.spiritualRoots
        : [];

    return roots.find((root) => {
        return root.id === rootId;
    });
}

function getRootChanceList(pillUses = 0) {
    const roots = Array.isArray(tuTienConfig.spiritualRoots)
        ? tuTienConfig.spiritualRoots
        : [];

    if (roots.length <= 0) {
        return [
            {
                id: "tap_linh_can",
                name: "Tạp Linh Căn",
                emoji: "🌫️",
                chance: 100,
                expBonus: 0,
                breakthroughBonus: 0,
                description: "Lợn phàm tục, tu chậm như rùa bò.",
                finalChance: 100,
            },
        ];
    }

    const chanceList = roots.map((root) => ({
        ...root,
        finalChance: Number(root.chance || 0),
    }));

    if (chanceList.length <= 1 || pillUses <= 0) {
        return chanceList;
    }

    const RARENESS_POWER = 4;
    const MAMU_THANH_CAN_WEIGHT_MULTIPLIER = 0.08;

    let reduceLeft = pillUses * 5;

    for (let i = 0; i < chanceList.length - 1; i++) {
        if (reduceLeft <= 0) break;

        const currentRoot = chanceList[i];

        if (currentRoot.finalChance <= 0) continue;

        const reduceAmount = Math.min(currentRoot.finalChance, reduceLeft);

        currentRoot.finalChance -= reduceAmount;
        reduceLeft -= reduceAmount;

        const higherRoots = chanceList.slice(i + 1);

        const totalWeight = higherRoots.reduce((total, root, index) => {
            let weight = 1 / Math.pow(index + 1, RARENESS_POWER);

            if (root.id === "mamu_thanh_can") {
                weight *= MAMU_THANH_CAN_WEIGHT_MULTIPLIER;
            }

            return total + weight;
        }, 0);

        higherRoots.forEach((root, index) => {
            let weight = 1 / Math.pow(index + 1, RARENESS_POWER);

            if (root.id === "mamu_thanh_can") {
                weight *= MAMU_THANH_CAN_WEIGHT_MULTIPLIER;
            }

            root.finalChance += reduceAmount * (weight / totalWeight);
        });
    }

    return chanceList;
}
function pickWeightedRoot(pillUses = 0) {
    const roots = getRootChanceList(pillUses);

    const totalChance = roots.reduce((total, root) => {
        return total + root.finalChance;
    }, 0);

    let roll = Math.random() * totalChance;

    for (const root of roots) {
        roll -= root.finalChance;

        if (roll <= 0) {
            return root;
        }
    }

    return roots[0];
}

function pickWeightedChestDrop(drops) {
    const totalChance = drops.reduce((total, drop) => {
        return total + Number(drop.chance || 0);
    }, 0);

    let roll = Math.random() * totalChance;

    for (const drop of drops) {
        roll -= Number(drop.chance || 0);

        if (roll <= 0) {
            return drop;
        }
    }

    return drops[drops.length - 1];
}

function canBreakthroughRealm(profile) {
    const maxExp = getMaxExp(profile);

    return (profile.floor || 1) >= 10 && (profile.exp || 0) >= maxExp;
}

function autoAdvanceFloors(profile) {
    if (profile.realmIndex === undefined) {
        profile.realmIndex = 0;
    }

    if (profile.floor === undefined) {
        profile.floor = 1;
    }

    if (profile.exp === undefined) {
        profile.exp = 0;
    }

    let maxExp = getMaxExp(profile);

    while ((profile.floor || 1) < 10 && (profile.exp || 0) >= maxExp) {
        profile.exp -= maxExp;
        profile.floor = (profile.floor || 1) + 1;
        maxExp = getMaxExp(profile);
    }
}

function getPendingBreakthroughPill(profile) {
    if (!profile.breakthroughPill) {
        return null;
    }

    const shop = getShop();
    const item = shop[profile.breakthroughPill.itemId];

    if (!item || item.type !== "breakthrough_pill") {
        return null;
    }

    return {
        itemId: profile.breakthroughPill.itemId,
        ...item,
    };
}

function isPillValidForCurrentRealm(profile, pill) {
    return pill && pill.fromRealmIndex === (profile.realmIndex || 0);
}

const MAX_REALM_FLOOR = 10;

function calculateRealmPower(realmIndex) {
    const safeRealmIndex = Math.max(0, Number(realmIndex || 0));

    return Math.floor(1000 * Math.pow(safeRealmIndex + 1, 2.2));
}

function calculateFloorPower(realmPower, floor) {
    const safeFloor = Math.max(
        1,
        Math.min(MAX_REALM_FLOOR, Number(floor || 1)),
    );

    return Math.floor(realmPower * ((safeFloor - 1) * 0.06));
}

function calculateExpPower(profile, realmPower, floorPower) {
    const realmIndex = Number(profile.realmIndex || 0);
    const exp = Math.max(0, Number(profile.exp || 0));
    const realms = Array.isArray(tuTienConfig.realms)
        ? tuTienConfig.realms
        : [];
    const realm = realms[realmIndex] || realms[0] || {};
    const maxExp = Math.max(1, Number(realm.maxExp || 1));

    const expRate = Math.max(0, Math.min(1, exp / maxExp));
    const expPowerCap = Math.floor((realmPower + floorPower) * 0.1);

    return Math.floor(expPowerCap * expRate);
}

function calculateBaseCombatPower(profile) {
    const root = getRootById(profile.rootId);
    const roots = Array.isArray(tuTienConfig.spiritualRoots)
        ? tuTienConfig.spiritualRoots
        : [];

    const realmIndex = Number(profile.realmIndex || 0);
    const floor = Number(profile.floor || 1);

    const realmPower = calculateRealmPower(realmIndex);
    const floorPower = calculateFloorPower(realmPower, floor);
    const expPower = calculateExpPower(profile, realmPower, floorPower);

    const basePower = realmPower + floorPower + expPower;

    if (!root) {
        return basePower;
    }

    const rootRankIndex = roots.findIndex((item) => item.id === root.id);
    const rootRank = rootRankIndex >= 0 ? rootRankIndex + 1 : 1;

    const rootRankBonus = rootRank * 180;
    const rootMultiplier =
        1 +
        Number(root.expBonus || 0) * 0.22 +
        Number(root.breakthroughBonus || 0) * 0.55;

    return Math.floor((basePower + rootRankBonus) * rootMultiplier);
}

function getAllSkillDefs() {
    return [...activeSkills, ...passiveSkills];
}

function getSkillDef(skillId) {
    return getAllSkillDefs().find((skill) => skill.id === skillId);
}

function getSkillTypeText(type) {
    return type === "active" ? "Chủ động" : "Bị động";
}

function ensureEquippedSkillData(profile) {
    if (!profile.equippedSkills) {
        profile.equippedSkills = {
            active: [],
            passive: [],
        };
    }

    if (!Array.isArray(profile.equippedSkills.active)) {
        profile.equippedSkills.active = [];
    }

    if (!Array.isArray(profile.equippedSkills.passive)) {
        profile.equippedSkills.passive = [];
    }

    return profile.equippedSkills;
}

function getEquippedPassiveSkillBonuses(profile) {
    const equipped = ensureEquippedSkillData(profile);

    const bonus = {
        atkBonus: 0,
        defenseBonus: 0,
        hpBonus: 0,
        speedBonus: 0,

        critChanceBonus: 0,
        dodgeChance: 0,
        counterChance: 0,
        counterDamageMultiplier: 0,
        damageReduction: 0,
        reviveChance: 0,
        reviveHpPercent: 0,
        lowHpAtkBonus: 0,
        triggerHpBelow: 0,
    };

    equipped.passive.forEach((skillId) => {
        const skill = getSkillDef(skillId);

        if (!skill || skill.type !== "passive") {
            return;
        }

        bonus.atkBonus += Number(skill.atkBonus || 0);
        bonus.defenseBonus += Number(skill.defenseBonus || 0);
        bonus.hpBonus += Number(skill.hpBonus || 0);
        bonus.speedBonus += Number(skill.speedBonus || 0);

        bonus.critChanceBonus += Number(skill.critChanceBonus || 0);
        bonus.dodgeChance += Number(skill.dodgeChance || 0);
        bonus.counterChance += Number(skill.counterChance || 0);
        bonus.damageReduction += Number(skill.damageReduction || 0);
        bonus.lowHpAtkBonus += Number(skill.lowHpAtkBonus || 0);

        bonus.counterDamageMultiplier = Math.max(
            bonus.counterDamageMultiplier,
            Number(skill.counterDamageMultiplier || 0),
        );

        bonus.reviveChance = Math.max(
            bonus.reviveChance,
            Number(skill.reviveChance || 0),
        );

        bonus.reviveHpPercent = Math.max(
            bonus.reviveHpPercent,
            Number(skill.reviveHpPercent || 0),
        );

        bonus.triggerHpBelow = Math.max(
            bonus.triggerHpBelow,
            Number(skill.triggerHpBelow || 0),
        );
    });

    bonus.critChanceBonus = Math.min(0.45, bonus.critChanceBonus);
    bonus.dodgeChance = Math.min(0.45, bonus.dodgeChance);
    bonus.counterChance = Math.min(0.4, bonus.counterChance);
    bonus.damageReduction = Math.min(0.35, bonus.damageReduction);

    return bonus;
}

function getEquippedActiveSkills(profile) {
    const equipped = ensureEquippedSkillData(profile);

    return equipped.active
        .map((skillId) => getSkillDef(skillId))
        .filter((skill) => {
            return skill && skill.type === "active";
        });
}

function calculateActiveSkillPowerBonus(profile) {
    const skills = getEquippedActiveSkills(profile);

    const score = skills.reduce((total, skill) => {
        const hits = Math.max(1, Number(skill.hits || 1));
        const damageMultiplier = Number(skill.damageMultiplier || 0);

        const damageScore =
            damageMultiplier > 1 ? (damageMultiplier - 1) * 0.08 : 0;

        const multiHitScore =
            hits > 1 ? (hits - 1) * damageMultiplier * 0.025 : 0;

        const utilityScore =
            Number(skill.defenseIgnore || 0) * 0.12 +
            Number(skill.stunChance || 0) * 0.12 +
            Number(skill.defenseDown || 0) * 0.08 +
            Number(skill.atkDown || 0) * 0.08 +
            Number(skill.speedDown || 0) * 0.03 +
            Number(skill.poisonPercent || 0) *
                Math.max(1, Number(skill.duration || 1)) *
                0.06 +
            Number(skill.shieldPercent || 0) * 0.08 +
            Number(skill.atkUp || 0) * 0.08 +
            Number(skill.defenseUp || 0) * 0.06 +
            Number(skill.dodgeChance || 0) * 0.06 +
            Number(skill.lifeSteal || 0) * 0.07 +
            Number(skill.executeBonusDamage || 0) * 0.05 +
            Number(skill.critChanceBonus || 0) * 0.06;

        return total + damageScore + multiHitScore + utilityScore;
    }, 0);

    return Math.min(0.35, Math.max(0, score));
}

function formatPercent(value) {
    return `${Math.floor(Number(value || 0) * 100)}%`;
}

function formatEquippedSkills(profile) {
    const equipped = ensureEquippedSkillData(profile);

    const activeText =
        equipped.active.length > 0
            ? equipped.active
                  .map((skillId, index) => {
                      const skill = getSkillDef(skillId);

                      if (!skill) {
                          return `${index + 1}. ❓ ${skillId}`;
                      }

                      return `${index + 1}. ${skill.emoji || "⚔️"} **${skill.name}** | ${skill.tier} - ${skillTierNames[skill.tier] || skill.tier}`;
                  })
                  .join("\n")
            : "Chưa trang bị kỹ năng chủ động.";

    const passiveText =
        equipped.passive.length > 0
            ? equipped.passive
                  .map((skillId, index) => {
                      const skill = getSkillDef(skillId);

                      if (!skill) {
                          return `${index + 1}. ❓ ${skillId}`;
                      }

                      const bonuses = [];

                      if (skill.atkBonus) {
                          bonuses.push(`ATK +${formatPercent(skill.atkBonus)}`);
                      }

                      if (skill.defenseBonus) {
                          bonuses.push(
                              `Thủ +${formatPercent(skill.defenseBonus)}`,
                          );
                      }

                      if (skill.hpBonus) {
                          bonuses.push(`Máu +${formatPercent(skill.hpBonus)}`);
                      }

                      if (skill.speedBonus) {
                          bonuses.push(
                              `Speed +${formatPercent(skill.speedBonus)}`,
                          );
                      }

                      return `${index + 1}. ${skill.emoji || "🧘"} **${skill.name}** | ${skill.tier} - ${skillTierNames[skill.tier] || skill.tier}\n${bonuses.length > 0 ? `   ↳ ${bonuses.join(" | ")}` : ""}`;
                  })
                  .join("\n")
            : "Chưa trang bị kỹ năng bị động.";

    return {
        activeText,
        passiveText,
    };
}

function calculateCombatStats(profile) {
    return sharedCombat.calculateCombatStats(profile);
}
function calculateCombatPower(profile) {
    return sharedCombat.calculateCombatPower(profile);
}

function getBreakthroughChance(profile) {
    const root = getRootById(profile.rootId);
    const realm = getRealm(profile);
    const pill = getPendingBreakthroughPill(profile);

    const baseChance =
        realm.breakthroughChance ??
        tuTienConfig.breakthrough?.successChance ??
        0.6;

    const rootBonus = root?.breakthroughBonus || 0;
    const pillBonus = isPillValidForCurrentRealm(profile, pill)
        ? pill.bonusChance || 0
        : 0;

    return Math.max(0.03, Math.min(0.95, baseChance + rootBonus + pillBonus));
}

function getCultivateCooldownMs() {
    return 18 * 60 * 1000;
}

function getCooldownText(timeLeft) {
    const totalSeconds = Math.ceil(timeLeft / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes} phút ${seconds} giây`;
}

function canCultivateNow(profile) {
    const now = Date.now();
    const lastCultivateAt = Number(profile.lastCultivateAt || 0);
    const timeLeft = getCultivateCooldownMs() - (now - lastCultivateAt);

    return {
        ok: timeLeft <= 0,
        timeLeft: Math.max(0, timeLeft),
    };
}

function calculateCultivateExp(profile) {
    const root = getRootById(profile.rootId);
    const rootBonus = root ? Number(root.expBonus || 0) : 0;

    const realmIndex = Number(profile.realmIndex || 0);
    const floor = Number(profile.floor || 1);

    const baseExp = 100;
    const floorBonus = floor * 7;
    const randomBonus = Math.floor(Math.random() * 41);

    const realmMultiplier = 1 + realmIndex * 0.22;
    const cappedRealmMultiplier = Math.min(realmMultiplier, 3.2);

    const rawExp = baseExp + floorBonus + randomBonus;
    const expAfterRealm = Math.floor(rawExp * cappedRealmMultiplier);
    const gainedExp = Math.floor(expAfterRealm * (1 + rootBonus));

    return {
        root,
        rootBonus,
        rawExp,
        expAfterRealm,
        realmMultiplier: cappedRealmMultiplier,
        gainedExp,
    };
}

function renderBar(current, max, size = 10) {
    const safeMax = Math.max(1, max);
    const ratio = Math.max(0, Math.min(1, current / safeMax));
    const filled = Math.round(ratio * size);
    const empty = size - filled;

    return `\`${"█".repeat(filled)}${"░".repeat(empty)}\``;
}

function createRootButton(userId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`tutien_rollroot_${userId}`)
            .setLabel("Gacha Linh Căn")
            .setEmoji("🐷")
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
    );
}

function createBreakthroughButton(userId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`tutien_breakthrough_${userId}`)
            .setLabel("Đột Phá")
            .setEmoji("🌩️")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled),
    );
}

function createConfirmBreakthroughButton(userId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`tutien_confirmbreakthrough_${userId}`)
            .setLabel("Xác Nhận Đột Phá")
            .setEmoji("⚡")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled),
    );
}

function createSongTuButtons(ownerId, partnerId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`tutien_songtu_accept_${ownerId}_${partnerId}`)
            .setLabel("Đồng ý song tu")
            .setEmoji("🪷")
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),

        new ButtonBuilder()
            .setCustomId(`tutien_songtu_decline_${ownerId}_${partnerId}`)
            .setLabel("Từ chối")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
    );
}

function getUsableTuTienItemEntries() {
    const shop = getShop();

    return Object.entries(shop).filter(([, item]) => {
        return (
            (item.type === "tu_tien_exp" && item.exp) ||
            item.type === "breakthrough_pill" ||
            item.type === "root_gacha_pill" ||
            item.type === "cultivation_chest"
        );
    });
}

function buildAwakenEmbed(user, profile) {
    return new EmbedBuilder()
        .setColor(0xf1c40f)
        .setAuthor({
            name: user.displayName || user.username,
            iconURL: user.displayAvatarURL(),
        })
        .setTitle("🐷 Một con lợn phàm tục xuất hiện")
        .setDescription(
            `**Đạo hiệu:** ${profile.daoHieu || "Lợn Vô Danh"}\n\n` +
                `Con lợn này vẫn chưa có linh căn.\n` +
                `Muốn bước vào tiên lộ, hãy bấm nút bên dưới để **gacha linh căn**.\n\n` +
                `Có thể ra từ **Tạp Linh Căn** tới **Mamu Thánh Căn**.`,
        )
        .setThumbnail(tuTienConfig.thumbnail)
        .setFooter({
            text: "Một lần gacha định thiên mệnh, lợn mõm hay lợn thánh là do trời.",
        })
        .setTimestamp();
}

function buildProfileEmbed(user, profile) {
    autoAdvanceFloors(profile);

    const maxExp = getMaxExp(profile);
    const root = getRootById(profile.rootId);
    const pill = getPendingBreakthroughPill(profile);

    const rootText = root
        ? `${root.emoji} ${root.name} (+${Math.floor(root.expBonus * 100)}% tu vi)`
        : profile.linhCan || "Chưa thức tỉnh";

    const pillText = isPillValidForCurrentRealm(profile, pill)
        ? `\n🧪 **Đan đột phá:** ${pill.emoji || "🧪"} ${pill.name} (+${Math.floor((pill.bonusChance || 0) * 100)}%)`
        : "";

    const expBar = renderBar(profile.exp || 0, maxExp);
    const combatStats = calculateCombatStats(profile);
    const equippedSkills = formatEquippedSkills(profile);
    const passiveBonus = combatStats.passiveBonus;

    return new EmbedBuilder()
        .setColor(0xf1c40f)
        .setAuthor({
            name: user.displayName || user.username,
            iconURL: user.displayAvatarURL(),
        })
        .setTitle("🪷 Hồ Sơ Tu Tiên Của Lợn")
        .setDescription(
            `**Danh Hiệu:** \`${profile.danhHieu || "Phàm Trần Tục Tử"}\`\n` +
                `**Đạo Hiệu:** \`${profile.daoHieu || "Lợn Vô Danh"}\`\n\n` +
                `📜 **Cảnh Giới:** ${getRealmName(profile)}\n` +
                `🌱 **Linh Căn:** ${rootText}${pillText}\n` +
                `⚔️ **Chiến Lực:** **${formatNumber(combatStats.combatPower)}**\n\n` +
                `📊 **Chỉ Số Chiến Đấu**\n` +
                `🗡️ **ATK:** **${formatNumber(combatStats.atk)}** ` +
                `(${formatNumber(combatStats.baseAtk)} + ${formatPercent(passiveBonus.atkBonus)})\n` +
                `🛡️ **Thủ:** **${formatNumber(combatStats.defense)}** ` +
                `(${formatNumber(combatStats.baseDefense)} + ${formatPercent(passiveBonus.defenseBonus)})\n` +
                `❤️ **Máu:** **${formatNumber(combatStats.hp)}** ` +
                `(${formatNumber(combatStats.baseHp)} + ${formatPercent(passiveBonus.hpBonus)})\n` +
                `💨 **Speed:** **${formatNumber(combatStats.speed)}** ` +
                `(${formatNumber(combatStats.baseSpeed)} + ${formatPercent(passiveBonus.speedBonus)})\n\n` +
                `📚 **Kỹ Năng Đang Trang Bị**\n` +
                `⚔️ **Chủ động:**\n${equippedSkills.activeText}\n\n` +
                `🧘 **Bị động:**\n${equippedSkills.passiveText}\n\n` +
                `✨ **Kinh Nghiệm / Tu Vi**\n` +
                `${expBar}\n` +
                `\`${formatNumber(profile.exp || 0)}/${formatNumber(maxExp)}\``,
        )
        .setThumbnail(tuTienConfig.thumbnail)
        .setFooter({
            text: tuTienConfig.footerText,
        })
        .setTimestamp();
}

class TuTienManager {
    async songTu(interaction) {
        const partner = interaction.options.getUser("user");

        if (!partner) {
            return interaction.reply({
                content: "❌ Bạn phải chọn một đạo hữu để song tu.",
                ephemeral: true,
            });
        }

        if (partner.id === interaction.user.id) {
            return interaction.reply({
                content: "❌ Không thể tự song tu với chính mình.",
                ephemeral: true,
            });
        }

        if (partner.bot) {
            return interaction.reply({
                content: "❌ Không thể song tu với bot.",
                ephemeral: true,
            });
        }

        const ownerProfile = ensureTuTienProfile(interaction.user.id);
        const partnerProfile = ensureTuTienProfile(partner.id);

        if (!ownerProfile.rootId) {
            return interaction.reply({
                content: "❌ Bạn chưa thức tỉnh linh căn nên chưa thể song tu.",
                ephemeral: true,
            });
        }

        if (!partnerProfile.rootId) {
            return interaction.reply({
                content: `❌ ${partner} chưa thức tỉnh linh căn nên chưa thể song tu.`,
                ephemeral: true,
            });
        }

        if (canBreakthroughRealm(ownerProfile)) {
            return interaction.reply({
                content:
                    `❌ Bạn đã đạt **${getRealmName(ownerProfile)}** viên mãn.\n` +
                    `Hãy đột phá trước rồi mới có thể song tu tiếp.`,
                ephemeral: true,
            });
        }

        if (canBreakthroughRealm(partnerProfile)) {
            return interaction.reply({
                content:
                    `❌ ${partner} đã đạt **${getRealmName(partnerProfile)}** viên mãn.\n` +
                    `Người này cần đột phá trước rồi mới có thể song tu tiếp.`,
                ephemeral: true,
            });
        }

        const ownerCooldown = canCultivateNow(ownerProfile);
        const partnerCooldown = canCultivateNow(partnerProfile);

        if (!ownerCooldown.ok) {
            return interaction.reply({
                content:
                    `⏳ Bạn đang trong thời gian hồi tu luyện.\n` +
                    `Quay lại sau **${getCooldownText(ownerCooldown.timeLeft)}**.`,
                ephemeral: true,
            });
        }

        if (!partnerCooldown.ok) {
            return interaction.reply({
                content:
                    `⏳ ${partner} đang trong thời gian hồi tu luyện.\n` +
                    `Còn lại **${getCooldownText(partnerCooldown.timeLeft)}**.`,
                ephemeral: true,
            });
        }

        return interaction.reply({
            content:
                `🪷 **Lời Mời Song Tu**\n\n` +
                `${interaction.user} muốn song tu với ${partner}.\n\n` +
                `📜 ${interaction.user}: **${getRealmName(ownerProfile)}**\n` +
                `📜 ${partner}: **${getRealmName(partnerProfile)}**\n\n` +
                `${partner}, bạn có đồng ý song tu không?`,
            components: [createSongTuButtons(interaction.user.id, partner.id)],
        });
    }

    async performSongTu(interaction, ownerId, partnerId) {
        const now = Date.now();

        const ownerProfile = ensureTuTienProfile(ownerId);
        const partnerProfile = ensureTuTienProfile(partnerId);

        if (!ownerProfile.rootId) {
            return interaction.update({
                content: `❌ <@${ownerId}> chưa thức tỉnh linh căn nên không thể song tu.`,
                components: [createSongTuButtons(ownerId, partnerId, true)],
            });
        }

        if (!partnerProfile.rootId) {
            return interaction.update({
                content: `❌ <@${partnerId}> chưa thức tỉnh linh căn nên không thể song tu.`,
                components: [createSongTuButtons(ownerId, partnerId, true)],
            });
        }

        if (canBreakthroughRealm(ownerProfile)) {
            return interaction.update({
                content:
                    `❌ <@${ownerId}> đã đạt **${getRealmName(ownerProfile)}** viên mãn.\n` +
                    `Cần đột phá trước khi song tu.`,
                components: [createSongTuButtons(ownerId, partnerId, true)],
            });
        }

        if (canBreakthroughRealm(partnerProfile)) {
            return interaction.update({
                content:
                    `❌ <@${partnerId}> đã đạt **${getRealmName(partnerProfile)}** viên mãn.\n` +
                    `Cần đột phá trước khi song tu.`,
                components: [createSongTuButtons(ownerId, partnerId, true)],
            });
        }

        const ownerCooldown = canCultivateNow(ownerProfile);
        const partnerCooldown = canCultivateNow(partnerProfile);

        if (!ownerCooldown.ok) {
            return interaction.update({
                content:
                    `⏳ <@${ownerId}> đã bị cooldown tu luyện.\n` +
                    `Còn lại **${getCooldownText(ownerCooldown.timeLeft)}**.`,
                components: [createSongTuButtons(ownerId, partnerId, true)],
            });
        }

        if (!partnerCooldown.ok) {
            return interaction.update({
                content:
                    `⏳ <@${partnerId}> đã bị cooldown tu luyện.\n` +
                    `Còn lại **${getCooldownText(partnerCooldown.timeLeft)}**.`,
                components: [createSongTuButtons(ownerId, partnerId, true)],
            });
        }

        const ownerExpData = calculateCultivateExp(ownerProfile);
        const partnerExpData = calculateCultivateExp(partnerProfile);

        const totalExpBeforeBonus =
            ownerExpData.gainedExp + partnerExpData.gainedExp;

        const totalSongTuExp = Math.floor(totalExpBeforeBonus * 1.2);
        const eachExp = Math.floor(totalSongTuExp / 2);

        const ownerBeforeRealm = getRealmName(ownerProfile);
        const partnerBeforeRealm = getRealmName(partnerProfile);

        const newOwnerProfile = updateTuTienProfile(ownerId, (data) => {
            if (data.realmIndex === undefined) {
                data.realmIndex = 0;
            }

            if (data.floor === undefined) {
                data.floor = 1;
            }

            if (data.exp === undefined) {
                data.exp = 0;
            }

            data.exp += eachExp;
            data.lastCultivateAt = now;

            autoAdvanceFloors(data);
        });

        const newPartnerProfile = updateTuTienProfile(partnerId, (data) => {
            if (data.realmIndex === undefined) {
                data.realmIndex = 0;
            }

            if (data.floor === undefined) {
                data.floor = 1;
            }

            if (data.exp === undefined) {
                data.exp = 0;
            }

            data.exp += eachExp;
            data.lastCultivateAt = now;

            autoAdvanceFloors(data);
        });
        quest.trackQuestProgress(ownerId, "cultivate", 1);
        quest.trackQuestProgress(partnerId, "cultivate", 1);

        const ownerAfterRealm = getRealmName(newOwnerProfile);
        const partnerAfterRealm = getRealmName(newPartnerProfile);

        const ownerAdvancedText =
            ownerBeforeRealm !== ownerAfterRealm
                ? `\n⬆️ <@${ownerId}> tăng tầng: **${ownerBeforeRealm}** → **${ownerAfterRealm}**`
                : "";

        const partnerAdvancedText =
            partnerBeforeRealm !== partnerAfterRealm
                ? `\n⬆️ <@${partnerId}> tăng tầng: **${partnerBeforeRealm}** → **${partnerAfterRealm}**`
                : "";

        const ownerMaxExp = getMaxExp(newOwnerProfile);
        const partnerMaxExp = getMaxExp(newPartnerProfile);

        const ownerCanBreakthrough = canBreakthroughRealm(newOwnerProfile);
        const partnerCanBreakthrough = canBreakthroughRealm(newPartnerProfile);

        return interaction.update({
            content:
                `🪷 **SONG TU THÀNH CÔNG**\n\n` +
                `<@${ownerId}> và <@${partnerId}> cùng vận chuyển linh khí, tiên khí giao hòa, chuồng heo sáng rực.\n\n` +
                `✨ Tu vi người mời tạo ra: **+${formatNumber(ownerExpData.gainedExp)} exp**\n` +
                `✨ Tu vi người nhận tạo ra: **+${formatNumber(partnerExpData.gainedExp)} exp**\n` +
                `💞 Bonus song tu: **x1.2**\n` +
                `📦 Tổng tu vi sau bonus: **${formatNumber(totalSongTuExp)} exp**\n` +
                `🎁 Mỗi người nhận: **+${formatNumber(eachExp)} exp**\n\n` +
                `🌱 <@${ownerId}> linh căn: **${ownerExpData.root ? `${ownerExpData.root.emoji} ${ownerExpData.root.name}` : "Không rõ"}** ` +
                `(+${Math.floor(ownerExpData.rootBonus * 100)}% tu vi)\n` +
                `🌱 <@${partnerId}> linh căn: **${partnerExpData.root ? `${partnerExpData.root.emoji} ${partnerExpData.root.name}` : "Không rõ"}** ` +
                `(+${Math.floor(partnerExpData.rootBonus * 100)}% tu vi)\n` +
                `${ownerAdvancedText}` +
                `${partnerAdvancedText}\n\n` +
                `📜 <@${ownerId}>: **${getRealmName(newOwnerProfile)}** | ` +
                `Tu vi: **${formatNumber(newOwnerProfile.exp || 0)}/${formatNumber(ownerMaxExp)}**\n` +
                `📜 <@${partnerId}>: **${getRealmName(newPartnerProfile)}** | ` +
                `Tu vi: **${formatNumber(newPartnerProfile.exp || 0)}/${formatNumber(partnerMaxExp)}**\n\n` +
                `${ownerCanBreakthrough || partnerCanBreakthrough ? "🔥 Có đạo hữu đã đạt tầng 10 viên mãn, hãy đột phá cảnh giới." : "🐷 Cả hai đã rơi vào cooldown tu luyện 18 phút."}`,
            components: [createSongTuButtons(ownerId, partnerId, true)],
        });
    }
    async cultivate(interaction) {
        const COOLDOWN_MS = getCultivateCooldownMs();

        const currentProfile = ensureTuTienProfile(interaction.user.id);

        if (!currentProfile.rootId) {
            return interaction.reply({
                content: tuTienConfig.messages.needRoot,
                ephemeral: true,
            });
        }

        const now = Date.now();
        const lastCultivateAt = Number(currentProfile.lastCultivateAt || 0);
        const timeLeft = COOLDOWN_MS - (now - lastCultivateAt);

        if (timeLeft > 0) {
            const totalSeconds = Math.ceil(timeLeft / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;

            return interaction.reply({
                content:
                    `⏳ Con lợn này vừa ngồi hấp thụ linh khí rồi.\n\n` +
                    `Quay lại sau **${minutes} phút ${seconds} giây** để tiếp tục tu luyện.`,
                ephemeral: true,
            });
        }

        if (canBreakthroughRealm(currentProfile)) {
            return interaction.reply({
                content:
                    `${interaction.user} đã tu tới **${getRealmName(currentProfile)}** viên mãn rồi.\n\n` +
                    `Không thể tiếp tục tu luyện thường.\n` +
                    `🌩️ Hãy đột phá cảnh giới trước.`,
                components: [createBreakthroughButton(interaction.user.id)],
            });
        }

        const expData = calculateCultivateExp(currentProfile);
        const root = expData.root;
        const rootBonus = expData.rootBonus;
        const gainedExp = expData.gainedExp;

        const beforeRealm = getRealmName(currentProfile);

        const profile = updateTuTienProfile(interaction.user.id, (data) => {
            if (data.realmIndex === undefined) {
                data.realmIndex = 0;
            }

            if (data.floor === undefined) {
                data.floor = 1;
            }

            if (data.exp === undefined) {
                data.exp = 0;
            }

            data.exp += gainedExp;
            data.lastCultivateAt = now;

            autoAdvanceFloors(data);
        });
        quest.trackQuestProgress(interaction.user.id, "cultivate", 1);
        let secretRealm = null;

        try {
            secretRealm = await bicanh.tryTrigger(interaction, "cultivate");
        } catch (error) {
            console.error("[BiCanh Trigger - Cultivate]", error);
        }
        const afterRealm = getRealmName(profile);
        const maxExp = getMaxExp(profile);
        const canBreakthrough = canBreakthroughRealm(profile);

        const advancedText =
            beforeRealm !== afterRealm
                ? `\n⬆️ Cắn cám ngộ đạo, tăng tầng: **${beforeRealm}** → **${afterRealm}**\n`
                : "";
        const secretRealmText = secretRealm
            ? `\n\n🌌 **CƠ DUYÊN XUẤT HIỆN!**\n` +
              `Một Bí Cảnh Hữu Duyên đã mở tại <#${secretRealm.channelId}>.`
            : "";
        return interaction.reply({
            content:
                `🧘 **Tu Luyện Thành Công**\n\n` +
                `${interaction.user} chui vào chuồng heo, vận chuyển linh khí, mõm phát hào quang.\n\n` +
                `✨ Tu vi nhận được: **+${formatNumber(gainedExp)} exp**\n` +
                `📜 Bonus cảnh giới: **x${expData.realmMultiplier.toFixed(2)}**\n` +
                `🌱 Linh căn: **${root ? `${root.emoji} ${root.name}` : "Không rõ"}**\n` +
                `📈 Bonus linh căn: **+${Math.floor(rootBonus * 100)}% tu vi**\n` +
                `${advancedText}` +
                `📜 Cảnh giới: **${getRealmName(profile)}**\n` +
                `📊 Tu vi: **${formatNumber(profile.exp || 0)}/${formatNumber(maxExp)}**\n\n` +
                `${
                    canBreakthrough
                        ? "🔥 Đã đạt tầng 10 viên mãn, hãy đột phá cảnh giới."
                        : "🐷 18 phút nữa có thể tiếp tục tu luyện."
                }` +
                `${secretRealmText}`,
            components: canBreakthrough
                ? [createBreakthroughButton(interaction.user.id)]
                : [],
        });
    }
    async profile(interaction) {
        const profile = updateTuTienProfile(interaction.user.id, (data) => {
            if (data.exp === undefined) {
                data.exp = 0;
            }

            if (data.realmIndex === undefined) {
                data.realmIndex = 0;
            }

            if (data.floor === undefined) {
                data.floor = 1;
            }

            if (!data.danhHieu) {
                data.danhHieu = "Phàm Trần Tục Tử";
            }

            if (!data.daoHieu) {
                data.daoHieu = "Lợn Vô Danh";
            }

            autoAdvanceFloors(data);
        });

        if (!profile.rootId) {
            return interaction.reply({
                embeds: [buildAwakenEmbed(interaction.user, profile)],
                components: [createRootButton(interaction.user.id)],
            });
        }

        const canBreakthrough = canBreakthroughRealm(profile);

        return interaction.reply({
            embeds: [buildProfileEmbed(interaction.user, profile)],
            components: canBreakthrough
                ? [createBreakthroughButton(interaction.user.id)]
                : [],
        });
    }

    async handleButton(interaction) {
        if (interaction.customId.startsWith("tutien_songtu_accept_")) {
            const raw = interaction.customId.replace(
                "tutien_songtu_accept_",
                "",
            );
            const [ownerId, partnerId] = raw.split("_");

            if (interaction.user.id !== partnerId) {
                return interaction.reply({
                    content:
                        "❌ Chỉ người được mời song tu mới có thể xác nhận.",
                    ephemeral: true,
                });
            }

            return this.performSongTu(interaction, ownerId, partnerId);
        }

        if (interaction.customId.startsWith("tutien_songtu_decline_")) {
            const raw = interaction.customId.replace(
                "tutien_songtu_decline_",
                "",
            );
            const [ownerId, partnerId] = raw.split("_");

            if (interaction.user.id !== partnerId) {
                return interaction.reply({
                    content:
                        "❌ Chỉ người được mời song tu mới có thể từ chối.",
                    ephemeral: true,
                });
            }

            return interaction.update({
                content: `❌ <@${partnerId}> đã từ chối song tu với <@${ownerId}>.`,
                components: [createSongTuButtons(ownerId, partnerId, true)],
            });
        }
        if (interaction.customId.startsWith("tutien_confirmbreakthrough_")) {
            const userId = interaction.customId.replace(
                "tutien_confirmbreakthrough_",
                "",
            );

            if (interaction.user.id !== userId) {
                return interaction.reply({
                    content:
                        "❌ Đây không phải lợn của bạn, đừng phá cảnh giới người khác.",
                    ephemeral: true,
                });
            }

            return this.performBreakthrough(interaction);
        }

        if (interaction.customId.startsWith("tutien_breakthrough_")) {
            const userId = interaction.customId.replace(
                "tutien_breakthrough_",
                "",
            );

            if (interaction.user.id !== userId) {
                return interaction.reply({
                    content:
                        "❌ Đây không phải lợn của bạn, đừng phá cảnh giới người khác.",
                    ephemeral: true,
                });
            }

            return this.breakthrough(interaction);
        }

        if (!interaction.customId.startsWith("tutien_rollroot_")) {
            return undefined;
        }

        const userId = interaction.customId.replace("tutien_rollroot_", "");

        if (interaction.user.id !== userId) {
            return interaction.reply({
                content:
                    "❌ Đây không phải lợn của bạn, đừng sờ linh căn người khác.",
                ephemeral: true,
            });
        }

        const currentProfile = ensureTuTienProfile(interaction.user.id);

        if (currentProfile.rootId) {
            return interaction.reply({
                content: tuTienConfig.messages.alreadyRoot,
                ephemeral: true,
            });
        }

        const root = pickWeightedRoot();

        updateTuTienProfile(interaction.user.id, (data) => {
            data.rootId = root.id;
            data.linhCan = root.name;
            data.rootDescription = root.description;
        });

        const embed = new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle("🌱 Thức Tỉnh Linh Căn")
            .setDescription(
                `${interaction.user} đặt tay lên đầu lợn, thiên địa chấn động.\n\n` +
                    `🐷 Con lợn mở mắt, mõm phát sáng.\n\n` +
                    `Linh căn thức tỉnh: ${root.emoji} **${root.name}**\n` +
                    `Bonus tu luyện: **+${Math.floor(root.expBonus * 100)}% tu vi**\n\n` +
                    `${root.description}`,
            )
            .setThumbnail(tuTienConfig.thumbnail)
            .setFooter({
                text: "Từ nay con lợn này chính thức bước lên tiên lộ.",
            })
            .setTimestamp();

        return interaction.update({
            embeds: [embed],
            components: [createRootButton(interaction.user.id, true)],
        });
    }

    async setDaoHieu(interaction) {
        const ten = interaction.options.getString("ten")?.trim();

        if (!ten) {
            return interaction.reply({
                content: "❌ Đạo hiệu không được để trống",
                ephemeral: true,
            });
        }

        if (!containsPigKeyword(ten)) {
            return interaction.reply({
                content:
                    "❌ Đạo hiệu bắt buộc phải có một trong các chữ: **Lợn, Trư, Pig, Heo**",
                ephemeral: true,
            });
        }

        if (ten.length > 40) {
            return interaction.reply({
                content: "❌ Đạo hiệu dài vừa thôi anh bạn, tối đa 40 ký tự",
                ephemeral: true,
            });
        }

        const profile = updateTuTienProfile(interaction.user.id, (data) => {
            data.daoHieu = ten;
        });

        return interaction.reply({
            content:
                `✅ Đã đổi đạo hiệu thành: **${profile.daoHieu}**\n` +
                `Đúng chất tu tiên lợn rồi đấy.`,
        });
    }

    async autocompleteUseItem(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const inventory = getInventory(interaction.user.id);

        const choices = getUsableTuTienItemEntries()
            .filter(([itemId, item]) => {
                const amount = inventory.shopItems[itemId] || 0;

                if (amount <= 0) {
                    return false;
                }

                return (
                    itemId.toLowerCase().includes(focusedValue) ||
                    item.name.toLowerCase().includes(focusedValue)
                );
            })
            .slice(0, 25)
            .map(([itemId, item]) => {
                const amount = inventory.shopItems[itemId] || 0;

                let detail = `+${item.exp} exp`;

                if (item.type === "breakthrough_pill") {
                    detail = `+${Math.floor((item.bonusChance || 0) * 100)}% đột phá`;
                }

                if (item.type === "root_gacha_pill") {
                    detail = `gacha lại linh căn`;
                }

                if (item.type === "cultivation_chest") {
                    detail = `mở rương tu luyện`;
                }

                return {
                    name: `${item.emoji || "🎁"} ${item.name} x${amount} | ${detail}`,
                    value: itemId,
                };
            });

        return interaction.respond(choices);
    }
    async useItem(interaction) {
        const itemId = interaction.options.getString("vatpham");
        const quantity = interaction.options.getInteger("soluong") || 1;
        const shop = getShop();
        const item = shop[itemId];

        if (!Number.isInteger(quantity) || quantity <= 0) {
            return interaction.reply({
                content: "❌ Số lượng phải lớn hơn 0.",
                ephemeral: true,
            });
        }

        if (
            !item ||
            ![
                "tu_tien_exp",
                "breakthrough_pill",
                "root_gacha_pill",
                "cultivation_chest",
            ].includes(item.type)
        ) {
            return interaction.reply({
                content:
                    "❌ Vật phẩm này không dùng được trong hệ thống tu tiên",
                ephemeral: true,
            });
        }

        if (
            ["breakthrough_pill", "root_gacha_pill"].includes(item.type) &&
            quantity > 1
        ) {
            return interaction.reply({
                content: "❌ Vật phẩm này chỉ có thể dùng từng cái một.",
                ephemeral: true,
            });
        }

        if (item.type === "cultivation_chest") {
            const consumeResult = consumeShopItem(
                interaction.user.id,
                itemId,
                quantity,
            );

            if (!consumeResult.success) {
                return interaction.reply({
                    content: `❌ ${consumeResult.message}`,
                    ephemeral: true,
                });
            }

            const drops = chestConfig.cultivationChest?.drops || [];

            if (drops.length <= 0) {
                return interaction.reply({
                    content: "❌ Rương này chưa được cấu hình phần thưởng.",
                    ephemeral: true,
                });
            }

            const rewardMap = new Map();

            for (let i = 0; i < quantity; i++) {
                const drop = pickWeightedChestDrop(drops);
                const rewardItem = shop[drop.itemId];

                if (!rewardItem) {
                    continue;
                }

                addShopItem(interaction.user.id, drop.itemId, 1);

                const oldAmount = rewardMap.get(drop.itemId)?.amount || 0;

                rewardMap.set(drop.itemId, {
                    itemId: drop.itemId,
                    item: rewardItem,
                    amount: oldAmount + 1,
                });
            }

            const rewardLines = Array.from(rewardMap.values()).map((reward) => {
                return `- ${reward.item.emoji || "🎁"} **${reward.item.name}** x${reward.amount}`;
            });

            return interaction.reply({
                content:
                    `${interaction.user} đã mở **${item.emoji || "🎁"} ${item.name}** x${quantity}\n\n` +
                    `🎉 **Nhận được:**\n` +
                    `${rewardLines.length > 0 ? rewardLines.join("\n") : "Không nhận được gì."}`,
            });
        }

        const currentProfile = ensureTuTienProfile(interaction.user.id);

        if (!currentProfile.rootId) {
            return interaction.reply({
                content: tuTienConfig.messages.needRoot,
                ephemeral: true,
            });
        }

        if (item.type === "root_gacha_pill") {
            const consumeResult = consumeShopItem(
                interaction.user.id,
                itemId,
                1,
            );

            if (!consumeResult.success) {
                return interaction.reply({
                    content: `❌ ${consumeResult.message}`,
                    ephemeral: true,
                });
            }

            const currentUseCount = currentProfile.rootGachaPillUses || 0;
            const nextUseCount = currentUseCount + 1;

            const oldRoot = getRootById(currentProfile.rootId);

            const beforeChanceList = getRootChanceList(currentUseCount);
            const afterChanceList = getRootChanceList(nextUseCount);

            const reducedRoots = afterChanceList
                .map((afterRoot) => {
                    const beforeRoot = beforeChanceList.find((root) => {
                        return root.id === afterRoot.id;
                    });

                    const beforeChance = beforeRoot
                        ? Number(beforeRoot.finalChance || 0)
                        : 0;

                    const afterChance = Number(afterRoot.finalChance || 0);
                    const reducedAmount = beforeChance - afterChance;

                    if (reducedAmount <= 0) {
                        return null;
                    }

                    return {
                        ...afterRoot,
                        beforeChance,
                        afterChance,
                        reducedAmount,
                    };
                })
                .filter(Boolean);

            const reduceText =
                reducedRoots.length > 0
                    ? reducedRoots
                          .map((root) => {
                              return (
                                  `${root.emoji || "🌱"} **${root.name}** bị giảm tỉ lệ thêm **${root.reducedAmount.toFixed(2)}%**.\n` +
                                  `📉 Tỉ lệ ${root.name} hiện tại: **${root.afterChance.toFixed(2)}%**`
                              );
                          })
                          .join("\n")
                    : "✨ Tỉ lệ linh căn thấp đã giảm hết mức, không còn linh căn nào bị giảm thêm.";

            const newRoot = pickWeightedRoot(nextUseCount);

            const profile = updateTuTienProfile(interaction.user.id, (data) => {
                data.rootGachaPillUses = nextUseCount;
                data.rootId = newRoot.id;
                data.linhCan = newRoot.name;
                data.rootDescription = newRoot.description;
            });

            return interaction.reply({
                content:
                    `${interaction.user} đã dùng **${item.emoji || "🌱"} ${item.name}**\n\n` +
                    `${reduceText}\n` +
                    `🧪 Số lần đã dùng đan linh căn: **${nextUseCount}**\n\n` +
                    `🌱 Linh căn cũ: **${oldRoot ? `${oldRoot.emoji} ${oldRoot.name}` : "Không rõ"}**\n` +
                    `✨ Linh căn mới: **${newRoot.emoji} ${newRoot.name}**\n` +
                    `📈 Bonus tu luyện: **+${Math.floor((newRoot.expBonus || 0) * 100)}% tu vi**\n\n` +
                    `${newRoot.description}`,
            });
        }

        if (item.type === "breakthrough_pill") {
            if (!canBreakthroughRealm(currentProfile)) {
                return interaction.reply({
                    content:
                        `❌ Chưa thể dùng đan đột phá\n\n` +
                        `Đan này chỉ dùng khi đã đạt **Tầng 10** và tu vi đầy.\n` +
                        `📜 Hiện tại: **${getRealmName(currentProfile)}**`,
                    ephemeral: true,
                });
            }

            if (item.fromRealmIndex !== (currentProfile.realmIndex || 0)) {
                const realms = getRealms();
                const fromRealm =
                    realms[item.fromRealmIndex]?.name || "Không rõ";
                const toRealm = realms[item.toRealmIndex]?.name || "Không rõ";

                return interaction.reply({
                    content:
                        `❌ Sai loại đan\n\n` +
                        `**${item.name}** chỉ dùng để đột phá:\n` +
                        `📜 **${fromRealm}** → **${toRealm}**\n\n` +
                        `Hiện tại bạn đang ở: **${getRealmName(currentProfile)}**`,
                    ephemeral: true,
                });
            }

            const consumeResult = consumeShopItem(
                interaction.user.id,
                itemId,
                1,
            );

            if (!consumeResult.success) {
                return interaction.reply({
                    content: `❌ ${consumeResult.message}`,
                    ephemeral: true,
                });
            }

            const profile = updateTuTienProfile(interaction.user.id, (data) => {
                data.breakthroughPill = {
                    itemId,
                    name: item.name,
                    emoji: item.emoji || "🧪",
                    bonusChance: item.bonusChance || 0,
                    usedAt: Date.now(),
                };
            });

            const successChance = getBreakthroughChance(profile);

            return interaction.reply({
                content:
                    `${interaction.user} đã dùng **${item.emoji || "🧪"} ${item.name}**\n\n` +
                    `🌩️ Tỉ lệ đột phá được tăng thêm: **+${Math.floor((item.bonusChance || 0) * 100)}%**\n` +
                    `🎲 Tỉ lệ thành công hiện tại: **${Math.floor(successChance * 100)}%**\n\n` +
                    `Dùng **/dotpha** để chuẩn bị đột phá.`,
            });
        }

        if (canBreakthroughRealm(currentProfile)) {
            return interaction.reply({
                content:
                    `${interaction.user} đã tu tới **${getRealmName(currentProfile)}** viên mãn rồi.\n\n` +
                    `Không thể dùng thêm cám lợn để tăng tu vi.\n` +
                    `🌩️ Hãy đột phá trước đã.`,
                components: [createBreakthroughButton(interaction.user.id)],
            });
        }

        const consumeResult = consumeShopItem(
            interaction.user.id,
            itemId,
            quantity,
        );

        if (!consumeResult.success) {
            return interaction.reply({
                content: `❌ ${consumeResult.message}`,
                ephemeral: true,
            });
        }

        const beforeRealm = getRealmName(currentProfile);
        const totalExp = Number(item.exp || 0) * quantity;

        const profile = updateTuTienProfile(interaction.user.id, (data) => {
            if (data.realmIndex === undefined) {
                data.realmIndex = 0;
            }

            if (data.floor === undefined) {
                data.floor = 1;
            }

            data.exp = Number(data.exp || 0) + totalExp;

            autoAdvanceFloors(data);
        });
        quest.trackQuestProgress(interaction.user.id, "cultivate", 1);
        const afterRealm = getRealmName(profile);
        const maxExp = getMaxExp(profile);
        const canBreakthrough = canBreakthroughRealm(profile);

        const advancedText =
            beforeRealm !== afterRealm
                ? `\n⬆️ Tự động tăng tầng: **${beforeRealm}** → **${afterRealm}**\n`
                : "";

        return interaction.reply({
            content:
                `${interaction.user} đã dùng **${item.emoji || "🎁"} ${item.name}** x${quantity}\n\n` +
                `✨ Nhận: **+${formatNumber(totalExp)} exp**\n` +
                `${advancedText}` +
                `📜 Cảnh giới: **${getRealmName(profile)}**\n` +
                `📈 Kinh nghiệm: **${formatNumber(profile.exp)}/${formatNumber(maxExp)}**\n\n` +
                `${canBreakthrough ? "🔥 Đã đạt tầng 10 viên mãn, hãy bấm nút bên dưới để đột phá cảnh giới." : "🐷 Lợn đang hấp thụ cám tu tiên."}`,
            components: canBreakthrough
                ? [createBreakthroughButton(interaction.user.id)]
                : [],
        });
    }
    async breakthrough(interaction) {
        const currentProfile = ensureTuTienProfile(interaction.user.id);

        if (!currentProfile.rootId) {
            return interaction.reply({
                content: tuTienConfig.messages.needRoot,
                ephemeral: true,
            });
        }

        const maxExp = getMaxExp(currentProfile);
        const currentExp = currentProfile.exp || 0;

        if (!canBreakthroughRealm(currentProfile)) {
            return interaction.reply({
                content:
                    `❌ Chưa thể đột phá cảnh giới\n\n` +
                    `Muốn đột phá phải đạt **Tầng 10** và tu vi đầy.\n\n` +
                    `📜 Hiện tại: **${getRealmName(currentProfile)}**\n` +
                    `✨ Tu vi: **${formatNumber(currentExp)}/${formatNumber(maxExp)}**`,
                ephemeral: true,
            });
        }

        const root = getRootById(currentProfile.rootId);
        const successChance = getBreakthroughChance(currentProfile);
        const pill = getPendingBreakthroughPill(currentProfile);

        const pillText = isPillValidForCurrentRealm(currentProfile, pill)
            ? `\n🧪 Đan dược: **${pill.emoji || "🧪"} ${pill.name}** (+${Math.floor((pill.bonusChance || 0) * 100)}%)`
            : "";

        return interaction.reply({
            content:
                `🌩️ **Chuẩn Bị Đột Phá Cảnh Giới**\n\n` +
                `${interaction.user} đang đứng trước cửa ải sinh tử.\n` +
                `Một bước thành tiên, một bước rớt về tầng 9.\n\n` +
                `📜 Cảnh giới hiện tại: **${getRealmName(currentProfile)}**\n` +
                `🌱 Linh căn: **${root.emoji} ${root.name}**\n` +
                `✨ Tu vi: **${formatNumber(currentExp)}/${formatNumber(maxExp)}**` +
                `${pillText}\n` +
                `🎲 Tỉ lệ thành công: **${Math.floor(successChance * 100)}%**\n\n` +
                `Bấm nút bên dưới để xác nhận đột phá.`,
            components: [createConfirmBreakthroughButton(interaction.user.id)],
        });
    }

    async performBreakthrough(interaction) {
        const currentProfile = ensureTuTienProfile(interaction.user.id);

        if (!currentProfile.rootId) {
            return interaction.reply({
                content: tuTienConfig.messages.needRoot,
                ephemeral: true,
            });
        }

        const maxExp = getMaxExp(currentProfile);
        const currentExp = currentProfile.exp || 0;

        if (!canBreakthroughRealm(currentProfile)) {
            return interaction.reply({
                content:
                    `❌ Không thể đột phá nữa\n\n` +
                    `Có thể bạn đã đột phá rồi, hoặc tu vi chưa đủ.\n\n` +
                    `📜 Hiện tại: **${getRealmName(currentProfile)}**\n` +
                    `✨ Tu vi: **${formatNumber(currentExp)}/${formatNumber(maxExp)}**`,
                ephemeral: true,
            });
        }

        const root = getRootById(currentProfile.rootId);
        const successChance = getBreakthroughChance(currentProfile);
        const success = Math.random() < successChance;
        const oldRealmName = getRealmName(currentProfile);
        const pill = getPendingBreakthroughPill(currentProfile);
        const pillText = isPillValidForCurrentRealm(currentProfile, pill)
            ? `\n🧪 Đan dược đã dùng: **${pill.emoji || "🧪"} ${pill.name}**`
            : "";

        if (success) {
            const profile = updateTuTienProfile(interaction.user.id, (data) => {
                const realms = getRealms();

                const oldMaxExp = getMaxExp(data);
                const leftoverExp = Math.max(0, (data.exp || 0) - oldMaxExp);

                delete data.breakthroughPill;

                if ((data.realmIndex || 0) < realms.length - 1) {
                    data.realmIndex = (data.realmIndex || 0) + 1;
                    data.floor = 1;
                    data.exp = leftoverExp;
                    autoAdvanceFloors(data);
                } else {
                    data.floor = 10;
                    data.exp = leftoverExp;
                }
            });

            return interaction.update({
                content:
                    `🌩️ **ĐỘT PHÁ THÀNH CÔNG!**\n\n` +
                    `${interaction.user} vận chuyển linh khí trong chuồng heo, mõm phát kim quang.\n` +
                    `Thiên đạo rung chuyển, lợn chính thức tiến vào cảnh giới mới.\n\n` +
                    `📜 Trước: **${oldRealmName}**\n` +
                    `🔥 Sau: **${getRealmName(profile)}**\n` +
                    `🌱 Linh căn: **${root.emoji} ${root.name}**` +
                    `${pillText}\n` +
                    `🎲 Tỉ lệ thành công: **${Math.floor(successChance * 100)}%**`,
                components: [
                    createConfirmBreakthroughButton(interaction.user.id, true),
                ],
            });
        }

        const profile = updateTuTienProfile(interaction.user.id, (data) => {
            const keepRate = tuTienConfig.breakthrough?.failExpKeepRate ?? 0;

            delete data.breakthroughPill;

            data.exp = Math.floor((data.exp || 0) * keepRate);
            data.floor = 9;
        });

        return interaction.update({
            content:
                `💥 **ĐỘT PHÁ THẤT BẠI!**\n\n` +
                `${interaction.user} cưỡng ép vận công, linh khí phản phệ, chuồng heo nổ cái đùng.\n` +
                `Con lợn tẩu hỏa nhập ma, bị giáng xuống tầng 9.\n\n` +
                `📜 Trước: **${oldRealmName}**\n` +
                `💀 Sau: **${getRealmName(profile)}**\n` +
                `✨ Tu vi còn lại: **${formatNumber(profile.exp || 0)}**` +
                `${pillText}\n` +
                `🎲 Tỉ lệ thành công hụt: **${Math.floor(successChance * 100)}%**`,
            components: [
                createConfirmBreakthroughButton(interaction.user.id, true),
            ],
        });
    }
}

module.exports = new TuTienManager();
