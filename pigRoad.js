const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");

const {
    getBalance,
    addMoney,
    removeMoney,
    getCurrencyEmoji,
    formatMoney,
} = require("./database");
const { GAMBLE_MAX_BET } = require("./config/gamble");
const activeGames = new Map();

const DIFFICULTIES = {
    easy: {
        name: "Dễ",
        emoji: "🟢",
        multipliers: [
            1.09, 1.22, 1.38, 1.58, 1.82, 2.0, 2.49, 2.96, 3.56, 4.34,
        ],
    },
    normal: {
        name: "Thường",
        emoji: "🟡",
        multipliers: [
            1.12, 1.33, 1.61, 2.0, 2.48, 3.18, 4.16, 5.62, 7.82, 11.26,
        ],
    },
    hard: {
        name: "Khó",
        emoji: "🔴",
        multipliers: [
            1.16, 1.47, 2.0, 2.61, 3.66, 5.34, 8.13, 13.0, 22.07, 40.28,
        ],
    },
    hell: {
        name: "Địa ngục",
        emoji: "💀",
        multipliers: [
            1.25, 2.0, 2.94, 4.99, 9.27, 19.01, 43.7, 115.0, 361.0, 1450.0,
        ],
    },
};

function formatNumber(value) {
    return Number(value || 0).toLocaleString("vi-VN");
}

function getDifficulty(key) {
    return DIFFICULTIES[key] || DIFFICULTIES.normal;
}

function getCurrentMultiplier(game) {
    if (game.step <= 0) {
        return 1;
    }

    return (
        game.difficulty.multipliers[game.step - 1] ||
        game.difficulty.multipliers.at(-1)
    );
}

function getCashoutAmount(game) {
    return Math.floor(game.bet * getCurrentMultiplier(game));
}

function getCrashChance(game) {
    const RTP = 0.78;

    const previousMultiplier =
        game.step <= 0
            ? 1
            : game.difficulty.multipliers[game.step - 1] ||
              game.difficulty.multipliers.at(-1);

    const nextMultiplier =
        game.difficulty.multipliers[game.step] ||
        game.difficulty.multipliers.at(-1);

    const previousSurvivalChance =
        game.step <= 0 ? 1 : Math.min(1, RTP / previousMultiplier);

    const nextSurvivalChance = Math.min(1, RTP / nextMultiplier);

    const conditionalSurvivalChance =
        previousSurvivalChance <= 0
            ? 0
            : nextSurvivalChance / previousSurvivalChance;

    const crashChance = 1 - conditionalSurvivalChance;

    return Math.max(0.04, Math.min(0.97, crashChance));
}
function renderRoad(game, crashed = false) {
    const total = game.difficulty.multipliers.length;
    const cells = [];

    for (let i = 0; i < total; i += 1) {
        if (crashed && i === game.step) {
            cells.push("💥");
        } else if (i < game.step) {
            cells.push("✅");
        } else if (i === game.step) {
            cells.push("🐷");
        } else {
            cells.push("⬛");
        }
    }

    return cells.join("");
}

function buildEmbed(user, game, status = "playing") {
    const coin = getCurrencyEmoji();
    const multiplier = getCurrentMultiplier(game);
    const cashout = getCashoutAmount(game);
    const nextMultiplier =
        game.difficulty.multipliers[game.step] ||
        game.difficulty.multipliers.at(-1);

    let color = 0xf1c40f;
    let title = "🐷 HEO QUA ĐƯỜNG";
    let statusText =
        "Bấm **Đi tiếp** để qua làn tiếp theo, hoặc **Dừng** để nhận tiền.";

    if (status === "win") {
        color = 0x2ecc71;
        title = "✅ HEO ĐÃ QUA ĐƯỜNG AN TOÀN";
        statusText = `Bạn đã dừng đúng lúc và nhận **${coin} ${formatMoney(cashout)}**.`;
    }

    if (status === "lose") {
        color = 0xe74c3c;
        title = "💥 HEO BỊ XE TÔNG";
        statusText = `Bạn mất tiền cược **${coin} ${formatMoney(game.bet)}**.`;
    }

    if (status === "max") {
        color = 0x9b59b6;
        title = "🏆 HEO QUA HẾT ĐƯỜNG";
        statusText = `Bạn đã qua hết đường và nhận **${coin} ${formatMoney(cashout)}**.`;
    }

    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(
            `👤 Người chơi: **${user.displayName || user.username}**\n` +
                `🎮 Chế độ: ${game.difficulty.emoji} **${game.difficulty.name}**\n` +
                `💰 Cược: **${coin} ${formatMoney(game.bet)}**\n\n` +
                `${renderRoad(game, status === "lose")}\n\n` +
                `📍 Làn đã qua: **${game.step}/${game.difficulty.multipliers.length}**\n` +
                `📈 Multiplier hiện tại: **x${multiplier.toFixed(2)}**\n` +
                `🎁 Cashout hiện tại: **${coin} ${formatMoney(cashout)}**\n` +
                `➡️ Multiplier làn tiếp: **x${nextMultiplier.toFixed(2)}**\n\n` +
                statusText,
        )
        .setTimestamp();
}

function buildButtons(userId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`pigroad_next_${userId}`)
            .setLabel("Đi tiếp")
            .setEmoji("🐷")
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),

        new ButtonBuilder()
            .setCustomId(`pigroad_cashout_${userId}`)
            .setLabel("Dừng")
            .setEmoji("💰")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled),
    );
}

function endGame(userId) {
    activeGames.delete(userId);
}

class PigRoadManager {
    async start(interaction) {
        const bet = interaction.options.getInteger("cuoc");
        const difficultyKey =
            interaction.options.getString("chedo") || "normal";
        const difficulty = getDifficulty(difficultyKey);
        const userId = interaction.user.id;

        if (!Number.isInteger(bet) || bet <= 0) {
            return interaction.reply({
                content: "❌ Số tiền cược không hợp lệ.",
                ephemeral: true,
            });
        }
        if (bet > GAMBLE_MAX_BET) {
            return interaction.reply({
                content: `❌ Số tiền cược tối đa là **${getCurrencyEmoji()} ${formatMoney(GAMBLE_MAX_BET)}**.`,
                ephemeral: true,
            });
        }
        if (activeGames.has(userId)) {
            return interaction.reply({
                content: "❌ Bạn đang có một ván heo qua đường chưa kết thúc.",
                ephemeral: true,
            });
        }

        const balance = getBalance(userId);

        if (balance < bet) {
            return interaction.reply({
                content:
                    `❌ Không đủ tiền.\n` +
                    `💰 Số dư: **${getCurrencyEmoji()} ${formatMoney(balance)}**`,
                ephemeral: true,
            });
        }

        removeMoney(userId, bet);

        const game = {
            userId,
            bet,
            step: 0,
            difficulty,
            createdAt: Date.now(),
        };

        activeGames.set(userId, game);

        return interaction.reply({
            embeds: [buildEmbed(interaction.user, game)],
            components: [buildButtons(userId)],
        });
    }

    async handleButton(interaction) {
        if (!interaction.customId.startsWith("pigroad_")) {
            return undefined;
        }

        const parts = interaction.customId.split("_");
        const action = parts[1];
        const userId = parts[2];

        if (interaction.user.id !== userId) {
            return interaction.reply({
                content: "❌ Đây không phải ván của bạn.",
                ephemeral: true,
            });
        }

        const game = activeGames.get(userId);

        if (!game) {
            return interaction.reply({
                content: "❌ Ván này đã kết thúc hoặc không tồn tại.",
                ephemeral: true,
            });
        }

        if (action === "cashout") {
            const amount = getCashoutAmount(game);
            if (game.step <= 0) {
                return interaction.reply({
                    content: "❌ Phải qua ít nhất 1 làn mới được dừng.",
                    ephemeral: true,
                });
            }

            addMoney(userId, amount);
            endGame(userId);

            return interaction.update({
                embeds: [buildEmbed(interaction.user, game, "win")],
                components: [buildButtons(userId, true)],
            });
        }

        if (action === "next") {
            const crashChance = getCrashChance(game);
            const crashed = Math.random() < crashChance;

            if (crashed) {
                endGame(userId);

                return interaction.update({
                    embeds: [buildEmbed(interaction.user, game, "lose")],
                    components: [buildButtons(userId, true)],
                });
            }

            game.step += 1;

            if (game.step >= game.difficulty.multipliers.length) {
                const amount = getCashoutAmount(game);

                addMoney(userId, amount);
                endGame(userId);

                return interaction.update({
                    embeds: [buildEmbed(interaction.user, game, "max")],
                    components: [buildButtons(userId, true)],
                });
            }

            activeGames.set(userId, game);

            return interaction.update({
                embeds: [buildEmbed(interaction.user, game)],
                components: [buildButtons(userId)],
            });
        }

        return undefined;
    }
}

module.exports = new PigRoadManager();
