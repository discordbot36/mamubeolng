const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");

const { getAllUsers, getSystemValue, setSystemValue } = require("./database");

const tuTienConfig = require("./config/tutien");
const skillConfig = require("./config/kynang");
const leaderboardConfig = require("./config/leaderboard");
const sharedCombat = require("./utils/combat");
function isHiddenLeaderboardUser(userId) {
    const excludedUserIds = Array.isArray(leaderboardConfig.excludedUserIds)
        ? leaderboardConfig.excludedUserIds.map(String)
        : [];

    return excludedUserIds.includes(String(userId));
}

const STATE_KEY = "combatPowerLeaderboard";

const LEADERBOARD_TYPES = {
    COMBAT: "combat",
    DOG: "dog",
    MONEY: "money",
    TOWER: "tower",
    NOITU: "noitu",
};

let isUpdating = false;
let intervalId = null;
const usernameCache = new Map();
const USERNAME_CACHE_TTL_MS = 60 * 60 * 1000;

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

function createLeaderboardButtons(activeType = LEADERBOARD_TYPES.COMBAT) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("leaderboard_combat")
            .setLabel("Chiến lực")
            .setEmoji("⚔️")
            .setStyle(
                activeType === LEADERBOARD_TYPES.COMBAT
                    ? ButtonStyle.Success
                    : ButtonStyle.Secondary,
            ),

        new ButtonBuilder()
            .setCustomId("leaderboard_dog")
            .setLabel("Bảng xếp hạng chó")
            .setEmoji("🐕")
            .setStyle(
                activeType === LEADERBOARD_TYPES.DOG
                    ? ButtonStyle.Success
                    : ButtonStyle.Secondary,
            ),

        new ButtonBuilder()
            .setCustomId("leaderboard_money")
            .setLabel("Đại gia")
            .setEmoji("💰")
            .setStyle(
                activeType === LEADERBOARD_TYPES.MONEY
                    ? ButtonStyle.Success
                    : ButtonStyle.Secondary,
            ),

        new ButtonBuilder()
            .setCustomId("leaderboard_tower")
            .setLabel("Leo tháp")
            .setEmoji("🗼")
            .setStyle(
                activeType === LEADERBOARD_TYPES.TOWER
                    ? ButtonStyle.Success
                    : ButtonStyle.Secondary,
            ),

        new ButtonBuilder()
            .setCustomId("leaderboard_noitu")
            .setLabel("Nối từ")
            .setEmoji("📚")
            .setStyle(
                activeType === LEADERBOARD_TYPES.NOITU
                    ? ButtonStyle.Success
                    : ButtonStyle.Secondary,
            ),
    );
}

function getInventoryDogs(user) {
    const items = Array.isArray(user.inventoryItems) ? user.inventoryItems : [];

    return items.filter((item) => item.type === "dog");
}

function getBestInventoryDog(user) {
    const dogs = getInventoryDogs(user);

    if (dogs.length <= 0) {
        return null;
    }

    return dogs.reduce((best, dog) => {
        if (!best) {
            return dog;
        }

        return Number(dog.value || 0) > Number(best.value || 0) ? dog : best;
    }, null);
}

function calculateBestDogData(user) {
    const statsBestValue = Number(user.dogStats?.bestDogValue || 0);

    const statsBestDog = {
        name: user.dogStats?.bestDogName || null,
        value: statsBestValue,
        weightKg: Number(user.dogStats?.bestDogWeightKg || 0),
    };

    const inventoryBestDog = getBestInventoryDog(user);
    const inventoryBestValue = Number(inventoryBestDog?.value || 0);

    if (inventoryBestValue > statsBestValue) {
        return {
            name: inventoryBestDog.name || "Chó không tên",
            value: inventoryBestValue,
            weightKg: Number(inventoryBestDog.weightKg || 0),
        };
    }

    return statsBestDog;
}

function calculateDogCount(user) {
    const statsCount = Number(user.dogStats?.totalCaught || 0);

    if (statsCount > 0) {
        return statsCount;
    }

    return getInventoryDogs(user).length;
}

async function buildDogRanking(client) {
    const limit = Number(leaderboardConfig.limit || 10);
    const users = getAllUsers();

    const ranked = users
        .filter((user) => !isHiddenLeaderboardUser(user.userId))
        .map((user) => {
            const bestDog = calculateBestDogData(user);
            const dogCount = calculateDogCount(user);

            if (!bestDog || Number(bestDog.value || 0) <= 0) {
                return null;
            }

            return {
                userId: user.userId,
                bestDogName: bestDog.name || "Chó không tên",
                bestDogValue: Number(bestDog.value || 0),
                bestDogWeightKg: Number(bestDog.weightKg || 0),
                dogCount,
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.bestDogValue - a.bestDogValue)
        .slice(0, limit);

    for (const item of ranked) {
        item.username = await getUsername(client, item.userId);
    }

    return ranked;
}

async function buildMoneyRanking(client) {
    const limit = Number(leaderboardConfig.limit || 10);
    const users = getAllUsers();

    const ranked = users
        .filter((user) => !isHiddenLeaderboardUser(user.userId))
        .map((user) => {
            return {
                userId: user.userId,
                money: Number(user.money || 0),
            };
        })
        .filter((user) => user.money > 0)
        .sort((a, b) => b.money - a.money)
        .slice(0, limit);

    for (const item of ranked) {
        item.username = await getUsername(client, item.userId);
    }

    return ranked;
}

async function buildTowerRanking(client) {
    const limit = Number(leaderboardConfig.limit || 10);
    const users = getAllUsers();

    const ranked = users
        .filter((user) => !isHiddenLeaderboardUser(user.userId))
        .map((user) => {
            const tower = user.tower || {};
            const profile = user.tuTienProfile || null;

            const highestFloor = Math.max(
                Number(tower.highestFloor || 0),
                Number(tower.floor || 0),
            );

            if (highestFloor <= 0) {
                return null;
            }

            return {
                userId: user.userId,
                tower,
                profile,
                highestFloor,
                currentFloor: Number(tower.floor || 0),
                totalChests: Number(tower.totalChests || 0),
                totalEarned: Number(tower.totalEarned || 0),
                combatPower:
                    profile && profile.rootId
                        ? calculateCombatPower(profile)
                        : 0,
            };
        })
        .filter(Boolean)
        .sort((a, b) => {
            if (b.highestFloor !== a.highestFloor) {
                return b.highestFloor - a.highestFloor;
            }

            return b.combatPower - a.combatPower;
        })
        .slice(0, limit);

    for (const item of ranked) {
        item.username = await getUsername(client, item.userId);
    }

    return ranked;
}

async function buildNoiTuRanking(client) {
    const limit = Number(leaderboardConfig.limit || 10);
    const users = getAllUsers();

    const ranked = users
        .filter((user) => !isHiddenLeaderboardUser(user.userId))
        .map((user) => {
            const stats = user.noituStats || {};

            const correct = Number(stats.correct || 0);
            const wins = Number(stats.wins || 0);
            const botStuckWins = Number(stats.botStuckWins || 0);
            const forfeitWins = Number(stats.forfeitWins || 0);

            if (
                correct <= 0 &&
                wins <= 0 &&
                botStuckWins <= 0 &&
                forfeitWins <= 0
            ) {
                return null;
            }

            return {
                userId: user.userId,
                correct,
                wins,
                botStuckWins,
                forfeitWins,
            };
        })
        .filter(Boolean)
        .sort((a, b) => {
            if (b.correct !== a.correct) {
                return b.correct - a.correct;
            }

            if (b.wins !== a.wins) {
                return b.wins - a.wins;
            }

            return b.botStuckWins - a.botStuckWins;
        })
        .slice(0, limit);

    for (const item of ranked) {
        item.username = await getUsername(client, item.userId);
    }

    return ranked;
}

function buildDogEmbed(ranked) {
    const embed = new EmbedBuilder()
        .setColor(0x8b4513)
        .setTitle("🐕 BẢNG XẾP HẠNG CHÓ")
        .setFooter({
            text: `Xếp hạng theo con chó giá trị nhất từng bắt được • Top ${ranked.length}`,
        })
        .setTimestamp();

    if (ranked.length <= 0) {
        embed.setDescription("Chưa có ai bắt được chó để xếp hạng.");
        return embed;
    }

    const lines = ranked.map((item, index) => {
        const weightText =
            item.bestDogWeightKg > 0
                ? ` | ⚖️ **${item.bestDogWeightKg}kg**`
                : "";

        return (
            `${getRankIcon(index)} **${item.username}**\n` +
            `> 🐕 Chó đắt nhất: **${item.bestDogName}**${weightText}\n` +
            `> 💰 Giá trị: **${formatNumber(item.bestDogValue)}**\n` +
            `> 📦 Tổng chó từng bắt: **${formatNumber(item.dogCount)}**`
        );
    });

    embed.setDescription(lines.join("\n\n"));

    return embed;
}

function buildMoneyEmbed(ranked) {
    const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("💰 BẢNG XẾP HẠNG ĐẠI GIA")
        .setFooter({
            text: `Xếp hạng theo số tiền hiện có • Top ${ranked.length}`,
        })
        .setTimestamp();

    if (ranked.length <= 0) {
        embed.setDescription("Chưa có ai có tiền để xếp hạng.");
        return embed;
    }

    const lines = ranked.map((item, index) => {
        return (
            `${getRankIcon(index)} **${item.username}**\n` +
            `> 💰 Tài sản: **${formatNumber(item.money)}**`
        );
    });

    embed.setDescription(lines.join("\n\n"));

    return embed;
}

function buildTowerEmbed(ranked) {
    const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle("🗼 BẢNG XẾP HẠNG LEO THÁP")
        .setFooter({
            text: `Xếp hạng theo tầng cao nhất đã vượt • Top ${ranked.length}`,
        })
        .setTimestamp();

    if (ranked.length <= 0) {
        embed.setDescription("Chưa có ai leo tháp để xếp hạng.");
        return embed;
    }

    const lines = ranked.map((item, index) => {
        const profile = item.profile;
        const daoHieu =
            profile?.daoHieu ||
            profile?.daohieu ||
            profile?.daoName ||
            "Lợn Vô Danh";

        const realmText = profile ? getRealmName(profile) : "Chưa tu tiên";

        return (
            `${getRankIcon(index)}  『 **${daoHieu}** 』\n` +
            `> 👤 Chủ nhân: **${item.username}**\n` +
            `> 🗼 Tầng cao nhất: **${formatNumber(item.highestFloor)}**\n` +
            `> 📍 Tầng hiện tại: **${formatNumber(item.currentFloor)}**\n` +
            `> 📜 Cảnh giới: **${realmText}**\n` +
            `> ⚔️ Chiến lực: **${formatNumber(item.combatPower)}**\n` +
            `> 🎁 Rương đã nhận: **${formatNumber(item.totalChests)}**\n` +
            `> 💰 Tổng tiền từ tháp: **${formatNumber(item.totalEarned)}**`
        );
    });

    embed.setDescription(lines.join("\n\n"));

    return embed;
}

function buildNoiTuEmbed(ranked) {
    const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle("📚 BẢNG XẾP HẠNG NỐI TỪ")
        .setFooter({
            text: `Xếp hạng theo số câu nối đúng • Top ${ranked.length}`,
        })
        .setTimestamp();

    if (ranked.length <= 0) {
        embed.setDescription("Chưa có dữ liệu nối từ để xếp hạng.");
        return embed;
    }

    const lines = ranked.map((item, index) => {
        return (
            `${getRankIcon(index)} **${item.username}**\n` +
            `> ✅ Nối đúng: **${formatNumber(item.correct)}** câu\n` +
            `> 🏆 Thắng nối từ: **${formatNumber(item.wins)}** trận\n` +
            `> 🤖 Làm bot bí từ: **${formatNumber(item.botStuckWins)}** lần\n` +
            `> 🏳️ Thắng do chịu thua: **${formatNumber(item.forfeitWins)}** lần`
        );
    });

    embed.setDescription(lines.join("\n\n"));

    return embed;
}

async function buildLeaderboardByType(client, type) {
    if (type === LEADERBOARD_TYPES.DOG) {
        const ranked = await buildDogRanking(client);

        return {
            embed: buildDogEmbed(ranked),
            signature: ranked
                .map((item) => {
                    return `${item.userId}:${item.bestDogValue}:${item.bestDogName}:${item.bestDogWeightKg}:${item.dogCount}`;
                })
                .join("|"),
        };
    }

    if (type === LEADERBOARD_TYPES.MONEY) {
        const ranked = await buildMoneyRanking(client);

        return {
            embed: buildMoneyEmbed(ranked),
            signature: ranked
                .map((item) => `${item.userId}:${item.money}`)
                .join("|"),
        };
    }

    if (type === LEADERBOARD_TYPES.TOWER) {
        const ranked = await buildTowerRanking(client);

        return {
            embed: buildTowerEmbed(ranked),
            signature: ranked
                .map((item) => {
                    return `${item.userId}:${item.highestFloor}:${item.currentFloor}:${item.totalChests}:${item.totalEarned}:${item.combatPower}`;
                })
                .join("|"),
        };
    }

    if (type === LEADERBOARD_TYPES.NOITU) {
        const ranked = await buildNoiTuRanking(client);

        return {
            embed: buildNoiTuEmbed(ranked),
            signature: ranked
                .map((item) => {
                    return `${item.userId}:${item.correct}:${item.wins}:${item.botStuckWins}:${item.forfeitWins}`;
                })
                .join("|"),
        };
    }

    const ranked = await buildRanking(client);

    return {
        embed: buildEmbed(ranked),
        signature: buildSignature(ranked),
    };
}

function getRealm(profile) {
    const realms = getRealms();

    return realms[profile.realmIndex || 0] || realms[0];
}

function getRealmName(profile) {
    const realm = getRealm(profile);

    return `${realm.name} - Tầng ${profile.floor || 1}`;
}

function getRootById(rootId) {
    const roots = Array.isArray(tuTienConfig.spiritualRoots)
        ? tuTienConfig.spiritualRoots
        : [];

    return roots.find((root) => root.id === rootId);
}

function getAllSkillDefs() {
    const activeSkills = Array.isArray(skillConfig.activeSkills)
        ? skillConfig.activeSkills
        : [];

    const passiveSkills = Array.isArray(skillConfig.passiveSkills)
        ? skillConfig.passiveSkills
        : [];

    return [...activeSkills, ...passiveSkills];
}

function getSkillDef(skillId) {
    return getAllSkillDefs().find((skill) => skill.id === skillId);
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

function calculateCombatStats(profile) {
    return sharedCombat.calculateCombatStats(profile);
}

function calculateCombatPower(profile) {
    return sharedCombat.calculateCombatPower(profile);
}

function getRankIcon(index) {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";

    return `#${index + 1}`;
}

async function getUsername(client, userId) {
    const key = String(userId);
    const cached = usernameCache.get(key);

    if (cached && Date.now() - cached.time < USERNAME_CACHE_TTL_MS) {
        return cached.name;
    }

    const cachedUser = client.users.cache.get(key);
    const user =
        cachedUser ||
        (await client.users.fetch(key, { cache: true }).catch(() => null));
    const name = user ? user.globalName || user.username : `User ${key}`;

    usernameCache.set(key, {
        name,
        time: Date.now(),
    });

    return name;
}

async function buildRanking(client) {
    const limit = Number(leaderboardConfig.limit || 10);
    const users = getAllUsers();

    const excludedUserIds = Array.isArray(leaderboardConfig.excludedUserIds)
        ? leaderboardConfig.excludedUserIds
        : [];

    const ranked = users
        .filter((user) => !isHiddenLeaderboardUser(user.userId))
        .filter((user) => {
            return !excludedUserIds.includes(user.userId);
        })
        .map((user) => {
            const profile = user.tuTienProfile;

            if (!profile || !profile.rootId) {
                return null;
            }

            const root = getRootById(profile.rootId);
            const combatPower = calculateCombatPower(profile);

            return {
                userId: user.userId,
                profile,
                root,
                combatPower,
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.combatPower - a.combatPower)
        .slice(0, limit);

    for (const item of ranked) {
        item.username = await getUsername(client, item.userId);
    }

    return ranked;
}

function buildSignature(ranked) {
    return ranked
        .map((item) => {
            const passiveSkills = Array.isArray(
                item.profile.equippedSkills?.passive,
            )
                ? item.profile.equippedSkills.passive.join(",")
                : "";

            return `${item.userId}:${item.combatPower}:${item.profile.realmIndex || 0}:${item.profile.floor || 1}:${item.profile.exp || 0}:${passiveSkills}`;
        })
        .join("|");
}

function buildEmbed(ranked) {
    const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("🏆 CHIẾN LỰC MẠNH NHẤT")
        .setFooter({
            text: "Bảng xếp hạng tự động cập nhật",
        })
        .setTimestamp();

    if (tuTienConfig.thumbnail) {
        embed.setThumbnail(tuTienConfig.thumbnail);
    }

    if (ranked.length <= 0) {
        embed.setDescription("Chưa có ai thức tỉnh linh căn để xếp hạng.");
        return embed;
    }

    const fields = ranked.map((item, index) => {
        const rootText = item.root
            ? `${item.root.emoji || "🌱"} ${item.root.name}`
            : "Chưa rõ";

        const daoHieu = item.profile.daoHieu || "Lợn Vô Danh";
        const realm = getRealm(item.profile);
        const maxExp = Math.max(1, Number(realm.maxExp || 1));
        const exp = Number(item.profile.exp || 0);
        const expPercent = Math.floor(
            Math.max(0, Math.min(1, exp / maxExp)) * 100,
        );

        const passiveSkills = Array.isArray(
            item.profile.equippedSkills?.passive,
        )
            ? item.profile.equippedSkills.passive
            : [];

        const passiveText =
            passiveSkills.length > 0
                ? `${passiveSkills.length} kỹ năng`
                : "Không có";

        return {
            name: `${getRankIcon(index)}  『 ${daoHieu} 』`,
            value:
                `👤 Chủ nhân: **${item.username}**\n` +
                `⚔️ Chiến lực: **${formatNumber(item.combatPower)}**\n` +
                `📜 Cảnh giới: **${getRealmName(item.profile)}**\n` +
                `🌱 Linh căn: **${rootText}**\n` +
                `📈 Tu vi tầng: **${expPercent}%**\n` +
                `🧘 Bị động: **${passiveText}**`,
            inline: false,
        };
    });

    embed.addFields(fields);

    return embed;
}

async function getLeaderboardChannel(client) {
    const channelId = leaderboardConfig.channelId;

    if (!channelId || channelId === "CHANNEL_ID_CUA_BAN") {
        console.log(
            "[Leaderboard] Chưa cấu hình channelId trong config/leaderboard.js",
        );
        return null;
    }

    const channel = await client.channels.fetch(channelId).catch((error) => {
        console.error("[Leaderboard] Không fetch được channel:", error);

        return null;
    });

    if (!channel || !channel.isTextBased()) {
        console.log(
            "[Leaderboard] Channel không tồn tại hoặc không phải text channel",
        );
        return null;
    }

    return channel;
}

async function updateCombatPowerLeaderboard(client, options = {}) {
    if (isUpdating) {
        return;
    }

    isUpdating = true;

    try {
        const channel = await getLeaderboardChannel(client);

        if (!channel) {
            return;
        }

        const oldState = getSystemValue(STATE_KEY) || {};
        const type = oldState.type || LEADERBOARD_TYPES.COMBAT;

        const data = await buildLeaderboardByType(client, type);
        const signature = `${type}:${data.signature}`;

        if (!options.force && oldState.signature === signature) {
            return;
        }

        const embed = data.embed;

        let message = null;

        if (oldState.messageId && oldState.channelId === channel.id) {
            message = await channel.messages
                .fetch(oldState.messageId)
                .catch(() => null);
        }

        if (message) {
            await message.edit({
                content: "",
                embeds: [embed],
                components: [createLeaderboardButtons(type)],
            });
        } else {
            message = await channel.send({
                embeds: [embed],
                components: [createLeaderboardButtons(type)],
            });
        }

        setSystemValue(STATE_KEY, {
            channelId: channel.id,
            messageId: message.id,
            signature,
            type,
            updatedAt: Date.now(),
        });

        console.log("[Leaderboard] Đã cập nhật bảng xếp hạng");
    } catch (error) {
        console.error("[Leaderboard] Lỗi update bảng xếp hạng:", error);
    } finally {
        isUpdating = false;
    }
}

function startAutoUpdate(client) {
    if (intervalId) {
        return;
    }

    const seconds = Number(leaderboardConfig.updateEverySeconds || 300);
    const intervalMs = Math.max(300, seconds) * 1000;

    updateCombatPowerLeaderboard(client, {
        force: true,
    }).catch((error) => {
        console.error("[Leaderboard] Lỗi lần cập nhật đầu:", error);
    });

    intervalId = setInterval(() => {
        updateCombatPowerLeaderboard(client).catch((error) => {
            console.error("[Leaderboard] Lỗi auto update:", error);
        });
    }, intervalMs);

    console.log(
        `[Leaderboard] Auto update mỗi ${Math.floor(intervalMs / 1000)} giây`,
    );
}

async function handleButton(interaction) {
    if (!interaction.customId.startsWith("leaderboard_")) {
        return undefined;
    }

    await interaction.deferUpdate();

    let type = LEADERBOARD_TYPES.COMBAT;

    if (interaction.customId === "leaderboard_dog") {
        type = LEADERBOARD_TYPES.DOG;
    }

    if (interaction.customId === "leaderboard_money") {
        type = LEADERBOARD_TYPES.MONEY;
    }

    if (interaction.customId === "leaderboard_tower") {
        type = LEADERBOARD_TYPES.TOWER;
    }
    if (interaction.customId === "leaderboard_noitu") {
        type = LEADERBOARD_TYPES.NOITU;
    }

    const oldState = getSystemValue(STATE_KEY) || {};
    const data = await buildLeaderboardByType(interaction.client, type);
    const signature = `${type}:${data.signature}`;

    setSystemValue(STATE_KEY, {
        ...oldState,
        type,
        signature,
        updatedAt: Date.now(),
    });

    return interaction.message.edit({
        embeds: [data.embed],
        components: [createLeaderboardButtons(type)],
    });
}

module.exports = {
    startAutoUpdate,
    updateCombatPowerLeaderboard,
    handleButton,
};
