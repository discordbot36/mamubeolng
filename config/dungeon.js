const stageNames = [
    "Chuồng Heo Linh Khí",
    "Rừng Trư Yêu",
    "Hang Lợn Đen",
    "Động Mamu Hôi",
    "Cốc Linh Trư",
    "Mộ Trư Cổ",
    "Huyết Trì Lợn Ma",
    "Thiên Lao Mamu",
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
];

function getZoneMultiplier(stage) {
    if (stage <= 10) return 1;
    if (stage <= 20) return 1.45;
    if (stage <= 30) return 2.15;
    if (stage <= 40) return 3.1;
    if (stage <= 50) return 4.4;
    if (stage <= 60) return 6.2;
    if (stage <= 70) return 8.5;
    return 11.5;
}

function getRequiredPower(stage) {
    return Math.floor(650 * Math.pow(stage, 1.55) * getZoneMultiplier(stage));
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

    const items = [{ itemId: "cam_lon_xin_vl", amount: 2 }];

    if (stage % 10 === 0) {
        items.push({ itemId: "bi_tich_thien_giai_chu_dong", amount: 1 });
    }

    if (stage % 20 === 0) {
        items.push({ itemId: "bi_tich_thien_giai_bi_dong", amount: 1 });
    }

    if (stage % 25 === 0) {
        items.push({ itemId: "tay_tuy_linh_can_dan", amount: 1 });
    }

    if (stage % 80 === 0) {
        items.push({ itemId: "bi_tich_mamu_cam_thuat_chu_dong", amount: 1 });
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

    return [
        { itemId: "cam_lon_xin_vl", amount: 1, chance: 62 },
        { itemId: "cam_lon_xin_vl", amount: 2, chance: 18 },
        { itemId: "bi_tich_thien_giai_chu_dong", amount: 1, chance: 5 },
        { itemId: "bi_tich_thien_giai_bi_dong", amount: 1, chance: 5 },
        { itemId: "tay_tuy_linh_can_dan", amount: 1, chance: 10 },
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
            money: getFirstClearMoney(stage),
            items: getFirstClearItems(stage),
        },
        sweepReward: {
            money: getSweepMoneyRange(stage),
            drops: getSweepDrops(stage),
        },
    };
}

module.exports = {
    sweepCooldownMinutes: 30,
    activeSkillTriggerChance: 0.35,
    maxStage: 80,
    stages: Array.from({ length: 80 }, (_, index) => buildStage(index + 1)),
};
