const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require("discord.js");

const {
    getUser,
    addMoney,
    addWin,
    addLoss,
    formatMoney,
    getCurrencyEmoji,
} = require("./database");

const baucuaConfig = require("./config/baucua");

const games = new Map();

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGameKey(guildId, channelId) {
    return `${guildId}_${channelId}`;
}

function getItems() {
    return Object.entries(baucuaConfig.items);
}

function pickRandomItem() {
    const items = getItems();
    const [id, item] = items[Math.floor(Math.random() * items.length)];

    return {
        id,
        ...item,
    };
}

function rollBauCua() {
    return [pickRandomItem(), pickRandomItem(), pickRandomItem()];
}

function countMatches(results, pickedId) {
    return results.filter((item) => item.id === pickedId).length;
}

function formatResultSlot(item) {
    if (!item) {
        return "❔";
    }

    return item.emoji;
}

function formatResultName(item) {
    return `${item.emoji} ${item.name}`;
}

function getRandomRollingText() {
    return rollBauCua().map(formatResultSlot).join(" | ");
}

function getBetLabel(itemId) {
    const item = baucuaConfig.items[itemId];

    if (!item) {
        return itemId;
    }

    return `${item.emoji} ${item.name}`;
}

function getBetListText(game) {
    if (game.bets.length <= 0) {
        return "Chưa có ai xuống tiền";
    }

    return game.bets
        .map((bet) => {
            return `<@${bet.userId}> ${getBetLabel(bet.itemId)}: ${formatMoney(bet.amount)}`;
        })
        .join("\n");
}

function createButtons(game, disabled = false) {
    const rows = [];
    const entries = getItems();

    for (let i = 0; i < entries.length; i += 3) {
        const row = new ActionRowBuilder();

        entries.slice(i, i + 3).forEach(([itemId, item]) => {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`baucua_bet_${game.id}_${itemId}`)
                    .setLabel(item.name)
                    .setEmoji(item.emoji)
                    .setStyle(item.style || ButtonStyle.Primary)
                    .setDisabled(disabled),
            );
        });

        rows.push(row);
    }

    return rows;
}

function buildTableContent(game) {
    const coin = getCurrencyEmoji();

    return (
        `🦀 **Bầu Cua Mamu - Nhà cái mõm nhưng uy tín**\n\n` +
        `Bấm chọn **Bầu/Cua/Tôm/Cá/Gà/Nai**, sau đó nhập số tiền muốn cược.\n` +
        `Một người có thể đặt nhiều cửa, mỗi lần bấm là một vé cược riêng.\n\n` +
        `Tỉ lệ trả thưởng:\n` +
        `• Ra 0 con: mất cược\n` +
        `• Ra 1 con: nhận x2 tổng cược  \n` +
        `• Ra 2 con: nhận x3 tổng cược  \n` +
        `• Ra 3 con: nhận x4 tổng cược  \n\n` +
        `⏳ Mở bát sau **${Math.ceil(baucuaConfig.countdownMs / 1000)} giây**\n\n` +
        `${coin} **Danh sách cược:**\n${getBetListText(game)}`
    );
}

function createBetModal(gameId, itemId) {
    const item = baucuaConfig.items[itemId];

    const modal = new ModalBuilder()
        .setCustomId(`baucua_modal_${gameId}_${itemId}`)
        .setTitle(`Cược ${item.name}`);

    const input = new TextInputBuilder()
        .setCustomId("amount")
        .setLabel(
            `Số tiền muốn cược, tối đa ${formatMoney(baucuaConfig.maxBet)}`,
        )
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(12)
        .setPlaceholder("Ví dụ: 1000");

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    return modal;
}

class BauCuaManager {
    async start(interaction) {
        const key = getGameKey(interaction.guildId, interaction.channelId);

        if (games.has(key)) {
            return interaction.reply({
                content: baucuaConfig.messages.alreadyRunning,
                ephemeral: true,
            });
        }

        const game = {
            id: `${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
            key,
            bets: [],
            closed: false,
        };

        games.set(key, game);

        await interaction.reply({
            content: buildTableContent(game),
            components: createButtons(game),
        });

        const gameMessage = await interaction.fetchReply();

        game.messageId = gameMessage.id;
        game.channelId = interaction.channelId;

        setTimeout(() => {
            this.run(interaction, gameMessage, game).catch((error) => {
                console.error(error);
                games.delete(key);
            });
        }, baucuaConfig.countdownMs);

        return undefined;
    }

    async handleButton(interaction) {
        if (!interaction.customId.startsWith("baucua_bet_")) {
            return undefined;
        }

        const parts = interaction.customId.split("_");
        const gameId = parts[2];
        const itemId = parts[3];

        const game = Array.from(games.values()).find(
            (item) => item.id === gameId,
        );

        if (!game || game.closed) {
            return interaction.reply({
                content: baucuaConfig.messages.closed,
                ephemeral: true,
            });
        }

        if (!baucuaConfig.items[itemId]) {
            return interaction.reply({
                content: "❌ Con này không có trong mâm",
                ephemeral: true,
            });
        }

        return interaction.showModal(createBetModal(gameId, itemId));
    }

    async handleModal(interaction) {
        if (!interaction.customId.startsWith("baucua_modal_")) {
            return undefined;
        }

        const parts = interaction.customId.split("_");
        const gameId = parts[2];
        const itemId = parts[3];

        const game = Array.from(games.values()).find(
            (item) => item.id === gameId,
        );

        if (!game || game.closed) {
            return interaction.reply({
                content: baucuaConfig.messages.closed,
                ephemeral: true,
            });
        }

        const rawAmount = interaction.fields.getTextInputValue("amount");
        const amount = Number.parseInt(rawAmount.replace(/[^\d]/g, ""), 10);
        const user = getUser(interaction.user.id);

        if (
            !amount ||
            amount < baucuaConfig.minBet ||
            amount > baucuaConfig.maxBet
        ) {
            return interaction.reply({
                content: baucuaConfig.messages.invalidBet,
                ephemeral: true,
            });
        }

        if (user.money < amount) {
            return interaction.reply({
                content:
                    `${baucuaConfig.messages.notEnoughMoney}\n` +
                    `Cần: ${formatMoney(amount)}`,
                ephemeral: true,
            });
        }

        addMoney(interaction.user.id, -amount);

        game.bets.push({
            userId: interaction.user.id,
            itemId,
            amount,
        });

        await interaction.reply({
            content: `✅ Đã cược ${formatMoney(amount)} vào ${getBetLabel(itemId)}`,
            ephemeral: true,
        });
        const message = await interaction.channel.messages
            .fetch(game.messageId)
            .catch(() => null);
            
        if (message) {
            await message.edit({
                content: buildTableContent(game),
                components: createButtons(game),
            });
        }

        return undefined;
    }

    async run(interaction, gameMessage, game) {
        game.closed = true;
        games.delete(game.key);

        if (game.bets.length <= 0) {
            return gameMessage.edit({
                content: "🏁 Bàn bầu cua hủy vì không ai xuống tiền",
                components: createButtons(game, true),
            });
        }

        await gameMessage.edit({
            content:
                `🎲 Bàn bầu cua đã khóa cược\n\n` +
                `${getBetListText(game)}\n\n` +
                `🥣 Đang úp bát...`,
            components: createButtons(game, true),
        });

        const results = rollBauCua();

        for (const frame of baucuaConfig.effect.frames) {
            await sleep(baucuaConfig.effect.rollingDelayMs);

            await gameMessage.edit({
                content:
                    `🎲 Bàn bầu cua đã khóa cược\n\n` +
                    `${getBetListText(game)}\n\n` +
                    `${frame}\n` +
                    `🧧 ${getRandomRollingText()}`,
                components: createButtons(game, true),
            });
        }

        await sleep(baucuaConfig.effect.openDelayMs);

        await gameMessage.edit({
            content:
                `🥣 Mở bát...\n\n` +
                `🎲 ${formatResultSlot(results[0])} | ❔ | ❔`,
            components: createButtons(game, true),
        });

        await sleep(baucuaConfig.effect.openDelayMs);

        await gameMessage.edit({
            content:
                `🥣 Mở bát...\n\n` +
                `🎲 ${formatResultSlot(results[0])} | ${formatResultSlot(results[1])} | ❔`,
            components: createButtons(game, true),
        });

        await sleep(baucuaConfig.effect.openDelayMs);

        const resultText = results.map(formatResultName).join(" | ");
        const resultLines = [];

        for (const bet of game.bets) {
            const matchCount = countMatches(results, bet.itemId);
            const receive =
                matchCount > 0 ? Math.floor(bet.amount * (matchCount + 1)) : 0;

            if (receive > 0) {
                addMoney(bet.userId, receive);
                addWin(bet.userId);

                resultLines.push(
                    `<@${bet.userId}> ${getBetLabel(bet.itemId)} ` +
                        `trúng ${matchCount} | nhận ${formatMoney(receive)}`,
                );
            } else {
                addLoss(bet.userId);

                resultLines.push(
                    `<@${bet.userId}> ${getBetLabel(bet.itemId)} ` +
                        `trật | bay ${formatMoney(bet.amount)}`,
                );
            }
        }

        return gameMessage.edit({
            content:
                `🎲 Kết quả: ${resultText}\n\n` +
                `${resultLines.join("\n")}\n\n` +
                `🏁 Xong kèo, đời là thế thôi`,
            components: createButtons(game, true),
        });
    }
}

module.exports = new BauCuaManager();
