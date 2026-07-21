const stageNames = [
    "Chuồng Heo Linh Khí",
    "Rừng Trư Yêu",
    "Hang Lợn Đen",
    "Động Mamu Hôi",
    "Cốc Linh Trư",
    "Mộ Trư Cổ",
    "Huyết Trì Lợn Ma",
    "Thiên Lao Mamu",

    "Vực Trư Ma",
    "Cổ Thành Linh Lợn",
    "Địa Cung Hắc Trư",
    "Ma Giới Mamu",
    "Thiên Trư Thánh Địa",
    "Vạn Trư Cổ Mộ",
    "Hư Không Trư Vực",
    "Đế Cung Mamu",

    "Thần Mộ Trư Tổ",
    "Tinh Hải Linh Trư",
    "Thiên Ngoại Trư Giới",
    "Mamu Thần Điện",
];

const monsterNames = [
    "Linh Trư Con",
    "Trư Yêu Gác Cổng",
    "Hắc Lợn Sơn Tặc",
    "Mamu Tàn Hồn",
    "Thiết Bì Trư Quái",
    "Trư Hồn Tu La",
    "Lợn Ma Huyết Nhãn",
    "Mamu Cổ Thú",

    "Trư Ma Vực Chủ",
    "Linh Lợn Cổ Vương",
    "Hắc Trư Địa Hoàng",
    "Mamu Ma Đế",
    "Thiên Trư Thánh Tướng",
    "Vạn Trư Mộ Chủ",
    "Hư Không Trư Thần",
    "Mamu Đế Tôn",

    "Trư Tổ Tàn Hồn",
    "Tinh Hải Trư Vương",
    "Thiên Ngoại Trư Đế",
    "Mamu Thần Chủ",
];

function getZoneMultiplier(stage) {
    const safeStage = Math.max(1, Number(stage || 1));

    const zone = Math.floor((safeStage - 1) / 10);

    const earlyMultipliers = [0.9, 1.25, 1.85, 2.65, 3.75, 5.25, 7.2, 9.7];

    if (zone < earlyMultipliers.length) {
        return earlyMultipliers[zone];
    }
    return (
        earlyMultipliers[earlyMultipliers.length - 1] *
        Math.pow(1.28, zone - (earlyMultipliers.length - 1))
    );
}

function getRequiredPower(stage) {
    const safeStage = Math.max(1, Number(stage || 1));

    return Math.floor(
        560 * Math.pow(safeStage, 1.46) * getZoneMultiplier(safeStage),
    );
}

function getFirstClearMoney(stage) {
    if (stage <= 10) {
        return Math.floor(stage * 120 + Math.pow(stage, 1.1) * 60);
    }

    if (stage <= 25) {
        return Math.floor(stage * 220 + Math.pow(stage, 1.15) * 90);
    }

    if (stage <= 50) {
        return Math.floor(stage * 380 + Math.pow(stage, 1.2) * 140);
    }

    return Math.floor(stage * 650 + Math.pow(stage, 1.25) * 220);
}
function getFirstClearExp(stage) {
    return Math.floor(80 + stage * 18 + Math.pow(stage, 1.08) * 10);
}

function getSweepExp(stage) {
    return Math.floor(8 + stage * 2 + Math.pow(stage, 1.02) * 2);
}
function getSweepMoneyRange(stage) {
    if (stage <= 10) {
        const min = Math.floor(stage * 35 + Math.pow(stage, 1.05) * 20);
        const max = Math.floor(stage * 70 + Math.pow(stage, 1.08) * 35);

        return [min, max];
    }

    if (stage <= 25) {
        const min = Math.floor(stage * 60 + Math.pow(stage, 1.08) * 35);
        const max = Math.floor(stage * 120 + Math.pow(stage, 1.12) * 60);

        return [min, max];
    }

    if (stage <= 50) {
        const min = Math.floor(stage * 100 + Math.pow(stage, 1.12) * 60);
        const max = Math.floor(stage * 190 + Math.pow(stage, 1.16) * 100);

        return [min, max];
    }

    const min = Math.floor(stage * 160 + Math.pow(stage, 1.18) * 100);
    const max = Math.floor(stage * 300 + Math.pow(stage, 1.22) * 170);

    return [min, max];
}

function getFirstClearItems(stage) {
    if (stage <= 10) {
        const items = [{ itemId: "cam_lon_nam_dinh", amount: 1 }];

        if (stage % 5 === 0) {
            items.push({ itemId: "bi_tich_rach_chu_dong", amount: 1 });
        }

        if (stage % 10 === 0) {
            items.push({ itemId: "bi_tich_rach_bi_dong", amount: 1 });
        }

        return items;
    }

    if (stage <= 25) {
        const items = [{ itemId: "cam_lon_tang_trong", amount: 1 }];

        if (stage % 5 === 0) {
            items.push({ itemId: "bi_tich_thuong_chu_dong", amount: 1 });
        }

        if (stage % 10 === 0) {
            items.push({ itemId: "bi_tich_thuong_bi_dong", amount: 1 });
        }

        return items;
    }

    if (stage <= 50) {
        const items = [{ itemId: "cam_lon_xin_vl", amount: 1 }];

        if (stage % 5 === 0) {
            items.push({ itemId: "bi_tich_cao_cap_chu_dong", amount: 1 });
        }

        if (stage % 10 === 0) {
            items.push({ itemId: "bi_tich_cao_cap_bi_dong", amount: 1 });
        }

        if (stage % 25 === 0) {
            items.push({ itemId: "tay_tuy_linh_can_dan", amount: 1 });
        }

        return items;
    }

    const zone = Math.floor((stage - 1) / 10);

    const items = [
        {
            itemId: "cam_lon_xin_vl",
            amount: Math.min(8, 2 + Math.floor(zone / 4)),
        },
    ];

    if (stage % 10 === 0) {
        items.push({
            itemId: "bi_tich_thien_giai_chu_dong",
            amount: stage >= 150 ? 2 : 1,
        });
    }

    if (stage % 20 === 0) {
        items.push({
            itemId: "bi_tich_thien_giai_bi_dong",
            amount: stage >= 160 ? 2 : 1,
        });
    }

    if (stage % 25 === 0) {
        items.push({
            itemId: "tay_tuy_linh_can_dan",
            amount: stage >= 100 ? 2 : 1,
        });
    }

    if (stage % 50 === 0) {
        items.push({
            itemId: "ruong_phap_bao_tinh_anh",
            amount: stage >= 150 ? 2 : 1,
        });
    }

    if (stage % 100 === 0) {
        items.push({
            itemId: "ruong_phap_bao_mamu",
            amount: 1,
        });
    }

    if (stage % 80 === 0) {
        items.push({
            itemId: "bi_tich_mamu_cam_thuat_chu_dong",
            amount: 1,
        });
    }

    return items;
}

function getSweepDrops(stage) {
    if (stage <= 10) {
        return [
            { itemId: "cam_lon_nam_dinh", amount: 1, chance: 82 },
            { itemId: "cam_lon_tang_trong", amount: 1, chance: 12 },
            { itemId: "bi_tich_rach_chu_dong", amount: 1, chance: 3 },
            { itemId: "bi_tich_rach_bi_dong", amount: 1, chance: 3 },
        ];
    }

    if (stage <= 25) {
        return [
            { itemId: "cam_lon_nam_dinh", amount: 1, chance: 25 },
            { itemId: "cam_lon_tang_trong", amount: 1, chance: 55 },
            { itemId: "cam_lon_xin_vl", amount: 1, chance: 10 },
            { itemId: "bi_tich_thuong_chu_dong", amount: 1, chance: 5 },
            { itemId: "bi_tich_thuong_bi_dong", amount: 1, chance: 5 },
        ];
    }

    if (stage <= 50) {
        return [
            { itemId: "cam_lon_tang_trong", amount: 1, chance: 35 },
            { itemId: "cam_lon_xin_vl", amount: 1, chance: 48 },
            { itemId: "bi_tich_cao_cap_chu_dong", amount: 1, chance: 6 },
            { itemId: "bi_tich_cao_cap_bi_dong", amount: 1, chance: 6 },
            { itemId: "tay_tuy_linh_can_dan", amount: 1, chance: 5 },
        ];
    }

    const highStageBonus = Math.min(
        20,
        Math.floor(Math.max(0, stage - 50) / 10) * 2,
    );

    return [
        {
            itemId: "cam_lon_xin_vl",
            amount: 1,
            chance: Math.max(35, 62 - highStageBonus),
        },
        {
            itemId: "cam_lon_xin_vl",
            amount: stage >= 150 ? 4 : stage >= 100 ? 3 : 2,
            chance: 18 + highStageBonus,
        },
        {
            itemId: "bi_tich_thien_giai_chu_dong",
            amount: 1,
            chance: 5,
        },
        {
            itemId: "bi_tich_thien_giai_bi_dong",
            amount: 1,
            chance: 5,
        },
        {
            itemId: "tay_tuy_linh_can_dan",
            amount: 1,
            chance: 8,
        },
        {
            itemId: "ruong_phap_bao_tinh_anh",
            amount: 1,
            chance: stage >= 100 ? 3 : 1,
        },
    ];
}

function buildStage(stage) {
    const zoneIndex = Math.floor((stage - 1) / 10);
    const name = stageNames[zoneIndex % stageNames.length];
    const monsterName = monsterNames[zoneIndex % monsterNames.length];
    const isBoss = stage % 10 === 0;
    const requiredPower = getRequiredPower(stage);
    const bossMultiplier = isBoss ? 1.25 : 1;

    return {
        id: stage,
        name: isBoss ? `Boss ${name}` : name,
        emoji: isBoss ? "👹" : "🐷",
        requiredPower,
        monster: {
            name: isBoss ? `Boss ${monsterName}` : monsterName,
            power: Math.floor(requiredPower * bossMultiplier),
            atkMultiplier: isBoss ? 0.52 : 0.45,
            defenseMultiplier: isBoss ? 0.022 : 0.018,
            hpMultiplier: isBoss ? 6.5 : 5.2,
            speedBase: 50 + stage * 3,
        },
        firstClearReward: {
            money: Math.floor(getFirstClearMoney(stage) * 1.15),
            exp: getFirstClearExp(stage),
            items: getFirstClearItems(stage),
        },
        sweepReward: {
            money: getSweepMoneyRange(stage),
            exp: getSweepExp(stage),
            drops: getSweepDrops(stage),
        },
    };
}
const MAX_DUNGEON_STAGE = 200;

module.exports = {
    sweepCooldownMinutes: 30,
    activeSkillTriggerChance: 0.35,

    maxStage: MAX_DUNGEON_STAGE,

    stages: Array.from(
        {
            length: MAX_DUNGEON_STAGE,
        },
        (_, index) => buildStage(index + 1),
    ),
};