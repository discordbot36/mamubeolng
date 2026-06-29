const { ButtonStyle } = require("discord.js");
const { GAMBLE_MAX_BET } = require("./gamble");

module.exports = {
    countdownMs: 50_000,

    minBet: 1,
    maxBet: GAMBLE_MAX_BET,

    dice: {
        amount: 3,
        min: 1,
        max: 6,
    },

    choices: {
        xiu: {
            name: "Xỉu",
            label: "Xỉu (3-10)",
            emoji: "⚫",
            style: ButtonStyle.Success,
            payout: 2,
        },

        tai: {
            name: "Tài",
            label: "Tài (11-18)",
            emoji: "🔴",
            style: ButtonStyle.Success,
            payout: 2,
        },

        chan: {
            name: "Chẵn",
            label: "Chẵn",
            emoji: "🟢",
            style: ButtonStyle.Danger,
            payout: 2,
        },

        le: {
            name: "Lẻ",
            label: "Lẻ",
            emoji: "🟡",
            style: ButtonStyle.Danger,
            payout: 2,
        },
    },

    exactNumber: {
        min: 3,
        max: 18,
        payout: 10,
        style: ButtonStyle.Primary,
    },

    effect: {
        rollingDelayMs: 1200,
        openDelayMs: 1200,
        frames: ["🎲 Đang lắc... `...`", "🎲 Lắc mạnh vl... `...`"],
    },

    messages: {
        invalidBet: "❌ Tiền cược không hợp lệ",
        notEnoughMoney: "❌ Không đủ tiền để chơi",
        alreadyRunning: "⚠️ Channel này đang có bàn tài xỉu rồi",
        closed: "⛔ Bàn tài xỉu đã đóng",
    },
};
