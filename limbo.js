const crypto = require("crypto");
const { announceGambleWin } = require("./utils/rareDrop");
const { EmbedBuilder } = require("discord.js");

const {
    addLoss,
    addMoney,
    addWin,
    formatMoney,
    getBalance,
    getCurrencyEmoji,
    removeMoney,
} = require("./database");

const { GAMBLE_MAX_BET } = require("./config/gamble");

const quest = require("./quest");

const MIN_BET = 100;
const MAX_BET = GAMBLE_MAX_BET;

const MIN_TARGET = 1.01;
const MAX_TARGET = 999999;

/*
 * Limbo kiểu Stake:
 * RTP 99%, house edge 1%.
 */
const RTP = 0.99;

/*
 * Độ phân giải random 1 tỷ mốc.
 */
const RANDOM_SCALE = 1000000000;

const processingUsers = new Set();

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function normalizeMultiplier(value) {
    return Math.round(Number(value) * 100) / 100;
}

function formatMultiplier(value) {
    return (
        Number(value).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }) + "x"
    );
}

/*
 * Xác suất thắng:
 *
 * target 2x  -> 49.5%
 * target 10x -> 9.9%
 */
function getWinChance(target) {
    return RTP / target;
}

function formatChance(chance) {
    const percent = Number(chance || 0) * 100;

    if (percent >= 1) {
        return percent.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") + "%";
    }

    return percent.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") + "%";
}

function rollLimboMultiplier() {
    /*
     * u nằm trong [0, 1).
     *
     * Công thức:
     * result = 0.99 / (1 - u)
     *
     * Vì vậy:
     * P(result >= target) = 0.99 / target
     */
    const randomNumber = crypto.randomInt(0, RANDOM_SCALE);

    const u = randomNumber / RANDOM_SCALE;

    const rawMultiplier = RTP / (1 - u);

    /*
     * Limbo hiển thị hai số thập phân.
     */
    const flooredMultiplier = Math.floor(rawMultiplier * 100) / 100;

    return Math.min(MAX_TARGET, Math.max(1, flooredMultiplier));
}

function safeTrackQuest(userId, result) {
    try {
        if (quest && typeof quest.trackGambleResult === "function") {
            quest.trackGambleResult(userId, "limbo", result);
        }
    } catch (error) {
        /*
         * Quest lỗi không được làm ảnh hưởng
         * tới việc trả thưởng Limbo.
         */
        console.error("[Limbo trackGambleResult]", error);
    }
}

function buildRollingEmbed(interaction, bet, target) {
    const coin = getCurrencyEmoji();

    return new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("🚀 LIMBO — ĐANG BAY...")
        .setDescription(
            `${interaction.user} đang thử vận may.\n\n` +
                `💰 Tiền cược: ` +
                `**${coin} ${formatMoney(bet)}**\n` +
                `🎯 Hệ số mục tiêu: ` +
                `**${formatMultiplier(target)}**\n` +
                `🎲 Tỷ lệ thắng: ` +
                `**${formatChance(getWinChance(target))}**\n\n` +
                "`1.00x  ➜  ??.??x  ➜  ???.??x`",
        )
        .setFooter({
            text: "Hệ số càng cao thì " + "xác suất thắng càng thấp.",
        });
}

function buildResultEmbed({
    interaction,
    bet,
    target,
    rolledMultiplier,
    won,
    payout,
}) {
    const coin = getCurrencyEmoji();

    const profit = payout - bet;

    return new EmbedBuilder()
        .setColor(won ? 0x2ecc71 : 0xe74c3c)
        .setTitle(won ? "🏆 LIMBO — THẮNG!" : "💥 LIMBO — THUA!")
        .setDescription(
            `${interaction.user}\n\n` +
                `🎲 Hệ số kết quả: ` +
                `**${formatMultiplier(rolledMultiplier)}**\n` +
                `🎯 Hệ số mục tiêu: ` +
                `**${formatMultiplier(target)}**\n` +
                `📊 Tỷ lệ thắng: ` +
                `**${formatChance(getWinChance(target))}**\n\n` +
                `💰 Tiền cược: ` +
                `**${coin} ${formatMoney(bet)}**\n` +
                (won
                    ? `💵 Nhận về: ` +
                      `**${coin} ${formatMoney(payout)}**\n` +
                      `📈 Lợi nhuận: ` +
                      `**+${coin} ${formatMoney(Math.max(0, profit))}**`
                    : `📉 Thua: ` + `**-${coin} ${formatMoney(bet)}**`),
        )
        .setFooter({
            text: "RTP 99% • Tiền nhận đã gồm vốn • " + "Hệ số tối đa 999,999x",
        })
        .setTimestamp();
}

class LimboManager {
    async play(interaction) {
        const userId = String(interaction.user.id);

        const coin = getCurrencyEmoji();

        /*
         * Xác nhận interaction ngay lập tức.
         * Những xử lý database phía sau sẽ không làm Discord timeout.
         */
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply();
        }

        /*
         * Chống gửi nhiều lệnh Limbo
         * cùng một lúc.
         */
        if (processingUsers.has(userId)) {
            return interaction.editReply({
                content: "⏳ Một lượt Limbo của bạn " + "đang được xử lý.",
            });
        }

        const bet = interaction.options.getInteger("cuoc");

        const rawTarget = interaction.options.getNumber("heso");

        const target = normalizeMultiplier(rawTarget);

        if (!Number.isInteger(bet) || bet < MIN_BET || bet > MAX_BET) {
            return interaction.reply({
                content:
                    `❌ Cược phải từ ` +
                    `**${coin} ${formatMoney(MIN_BET)}** đến ` +
                    `**${coin} ${formatMoney(MAX_BET)}**.`,
            });
        }

        if (
            !Number.isFinite(target) ||
            target < MIN_TARGET ||
            target > MAX_TARGET
        ) {
            return interaction.reply({
                content:
                    `❌ Hệ số mục tiêu phải từ ` +
                    `**${formatMultiplier(MIN_TARGET)}** đến ` +
                    `**${formatMultiplier(MAX_TARGET)}**.`,
            });
        }

        const balance = getBalance(userId);

        if (balance < bet) {
            return interaction.reply({
                content:
                    `❌ Không đủ tiền. Số dư: ` +
                    `**${coin} ${formatMoney(balance)}**.`,
            });
        }

        processingUsers.add(userId);

        let betRemoved = false;
        let moneySettled = false;

        try {
            const removeResult = removeMoney(userId, bet);

            if (!removeResult.success) {
                return interaction.reply({
                    content: `❌ ${removeResult.message}`,
                });
            }

            betRemoved = true;

            const rolledMultiplier = rollLimboMultiplier();

            const won = rolledMultiplier >= target;

            /*
             * Tiền nhận đã gồm cả vốn.
             *
             * Cược 1.000 ở mục tiêu 2x:
             * thắng nhận 2.000.
             */
            const payout = won ? Math.floor(bet * target) : 0;

            /*
             * Phản hồi ngay để Discord
             * không timeout interaction.
             */
            await interaction.editReply({
                embeds: [buildRollingEmbed(interaction, bet, target)],
            });

            await sleep(900);
            if (payout > 0) {
                addMoney(userId, payout);

                if (won) {
                    void announceGambleWin(interaction.client, {
                        user: interaction.user,
                        game: "Limbo",
                        payout,
                    });
                }
            }

            moneySettled = true;

            if (won) {
                addWin(userId);
            } else {
                addLoss(userId);
            }

            safeTrackQuest(userId, {
                bet,
                payout,
                won,

                extraProgress: {
                    limbo_multiplier: won ? Math.floor(target) : 0,
                },
            });

            return interaction.editReply({
                embeds: [
                    buildResultEmbed({
                        interaction,
                        bet,
                        target,
                        rolledMultiplier,
                        won,
                        payout,
                    }),
                ],
            });
        } catch (error) {
            console.error("[Limbo] Lỗi:", error);

            /*
             * Nếu lỗi xảy ra sau khi trừ cược
             * nhưng trước khi trả kết quả,
             * hoàn lại toàn bộ cược.
             */
            if (betRemoved && !moneySettled) {
                addMoney(userId, bet);
            }

            const payload = {
                content:
                    "❌ Có lỗi khi xử lý Limbo. " +
                    (betRemoved && !moneySettled
                        ? "Tiền cược đã được hoàn lại."
                        : "Vui lòng thử lại."),
                embeds: [],
            };

            if (interaction.replied || interaction.deferred) {
                return interaction.editReply(payload).catch(() => undefined);
            }

            return interaction.reply(payload).catch(() => undefined);
        } finally {
            processingUsers.delete(userId);
        }
    }
}

module.exports = new LimboManager();
