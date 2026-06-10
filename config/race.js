const { ButtonStyle } = require("discord.js");

module.exports = {
    finishLine: 20,
    countdownMs: 36_000,
    raceTickMs: 1_000,
    maxStep: 2,
    maxPigs: 5,

    minBet: 1,
    maxBet: 250000,
    payout: 4,

    runnerEmoji: "🐖",

    pigs: [
        {
            name: "Lợn Đồng",
            emoji: "🐷",
            style: ButtonStyle.Primary,
        },
        {
            name: "Lợn Giấy",
            emoji: "🐽",
            style: ButtonStyle.Success,
        },
        {
            name: "Lợn Nhựa",
            emoji: "🐖",
            style: ButtonStyle.Danger,
        },
        {
            name: "Lợn Nhôm",
            emoji: {
                name: "utit",
                id: "1328542656405438484",
            },
            style: ButtonStyle.Secondary,
        },
        {
            name: "Lợn Sắt vụn",
            emoji: {
                name: "SadPepePig",
                id: "1509405626051067925",
            },
            style: ButtonStyle.Primary,
        },
    ],

    messages: {
        invalidBet: "❌ Tiền cược không hợp lệ",
        notEnoughMoney: "❌ Không đủ tiền để chơi",
        alreadyRunning: "⚠️ Channel này đang có bàn đua lợn rồi",
        closed: "⛔ Bàn đua lợn đã đóng",
        noBet: "🏁 Bàn đua lợn hủy vì không ai xuống tiền",
    },
};