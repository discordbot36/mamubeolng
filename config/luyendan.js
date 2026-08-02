const ALCHEMY_TITLES = [
    "Chưa Nhập Môn",
    "Học Đồ Luyện Đan",
    "Nhất Phẩm Luyện Đan Sư",
    "Nhị Phẩm Luyện Đan Sư",
    "Tam Phẩm Luyện Đan Sư",
    "Tứ Phẩm Luyện Đan Sư",
    "Ngũ Phẩm Luyện Đan Sư",
    "Lục Phẩm Luyện Đan Sư",
    "Thất Phẩm Luyện Đan Sư",
    "Bát Phẩm Luyện Đan Sư",
    "Cửu Phẩm Đan Tôn",
];

/*
 * Tổng EXP cần đạt để lên level tương ứng.
 * Index chính là level Luyện Đan Sư.
 */
const LEVEL_EXP = [
    0,
    0,
    100,
    300,
    750,
    1500,
    2800,
    4800,
    7500,
    11000,
    16000,
];

const FURNACES = [
    null,
    {
        level: 1,
        name: "Phàm Hỏa Lô",
        emoji: "🏺",
        successBonus: 0,
        maxQuality: 1,
        maxDurability: 100,
        upgradeCost: null,
    },
    {
        level: 2,
        name: "Thanh Đồng Đan Lô",
        emoji: "🫕",
        successBonus: 0.03,
        maxQuality: 1,
        maxDurability: 120,
        upgradeCost: {
            money: 30000,
            materials: {
                da_yeu_thu: 10,
                xuong_yeu_thu: 10,
                nanh_yeu_thu: 3,
            },
        },
    },
    {
        level: 3,
        name: "Huyền Thiết Đan Lô",
        emoji: "⚙️",
        successBonus: 0.06,
        maxQuality: 2,
        maxDurability: 150,
        upgradeCost: {
            money: 120000,
            materials: {
                da_yeu_thu: 20,
                xuong_yeu_thu: 20,
                nanh_yeu_thu: 10,
                yeu_dan_thuong: 5,
            },
        },
    },
    {
        level: 4,
        name: "Địa Hỏa Đan Lô",
        emoji: "🔥",
        successBonus: 0.09,
        maxQuality: 2,
        maxDurability: 180,
        upgradeCost: {
            money: 500000,
            materials: {
                xuong_yeu_thu: 35,
                nanh_yeu_thu: 20,
                yeu_dan_thuong: 12,
                linh_huyet: 4,
            },
        },
    },
    {
        level: 5,
        name: "Tử Kim Đan Lô",
        emoji: "🟣",
        successBonus: 0.12,
        maxQuality: 3,
        maxDurability: 220,
        upgradeCost: {
            money: 2000000,
            materials: {
                nanh_yeu_thu: 35,
                yeu_dan_thuong: 20,
                yeu_dan_tinh_anh: 8,
                linh_huyet: 10,
                yeu_hach: 2,
            },
        },
    },
    {
        level: 6,
        name: "Cửu Long Đan Lô",
        emoji: "🐉",
        successBonus: 0.16,
        maxQuality: 3,
        maxDurability: 260,
        upgradeCost: {
            money: 10000000,
            materials: {
                yeu_dan_thuong: 40,
                yeu_dan_tinh_anh: 20,
                linh_huyet: 20,
                yeu_hach: 8,
            },
        },
    },
    {
        level: 7,
        name: "Thiên Hỏa Thần Lô",
        emoji: "☀️",
        successBonus: 0.2,
        maxQuality: 4,
        maxDurability: 320,
        upgradeCost: {
            money: 50000000,
            materials: {
                yeu_dan_tinh_anh: 50,
                linh_huyet: 50,
                yeu_hach: 25,
            },
        },
    },
];

const QUALITIES = {
    1: {
        id: "ha_pham",
        name: "Hạ phẩm",
        emoji: "⚪",
        valueMultiplier: 1,
        sellMultiplier: 1,
    },
    2: {
        id: "trung_pham",
        name: "Trung phẩm",
        emoji: "🔵",
        valueMultiplier: 1.5,
        sellMultiplier: 1.3,
    },
    3: {
        id: "thuong_pham",
        name: "Thượng phẩm",
        emoji: "🟣",
        valueMultiplier: 2.5,
        sellMultiplier: 1.8,
    },
    4: {
        id: "cuc_pham",
        name: "Cực phẩm",
        emoji: "🟡",
        valueMultiplier: 4,
        sellMultiplier: 3,
    },
};

/*
 * type:
 * cultivation = uống nhận tu vi
 * hunt_run = hồi lượt săn nhận thưởng
 * hunt_lure = bảo đảm yêu thú đạt level tối thiểu
 * shop_item = tạo đúng vật phẩm hiện có trong config/shop.js
 */
const RECIPES = {
    tu_khi_dan: {
        id: "tu_khi_dan",
        name: "Tụ Khí Đan",
        emoji: "🟢",
        type: "cultivation",
        description: "Sau khi uống sẽ lập tức nhận tu vi.",
        requiredAlchemyLevel: 1,
        requiredFurnaceLevel: 1,
        baseSuccessRate: 0.82,
        alchemyExp: 12,
        furnaceDurabilityCost: 1,
        craftMoney: 1000,
        baseValue: 400,
        buybackPrice: 900,
        materials: {
            da_yeu_thu: 2,
            xuong_yeu_thu: 2,
            yeu_dan_thuong: 1,
        },
    },

    ngung_nguyen_dan: {
        id: "ngung_nguyen_dan",
        name: "Ngưng Nguyên Đan",
        emoji: "🔵",
        type: "cultivation",
        description: "Đan tu vi dành cho tu sĩ trung kỳ.",
        requiredAlchemyLevel: 3,
        requiredFurnaceLevel: 2,
        baseSuccessRate: 0.74,
        alchemyExp: 28,
        furnaceDurabilityCost: 2,
        craftMoney: 5000,
        baseValue: 2000,
        buybackPrice: 4000,
        materials: {
            nanh_yeu_thu: 2,
            yeu_dan_thuong: 3,
            linh_huyet: 1,
        },
    },

    hoa_linh_dan: {
        id: "hoa_linh_dan",
        name: "Hóa Linh Đan",
        emoji: "🟣",
        type: "cultivation",
        description: "Chứa lượng tu vi lớn, yêu cầu lò cao cấp.",
        requiredAlchemyLevel: 6,
        requiredFurnaceLevel: 5,
        baseSuccessRate: 0.6,
        alchemyExp: 80,
        furnaceDurabilityCost: 4,
        craftMoney: 40000,
        baseValue: 10000,
        buybackPrice: 30000,
        materials: {
            yeu_dan_tinh_anh: 2,
            linh_huyet: 2,
            yeu_hach: 1,
        },
    },

    hoi_liep_dan: {
        id: "hoi_liep_dan",
        name: "Hồi Liệp Đan",
        emoji: "🎟️",
        type: "hunt_run",
        description:
            "Hồi 1 lượt nhận thưởng Săn Yêu Thú, tối đa dùng 2 viên mỗi ngày.",
        requiredAlchemyLevel: 2,
        requiredFurnaceLevel: 1,
        baseSuccessRate: 0.78,
        alchemyExp: 18,
        furnaceDurabilityCost: 1,
        craftMoney: 3000,
        buybackPrice: 2500,
        materials: {
            da_yeu_thu: 3,
            xuong_yeu_thu: 3,
            yeu_dan_thuong: 2,
        },
    },

    tam_yeu_dan: {
        id: "tam_yeu_dan",
        name: "Tầm Yêu Đan",
        emoji: "🧭",
        type: "hunt_lure",
        description:
            "Dùng cho lượt săn kế tiếp, phẩm càng cao bảo đảm yêu thú càng mạnh.",
        requiredAlchemyLevel: 3,
        requiredFurnaceLevel: 2,
        baseSuccessRate: 0.72,
        alchemyExp: 25,
        furnaceDurabilityCost: 2,
        craftMoney: 5000,
        buybackPrice: 5000,
        /*
         * Hạ phẩm cấp 2, Trung phẩm cấp 3,
         * Thượng phẩm cấp 4, Cực phẩm cấp 5.
         */
        minBeastLevelByQuality: {
            1: 2,
            2: 3,
            3: 4,
            4: 5,
        },
        materials: {
            nanh_yeu_thu: 3,
            yeu_dan_thuong: 2,
        },
    },

    thuong_co_dan_yeu_dan: {
        id: "thuong_co_dan_yeu_dan",
        name: "Thượng Cổ Dẫn Yêu Đan",
        emoji: "🐉",
        type: "hunt_lure",
        description:
            "Dẫn dụ thượng cổ yêu thú. Yêu thú cấp 5 trở lên bắt buộc đi tổ đội.",
        requiredAlchemyLevel: 7,
        requiredFurnaceLevel: 5,
        baseSuccessRate: 0.55,
        alchemyExp: 110,
        furnaceDurabilityCost: 5,
        craftMoney: 100000,
        buybackPrice: 75000,
        /*
         * Không cho Hạ phẩm bảo đảm cấp 5 ngay,
         * tránh farm vòng lặp Yêu Hạch quá dễ.
         */
        minBeastLevelByQuality: {
            1: 4,
            2: 5,
            3: 6,
            4: 7,
        },
        materials: {
            yeu_dan_tinh_anh: 3,
            linh_huyet: 3,
            yeu_hach: 1,
        },
    },

    linh_tru_truc_co_dan: {
        id: "linh_tru_truc_co_dan",
        name: "Linh Trư Trúc Cơ Đan",
        emoji: "🧪",
        type: "shop_item",
        shopItemId: "linh_tru_truc_co_dan",
        requiredAlchemyLevel: 4,
        requiredFurnaceLevel: 2,
        baseSuccessRate: 0.76,
        alchemyExp: 35,
        furnaceDurabilityCost: 2,
        craftMoney: 5000,
        buybackPrice: 7000,
        materials: {
            da_yeu_thu: 3,
            xuong_yeu_thu: 3,
            yeu_dan_thuong: 2,
        },
    },

    kim_nha_ngung_dan: {
        id: "kim_nha_ngung_dan",
        name: "Kim Nha Ngưng Đan",
        emoji: "🟡",
        type: "shop_item",
        shopItemId: "kim_nha_ngung_dan",
        requiredAlchemyLevel: 4,
        requiredFurnaceLevel: 3,
        baseSuccessRate: 0.7,
        alchemyExp: 50,
        furnaceDurabilityCost: 2,
        craftMoney: 15000,
        buybackPrice: 21000,
        materials: {
            nanh_yeu_thu: 4,
            yeu_dan_thuong: 4,
            linh_huyet: 1,
        },
    },

    tru_anh_hoa_sinh_dan: {
        id: "tru_anh_hoa_sinh_dan",
        name: "Trư Anh Hóa Sinh Đan",
        emoji: "👶",
        type: "shop_item",
        shopItemId: "tru_anh_hoa_sinh_dan",
        requiredAlchemyLevel: 5,
        requiredFurnaceLevel: 4,
        baseSuccessRate: 0.66,
        alchemyExp: 70,
        furnaceDurabilityCost: 3,
        craftMoney: 45000,
        buybackPrice: 63000,
        materials: {
            yeu_dan_tinh_anh: 3,
            linh_huyet: 2,
            yeu_hach: 1,
        },
    },

    thien_bong_hoa_than_dan: {
        id: "thien_bong_hoa_than_dan",
        name: "Thiên Bồng Hóa Thần Đan",
        emoji: "🌩️",
        type: "shop_item",
        shopItemId: "thien_bong_hoa_than_dan",
        requiredAlchemyLevel: 6,
        requiredFurnaceLevel: 4,
        baseSuccessRate: 0.62,
        alchemyExp: 100,
        furnaceDurabilityCost: 4,
        craftMoney: 125000,
        buybackPrice: 175000,
        materials: {
            yeu_dan_tinh_anh: 6,
            linh_huyet: 5,
            yeu_hach: 2,
        },
    },

    thon_thien_pha_hu_dan: {
        id: "thon_thien_pha_hu_dan",
        name: "Thôn Thiên Phá Hư Đan",
        emoji: "🌌",
        type: "shop_item",
        shopItemId: "thon_thien_pha_hu_dan",
        requiredAlchemyLevel: 7,
        requiredFurnaceLevel: 5,
        baseSuccessRate: 0.58,
        alchemyExp: 150,
        furnaceDurabilityCost: 5,
        craftMoney: 375000,
        buybackPrice: 525000,
        materials: {
            yeu_dan_tinh_anh: 10,
            linh_huyet: 10,
            yeu_hach: 4,
        },
    },

    van_tru_hop_dao_dan: {
        id: "van_tru_hop_dao_dan",
        name: "Vạn Trư Hợp Đạo Đan",
        emoji: "🐷",
        type: "shop_item",
        shopItemId: "van_tru_hop_dao_dan",
        requiredAlchemyLevel: 8,
        requiredFurnaceLevel: 5,
        baseSuccessRate: 0.54,
        alchemyExp: 220,
        furnaceDurabilityCost: 6,
        craftMoney: 1250000,
        buybackPrice: 1750000,
        materials: {
            yeu_dan_tinh_anh: 16,
            linh_huyet: 16,
            yeu_hach: 7,
        },
    },

    tru_hoang_thua_thien_dan: {
        id: "tru_hoang_thua_thien_dan",
        name: "Trư Hoàng Thừa Thiên Đan",
        emoji: "👑",
        type: "shop_item",
        shopItemId: "tru_hoang_thua_thien_dan",
        requiredAlchemyLevel: 8,
        requiredFurnaceLevel: 6,
        baseSuccessRate: 0.5,
        alchemyExp: 300,
        furnaceDurabilityCost: 7,
        craftMoney: 3750000,
        buybackPrice: 5250000,
        materials: {
            yeu_dan_tinh_anh: 25,
            linh_huyet: 25,
            yeu_hach: 12,
        },
    },

    cuu_loi_dan_kiep_dan: {
        id: "cuu_loi_dan_kiep_dan",
        name: "Cửu Lôi Dẫn Kiếp Đan",
        emoji: "⚡",
        type: "shop_item",
        shopItemId: "cuu_loi_dan_kiep_dan",
        requiredAlchemyLevel: 9,
        requiredFurnaceLevel: 6,
        baseSuccessRate: 0.47,
        alchemyExp: 420,
        furnaceDurabilityCost: 8,
        craftMoney: 12500000,
        buybackPrice: 17500000,
        materials: {
            yeu_dan_tinh_anh: 40,
            linh_huyet: 40,
            yeu_hach: 20,
        },
    },

    thien_bong_phi_tien_dan: {
        id: "thien_bong_phi_tien_dan",
        name: "Thiên Bồng Phi Tiên Đan",
        emoji: "🪽",
        type: "shop_item",
        shopItemId: "thien_bong_phi_tien_dan",
        requiredAlchemyLevel: 10,
        requiredFurnaceLevel: 7,
        baseSuccessRate: 0.42,
        alchemyExp: 600,
        furnaceDurabilityCost: 10,
        craftMoney: 37500000,
        buybackPrice: 52500000,
        materials: {
            yeu_dan_tinh_anh: 70,
            linh_huyet: 70,
            yeu_hach: 35,
        },
    },
};

module.exports = {
    maxAlchemyLevel: 10,
    maxFurnaceLevel: 7,

    dailyCultivationPillLimit: 10,
    dailyHuntRunPillLimit: 2,

    failureExpRate: 0.25,
    explosionChance: 0.05,

    /*
     * Roll phẩm sau khi đã luyện thành công.
     * Lò chưa đủ cấp sẽ tự giới hạn phẩm tối đa.
     */
    qualityRates: {
        1: 0.65,
        2: 0.27,
        3: 0.07,
        4: 0.01,
    },

    titles: ALCHEMY_TITLES,
    levelExp: LEVEL_EXP,
    furnaces: FURNACES,
    qualities: QUALITIES,
    recipes: RECIPES,
};