module.exports = {
    timezoneOffsetHours: 7,

    daily: {
        title: "📅 NHIỆM VỤ NGÀY",
        description:
            "Mỗi ngày hệ thống chọn ngẫu nhiên 5 nhiệm vụ. Reset theo giờ Việt Nam.",
        reset: "daily",
        selectCount: 5,
        color: 0x2ecc71,

        quests: [
            {
                id: "daily_cultivate_2",
                name: "Tu luyện 2 lần",
                taskId: "cultivate",
                target: 2,
                reward: {
                    money: 1200,
                    tuVi: 600,
                },
            },
            {
                id: "daily_cultivate_5",
                name: "Tu luyện 5 lần",
                taskId: "cultivate",
                target: 5,
                reward: {
                    money: 2600,
                    tuVi: 1300,
                },
            },
            {
                id: "daily_hunt_2",
                name: "Săn yêu thú 2 lần",
                taskId: "beast_hunt",
                target: 2,
                reward: {
                    money: 2800,
                    tuVi: 800,
                },
            },
            {
                id: "daily_hunt_4",
                name: "Săn yêu thú 4 lần",
                taskId: "beast_hunt",
                target: 4,
                reward: {
                    money: 5200,
                    tuVi: 1600,
                },
            },
            {
                id: "daily_hunt_win_1",
                name: "Thắng săn yêu thú 1 lần",
                taskId: "beast_hunt_win",
                target: 1,
                reward: {
                    money: 3500,
                    tuVi: 1000,
                },
            },
            {
                id: "daily_work_2",
                name: "Đi làm 2 lần",
                taskId: "work",
                target: 2,
                reward: {
                    money: 2000,
                },
            },
            {
                id: "daily_work_4",
                name: "Đi làm 4 lần",
                taskId: "work",
                target: 4,
                reward: {
                    money: 3800,
                },
            },
            {
                id: "daily_tower_1",
                name: "Thử leo tháp 1 lần",
                taskId: "tower_challenge",
                target: 1,
                reward: {
                    money: 2200,
                    tuVi: 550,
                },
            },
            {
                id: "daily_tower_2",
                name: "Thử leo tháp 2 lần",
                taskId: "tower_challenge",
                target: 2,
                reward: {
                    money: 4200,
                    tuVi: 1000,
                },
            },
            {
                id: "daily_dungeon_1",
                name: "Clear hoặc càn quét phó bản 1 lần",
                taskId: "dungeon_clear",
                target: 1,
                reward: {
                    money: 2500,
                    tuVi: 600,
                },
            },
            {
                id: "daily_dungeon_2",
                name: "Clear hoặc càn quét phó bản 2 lần",
                taskId: "dungeon_clear",
                target: 2,
                reward: {
                    money: 4600,
                    tuVi: 1100,
                },
            },
        ],
    },

    weekly: {
        title: "🗓️ NHIỆM VỤ TUẦN",
        description:
            "Mỗi tuần hệ thống chọn ngẫu nhiên 5 nhiệm vụ dài hạn. Reset thứ Hai theo giờ Việt Nam.",
        reset: "weekly",
        selectCount: 5,
        color: 0x9b59b6,

        quests: [
            {
                id: "weekly_cultivate_15",
                name: "Tu luyện 15 lần",
                taskId: "cultivate",
                target: 15,
                reward: {
                    money: 9000,
                    tuVi: 4000,
                },
            },
            {
                id: "weekly_cultivate_30",
                name: "Tu luyện 30 lần",
                taskId: "cultivate",
                target: 30,
                reward: {
                    money: 18000,
                    tuVi: 8000,
                    items: [
                        {
                            itemId: "ruong_phap_bao_thuong",
                            amount: 1,
                        },
                    ],
                },
            },
            {
                id: "weekly_hunt_15",
                name: "Săn yêu thú 15 lần",
                taskId: "beast_hunt",
                target: 15,
                reward: {
                    money: 22000,
                    tuVi: 6500,
                },
            },
            {
                id: "weekly_hunt_win_5",
                name: "Thắng săn yêu thú 5 lần",
                taskId: "beast_hunt_win",
                target: 5,
                reward: {
                    money: 18000,
                    tuVi: 5500,
                },
            },
            {
                id: "weekly_work_12",
                name: "Đi làm 12 lần",
                taskId: "work",
                target: 12,
                reward: {
                    money: 12000,
                },
            },
            {
                id: "weekly_work_20",
                name: "Đi làm 20 lần",
                taskId: "work",
                target: 20,
                reward: {
                    money: 20000,
                },
            },
            {
                id: "weekly_tower_7",
                name: "Thử leo tháp 7 lần",
                taskId: "tower_challenge",
                target: 7,
                reward: {
                    money: 15000,
                    tuVi: 5000,
                },
            },
            {
                id: "weekly_tower_12",
                name: "Thử leo tháp 12 lần",
                taskId: "tower_challenge",
                target: 12,
                reward: {
                    money: 24000,
                    tuVi: 8000,
                    items: [
                        {
                            itemId: "ruong_phap_bao_thuong",
                            amount: 1,
                        },
                    ],
                },
            },
            {
                id: "weekly_dungeon_5",
                name: "Clear hoặc càn quét phó bản 5 lần",
                taskId: "dungeon_clear",
                target: 5,
                reward: {
                    money: 14000,
                    tuVi: 4500,
                },
            },
            {
                id: "weekly_dungeon_10",
                name: "Clear hoặc càn quét phó bản 10 lần",
                taskId: "dungeon_clear",
                target: 10,
                reward: {
                    money: 26000,
                    tuVi: 8500,
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

    challenge: {
        title: "🎰 THỬ THÁCH VẬN MAY",
        description:
            "Mỗi ngày chọn ngẫu nhiên 4 thử thách Gamble. Chỉ tính các ván đã có kết quả.",
        reset: "daily",
        selectCount: 4,
        color: 0xf1c40f,

        quests: [
            {
                id: "challenge_play_3",
                name: "Hoàn thành 3 lượt cược bất kỳ",
                taskId: "gamble_play",
                target: 3,
                reward: {
                    money: 3000,
                    tuVi: 500,
                },
            },
            {
                id: "challenge_play_7",
                name: "Hoàn thành 7 lượt cược bất kỳ",
                taskId: "gamble_play",
                target: 7,
                reward: {
                    money: 7000,
                    tuVi: 1000,
                },
            },
            {
                id: "challenge_wager_50000",
                name: "Đặt cược tổng cộng 50.000",
                taskId: "gamble_wager",
                target: 50000,
                reward: {
                    money: 5500,
                    tuVi: 700,
                },
            },
            {
                id: "challenge_wager_150000",
                name: "Đặt cược tổng cộng 150.000",
                taskId: "gamble_wager",
                target: 150000,
                reward: {
                    money: 13000,
                    tuVi: 1500,
                },
            },
            {
                id: "challenge_win_2",
                name: "Thắng 2 lượt cược bất kỳ",
                taskId: "gamble_win",
                target: 2,
                reward: {
                    money: 6500,
                    tuVi: 900,
                },
            },
            {
                id: "challenge_profit_30000",
                name: "Kiếm tổng lợi nhuận 30.000 từ Gamble",
                taskId: "gamble_profit",
                target: 30000,
                reward: {
                    money: 9000,
                    tuVi: 1200,
                },
            },
            {
                id: "challenge_taixiu_win",
                name: "Thắng Tài Xỉu 1 lần",
                taskId: "taixiu_win",
                target: 1,
                reward: {
                    money: 5000,
                    tuVi: 700,
                },
            },
            {
                id: "challenge_baucua_win",
                name: "Thắng Bầu Cua 1 lần",
                taskId: "baucua_win",
                target: 1,
                reward: {
                    money: 5000,
                    tuVi: 700,
                },
            },
            {
                id: "challenge_blackjack_win",
                name: "Thắng Blackjack 1 lần",
                taskId: "blackjack_win",
                target: 1,
                reward: {
                    money: 6000,
                    tuVi: 850,
                },
            },
            {
                id: "challenge_blackjack_natural",
                name: "Rút được Blackjack tự nhiên",
                taskId: "blackjack_natural",
                target: 1,
                reward: {
                    money: 18000,
                    tuVi: 2200,
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