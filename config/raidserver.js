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

    // Thời gian chọn hành động mỗi phase
    phaseSeconds: 22,

    // Tổng thời gian hạ boss
    maxBattleMinutes: 14,

    minPlayers: 2,

    boss: {
        name: "Mamu siêu béo",

        baseHp: 15000000,
        hpPerPlayer: 4000000,

        baseAtk: 3700,
        atkPerPlayer: 310,

        maxRage: 100,
        maxSpirit: 100,
    },

    perfectMechanic: {
        // Sát thương thật khi xử lý mechanic thành công
        successBossHpPercent: 0.02,
    },

    difficulty: {
        // Damage người chơi còn 74%
        playerDamageMultiplier: 0.74,

        // Tăng số người bắt buộc phải làm đúng mechanic
        requiredRatioBonus: 0.12,

        // Nộ tăng theo phase
        passiveRagePerPhase: 6,
        stage2ExtraRage: 3,
        stage3ExtraRage: 6,

        // Bùng nộ nguy hiểm hơn
        rageBurstDamageMultiplier: 2.4,
        rageAfterBurst: 55,
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

        triggerChance: 0.12,
        minBossHpPercent: 20,
        minDeadRatio: 0.65,
        minRage: 100,
    },
};
