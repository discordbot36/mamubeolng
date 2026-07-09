const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
} = require("discord.js");

const { announceRareDrop, isRareSkill } = require("./utils/rareDrop");

const {
    getShop,
    getInventory,
    buyItem,
    consumeShopItem,
    ensureTuTienProfile,
    updateTuTienProfile,
    formatMoney,
    getCurrencyEmoji,
} = require("./database");
const skillUtils = require("./utils/skillUtils");
const SHOP_CATEGORY = "skill";
const BUY_PREFIX = "skillbuy";
const SHOP_PREFIX = "skillshop";
const MAX_SKILL_SCROLL_BUY_QUANTITY = 100;
const MAX_SKILL_SCROLL_OPEN_QUANTITY = 100;
function getSkillShopEntries(type = null) {
    return Object.entries(getShop()).filter(([, item]) => {
        if (item.type !== "skill_scroll") return false;
        if (item.shopCategory !== SHOP_CATEGORY) return false;
        if (!type) return true;

        return item.skillScrollType === type;
    });
}

function getTypeText(type) {
    return type === "active" ? "Chủ động" : "Bị động";
}
function normalizeSkillScrollQuantity(
    value,
    max = MAX_SKILL_SCROLL_OPEN_QUANTITY,
) {
    const quantity = Math.floor(Number(value || 1));

    if (!Number.isFinite(quantity) || quantity < 1) {
        return 1;
    }

    return Math.min(max, quantity);
}
function buildCategoryButtons(userId, quantity = 1) {
    const safeQuantity = normalizeSkillScrollQuantity(
        quantity,
        MAX_SKILL_SCROLL_BUY_QUANTITY,
    );

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${SHOP_PREFIX}_active_${userId}_${safeQuantity}`)
            .setLabel("Kỹ năng chủ động")
            .setEmoji("⚔️")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(`${SHOP_PREFIX}_passive_${userId}_${safeQuantity}`)
            .setLabel("Kỹ năng bị động")
            .setEmoji("🧘")
            .setStyle(ButtonStyle.Success),
    );
}

function buildBackButton(userId, quantity = 1) {
    const safeQuantity = normalizeSkillScrollQuantity(
        quantity,
        MAX_SKILL_SCROLL_BUY_QUANTITY,
    );

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${SHOP_PREFIX}_back_${userId}_${safeQuantity}`)
            .setLabel("Quay lại")
            .setEmoji("↩️")
            .setStyle(ButtonStyle.Secondary),
    );
}

function buildBuyButtons(entries, userId, quantity = 1) {
    const safeQuantity = normalizeSkillScrollQuantity(
        quantity,
        MAX_SKILL_SCROLL_BUY_QUANTITY,
    );

    const rows = [];
    let currentRow = new ActionRowBuilder();

    entries.forEach(([itemId, item], index) => {
        if (currentRow.components.length >= 5) {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder();
        }

        currentRow.addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `${BUY_PREFIX}_${userId}_${safeQuantity}_${itemId}`,
                )
                .setLabel(`Mua ${index + 1} x${safeQuantity}`)
                .setEmoji(item.emoji || "📜")
                .setStyle(ButtonStyle.Primary),
        );
    });

    if (currentRow.components.length > 0) {
        rows.push(currentRow);
    }

    return rows;
}
function buildSkillShopHomeEmbed(interaction, quantity = 1) {
    const safeQuantity = normalizeSkillScrollQuantity(
        quantity,
        MAX_SKILL_SCROLL_BUY_QUANTITY,
    );
    return new EmbedBuilder()
        .setTitle("📚 SHOP KỸ NĂNG")
        .setColor(0xf7a8c8)
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .setDescription(
            `Chọn loại bí tịch muốn xem:\n\n` +
                `⚔️ **Kỹ năng chủ động**\n` +
                `Bí tịch dùng để mở kỹ năng chủ động sau này.\n\n` +
                `🧘 **Kỹ năng bị động**\n` +
                `Bí tịch dùng để mở kỹ năng bị động sau này.\n\n` +
                `Sau khi mua, dùng lệnh \`/dungkynang\` để mở bí tịch.\n` +
                `Nếu mở trùng kỹ năng, bạn sẽ nhận **mảnh kỹ năng** để nâng Lv.`,
        )
        .setTimestamp();
}

function buildSkillShopListEmbed(interaction, type, quantity = 1) {
    const safeQuantity = normalizeSkillScrollQuantity(
        quantity,
        MAX_SKILL_SCROLL_BUY_QUANTITY,
    );
    const coin = getCurrencyEmoji();

    const title =
        type === "active"
            ? "⚔️ SHOP BÍ TỊCH CHỦ ĐỘNG"
            : "🧘 SHOP BÍ TỊCH BỊ ĐỘNG";

    const entries = getSkillShopEntries(type);

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(type === "active" ? 0xff7777 : 0x77dd99)
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .setDescription(
            `Bấm nút bên dưới để mua trực tiếp.\n` +
                `Mỗi lần bấm sẽ mua **x1 bí tịch** và cất vào **/khodo**.\n\n` +
                `Dùng lệnh \`/dungkynang\` để mở bí tịch.\n` +
                `Mở trùng kỹ năng sẽ nhận **mảnh kỹ năng** để nâng Lv.`,
        )
        .setTimestamp();

    if (entries.length <= 0) {
        embed.addFields({
            name: "Trống",
            value: "Chưa có bí tịch kỹ năng nào.",
            inline: false,
        });

        return embed;
    }

    entries.forEach(([, item], index) => {
        const typeText = getTypeText(item.skillScrollType);

        embed.addFields({
            name: `${index + 1}. ${item.emoji || "📜"} ${item.name}`,
            value:
                `${coin} Giá: **${formatMoney(item.price)}** / cuốn\n` +
                `${coin} Mua x${safeQuantity}: **${formatMoney(item.price * safeQuantity)}**\n` +
                `📌 Phân loại: **${typeText}**\n` +
                `${item.description || "Bí tịch kỹ năng."}`,
            inline: false,
        });
    });

    return embed;
}

async function shop(interaction) {
    const quantity = normalizeSkillScrollQuantity(
        interaction.options.getInteger("soluong") || 1,
        MAX_SKILL_SCROLL_BUY_QUANTITY,
    );

    return interaction.reply({
        embeds: [buildSkillShopHomeEmbed(interaction, quantity)],
        components: [buildCategoryButtons(interaction.user.id, quantity)],
    });
}

async function buySkillScrollByButton(interaction) {
    const parts = interaction.customId.split("_");
    const userId = parts[1];
    let quantity = 1;
    let itemId = parts.slice(2).join("_");

    if (/^\d+$/.test(parts[2] || "")) {
        quantity = normalizeSkillScrollQuantity(
            parts[2],
            MAX_SKILL_SCROLL_BUY_QUANTITY,
        );
        itemId = parts.slice(3).join("_");
    }

    if (interaction.user.id !== userId) {
        return interaction.reply({
            content: "❌ Đây không phải nút mua của bạn.",
            ephemeral: true,
        });
    }

    const shopData = getShop();
    const item = shopData[itemId];

    if (
        !item ||
        item.type !== "skill_scroll" ||
        item.shopCategory !== SHOP_CATEGORY
    ) {
        return interaction.reply({
            content: "❌ Bí tịch này không tồn tại trong shop kỹ năng.",
            ephemeral: true,
        });
    }

    const result = buyItem(interaction.user.id, itemId, quantity);
    const coin = getCurrencyEmoji();

    if (!result.success) {
        return interaction.reply({
            content: `❌ ${result.message}`,
            ephemeral: true,
        });
    }

    const typeText = getTypeText(result.item.skillScrollType);

    return interaction.reply({
        content:
            `📚 Mua bí tịch thành công!\n\n` +
            `${result.item.emoji || "📜"} **${result.item.name}**\n` +
            `📌 Loại: **${typeText}**\n` +
            `📦 Số lượng: **x${result.quantity}**\n` +
            `${coin} Tổng tiền: **${formatMoney(result.totalPrice)}**\n\n` +
            `🎒 Đã cất vào kho đồ. Xem bằng \`/khodo\`.\n` +
            `📖 Dùng \`/dungkynang\` để mở bí tịch.`,
        ephemeral: true,
    });
}

async function handleShopButton(interaction) {
    const parts = interaction.customId.split("_");
    const action = parts[1];
    const userId = parts[2];
    const quantity = normalizeSkillScrollQuantity(
        parts[3] || 1,
        MAX_SKILL_SCROLL_BUY_QUANTITY,
    );

    if (interaction.user.id !== userId) {
        return interaction.reply({
            content: "❌ Đây không phải shop kỹ năng của bạn.",
            ephemeral: true,
        });
    }

    if (action === "back") {
        return interaction.update({
            embeds: [buildSkillShopHomeEmbed(interaction, quantity)],
            components: [buildCategoryButtons(userId, quantity)],
        });
    }

    if (action === "active" || action === "passive") {
        const entries = getSkillShopEntries(action);
        const buyRows = buildBuyButtons(entries, userId, quantity);

        return interaction.update({
            embeds: [buildSkillShopListEmbed(interaction, action, quantity)],
            components: [buildBackButton(userId, quantity), ...buyRows],
        });
    }

    return undefined;
}

function buildEquipSelectMenu(profile, userId, type) {
    const skills = ensureSkillData(profile);
    const equipped = ensureEquippedSkillData(profile);

    const ownedList = type === "active" ? skills.active : skills.passive;
    const equippedList = type === "active" ? equipped.active : equipped.passive;

    const options = ownedList
        .filter((owned) => !equippedList.includes(owned.id))
        .map((owned) => {
            const skill = getSkillDef(owned.id);

            if (!skill) return null;

            return {
                label: skill.name.slice(0, 100),
                description:
                    `${skill.tier} | Lv.${owned.level || 1} | ${skill.description || ""}`.slice(
                        0,
                        100,
                    ),
                value: owned.id,
                emoji: skill.emoji || "✨",
            };
        })
        .filter(Boolean)
        .slice(0, 25);

    if (options.length <= 0) {
        return null;
    }

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`skill_select_equip_${type}_${userId}`)
            .setPlaceholder(
                type === "active"
                    ? "Chọn kỹ năng chủ động để trang bị"
                    : "Chọn kỹ năng bị động để trang bị",
            )
            .addOptions(options),
    );
}

function buildUnequipSelectMenu(profile, userId) {
    const equipped = ensureEquippedSkillData(profile);

    const equippedIds = [
        ...equipped.active.map((id) => ({ id, type: "active" })),
        ...equipped.passive.map((id) => ({ id, type: "passive" })),
    ];

    const options = equippedIds
        .map((entry) => {
            const skill = getSkillDef(entry.id);

            if (!skill) return null;

            return {
                label: skill.name.slice(0, 100),
                description:
                    `${getTypeText(skill.type)} | ${skill.tier} | ${skill.description || ""}`.slice(
                        0,
                        100,
                    ),
                value: skill.id,
                emoji: skill.emoji || "✨",
            };
        })
        .filter(Boolean)
        .slice(0, 25);

    if (options.length <= 0) {
        return null;
    }

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`skill_select_unequip_${userId}`)
            .setPlaceholder("Chọn kỹ năng muốn tháo")
            .addOptions(options),
    );
}
function buildUpgradeSelectMenu(profile, userId) {
    const skills = ensureSkillData(profile);
    const ownedSkills = [...skills.active, ...skills.passive];

    const options = ownedSkills
        .map((owned) => {
            const skill = getSkillDef(owned.id);

            if (!skill) return null;

            const level = owned.level || 1;
            const cap = skillUtils.getSkillLevelCap(skill.tier);
            const cost = skillUtils.getSkillUpgradeCost(skill.tier, level);

            if (!cost || level >= cap) {
                return null;
            }

            if ((owned.shards || 0) < cost) {
                return null;
            }

            return {
                label: `${skill.name} Lv.${level} → ${level + 1}`.slice(0, 100),
                description:
                    `${getTypeText(skill.type)} | ${skill.tier} | Mảnh ${owned.shards || 0}/${cost}`.slice(
                        0,
                        100,
                    ),
                value: owned.id,
                emoji: skill.emoji || "🧩",
            };
        })
        .filter(Boolean)
        .slice(0, 25);

    if (options.length <= 0) {
        return null;
    }

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`skill_select_upgrade_${userId}`)
            .setPlaceholder("Nâng 1 Lv")
            .addOptions(options),
    );
}

function buildUpgradeMaxSelectMenu(profile, userId) {
    const skills = ensureSkillData(profile);
    const ownedSkills = [...skills.active, ...skills.passive];

    const options = ownedSkills
        .map((owned) => {
            const skill = getSkillDef(owned.id);

            if (!skill) return null;

            const level = owned.level || 1;
            const plan = skillUtils.getSkillMaxUpgradePlan(
                skill.tier,
                level,
                owned.shards || 0,
            );

            if (!plan || plan.upgradedLevels <= 0) {
                return null;
            }

            return {
                label: `${skill.name} Lv.${level} → ${plan.toLevel}`.slice(
                    0,
                    100,
                ),
                description:
                    `${getTypeText(skill.type)} | ${skill.tier} | Tốn ${plan.totalCost} mảnh | Còn ${plan.remainingShards}`.slice(
                        0,
                        100,
                    ),
                value: owned.id,
                emoji: skill.emoji || "🚀",
            };
        })
        .filter(Boolean)
        .slice(0, 25);

    if (options.length <= 0) {
        return null;
    }

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`skill_select_upgrade_max_${userId}`)
            .setPlaceholder("Nâng Max bằng toàn bộ mảnh hiện có")
            .addOptions(options),
    );
}
async function handleSkillManageButton(interaction) {
    const parts = interaction.customId.split("_");
    const action = parts[2];

    if (action === "equip") {
        const type = parts[3];
        const userId = parts[4];

        if (interaction.user.id !== userId) {
            return interaction.reply({
                content: "❌ Đây không phải bảng kỹ năng của bạn.",
                ephemeral: true,
            });
        }

        const profile = ensureTuTienProfile(interaction.user.id);
        const menu = buildEquipSelectMenu(profile, userId, type);

        if (!menu) {
            return interaction.reply({
                content:
                    type === "active"
                        ? "❌ Không có kỹ năng chủ động nào có thể trang bị."
                        : "❌ Không có kỹ năng bị động nào có thể trang bị.",
                ephemeral: true,
            });
        }

        return interaction.reply({
            content:
                type === "active"
                    ? "⚔️ Chọn kỹ năng chủ động muốn trang bị:"
                    : "🧘 Chọn kỹ năng bị động muốn trang bị:",
            components: [menu],
            ephemeral: true,
        });
    }

    if (action === "unequip") {
        const userId = parts[3];

        if (interaction.user.id !== userId) {
            return interaction.reply({
                content: "❌ Đây không phải bảng kỹ năng của bạn.",
                ephemeral: true,
            });
        }

        const profile = ensureTuTienProfile(interaction.user.id);
        const menu = buildUnequipSelectMenu(profile, userId);

        if (!menu) {
            return interaction.reply({
                content: "❌ Bạn chưa trang bị kỹ năng nào.",
                ephemeral: true,
            });
        }

        return interaction.reply({
            content: "❌ Chọn kỹ năng muốn tháo:",
            components: [menu],
            ephemeral: true,
        });
    }
    if (action === "upgrade") {
        const userId = parts[3];

        if (interaction.user.id !== userId) {
            return interaction.reply({
                content: "❌ Đây không phải bảng kỹ năng của bạn.",
                ephemeral: true,
            });
        }

        const profile = ensureTuTienProfile(interaction.user.id);
        const oneLevelMenu = buildUpgradeSelectMenu(profile, userId);
        const maxLevelMenu = buildUpgradeMaxSelectMenu(profile, userId);
        const components = [oneLevelMenu, maxLevelMenu].filter(Boolean);

        if (components.length <= 0) {
            return interaction.reply({
                content:
                    "❌ Chưa có kỹ năng nào đủ mảnh để nâng cấp.\n" +
                    "Mở trùng bí tịch để nhận thêm mảnh kỹ năng.",
                ephemeral: true,
            });
        }

        return interaction.reply({
            content:
                "🧩 Chọn cách nâng kỹ năng:\n" +
                "• Menu 1: nâng **1 Lv**\n" +
                "• Menu 2: nâng **Max Lv có thể** bằng số mảnh đang có",
            components,
            ephemeral: true,
        });
    }

    if (action === "refresh") {
        const userId = parts[3];

        if (interaction.user.id !== userId) {
            return interaction.reply({
                content: "❌ Đây không phải bảng kỹ năng của bạn.",
                ephemeral: true,
            });
        }

        const profile = ensureTuTienProfile(interaction.user.id);
        const embed = buildSkillProfileEmbed(interaction, profile);

        return interaction.update({
            embeds: [embed],
            components: [buildSkillManageButtons(userId)],
        });
    }

    return undefined;
}

function formatSkillEffectValue(key, value) {
    const number = Number(value || 0);

    if (key === "damageMultiplier") {
        return `${Math.round(number * 100)}% ATK`;
    }

    if (
        [
            "atkDown",
            "speedDown",
            "defenseDown",
            "poisonPercent",
            "shieldPercent",
            "speedUp",
            "dodgeChance",
            "defenseIgnore",
            "critChanceBonus",
            "atkUp",
            "defenseUp",
            "lifeSteal",
            "executeBonusDamage",
            "stunChance",
            "hpBonus",
            "atkBonus",
            "defenseBonus",
            "speedBonus",
            "counterChance",
            "damageReduction",
            "reviveChance",
            "reviveHpPercent",
            "lowHpAtkBonus",
        ].includes(key)
    ) {
        return `${Math.round(number * 1000) / 10}%`;
    }

    if (key === "counterDamageMultiplier") {
        return `${Math.round(number * 100)}% phản kích`;
    }

    return String(number);
}

function getSkillEffectLabel(key) {
    const labels = {
        damageMultiplier: "Sát thương",
        atkDown: "Giảm ATK địch",
        speedDown: "Giảm Speed địch",
        defenseDown: "Giảm Thủ địch",
        poisonPercent: "Độc mỗi lượt",
        shieldPercent: "Khiên",
        speedUp: "Tăng Speed",
        dodgeChance: "Né tránh",
        defenseIgnore: "Bỏ qua Thủ",
        critChanceBonus: "Tỉ lệ chí mạng",
        atkUp: "Tăng ATK",
        defenseUp: "Tăng Thủ",
        lifeSteal: "Hút máu",
        executeBonusDamage: "Sát thương kết liễu",
        stunChance: "Tỉ lệ choáng",

        hpBonus: "Tăng HP",
        atkBonus: "Tăng ATK",
        defenseBonus: "Tăng Thủ",
        speedBonus: "Tăng Speed",
        counterChance: "Tỉ lệ phản kích",
        counterDamageMultiplier: "Sát thương phản kích",
        damageReduction: "Giảm sát thương nhận",
        reviveChance: "Tỉ lệ hồi sinh",
        reviveHpPercent: "HP sau hồi sinh",
        lowHpAtkBonus: "ATK khi thấp máu",
    };

    return labels[key] || key;
}

function buildSkillEffectCompareText(skill, oldLevel, newLevel) {
    const oldSkill = skillUtils.scaleSkillDef(skill, oldLevel);
    const newSkill = skillUtils.scaleSkillDef(skill, newLevel);

    const fields = [
        "damageMultiplier",
        "atkDown",
        "speedDown",
        "defenseDown",
        "poisonPercent",
        "shieldPercent",
        "speedUp",
        "dodgeChance",
        "defenseIgnore",
        "critChanceBonus",
        "atkUp",
        "defenseUp",
        "lifeSteal",
        "executeBonusDamage",
        "stunChance",

        "hpBonus",
        "atkBonus",
        "defenseBonus",
        "speedBonus",
        "counterChance",
        "counterDamageMultiplier",
        "damageReduction",
        "reviveChance",
        "reviveHpPercent",
        "lowHpAtkBonus",
    ];

    const lines = fields
        .filter((key) => {
            return typeof skill[key] === "number" && skill[key] > 0;
        })
        .map((key) => {
            return (
                `• ${getSkillEffectLabel(key)}: ` +
                `**${formatSkillEffectValue(key, oldSkill[key])}** → ` +
                `**${formatSkillEffectValue(key, newSkill[key])}**`
            );
        })
        .slice(0, 6);

    if (lines.length <= 0) {
        return "• Kỹ năng này có hiệu ứng đặc biệt, Lv vẫn tăng hiệu lực tổng.";
    }

    return lines.join("\n");
}

async function handleSkillSelectMenu(interaction) {
    const parts = interaction.customId.split("_");
    const mode = parts[2];

    if (mode === "equip") {
        const type = parts[3];
        const userId = parts[4];

        if (interaction.user.id !== userId) {
            return interaction.reply({
                content: "❌ Đây không phải menu kỹ năng của bạn.",
                ephemeral: true,
            });
        }

        const skillId = interaction.values[0];
        const skill = getSkillDef(skillId);

        if (!skill) {
            return interaction.reply({
                content: "❌ Kỹ năng này không tồn tại.",
                ephemeral: true,
            });
        }

        let resultMessage = "";

        updateTuTienProfile(interaction.user.id, (profile) => {
            const skills = ensureSkillData(profile);
            const equipped = ensureEquippedSkillData(profile);
            const slotCount = getEquipSlotCount(profile, skill.type);

            const ownedList =
                skill.type === "active" ? skills.active : skills.passive;
            const equipList =
                skill.type === "active" ? equipped.active : equipped.passive;
            const owned = ownedList.find((item) => item.id === skillId);

            if (!owned) {
                resultMessage = "❌ Bạn chưa sở hữu kỹ năng này.";
                return;
            }

            if (equipList.includes(skillId)) {
                resultMessage = `⚠️ Bạn đã trang bị **${skill.name}** rồi.`;
                return;
            }

            if (skill.type === "passive" && equipList.length >= 1) {
                resultMessage =
                    `❌ Bạn đã trang bị 1 kỹ năng bị động rồi.\n` +
                    `Bị động chỉ được dùng **1 ô**.\n` +
                    `Hãy tháo kỹ năng bị động cũ trước.`;
                return;
            }

            if (equipList.length >= slotCount) {
                resultMessage =
                    `❌ Hết ô trang bị ${getTypeText(skill.type)}.\n` +
                    `Ô hiện tại: **${equipList.length}/${slotCount}**\n` +
                    (skill.type === "passive"
                        ? `Bị động chỉ được trang bị **1 kỹ năng**.`
                        : `Chủ động tối đa hệ thống là **5 ô**.`);
                return;
            }

            equipList.push(skillId);

            resultMessage =
                `✅ Đã trang bị **${skill.emoji || "✨"} ${skill.name}**\n` +
                `📌 Loại: **${getTypeText(skill.type)}**\n` +
                `🎲 Tier: **${skill.tier}**\n` +
                `📦 Ô: **${equipList.length}/${slotCount}**`;
        });

        return interaction.update({
            content: resultMessage,
            components: [],
        });
    }

    if (mode === "unequip") {
        const userId = parts[3];

        if (interaction.user.id !== userId) {
            return interaction.reply({
                content: "❌ Đây không phải menu kỹ năng của bạn.",
                ephemeral: true,
            });
        }

        const skillId = interaction.values[0];
        const skill = getSkillDef(skillId);

        if (!skill) {
            return interaction.reply({
                content: "❌ Kỹ năng này không tồn tại.",
                ephemeral: true,
            });
        }

        let resultMessage = "";

        updateTuTienProfile(interaction.user.id, (profile) => {
            const equipped = ensureEquippedSkillData(profile);
            const equipList =
                skill.type === "active" ? equipped.active : equipped.passive;
            const index = equipList.indexOf(skillId);

            if (index < 0) {
                resultMessage = "❌ Kỹ năng này chưa được trang bị.";
                return;
            }

            equipList.splice(index, 1);

            resultMessage =
                `✅ Đã tháo **${skill.emoji || "✨"} ${skill.name}**\n` +
                `📌 Loại: **${getTypeText(skill.type)}**`;
        });

        return interaction.update({
            content: resultMessage,
            components: [],
        });
    }
    if (mode === "upgrade") {
        const upgradeMode = parts[3] === "max" ? "max" : "one";
        const userId = upgradeMode === "max" ? parts[4] : parts[3];

        if (interaction.user.id !== userId) {
            return interaction.reply({
                content: "❌ Đây không phải menu kỹ năng của bạn.",
                ephemeral: true,
            });
        }

        const skillId = interaction.values[0];
        const skill = getSkillDef(skillId);

        if (!skill) {
            return interaction.reply({
                content: "❌ Kỹ năng này không tồn tại.",
                ephemeral: true,
            });
        }

        let resultMessage = "";

        updateTuTienProfile(interaction.user.id, (profile) => {
            const owned = skillUtils.findOwnedSkill(
                profile,
                skillId,
                skill.type,
            );

            if (!owned) {
                resultMessage = "❌ Bạn chưa sở hữu kỹ năng này.";
                return;
            }

            const currentLevel = owned.level || 1;
            const cap = skillUtils.getSkillLevelCap(skill.tier);

            if (currentLevel >= cap) {
                owned.level = cap;
                resultMessage = `⚠️ **${skill.name}** đã đạt Lv.MAX (${cap}).`;
                return;
            }

            if (upgradeMode === "max") {
                const plan = skillUtils.getSkillMaxUpgradePlan(
                    skill.tier,
                    currentLevel,
                    owned.shards || 0,
                );

                if (!plan || plan.upgradedLevels <= 0) {
                    const nextCost = skillUtils.getSkillUpgradeCost(
                        skill.tier,
                        currentLevel,
                    );

                    resultMessage =
                        `❌ Không đủ mảnh để nâng **${skill.name}**.\n` +
                        `🧩 Cần: **${nextCost}** | Đang có: **${owned.shards || 0}**`;
                    return;
                }

                owned.shards = plan.remainingShards;
                owned.level = plan.toLevel;

                resultMessage =
                    `🚀 Nâng Max thành công **${skill.emoji || "✨"} ${skill.name}**\n` +
                    `📈 Lv.${currentLevel} → **Lv.${owned.level}** / ${cap}\n` +
                    `⬆️ Tăng: **${plan.upgradedLevels} Lv**\n` +
                    `🧩 Tốn: **${plan.totalCost}** mảnh | Còn: **${owned.shards || 0}**\n` +
                    (plan.isMaxed
                        ? `🏁 Đã đạt Lv tối đa.`
                        : `📌 Lv tiếp theo cần: **${plan.nextCost}** mảnh.`);
                return;
            }

            const cost = skillUtils.getSkillUpgradeCost(
                skill.tier,
                currentLevel,
            );

            if (!cost) {
                owned.level = cap;
                resultMessage = `⚠️ **${skill.name}** đã đạt Lv.MAX (${cap}).`;
                return;
            }

            if ((owned.shards || 0) < cost) {
                resultMessage =
                    `❌ Không đủ mảnh để nâng **${skill.name}**.\n` +
                    `🧩 Cần: **${cost}** | Đang có: **${owned.shards || 0}**`;
                return;
            }

            owned.shards = (owned.shards || 0) - cost;
            owned.level = currentLevel + 1;

            const nextCost = skillUtils.getSkillUpgradeCost(
                skill.tier,
                owned.level,
            );

            resultMessage =
                `✅ Nâng cấp thành công **${skill.emoji || "✨"} ${skill.name}**\n` +
                `📈 Lv.${currentLevel} → **Lv.${owned.level}** / ${cap}\n` +
                `🧩 Tốn: **${cost}** mảnh | Còn: **${owned.shards || 0}**\n` +
                (nextCost
                    ? `📌 Lv tiếp theo cần: **${nextCost}** mảnh.`
                    : `🏁 Đã đạt Lv tối đa.`);
        });

        return interaction.update({
            content: resultMessage,
            components: [],
        });
    }
    return undefined;
}

async function handleButton(interaction) {
    if (interaction.customId.startsWith(`${BUY_PREFIX}_`)) {
        return buySkillScrollByButton(interaction);
    }

    if (interaction.customId.startsWith(`${SHOP_PREFIX}_`)) {
        return handleShopButton(interaction);
    }

    if (interaction.customId.startsWith("skill_manage_")) {
        return handleSkillManageButton(interaction);
    }

    if (interaction.customId.startsWith("skill_select_")) {
        return handleSkillSelectMenu(interaction);
    }

    return undefined;
}

function getSkillScrollInventoryEntries(userId) {
    const inventory = getInventory(userId);
    const shop = getShop();

    return Object.entries(inventory.shopItems).filter(([itemId, amount]) => {
        return (
            amount > 0 &&
            shop[itemId] &&
            shop[itemId].type === "skill_scroll" &&
            shop[itemId].shopCategory === SHOP_CATEGORY
        );
    });
}

function matchAutocomplete(
    entries,
    focusedValue,
    getName = (item) => item.name,
) {
    const search = focusedValue.toLowerCase();

    return entries
        .filter(([id, item]) => {
            return (
                id.toLowerCase().includes(search) ||
                getName(item).toLowerCase().includes(search)
            );
        })
        .slice(0, 25)
        .map(([id, item]) => ({
            name: getName(item),
            value: id,
        }));
}

async function autocompleteSkillScroll(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const shop = getShop();

    const entries = getSkillScrollInventoryEntries(interaction.user.id).map(
        ([itemId, amount]) => {
            const item = shop[itemId];
            const typeText = getTypeText(item.skillScrollType);

            return [
                itemId,
                {
                    ...item,
                    displayName: `${item.name} - ${typeText} x${amount}`,
                },
            ];
        },
    );

    return interaction.respond(
        matchAutocomplete(entries, focusedValue, (item) => item.displayName),
    );
}

function rollFromTable(rollTable) {
    const entries = Object.entries(rollTable || { F: 1 });
    const total = entries.reduce((sum, [, chance]) => sum + chance, 0);

    let roll = Math.random() * total;

    for (const [tier, chance] of entries) {
        roll -= chance;

        if (roll <= 0) {
            return tier;
        }
    }

    return entries[0][0];
}

function pickRandomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function ensureSkillData(profile) {
    if (!profile.skills) {
        profile.skills = {
            active: [],
            passive: [],
        };
    }

    if (!Array.isArray(profile.skills.active)) {
        profile.skills.active = [];
    }

    if (!Array.isArray(profile.skills.passive)) {
        profile.skills.passive = [];
    }

    return profile.skills;
}

function getDuplicateShards(tier) {
    return skillUtils.getDuplicateShards(tier);
}
function formatTierCounts(tierCounts, skillTierNames) {
    const order = ["S", "A", "B", "C", "D", "E", "F"];

    return order
        .filter((tier) => Number(tierCounts[tier] || 0) > 0)
        .map((tier) => {
            const tierName = skillTierNames[tier] || tier;
            return `**${tier} - ${tierName}** x${tierCounts[tier]}`;
        })
        .join(" | ");
}

function formatLimitedLines(lines, max = 8) {
    if (!Array.isArray(lines) || lines.length <= 0) {
        return "Không có.";
    }

    const visible = lines.slice(0, max);
    const hidden = lines.length - visible.length;

    return (
        visible.join("\n") +
        (hidden > 0 ? `\n... và **${hidden}** dòng khác.` : "")
    );
}
async function useSkillScroll(interaction) {
    const {
        skillTierNames,
        activeSkills,
        passiveSkills,
    } = require("./config/kynang");

    const itemId = interaction.options.getString("bitich");
    const requestedQuantity = normalizeSkillScrollQuantity(
        interaction.options.getInteger("soluong") || 1,
        MAX_SKILL_SCROLL_OPEN_QUANTITY,
    );
    const shopData = getShop();
    const item = shopData[itemId];

    if (
        !item ||
        item.type !== "skill_scroll" ||
        item.shopCategory !== SHOP_CATEGORY
    ) {
        return interaction.reply({
            content: "❌ Đây không phải bí tịch kỹ năng.",
            ephemeral: true,
        });
    }

    ensureTuTienProfile(interaction.user.id);

    const inventory = getInventory(interaction.user.id);
    const currentAmount = Number(inventory.shopItems[itemId] || 0);

    if (currentAmount < requestedQuantity) {
        return interaction.reply({
            content:
                `❌ Không đủ bí tịch để mở.\n` +
                `📦 Bạn đang có: **x${currentAmount}**\n` +
                `📖 Muốn mở: **x${requestedQuantity}**`,
            ephemeral: true,
        });
    }

    const consumeResult = consumeShopItem(
        interaction.user.id,
        itemId,
        requestedQuantity,
    );

    if (!consumeResult.success) {
        return interaction.reply({
            content: `❌ ${consumeResult.message}`,
            ephemeral: true,
        });
    }

    const skillType = item.skillScrollType === "passive" ? "passive" : "active";
    const source = skillType === "active" ? activeSkills : passiveSkills;
    const tierCounts = {};
    const newSkillLines = [];
    const duplicateMap = new Map();
    const rareDrops = [];

    updateTuTienProfile(interaction.user.id, (profile) => {
        for (let index = 0; index < requestedQuantity; index += 1) {
            const tier = rollFromTable(item.rollTable || { F: 1 });
            tierCounts[tier] = Number(tierCounts[tier] || 0) + 1;

            let pool = source.filter((skill) => skill.tier === tier);

            if (pool.length <= 0) {
                pool = source;
            }

            const skill = pickRandomItem(pool);
            const skills = ensureSkillData(profile);
            const list =
                skill.type === "active" ? skills.active : skills.passive;
            const ownedSkill = list.find((owned) => owned.id === skill.id);

            if (ownedSkill) {
                const shardsGained = getDuplicateShards(skill.tier);
                ownedSkill.shards = (ownedSkill.shards || 0) + shardsGained;

                const key = skill.id;
                const current = duplicateMap.get(key) || {
                    skill,
                    count: 0,
                    shardsGained: 0,
                    shardsTotal: 0,
                    nextUpgradeCost: null,
                };

                current.count += 1;
                current.shardsGained += shardsGained;
                current.shardsTotal = ownedSkill.shards;
                current.nextUpgradeCost = skillUtils.getSkillUpgradeCost(
                    skill.tier,
                    ownedSkill.level || 1,
                );
                duplicateMap.set(key, current);
            } else {
                list.push({
                    id: skill.id,
                    type: skill.type,
                    tier: skill.tier,
                    level: 1,
                    shards: 0,
                    obtainedAt: Date.now(),
                });

                newSkillLines.push(
                    `${skill.emoji || "✨"} **${skill.name}** | ${skill.tier} | ${getTypeText(skill.type)}`,
                );
            }

            if (isRareSkill(skill)) {
                rareDrops.push(skill);
            }
        }
    });

    for (const skill of rareDrops) {
        await announceRareDrop(interaction.client, {
            user: interaction.user,
            emoji: skill.emoji || "📚",
            name: skill.name,
            detail:
                `📚 Bí tịch: **${item.name}**\n` +
                `🎲 Tier: **${skill.tier} - ${skillTierNames[skill.tier] || skill.tier}**\n` +
                `📌 Loại: **${getTypeText(skill.type)}**\n` +
                `${skill.description || ""}`,
        });
    }

    const duplicateLines = Array.from(duplicateMap.values()).map((entry) => {
        const nextCostText = entry.nextUpgradeCost
            ? ` | Lv tiếp: ${entry.nextUpgradeCost} mảnh`
            : " | MAX Lv";

        return (
            `${entry.skill.emoji || "✨"} **${entry.skill.name}** x${entry.count}` +
            ` → 🧩 +${entry.shardsGained} | Tổng ${entry.shardsTotal}${nextCostText}`
        );
    });

    const totalDuplicateShards = Array.from(duplicateMap.values()).reduce(
        (sum, entry) => sum + Number(entry.shardsGained || 0),
        0,
    );
    const typeName = getTypeText(skillType);
    const tierSummary =
        formatTierCounts(tierCounts, skillTierNames) || "Không có";

    return interaction.reply({
        content:
            `📖 ${interaction.user} mở **${item.emoji || "📜"} ${item.name} x${requestedQuantity}**\n` +
            `📌 Loại sách: **${typeName}**\n` +
            `🎲 Phẩm chất roll: ${tierSummary}\n\n` +
            `🆕 **Kỹ năng mới:**\n${formatLimitedLines(newSkillLines, 8)}\n\n` +
            `🧩 **Kỹ năng trùng / mảnh nhận được:**\n${formatLimitedLines(duplicateLines, 10)}\n\n` +
            `📦 Tổng kết: **${newSkillLines.length}** kỹ năng mới, ` +
            `**${duplicateLines.length}** loại kỹ năng trùng, ` +
            `🧩 **+${totalDuplicateShards}** mảnh.\n` +
            `👉 Vào \`/kynang\` → **Nâng Lv** để dùng mảnh.`,
    });
}

function buildSkillManageButtons(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`skill_manage_equip_active_${userId}`)
            .setLabel("Trang bị chủ động")
            .setEmoji("⚔️")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(`skill_manage_equip_passive_${userId}`)
            .setLabel("Trang bị bị động")
            .setEmoji("🧘")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(`skill_manage_unequip_${userId}`)
            .setLabel("Tháo kỹ năng")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`skill_manage_upgrade_${userId}`)
            .setLabel("Nâng Lv")
            .setEmoji("🧩")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`skill_manage_refresh_${userId}`)
            .setLabel("Làm mới")
            .setEmoji("🔄")
            .setStyle(ButtonStyle.Secondary),
    );
}

function getActiveEquipSlotCount(profile) {
    return Math.min(5, Math.max(1, (profile.realmIndex || 0) + 1));
}

function getPassiveEquipSlotCount() {
    return 1;
}

function getEquipSlotCount(profile, type) {
    if (type === "passive") {
        return getPassiveEquipSlotCount();
    }

    return getActiveEquipSlotCount(profile);
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

function getAllSkillDefs() {
    return skillUtils.getAllSkillDefs();
}

function getSkillDef(skillId) {
    return skillUtils.getSkillDef(skillId);
}

function formatOwnedSkillList(ownedList) {
    if (!Array.isArray(ownedList) || ownedList.length <= 0) {
        return "Chưa sở hữu kỹ năng nào.";
    }

    return ownedList
        .map((owned, index) => {
            const skill = getSkillDef(owned.id);

            if (!skill) {
                return `${index + 1}. ❓ ${owned.id}`;
            }

            const level = owned.level || 1;
            const cap = skillUtils.getSkillLevelCap(skill.tier);
            const cost = skillUtils.getSkillUpgradeCost(skill.tier, level);

            const shardText = cost
                ? `${owned.shards || 0}/${cost}`
                : `${owned.shards || 0}/MAX`;

            return (
                `${index + 1}. ${skill.emoji || "✨"} **${skill.name}** | ` +
                `${skill.tier} | Lv.${level}/${cap} | 🧩 ${shardText}`
            );
        })
        .join("\n")
        .slice(0, 1024);
}
function formatOwnedSkillList(ownedList) {
    if (!Array.isArray(ownedList) || ownedList.length <= 0) {
        return "Chưa sở hữu kỹ năng nào.";
    }

    return ownedList
        .map((owned, index) => {
            const skill = getSkillDef(owned.id);

            if (!skill) {
                return `${index + 1}. ❓ ${owned.id}`;
            }

            const level = owned.level || 1;
            const cap = skillUtils.getSkillLevelCap(skill.tier);
            const cost = skillUtils.getSkillUpgradeCost(skill.tier, level);

            const shardText = cost
                ? `${owned.shards || 0}/${cost}`
                : `${owned.shards || 0}/MAX`;

            const bonusPercent =
                Math.round(
                    Math.max(
                        0,
                        skillUtils.getSkillGrowthMultiplier(level) - 1,
                    ) * 1000,
                ) / 10;

            return (
                `${index + 1}. ${skill.emoji || "✨"} **${skill.name}** | ` +
                `${skill.tier} | Lv.${level}/${cap} | +${bonusPercent}% hiệu lực | 🧩 ${shardText}`
            );
        })
        .join("\n")
        .slice(0, 1024);
}
function buildSkillProfileEmbed(interaction, profile) {
    const skills = ensureSkillData(profile);
    const equipped = ensureEquippedSkillData(profile);
    const activeSlotCount = getEquipSlotCount(profile, "active");
    const passiveSlotCount = getEquipSlotCount(profile, "passive");

    const equippedActiveText =
        equipped.active.length > 0
            ? equipped.active
                  .map((skillId, index) => {
                      const skill = getSkillDef(skillId);

                      if (!skill) {
                          return `${index + 1}. ❓ ${skillId}`;
                      }

                      const owned = skillUtils.findOwnedSkill(
                          profile,
                          skillId,
                          "active",
                      );

                      return (
                          `${index + 1}. ${skill.emoji || "⚔️"} **${skill.name}** | ` +
                          `${skill.tier} | Lv.${owned?.level || 1}`
                      );
                  })
                  .join("\n")
            : "Chưa trang bị kỹ năng chủ động.";

    const equippedPassiveText =
        equipped.passive.length > 0
            ? equipped.passive
                  .map((skillId, index) => {
                      const skill = getSkillDef(skillId);

                      if (!skill) {
                          return `${index + 1}. ❓ ${skillId}`;
                      }

                      const owned = skillUtils.findOwnedSkill(
                          profile,
                          skillId,
                          "passive",
                      );

                      return (
                          `${index + 1}. ${skill.emoji || "🧘"} **${skill.name}** | ` +
                          `${skill.tier} | Lv.${owned?.level || 1}`
                      );
                  })
                  .join("\n")
            : "Chưa trang bị kỹ năng bị động.";

    return new EmbedBuilder()
        .setTitle("📚 KỸ NĂNG CỦA BẠN")
        .setColor(0xf7a8c8)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setDescription(
            `Ô chủ động mở theo cảnh giới, tối đa **5 ô**.\n` +
                `Ô bị động luôn cố định **1 ô**.\n\n` +
                `⚔️ Chủ động: **${equipped.active.length}/${activeSlotCount}**\n` +
                `🧘 Bị động: **${equipped.passive.length}/${passiveSlotCount}**\n\n` +
                `📦 Sở hữu:\n` +
                `⚔️ Chủ động: **${skills.active.length}** kỹ năng\n` +
                `🧘 Bị động: **${skills.passive.length}** kỹ năng\n\n` +
                `🧩 Mở trùng bí tịch để nhận mảnh. Dùng nút **Nâng Lv** để nâng kỹ năng.`,
        )
        .addFields(
            {
                name: "⚔️ Đang trang bị chủ động",
                value: equippedActiveText.slice(0, 1024),
                inline: false,
            },
            {
                name: "🧘 Đang trang bị bị động",
                value: equippedPassiveText.slice(0, 1024),
                inline: false,
            },
            {
                name: "📚 Kỹ năng chủ động sở hữu",
                value: formatOwnedSkillList(skills.active),
                inline: false,
            },
            {
                name: "📚 Kỹ năng bị động sở hữu",
                value: formatOwnedSkillList(skills.passive),
                inline: false,
            },
            {
                name: "📚 Kỹ năng chủ động sở hữu",
                value: formatOwnedSkillList(skills.active),
                inline: false,
            },
            {
                name: "📚 Kỹ năng bị động sở hữu",
                value: formatOwnedSkillList(skills.passive),
                inline: false,
            },
        )
        .setTimestamp();
}
async function listSkills(interaction) {
    const profile = ensureTuTienProfile(interaction.user.id);
    const embed = buildSkillProfileEmbed(interaction, profile);

    return interaction.reply({
        embeds: [embed],
        components: [buildSkillManageButtons(interaction.user.id)],
    });
}

module.exports = {
    shop,
    handleButton,
    useSkillScroll,
    autocompleteSkillScroll,
    listSkills,
};
