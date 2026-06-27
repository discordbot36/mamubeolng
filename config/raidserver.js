module.exports = {
    enabled: true,

    timezone: "Asia/Ho_Chi_Minh",

    categoryId: "1342861817105481819",
    channelName: "raid-server",
    battleChannelName: "mamu-3-ta-6-18m",
    battleDisplayName: "Mamu 3 tạ 6 18m",
    privateRaidChannel: true,

    announceChannelId: "1519261709364101181",

    notifyRoleName: "Lợn Tu Tiên",
    notifyRoleId: null,
    registerHour: 8,
    registerMinute: 0,

    prepareHour: 21,
    prepareMinute: 15,

    startHour: 21,
    startMinute: 30,

    prepareMinutes: 15,

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
