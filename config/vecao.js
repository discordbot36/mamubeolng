const { GAMBLE_MAX_BET } = require("./gamble");

module.exports = {
    minBet: 10_000,
    maxBet: Math.min(500_000, GAMBLE_MAX_BET),
    sessionExpireMs: 10 * 60 * 1000,

    gridSize: 9,

    outcomeTable: [
        {
            id: "lose",
            chance: 5900,
            multiplier: 0,
            symbolId: null,
            title: "💀 VÉ XỊT",
            text: "Thiên Đạo không độ, vé này bay màu.",
        },
        {
            id: "refund",
            chance: 1100,
            multiplier: 1,
            symbolId: "pig",
            title: "🐷 HOÀN VỐN",
            text: "Cào ra 3 con lợn ngủ gật, được hoàn vốn.",
        },
        {
            id: "small",
            chance: 1700,
            multiplier: 1.5,
            symbolId: "coin",
            title: "🪙 TRÚNG NHẸ",
            text: "Linh khí lóe lên, có lời nhẹ.",
        },
        {
            id: "medium",
            chance: 850,
            multiplier: 2.5,
            symbolId: "bag",
            title: "💰 TRÚNG ỔN",
            text: "Túi tiền hiện hình, đạo hữu có lộc.",
        },
        {
            id: "big",
            chance: 350,
            multiplier: 5,
            symbolId: "gem",
            title: "💎 TRÚNG LỚN",
            text: "Linh thạch phát sáng, tiền về khá thơm.",
        },
        {
            id: "jackpot",
            chance: 80,
            multiplier: 10,
            symbolId: "star",
            title: "🌟 JACKPOT NHỎ",
            text: "Thiên cơ khai mở, vận khí đang lên.",
        },
        {
            id: "super",
            chance: 18,
            multiplier: 25,
            symbolId: "fire",
            title: "🔥 ĐẠI VẬN",
            text: "Móng heo cào một phát cháy cả thiên đạo.",
        },
        {
            id: "mythic",
            chance: 2,
            multiplier: 50,
            symbolId: "crown",
            title: "👑 THIÊN MỆNH",
            text: "Vé này được Mamu đích thân phù hộ.",
        },
    ],

    symbols: {
        pig: {
            id: "pig",
            emoji: "🐷",
            name: "Mamu",
        },
        coin: {
            id: "coin",
            emoji: "🪙",
            name: "Đồng Lợn",
        },
        bag: {
            id: "bag",
            emoji: "💰",
            name: "Túi Tiền",
        },
        gem: {
            id: "gem",
            emoji: "💎",
            name: "Linh Thạch",
        },
        star: {
            id: "star",
            emoji: "🌟",
            name: "Thiên Tinh",
        },
        fire: {
            id: "fire",
            emoji: "🔥",
            name: "Đại Vận",
        },
        crown: {
            id: "crown",
            emoji: "👑",
            name: "Thiên Mệnh",
        },
        skull: {
            id: "skull",
            emoji: "💀",
            name: "Xịt",
        },
    },
};
