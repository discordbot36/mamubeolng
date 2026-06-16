module.exports = {
    da_lo: {
        name: "Đá Lỏ",
        emoji: "🪨",
        price: 100,
    },
    da_cho_Tau: {
        name: "Đá Chợ Tàu",
        emoji: "🪨",
        price: 500,
    },
    da_thach_anh: {
        name: "Đá Thạch Anh",
        emoji: "🧊",
        price: 1500,
    },
    da_ma_nao: {
        name: "Đá Mã Não",
        emoji: "🪨",
        price: 5000,
    },
    da_ngoc_bich: {
        name: "Đá Ngọc Bích",
        emoji: "💎",
        price: 15000,
    },
    da_phi_thuy: {
        name: "Đá Phỉ Thúy",
        emoji: "💠",
        price: 50000,
    },
    da_hoa_dien: {
        name: "Đá Hòa Điền",
        emoji: "🔮",
        price: 150000,
    },
    da_mamu: {
        name: "Đá Mamu",
        emoji: "🐷",
        price: 500000,
    },

    cam_lon_nam_dinh: {
        name: "Cám Lợn Thanh Hóa",
        emoji: "🌾",
        price: 1500,
        type: "tu_tien_exp",
        exp: 300,
        sellable: false,
    },
    cam_lon_tang_trong: {
        name: "Cám Lợn Tăng Trọng",
        emoji: "🥣",
        price: 6000,
        type: "tu_tien_exp",
        exp: 1500,
        sellable: false,
    },
    cam_lon_xin_vl: {
        name: "Cám Lợn Xịn Vl",
        emoji: "✨",
        price: 10000,
        type: "tu_tien_exp",
        exp: 3000,
        sellable: false,
    },
    cam_on_em_vi_tat_ca: {
        name: "Cám ơn em vì tất cả",
        emoji: "💔",
        price: 36000,
        type: "tu_tien_exp",
        exp: 11500,
        sellable: false,
    },

    linh_tru_truc_co_dan: {
        name: "Linh Trư Trúc Cơ Đan",
        emoji: "🧪",
        price: 20000,
        type: "breakthrough_pill",
        fromRealmIndex: 1,
        toRealmIndex: 2,
        bonusChance: 0.15,
        sellable: false,
    },

    kim_nha_ngung_dan: {
        name: "Kim Nha Ngưng Đan",
        emoji: "🟡",
        price: 60000,
        type: "breakthrough_pill",
        fromRealmIndex: 2,
        toRealmIndex: 3,
        bonusChance: 0.15,
        sellable: false,
    },

    tru_anh_hoa_sinh_dan: {
        name: "Trư Anh Hóa Sinh Đan",
        emoji: "👶",
        price: 180000,
        type: "breakthrough_pill",
        fromRealmIndex: 3,
        toRealmIndex: 4,
        bonusChance: 0.15,
        sellable: false,
    },

    thien_bong_hoa_than_dan: {
        name: "Thiên Bồng Hóa Thần Đan",
        emoji: "🌩️",
        price: 500000,
        type: "breakthrough_pill",
        fromRealmIndex: 4,
        toRealmIndex: 5,
        bonusChance: 0.15,
        sellable: false,
    },

    thon_thien_pha_hu_dan: {
        name: "Thôn Thiên Phá Hư Đan",
        emoji: "🌌",
        price: 1500000,
        type: "breakthrough_pill",
        fromRealmIndex: 5,
        toRealmIndex: 6,
        bonusChance: 0.15,
        sellable: false,
    },

    van_tru_hop_dao_dan: {
        name: "Vạn Trư Hợp Đạo Đan",
        emoji: "🐷",
        price: 5000000,
        type: "breakthrough_pill",
        fromRealmIndex: 6,
        toRealmIndex: 7,
        bonusChance: 0.15,
        sellable: false,
    },

    tru_hoang_thua_thien_dan: {
        name: "Trư Hoàng Thừa Thiên Đan",
        emoji: "👑",
        price: 15000000,
        type: "breakthrough_pill",
        fromRealmIndex: 7,
        toRealmIndex: 8,
        bonusChance: 0.15,
        sellable: false,
    },

    cuu_loi_dan_kiep_dan: {
        name: "Cửu Lôi Dẫn Kiếp Đan",
        emoji: "⚡",
        price: 50000000,
        type: "breakthrough_pill",
        fromRealmIndex: 8,
        toRealmIndex: 9,
        bonusChance: 0.15,
        sellable: false,
    },

    thien_bong_phi_tien_dan: {
        name: "Thiên Bồng Phi Tiên Đan",
        emoji: "🪽",
        price: 150000000,
        type: "breakthrough_pill",
        fromRealmIndex: 9,
        toRealmIndex: 10,
        bonusChance: 0.15,
        sellable: false,
    },

    tay_tuy_linh_can_dan: {
        name: "Làm lại cuộc đời nè Nobita",
        emoji: "🌱",
        price: 5000,
        type: "root_gacha_pill",
    },

    bi_tich_ngau_nhien_chu_dong: {
        name: "Bí Tịch Ngẫu Nhiên",
        emoji: "📜",
        price: 100000,
        type: "skill_scroll",
        shopCategory: "skill",
        skillScrollType: "active",
        description: "Mở ra kỹ năng chủ động ngẫu nhiên từ F đến S.",
        rollTable: {
            F: 0.45,
            E: 0.25,
            D: 0.15,
            C: 0.08,
            B: 0.049,
            A: 0.02,
            S: 0.001,
        },
    },

    bi_tich_rach_chu_dong: {
        name: "Bí Tịch Rách",
        emoji: "📄",
        price: 5000,
        type: "skill_scroll",
        shopCategory: "skill",
        skillScrollType: "active",
        description: "Mở ra kỹ năng chủ động phẩm thấp.",
        rollTable: {
            F: 0.7,
            E: 0.25,
            D: 0.05,
        },
    },

    bi_tich_thuong_chu_dong: {
        name: "Bí Tịch Thường",
        emoji: "📘",
        price: 50000,
        type: "skill_scroll",
        shopCategory: "skill",
        skillScrollType: "active",
        description: "Mở ra kỹ năng chủ động phổ thông.",
        rollTable: {
            F: 0.45,
            E: 0.35,
            D: 0.15,
            C: 0.05,
        },
    },

    bi_tich_cao_cap_chu_dong: {
        name: "Bí Tịch Cao Cấp",
        emoji: "📗",
        price: 200000,
        type: "skill_scroll",
        shopCategory: "skill",
        skillScrollType: "active",
        description: "Mở ra kỹ năng chủ động cao cấp.",
        rollTable: {
            E: 0.35,
            D: 0.3,
            C: 0.2,
            B: 0.12,
            A: 0.03,
        },
    },

    bi_tich_thien_giai_chu_dong: {
        name: "Bí Tịch Thiên Giai",
        emoji: "📕",
        price: 1000000,
        type: "skill_scroll",
        shopCategory: "skill",
        skillScrollType: "active",
        description: "Mở ra kỹ năng chủ động phẩm cao, có tỉ lệ ra S.",
        rollTable: {
            D: 0.25,
            C: 0.3,
            B: 0.25,
            A: 0.15,
            S: 0.05,
        },
    },

    bi_tich_mamu_cam_thuat_chu_dong: {
        name: "Bí Tịch Mamu Cấm Thuật",
        emoji: "🐷",
        price: 5000000,
        type: "skill_scroll",
        shopCategory: "skill",
        skillScrollType: "active",
        description: "Mở ra kỹ năng chủ động cực phẩm.",
        rollTable: {
            C: 0.25,
            B: 0.3,
            A: 0.3,
            S: 0.15,
        },
    },

    bi_tich_ngau_nhien_bi_dong: {
        name: "Bí Tịch Ngẫu Nhiên",
        emoji: "📜",
        price: 150000,
        type: "skill_scroll",
        shopCategory: "skill",
        skillScrollType: "passive",
        description: "Mở ra kỹ năng bị động ngẫu nhiên từ F đến S.",
        rollTable: {
            F: 0.45,
            E: 0.25,
            D: 0.15,
            C: 0.08,
            B: 0.045,
            A: 0.02,
            S: 0.005,
        },
    },

    bi_tich_rach_bi_dong: {
        name: "Bí Tịch Rách",
        emoji: "📄",
        price: 5000,
        type: "skill_scroll",
        shopCategory: "skill",
        skillScrollType: "passive",
        description: "Mở ra kỹ năng bị động phẩm thấp.",
        rollTable: {
            F: 0.7,
            E: 0.25,
            D: 0.05,
        },
    },

    bi_tich_thuong_bi_dong: {
        name: "Bí Tịch Thường",
        emoji: "📘",
        price: 80000,
        type: "skill_scroll",
        shopCategory: "skill",
        skillScrollType: "passive",
        description: "Mở ra kỹ năng bị động phổ thông.",
        rollTable: {
            F: 0.45,
            E: 0.35,
            D: 0.15,
            C: 0.05,
        },
    },

    bi_tich_cao_cap_bi_dong: {
        name: "Bí Tịch Cao Cấp",
        emoji: "📗",
        price: 400000,
        type: "skill_scroll",
        shopCategory: "skill",
        skillScrollType: "passive",
        description: "Mở ra kỹ năng bị động cao cấp.",
        rollTable: {
            E: 0.35,
            D: 0.3,
            C: 0.2,
            B: 0.12,
            A: 0.03,
        },
    },

    bi_tich_thien_giai_bi_dong: {
        name: "Bí Tịch Thiên Giai",
        emoji: "📕",
        price: 2000000,
        type: "skill_scroll",
        shopCategory: "skill",
        skillScrollType: "passive",
        description: "Mở ra kỹ năng bị động phẩm cao, có tỉ lệ ra S.",
        rollTable: {
            D: 0.25,
            C: 0.3,
            B: 0.25,
            A: 0.15,
            S: 0.05,
        },
    },

    bi_tich_mamu_cam_thuat_bi_dong: {
        name: "Bí Tịch Mamu Cấm Thuật",
        emoji: "🐷",
        price: 8000000,
        type: "skill_scroll",
        shopCategory: "skill",
        skillScrollType: "passive",
        description: "Mở ra kỹ năng bị động cực phẩm.",
        rollTable: {
            C: 0.25,
            B: 0.3,
            A: 0.3,
            S: 0.15,
        },
    },

    manh_phap_bao: {
        name: "Mảnh Pháp Bảo",
        emoji: "🧩",
        price: 0,
        type: "phap_bao_fragment",
        sellable: false,
        buyable: false,
        description:
            "Dùng để ghép pháp bảo chưa giám định hoặc nâng cấp hệ thống pháp bảo.",
    },

    ruong_phap_bao_cau_may: {
        name: "Rương Pháp Bảo Cầu May",
        emoji: "🎲",
        price: 360000,

        type: "phap_bao_chest",
        shopCategory: "phapbao",

        buyable: true,
        sellable: false,
        hidden: false,

        description: "Rương pháp bảo bình dân. Có tỉ lệ ra phôi từ F tới SSS.",

        phapBaoDrops: [
            {
                type: "unidentified_weapon",
                rarity: "F",
                chance: 62,
            },
            {
                type: "unidentified_weapon",
                rarity: "E",
                chance: 22,
            },
            {
                type: "unidentified_weapon",
                rarity: "D",
                chance: 9,
            },
            {
                type: "unidentified_weapon",
                rarity: "C",
                chance: 4.5,
            },
            {
                type: "unidentified_weapon",
                rarity: "B",
                chance: 1.7,
            },
            {
                type: "unidentified_weapon",
                rarity: "A",
                chance: 0.65,
            },
            {
                type: "unidentified_weapon",
                rarity: "S",
                chance: 0.13,
            },
            {
                type: "unidentified_weapon",
                rarity: "SS",
                chance: 0.019,
            },
            {
                type: "unidentified_weapon",
                rarity: "SSS",
                chance: 0.001,
            },
        ],
    },

    ruong_phap_bao_rach: {
        name: "Rương Pháp Bảo Rách",
        emoji: "📦",
        price: 80000,
        type: "phap_bao_chest",
        shopCategory: "phapbao",
        sellable: false,
        description:
            "Rương pháp bảo cấp thấp. Có thể mở ra mảnh hoặc phôi pháp bảo chưa giám định.",
        phapBaoDrops: [
            {
                type: "fragment",
                weight: 60,
                min: 1,
                max: 8,
            },
            {
                type: "unidentified_weapon",
                rarity: "F",
                weight: 28,
            },
            {
                type: "unidentified_weapon",
                rarity: "E",
                weight: 9,
            },
            {
                type: "unidentified_weapon",
                rarity: "D",
                weight: 2.7,
            },
            {
                type: "unidentified_weapon",
                rarity: "C",
                weight: 0.3,
            },
        ],
    },

    ruong_phap_bao_thuong: {
        name: "Rương Pháp Bảo Thường",
        emoji: "🧰",
        price: 350000,
        type: "phap_bao_chest",
        shopCategory: "phapbao",
        sellable: false,
        description:
            "Rương pháp bảo phổ thông. Có thể mở ra mảnh hoặc phôi pháp bảo chưa giám định.",
        phapBaoDrops: [
            {
                type: "fragment",
                weight: 55,
                min: 5,
                max: 25,
            },
            {
                type: "unidentified_weapon",
                rarity: "F",
                weight: 20,
            },
            {
                type: "unidentified_weapon",
                rarity: "E",
                weight: 12,
            },
            {
                type: "unidentified_weapon",
                rarity: "D",
                weight: 7,
            },
            {
                type: "unidentified_weapon",
                rarity: "C",
                weight: 4,
            },
            {
                type: "unidentified_weapon",
                rarity: "B",
                weight: 1.5,
            },
            {
                type: "unidentified_weapon",
                rarity: "A",
                weight: 0.45,
            },
            {
                type: "unidentified_weapon",
                rarity: "S",
                weight: 0.05,
            },
        ],
    },

    ruong_phap_bao_tinh_anh: {
        name: "Rương Pháp Bảo Tinh Anh",
        emoji: "🎁",
        price: 1500000,
        type: "phap_bao_chest",
        shopCategory: "phapbao",
        sellable: false,
        description:
            "Rương pháp bảo cao cấp hơn. Vẫn có thể ra mảnh, nhưng tỉ lệ phôi ngon cao hơn.",
        phapBaoDrops: [
            {
                type: "fragment",
                weight: 48,
                min: 30,
                max: 120,
            },
            {
                type: "unidentified_weapon",
                rarity: "E",
                weight: 15,
            },
            {
                type: "unidentified_weapon",
                rarity: "D",
                weight: 13,
            },
            {
                type: "unidentified_weapon",
                rarity: "C",
                weight: 10,
            },
            {
                type: "unidentified_weapon",
                rarity: "B",
                weight: 7,
            },
            {
                type: "unidentified_weapon",
                rarity: "A",
                weight: 4,
            },
            {
                type: "unidentified_weapon",
                rarity: "S",
                weight: 2,
            },
            {
                type: "unidentified_weapon",
                rarity: "SS",
                weight: 0.8,
            },
            {
                type: "unidentified_weapon",
                rarity: "SSS",
                weight: 0.2,
            },
        ],
    },

    ruong_phap_bao_mamu: {
        name: "Rương Pháp Bảo Mamu",
        emoji: "🐷",
        price: 8000000,
        type: "phap_bao_chest",
        shopCategory: "phapbao",
        sellable: false,
        description:
            "Rương pháp bảo siêu gacha. Có cơ hội ra phôi SSS, nhưng khi giám định vẫn có thể tụt rarity.",
        phapBaoDrops: [
            {
                type: "fragment",
                weight: 35,
                min: 80,
                max: 260,
            },
            {
                type: "unidentified_weapon",
                rarity: "D",
                weight: 10,
            },
            {
                type: "unidentified_weapon",
                rarity: "C",
                weight: 14,
            },
            {
                type: "unidentified_weapon",
                rarity: "B",
                weight: 17,
            },
            {
                type: "unidentified_weapon",
                rarity: "A",
                weight: 14,
            },
            {
                type: "unidentified_weapon",
                rarity: "S",
                weight: 7,
            },
            {
                type: "unidentified_weapon",
                rarity: "SS",
                weight: 2.5,
            },
            {
                type: "unidentified_weapon",
                rarity: "SSS",
                weight: 0.5,
            },
        ],
    },

    tu_luyen_chest: {
        name: "Rương Tu Luyện",
        emoji: "🎁",
        price: 0,
        type: "cultivation_chest",
        hidden: true,
        buyable: false,
        sellable: false,
        description: "Rương thưởng từ Boss Thế Giới.",
    },

    custom_role: {
        name: "Role Tùy Chỉnh",
        emoji: "<:utit:1328542656405438484>",
        price: 360000,
    },
};
