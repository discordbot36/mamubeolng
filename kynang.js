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

const SHOP_CATEGORY = "skill";
const BUY_PREFIX = "skillbuy";
const SHOP_PREFIX = "skillshop";

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

function buildCategoryButtons(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${SHOP_PREFIX}_active_${userId}`)
            .setLabel("Kỹ năng chủ động")
            .setEmoji("⚔️")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(`${SHOP_PREFIX}_passive_${userId}`)
            .setLabel("Kỹ năng bị động")
            .setEmoji("🧘")
            .setStyle(ButtonStyle.Success),
    );
}

function buildBackButton(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${SHOP_PREFIX}_back_${userId}`)
            .setLabel("Quay lại")
            .setEmoji("↩️")
            .setStyle(ButtonStyle.Secondary),
    );
}

function buildBuyButtons(entries, userId) {
    const rows = [];
    let currentRow = new ActionRowBuilder();

    entries.forEach(([itemId, item], index) => {
        if (currentRow.components.length >= 5) {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder();
        }

        currentRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`${BUY_PREFIX}_${userId}_${itemId}`)
                .setLabel(`Mua ${index + 1}`)
                .setEmoji(item.emoji || "📜")
                .setStyle(ButtonStyle.Primary),
        );
    });

    if (currentRow.components.length > 0) {
        rows.push(currentRow);
    }

    return rows;
}

function buildSkillShopHomeEmbed(interaction) {
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
                `Hiện tại shop chỉ hỗ trợ **mua bí tịch và cất vào kho**.\n` +
                `Tính năng **mở bí tịch** sẽ thêm sau.`,
        )
        .setTimestamp();
}

function buildSkillShopListEmbed(interaction, type) {
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
                `Chưa mở bí tịch ở đây. Khi có nút **Mở Bí Tịch**, lúc đó mới random kỹ năng.`,
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
                `${coin} Giá: **${formatMoney(item.price)}**\n` +
                `📌 Phân loại: **${typeText}**\n` +
                `${item.description || "Bí tịch kỹ năng."}`,
            inline: false,
        });
    });

    return embed;
}

async function shop(interaction) {
    return interaction.reply({
        embeds: [buildSkillShopHomeEmbed(interaction)],
        components: [buildCategoryButtons(interaction.user.id)],
    });
}

async function buySkillScrollByButton(interaction) {
    const parts = interaction.customId.split("_");
    const userId = parts[1];
    const itemId = parts.slice(2).join("_");

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

    const result = buyItem(interaction.user.id, itemId, 1);
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
            `📦 Số lượng: **x1**\n` +
            `${coin} Tổng tiền: **${formatMoney(result.totalPrice)}**\n\n` +
            `🎒 Đã cất vào kho đồ. Xem bằng \`/khodo\`.\n` +
            `📖 Chưa mở bí tịch. Tính năng mở sẽ thêm sau.`,
        ephemeral: true,
    });
}

async function handleShopButton(interaction) {
    const parts = interaction.customId.split("_");
    const action = parts[1];
    const userId = parts[2];

    if (interaction.user.id !== userId) {
        return interaction.reply({
            content: "❌ Đây không phải shop kỹ năng của bạn.",
            ephemeral: true,
        });
    }

    if (action === "back") {
        return interaction.update({
            embeds: [buildSkillShopHomeEmbed(interaction)],
            components: [buildCategoryButtons(userId)],
        });
    }

    if (action === "active" || action === "passive") {
        const entries = getSkillShopEntries(action);
        const buyRows = buildBuyButtons(entries, userId);

        return interaction.update({
            embeds: [buildSkillShopListEmbed(interaction, action)],
            components: [buildBackButton(userId), ...buyRows],
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
    const map = {
        F: 5,
        E: 8,
        D: 12,
        C: 18,
        B: 25,
        A: 40,
        S: 80,
    };

    return map[tier] || 5;
}

async function useSkillScroll(interaction) {
    const {
        skillTierNames,
        activeSkills,
        passiveSkills,
    } = require("./config/kynang");

    const { announceRareDrop, isRareSkill } = require("./utils/rareDrop");

    const itemId = interaction.options.getString("bitich");
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

    const consumeResult = consumeShopItem(interaction.user.id, itemId, 1);

    if (!consumeResult.success) {
        return interaction.reply({
            content: `❌ ${consumeResult.message}`,
            ephemeral: true,
        });
    }

    const skillType = item.skillScrollType === "passive" ? "passive" : "active";
    const tier = rollFromTable(item.rollTable || { F: 1 });
    const source = skillType === "active" ? activeSkills : passiveSkills;

    let pool = source.filter((skill) => skill.tier === tier);

    if (pool.length <= 0) {
        pool = source;
    }

    const skill = pickRandomItem(pool);
    let duplicate = false;
    let shardsGained = 0;

    updateTuTienProfile(interaction.user.id, (profile) => {
        const skills = ensureSkillData(profile);
        const list = skill.type === "active" ? skills.active : skills.passive;
        const ownedSkill = list.find((owned) => owned.id === skill.id);

        if (ownedSkill) {
            duplicate = true;
            shardsGained = getDuplicateShards(skill.tier);
            ownedSkill.shards = (ownedSkill.shards || 0) + shardsGained;
        } else {
            list.push({
                id: skill.id,
                type: skill.type,
                tier: skill.tier,
                level: 1,
                shards: 0,
                obtainedAt: Date.now(),
            });
        }
    });

    if (isRareSkill(skill)) {
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

    const tierName = skillTierNames[skill.tier] || skill.tier;
    const typeName = getTypeText(skill.type);

    if (duplicate) {
        return interaction.reply({
            content:
                `📖 ${interaction.user} dùng **${item.emoji || "📜"} ${item.name}**\n\n` +
                `🎲 Phẩm chất: **${skill.tier} - ${tierName}**\n` +
                `📌 Loại: **${typeName}**\n` +
                `${skill.emoji || "✨"} Trùng kỹ năng: **${skill.name}**\n` +
                `🧩 Nhận mảnh kỹ năng: **+${shardsGained}**\n\n` +
                `${skill.description}`,
        });
    }

    return interaction.reply({
        content:
            `📖 ${interaction.user} dùng **${item.emoji || "📜"} ${item.name}**\n\n` +
            `🎲 Phẩm chất: **${skill.tier} - ${tierName}**\n` +
            `📌 Loại: **${typeName}**\n` +
            `${skill.emoji || "✨"} Nhận kỹ năng: **${skill.name}**\n\n` +
            `${skill.description}`,
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
    const skillConfig = require("./config/kynang");

    const active = Array.isArray(skillConfig.activeSkills)
        ? skillConfig.activeSkills
        : [];

    const passive = Array.isArray(skillConfig.passiveSkills)
        ? skillConfig.passiveSkills
        : [];

    return [...active, ...passive];
}

function getSkillDef(skillId) {
    return getAllSkillDefs().find((skill) => skill.id === skillId);
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
                      if (!skill) return `${index + 1}. ❓ ${skillId}`;
                      return `${index + 1}. ${skill.emoji || "⚔️"} **${skill.name}** | ${skill.tier}`;
                  })
                  .join("\n")
            : "Chưa trang bị kỹ năng chủ động.";

    const equippedPassiveText =
        equipped.passive.length > 0
            ? equipped.passive
                  .map((skillId, index) => {
                      const skill = getSkillDef(skillId);
                      if (!skill) return `${index + 1}. ❓ ${skillId}`;
                      return `${index + 1}. ${skill.emoji || "🧘"} **${skill.name}** | ${skill.tier}`;
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
                `🧘 Bị động: **${skills.passive.length}** kỹ năng`,
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
