const { ButtonStyle } = require("discord.js");
const { GAMBLE_MAX_BET } = require("./gamble");

module.exports = {
    countdownMs: 45_000,

    minBet: 1,
    maxBet: GAMBLE_MAX_BET,

    items: {
        bau: {
            name: "Bầu",
            emoji: "🍐",
            style: ButtonStyle.Success,
        },

        cua: {
            name: "Cua",
            emoji: "🦀",
            style: ButtonStyle.Primary,
        },

        tom: {
            name: "Tôm",
            emoji: "🦐",
            style: ButtonStyle.Danger,
        },

        ca: {
            name: "Cá",
            emoji: "🐟",
            style: ButtonStyle.Primary,
        },

        ga: {
            name: "Gà",
            emoji: "🐓",
            style: ButtonStyle.Secondary,
        },

        nai: {
            name: "Nai",
            emoji: "🦌",
            style: ButtonStyle.Success,
        },
    },

    payoutPerMatch: 2,

    effect: {
        rollingDelayMs: 650,
        openDelayMs: 900,
        frames: [
            "🎲 Đang lắc... `.`",
            "🎲 Đang lắc... `..`",
            "🎲 Đang lắc... `...`",
            "🎲 Lắc mạnh vl... `.`",
            "🎲 Lắc mạnh vl... `..`",
            "🎲 Lắc mạnh vl... `...`",
        ],
    },

    messages: {
        invalidBet: "❌ Tiền cược không hợp lệ",
        notEnoughMoney: "❌ Không đủ tiền để chơi",
        alreadyRunning: "⚠️ Channel này đang có bàn bầu cua rồi",
        closed: "⛔ Bàn bầu cua đã đóng",
    },
};