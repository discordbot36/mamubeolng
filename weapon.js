const RARITIES = {
    F: {
        id: "F",
        name: "Rác Phẩm",
        emoji: "⚫",
        color: 0x7f8c8d,
        rank: 1,
        maxStars: 3,
        basePowerPercent: 0.02,
        realmRequiredIndex: 0,
    },

    E: {
        id: "E",
        name: "Heo Phẩm",
        emoji: "🟤",
        color: 0x8e5a2b,
        rank: 2,
        maxStars: 3,
        basePowerPercent: 0.04,
        realmRequiredIndex: 0,
    },

    D: {
        id: "D",
        name: "Lợn Phẩm",
        emoji: "⚙️",
        color: 0x95a5a6,
        rank: 3,
        maxStars: 4,
        basePowerPercent: 0.06,
        realmRequiredIndex: 1,
    },

    C: {
        id: "C",
        name: "Phàm Binh",
        emoji: "⚪",
        color: 0xbdc3c7,
        rank: 4,
        maxStars: 4,
        basePowerPercent: 0.09,
        realmRequiredIndex: 2,
    },

    B: {
        id: "B",
        name: "Tinh Binh",
        emoji: "🟢",
        color: 0x2ecc71,
        rank: 5,
        maxStars: 5,
        basePowerPercent: 0.14,
        realmRequiredIndex: 3,
    },

    A: {
        id: "A",
        name: "Linh Binh",
        emoji: "🔵",
        color: 0x3498db,
        rank: 6,
        maxStars: 5,
        basePowerPercent: 0.21,
        realmRequiredIndex: 4,
    },

    S: {
        id: "S",
        name: "Tiên Binh",
        emoji: "🟣",
        color: 0x9b59b6,
        rank: 7,
        maxStars: 6,
        basePowerPercent: 0.31,
        realmRequiredIndex: 5,
    },

    SS: {
        id: "SS",
        name: "Thần Binh",
        emoji: "🟠",
        color: 0xe67e22,
        rank: 8,
        maxStars: 6,
        basePowerPercent: 0.44,
        realmRequiredIndex: 6,
    },

    SSS: {
        id: "SSS",
        name: "Cổ Thần Binh",
        emoji: "🔴",
        color: 0xe74c3c,
        rank: 9,
        maxStars: 7,
        basePowerPercent: 0.61,
        realmRequiredIndex: 7,
    },

    EX: {
        id: "EX",
        name: "Chí Tôn Thần Khí",
        emoji: "🌈",
        color: 0xf1c40f,
        rank: 10,
        maxStars: 9,
        basePowerPercent: 0.9,
        realmRequiredIndex: 9,
    },
};

const APPRAISAL_RARITY_TABLES = {
    F: {
        F: 0.85,
        E: 0.15,
    },

    E: {
        F: 0.25,
        E: 0.6,
        D: 0.15,
    },

    D: {
        E: 0.25,
        D: 0.55,
        C: 0.18,
        B: 0.02,
    },

    C: {
        D: 0.25,
        C: 0.5,
        B: 0.2,
        A: 0.05,
    },

    B: {
        C: 0.25,
        B: 0.45,
        A: 0.23,
        S: 0.07,
    },

    A: {
        B: 0.2,
        A: 0.5,
        S: 0.24,
        SS: 0.055,
        SSS: 0.005,
    },

    S: {
        A: 0.18,
        S: 0.55,
        SS: 0.24,
        SSS: 0.03,
    },

    SS: {
        A: 0.12,
        S: 0.3,
        SS: 0.5,
        SSS: 0.08,
    },

    SSS: {
        SS: 0.4,
        SSS: 0.6,
    },

    EX: {
        SSS: 0.75,
        EX: 0.25,
    },
};

const QUALITIES = {
    tan_khuyet: {
        id: "tan_khuyet",
        name: "Tàn Khuyết",
        emoji: "🪨",
        weight: 35,
        multiplier: 0.7,
    },

    ha_pham: {
        id: "ha_pham",
        name: "Hạ Phẩm",
        emoji: "🥉",
        weight: 30,
        multiplier: 0.85,
    },

    trung_pham: {
        id: "trung_pham",
        name: "Trung Phẩm",
        emoji: "🥈",
        weight: 20,
        multiplier: 1,
    },

    thuong_pham: {
        id: "thuong_pham",
        name: "Thượng Phẩm",
        emoji: "🥇",
        weight: 10,
        multiplier: 1.18,
    },

    cuc_pham: {
        id: "cuc_pham",
        name: "Cực Phẩm",
        emoji: "💎",
        weight: 4,
        multiplier: 1.4,
    },

    thien_pham: {
        id: "thien_pham",
        name: "Thiên Phẩm",
        emoji: "🌟",
        weight: 0.9,
        multiplier: 1.7,
    },

    hon_don: {
        id: "hon_don",
        name: "Hỗn Độn",
        emoji: "🌌",
        weight: 0.1,
        multiplier: 2.1,
    },
};

const STAR_MULTIPLIERS = {
    0: 1,
    1: 1.08,
    2: 1.18,
    3: 1.32,
    4: 1.5,
    5: 1.75,
    6: 2.05,
    7: 2.4,
    8: 2.8,
    9: 3.3,
};

const SUB_STATS = {
    atkPercent: {
        id: "atkPercent",
        name: "Tấn công",
        emoji: "⚔️",
        format: "percent",
        group: "good",
        weight: 16,
    },

    hpPercent: {
        id: "hpPercent",
        name: "Sinh lực",
        emoji: "❤️",
        format: "percent",
        group: "good",
        weight: 14,
    },

    defensePercent: {
        id: "defensePercent",
        name: "Phòng thủ",
        emoji: "🛡️",
        format: "percent",
        group: "good",
        weight: 14,
    },

    critChance: {
        id: "critChance",
        name: "Tỉ lệ chí mạng",
        emoji: "🎯",
        format: "percent",
        group: "rare",
        weight: 6,
    },

    critDamage: {
        id: "critDamage",
        name: "Sát thương chí mạng",
        emoji: "💥",
        format: "percent",
        group: "rare",
        weight: 6,
    },

    defenseIgnore: {
        id: "defenseIgnore",
        name: "Xuyên phòng thủ",
        emoji: "🗡️",
        format: "percent",
        group: "rare",
        weight: 5,
    },

    speedPercent: {
        id: "speedPercent",
        name: "Tốc độ",
        emoji: "💨",
        format: "percent",
        group: "good",
        weight: 8,
    },

    lifeSteal: {
        id: "lifeSteal",
        name: "Hút máu",
        emoji: "🩸",
        format: "percent",
        group: "rare",
        weight: 3,
    },

    dodgeChance: {
        id: "dodgeChance",
        name: "Né tránh",
        emoji: "🌪️",
        format: "percent",
        group: "rare",
        weight: 3,
    },

    counterChance: {
        id: "counterChance",
        name: "Phản đòn",
        emoji: "↩️",
        format: "percent",
        group: "rare",
        weight: 3,
    },

    bossDamage: {
        id: "bossDamage",
        name: "Sát thương Boss",
        emoji: "👹",
        format: "percent",
        group: "rare",
        weight: 5,
    },

    dropRate: {
        id: "dropRate",
        name: "Tỉ lệ rơi đồ",
        emoji: "🍀",
        format: "percent",
        group: "rare",
        weight: 2,
    },

    trashTalkPower: {
        id: "trashTalkPower",
        name: "Độ Mõm",
        emoji: "🗣️",
        format: "percent",
        group: "trash",
        weight: 18,
    },

    pigAura: {
        id: "pigAura",
        name: "Hào Quang Lợn",
        emoji: "🐷",
        format: "percent",
        group: "trash",
        weight: 18,
    },

    sleepPower: {
        id: "sleepPower",
        name: "Công Lực Ngủ Ngáy",
        emoji: "💤",
        format: "percent",
        group: "trash",
        weight: 14,
    },

    badLuckResist: {
        id: "badLuckResist",
        name: "Kháng Đen Đủi Mõm",
        emoji: "☔",
        format: "percent",
        group: "trash",
        weight: 14,
    },
};

const SUB_STAT_VALUE_RANGES = {
    F: [0.002, 0.01],
    E: [0.004, 0.015],
    D: [0.006, 0.025],
    C: [0.01, 0.04],
    B: [0.015, 0.065],
    A: [0.025, 0.09],
    S: [0.04, 0.13],
    SS: [0.06, 0.18],
    SSS: [0.08, 0.25],
    EX: [0.12, 0.35],
};

const SUB_STAT_COUNT_TABLES = {
    F: {
        0: 0.7,
        1: 0.3,
    },

    E: {
        1: 1,
    },

    D: {
        1: 0.6,
        2: 0.4,
    },

    C: {
        2: 1,
    },

    B: {
        2: 0.65,
        3: 0.35,
    },

    A: {
        3: 1,
    },

    S: {
        3: 0.6,
        4: 0.4,
    },

    SS: {
        4: 1,
    },

    SSS: {
        4: 0.7,
        5: 0.3,
    },

    EX: {
        5: 0.7,
        6: 0.3,
    },
};

const WEAPONS = [
    // F
    { id: "gay_go_muc", name: "Gậy Gỗ Mục", emoji: "🪵", rarity: "F" },
    {
        id: "xeng_chuong_heo",
        name: "Xẻng Chuồng Heo",
        emoji: "🧹",
        rarity: "F",
    },
    {
        id: "cuc_gach_khai_thien",
        name: "Cục Gạch Khai Thiên",
        emoji: "🧱",
        rarity: "F",
    },
    {
        id: "nap_noi_phong_than",
        name: "Nắp Nồi Phòng Thân",
        emoji: "🍳",
        rarity: "F",
    },
    { id: "xuong_heo_co", name: "Xương Heo Cổ", emoji: "🦴", rarity: "F" },

    // E
    {
        id: "dao_phay_linh_khi",
        name: "Dao Phay Linh Khí",
        emoji: "🔪",
        rarity: "E",
    },
    { id: "bua_dap_cam", name: "Búa Đập Cám", emoji: "🔨", rarity: "E" },
    {
        id: "mong_heo_thiet_trao",
        name: "Móng Heo Thiết Trảo",
        emoji: "🐾",
        rarity: "E",
    },
    { id: "chuy_dau_heo", name: "Chùy Đầu Heo", emoji: "🐷", rarity: "E" },
    { id: "riu_bo_mang", name: "Rìu Bổ Máng", emoji: "🪓", rarity: "E" },

    // D
    { id: "hac_tru_dao", name: "Hắc Trư Đao", emoji: "⚔️", rarity: "D" },
    { id: "thanh_nha_kiem", name: "Thanh Nha Kiếm", emoji: "🗡️", rarity: "D" },
    { id: "huyet_bi_chuy", name: "Huyết Bì Chùy", emoji: "🔨", rarity: "D" },
    {
        id: "phong_tru_phien",
        name: "Phong Trư Phiến",
        emoji: "🪭",
        rarity: "D",
    },
    {
        id: "xich_tru_song_nhan",
        name: "Xích Trư Song Nhận",
        emoji: "⚔️",
        rarity: "D",
    },

    // C
    { id: "linh_tru_kiem", name: "Linh Trư Kiếm", emoji: "⚔️", rarity: "C" },
    {
        id: "bach_nha_phap_kiem",
        name: "Bạch Nha Pháp Kiếm",
        emoji: "🗡️",
        rarity: "C",
    },
    {
        id: "hoa_mang_chien_chuy",
        name: "Hỏa Máng Chiến Chùy",
        emoji: "🔥",
        rarity: "C",
    },
    { id: "tu_khi_phi_dao", name: "Tử Khí Phi Đao", emoji: "🔪", rarity: "C" },
    { id: "hac_phong_liem", name: "Hắc Phong Liêm", emoji: "☠️", rarity: "C" },

    // B
    {
        id: "kim_nha_tram_yeu_dao",
        name: "Kim Nha Trảm Yêu Đao",
        emoji: "🐗",
        rarity: "B",
    },
    {
        id: "bich_huyet_linh_kiem",
        name: "Bích Huyết Linh Kiếm",
        emoji: "💚",
        rarity: "B",
    },
    {
        id: "thien_moc_tru_truong",
        name: "Thiên Mộc Trư Trượng",
        emoji: "🌲",
        rarity: "B",
    },
    {
        id: "xich_diem_ma_dao",
        name: "Xích Diệm Ma Đao",
        emoji: "🔥",
        rarity: "B",
    },
    {
        id: "long_cot_phap_truong",
        name: "Long Cốt Pháp Trượng",
        emoji: "🐉",
        rarity: "B",
    },

    // A
    { id: "thien_tru_kiem", name: "Thiên Trư Kiếm", emoji: "🔵", rarity: "A" },
    {
        id: "huyet_nha_ma_dao",
        name: "Huyết Nha Ma Đao",
        emoji: "🩸",
        rarity: "A",
    },
    {
        id: "cuu_viem_pha_son_chuy",
        name: "Cửu Viêm Phá Sơn Chùy",
        emoji: "🔥",
        rarity: "A",
    },
    {
        id: "hac_long_doat_menh_liem",
        name: "Hắc Long Đoạt Mệnh Liêm",
        emoji: "🐉",
        rarity: "A",
    },
    {
        id: "xich_huyet_song_long_nhan",
        name: "Xích Huyết Song Long Nhận",
        emoji: "⚔️",
        rarity: "A",
    },

    // S
    {
        id: "tram_thien_tru_kiem",
        name: "Trảm Thiên Trư Kiếm",
        emoji: "🟣",
        rarity: "S",
    },
    {
        id: "loi_tru_pha_thien_thuong",
        name: "Lôi Trư Phá Thiên Thương",
        emoji: "⚡",
        rarity: "S",
    },
    {
        id: "huyet_hai_ma_dao",
        name: "Huyết Hải Ma Đao",
        emoji: "🌊",
        rarity: "S",
    },
    {
        id: "long_tuong_tran_nguc_chuy",
        name: "Long Tượng Trấn Ngục Chùy",
        emoji: "🐘",
        rarity: "S",
    },
    {
        id: "thien_hoa_phan_son_dao",
        name: "Thiên Hỏa Phần Sơn Đao",
        emoji: "🔥",
        rarity: "S",
    },

    // SS
    {
        id: "than_tru_diet_dao_kiem",
        name: "Thần Trư Diệt Đạo Kiếm",
        emoji: "🟠",
        rarity: "SS",
    },
    {
        id: "cuu_thien_loi_dinh_thuong",
        name: "Cửu Thiên Lôi Đình Thương",
        emoji: "⚡",
        rarity: "SS",
    },
    {
        id: "huyet_nguc_do_ma_dao",
        name: "Huyết Ngục Đồ Ma Đao",
        emoji: "🩸",
        rarity: "SS",
    },
    {
        id: "can_khon_tran_ma_chuy",
        name: "Càn Khôn Trấn Ma Chùy",
        emoji: "🔨",
        rarity: "SS",
    },
    {
        id: "am_duong_pha_gioi_phien",
        name: "Âm Dương Phá Giới Phiến",
        emoji: "☯️",
        rarity: "SS",
    },

    // SSS
    {
        id: "van_tru_tru_tien_kiem",
        name: "Vạn Trư Tru Tiên Kiếm",
        emoji: "🗡️",
        rarity: "SSS",
    },
    {
        id: "huyet_tru_do_long_dao",
        name: "Huyết Trư Đồ Long Đao",
        emoji: "🐉",
        rarity: "SSS",
    },
    {
        id: "cuu_xi_dinh_ba",
        name: "Cửu Xỉ Đinh Ba",
        emoji: "🔱",
        rarity: "SSS",
    },
    {
        id: "thai_so_hon_don_kiem",
        name: "Thái Sơ Hỗn Độn Kiếm",
        emoji: "🌌",
        rarity: "SSS",
    },
    {
        id: "mamu_cam_ky_than_kiem",
        name: "Mamu Cấm Kỵ Thần Kiếm",
        emoji: "🐷",
        rarity: "SSS",
    },

    // EX - nhá hàng, chưa cho rơi thường
    {
        id: "phong_lon_hoang_kim",
        name: "Phóng Lợn Hoàng Kim",
        emoji: "🐷",
        rarity: "EX",
    },
    {
        id: "mamu_khai_thien_phu",
        name: "Mamu Khai Thiên Phủ",
        emoji: "🪓",
        rarity: "EX",
    },
    {
        id: "cam_ky_diet_server_kiem",
        name: "Cấm Kỵ Diệt Server Kiếm",
        emoji: "💀",
        rarity: "EX",
    },
];

function rollWeighted(table) {
    const entries = Object.entries(table || {});
    const totalWeight = entries.reduce((sum, [, weight]) => {
        return sum + Number(weight || 0);
    }, 0);

    if (totalWeight <= 0) {
        return entries[0]?.[0] || null;
    }

    let random = Math.random() * totalWeight;

    for (const [key, weight] of entries) {
        random -= Number(weight || 0);

        if (random <= 0) {
            return key;
        }
    }

    return entries[entries.length - 1]?.[0] || null;
}

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

function roundPercentValue(value) {
    return Math.round(Number(value || 0) * 10000) / 10000;
}

function getRarity(rarityId) {
    return RARITIES[rarityId] || RARITIES.F;
}

function getWeaponById(weaponId) {
    return WEAPONS.find((weapon) => weapon.id === weaponId) || null;
}

function getWeaponsByRarity(rarityId) {
    return WEAPONS.filter((weapon) => weapon.rarity === rarityId);
}

function rollFinalRarityFromUnidentifiedRarity(unidentifiedRarity) {
    const table = APPRAISAL_RARITY_TABLES[unidentifiedRarity];

    if (!table) {
        return unidentifiedRarity || "F";
    }

    return rollWeighted(table) || unidentifiedRarity || "F";
}

function rollQuality() {
    const table = Object.fromEntries(
        Object.values(QUALITIES).map((quality) => {
            return [quality.id, quality.weight];
        }),
    );

    const qualityId = rollWeighted(table);

    return QUALITIES[qualityId] || QUALITIES.trung_pham;
}

function rollWeaponByRarity(rarityId) {
    const pool = getWeaponsByRarity(rarityId);

    if (pool.length <= 0) {
        return null;
    }

    return pool[Math.floor(Math.random() * pool.length)];
}

function rollSubStatCount(rarityId) {
    const table = SUB_STAT_COUNT_TABLES[rarityId] || SUB_STAT_COUNT_TABLES.F;

    return Number(rollWeighted(table) || 0);
}

function rollSubStatId(excludedIds = []) {
    const excluded = new Set(excludedIds);

    const table = Object.fromEntries(
        Object.values(SUB_STATS)
            .filter((stat) => !excluded.has(stat.id))
            .map((stat) => {
                return [stat.id, stat.weight];
            }),
    );

    return rollWeighted(table);
}

function rollSubStatValue(rarityId, statId) {
    const [min, max] =
        SUB_STAT_VALUE_RANGES[rarityId] || SUB_STAT_VALUE_RANGES.F;
    const stat = SUB_STATS[statId];

    if (!stat) {
        return 0;
    }

    let value = randomBetween(min, max);

    if (stat.group === "trash") {
        value *= 0.7;
    }

    if (
        [
            "critChance",
            "lifeSteal",
            "dodgeChance",
            "counterChance",
            "dropRate",
        ].includes(statId)
    ) {
        value *= 0.55;
    }

    return roundPercentValue(value);
}

function rollSubStats(rarityId) {
    const count = rollSubStatCount(rarityId);
    const subStats = [];
    const usedIds = [];

    for (let i = 0; i < count; i += 1) {
        const statId = rollSubStatId(usedIds);

        if (!statId) {
            continue;
        }

        usedIds.push(statId);

        subStats.push({
            id: statId,
            value: rollSubStatValue(rarityId, statId),
        });
    }

    return subStats;
}

function formatPercent(value) {
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function formatSubStat(statLine) {
    const stat = SUB_STATS[statLine.id];

    if (!stat) {
        return `❔ ${statLine.id}: ${statLine.value}`;
    }

    if (stat.format === "percent") {
        return `${stat.emoji} ${stat.name}: +${formatPercent(statLine.value)}`;
    }

    return `${stat.emoji} ${stat.name}: +${statLine.value}`;
}

module.exports = {
    rarities: RARITIES,
    appraisalRarityTables: APPRAISAL_RARITY_TABLES,
    qualities: QUALITIES,
    starMultipliers: STAR_MULTIPLIERS,
    weapons: WEAPONS,
    subStats: SUB_STATS,

    rollWeighted,
    getRarity,
    getWeaponById,
    getWeaponsByRarity,
    rollFinalRarityFromUnidentifiedRarity,
    rollQuality,
    rollWeaponByRarity,
    rollSubStats,
    rollSubStatId,
    rollSubStatValue,
    formatPercent,
    formatSubStat,
};
