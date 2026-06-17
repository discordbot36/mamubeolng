module.exports = {
    cooldownOnLoseMs: 30 * 60 * 1000,
    activeSkillTriggerChance: 0.25,
    reward: {
        base: 145,
        power: 1.15,
        chestFloorMultiplier: 2,
    },

    monster: {
        basePower: 180,
        floorPower: 1.62,
        randomMin: 0.95,
        randomMax: 1.18,
    },

    battle: {
        winRatePenalty: 0.1,
        minWinRate: 0.03,
        maxWinRate: 0.88,
    },

    chestEveryFloor: 10,

    chests: {
        dong: {
            id: "ruong_thap_dong",
            name: "Rương Đồng Leo Tháp",
            emoji: "📦",
            tier: "dong",
        },
        bac: {
            id: "ruong_thap_bac",
            name: "Rương Bạc Leo Tháp",
            emoji: "🧰",
            tier: "bac",
        },
        vang: {
            id: "ruong_thap_vang",
            name: "Rương Vàng Leo Tháp",
            emoji: "🎁",
            tier: "vang",
        },
        kim_cuong: {
            id: "ruong_thap_kim_cuong",
            name: "Rương Kim Cương Leo Tháp",
            emoji: "💎",
            tier: "kim_cuong",
        },
        mamu: {
            id: "ruong_thap_mamu",
            name: "Rương Mamu Thần Bí",
            emoji: "🐷",
            tier: "mamu",
        },
    },

    monsterNames: [
        "Trư Ma Hộ Tháp",
        "Lợn Quỷ Tu La",
        "Hắc Trư Sơn Yêu",
        "Mamu Tàn Ảnh",
        "Thiết Bì Trư Tướng",
        "Linh Trư Canh Cổng",
        "Trư Hồn Địa Ngục",
    ],
};
