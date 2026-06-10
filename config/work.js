module.exports = {
    cooldown: {
        minutes: 6,
    },
    jobs: {
        bach_khoa_tea: {
            name: "Bưng trà đá Bách Khoa",
            type: "simple",
            reward: 70,
        },
        lam_di: {
            name: "Làm Đĩ",
            type: "jailRisk",
            reward: 400,
            jailChance: 0.36,
        },
        hai_ngon: {
            name: "2 ngón",
            type: "jailRisk",
            reward: 400,
            jailChance: 0.36,
            iphoneChance: 0.18,
            stolenItem: {
                id: "iphone_17_promax",
                name: "iPhone 17 Promax",
                price: 1000,
            },
        },
        trom_cho: {
            name: "Trộm chó",
            type: "dogSteal",
            jailChance: 0.36,
        },
        shipper: {
            name: "Shipper",
            type: "shipper",
            reward: 50,
            iphoneOrderChance: 0.36,
            stealJailChance: 0.67,
            honestBonus: 50,
            stolenItem: {
                id: "iphone_17_promax",
                name: "iPhone 17 Promax",
                price: 1000,
            },
        },
    },
    dogs: [
        {
            id: "cho_shisha",
            name: "Chó Shisha",
            pricePerKg: 10,
            chance: 70,
        },
        {
            id: "cho_kho_ga",
            name: "Chó Khô Gà",
            pricePerKg: 20,
            chance: 33,
        },
        {
            id: "cho_ba_mia",
            name: "Chó Bã Mía",
            pricePerKg: 36,
            chance: 10,
        },
        {
            id: "cho_do",
            name: "Chộ Đó",
            pricePerKg: 50,
            chance: 1,
        },
    ],
    dogWeight: {
        minKg: 0.5,
        maxKg: 20,
        decimalPlaces: 1,
    },
};
