const { addShopItem, updateUser } = require("../database");
const weaponConfig = require("../weapon");
const shop = require("../config/shop");

const FRAGMENT_ITEM_ID = "manh_phap_bao";

const PHAP_BAO_FARM_POOLS = {
    bicanh: [
        {
            type: "fragment",
            weight: 65,
            min: 3,
            max: 18,
        },
        {
            type: "chest",
            weight: 20,
            itemId: "ruong_phap_bao_rach",
        },
        {
            type: "unidentified_weapon",
            weight: 10,
            rarity: "F",
        },
        {
            type: "unidentified_weapon",
            weight: 4,
            rarity: "E",
        },
        {
            type: "unidentified_weapon",
            weight: 1,
            rarity: "D",
        },
    ],

    worldboss: [
        {
            type: "chest",
            weight: 50,
            itemId: "ruong_phap_bao_rach",
        },
        {
            type: "fragment",
            weight: 30,
            min: 10,
            max: 60,
        },
        {
            type: "unidentified_weapon",
            weight: 12,
            rarity: "F",
        },
        {
            type: "unidentified_weapon",
            weight: 6,
            rarity: "E",
        },
        {
            type: "unidentified_weapon",
            weight: 2,
            rarity: "D",
        },
    ],

    tower: [
        {
            type: "chest",
            weight: 50,
            itemId: "ruong_phap_bao_rach",
        },
        {
            type: "fragment",
            weight: 35,
            min: 5,
            max: 25,
        },
        {
            type: "unidentified_weapon",
            weight: 10,
            rarity: "F",
        },
        {
            type: "unidentified_weapon",
            weight: 4,
            rarity: "E",
        },
        {
            type: "unidentified_weapon",
            weight: 1,
            rarity: "D",
        },
    ],
};

function formatNumber(number) {
    return Number(number || 0).toLocaleString("vi-VN");
}

function randomInt(min, max) {
    const safeMin = Math.ceil(Number(min || 0));
    const safeMax = Math.floor(Number(max || safeMin));

    if (safeMax <= safeMin) {
        return safeMin;
    }

    return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

function createUid() {
    return `pb_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
}

function rollWeighted(pool) {
    const totalWeight = pool.reduce((total, entry) => {
        return total + Math.max(0, Number(entry.weight || 0));
    }, 0);

    if (totalWeight <= 0) {
        return null;
    }

    let roll = Math.random() * totalWeight;

    for (const entry of pool) {
        roll -= Math.max(0, Number(entry.weight || 0));

        if (roll <= 0) {
            return entry;
        }
    }

    return pool[pool.length - 1];
}

function createUnidentifiedWeapon(rarityId, source = "farm") {
    const rarity = weaponConfig.getRarity(rarityId) || weaponConfig.getRarity("F");
    const now = Date.now();

    return {
        uid: createUid(),
        type: "phap_bao",
        state: "unidentified",

        rarity: rarity.id,
        unidentifiedRarity: rarity.id,

        name: `${rarity.emoji} Phôi Pháp Bảo ${rarity.id} Chưa Giám Định`,
        emoji: rarity.emoji,

        source,
        stars: 0,
        locked: false,

        createdAt: now,
        updatedAt: now,
    };
}

function grantUnidentifiedWeapon(userId, rarityId, source) {
    const weapon = createUnidentifiedWeapon(rarityId, source);

    updateUser(userId, (user) => {
        if (!Array.isArray(user.weapons)) {
            user.weapons = [];
        }

        user.weapons.push(weapon);

        if (user.phapBaoStats) {
            user.phapBaoStats.updatedAt = Date.now();
        }
    });

    return weapon;
}

function getPool(poolId) {
    return PHAP_BAO_FARM_POOLS[poolId] || PHAP_BAO_FARM_POOLS.bicanh;
}

function givePhapBaoFarmReward(userId, poolId = "bicanh", options = {}) {
    const pool = getPool(poolId);
    const rolls = Math.max(1, Math.floor(Number(options.rolls || 1)));
    const amountMultiplier = Math.max(0.1, Number(options.amountMultiplier ?? 1));

    const rewards = [];

    for (let index = 0; index < rolls; index += 1) {
        const drop = rollWeighted(pool);

        if (!drop) {
            continue;
        }

        if (drop.type === "fragment") {
            const baseAmount = randomInt(drop.min, drop.max);
            const amount = Math.max(1, Math.floor(baseAmount * amountMultiplier));

            addShopItem(userId, FRAGMENT_ITEM_ID, amount);

            rewards.push({
                type: "fragment",
                itemId: FRAGMENT_ITEM_ID,
                amount,
            });

            continue;
        }

        if (drop.type === "chest") {
            const item = shop[drop.itemId];

            if (!item) {
                continue;
            }

            addShopItem(userId, drop.itemId, 1);

            rewards.push({
                type: "chest",
                itemId: drop.itemId,
                amount: 1,
            });

            continue;
        }

        if (drop.type === "unidentified_weapon") {
            const rarityId = ["F", "E", "D"].includes(drop.rarity)
                ? drop.rarity
                : "F";

            const weapon = grantUnidentifiedWeapon(
                userId,
                rarityId,
                `farm_${poolId}`,
            );

            rewards.push({
                type: "unidentified_weapon",
                rarity: rarityId,
                amount: 1,
                weapon,
            });
        }
    }

    return rewards;
}

function formatPhapBaoFarmReward(reward) {
    if (!reward) {
        return null;
    }

    if (reward.type === "fragment") {
        return `🧩 **Mảnh Pháp Bảo** x${formatNumber(reward.amount)}`;
    }

    if (reward.type === "chest") {
        const item = shop[reward.itemId] || {};

        return `${item.emoji || "🎁"} **${item.name || reward.itemId}** x${formatNumber(reward.amount || 1)}`;
    }

    if (reward.type === "unidentified_weapon") {
        const rarity = weaponConfig.getRarity(reward.rarity || "F");

        return `${rarity.emoji} **Phôi Pháp Bảo ${rarity.id} Chưa Giám Định**`;
    }

    return null;
}

module.exports = {
    givePhapBaoFarmReward,
    formatPhapBaoFarmReward,
};