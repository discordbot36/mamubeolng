const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const { announceRareDrop, isRareGem } = require("./utils/rareDrop");

const {
    getInventory,
    getShop,
    consumeShopItem,
    addInventoryItem,
    formatMoney,
    getSystemValue,
    setSystemValue,
} = require("./database");

const dothachConfig = require("./config/dothach");
const BLESSING_ITEM_ID =
    dothachConfig.blessing?.itemId || "loi_chuc_phuc_thien_dao";
const CHANNEL_BLESSING_KEY = "dothach_channel_blessings";
const GUILD_BLESSING_COOLDOWN_KEY = "dothach_blessing_guild_cooldowns";
const BLESSING_GUILD_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const sessions = new Map();

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createSessionId() {
    return `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

function getStoneConfig(stoneId) {
    return dothachConfig.stones[stoneId];
}

function getAvailableStoneEntries() {
    const shop = getShop();

    return Object.entries(dothachConfig.stones).filter(([stoneId]) => {
        return Boolean(shop[stoneId]);
    });
}

function createMachineButtons(sessionId, disabled = false) {
    const row = new ActionRowBuilder();

    dothachConfig.machines.forEach((machine, index) => {
        const button = new ButtonBuilder()
            .setCustomId(`dothach_pick_${sessionId}_${index}`)
            .setLabel(machine.name)
            .setStyle(machine.style || ButtonStyle.Primary)
            .setDisabled(disabled);

        if (machine.emoji) {
            button.setEmoji(machine.emoji);
        }

        row.addComponents(button);
    });

    return row;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getBlessedGemChance(gemId, chance, blessingActive = false) {
    if (!blessingActive) {
        return Number(chance || 0);
    }

    const multipliers = dothachConfig.blessing?.gemChanceMultipliers || {};
    const multiplier = Number(multipliers[gemId] || 1);

    return Number(chance || 0) * multiplier;
}

function pickWeightedGem(stone, blessingActive = false) {
    const entries = Object.entries(stone.gemChances || {}).map(
        ([gemId, chance]) => {
            return [gemId, getBlessedGemChance(gemId, chance, blessingActive)];
        },
    );

    const totalChance = entries.reduce((total, [, chance]) => {
        return total + chance;
    }, 0);

    if (entries.length <= 0 || totalChance <= 0) {
        const fallbackGemId = Object.keys(dothachConfig.gems)[0];

        return {
            id: fallbackGemId,
            ...dothachConfig.gems[fallbackGemId],
        };
    }

    let roll = Math.random() * totalChance;

    for (const [gemId, chance] of entries) {
        roll -= chance;

        if (roll <= 0) {
            return {
                id: gemId,
                ...dothachConfig.gems[gemId],
            };
        }
    }

    const fallbackGemId = entries[entries.length - 1][0];

    return {
        id: fallbackGemId,
        ...dothachConfig.gems[fallbackGemId],
    };
}

function rollPurity(stone, blessingActive = false) {
    const blessing = dothachConfig.blessing || {};
    const perfectChance =
        Number(dothachConfig.perfectPurityChance || 0) +
        (blessingActive ? Number(blessing.perfectPurityBonusChance || 0) : 0);

    if (Math.random() < perfectChance) {
        return 100;
    }

    const purityBonus =
        Number(stone.purityBonus || 0) +
        (blessingActive ? Number(blessing.purityBonus || 0) : 0);

    const purity = randomInt(0, 99) + purityBonus;

    return clamp(purity, 0, 99);
}

function getPurityGrade(purity) {
    return dothachConfig.purityGrades.find((grade) => {
        return purity >= grade.min && purity <= grade.max;
    });
}

function calculateGemValue(gem, grade) {
    const value = Math.floor((gem.baseValue || 0) * (grade.multiplier || 0));

    return Math.max(1, value);
}

function createResult(stone, blessingActive = false) {
    const gem = pickWeightedGem(stone, blessingActive);
    const purity = rollPurity(stone, blessingActive);
    const grade = getPurityGrade(purity);
    const value = calculateGemValue(gem, grade);
    const finalName = `${gem.name} ${grade.name}`;

    return {
        gem,
        purity,
        grade,
        value,
        finalName,
    };
}
function getChannelBlessings() {
    const blessings = getSystemValue(CHANNEL_BLESSING_KEY);

    if (
        !blessings ||
        typeof blessings !== "object" ||
        Array.isArray(blessings)
    ) {
        return {};
    }

    return blessings;
}

function cleanupExpiredChannelBlessings() {
    const now = Date.now();
    const blessings = getChannelBlessings();
    let changed = false;

    for (const [channelId, blessing] of Object.entries(blessings)) {
        if (Number(blessing?.expiresAt || 0) <= now) {
            delete blessings[channelId];
            changed = true;
        }
    }

    if (changed) {
        setSystemValue(CHANNEL_BLESSING_KEY, blessings);
    }

    return blessings;
}

function getActiveChannelBlessing(channelId) {
    const blessings = cleanupExpiredChannelBlessings();
    const blessing = blessings[String(channelId)];

    if (!blessing || Number(blessing.expiresAt || 0) <= Date.now()) {
        return null;
    }

    return blessing;
}

function setChannelBlessing(channelId, activatedBy) {
    const now = Date.now();
    const blessings = cleanupExpiredChannelBlessings();
    const durationMs = Number(
        dothachConfig.blessing?.durationMs || 30 * 60 * 1000,
    );

    blessings[String(channelId)] = {
        channelId: String(channelId),
        activatedBy: String(activatedBy),
        activatedAt: now,
        expiresAt: now + durationMs,
    };

    setSystemValue(CHANNEL_BLESSING_KEY, blessings);

    return blessings[String(channelId)];
}
function getGuildBlessingCooldowns() {
    const cooldowns = getSystemValue(GUILD_BLESSING_COOLDOWN_KEY);

    if (
        !cooldowns ||
        typeof cooldowns !== "object" ||
        Array.isArray(cooldowns)
    ) {
        return {};
    }

    return cooldowns;
}

function getGuildBlessingCooldown(guildId) {
    const cooldowns = getGuildBlessingCooldowns();
    const until = Number(cooldowns[String(guildId)] || 0);

    return until > Date.now() ? until : 0;
}

function setGuildBlessingCooldown(guildId) {
    const cooldowns = getGuildBlessingCooldowns();

    cooldowns[String(guildId)] = Date.now() + BLESSING_GUILD_COOLDOWN_MS;

    setSystemValue(GUILD_BLESSING_COOLDOWN_KEY, cooldowns);
}

function formatBlessingLine(channelId) {
    const blessing = getActiveChannelBlessing(channelId);

    if (!blessing) {
        return "";
    }

    return (
        `\n🌌 **Lời Chúc Phúc Của Thiên Đạo đang phủ kênh này** ` +
        `(còn **${formatTimeLeft(Number(blessing.expiresAt || 0) - Date.now())}**)`
    );
}
function formatTimeLeft(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes <= 0) {
        return `${seconds} giây`;
    }

    return `${minutes} phút ${seconds} giây`;
}

class DoThachManager {
    autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const inventory = getInventory(interaction.user.id);

        const choices = getAvailableStoneEntries()
            .filter(([stoneId, stone]) => {
                const amount = inventory.shopItems[stoneId] || 0;

                if (amount <= 0) {
                    return false;
                }

                return (
                    stoneId.toLowerCase().includes(focusedValue) ||
                    stone.name.toLowerCase().includes(focusedValue)
                );
            })
            .slice(0, 25)
            .map(([stoneId, stone]) => {
                const amount = inventory.shopItems[stoneId] || 0;

                return {
                    name: `${stone.name} x${amount}`,
                    value: stoneId,
                };
            });

        return interaction.respond(choices);
    }

    async start(interaction) {
        const stoneId = interaction.options.getString("da");
        const stone = getStoneConfig(stoneId);
        const inventory = getInventory(interaction.user.id);

        if (!stone) {
            return interaction.reply({
                content: dothachConfig.messages.invalidStone,
                ephemeral: true,
            });
        }

        if (
            !inventory.shopItems[stoneId] ||
            inventory.shopItems[stoneId] <= 0
        ) {
            return interaction.reply({
                content: dothachConfig.messages.noStone,
                ephemeral: true,
            });
        }

        const sessionId = createSessionId();
        const blackMachineIndex = randomInt(
            0,
            dothachConfig.machines.length - 1,
        );

        sessions.set(sessionId, {
            userId: interaction.user.id,
            channelId: interaction.channelId,
            stoneId,
            blackMachineIndex,
            createdAt: Date.now(),
        });

        return interaction.reply({
            content:
                `${interaction.user} chuẩn bị đổ thạch\n\n` +
                `${stone.emoji || "🪨"} Đá: **${stone.name}**${formatBlessingLine(interaction.channelId)}\n` +
                `🔪 Chọn 1 trong ${dothachConfig.machines.length} máy để cắt đá\n` +
                `💀 Có 1 máy đen, chọn trúng là nổ mất đá`,
            components: [createMachineButtons(sessionId)],
        });
    }
    rollTemporaryResult(stoneId = "da_mamu", blessingActive = false) {
        const stone = getStoneConfig(stoneId);

        if (!stone) {
            return null;
        }

        return createResult(stone, blessingActive);
    }

    async activateBlessing(interaction) {
        const targetChannel =
            interaction.options.getChannel("kenh") || interaction.channel;

        if (!targetChannel) {
            return interaction.reply({
                content: "❌ Không tìm thấy kênh để chúc phúc.",
                ephemeral: true,
            });
        }

        const activeBlessing = getActiveChannelBlessing(targetChannel.id);

        if (activeBlessing) {
            return interaction.reply({
                content:
                    `❌ Kênh ${targetChannel} đang có **Lời Chúc Phúc Của Thiên Đạo** rồi.\n` +
                    `⏳ Còn hiệu lực: <t:${Math.floor(Number(activeBlessing.expiresAt || 0) / 1000)}:R>\n` +
                    `Không thể cộng dồn thời gian.`,
                ephemeral: true,
            });
        }

        const cooldownUntil = getGuildBlessingCooldown(interaction.guildId);

        if (cooldownUntil) {
            return interaction.reply({
                content:
                    `❌ Server này đã dùng **Lời Chúc Phúc Của Thiên Đạo** gần đây.\n` +
                    `⏳ Có thể dùng lại: <t:${Math.floor(cooldownUntil / 1000)}:R>`,
                ephemeral: true,
            });
        }

        const consumeResult = consumeShopItem(
            interaction.user.id,
            BLESSING_ITEM_ID,
            1,
        );

        if (!consumeResult.success) {
            return interaction.reply({
                content:
                    `❌ Bạn cần có **Lời Chúc Phúc Của Thiên Đạo** để buff kênh.\n` +
                    `Mua bằng: \`/mua vatpham:${BLESSING_ITEM_ID} soluong:1\``,
                ephemeral: true,
            });
        }

        const blessing = setChannelBlessing(
            targetChannel.id,
            interaction.user.id,
        );

        setGuildBlessingCooldown(interaction.guildId);

        return interaction.reply({
            content:
                `🌌 ${interaction.user} đã dùng **Lời Chúc Phúc Của Thiên Đạo**.\n` +
                `Kênh ${targetChannel} được buff tỉ lệ đổ thạch trong **30 phút**.\n` +
                `⏳ Hết hiệu lực: <t:${Math.floor(Number(blessing.expiresAt || 0) / 1000)}:R>\n` +
                `🕛 Server có thể dùng lại sau **12 tiếng**.`,
        });
    }
    async handleButton(interaction) {
        if (!interaction.customId.startsWith("dothach_pick_")) {
            return undefined;
        }

        const parts = interaction.customId.split("_");
        const machineIndex = Number.parseInt(parts.pop(), 10);
        const sessionId = parts.slice(2).join("_");
        const session = sessions.get(sessionId);

        if (!session) {
            return interaction.reply({
                content: dothachConfig.messages.expired,
                ephemeral: true,
            });
        }

        if (interaction.user.id !== session.userId) {
            return interaction.reply({
                content: dothachConfig.messages.notYourSession,
                ephemeral: true,
            });
        }

        const stone = getStoneConfig(session.stoneId);

        if (!stone) {
            sessions.delete(sessionId);

            return interaction.update({
                content: dothachConfig.messages.invalidStone,
                components: [createMachineButtons(sessionId, true)],
            });
        }

        const consumeResult = consumeShopItem(
            interaction.user.id,
            session.stoneId,
            1,
        );

        sessions.delete(sessionId);

        if (!consumeResult.success) {
            return interaction.update({
                content: `❌ ${consumeResult.message}`,
                components: [createMachineButtons(sessionId, true)],
            });
        }

        const machine = dothachConfig.machines[machineIndex];

        if (machineIndex === session.blackMachineIndex) {
            return interaction.update({
                content:
                    `${interaction.user} chọn **${machine.name}**\n\n` +
                    `${stone.emoji || "🪨"} Đá: **${stone.name}**\n` +
                    `${dothachConfig.messages.exploded}`,
                components: [createMachineButtons(sessionId, true)],
            });
        }

        const userId = interaction.user.id;
        const stoneId = session.stoneId;
        const cutDelayMs = dothachConfig.cutDelayMs || 30_000;

        await interaction.update({
            content:
                `${interaction.user} chọn **${machine.name}**\n\n` +
                `🔪 Máy bắt đầu cưa đá\n` +
                `${stone.emoji || "🪨"} Đá: **${stone.name}**\n` +
                `⏳ Thời gian cưa: **${formatTimeLeft(cutDelayMs)}**\n\n` +
                `Cưa xong bot sẽ tự bỏ thành phẩm vào kho đồ.`,
            components: [createMachineButtons(sessionId, true)],
        });

        setTimeout(async () => {
            try {
                const freshStone = getStoneConfig(stoneId);

                if (!freshStone) {
                    return interaction.followUp({
                        content:
                            `<@${userId}>\n` +
                            `❌ Đá đang cưa không còn tồn tại trong config.`,
                    });
                }

                const blessingActive = Boolean(
                    getActiveChannelBlessing(session.channelId),
                );
                const result = createResult(freshStone, blessingActive);

                const gemItem = {
                    id: `dothach_${stoneId}_${result.gem.id}_${result.grade.name}`,
                    name: result.finalName,
                    emoji: result.gem.emoji || freshStone.emoji || "🪨",
                    type: "dothach",
                    sourceStoneId: stoneId,
                    sourceStoneName: freshStone.name,
                    gemId: result.gem.id,
                    gemName: result.gem.name,
                    gradeName: result.grade.name,
                    purity: result.purity,
                    value: result.value,
                };

                addInventoryItem(userId, gemItem);

                if (isRareGem(gemItem)) {
                    await announceRareDrop(interaction.client, {
                        user: `<@${userId}>`,
                        emoji: gemItem.emoji || "💎",
                        name: gemItem.name || gemItem.gemName || "Ngọc hiếm",
                        detail:
                            `💎 Loại: **${gemItem.gemName || "Không rõ"}**\n` +
                            `✨ Độ tinh khiết: **${gemItem.purity || 0}%**\n` +
                            `🏷️ Phẩm: **${gemItem.gradeName || "Không rõ"}**\n` +
                            `💰 Định giá: **${formatMoney(gemItem.value || 0)}**`,
                    });
                }

                return interaction.followUp({
                    content:
                        `<@${userId}> cưa đá xong rồi\n\n` +
                        `${result.gem.emoji || freshStone.emoji || "🪨"} Thành phẩm: **${result.finalName}**\n` +
                        `✨ Độ tinh khiết: **${result.purity}%**\n` +
                        `🏷️ Phẩm: **${result.grade.name}**\n` +
                        `💰 Giá trị: **${formatMoney(result.value)}**\n\n` +
                        `Đã tự bỏ vào kho đồ.`,
                });
            } catch (error) {
                console.error(error);

                return interaction.followUp({
                    content:
                        `<@${userId}>\n` +
                        `❌ Có lỗi khi nhận thành phẩm đổ thạch.`,
                });
            }
        }, cutDelayMs);

        return undefined;
    }
}

module.exports = new DoThachManager();
