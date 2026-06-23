module.exports = {
    enabled: true,

    timezone: "Asia/Ho_Chi_Minh",

    categoryId: "1342861817105481819",
    channelName: "raid-server",

    announceChannelId: null,

    notifyRoleName: "Lợn Tu Tiên",
    notifyRoleId: null,

    registerHour: 18,
    registerMinute: 50,

    startHour: 19,
    startMinute: 0,

    prepareMinutes: 10,

    phaseSeconds: 30,
    maxBattleMinutes: 20,

    minPlayers: 2,

    boss: {
        name: "Mamu siêu béo",
        baseHp: 8000000,
        hpPerPlayer: 2500000,
        baseAtk: 2500,
        atkPerPlayer: 180,
        maxRage: 100,
        maxSpirit: 100,
    },


    perfectMechanic: {
        successBossHpPercent: 0.035,
    },

    reward: {
        chestItemId: "ruong_tan_tich_ex",
        minActionsForChest: 3,
        minPhasesForChest: 4,
        maxAfkPhasesForChest: 2,
        minDeathPhaseForChest: 3,

        winMoneyMin: 80000,
        winMoneyMax: 180000,

        loseMoneyMin: 20000,
        loseMoneyMax: 60000,

        winExpMin: 5000,
        winExpMax: 15000,

        loseExpMin: 1000,
        loseExpMax: 4000,
    },

    heavenSave: {
        enabled: true,
        maxPerRaid: 1,
        triggerChance: 0.28,
        minBossHpPercent: 35,
        minDeadRatio: 0.4,
        minRage: 90,
    },
};