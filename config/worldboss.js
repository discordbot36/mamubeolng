module.exports = {
    channelId: "1510871711770218596",

    bosses: [
        {
            id: "lao_ga_kho",
            name: "Lão Gà Khô",
            maxHp: 40000000,
            imageUrl: "https://i.imgur.com/toV5hvO.jpeg",
        },
        {
            id: "huy_serum",
            name: "Huy serum",
            maxHp: 40000000,
            imageUrl:
                "https://khoanhdep.com/wp-content/uploads/2025/10/huyforum-meme-2.jpg",
        },
    ],

    defaultBoss: {
        name: "Lão Gà Khô",
        maxHp: 40000000,
        imageUrl: "https://i.imgur.com/toV5hvO.jpeg",
    },

    combatStats: {
        combatPower: 0,

        atk: 0,
        defense: 200,

        speed: 100,

        critChance: 0.08,
        dodgeChance: 0,

        damageReduction: 0.02,

        shieldCapPercent: 1,

        skills: [],
    },

    top10Rewards: [
        20000, 15000, 11000, 8000, 6500, 5500, 4500, 3800, 3200, 2800,
    ],
    attackCooldownMinutes: 5,

    respawnHours: 3.6,
    autoSpawnOnStartup: true,

    consolationReward: 700,

    chestItemId: "tu_luyen_chest",
    chestTopRanks: 3,

    maxRankDisplay: 36,
    pageSize: 10,
};
