const { EmbedBuilder } = require("discord.js");
const { announceGambleWin } = require("./utils/rareDrop");
const {
    getBalance,
    addMoney,
    removeMoney,
    addWin,
    addLoss,
    getCurrencyEmoji,
    formatMoney,
} = require("./database");
const { GAMBLE_MAX_BET } = require("./config/gamble");

const BOARD_SIZE = 40;
const DRAW_COUNT = 10;
const MIN_PICKS = 1;
const MAX_PICKS = 10;

const MIN_BET = 1000;
const MAX_BET = GAMBLE_MAX_BET;

/*
 * Bản bot lấy cấu trúc Keno của Stake,
 * nhưng dùng RTP 97% để hợp kinh tế server.
 */
const TARGET_RTP = 0.97;

const RISK_MODES = {
    low: {
        id: "low",
        name: "Thấp",
        emoji: "🟢",
        color: 0x2ecc71,

        note: "Dễ nhận tiền hoàn lại hơn, nhưng các mốc trúng lớn có hệ số thấp hơn.",

        /*
         * Hệ số tăng giữa các mốc trúng.
         */
        growth: 2.2,

        /*
         * Hệ số tối đa của chế độ.
         */
        maxMultiplier: 500,

        /*
         * Số hit tối thiểu để bắt đầu nhận thưởng.
         * Index là số lượng số người chơi chọn.
         */
        minHitsByPicks: [0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2],
    },

    medium: {
        id: "medium",
        name: "Trung bình",
        emoji: "🟡",
        color: 0xf1c40f,

        note: "Cân bằng giữa tần suất trúng và hệ số, phù hợp để chơi thông thường.",

        growth: 4,
        maxMultiplier: 750,

        minHitsByPicks: [0, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3],
    },

    high: {
        id: "high",
        name: "Cao",
        emoji: "🔴",
        color: 0xe74c3c,

        note: "Phần lớn ván không trả thưởng, đổi lại các mốc cao có thể lên tới x1000.",

        growth: 7,
        maxMultiplier: 1000,

        minHitsByPicks: [0, 1, 2, 3, 3, 3, 4, 4, 4, 4, 4],
    },
};

const payoutTableCache = new Map();
const processingUsers = new Set();

/*
 * Tính tổ hợp C(n, k).
 */
function combination(n, k) {
    if (k < 0 || k > n) {
        return 0;
    }

    const safeK = Math.min(k, n - k);

    let result = 1;

    for (let index = 1; index <= safeK; index += 1) {
        result = (result * (n - safeK + index)) / index;
    }

    return result;
}

/*
 * Xác suất trúng đúng hitCount số.
 *
 * Người chơi chọn pickCount số trong 40 số.
 * Bot rút 10 số không lặp.
 */
function getHitProbability(pickCount, hitCount) {
    if (
        hitCount < 0 ||
        hitCount > pickCount ||
        DRAW_COUNT - hitCount < 0 ||
        DRAW_COUNT - hitCount > BOARD_SIZE - pickCount
    ) {
        return 0;
    }

    return (
        (combination(pickCount, hitCount) *
            combination(BOARD_SIZE - pickCount, DRAW_COUNT - hitCount)) /
        combination(BOARD_SIZE, DRAW_COUNT)
    );
}

/*
 * Sinh bảng thưởng tự động dựa trên:
 *
 * - Chế độ rủi ro
 * - Số lượng số đã chọn
 * - RTP mục tiêu
 * - Hệ số tối đa
 *
 * Bảng này cố định về mặt toán học,
 * không thay đổi tùy từng người chơi.
 */
function buildPayoutTable(riskId, pickCount) {
    const mode = RISK_MODES[riskId];

    if (!mode) {
        return null;
    }

    const cacheKey = `${riskId}:${pickCount}`;

    const cached = payoutTableCache.get(cacheKey);

    if (cached) {
        return cached;
    }

    const minHits = mode.minHitsByPicks[pickCount];

    const weights = {};

    for (let hits = minHits; hits <= pickCount; hits += 1) {
        weights[hits] = Math.pow(mode.growth, hits - minHits);
    }

    /*
     * Tìm scale để tổng EV gần TARGET_RTP.
     */
    let lowScale = 0;
    let highScale = 1000000000000;

    for (let index = 0; index < 160; index += 1) {
        const scale = (lowScale + highScale) / 2;

        let expectedReturn = 0;

        for (let hits = minHits; hits <= pickCount; hits += 1) {
            const multiplier = Math.min(
                mode.maxMultiplier,
                scale * weights[hits],
            );

            expectedReturn += getHitProbability(pickCount, hits) * multiplier;
        }

        if (expectedReturn < TARGET_RTP) {
            lowScale = scale;
        } else {
            highScale = scale;
        }
    }

    const finalScale = (lowScale + highScale) / 2;

    const table = {};

    for (let hits = 0; hits <= pickCount; hits += 1) {
        if (hits < minHits) {
            table[hits] = 0;
            continue;
        }

        table[hits] = Number(
            Math.min(mode.maxMultiplier, finalScale * weights[hits]).toFixed(2),
        );
    }

    payoutTableCache.set(cacheKey, table);

    return table;
}

function formatMultiplier(multiplier) {
    const value = Number(multiplier || 0);

    if (Number.isInteger(value)) {
        return `x${value}`;
    }

    return `x${value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}`;
}

/*
 * Người chơi có thể nhập:
 *
 * 3,7,12,18,25
 * 3 7 12 18 25
 * 3;7;12;18;25
 */
function parseSelectedNumbers(rawValue) {
    if (!rawValue || !String(rawValue).trim()) {
        return null;
    }

    const numbers = String(rawValue)
        .trim()
        .split(/[\s,;|/]+/)
        .filter(Boolean)
        .map(Number);

    if (
        numbers.some(
            (number) =>
                !Number.isInteger(number) || number < 1 || number > BOARD_SIZE,
        )
    ) {
        throw new Error(`Mỗi số phải là số nguyên từ 1 đến ${BOARD_SIZE}.`);
    }

    const uniqueNumbers = [...new Set(numbers)];

    if (uniqueNumbers.length !== numbers.length) {
        throw new Error("Dãy số không được chứa số trùng nhau.");
    }

    if (uniqueNumbers.length < MIN_PICKS || uniqueNumbers.length > MAX_PICKS) {
        throw new Error(`Bạn phải chọn từ ${MIN_PICKS} đến ${MAX_PICKS} số.`);
    }

    return uniqueNumbers.sort((a, b) => a - b);
}

/*
 * Tạo một dãy số không trùng nhau.
 */
function randomUniqueNumbers(count) {
    const numbers = Array.from(
        {
            length: BOARD_SIZE,
        },
        (_, index) => index + 1,
    );

    for (let index = numbers.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));

        [numbers[index], numbers[swapIndex]] = [
            numbers[swapIndex],
            numbers[index],
        ];
    }

    return numbers.slice(0, count).sort((a, b) => a - b);
}

function formatNumber(number) {
    return String(number).padStart(2, "0");
}

function formatSelectedNumbers(numbers, hitSet) {
    return numbers
        .map((number) => {
            const label = formatNumber(number);

            return hitSet.has(number) ? `**🟢 ${label}**` : `⚪ ${label}`;
        })
        .join("  ");
}

function formatDrawnNumbers(numbers, hitSet) {
    return numbers
        .map((number) => {
            const label = formatNumber(number);

            return hitSet.has(number) ? `**🎯 ${label}**` : `🔵 ${label}`;
        })
        .join("  ");
}

function formatPayoutTable(table, pickCount) {
    const parts = [];

    for (let hits = 0; hits <= pickCount; hits += 1) {
        parts.push(`**${hits}/${pickCount}** ${formatMultiplier(table[hits])}`);
    }

    return parts.join("  •  ");
}

/*
 * Embed hướng dẫn và note.
 */
function buildGuideEmbed(pickCount = 5) {
    const safePickCount = Math.min(
        MAX_PICKS,
        Math.max(MIN_PICKS, Number(pickCount || 5)),
    );

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📋 NOTE KENO")
        .setDescription(
            `• Chọn **1–10 số** trong khoảng **1–40**.\n` +
                `• Bot rút ngẫu nhiên **10 số**.\n` +
                `• Trùng càng nhiều số thì hệ số càng cao.\n`,
        );

    for (const mode of Object.values(RISK_MODES)) {
        embed.addFields({
            name: `${mode.emoji} ${mode.name}`,

            value:
                `${mode.note}\n` +
                formatPayoutTable(
                    buildPayoutTable(mode.id, safePickCount),
                    safePickCount,
                ),
        });
    }

    return embed
        .setFooter({
            text: "Thấp trả đều hơn • Trung bình cân bằng • Cao ít trúng nhưng hệ số lớn",
        })
        .setTimestamp();
}

function getResultStyle(multiplier, profit) {
    if (multiplier <= 0) {
        return {
            title: "💀 KENO — TRẮNG TAY",

            color: 0x992d22,

            text: "Không đủ số trùng để nhận thưởng.",
        };
    }

    /*
     * Một số mốc chế độ thấp có hệ số dưới x1.
     * Người chơi nhận lại một phần tiền nhưng vẫn lỗ.
     */
    if (profit < 0) {
        return {
            title: "🟠 KENO — HOÀN MỘT PHẦN",

            color: 0xe67e22,

            text: "Có trúng số nhưng tiền nhận vẫn thấp hơn tiền cược.",
        };
    }

    if (profit === 0) {
        return {
            title: "⚪ KENO — HÒA VỐN",

            color: 0x95a5a6,

            text: "Bạn nhận lại đúng tiền cược.",
        };
    }

    return {
        title: "🎉 KENO — THẮNG",

        color: 0x2ecc71,

        text: "Bạn đã có lợi nhuận từ lượt Keno này!",
    };
}

function buildResultEmbed({
    interaction,
    bet,
    mode,

    selectedNumbers,
    drawnNumbers,
    hitNumbers,

    multiplier,

    rawPayout,
    payout,
}) {
    const coin = getCurrencyEmoji();

    const hitSet = new Set(hitNumbers);

    const profit = payout - bet;
    if (profit > 0) {
        void announceGambleWin(interaction.client, {
            user: interaction.user,
            game: "Keno",
            payout,
        });
    }

    const style = getResultStyle(multiplier, profit);

    const payoutTable = buildPayoutTable(mode.id, selectedNumbers.length);

    return new EmbedBuilder()
        .setColor(style.color)
        .setTitle(style.title)
        .setDescription(
            `${interaction.user} chơi chế độ ${mode.emoji} **${mode.name}**.\n\n` +
                `🎟️ **Số đã chọn**\n` +
                `${formatSelectedNumbers(selectedNumbers, hitSet)}\n\n` +
                `🎱 **10 số được rút**\n` +
                `${formatDrawnNumbers(drawnNumbers, hitSet)}`,
        )
        .addFields(
            {
                name: "📊 Kết quả",

                value:
                    `Trúng: **${hitNumbers.length}/${selectedNumbers.length} số**\n` +
                    `Hệ số: **${formatMultiplier(multiplier)}**\n` +
                    style.text,

                inline: true,
            },

            {
                name: "💰 Thanh toán",

                value:
                    `Cược: **${coin} ${formatMoney(bet)}**\n` +
                    `Nhận: **${coin} ${formatMoney(payout)}**\n` +
                    `Lãi/lỗ: **${profit >= 0 ? "+" : "-"}${coin} ${formatMoney(
                        Math.abs(profit),
                    )}**`,

                inline: true,
            },

            {
                name: `📈 Bảng thưởng ${mode.name} — chọn ${selectedNumbers.length} số`,

                value: formatPayoutTable(payoutTable, selectedNumbers.length),
            },

            {
                name: "📝 Note chế độ",

                value: mode.note,
            },
        )
        .setFooter({
            text: "Bảng thưởng đã gồm tiền vốn • Dùng /kenonote để xem đủ 3 chế độ",
        })
        .setTimestamp();
}

class KenoManager {
    async play(interaction) {
        const userId = String(interaction.user.id);

        if (processingUsers.has(userId)) {
            return interaction.reply({
                content: "⏳ Một lượt Keno của bạn đang được xử lý.",

                ephemeral: true,
            });
        }

        const bet = interaction.options.getInteger("cuoc");

        const riskId = interaction.options.getString("chedo") || "medium";

        const rawNumbers = interaction.options.getString("so");

        const autoPickCount = interaction.options.getInteger("soluong") || 5;

        const coin = getCurrencyEmoji();

        const mode = RISK_MODES[riskId];

        if (!Number.isInteger(bet) || bet < MIN_BET || bet > MAX_BET) {
            return interaction.reply({
                content: `❌ Cược phải từ **${coin} ${formatMoney(
                    MIN_BET,
                )}** đến **${coin} ${formatMoney(MAX_BET)}**.`,

                ephemeral: true,
            });
        }

        if (!mode) {
            return interaction.reply({
                content: "❌ Chế độ Keno không hợp lệ.",

                ephemeral: true,
            });
        }

        let selectedNumbers;

        try {
            /*
             * Nếu có nhập "so", ưu tiên dãy đó.
             *
             * Nếu không nhập, bot dùng "soluong"
             * để chọn ngẫu nhiên.
             */
            selectedNumbers =
                parseSelectedNumbers(rawNumbers) ||
                randomUniqueNumbers(autoPickCount);
        } catch (error) {
            return interaction.reply({
                content: `❌ ${error.message}`,

                ephemeral: true,
            });
        }

        const balance = getBalance(userId);

        if (balance < bet) {
            return interaction.reply({
                content: `❌ Không đủ tiền. Số dư: **${coin} ${formatMoney(
                    balance,
                )}**.`,

                ephemeral: true,
            });
        }

        processingUsers.add(userId);

        try {
            const removeResult = removeMoney(userId, bet);

            if (!removeResult.success) {
                return interaction.reply({
                    content: `❌ ${removeResult.message}`,

                    ephemeral: true,
                });
            }

            /*
             * Rút đúng 10 số khác nhau.
             */
            const drawnNumbers = randomUniqueNumbers(DRAW_COUNT);

            const drawnSet = new Set(drawnNumbers);

            const hitNumbers = selectedNumbers.filter((number) =>
                drawnSet.has(number),
            );

            const payoutTable = buildPayoutTable(
                riskId,
                selectedNumbers.length,
            );

            const multiplier = Number(payoutTable[hitNumbers.length] || 0);

            /*
             * Tiền thưởng đã gồm cả vốn.
             */
            const rawPayout = Math.max(0, Math.floor(bet * multiplier));

            const payout = rawPayout;
            if (payout > 0) {
                addMoney(userId, payout);
            }

            const profit = payout - bet;

            if (profit > 0) {
                addWin(userId);
            } else if (profit < 0) {
                addLoss(userId);
            }

            return interaction.reply({
                embeds: [
                    buildResultEmbed({
                        interaction,

                        bet,
                        mode,

                        selectedNumbers,
                        drawnNumbers,
                        hitNumbers,

                        multiplier,

                        rawPayout,
                        payout,
                    }),
                ],
            });
        } catch (error) {
            console.error("[Keno] Lỗi:", error);

            return interaction.reply({
                content: "❌ Có lỗi khi xử lý Keno.",

                ephemeral: true,
            });
        } finally {
            processingUsers.delete(userId);
        }
    }

    async note(interaction) {
        const pickCount = interaction.options.getInteger("soluong") || 5;

        return interaction.reply({
            embeds: [buildGuideEmbed(pickCount)],
        });
    }
}

module.exports = new KenoManager();
