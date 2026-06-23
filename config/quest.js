module.exports = {
    timezoneOffsetHours: 7,

    daily: {
        title: "📅 NHIỆM VỤ NGÀY",
        description:
            "Làm nhiệm vụ mỗi ngày để nhận thưởng. Reset theo giờ Việt Nam.",
        quests: [
            {
                id: "cultivate_3",
                name: "Tu luyện 3 lần",
                taskId: "cultivate",
                target: 3,
                reward: {
                    money: 1500,
                    tuVi: 800,
                },
            },
            {
                id: "hunt_3",
                name: "Săn yêu thú 3 lần",
                taskId: "beast_hunt",
                target: 3,
                reward: {
                    money: 5000,
                    tuVi: 1500,
                },
            },
            {
                id: "work_2",
                name: "Đi làm 2 lần",
                taskId: "work",
                target: 2,
                reward: {
                    money: 2000,
                },
            },
            {
                id: "tower_1",
                name: "Leo tháp 1 lần",
                taskId: "tower_challenge",
                target: 1,
                reward: {
                    money: 2500,
                    tuVi: 600,
                },
            },
            {
                id: "dungeon_1",
                name: "Clear hoặc càn quét phó bản 1 lần",
                taskId: "dungeon_clear",
                target: 1,
                reward: {
                    money: 2500,
                    tuVi: 600,
                },
            },
        ],
    },

    weekly: {
        title: "🗓️ NHIỆM VỤ TUẦN",
        description:
            "Nhiệm vụ tuần khó hơn nhưng thưởng ngon hơn. Reset thứ Hai theo giờ Việt Nam.",
        quests: [
            {
                id: "cultivate_20",
                name: "Tu luyện 20 lần",
                taskId: "cultivate",
                target: 20,
                reward: {
                    money: 12000,
                    tuVi: 5000,
                    items: [
                        {
                            itemId: "ruong_phap_bao_thuong",
                            amount: 1,
                        },
                    ],
                },
            },
            {
                id: "work_15",
                name: "Đi làm 15 lần",
                taskId: "work",
                target: 15,
                reward: {
                    money: 15000,
                },
            },
            {
                id: "tower_10",
                name: "Leo tháp 10 lần",
                taskId: "tower_challenge",
                target: 10,
                reward: {
                    money: 18000,
                    tuVi: 6000,
                    items: [
                        {
                            itemId: "ruong_phap_bao_thuong",
                            amount: 1,
                        },
                    ],
                },
            },
            {
                id: "dungeon_7",
                name: "Clear hoặc càn quét phó bản 7 lần",
                taskId: "dungeon_clear",
                target: 7,
                reward: {
                    money: 18000,
                    tuVi: 6000,
                    items: [
                        {
                            itemId: "ruong_phap_bao_thuong",
                            amount: 1,
                        },
                    ],
                },
            },
        ],
    },
};
