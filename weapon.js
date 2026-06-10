const RARITIES = {
    C: {
        id: "C",
        name: "Phàm Binh",
        emoji: "⚪",
        color: 0x95a5a6,
        rank: 1,
    },

    B: {
        id: "B",
        name: "Tinh Binh",
        emoji: "🟢",
        color: 0x2ecc71,
        rank: 2,
    },

    A: {
        id: "A",
        name: "Linh Binh",
        emoji: "🔵",
        color: 0x3498db,
        rank: 3,
    },

    S: {
        id: "S",
        name: "Tiên Binh",
        emoji: "🟣",
        color: 0x9b59b6,
        rank: 4,
    },

    SS: {
        id: "SS",
        name: "Thần Binh",
        emoji: "🟠",
        color: 0xe67e22,
        rank: 5,
    },

    SSS: {
        id: "SSS",
        name: "Cổ Thần Binh",
        emoji: "🔴",
        color: 0xe74c3c,
        rank: 6,
    },

    EX: {
        id: "EX",
        name: "Chí Tôn Thần Khí",
        emoji: "🌈",
        color: 0xf1c40f,
        rank: 7,
    },
};

const WEAPONS = [
    {
        id: "gay_tre_mamu",
        name: "Gậy Tre Mamu",
        emoji: "🎋",
        rarity: "C",

        baseStats: {
            atkPercent: 0.02,
        },

        passive: null,
    },

    {
        id: "dao_choc_tiet",
        name: "Dao Chọc Tiết",
        emoji: "🔪",
        rarity: "B",

        baseStats: {
            atkPercent: 0.04,
        },

        passive: null,
    },

    {
        id: "linh_tru_kiem",
        name: "Linh Trư Kiếm",
        emoji: "⚔️",
        rarity: "A",

        baseStats: {
            atkPercent: 0.08,
            critChance: 0.03,
        },

        passive: null,
    },

    {
        id: "huyet_nha_ma_dao",
        name: "Huyết Nha Ma Đao",
        emoji: "🩸",
        rarity: "S",

        baseStats: {
            atkPercent: 0.15,
            lifeSteal: 0.05,
        },

        passive: {
            id: "huyet_sat",
            name: "Huyết Sát",
            description: "Gây thêm 12% sát thương khi mục tiêu dưới 30% HP.",
        },
    },

    {
        id: "loi_tru_pha_thien_thuong",
        name: "Lôi Trư Phá Thiên Thương",
        emoji: "⚡",
        rarity: "SS",

        baseStats: {
            atkPercent: 0.2,
            speedPercent: 0.08,
        },

        passive: {
            id: "loi_kich",
            name: "Lôi Kích",
            description: "Mỗi đòn đánh có 12% xác suất gây thêm 70% ATK.",
        },
    },

    {
        id: "van_tru_tru_tien_kiem",
        name: "Vạn Trư Tru Tiên Kiếm",
        emoji: "🗡️",
        rarity: "SSS",

        baseStats: {
            atkPercent: 0.24,
            critChance: 0.08,
            critDamage: 0.18,
        },

        passive: {
            id: "tru_tien",
            name: "Tru Tiên",
            description: "Khi chí mạng có 20% xác suất gây thêm 80% ATK.",
        },
    },

    {
        id: "huyet_tru_do_long_dao",
        name: "Huyết Trư Đồ Long Đao",
        emoji: "🐉",
        rarity: "SSS",

        baseStats: {
            atkPercent: 0.26,
            lifeSteal: 0.08,
            critDamage: 0.15,
        },

        passive: {
            id: "do_long",
            name: "Đồ Long",
            description: "Tăng 20% sát thương khi mục tiêu dưới 30% HP.",
        },
    },

    {
        id: "cuu_xi_dinh_ba",
        name: "Cửu Xỉ Đinh Ba",
        emoji: "🔱",
        rarity: "SSS",

        baseStats: {
            atkPercent: 0.25,
            hpPercent: 0.15,
            defensePercent: 0.12,
        },

        passive: {
            id: "cuu_xi_pha_giap",
            name: "Cửu Xỉ Phá Giáp",
            description:
                "Mỗi đòn đánh có 18% xác suất gây thêm 100% ATK và giảm 15% DEF mục tiêu trong 2 lượt.",
        },

        powerRank: 2,
    },

    {
        id: "phong_lon_hoang_kim",
        name: "Phóng Lợn Hoàng Kim",
        emoji: "🐷",
        rarity: "EX",

        baseStats: {
            atkPercent: 0.3,
            hpPercent: 0.18,
            critDamage: 0.25,
        },

        passive: {
            id: "phong_lon",
            name: "Phóng Lợn",
            description:
                "Mỗi đòn đánh có 15% xác suất gây thêm 150% ATK, không thể né và hồi 5% HP tối đa.",
        },

        powerRank: 1,
    },
];

const SUB_STATS = {
    atkPercent: {
        name: "Tấn công",
        emoji: "⚔️",
        format: "percent",
    },

    hpPercent: {
        name: "Sinh lực",
        emoji: "❤️",
        format: "percent",
    },

    defensePercent: {
        name: "Phòng thủ",
        emoji: "🛡️",
        format: "percent",
    },

    critChance: {
        name: "Tỉ lệ chí mạng",
        emoji: "🎯",
        format: "percent",
    },

    critDamage: {
        name: "Sát thương chí mạng",
        emoji: "💥",
        format: "percent",
    },

    defenseIgnore: {
        name: "Xuyên phòng thủ",
        emoji: "🗡️",
        format: "percent",
    },

    speedPercent: {
        name: "Tốc độ",
        emoji: "💨",
        format: "percent",
    },

    lifeSteal: {
        name: "Hút máu",
        emoji: "🩸",
        format: "percent",
    },

    damageReduction: {
        name: "Giảm sát thương",
        emoji: "🛡️",
        format: "percent",
    },

    dodgeChance: {
        name: "Né tránh",
        emoji: "🌪️",
        format: "percent",
    },

    counterChance: {
        name: "Phản đòn",
        emoji: "↩️",
        format: "percent",
    },

    bossDamage: {
        name: "Sát thương Boss",
        emoji: "👹",
        format: "percent",
    },

    expBonus: {
        name: "Tu vi nhận được",
        emoji: "✨",
        format: "percent",
    },

    moneyBonus: {
        name: "Tiền nhận được",
        emoji: "💰",
        format: "percent",
    },

    dropRate: {
        name: "Tỉ lệ rơi đồ",
        emoji: "🍀",
        format: "percent",
    },
};

function getWeaponById(weaponId) {
    return WEAPONS.find((weapon) => weapon.id === weaponId) || null;
}

function getRarity(rarityId) {
    return RARITIES[rarityId] || RARITIES.C;
}

module.exports = {
    rarities: RARITIES,
    weapons: WEAPONS,
    subStats: SUB_STATS,
    getWeaponById,
    getRarity,
};
