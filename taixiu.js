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

const taixiuConfig = require("./config/taixiu");

const games = new Map();
const gamesById = new Map();
const tableEditTimers = new Map();
const TABLE_EDIT_DEBOUNCE_MS = 1500;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGameKey(guildId, channelId) {
    return `${guildId}_${channelId}`;
}

function getGameById(gameId) {
    return gamesById.get(gameId) || null;
}

function cleanupGame(game) {
    if (!game) {
        return;
    }

    games.delete(game.key);
    gamesById.delete(game.id);

    const timer = tableEditTimers.get(game.id);

    if (timer) {
        clearTimeout(timer);
        tableEditTimers.delete(game.id);
    }
}

function scheduleTableEdit(game) {
    if (!game || game.closed || !game.message) {
        return;
    }

    if (tableEditTimers.has(game.id)) {
        return;
    }

    const timer = setTimeout(async () => {
        tableEditTimers.delete(game.id);

        if (game.closed || !game.message) {
            return;
        }

        await game.message
            .edit({
                content: buildTableContent(game),
                components: createButtons(game),
            })
            .catch(() => undefined);
    }, TABLE_EDIT_DEBOUNCE_MS);

    tableEditTimers.set(game.id, timer);
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollDice() {
    const results = [];

    for (let i = 0; i < taixiuConfig.dice.amount; i += 1) {
        results.push(randomInt(taixiuConfig.dice.min, taixiuConfig.dice.max));
    }

    return results;
}

function getDiceEmoji(number) {
    const emojis = {
        1: "⚀",
        2: "⚁",
        3: "⚂",
        4: "⚃",
        5: "⚄",
        6: "⚅",
    };

    return emojis[number] || "🎲";
}

function formatDice(results) {
    return results
        .map((number) => `${getDiceEmoji(number)} ${number}`)
        .join(" | ");
}

function getTotal(results) {
    return results.reduce((total, number) => total + number, 0);
}

function getTaiXiu(total) {
    return total >= 11 ? "tai" : "xiu";
}

function getChanLe(total) {
    return total % 2 === 0 ? "chan" : "le";
}

const MAIN_BET_PAYOUT = 2;

const exactNumberPayouts = {
    3: 216,
    4: 72,
    5: 36,
    6: 21.6,
    7: 14.4,
    8: 10.2857,
    9: 8.64,
    10: 8,
    11: 8,
    12: 8.64,
    13: 10.2857,
    14: 14.4,
    15: 21.6,
    16: 36,
    17: 72,
    18: 216,
};

function getBetLabel(betKey) {
    if (taixiuConfig.choices[betKey]) {
        const choice = taixiuConfig.choices[betKey];

        return `${choice.emoji} ${choice.name}`;
    }

    if (betKey.startsWith("so_")) {
        return `🎯 Số ${betKey.replace("so_", "")}`;
    }

    return betKey;
}

function getPayout(betKey) {
    if (taixiuConfig.choices[betKey]) {
        return MAIN_BET_PAYOUT;
    }

    if (betKey.startsWith("so_")) {
        const number = Number.parseInt(betKey.replace("so_", ""), 10);

        return Number(exactNumberPayouts[number] || 0);
    }

    return 0;
}

function isWinningBet(betKey, total) {
    if (betKey === "tai") {
        return getTaiXiu(total) === "tai";
    }

    if (betKey === "xiu") {
        return getTaiXiu(total) === "xiu";
    }

    if (betKey === "chan") {
        return getChanLe(total) === "chan";
    }

    if (betKey === "le") {
        return getChanLe(total) === "le";
    }

    if (betKey.startsWith("so_")) {
        const number = Number.parseInt(betKey.replace("so_", ""), 10);

        return total === number;
    }

    return false;
}

function getRandomRollingDiceText() {
    return formatDice(rollDice());
}

function getBetListText(game) {
    if (game.bets.length <= 0) {
        return "Chưa có ai xuống tiền";
    }

    return game.bets
        .map((bet) => {
            return `<@${bet.userId}> ${getBetLabel(bet.betKey)}: ${formatMoney(bet.amount)}`;
        })
        .join("\n");
}

function createButtons(game, disabled = false) {
    const rows = [];

    const mainRow = new ActionRowBuilder();

    Object.entries(taixiuConfig.choices).forEach(([choiceId, choice]) => {
        mainRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`taixiu_bet_${game.id}_${choiceId}`)
                .setLabel(choice.label)
                .setEmoji(choice.emoji)
                .setStyle(choice.style || ButtonStyle.Primary)
                .setDisabled(disabled),
        );
    });

    rows.push(mainRow);

    const numbers = [];

    for (
        let number = taixiuConfig.exactNumber.min;
        number <= taixiuConfig.exactNumber.max;
        number += 1
    ) {
        numbers.push(number);
    }

    for (let i = 0; i < numbers.length; i += 4) {
        const row = new ActionRowBuilder();

        numbers.slice(i, i + 4).forEach((number) => {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`taixiu_bet_${game.id}_so_${number}`)
                    .setLabel(`Số ${number}`)
                    .setStyle(
                        taixiuConfig.exactNumber.style || ButtonStyle.Primary,
                    )
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
        `💎 **Tài Xỉu Mamu - Nhà cái đến từ lòng đất**\n\n` +
        `Chọn **Tài (11-18)**, **Xỉu (3-10)**, **Chẵn/Lẻ**, hoặc chọn **số tổng 3-18**.\n` +
        `Sau khi chọn, nhập số gold bạn muốn cược.\n\n` +
        `Tỉ lệ trả thưởng:\n` +
        `• Tài/Xỉu/Chẵn/Lẻ: x${MAIN_BET_PAYOUT}\n` +
        `• Số cụ thể: trả thưởng fair payout, house edge 0%\n` +
        `• 3/18 x216, 4/17 x72, 5/16 x36, 6/15 x21.6\n` +
        `• 7/14 x14.4, 8/13 x10.2857, 9/12 x8.64, 10/11 x8\n\n` +
        `⚠️ Lưu ý: Không spam bấm nút đặt cược.\n` +
        `⏳ Bắt đầu sau **${Math.ceil(taixiuConfig.countdownMs / 1000)} giây**\n\n` +
        `${coin} **Danh sách cược:**\n${getBetListText(game)}`
    );
}

function createBetModal(gameId, betKey) {
    const modal = new ModalBuilder()
        .setCustomId(`taixiu_modal_${gameId}_${betKey}`)
        .setTitle("Nhập số tiền để cược");

    const input = new TextInputBuilder()
        .setCustomId("amount")
        .setLabel(
            `Số tiền muốn cược, tối đa ${formatMoney(taixiuConfig.maxBet)}`,
        )
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(12)
        .setPlaceholder("Ví dụ: 1000");

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    return modal;
}

class TaiXiuManager {
    async start(interaction) {
        const key = getGameKey(interaction.guildId, interaction.channelId);

        if (games.has(key)) {
            return interaction.reply({
                content: taixiuConfig.messages.alreadyRunning,
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
        gamesById.set(game.id, game);

        await interaction.reply({
            content: buildTableContent(game),
            components: createButtons(game),
        });

        const gameMessage = await interaction.fetchReply();
        game.message = gameMessage;
        game.messageId = gameMessage.id;

        setTimeout(() => {
            this.run(interaction, gameMessage, game).catch((error) => {
                console.error(error);
                cleanupGame(game);
            });
        }, taixiuConfig.countdownMs);

        return undefined;
    }

    async autocomplete(interaction) {
        return interaction.respond([]);
    }

    async handleButton(interaction) {
        if (!interaction.customId.startsWith("taixiu_bet_")) {
            return undefined;
        }

        const parts = interaction.customId.split("_");
        const gameId = parts[2];
        const betKey = parts.slice(3).join("_");

        const game = getGameById(gameId);

        if (!game || game.closed) {
            return interaction.reply({
                content: taixiuConfig.messages.closed,
                ephemeral: true,
            });
        }

        return interaction.showModal(createBetModal(gameId, betKey));
    }

    async handleModal(interaction) {
        if (!interaction.customId.startsWith("taixiu_modal_")) {
            return undefined;
        }

        const parts = interaction.customId.split("_");
        const gameId = parts[2];
        const betKey = parts.slice(3).join("_");

       const game = getGameById(gameId);

        if (!game || game.closed) {
            return interaction.reply({
                content: taixiuConfig.messages.closed,
                ephemeral: true,
            });
        }

        const rawAmount = interaction.fields.getTextInputValue("amount");
        const amount = Number.parseInt(rawAmount.replace(/[^\d]/g, ""), 10);
        const user = getUser(interaction.user.id);

        if (
            !amount ||
            amount < taixiuConfig.minBet ||
            amount > taixiuConfig.maxBet
        ) {
            return interaction.reply({
                content: taixiuConfig.messages.invalidBet,
                ephemeral: true,
            });
        }

        if (user.money < amount) {
            return interaction.reply({
                content:
                    `${taixiuConfig.messages.notEnoughMoney}\n` +
                    `Cần: ${formatMoney(amount)}`,
                ephemeral: true,
            });
        }

        addMoney(interaction.user.id, -amount);

        game.bets.push({
            userId: interaction.user.id,
            betKey,
            amount,
        });

        await interaction.reply({
            content: `✅ Đã cược ${formatMoney(amount)} vào ${getBetLabel(betKey)}`,
            ephemeral: true,
        });
        scheduleTableEdit(game);
        return undefined;
    }

    async run(interaction, gameMessage, game) {
        game.closed = true;
        cleanupGame(game);

        if (game.bets.length <= 0) {
            return gameMessage.edit({
                content: "🏁 Bàn tài xỉu hủy vì không ai xuống tiền",
                components: createButtons(game, true),
            });
        }

        await gameMessage.edit({
            content:
                `🎲 Bàn tài xỉu đã khóa cược\n\n` +
                `${getBetListText(game)}\n\n` +
                `🥣 Đang úp bát...`,
            components: createButtons(game, true),
        });

        const results = rollDice();

        for (const frame of taixiuConfig.effect.frames) {
            await sleep(taixiuConfig.effect.rollingDelayMs);

            await gameMessage.edit({
                content:
                    `🎲 Bàn tài xỉu đã khóa cược\n\n` +
                    `${getBetListText(game)}\n\n` +
                    `${frame}\n` +
                    `🎲 ${getRandomRollingDiceText()}`,
                components: createButtons(game, true),
            });
        }

        await sleep(taixiuConfig.effect.openDelayMs);

        await gameMessage.edit({
            content:
                `🥣 Mở bát...\n\n` +
                `🎲 ${getDiceEmoji(results[0])} ${results[0]} | ❔ | ❔`,
            components: createButtons(game, true),
        });

        await sleep(taixiuConfig.effect.openDelayMs);

        await gameMessage.edit({
            content:
                `🥣 Mở bát...\n\n` +
                `🎲 ${getDiceEmoji(results[0])} ${results[0]} | ${getDiceEmoji(results[1])} ${results[1]} | ❔`,
            components: createButtons(game, true),
        });

        await sleep(taixiuConfig.effect.openDelayMs);

        const total = getTotal(results);
        const taiXiuResult = getTaiXiu(total);
        const chanLeResult = getChanLe(total);
        const resultLines = [];

        for (const bet of game.bets) {
            const win = isWinningBet(bet.betKey, total);
            const payout = getPayout(bet.betKey);
            const receive = win ? Math.floor(bet.amount * payout) : 0;
            const net = receive - bet.amount;

            if (win) {
                addMoney(bet.userId, receive);
                addWin(bet.userId);
            } else {
                addLoss(bet.userId);
            }

            resultLines.push(
                `<@${bet.userId}> ${getBetLabel(bet.betKey)} ` +
                    `${win ? `ăn ${formatMoney(net)}` : `bay ${formatMoney(bet.amount)}`}`,
            );
        }

        return gameMessage.edit({
            content:
                `🎲 Kết quả: ${formatDice(results)}\n` +
                `📊 Tổng: **${total}** | **${taixiuConfig.choices[taiXiuResult].name} - ${taixiuConfig.choices[chanLeResult].name}**\n\n` +
                `${resultLines.join("\n")}\n\n` +
                `🏁 Xong kèo, đời là thế thôi`,
            components: createButtons(game, true),
        });
    }
}

module.exports = new TaiXiuManager();
