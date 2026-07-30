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

    // Ít thời gian chọn hành động hơn
    phaseSeconds: 24,

    // DPS check gắt hơn
    maxBattleMinutes: 16,

    minPlayers: 2,

    boss: {
        name: "Mamu siêu béo",

        // Cũ: 8.000.000
        baseHp: 12000000,

        // Cũ: 2.500.000 mỗi người
        hpPerPlayer: 3500000,

        // Cũ: 2.500
        baseAtk: 3300,

        // Cũ: 180 mỗi người
        atkPerPlayer: 260,

        maxRage: 100,
        maxSpirit: 100,
    },

    perfectMechanic: {
        // Cũ: mechanic đúng gây 3,5% máu tối đa
        // Mới: chỉ còn 2,2%
        successBossHpPercent: 0.022,
    },

    difficulty: {
        // Damage của người chơi còn 78%
        playerDamageMultiplier: 0.78,

        // Tăng thêm 8% số người cần làm đúng mechanic
        requiredRatioBonus: 0.08,

        // Boss tự tăng nộ mỗi phase
        passiveRagePerPhase: 4,

        // Boss dưới 70% HP tăng thêm 2 nộ
        stage2ExtraRage: 2,

        // Boss dưới 35% HP tăng thêm 4 nộ nữa
        stage3ExtraRage: 4,

        // Damage toàn đội khi boss đủ 100 nộ
        rageBurstDamageMultiplier: 2.1,

        // Sau khi bùng nộ không trở về 0
        rageAfterBurst: 45,
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

        // Cũ: 28%
        triggerChance: 0.12,

        // Chỉ cứu khi boss còn dưới 20%
        minBossHpPercent: 20,

        // Hoặc ít nhất 65% người chơi đã chết
        minDeadRatio: 0.65,

        // Hoặc boss đã đủ 100 nộ
        minRage: 100,
    },
};