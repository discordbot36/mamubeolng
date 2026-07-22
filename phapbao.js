const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");

const database = require("./database");
const shop = require("./config/shop");
const weaponConfig = require("./weapon");

const FRAGMENT_ITEM_ID = "manh_phap_bao";
const BULK_DISMANTLE_MAX_AMOUNT = 50;
const MAX_OPEN_AMOUNT = 10;
const PHAPBAO_PAGE_SIZE = 8;
const REMOVED_WEAPON_SUB_STATS = new Set(["expBonus", "moneyBonus"]);
const TOWER_CHEST_PHAPBAO_DROPS = {
    dong: [
        { type: "fragment", weight: 58, min: 5, max: 18 },
        { type: "unidentified_weapon", rarity: "F", weight: 24 },
        { type: "unidentified_weapon", rarity: "E", weight: 12 },
        { type: "unidentified_weapon", rarity: "D", weight: 5 },
        { type: "unidentified_weapon", rarity: "C", weight: 1 },
    ],

    bac: [
        { type: "fragment", weight: 50, min: 15, max: 50 },
        { type: "unidentified_weapon", rarity: "D", weight: 20 },
        { type: "unidentified_weapon", rarity: "C", weight: 14 },
        { type: "unidentified_weapon", rarity: "B", weight: 9 },
        { type: "unidentified_weapon", rarity: "A", weight: 5 },
        { type: "unidentified_weapon", rarity: "S", weight: 2 },
    ],

    vang: [
        { type: "fragment", weight: 42, min: 60, max: 180 },
        { type: "unidentified_weapon", rarity: "C", weight: 18 },
        { type: "unidentified_weapon", rarity: "B", weight: 16 },
        { type: "unidentified_weapon", rarity: "A", weight: 12 },
        { type: "unidentified_weapon", rarity: "S", weight: 8 },
        { type: "unidentified_weapon", rarity: "SS", weight: 3.2 },
        { type: "unidentified_weapon", rarity: "SSS", weight: 0.8 },
    ],

    kim_cuong: [
        { type: "fragment", weight: 35, min: 180, max: 450 },
        { type: "unidentified_weapon", rarity: "B", weight: 20 },
        { type: "unidentified_weapon", rarity: "A", weight: 20 },
        { type: "unidentified_weapon", rarity: "S", weight: 16 },
        { type: "unidentified_weapon", rarity: "SS", weight: 7 },
        { type: "unidentified_weapon", rarity: "SSS", weight: 2 },
    ],

    mamu: [
        { type: "fragment", weight: 25, min: 400, max: 900 },
        { type: "unidentified_weapon", rarity: "A", weight: 24 },
        { type: "unidentified_weapon", rarity: "S", weight: 28 },
        { type: "unidentified_weapon", rarity: "SS", weight: 18 },
        { type: "unidentified_weapon", rarity: "SSS", weight: 5 },
    ],
};
const DISMANTLE_FRAGMENT_RANGES = {
    F: [1, 2],
    E: [2, 4],
    D: [5, 8],
    C: [10, 16],
    B: [25, 40],
    A: [70, 110],
    S: [180, 280],
    SS: [500, 800],
    SSS: [1500, 2500],

    EX: [0, 0],
};
const STAR_DUPLICATE_COSTS = {
    0: 1,
    1: 1,
    2: 2,
    3: 2,
    4: 3,
    5: 4,
    6: 5,
    7: 6,
    8: 8,
};
const MERGE_FRAGMENT_COSTS = {
    F: 30,
    E: 80,
    D: 200,
    C: 600,
    B: 1800,
    A: 6000,
    S: 22000,
    SS: 90000,
    SSS: 400000,

    EX: null,
};

const REROLL_CONFIRM_TTL_MS = 60 * 1000;
const pendingRerollConfirms = new Map();
const REROLL_BASE_COSTS = {
    F: 500,
    E: 1500,
    D: 5000,
    C: 15000,
    B: 50000,
    A: 150000,
    S: 600000,
    SS: 2500000,
    SSS: 10000000,

    EX: null,
};

const REROLL_LOCK_MULTIPLIERS = {
    0: 1,
    1: 1.8,
    2: 4,
    3: 9,
    4: 20,
    5: 45,
};
function formatNumber(number) {
    return Number(number || 0).toLocaleString("vi-VN");
}

function getCurrencyText() {
    return database.getCurrencyEmoji();
}

function createUid(prefix = "pb") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getDropWeight(item) {
    return Number(item.weight ?? item.chance ?? 0);
}

function rollWeightedFromArray(items) {
    const validItems = Array.isArray(items)
        ? items.filter((item) => getDropWeight(item) > 0)
        : [];

    const totalWeight = validItems.reduce((sum, item) => {
        return sum + getDropWeight(item);
    }, 0);

    if (totalWeight <= 0) {
        return null;
    }

    let random = Math.random() * totalWeight;

    for (const item of validItems) {
        random -= getDropWeight(item);

        if (random <= 0) {
            return item;
        }
    }

    return validItems[validItems.length - 1] || null;
}

function randomInt(min, max) {
    const safeMin = Math.ceil(Number(min || 0));
    const safeMax = Math.floor(Number(max || safeMin));

    if (safeMax <= safeMin) {
        return safeMin;
    }

    return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}
function isTowerChestItem(item) {
    return item && item.type === "tower_chest";
}

function getTowerChestDropsByTier(tier) {
    return TOWER_CHEST_PHAPBAO_DROPS[tier] || null;
}

function normalizeTowerChestItem(item) {
    if (!isTowerChestItem(item)) {
        return null;
    }

    const drops = getTowerChestDropsByTier(item.tier);

    if (!drops) {
        return null;
    }

    return {
        id: item.id,
        name: item.name || "Rương Leo Tháp",
        emoji: item.emoji || "📦",
        type: "tower_chest",
        tier: item.tier,
        phapBaoDrops: drops,
    };
}

function countTowerChests(user, chestId) {
    const items = Array.isArray(user.inventoryItems) ? user.inventoryItems : [];

    return items.filter((item) => {
        return isTowerChestItem(item) && item.id === chestId;
    }).length;
}

function getTowerChestItemById(user, chestId) {
    const items = Array.isArray(user.inventoryItems) ? user.inventoryItems : [];

    const item = items.find((entry) => {
        return isTowerChestItem(entry) && entry.id === chestId;
    });

    return normalizeTowerChestItem(item);
}
function getInventoryAmount(user, itemId) {
    return Number(user.inventory?.[itemId] || 0);
}

function addInventoryAmount(user, itemId, amount) {
    if (!user.inventory) {
        user.inventory = {};
    }

    const safeAmount = Math.floor(Number(amount || 0));

    if (safeAmount <= 0) {
        return 0;
    }

    user.inventory[itemId] = Number(user.inventory[itemId] || 0) + safeAmount;

    return user.inventory[itemId];
}

function removeInventoryAmount(user, itemId, amount) {
    if (!user.inventory) {
        user.inventory = {};
    }

    const safeAmount = Math.floor(Number(amount || 0));

    if (safeAmount <= 0) {
        return false;
    }

    if (Number(user.inventory[itemId] || 0) < safeAmount) {
        return false;
    }

    user.inventory[itemId] = Number(user.inventory[itemId] || 0) - safeAmount;

    if (user.inventory[itemId] <= 0) {
        delete user.inventory[itemId];
    }

    return true;
}

function resolveChestForOpen(user, rawChestId) {
    const raw = String(rawChestId || "").trim();

    if (!raw) {
        return null;
    }

    if (raw.startsWith("shop:")) {
        const itemId = raw.slice("shop:".length);
        const item = shop[itemId];

        if (!item || item.type !== "phap_bao_chest") {
            return null;
        }

        return {
            source: "shop",
            id: itemId,
            item: {
                ...item,
                id: itemId,
            },
            owned: getInventoryAmount(user, itemId),
        };
    }

    if (raw.startsWith("tower:")) {
        const itemId = raw.slice("tower:".length);
        const item = getTowerChestItemById(user, itemId);

        if (!item) {
            return null;
        }

        return {
            source: "tower",
            id: itemId,
            item,
            owned: countTowerChests(user, itemId),
        };
    }

    /*
     * Legacy support:
     * Nếu người chơi tự gõ ruong_phap_bao_rach hoặc ruong_thap_dong vẫn mở được.
     */
    const shopItem = shop[raw];

    if (shopItem && shopItem.type === "phap_bao_chest") {
        return {
            source: "shop",
            id: raw,
            item: {
                ...shopItem,
                id: raw,
            },
            owned: getInventoryAmount(user, raw),
        };
    }

    const towerItem = getTowerChestItemById(user, raw);

    if (towerItem) {
        return {
            source: "tower",
            id: raw,
            item: towerItem,
            owned: countTowerChests(user, raw),
        };
    }

    return null;
}

function removeTowerChests(user, chestId, amount) {
    if (!Array.isArray(user.inventoryItems)) {
        user.inventoryItems = [];
    }

    let remaining = Math.floor(Number(amount || 0));

    if (remaining <= 0) {
        return false;
    }

    const keptItems = [];

    for (const item of user.inventoryItems) {
        if (remaining > 0 && isTowerChestItem(item) && item.id === chestId) {
            remaining -= 1;
            continue;
        }

        keptItems.push(item);
    }

    if (remaining > 0) {
        return false;
    }

    user.inventoryItems = keptItems;

    return true;
}

function consumeChest(user, chestInfo, amount) {
    if (!chestInfo) {
        return false;
    }

    if (chestInfo.source === "shop") {
        return removeInventoryAmount(user, chestInfo.id, amount);
    }

    if (chestInfo.source === "tower") {
        return removeTowerChests(user, chestInfo.id, amount);
    }

    return false;
}
function createUnidentifiedWeapon(unidentifiedRarity, source = "unknown") {
    const rarity = weaponConfig.getRarity(unidentifiedRarity);
    const now = Date.now();

    return {
        uid: createUid("pb"),
        type: "phap_bao",
        state: "unidentified",

        /*
         * rarity hiện tại là rarity của phôi.
         * Sau này /giamdinh sẽ roll ra finalRarity thật.
         */
        rarity: rarity.id,
        unidentifiedRarity: rarity.id,
        finalRarity: null,

        weaponId: null,
        name: `Phôi Pháp Bảo ${rarity.id} Chưa Giám Định`,
        emoji: rarity.emoji,

        qualityId: null,
        qualityMultiplier: null,
        stars: 0,
        subStats: [],

        locked: false,
        source,
        createdAt: now,
        updatedAt: now,
    };
}

function rollChestReward(chestItem) {
    const drop = rollWeightedFromArray(chestItem.phapBaoDrops);

    if (!drop) {
        return {
            type: "nothing",
        };
    }

    if (drop.type === "fragment") {
        return {
            type: "fragment",
            amount: randomInt(drop.min, drop.max),
        };
    }

    if (drop.type === "unidentified_weapon") {
        return {
            type: "unidentified_weapon",
            weapon: createUnidentifiedWeapon(
                drop.rarity,
                chestItem.id || chestItem.name || "phap_bao_chest",
            ),
        };
    }

    if (drop.type === "item") {
        return {
            type: "item",
            itemId: drop.itemId,
            amount: randomInt(
                drop.min || drop.amount || 1,
                drop.max || drop.amount || 1,
            ),
        };
    }

    if (drop.type === "money") {
        return {
            type: "money",
            amount: randomInt(drop.min, drop.max),
        };
    }

    if (drop.type === "tuvi") {
        return {
            type: "tuvi",
            amount: randomInt(drop.min, drop.max),
        };
    }

    return {
        type: "nothing",
    };
}

function getWeaponRarityId(weapon) {
    if (!weapon) {
        return "F";
    }

    if (weapon.state === "unidentified") {
        return weapon.unidentifiedRarity || weapon.rarity || "F";
    }

    return weapon.finalRarity || weapon.rarity || "F";
}

function updateBestFoundStats(user, weapon) {
    if (!weapon || !user.phapBaoStats) {
        return;
    }

    const currentBest = user.phapBaoStats.bestRarityFound;
    const currentBestRank = currentBest
        ? weaponConfig.getRarity(currentBest).rank
        : 0;

    const newRarityId = getWeaponRarityId(weapon);
    const newRank = weaponConfig.getRarity(newRarityId).rank;

    if (newRank > currentBestRank) {
        user.phapBaoStats.bestRarityFound = newRarityId;
        user.phapBaoStats.bestWeaponName = weapon.name;
    }
}
function giveUnidentifiedWeaponReward(
    userId,
    rarity = "SS",
    source = "worldboss_chest",
) {
    const weapon = createUnidentifiedWeapon(rarity, source);

    return database.updateUser(userId, (user) => {
        if (!Array.isArray(user.weapons)) {
            user.weapons = [];
        }

        user.weapons.push(weapon);
        updateBestFoundStats(user, weapon);

        return weapon;
    });
}

function formatRewardLine(reward) {
    if (reward.type === "fragment") {
        return `🧩 Mảnh Pháp Bảo x${formatNumber(reward.amount)}`;
    }

    if (reward.type === "unidentified_weapon") {
        const rarity = weaponConfig.getRarity(reward.weapon.rarity);

        return `${rarity.emoji} ${reward.weapon.name}`;
    }

    if (reward.type === "item") {
        const item = shop[reward.itemId];
        const name = item
            ? `${item.emoji || "🎁"} ${item.name}`
            : reward.itemId;

        return `${name} x${formatNumber(reward.amount)}`;
    }

    if (reward.type === "money") {
        return `💰 Tiền x${formatNumber(reward.amount)}`;
    }

    if (reward.type === "tuvi") {
        return `✨ Tu vi x${formatNumber(reward.amount)}`;
    }

    return "💨 Không có gì";
}

function buildOpenChestEmbed(interaction, chestItem, amount, rewards) {
    const fragmentTotal = rewards
        .filter((reward) => reward.type === "fragment")
        .reduce((sum, reward) => sum + Number(reward.amount || 0), 0);

    const weapons = rewards
        .filter((reward) => reward.type === "unidentified_weapon")
        .map((reward) => reward.weapon);

    const moneyTotal = rewards
        .filter((reward) => reward.type === "money")
        .reduce((sum, reward) => sum + Number(reward.amount || 0), 0);

    const itemTotal = rewards
        .filter((reward) => reward.type === "item")
        .reduce((sum, reward) => sum + Number(reward.amount || 0), 0);

    const rewardLines = rewards.map((reward, index) => {
        return `**${index + 1}.** ${formatRewardLine(reward)}`;
    });

    const embed = new EmbedBuilder()
        .setTitle("🐷 Mở Rương Pháp Bảo")
        .setColor(0xe67e22)
        .setDescription(
            [
                `${interaction.user} đã mở **${amount}x ${chestItem.emoji || "🎁"} ${chestItem.name}**.`,
                "",
                rewardLines.join("\n") || "Không có phần thưởng.",
            ].join("\n"),
        )
        .addFields({
            name: "📦 Tổng kết",
            value: [
                `🧩 Mảnh nhận được: **${formatNumber(fragmentTotal)}**`,
                `⚔️ Phôi pháp bảo: **${formatNumber(weapons.length)}**`,
                "",
                "Lưu ý: đây mới là **phôi chưa giám định**.",
                "Sau này dùng `/giamdinh` mới roll ra rarity thật.",
            ].join("\n"),
        })
        .setFooter({
            text: "Phôi SSS vẫn có thể giám định tụt xuống A/S/SS. Đời là bể khổ, Mamu là bể gacha.",
        })
        .setTimestamp();

    return embed;
}

function getWeaponDisplayRarity(weapon) {
    if (weapon.state === "unidentified") {
        return weaponConfig.getRarity(
            weapon.unidentifiedRarity || weapon.rarity,
        );
    }

    return weaponConfig.getRarity(weapon.finalRarity || weapon.rarity);
}

function getWeaponDisplayName(weapon) {
    if (weapon.state === "unidentified") {
        const rarity = getWeaponDisplayRarity(weapon);

        return `${rarity.emoji} Phôi Pháp Bảo ${rarity.id} Chưa Giám Định`;
    }

    const rarity = getWeaponDisplayRarity(weapon);
    const quality = weaponConfig.qualities[weapon.qualityId];

    return [
        `${rarity.emoji} ${weapon.emoji || ""} ${weapon.name}`,
        quality ? `${quality.emoji} ${quality.name}` : null,
        `${weapon.stars || 0}⭐`,
    ]
        .filter(Boolean)
        .join(" • ");
}

function getShortUid(uid) {
    return String(uid || "").slice(-6);
}

function countWeaponsByState(weapons) {
    return weapons.reduce(
        (summary, weapon) => {
            if (weapon.state === "unidentified") {
                summary.unidentified += 1;
            } else {
                summary.identified += 1;
            }

            return summary;
        },
        {
            unidentified: 0,
            identified: 0,
        },
    );
}

function countWeaponsByRarity(weapons) {
    const counts = {};

    for (const weapon of weapons) {
        const rarity = getWeaponDisplayRarity(weapon).id;

        counts[rarity] = Number(counts[rarity] || 0) + 1;
    }

    return counts;
}

function formatRaritySummary(weapons) {
    const counts = countWeaponsByRarity(weapons);
    const order = ["EX", "SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];

    const lines = order
        .filter((rarityId) => Number(counts[rarityId] || 0) > 0)
        .map((rarityId) => {
            const rarity = weaponConfig.getRarity(rarityId);

            return `${rarity.emoji} ${rarityId}: **${counts[rarityId]}**`;
        });

    return lines.length > 0 ? lines.join(" | ") : "Chưa có pháp bảo.";
}

function formatWeaponLine(weapon, index, user) {
    const equippedIcon = user.equippedWeaponUid === weapon.uid ? "✅" : "▫️";
    const lockedIcon = weapon.locked ? "🔒" : "🔓";
    const name = getWeaponDisplayName(weapon);
    const uid = getShortUid(weapon.uid);

    if (weapon.state === "unidentified") {
        const rarity = getWeaponDisplayRarity(weapon);

        return [
            `**${index}.** ${equippedIcon} ${lockedIcon} ${name}`,
            `└ UID: \`${uid}\` • Phôi: **${rarity.id}** • Trạng thái: **Chưa giám định**`,
        ].join("\n");
    }

    const rarity = getWeaponDisplayRarity(weapon);
    const subStatText =
        Array.isArray(weapon.subStats) && weapon.subStats.length > 0
            ? weapon.subStats.map(weaponConfig.formatSubStat).join(", ")
            : "Chưa có dòng phụ";

    return [
        `**${index}.** ${equippedIcon} ${lockedIcon} ${name}`,
        `└ UID: \`${uid}\` • Rarity thật: **${rarity.id}** • Dòng: ${subStatText}`,
    ].join("\n");
}
function normalizeSearchText(text) {
    return String(text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function findWeaponByQuery(user, query, filterFn = null) {
    const weapons = Array.isArray(user.weapons) ? user.weapons : [];
    const rawQuery = String(query || "").trim();

    if (!rawQuery) {
        return null;
    }

    const normalizedQuery = normalizeSearchText(rawQuery);

    const candidates = filterFn ? weapons.filter(filterFn) : weapons;

    return (
        candidates.find((weapon) => weapon.uid === rawQuery) ||
        candidates.find((weapon) =>
            String(weapon.uid || "").endsWith(rawQuery),
        ) ||
        candidates.find((weapon) => {
            const uid = normalizeSearchText(weapon.uid);
            const name = normalizeSearchText(weapon.name);
            const shortUid = normalizeSearchText(getShortUid(weapon.uid));

            return (
                uid.includes(normalizedQuery) ||
                shortUid.includes(normalizedQuery) ||
                name.includes(normalizedQuery)
            );
        }) ||
        null
    );
}

function formatWeaponChoiceName(weapon) {
    const rarity = getWeaponDisplayRarity(weapon);
    const uid = getShortUid(weapon.uid);

    if (weapon.state === "unidentified") {
        return `${rarity.emoji} Phôi ${rarity.id} chưa giám định • ${uid}`;
    }

    return `${rarity.emoji} ${weapon.name} ${weapon.stars || 0}⭐ • ${uid}`;
}
async function autocompleteUnidentifiedWeapon(interaction) {
    const focused = normalizeSearchText(interaction.options.getFocused());
    const user = database.getUser(interaction.user.id);
    const weapons = Array.isArray(user.weapons) ? user.weapons : [];

    const choices = weapons
        .filter((weapon) => weapon.state === "unidentified")
        .filter((weapon) => {
            if (!focused) {
                return true;
            }

            const text = normalizeSearchText(
                `${weapon.uid} ${getShortUid(weapon.uid)} ${weapon.name} ${weapon.rarity} ${weapon.unidentifiedRarity}`,
            );

            return text.includes(focused);
        })
        .slice(0, 25)
        .map((weapon) => {
            return {
                name: formatWeaponChoiceName(weapon),
                value: getShortUid(weapon.uid),
            };
        });

    if (choices.length <= 0) {
        return interaction.respond([
            {
                name: "Không có pháp bảo chưa giám định",
                value: "none",
            },
        ]);
    }

    return interaction.respond(choices);
}
async function autocompleteIdentifiedWeapon(interaction) {
    const focused = normalizeSearchText(interaction.options.getFocused());
    const user = database.getUser(interaction.user.id);
    const weapons = Array.isArray(user.weapons) ? user.weapons : [];

    const choices = weapons
        .filter((weapon) => weapon.state === "identified")
        .filter((weapon) => {
            if (!focused) {
                return true;
            }

            const text = normalizeSearchText(
                `${weapon.uid} ${getShortUid(weapon.uid)} ${weapon.name} ${weapon.rarity} ${weapon.finalRarity}`,
            );

            return text.includes(focused);
        })
        .slice(0, 25)
        .map((weapon) => {
            return {
                name: formatWeaponChoiceName(weapon),
                value: getShortUid(weapon.uid),
            };
        });

    if (choices.length <= 0) {
        return interaction.respond([
            {
                name: "Không có pháp bảo đã giám định",
                value: "none",
            },
        ]);
    }

    return interaction.respond(choices);
}
async function autocompleteAnyWeapon(interaction) {
    const focused = normalizeSearchText(interaction.options.getFocused());
    const user = database.getUser(interaction.user.id);
    const weapons = Array.isArray(user.weapons) ? user.weapons : [];

    const choices = weapons
        .filter((weapon) => {
            if (!focused) {
                return true;
            }

            const rarity = getWeaponDisplayRarity(weapon);

            const text = normalizeSearchText(
                [
                    weapon.uid,
                    getShortUid(weapon.uid),
                    weapon.name,
                    weapon.rarity,
                    weapon.unidentifiedRarity,
                    weapon.finalRarity,
                    rarity.id,
                ].join(" "),
            );

            return text.includes(focused);
        })
        .slice(0, 25)
        .map((weapon) => {
            const prefix = weapon.locked ? "🔒" : "🔓";
            const equipped = user.equippedWeaponUid === weapon.uid ? "✅" : "";
            const name = formatWeaponChoiceName(weapon);

            return {
                name: `${prefix}${equipped} ${name}`.slice(0, 100),
                value: getShortUid(weapon.uid),
            };
        });

    if (choices.length <= 0) {
        return interaction.respond([
            {
                name: "Không có pháp bảo nào",
                value: "none",
            },
        ]);
    }

    return interaction.respond(choices);
}
async function autocompleteUpgradeableWeapon(interaction) {
    const focused = normalizeSearchText(interaction.options.getFocused());
    const user = database.getUser(interaction.user.id);
    const weapons = Array.isArray(user.weapons) ? user.weapons : [];

    const choices = weapons
        .filter((weapon) => {
            if (weapon.state !== "identified") {
                return false;
            }

            const rarity = getWeaponDisplayRarity(weapon);

            if (rarity.id === "EX") {
                return false;
            }

            const maxStars = Number(rarity.maxStars || 0);

            return Number(weapon.stars || 0) < maxStars;
        })
        .filter((weapon) => {
            if (!focused) {
                return true;
            }

            const rarity = getWeaponDisplayRarity(weapon);

            const text = normalizeSearchText(
                [
                    weapon.uid,
                    getShortUid(weapon.uid),
                    weapon.name,
                    weapon.weaponId,
                    weapon.rarity,
                    weapon.finalRarity,
                    rarity.id,
                ].join(" "),
            );

            return text.includes(focused);
        })
        .slice(0, 25)
        .map((weapon) => {
            const rarity = getWeaponDisplayRarity(weapon);
            const maxStars = Number(rarity.maxStars || 0);

            return {
                name: `${rarity.emoji} ${weapon.name} ${weapon.stars || 0}/${maxStars}⭐ • ${getShortUid(weapon.uid)}`.slice(
                    0,
                    100,
                ),
                value: getShortUid(weapon.uid),
            };
        });

    if (choices.length <= 0) {
        return interaction.respond([
            {
                name: "Không có pháp bảo nào có thể nâng sao",
                value: "none",
            },
        ]);
    }

    return interaction.respond(choices);
}
function appraiseWeaponItem(weapon) {
    const unidentifiedRarity =
        weapon.unidentifiedRarity || weapon.rarity || "F";
    const finalRarity =
        weaponConfig.rollFinalRarityFromUnidentifiedRarity(unidentifiedRarity);

    const rolledWeapon = weaponConfig.rollWeaponByRarity(finalRarity);

    if (!rolledWeapon) {
        throw new Error(`Không tìm thấy weapon pool cho rarity ${finalRarity}`);
    }

    const quality = weaponConfig.rollQuality();
    const subStats = weaponConfig.rollSubStats(finalRarity);
    const now = Date.now();

    weapon.state = "identified";

    /*
     * rarity sau khi giám định là rarity thật.
     * unidentifiedRarity vẫn giữ lại để biết phôi ban đầu.
     */
    weapon.rarity = finalRarity;
    weapon.finalRarity = finalRarity;

    weapon.weaponId = rolledWeapon.id;
    weapon.name = rolledWeapon.name;
    weapon.emoji = rolledWeapon.emoji;

    weapon.qualityId = quality.id;
    weapon.qualityMultiplier = quality.multiplier;
    weapon.stars = Number(weapon.stars || 0);
    weapon.subStats = subStats;

    weapon.locked = Boolean(weapon.locked);
    weapon.appraisedAt = now;
    weapon.updatedAt = now;

    return {
        unidentifiedRarity,
        finalRarity,
        rolledWeapon,
        quality,
        subStats,
    };
}

function formatRarityChangeText(unidentifiedRarity, finalRarity) {
    const start = weaponConfig.getRarity(unidentifiedRarity);
    const end = weaponConfig.getRarity(finalRarity);

    if (start.id === end.id) {
        return `${start.emoji} **${start.id}** → ${end.emoji} **${end.id}**`;
    }

    if (end.rank > start.rank) {
        return `${start.emoji} **${start.id}** → ${end.emoji} **${end.id}** ⬆️ lật kèo`;
    }

    return `${start.emoji} **${start.id}** → ${end.emoji} **${end.id}** 💀 tụt tier`;
}
function sanitizeWeaponSubStats(weapon) {
    if (!weapon || weapon.state !== "identified") {
        return false;
    }

    if (!Array.isArray(weapon.subStats)) {
        weapon.subStats = [];
        return false;
    }

    const rarityId = weapon.finalRarity || weapon.rarity || "F";
    const oldSubStats = weapon.subStats;
    const targetCount = oldSubStats.length;

    let changed = false;

    const newSubStats = oldSubStats.filter((stat) => {
        if (!stat || !stat.id) {
            changed = true;
            return false;
        }

        if (REMOVED_WEAPON_SUB_STATS.has(stat.id)) {
            changed = true;
            return false;
        }

        if (!weaponConfig.subStats[stat.id]) {
            changed = true;
            return false;
        }

        return true;
    });

    while (newSubStats.length < targetCount) {
        const usedIds = newSubStats.map((stat) => stat.id);
        const statId = weaponConfig.rollSubStatId(usedIds);

        if (!statId) {
            break;
        }

        if (REMOVED_WEAPON_SUB_STATS.has(statId)) {
            continue;
        }

        newSubStats.push({
            id: statId,
            value: weaponConfig.rollSubStatValue(rarityId, statId),
        });

        changed = true;
    }

    if (changed) {
        weapon.subStats = newSubStats;
        weapon.updatedAt = Date.now();
    }

    return changed;
}
function formatSubStatsBlock(weapon) {
    sanitizeWeaponSubStats(weapon);
    if (!Array.isArray(weapon.subStats) || weapon.subStats.length <= 0) {
        return "Không có dòng phụ.";
    }

    return weapon.subStats.map(weaponConfig.formatSubStat).join("\n");
}
function buildAppraiseEmbed(interaction, weapon, result) {
    const finalRarity = weaponConfig.getRarity(result.finalRarity);
    const quality = result.quality;

    const subStatLines =
        Array.isArray(result.subStats) && result.subStats.length > 0
            ? result.subStats.map(weaponConfig.formatSubStat)
            : ["Không có dòng phụ. Đúng là hàng hơi heo."];

    const embed = new EmbedBuilder()
        .setTitle("🔍 Giám Định Pháp Bảo")
        .setColor(finalRarity.color)
        .setDescription(
            [
                `${interaction.user} đã giám định thành công một phôi pháp bảo.`,
                "",
                `Kết quả: ${finalRarity.emoji} ${weapon.emoji || ""} **${weapon.name}**`,
            ].join("\n"),
        )
        .addFields(
            {
                name: "🎲 Rarity",
                value: formatRarityChangeText(
                    result.unidentifiedRarity,
                    result.finalRarity,
                ),
                inline: true,
            },
            {
                name: "🏷️ Phẩm định",
                value: `${quality.emoji} **${quality.name}** x${quality.multiplier}`,
                inline: true,
            },
            {
                name: "⭐ Sao",
                value: `**${weapon.stars || 0}⭐**`,
                inline: true,
            },
            {
                name: "📌 UID",
                value: `\`${getShortUid(weapon.uid)}\``,
                inline: true,
            },
            {
                name: "🧬 Dòng phụ",
                value: subStatLines.join("\n"),
            },
        )
        .setFooter({
            text: "Rarity lúc mở rương chỉ là phôi. Rarity thật chỉ lộ ra sau khi giám định.",
        })
        .setTimestamp();

    return embed;
}
function appraiseWeapon(interaction) {
    const userId = interaction.user.id;
    const query = interaction.options.getString("phapbao", true);

    if (query === "none") {
        return interaction.reply({
            content: "❌ Bạn không có pháp bảo nào chưa giám định.",
            ephemeral: true,
        });
    }

    const result = database.updateUser(userId, (user) => {
        const weapon = findWeaponByQuery(user, query, (item) => {
            return item.state === "unidentified";
        });

        if (!weapon) {
            return {
                success: false,
                message: "Không tìm thấy pháp bảo chưa giám định này.",
            };
        }

        const appraiseResult = appraiseWeaponItem(weapon);

        user.phapBaoStats.appraised += 1;
        user.phapBaoStats.updatedAt = Date.now();

        updateBestFoundStats(user, weapon);

        return {
            success: true,
            weapon,
            appraiseResult,
        };
    });

    if (!result.success) {
        return interaction.reply({
            content: `❌ ${result.message}`,
            ephemeral: true,
        });
    }

    return interaction.reply({
        embeds: [
            buildAppraiseEmbed(
                interaction,
                result.weapon,
                result.appraiseResult,
            ),
        ],
    });
}
function createEmptyWeaponBonus() {
    return {
        atkPercent: 0,
        hpPercent: 0,
        defensePercent: 0,
        speedPercent: 0,

        critChance: 0,
        critDamage: 0,
        defenseIgnore: 0,
        lifeSteal: 0,
        dodgeChance: 0,
        counterChance: 0,
        damageReduction: 0,

        bossDamage: 0,
        dropRate: 0,

        powerPercent: 0,
        sealFactor: 1,
        isSealed: false,

        weaponUid: null,
        weaponName: null,
        weaponRarity: null,
        requiredRealmIndex: 0,
        currentRealmIndex: 0,
    };
}

function addBonusValue(bonus, statId, value) {
    const safeValue = Number(value || 0);

    if (!Number.isFinite(safeValue) || safeValue <= 0) {
        return;
    }

    if (bonus[statId] === undefined) {
        return;
    }

    bonus[statId] += safeValue;
}

function getSealFactorForWeapon(user, weapon) {
    const profile = user.tuTienProfile || {};
    const currentRealmIndex = Number(profile.realmIndex || 0);
    const rarity = getWeaponDisplayRarity(weapon);
    const requiredRealmIndex = Number(rarity.realmRequiredIndex || 0);

    if (currentRealmIndex >= requiredRealmIndex) {
        return {
            factor: 1,
            isSealed: false,
            currentRealmIndex,
            requiredRealmIndex,
        };
    }

    const realmGap = Math.max(1, requiredRealmIndex - currentRealmIndex);

    const sealFactor = Math.max(0.45, 1 - realmGap * 0.12);

    return {
        factor: sealFactor,
        isSealed: true,
        currentRealmIndex,
        requiredRealmIndex,
    };
}

function calculateWeaponBonusForUser(user, weapon) {
    const bonus = createEmptyWeaponBonus();

    if (!weapon || weapon.state !== "identified") {
        return bonus;
    }
    sanitizeWeaponSubStats(weapon);

    const rarity = getWeaponDisplayRarity(weapon);
    const qualityMultiplier = Number(weapon.qualityMultiplier || 1);
    const starMultiplier =
        Number(weaponConfig.starMultipliers?.[weapon.stars || 0]) || 1;

    const seal = getSealFactorForWeapon(user, weapon);

    const finalMultiplier = qualityMultiplier * starMultiplier * seal.factor;
    const basePowerPercent = Number(rarity.basePowerPercent || 0);

    /*
     * Base sức mạnh theo rarity.
     * Rarity càng cao càng mạnh, nhưng vẫn qua phẩm định + sao + phong ấn.
     */
    const baseBonus = basePowerPercent * finalMultiplier;

    bonus.atkPercent += baseBonus * 0.55;
    bonus.hpPercent += baseBonus * 0.45;
    bonus.defensePercent += baseBonus * 0.35;
    bonus.speedPercent += baseBonus * 0.12;

    /*
     * Dòng phụ: dòng ngon có tác dụng, dòng rác vẫn lưu nhưng không ảnh hưởng combat.
     */
    for (const statLine of weapon.subStats || []) {
        addBonusValue(
            bonus,
            statLine.id,
            Number(statLine.value || 0) * finalMultiplier,
        );
    }

    /*
     * Một ít chỉ số đặc biệt để pháp bảo hiếm có cảm giác khác biệt.
     * Không cho quá cao để tránh phá combat.
     */
    if (rarity.rank >= 7) {
        bonus.critChance += 0.01 * finalMultiplier;
    }

    if (rarity.rank >= 8) {
        bonus.critDamage += 0.04 * finalMultiplier;
    }

    if (rarity.rank >= 9) {
        // SSS trở lên có vai trò rõ ràng khi đánh boss.
        bonus.bossDamage += 0.15 * finalMultiplier;
    }

    bonus.powerPercent = baseBonus;
    bonus.sealFactor = seal.factor;
    bonus.isSealed = seal.isSealed;

    bonus.weaponUid = weapon.uid;
    bonus.weaponName = weapon.name;
    bonus.weaponRarity = rarity.id;
    bonus.requiredRealmIndex = seal.requiredRealmIndex;
    bonus.currentRealmIndex = seal.currentRealmIndex;

    return bonus;
}

function syncEquippedWeaponBonus(user) {
    if (!user.tuTienProfile) {
        user.tuTienProfile = {};
    }

    const equippedWeapon = Array.isArray(user.weapons)
        ? user.weapons.find((weapon) => weapon.uid === user.equippedWeaponUid)
        : null;

    if (!equippedWeapon || equippedWeapon.state !== "identified") {
        user.tuTienProfile.equippedWeaponBonus = createEmptyWeaponBonus();

        return user.tuTienProfile.equippedWeaponBonus;
    }

    user.tuTienProfile.equippedWeaponBonus = calculateWeaponBonusForUser(
        user,
        equippedWeapon,
    );

    return user.tuTienProfile.equippedWeaponBonus;
}

function formatWeaponBonusSummary(bonus) {
    if (!bonus || !bonus.weaponUid) {
        return "Chưa có bonus pháp bảo.";
    }

    const lines = [
        `⚔️ ATK: +${weaponConfig.formatPercent(bonus.atkPercent)}`,
        `❤️ HP: +${weaponConfig.formatPercent(bonus.hpPercent)}`,
        `🛡️ DEF: +${weaponConfig.formatPercent(bonus.defensePercent)}`,
        `💨 Tốc: +${weaponConfig.formatPercent(bonus.speedPercent)}`,
    ];

    if (Number(bonus.critChance || 0) > 0) {
        lines.push(`🎯 Crit: +${weaponConfig.formatPercent(bonus.critChance)}`);
    }

    if (Number(bonus.critDamage || 0) > 0) {
        lines.push(
            `💥 Crit DMG: +${weaponConfig.formatPercent(bonus.critDamage)}`,
        );
    }

    if (Number(bonus.bossDamage || 0) > 0) {
        lines.push(
            `👹 Boss DMG: +${weaponConfig.formatPercent(bonus.bossDamage)}`,
        );
    }

    if (bonus.isSealed) {
        lines.push("🔒 Pháp bảo đang bị phong ấn, chỉ mở **30% sức mạnh**.");
    }

    return lines.join("\n");
}
function getDismantleRarityId(weapon) {
    if (!weapon) {
        return "F";
    }

    if (weapon.state === "unidentified") {
        return weapon.unidentifiedRarity || weapon.rarity || "F";
    }

    return weapon.finalRarity || weapon.rarity || "F";
}

function rollDismantleFragments(weapon) {
    const rarityId = getDismantleRarityId(weapon);
    const range = DISMANTLE_FRAGMENT_RANGES[rarityId];

    if (!range) {
        return 0;
    }

    const [min, max] = range;

    return randomInt(min, max);
}
function getBulkDismantleRarityRank(rarityId) {
    const rarity = weaponConfig.getRarity(rarityId);

    if (!rarity) {
        return -1;
    }

    return Number(rarity.rank || 0);
}

function canBulkDismantleWeapon(user, weapon, maxRarityId) {
    if (!weapon) {
        return false;
    }

    const state = weapon.state || "identified";

    if (!["identified", "unidentified"].includes(state)) {
        return false;
    }
    if (weapon.locked) {
        return false;
    }

    if (user.equippedWeaponUid && weapon.uid === user.equippedWeaponUid) {
        return false;
    }

    const rarityId = getDismantleRarityId(weapon);

    if (!rarityId || rarityId === "EX") {
        return false;
    }

    const weaponRank = getBulkDismantleRarityRank(rarityId);
    const maxRank = getBulkDismantleRarityRank(maxRarityId);

    if (weaponRank < 0 || maxRank < 0) {
        return false;
    }

    return weaponRank <= maxRank;
}

function getBulkDismantleCandidates(user, maxRarityId) {
    const weapons = Array.isArray(user.weapons) ? user.weapons : [];

    return weapons
        .filter((weapon) => {
            return canBulkDismantleWeapon(user, weapon, maxRarityId);
        })
        .sort((a, b) => {
            const rankA = getBulkDismantleRarityRank(getDismantleRarityId(a));
            const rankB = getBulkDismantleRarityRank(getDismantleRarityId(b));

            if (rankA !== rankB) {
                return rankA - rankB;
            }

            const starsA = Number(a.stars || 0);
            const starsB = Number(b.stars || 0);

            if (starsA !== starsB) {
                return starsA - starsB;
            }

            return Number(a.createdAt || 0) - Number(b.createdAt || 0);
        });
}

function formatBulkDismantleScope(maxRarityId) {
    if (maxRarityId === "A") {
        return "A trở xuống";
    }

    if (maxRarityId === "C") {
        return "C trở xuống";
    }

    return `${maxRarityId} trở xuống`;
}

function buildBulkDismantleEmbed(interaction, result) {
    const maxLines = 15;

    const lines = result.dismantledWeapons
        .slice(0, maxLines)
        .map((item, index) => {
            const rarity = weaponConfig.getRarity(item.rarityId) || {};
            const stars = Number(item.stars || 0);

            const stateText =
                item.state === "unidentified" ? " • Phôi chưa giám định" : "";

            return (
                `${index + 1}. ${rarity.emoji || "⚔️"} **${item.name}**` +
                `${stars > 0 ? ` ${stars}⭐` : ""}` +
                `${stateText}` +
                ` → 🧩 x${formatNumber(item.fragments)}`
            );
        });

    if (result.dismantledWeapons.length > maxLines) {
        lines.push(
            `...và **${formatNumber(result.dismantledWeapons.length - maxLines)}** món khác.`,
        );
    }

    const summaryLines = Object.entries(result.raritySummary)
        .map(([rarityId, amount]) => {
            const rarity = weaponConfig.getRarity(rarityId) || {};

            return `${rarity.emoji || "⚔️"} ${rarityId}: **${formatNumber(amount)}**`;
        })
        .join(" | ");

    return new EmbedBuilder()
        .setTitle("🧩 Phân Giải Hàng Loạt Pháp Bảo")
        .setColor(0xe67e22)
        .setDescription(
            `${interaction.user} đã phân giải pháp bảo theo phạm vi **${formatBulkDismantleScope(result.maxRarityId)}**.\n\n` +
                `🧹 Số món đã phân giải: **${formatNumber(result.dismantledWeapons.length)}**\n` +
                `🧩 Tổng mảnh nhận: **${formatNumber(result.totalFragments)} Mảnh Pháp Bảo**\n\n` +
                `📊 Theo rarity:\n${summaryLines || "Không có dữ liệu."}\n\n` +
                `### Danh sách đã phân giải\n` +
                `${lines.length > 0 ? lines.join("\n") : "Không có món nào."}`,
        )
        .setFooter({
            text: "Đồ đang trang bị, đồ đã khóa, EX và phôi chưa giám định sẽ không bị phân giải.",
        })
        .setTimestamp();
}

function bulkDismantleWeapons(interaction) {
    const maxRarityId = interaction.options.getString("phamvi");
    const amount = Math.min(
        BULK_DISMANTLE_MAX_AMOUNT,
        Math.max(1, interaction.options.getInteger("soluong") || 10),
    );

    const confirm = interaction.options.getString("xacnhan");

    if (!["C", "A"].includes(maxRarityId)) {
        return interaction.reply({
            content: "❌ Phạm vi phân giải không hợp lệ.",
            ephemeral: true,
        });
    }

    if (confirm !== "dongy") {
        return interaction.reply({
            content:
                `⚠️ Bạn đang dùng phân giải hàng loạt **${formatBulkDismantleScope(maxRarityId)}**.\n\n` +
                `Để tránh bay đồ nhầm, hãy chọn option:\n` +
                `\`xacnhan: Đồng ý\``,
            ephemeral: true,
        });
    }

    const result = database.updateUser(interaction.user.id, (user) => {
        const candidates = getBulkDismantleCandidates(user, maxRarityId);
        const selectedWeapons = candidates.slice(0, amount);

        if (selectedWeapons.length <= 0) {
            return {
                success: false,
                message:
                    `Không có pháp bảo hợp lệ để phân giải trong phạm vi **${formatBulkDismantleScope(maxRarityId)}**.\n\n` +
                    `Đồ đã khóa, đang trang bị, EX và phôi chưa giám định sẽ được bỏ qua.`,
            };
        }

        const selectedUidSet = new Set(
            selectedWeapons.map((weapon) => weapon.uid),
        );

        let totalFragments = 0;
        const dismantledWeapons = [];
        const raritySummary = {};

        for (const weapon of selectedWeapons) {
            const rarityId = getDismantleRarityId(weapon);
            const fragments = rollDismantleFragments(weapon);

            totalFragments += fragments;
            raritySummary[rarityId] = Number(raritySummary[rarityId] || 0) + 1;

            dismantledWeapons.push({
                uid: weapon.uid,
                name: weapon.name || "Pháp bảo không rõ tên",
                state: weapon.state || "identified",
                rarityId,
                stars: Number(weapon.stars || 0),
                fragments,
            });
        }

        user.weapons = (user.weapons || []).filter((weapon) => {
            return !selectedUidSet.has(weapon.uid);
        });

        addInventoryAmount(user, FRAGMENT_ITEM_ID, totalFragments);

        if (user.phapBaoStats) {
            user.phapBaoStats.dismantled =
                Number(user.phapBaoStats.dismantled || 0) +
                dismantledWeapons.length;

            user.phapBaoStats.totalFragmentsEarned =
                Number(user.phapBaoStats.totalFragmentsEarned || 0) +
                totalFragments;

            user.phapBaoStats.updatedAt = Date.now();
        }

        return {
            success: true,
            maxRarityId,
            amount,
            totalFragments,
            dismantledWeapons,
            raritySummary,
        };
    });

    if (!result.success) {
        return interaction.reply({
            content: `❌ ${result.message}`,
            ephemeral: true,
        });
    }

    return interaction.reply({
        embeds: [buildBulkDismantleEmbed(interaction, result)],
    });
}
function canDismantleWeapon(user, weapon) {
    if (!weapon) {
        return {
            ok: false,
            message: "Không tìm thấy pháp bảo này.",
        };
    }

    if (weapon.locked) {
        return {
            ok: false,
            message:
                "Pháp bảo này đang bị khóa. Hãy mở khóa trước khi phân giải.",
        };
    }

    if (user.equippedWeaponUid === weapon.uid) {
        return {
            ok: false,
            message:
                "Không thể phân giải pháp bảo đang trang bị. Hãy `/thaophapbao` trước.",
        };
    }

    const rarityId = getDismantleRarityId(weapon);

    if (rarityId === "EX") {
        return {
            ok: false,
            message: "EX là thần khí giới hạn, bản 3.0 chưa cho phân giải.",
        };
    }

    return {
        ok: true,
        message: null,
    };
}
function buildDismantleEmbed(interaction, weapon, fragments) {
    const rarity = getWeaponDisplayRarity(weapon);
    const isUnidentified = weapon.state === "unidentified";

    const embed = new EmbedBuilder()
        .setTitle("🧩 Phân Giải Pháp Bảo")
        .setColor(rarity.color)
        .setDescription(
            [
                `${interaction.user} đã phân giải một pháp bảo.`,
                "",
                `${rarity.emoji} **${weapon.name}**`,
            ].join("\n"),
        )
        .addFields(
            {
                name: "🎲 Rarity tính phân giải",
                value: `${rarity.emoji} **${rarity.id} - ${rarity.name}**`,
                inline: true,
            },
            {
                name: "📦 Trạng thái",
                value: isUnidentified ? "Chưa giám định" : "Đã giám định",
                inline: true,
            },
            {
                name: "🧩 Mảnh nhận được",
                value: `**${formatNumber(fragments)}** Mảnh Pháp Bảo`,
                inline: true,
            },
        )
        .setFooter({
            text: "Đồ rác không mất đi, nó chỉ chuyển hóa thành niềm đau và vài mảnh pháp bảo.",
        })
        .setTimestamp();

    return embed;
}
function buildEquipEmbed(
    interaction,
    weapon,
    oldWeapon = null,
    weaponBonus = null,
) {
    const rarity = getWeaponDisplayRarity(weapon);
    const quality = weaponConfig.qualities[weapon.qualityId];

    const embed = new EmbedBuilder()
        .setTitle("⚔️ Trang Bị Pháp Bảo")
        .setColor(rarity.color)
        .setDescription(
            [
                `${interaction.user} đã trang bị pháp bảo:`,
                "",
                `${rarity.emoji} ${weapon.emoji || ""} **${weapon.name}**`,
            ].join("\n"),
        )
        .addFields(
            {
                name: "🎲 Rarity thật",
                value: `${rarity.emoji} **${rarity.id} - ${rarity.name}**`,
                inline: true,
            },
            {
                name: "🏷️ Phẩm định",
                value: quality
                    ? `${quality.emoji} **${quality.name}** x${quality.multiplier}`
                    : "Chưa rõ",
                inline: true,
            },
            {
                name: "⭐ Sao",
                value: `**${weapon.stars || 0}⭐**`,
                inline: true,
            },
            {
                name: "📌 UID",
                value: `\`${getShortUid(weapon.uid)}\``,
                inline: true,
            },
            {
                name: "🧬 Dòng phụ",
                value: formatSubStatsBlock(weapon),
            },
            {
                name: "💪 Bonus đang cộng vào combat",
                value: formatWeaponBonusSummary(weaponBonus),
            },
        )
        .setFooter({
            text: "Bonus pháp bảo đã được lưu vào tuTienProfile.equippedWeaponBonus.",
        })
        .setTimestamp();

    if (oldWeapon) {
        embed.addFields({
            name: "🔁 Thay thế",
            value: `Đã tháo: **${oldWeapon.name}**`,
        });
    }

    return embed;
}
function equipWeapon(interaction) {
    const userId = interaction.user.id;
    const query = interaction.options.getString("phapbao", true);

    if (query === "none") {
        return interaction.reply({
            content: "❌ Bạn chưa có pháp bảo nào đã giám định để trang bị.",
            ephemeral: true,
        });
    }

    const result = database.updateUser(userId, (user) => {
        const weapon = findWeaponByQuery(user, query, (item) => {
            return item.state === "identified";
        });

        if (!weapon) {
            return {
                success: false,
                message: "Không tìm thấy pháp bảo đã giám định này.",
            };
        }

        const oldWeapon = Array.isArray(user.weapons)
            ? user.weapons.find((item) => item.uid === user.equippedWeaponUid)
            : null;

        user.equippedWeaponUid = weapon.uid;

        const weaponBonus = syncEquippedWeaponBonus(user);

        if (user.phapBaoStats) {
            user.phapBaoStats.updatedAt = Date.now();
        }

        return {
            success: true,
            weapon,
            weaponBonus,
            oldWeapon:
                oldWeapon && oldWeapon.uid !== weapon.uid ? oldWeapon : null,
        };
    });

    if (!result.success) {
        return interaction.reply({
            content: `❌ ${result.message}`,
            ephemeral: true,
        });
    }

    return interaction.reply({
        embeds: [
            buildEquipEmbed(
                interaction,
                result.weapon,
                result.oldWeapon,
                result.weaponBonus,
            ),
        ],
    });
}
function unequipWeapon(interaction) {
    const userId = interaction.user.id;

    const result = database.updateUser(userId, (user) => {
        if (!user.equippedWeaponUid) {
            return {
                success: false,
                message: "Bạn chưa trang bị pháp bảo nào.",
            };
        }

        const oldWeapon = Array.isArray(user.weapons)
            ? user.weapons.find(
                  (weapon) => weapon.uid === user.equippedWeaponUid,
              )
            : null;

        user.equippedWeaponUid = null;

        syncEquippedWeaponBonus(user);

        if (user.phapBaoStats) {
            user.phapBaoStats.updatedAt = Date.now();
        }

        return {
            success: true,
            oldWeapon,
        };
    });

    if (!result.success) {
        return interaction.reply({
            content: `❌ ${result.message}`,
            ephemeral: true,
        });
    }

    return interaction.reply({
        content: result.oldWeapon
            ? `✅ Đã tháo pháp bảo **${result.oldWeapon.name}**.`
            : "✅ Đã tháo pháp bảo.",
    });
}
function dismantleWeapon(interaction) {
    const bulkRange = interaction.options.getString("phamvi");

    if (bulkRange) {
        return bulkDismantleWeapons(interaction);
    }
    const userId = interaction.user.id;
    const query = interaction.options.getString("phapbao");
    if (!query) {
        return interaction.reply({
            content:
                "❌ Bạn cần chọn 1 pháp bảo để phân giải, hoặc dùng phân giải hàng loạt:\n" +
                "`/phangiai phamvi:Từ C trở xuống soluong:10 xacnhan:Đồng ý`",
            ephemeral: true,
        });
    }

    if (query === "none") {
        return interaction.reply({
            content: "❌ Bạn không có pháp bảo nào để phân giải.",
            ephemeral: true,
        });
    }

    const result = database.updateUser(userId, (user) => {
        const weapon = findWeaponByQuery(user, query);

        const check = canDismantleWeapon(user, weapon);

        if (!check.ok) {
            return {
                success: false,
                message: check.message,
            };
        }

        const fragments = rollDismantleFragments(weapon);

        if (fragments <= 0) {
            return {
                success: false,
                message: "Pháp bảo này không thể phân giải ở bản hiện tại.",
            };
        }

        user.weapons = user.weapons.filter((item) => {
            return item.uid !== weapon.uid;
        });

        addInventoryAmount(user, FRAGMENT_ITEM_ID, fragments);

        if (user.phapBaoStats) {
            user.phapBaoStats.dismantled += 1;
            user.phapBaoStats.totalFragmentsEarned += fragments;
            user.phapBaoStats.updatedAt = Date.now();
        }

        return {
            success: true,
            weapon,
            fragments,
        };
    });

    if (!result.success) {
        return interaction.reply({
            content: `❌ ${result.message}`,
            ephemeral: true,
        });
    }

    return interaction.reply({
        embeds: [
            buildDismantleEmbed(interaction, result.weapon, result.fragments),
        ],
    });
}
function getStarUpgradeDuplicateCost(currentStars) {
    return Number(STAR_DUPLICATE_COSTS[currentStars] || 999999);
}

function isSameWeaponForStarUpgrade(baseWeapon, materialWeapon) {
    if (!baseWeapon || !materialWeapon) {
        return false;
    }

    if (baseWeapon.uid === materialWeapon.uid) {
        return false;
    }

    if (
        baseWeapon.state !== "identified" ||
        materialWeapon.state !== "identified"
    ) {
        return false;
    }

    const baseName = normalizeSearchText(baseWeapon.name);
    const materialName = normalizeSearchText(materialWeapon.name);

    if (baseName && materialName && baseName === materialName) {
        return true;
    }

    return Boolean(
        baseWeapon.weaponId &&
        materialWeapon.weaponId &&
        baseWeapon.weaponId === materialWeapon.weaponId,
    );
}

function findStarUpgradeMaterials(user, baseWeapon, amountNeeded) {
    const weapons = Array.isArray(user.weapons) ? user.weapons : [];

    return weapons
        .filter((weapon) => isSameWeaponForStarUpgrade(baseWeapon, weapon))
        .filter((weapon) => !weapon.locked)
        .filter((weapon) => user.equippedWeaponUid !== weapon.uid)
        .slice(0, amountNeeded);
}

function canUpgradeStars(user, weapon) {
    if (!weapon) {
        return {
            ok: false,
            message: "Không tìm thấy pháp bảo này.",
        };
    }

    if (weapon.state !== "identified") {
        return {
            ok: false,
            message: "Pháp bảo chưa giám định không thể nâng sao.",
        };
    }

    const rarity = getWeaponDisplayRarity(weapon);

    if (rarity.id === "EX") {
        return {
            ok: false,
            message:
                "EX bản 3.0 chưa cho nâng sao. Để dành làm hàng nhá hàng cho server.",
        };
    }

    const currentStars = Number(weapon.stars || 0);
    const maxStars = Number(rarity.maxStars || 0);

    if (currentStars >= maxStars) {
        return {
            ok: false,
            message: `Pháp bảo này đã đạt tối đa **${maxStars}⭐**.`,
        };
    }

    const amountNeeded = getStarUpgradeDuplicateCost(currentStars);
    const materials = findStarUpgradeMaterials(user, weapon, amountNeeded);

    if (materials.length < amountNeeded) {
        return {
            ok: false,
            message: [
                `Không đủ pháp bảo trùng để nâng sao.`,
                `Cần: **${amountNeeded}** bản trùng **${weapon.name}**.`,
                `Đang có nguyên liệu hợp lệ: **${materials.length}**.`,
                "",
                "Nguyên liệu hợp lệ phải:",
                "- Cùng tên/vũ khí thật",
                "- Đã giám định",
                "- Không khóa",
                "- Không đang trang bị",
            ].join("\n"),
        };
    }

    return {
        ok: true,
        amountNeeded,
        materials,
    };
}
function buildUpgradeStarEmbed(
    interaction,
    weapon,
    oldStars,
    newStars,
    materials,
) {
    const rarity = getWeaponDisplayRarity(weapon);
    const quality = weaponConfig.qualities[weapon.qualityId];
    const maxStars = Number(rarity.maxStars || 0);

    const materialText = materials
        .map((item) => {
            return `• ${item.name} \`${getShortUid(item.uid)}\``;
        })
        .join("\n");

    const embed = new EmbedBuilder()
        .setTitle("⭐ Nâng Sao Pháp Bảo")
        .setColor(rarity.color)
        .setDescription(
            [
                `${interaction.user} đã nâng sao thành công:`,
                "",
                `${rarity.emoji} ${weapon.emoji || ""} **${weapon.name}**`,
            ].join("\n"),
        )
        .addFields(
            {
                name: "⭐ Sao",
                value: `**${oldStars}⭐ → ${newStars}⭐ / ${maxStars}⭐**`,
                inline: true,
            },
            {
                name: "🎲 Rarity",
                value: `${rarity.emoji} **${rarity.id} - ${rarity.name}**`,
                inline: true,
            },
            {
                name: "🏷️ Phẩm định",
                value: quality
                    ? `${quality.emoji} **${quality.name}** x${quality.multiplier}`
                    : "Không rõ",
                inline: true,
            },
            {
                name: "🔥 Nguyên liệu đã tiêu hao",
                value: materialText || "Không có",
            },
        )
        .setFooter({
            text: "Nâng sao dùng pháp bảo trùng, không dùng mảnh. Muốn mạnh phải săn trùng, cay mới vui.",
        })
        .setTimestamp();

    return embed;
}
function buildLockWeaponEmbed(interaction, weapon, locked) {
    const rarity = getWeaponDisplayRarity(weapon);

    const embed = new EmbedBuilder()
        .setTitle(locked ? "🔒 Khóa Pháp Bảo" : "🔓 Mở Khóa Pháp Bảo")
        .setColor(rarity.color)
        .setDescription(
            [
                `${interaction.user} đã ${locked ? "khóa" : "mở khóa"} pháp bảo:`,
                "",
                `${rarity.emoji} ${weapon.emoji || ""} **${weapon.name}**`,
            ].join("\n"),
        )
        .addFields(
            {
                name: "🎲 Rarity",
                value: `${rarity.emoji} **${rarity.id} - ${rarity.name}**`,
                inline: true,
            },
            {
                name: "📦 Trạng thái",
                value:
                    weapon.state === "unidentified"
                        ? "Chưa giám định"
                        : "Đã giám định",
                inline: true,
            },
            {
                name: "📌 UID",
                value: `\`${getShortUid(weapon.uid)}\``,
                inline: true,
            },
            {
                name: "🛡️ Bảo vệ",
                value: locked
                    ? "Đã khóa. Không thể phân giải nhầm."
                    : "Đã mở khóa. Có thể phân giải hoặc dùng làm nguyên liệu.",
            },
        )
        .setTimestamp();

    return embed;
}

function lockWeapon(interaction) {
    const userId = interaction.user.id;
    const query = interaction.options.getString("phapbao", true);
    const action = interaction.options.getString("hanhdong", true);

    if (query === "none") {
        return interaction.reply({
            content: "❌ Bạn không có pháp bảo nào để khóa/mở khóa.",
            ephemeral: true,
        });
    }

    const shouldLock = action === "khoa";

    const result = database.updateUser(userId, (user) => {
        const weapon = findWeaponByQuery(user, query);

        if (!weapon) {
            return {
                success: false,
                message: "Không tìm thấy pháp bảo này.",
            };
        }

        weapon.locked = shouldLock;
        weapon.updatedAt = Date.now();

        if (user.phapBaoStats) {
            user.phapBaoStats.updatedAt = Date.now();
        }

        return {
            success: true,
            weapon,
            locked: shouldLock,
        };
    });

    if (!result.success) {
        return interaction.reply({
            content: `❌ ${result.message}`,
            ephemeral: true,
        });
    }

    return interaction.reply({
        embeds: [
            buildLockWeaponEmbed(interaction, result.weapon, result.locked),
        ],
    });
}
function upgradeWeaponStars(interaction) {
    const userId = interaction.user.id;
    const query = interaction.options.getString("phapbao", true);

    if (query === "none") {
        return interaction.reply({
            content: "❌ Bạn không có pháp bảo nào có thể nâng sao.",
            ephemeral: true,
        });
    }

    const result = database.updateUser(userId, (user) => {
        const weapon = findWeaponByQuery(user, query, (item) => {
            return item.state === "identified";
        });

        const check = canUpgradeStars(user, weapon);

        if (!check.ok) {
            return {
                success: false,
                message: check.message,
            };
        }

        const oldStars = Number(weapon.stars || 0);
        const newStars = oldStars + 1;
        const materialUids = new Set(check.materials.map((item) => item.uid));

        user.weapons = user.weapons.filter((item) => {
            return !materialUids.has(item.uid);
        });

        weapon.stars = newStars;
        weapon.updatedAt = Date.now();

        if (user.equippedWeaponUid === weapon.uid) {
            syncEquippedWeaponBonus(user);
        }

        if (user.phapBaoStats) {
            user.phapBaoStats.upgradedStars += 1;
            user.phapBaoStats.updatedAt = Date.now();
        }

        return {
            success: true,
            weapon,
            oldStars,
            newStars,
            materials: check.materials,
        };
    });

    if (!result.success) {
        return interaction.reply({
            content: `❌ ${result.message}`,
            ephemeral: true,
        });
    }

    return interaction.reply({
        embeds: [
            buildUpgradeStarEmbed(
                interaction,
                result.weapon,
                result.oldStars,
                result.newStars,
                result.materials,
            ),
        ],
    });
}
function canMergeWeaponRarity(user, rarityId) {
    const rarity = weaponConfig.getRarity(rarityId);
    const cost = MERGE_FRAGMENT_COSTS[rarity.id];

    if (!rarity || !MERGE_FRAGMENT_COSTS.hasOwnProperty(rarity.id)) {
        return {
            ok: false,
            message: "Rarity pháp bảo không hợp lệ.",
        };
    }

    if (rarity.id === "EX" || cost === null) {
        return {
            ok: false,
            message:
                "Không thể ghép pháp bảo EX. EX chỉ đến từ Raid Server hoặc Event giới hạn.",
        };
    }

    const ownedFragments = getInventoryAmount(user, FRAGMENT_ITEM_ID);

    if (ownedFragments < cost) {
        return {
            ok: false,
            message: [
                `Không đủ Mảnh Pháp Bảo để ghép phôi **${rarity.id}**.`,
                `Cần: **${formatNumber(cost)}** 🧩`,
                `Đang có: **${formatNumber(ownedFragments)}** 🧩`,
            ].join("\n"),
        };
    }

    return {
        ok: true,
        rarity,
        cost,
        ownedFragments,
    };
}
function buildMergeWeaponEmbed(interaction, weapon, cost, remainingFragments) {
    const rarity = weaponConfig.getRarity(
        weapon.unidentifiedRarity || weapon.rarity,
    );

    const embed = new EmbedBuilder()
        .setTitle("🧩 Ghép Phôi Pháp Bảo")
        .setColor(rarity.color)
        .setDescription(
            [
                `${interaction.user} đã dùng mảnh pháp bảo để ghép thành công:`,
                "",
                `${rarity.emoji} **${weapon.name}**`,
            ].join("\n"),
        )
        .addFields(
            {
                name: "🎲 Cấp phôi",
                value: `${rarity.emoji} **${rarity.id} - ${rarity.name}**`,
                inline: true,
            },
            {
                name: "🧩 Mảnh tiêu hao",
                value: `**${formatNumber(cost)}**`,
                inline: true,
            },
            {
                name: "📦 Mảnh còn lại",
                value: `**${formatNumber(remainingFragments)}**`,
                inline: true,
            },
            {
                name: "⚠️ Lưu ý",
                value: [
                    "Đây mới là **phôi chưa giám định**.",
                    "Khi `/giamdinh`, rarity thật vẫn có thể tụt.",
                    "Ví dụ phôi SSS vẫn có thể ra A/S/SS/SSS.",
                ].join("\n"),
            },
        )
        .setFooter({
            text: "Ghép được phôi chưa chắc đã thành thần khí. Gacha mõm heo bắt đầu từ đây.",
        })
        .setTimestamp();

    return embed;
}
function mergeWeapon(interaction) {
    const userId = interaction.user.id;
    const rarityId = interaction.options.getString("rarity", true);

    const result = database.updateUser(userId, (user) => {
        const check = canMergeWeaponRarity(user, rarityId);

        if (!check.ok) {
            return {
                success: false,
                message: check.message,
            };
        }

        const removed = removeInventoryAmount(
            user,
            FRAGMENT_ITEM_ID,
            check.cost,
        );

        if (!removed) {
            return {
                success: false,
                message: "Không thể trừ Mảnh Pháp Bảo. Hãy kiểm tra lại kho.",
            };
        }

        const weapon = createUnidentifiedWeapon(
            check.rarity.id,
            "merge_fragment",
        );

        user.weapons.push(weapon);

        if (user.phapBaoStats) {
            user.phapBaoStats.merged += 1;
            user.phapBaoStats.totalFragmentsSpent += check.cost;
            user.phapBaoStats.updatedAt = Date.now();
        }

        return {
            success: true,
            weapon,
            cost: check.cost,
            remainingFragments: getInventoryAmount(user, FRAGMENT_ITEM_ID),
        };
    });

    if (!result.success) {
        return interaction.reply({
            content: `❌ ${result.message}`,
            ephemeral: true,
        });
    }

    return interaction.reply({
        embeds: [
            buildMergeWeaponEmbed(
                interaction,
                result.weapon,
                result.cost,
                result.remainingFragments,
            ),
        ],
    });
}
function parseLockedLineIndexes(rawText, subStatCount) {
    const raw = String(rawText || "").trim();

    if (!raw) {
        return [];
    }

    const indexes = raw
        .split(/[,\s]+/)
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value))
        .map((value) => value - 1)
        .filter((index) => index >= 0 && index < subStatCount);

    return [...new Set(indexes)].sort((a, b) => a - b);
}

function formatLockedLines(lockedIndexes) {
    if (!Array.isArray(lockedIndexes) || lockedIndexes.length <= 0) {
        return "Không khóa dòng nào.";
    }

    return lockedIndexes.map((index) => `Dòng ${index + 1}`).join(", ");
}
function formatLockedLineDetails(weapon, lockedIndexes) {
    const subStats = Array.isArray(weapon?.subStats) ? weapon.subStats : [];

    if (!Array.isArray(lockedIndexes) || lockedIndexes.length <= 0) {
        return "Không khóa dòng nào. Tất cả dòng phụ sẽ bị roll lại.";
    }

    return lockedIndexes
        .map((index) => {
            const stat = subStats[index];

            if (!stat) {
                return `**${index + 1}.** Không tìm thấy dòng`;
            }

            return `**${index + 1}.** 🔒 ${weaponConfig.formatSubStat(stat)}`;
        })
        .join("\n")
        .slice(0, 1024);
}

function formatUnlockedLineDetails(weapon, lockedIndexes) {
    const subStats = Array.isArray(weapon?.subStats) ? weapon.subStats : [];
    const lockedSet = new Set(lockedIndexes);

    const lines = subStats
        .map((stat, index) => {
            if (lockedSet.has(index)) {
                return null;
            }

            return `**${index + 1}.** 🎲 ${weaponConfig.formatSubStat(stat)}`;
        })
        .filter(Boolean);

    if (lines.length <= 0) {
        return "Không có dòng nào sẽ roll.";
    }

    return lines.join("\n").slice(0, 1024);
}

function createRerollConfirmToken() {
    return `${Date.now().toString(36)}${Math.random()
        .toString(36)
        .slice(2, 8)}`;
}
function calculateRerollCost(weapon, lockedCount) {
    const rarity = getWeaponDisplayRarity(weapon);
    const baseCost = REROLL_BASE_COSTS[rarity.id];

    if (baseCost === null || baseCost === undefined) {
        return null;
    }

    const lockMultiplier =
        REROLL_LOCK_MULTIPLIERS[lockedCount] ||
        REROLL_LOCK_MULTIPLIERS[5] ||
        100;

    const qualityMultiplier = Number(weapon.qualityMultiplier || 1);

    return Math.floor(baseCost * lockMultiplier * qualityMultiplier);
}

function canRerollWeapon(user, weapon, lockedIndexes) {
    if (!weapon) {
        return {
            ok: false,
            message: "Không tìm thấy pháp bảo này.",
        };
    }

    if (weapon.state !== "identified") {
        return {
            ok: false,
            message: "Pháp bảo chưa giám định không thể roll dòng phụ.",
        };
    }

    const rarity = getWeaponDisplayRarity(weapon);

    if (rarity.id === "EX") {
        return {
            ok: false,
            message:
                "EX bản 3.0 chưa cho roll dòng phụ thường. Sau này dùng cơ chế Đá Mài riêng.",
        };
    }

    const subStatCount = Array.isArray(weapon.subStats)
        ? weapon.subStats.length
        : 0;

    if (subStatCount <= 0) {
        return {
            ok: false,
            message: "Pháp bảo này không có dòng phụ để roll.",
        };
    }

    if (lockedIndexes.length >= subStatCount) {
        return {
            ok: false,
            message:
                "Không thể khóa toàn bộ dòng. Phải chừa ít nhất 1 dòng để roll.",
        };
    }

    const cost = calculateRerollCost(weapon, lockedIndexes.length);

    if (!cost || cost <= 0) {
        return {
            ok: false,
            message: "Không tính được giá roll dòng phụ.",
        };
    }

    if (Number(user.money || 0) < cost) {
        return {
            ok: false,
            message: [
                "Bạn không đủ tiền để roll dòng phụ.",
                `Cần: **${formatNumber(cost)}** ${getCurrencyText()}`,
                `Đang có: **${formatNumber(user.money || 0)}** ${getCurrencyText()}`,
            ].join("\n"),
        };
    }

    return {
        ok: true,
        rarity,
        cost,
        subStatCount,
    };
}
function rerollUnlockedSubStats(weapon, lockedIndexes) {
    sanitizeWeaponSubStats(weapon);
    const rarity = getWeaponDisplayRarity(weapon);
    const lockedSet = new Set(lockedIndexes);
    const oldSubStats = Array.isArray(weapon.subStats) ? weapon.subStats : [];
    const newSubStats = [];

    for (let index = 0; index < oldSubStats.length; index += 1) {
        if (lockedSet.has(index)) {
            newSubStats.push(oldSubStats[index]);
            continue;
        }

        const usedIds = newSubStats.map((stat) => stat.id);
        const statId = weaponConfig.rollSubStatId(usedIds);

        if (!statId) {
            newSubStats.push(oldSubStats[index]);
            continue;
        }

        newSubStats.push({
            id: statId,
            value: weaponConfig.rollSubStatValue(rarity.id, statId),
        });
    }

    weapon.subStats = newSubStats;
    weapon.updatedAt = Date.now();

    return {
        oldSubStats,
        newSubStats,
    };
}
function formatSubStatCompareLine(oldStat, newStat, index, isLocked) {
    const oldText = weaponConfig.formatSubStat(oldStat);
    const newText = weaponConfig.formatSubStat(newStat);

    if (isLocked) {
        return `**${index + 1}.** 🔒 ${oldText}`;
    }

    return `**${index + 1}.** ${oldText}\n→ 🎲 ${newText}`;
}

function formatRerollCompareBlock(oldSubStats, newSubStats, lockedIndexes) {
    const lockedSet = new Set(lockedIndexes);

    return newSubStats
        .map((newStat, index) => {
            return formatSubStatCompareLine(
                oldSubStats[index],
                newStat,
                index,
                lockedSet.has(index),
            );
        })
        .join("\n\n");
}
function buildRerollConfirmEmbed(interaction, weapon, lockedIndexes, cost) {
    const rarity = getWeaponDisplayRarity(weapon);

    return new EmbedBuilder()
        .setTitle("⚠️ Xác Nhận Roll Dòng Phụ")
        .setColor(0xffcc00)
        .setDescription(
            [
                `${interaction.user}, hãy kiểm tra kỹ trước khi roll.`,
                "",
                `${rarity.emoji} ${weapon.emoji || ""} **${weapon.name}**`,
                "",
                "Sau khi xác nhận:",
                "- Những dòng **không khóa** sẽ bị roll lại.",
                "- Những dòng **đã khóa** sẽ được giữ nguyên.",
                "- Tiền sẽ bị trừ ngay khi bấm xác nhận.",
            ].join("\n"),
        )
        .addFields(
            {
                name: "💸 Chi phí",
                value: `**${formatNumber(cost)}** ${getCurrencyText()}`,
                inline: true,
            },
            {
                name: "🔒 Dòng đang khóa",
                value: formatLockedLineDetails(weapon, lockedIndexes),
                inline: false,
            },
            {
                name: "🎲 Dòng sẽ bị roll lại",
                value: formatUnlockedLineDetails(weapon, lockedIndexes),
                inline: false,
            },
        )
        .setFooter({
            text: "Kiểm tra kỹ dòng khóa trước khi bấm xác nhận.",
        })
        .setTimestamp();
}

function buildRerollConfirmButtons(userId, token) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`phapbao_reroll_confirm_${userId}_${token}`)
            .setLabel("Xác nhận roll")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId(`phapbao_reroll_cancel_${userId}_${token}`)
            .setLabel("Hủy")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Secondary),
    );
}
function buildRerollWeaponEmbed(
    interaction,
    weapon,
    oldSubStats,
    newSubStats,
    lockedIndexes,
    cost,
) {
    const rarity = getWeaponDisplayRarity(weapon);

    const embed = new EmbedBuilder()
        .setTitle("🎲 Roll Dòng Phụ Pháp Bảo")
        .setColor(rarity.color)
        .setDescription(
            [
                `${interaction.user} đã roll lại dòng phụ cho:`,
                "",
                `${rarity.emoji} ${weapon.emoji || ""} **${weapon.name}**`,
            ].join("\n"),
        )
        .addFields(
            {
                name: "💸 Chi phí",
                value: `**${formatNumber(cost)}** ${getCurrencyText()}`,
                inline: true,
            },
            {
                name: "🔒 Dòng đã khóa",
                value: formatLockedLines(lockedIndexes),
                inline: true,
            },
            {
                name: "🎲 Rarity",
                value: `${rarity.emoji} **${rarity.id} - ${rarity.name}**`,
                inline: true,
            },
            {
                name: "🧬 Kết quả",
                value: formatRerollCompareBlock(
                    oldSubStats,
                    newSubStats,
                    lockedIndexes,
                ),
            },
        )
        .setFooter({
            text: "Khóa càng nhiều dòng càng đắt. Gacha không giết bạn, nó chỉ làm bạn nghèo.",
        })
        .setTimestamp();

    return embed;
}
function executeConfirmedReroll(interaction, query, lockedText) {
    const userId = interaction.user.id;

    const result = database.updateUser(userId, (user) => {
        const weapon = findWeaponByQuery(user, query, (item) => {
            return item.state === "identified";
        });

        const subStatCount = Array.isArray(weapon?.subStats)
            ? weapon.subStats.length
            : 0;

        const lockedIndexes = parseLockedLineIndexes(lockedText, subStatCount);
        const check = canRerollWeapon(user, weapon, lockedIndexes);

        if (!check.ok) {
            return {
                success: false,
                message: check.message,
            };
        }

        user.money = Number(user.money || 0) - check.cost;

        const { oldSubStats, newSubStats } = rerollUnlockedSubStats(
            weapon,
            lockedIndexes,
        );

        if (user.equippedWeaponUid === weapon.uid) {
            syncEquippedWeaponBonus(user);
        }

        if (user.phapBaoStats) {
            user.phapBaoStats.rerolled += 1;
            user.phapBaoStats.totalMoneySpent += check.cost;
            user.phapBaoStats.updatedAt = Date.now();
        }

        return {
            success: true,
            weapon,
            oldSubStats,
            newSubStats,
            lockedIndexes,
            cost: check.cost,
        };
    });

    if (!result.success) {
        return interaction.update({
            content: `❌ ${result.message}`,
            embeds: [],
            components: [],
        });
    }

    return interaction.update({
        content: "✅ Đã xác nhận roll dòng phụ.",
        embeds: [
            buildRerollWeaponEmbed(
                interaction,
                result.weapon,
                result.oldSubStats,
                result.newSubStats,
                result.lockedIndexes,
                result.cost,
            ),
        ],
        components: [],
    });
}
function rerollWeaponSubStats(interaction) {
    const userId = interaction.user.id;
    const query = interaction.options.getString("phapbao", true);
    const lockedText = interaction.options.getString("khoa") || "";

    if (query === "none") {
        return interaction.reply({
            content: "❌ Bạn không có pháp bảo nào đã giám định để roll dòng.",
            ephemeral: true,
        });
    }

    const user = database.getUser(userId);

    const weapon = findWeaponByQuery(user, query, (item) => {
        return item.state === "identified";
    });

    const subStatCount = Array.isArray(weapon?.subStats)
        ? weapon.subStats.length
        : 0;

    const lockedIndexes = parseLockedLineIndexes(lockedText, subStatCount);
    const check = canRerollWeapon(user, weapon, lockedIndexes);

    if (!check.ok) {
        return interaction.reply({
            content: `❌ ${check.message}`,
            ephemeral: true,
        });
    }

    const token = createRerollConfirmToken();

    pendingRerollConfirms.set(token, {
        userId,
        weaponUid: weapon.uid,
        lockedText: lockedIndexes.map((index) => index + 1).join(","),
        createdAt: Date.now(),
    });

    return interaction.reply({
        embeds: [
            buildRerollConfirmEmbed(
                interaction,
                weapon,
                lockedIndexes,
                check.cost,
            ),
        ],
        components: [buildRerollConfirmButtons(userId, token)],
        ephemeral: true,
    });
}
function clampPhapBaoPage(page, totalPages) {
    return Math.max(1, Math.min(Number(page || 1), totalPages));
}

function buildWeaponListEmbed(user, page = 1) {
    const weapons = Array.isArray(user.weapons) ? user.weapons : [];
    const totalPages = Math.max(
        1,
        Math.ceil(weapons.length / PHAPBAO_PAGE_SIZE),
    );

    const safePage = clampPhapBaoPage(page, totalPages);
    const startIndex = (safePage - 1) * PHAPBAO_PAGE_SIZE;
    const pageWeapons = weapons.slice(
        startIndex,
        startIndex + PHAPBAO_PAGE_SIZE,
    );

    const stateSummary = countWeaponsByState(weapons);
    const equippedWeapon = weapons.find((weapon) => {
        return weapon.uid === user.equippedWeaponUid;
    });

    const weaponLines = pageWeapons.map((weapon, index) => {
        return formatWeaponLine(weapon, startIndex + index + 1, user);
    });

    return new EmbedBuilder()
        .setTitle("🐷 Kho Pháp Bảo")
        .setColor(0x9b59b6)
        .setDescription(
            weaponLines.join("\n\n") || "Không có pháp bảo ở trang này.",
        )
        .addFields(
            {
                name: "📊 Tổng quan",
                value: [
                    `Tổng pháp bảo: **${formatNumber(weapons.length)}**`,
                    `Chưa giám định: **${formatNumber(stateSummary.unidentified)}**`,
                    `Đã giám định: **${formatNumber(stateSummary.identified)}**`,
                    `Mảnh pháp bảo: **${formatNumber(getInventoryAmount(user, FRAGMENT_ITEM_ID))}** 🧩`,
                ].join("\n"),
                inline: true,
            },
            {
                name: "⚔️ Đang trang bị",
                value: equippedWeapon
                    ? getWeaponDisplayName(equippedWeapon)
                    : "Chưa trang bị pháp bảo nào.",
                inline: true,
            },
            {
                name: "🎲 Rarity đang có",
                value: formatRaritySummary(weapons),
            },
        )
        .setFooter({
            text: `Trang ${safePage}/${totalPages} • UID hiển thị 6 ký tự cuối để chọn pháp bảo dễ hơn.`,
        })
        .setTimestamp();
}

function buildWeaponListButtons(userId, page = 1, totalPages = 1) {
    const safePage = clampPhapBaoPage(page, totalPages);

    if (totalPages <= 1) {
        return [];
    }

    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`phapbao_prev_${userId}_${safePage}`)
                .setLabel("Trang trước")
                .setEmoji("⬅️")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(safePage <= 1),

            new ButtonBuilder()
                .setCustomId(`phapbao_page_${userId}_${safePage}`)
                .setLabel(`${safePage}/${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),

            new ButtonBuilder()
                .setCustomId(`phapbao_next_${userId}_${safePage}`)
                .setLabel("Trang sau")
                .setEmoji("➡️")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(safePage >= totalPages),
        ),
    ];
}

function listWeapons(interaction) {
    const user = database.getUser(interaction.user.id);
    const weapons = Array.isArray(user.weapons) ? user.weapons : [];
    const page = Math.max(1, interaction.options.getInteger("trang") || 1);
    const totalPages = Math.max(
        1,
        Math.ceil(weapons.length / PHAPBAO_PAGE_SIZE),
    );

    if (weapons.length <= 0) {
        return interaction.reply({
            content: [
                "🐷 Bạn chưa có pháp bảo nào.",
                "",
                "Gợi ý:",
                "`/mua` rương pháp bảo trước, sau đó dùng `/mophapbao`.",
            ].join("\n"),
            ephemeral: true,
        });
    }

    const safePage = clampPhapBaoPage(page, totalPages);

    return interaction.reply({
        embeds: [buildWeaponListEmbed(user, safePage)],
        components: buildWeaponListButtons(
            interaction.user.id,
            safePage,
            totalPages,
        ),
    });
}

function openChest(interaction) {
    const userId = interaction.user.id;
    const chestId = interaction.options.getString("ruong", true);
    if (chestId === "none") {
        return interaction.reply({
            content: "❌ Bạn chưa có rương pháp bảo hoặc rương leo tháp để mở.",
            ephemeral: true,
        });
    }
    const amount = Math.min(
        MAX_OPEN_AMOUNT,
        Math.max(1, interaction.options.getInteger("soluong") || 1),
    );

    const result = database.updateUser(userId, (user) => {
        const chestInfo = resolveChestForOpen(user, chestId);

        if (!chestInfo) {
            return {
                success: false,
                message:
                    "Đây không phải rương pháp bảo hoặc rương leo tháp hợp lệ.",
            };
        }

        const owned = Number(chestInfo.owned || 0);

        if (owned < amount) {
            return {
                success: false,
                message: `Bạn không đủ rương. Đang có **${formatNumber(owned)}**, cần **${formatNumber(amount)}**.`,
            };
        }

        const removed = consumeChest(user, chestInfo, amount);

        if (!removed) {
            return {
                success: false,
                message: "Không thể trừ rương khỏi kho. Hãy thử lại.",
            };
        }

        const chestItem = chestInfo.item;

        const rewards = [];

        for (let i = 0; i < amount; i += 1) {
            if (chestItem.guaranteedMoney) {
                const moneyReward = {
                    type: "money",
                    amount: randomInt(
                        chestItem.guaranteedMoney.min,
                        chestItem.guaranteedMoney.max,
                    ),
                };

                rewards.push(moneyReward);

                user.money =
                    Number(user.money || 0) + Number(moneyReward.amount || 0);
            }

            const reward = rollChestReward({
                ...chestItem,
                id: chestInfo.id,
            });

            rewards.push(reward);

            if (reward.type === "fragment") {
                addInventoryAmount(user, FRAGMENT_ITEM_ID, reward.amount);

                user.phapBaoStats.totalFragmentsEarned += Number(
                    reward.amount || 0,
                );
            }

            if (reward.type === "unidentified_weapon") {
                user.weapons.push(reward.weapon);
                updateBestFoundStats(user, reward.weapon);
            }
            if (reward.type === "item" && reward.itemId) {
                addInventoryAmount(user, reward.itemId, reward.amount);
            }

            if (reward.type === "money") {
                user.money =
                    Number(user.money || 0) + Number(reward.amount || 0);
            }

            if (reward.type === "tuvi") {
                if (!user.tuTienProfile) {
                    user.tuTienProfile = {};
                }

                user.tuTienProfile.exp =
                    Number(user.tuTienProfile.exp || 0) +
                    Number(reward.amount || 0);
            }
        }

        user.phapBaoStats.openedChests += amount;
        user.phapBaoStats.updatedAt = Date.now();

        return {
            success: true,
            chestItem,
            amount,
            rewards,
            remaining:
                chestInfo.source === "shop"
                    ? getInventoryAmount(user, chestInfo.id)
                    : countTowerChests(user, chestInfo.id),
        };
    });

    if (!result.success) {
        return interaction.reply({
            content: `❌ ${result.message}`,
            ephemeral: true,
        });
    }

    return interaction.reply({
        embeds: [
            buildOpenChestEmbed(
                interaction,
                result.chestItem,
                result.amount,
                result.rewards,
            ),
        ],
    });
}

async function autocompleteChest(interaction) {
    const focused = String(
        interaction.options.getFocused() || "",
    ).toLowerCase();
    const user = database.getUser(interaction.user.id);
    const inventory = user.inventory || {};
    const specialItems = Array.isArray(user.inventoryItems)
        ? user.inventoryItems
        : [];

    const shopChoices = Object.entries(shop)
        .filter(([itemId, item]) => {
            return (
                item.type === "phap_bao_chest" &&
                Number(inventory[itemId] || 0) > 0
            );
        })
        .map(([itemId, item]) => {
            const amount = Number(inventory[itemId] || 0);

            return {
                searchText: `${itemId} ${item.name}`.toLowerCase(),
                name: `${item.emoji || "🎁"} ${item.name} x${amount}`,
                value: `shop:${itemId}`,
            };
        });

    const towerChestMap = new Map();

    for (const item of specialItems) {
        if (!isTowerChestItem(item)) {
            continue;
        }

        const normalized = normalizeTowerChestItem(item);

        if (!normalized) {
            continue;
        }

        const key = normalized.id;

        if (!towerChestMap.has(key)) {
            towerChestMap.set(key, {
                item: normalized,
                amount: 0,
            });
        }

        towerChestMap.get(key).amount += 1;
    }

    const towerChoices = [...towerChestMap.entries()].map(([itemId, entry]) => {
        return {
            searchText:
                `${itemId} ${entry.item.name} ${entry.item.tier}`.toLowerCase(),
            name: `${entry.item.emoji || "📦"} ${entry.item.name} x${entry.amount}`,
            value: `tower:${itemId}`,
        };
    });

    const choices = [...shopChoices, ...towerChoices]
        .filter((choice) => {
            if (!focused) {
                return true;
            }

            return choice.searchText.includes(focused);
        })
        .slice(0, 25)
        .map((choice) => {
            return {
                name: choice.name.slice(0, 100),
                value: choice.value,
            };
        });

    if (choices.length <= 0) {
        return interaction.respond([
            {
                name: "Bạn chưa có rương pháp bảo hoặc rương leo tháp",
                value: "none",
            },
        ]);
    }

    return interaction.respond(choices);
}

function formatChancePercent(value) {
    const number = Number(value || 0);

    if (number % 1 === 0) {
        return `${number}%`;
    }

    return `${number.toFixed(2)}%`;
}

function formatInfoDropLine(drop) {
    if (!drop) {
        return null;
    }

    if (drop.type === "fragment") {
        const min = Number(drop.minAmount || drop.min || 1);
        const max = Number(drop.maxAmount || drop.max || min);

        return `🧩 **Mảnh Pháp Bảo** x${formatNumber(min)}-${formatNumber(max)} — **${formatChancePercent(drop.chance ?? drop.weight)}**`;
    }

    if (drop.type === "unidentified_weapon") {
        const rarity = weaponConfig.getRarity(drop.rarity || "F");

        return `${rarity.emoji} **Phôi ${rarity.id} chưa giám định** — **${formatChancePercent(drop.chance ?? drop.weight)}**`;
    }

    if (drop.type === "chest") {
        const chest = shop[drop.itemId] || {};

        return `${chest.emoji || "🎁"} **${chest.name || drop.itemId}** — **${formatChancePercent(drop.chance ?? drop.weight)}**`;
    }

    return `🎁 **${drop.itemId || drop.type || "Vật phẩm"}** — **${formatChancePercent(drop.chance ?? drop.weight)}**`;
}

function getPhapBaoInfoChestItems() {
    return Object.entries(shop).filter(([, item]) => {
        return item && item.type === "phap_bao_chest";
    });
}

function buildPhapBaoInfoButtons(userId, active = "home") {
    function makeButton(topic, label, emoji) {
        return new ButtonBuilder()
            .setCustomId(`phapbaoinfo_${topic}_${userId}`)
            .setLabel(label)
            .setEmoji(emoji)
            .setStyle(
                active === topic ? ButtonStyle.Primary : ButtonStyle.Secondary,
            );
    }

    return [
        new ActionRowBuilder().addComponents(
            makeButton("home", "Tổng quan", "🏠"),
            makeButton("chests", "% các rương", "📦"),
            makeButton("substats", "Dòng phụ", "✨"),
            makeButton("appraise", "Giám định", "🔍"),
            makeButton("upgrade", "Nâng cấp", "⭐"),
        ),
        new ActionRowBuilder().addComponents(makeButton("ex", "EX", "🌈")),
    ];
}

function buildPhapBaoInfoHomeEmbed() {
    return new EmbedBuilder()
        .setTitle("🐷 Hướng Dẫn Pháp Bảo 3.0")
        .setColor(0xf1c40f)
        .setDescription(
            [
                "Pháp bảo là hệ thống trang bị endgame.",
                "",
                "**Flow chính:**",
                "`/mophapbao` → mở rương lấy mảnh/phôi",
                "`/giamdinh` → biến phôi thành pháp bảo thật",
                "`/trangbi` → cộng chỉ số combat",
                "`/phangiai` → đổi pháp bảo rác thành mảnh",
                "`/ghep` → ghép phôi mới bằng mảnh",
                "`/nangsao` → dùng bản trùng nâng sao",
                "`/rollphapbao` → roll lại dòng phụ",
                "",
                "Bấm các nút bên dưới để xem chi tiết.",
            ].join("\n"),
        )
        .addFields(
            {
                name: "⚠️ Lưu ý quan trọng",
                value: [
                    "Rarity khi mở rương chỉ là **cấp phôi**.",
                    "Rarity thật chỉ lộ ra sau khi `/giamdinh`.",
                    "Ví dụ: phôi SSS vẫn có thể giám định ra A/S/SS/SSS.",
                ].join("\n"),
                inline: false,
            },
            {
                name: "📦 Muốn xem tỉ lệ rương?",
                value: "Bấm nút **📦 % các rương**.",
                inline: true,
            },
            {
                name: "✨ Muốn xem dòng phụ?",
                value: "Bấm nút **✨ Dòng phụ**.",
                inline: true,
            },
        )
        .setFooter({
            text: "Mamu pháp bảo: càng roll càng cay, càng cay càng nghiện.",
        })
        .setTimestamp();
}

function buildPhapBaoInfoChestRatesEmbed() {
    const chestEntries = getPhapBaoInfoChestItems();

    const embed = new EmbedBuilder()
        .setTitle("📦 Tỉ Lệ Rương Pháp Bảo")
        .setColor(0x3498db)
        .setDescription(
            [
                "Đây là tỉ lệ **mở rương pháp bảo trong shop**.",
                "",
                "Rương có thể ra:",
                "🧩 Mảnh Pháp Bảo",
                "⚫ Phôi pháp bảo chưa giám định",
                "",
                "Phôi càng cao thì cơ hội giám định ra đồ ngon càng cao, nhưng **không đảm bảo chắc chắn**.",
            ].join("\n"),
        );

    if (chestEntries.length <= 0) {
        embed.addFields({
            name: "Chưa có rương",
            value: "Không tìm thấy item `phap_bao_chest` trong shop.",
            inline: false,
        });

        return embed;
    }

    for (const [, chest] of chestEntries) {
        const drops = Array.isArray(chest.phapBaoDrops)
            ? chest.phapBaoDrops
            : [];

        const dropText =
            drops.length > 0
                ? drops.map(formatInfoDropLine).filter(Boolean).join("\n")
                : "Rương này chưa có bảng tỉ lệ.";

        embed.addFields({
            name: `${chest.emoji || "🎁"} ${chest.name}`,
            value: dropText.slice(0, 1024),
            inline: false,
        });
    }

    return embed
        .setFooter({
            text: "Tỉ lệ này là tỉ lệ ra phôi/mảnh, không phải tỉ lệ ra vũ khí cuối.",
        })
        .setTimestamp();
}

function buildPhapBaoInfoSubStatsEmbed() {
    return new EmbedBuilder()
        .setTitle("✨ Giải Thích Dòng Phụ Pháp Bảo")
        .setColor(0x9b59b6)
        .setDescription(
            [
                "Dòng phụ là chỉ số random sau khi `/giamdinh` hoặc `/rollphapbao`.",
                "",
                "Đã bỏ các dòng dễ phá economy như:",
                "❌ Tu vi +%",
                "❌ Tiền +%",
                "",
                "Dòng phụ hiện tập trung vào combat, boss, drop và một ít dòng troll.",
            ].join("\n"),
        )
        .addFields(
            {
                name: "⚔️ Dòng combat chính",
                value: [
                    "`atkPercent` — tăng ATK",
                    "`hpPercent` — tăng HP",
                    "`defensePercent` — tăng DEF",
                    "`speedPercent` — tăng tốc độ",
                    "`critChance` — tăng tỉ lệ chí mạng",
                    "`critDamage` — tăng sát thương chí mạng",
                    "`defenseIgnore` — xuyên thủ",
                ].join("\n"),
                inline: false,
            },
            {
                name: "🛡️ Dòng sinh tồn",
                value: [
                    "`lifeSteal` — hút máu",
                    "`dodgeChance` — né đòn",
                    "`counterChance` — phản công",
                    "`badLuckResist` — kháng xui/troll nhẹ",
                ].join("\n"),
                inline: false,
            },
            {
                name: "👹 Dòng farm/boss",
                value: [
                    "`bossDamage` — tăng sát thương khi đánh boss",
                    "`dropRate` — tăng may mắn rơi đồ nếu sau này bạn gắn vào farm",
                ].join("\n"),
                inline: false,
            },
            {
                name: "🐷 Dòng troll / vui",
                value: [
                    "`trashTalkPower` — sức mạnh mõm",
                    "`pigAura` — hào quang lợn",
                    "`sleepPower` — sức mạnh ngủ",
                    "",
                    "Các dòng này vô dụng .",
                ].join("\n"),
                inline: false,
            },
            {
                name: "🎲 Roll dòng",
                value: [
                    "Dùng `/rollphapbao` để roll lại dòng phụ.",
                    "Có thể khóa dòng bằng số thứ tự.",
                    "Ví dụ: `/rollphapbao khoa:1,3`",
                    "Khóa càng nhiều dòng thì càng tốn tiền.",
                ].join("\n"),
                inline: false,
            },
        )
        .setTimestamp();
}

function buildPhapBaoInfoAppraiseEmbed() {
    return new EmbedBuilder()
        .setTitle("🔍 Giám Định Pháp Bảo")
        .setColor(0xe67e22)
        .setDescription(
            [
                "`/giamdinh` dùng để mở phôi pháp bảo.",
                "",
                "Khi giám định sẽ roll:",
                "1. Rarity thật",
                "2. Tên pháp bảo",
                "3. Phẩm định",
                "4. Dòng phụ",
            ].join("\n"),
        )
        .addFields(
            {
                name: "⚠️ Phôi không phải đồ cuối",
                value: [
                    "Khi `/mophapbao`, bạn nhận được **phôi**.",
                    "Phôi chỉ là cấp nguyên liệu ban đầu.",
                    "Đồ thật chỉ quyết định sau khi `/giamdinh`.",
                ].join("\n"),
                inline: false,
            },
            {
                name: "Ví dụ",
                value: [
                    "Phôi SSS không có nghĩa là chắc chắn ra SSS.",
                    "Phôi SSS có thể ra A/S/SS/SSS tùy bảng tỉ lệ.",
                    "Phôi F/E/D là phôi cùi, chủ yếu dùng cho farm thường.",
                ].join("\n"),
                inline: false,
            },
        )
        .setTimestamp();
}

function buildPhapBaoInfoUpgradeEmbed() {
    return new EmbedBuilder()
        .setTitle("⭐ Nâng Cấp Pháp Bảo")
        .setColor(0x2ecc71)
        .setDescription("Các cách xử lý pháp bảo sau khi đã giám định.")
        .addFields(
            {
                name: "🧩 Phân giải",
                value: [
                    "`/phangiai` đổi pháp bảo rác thành Mảnh Pháp Bảo.",
                    "Không phân giải được đồ đang trang bị.",
                    "Không phân giải được đồ đã khóa.",
                ].join("\n"),
                inline: false,
            },
            {
                name: "🔒 Khóa pháp bảo",
                value: [
                    "`/khoaphapbao` để khóa/mở khóa.",
                    "Nên khóa đồ ngon để tránh phân giải nhầm.",
                ].join("\n"),
                inline: false,
            },
            {
                name: "🧬 Ghép phôi",
                value: [
                    "`/ghep` dùng Mảnh Pháp Bảo để ghép phôi mới.",
                    "Ghép ra **phôi chưa giám định**.",
                    "Không ghép được EX.",
                ].join("\n"),
                inline: false,
            },
            {
                name: "⭐ Nâng sao",
                value: [
                    "`/nangsao` dùng bản trùng để nâng sao.",
                    "Phải cùng vũ khí thật.",
                    "Nguyên liệu không được khóa và không được đang trang bị.",
                ].join("\n"),
                inline: false,
            },
        )
        .setTimestamp();
}

function buildPhapBaoInfoExEmbed() {
    return new EmbedBuilder()
        .setTitle("🌈 EX - Chí Tôn Thần Khí")
        .setColor(0xff4fd8)
        .setDescription(
            [
                "EX là cấp pháp bảo cực hiếm, dùng cho endgame/event.",
                "",
                "Bản hiện tại:",
                "❌ Không rơi từ shop thường",
                "❌ Không rơi từ Bí Cảnh thường",
                "❌ Không rơi từ Tower thường",
                "❌ Không ghép bằng mảnh thường",
                "❌ Không phân giải EX",
            ].join("\n"),
        )
        .addFields({
            name: "Nguồn EX tương lai",
            value: [
                "Raid Server",
                "Event giới hạn",
                "Boss event",
                "Rương EX đặc biệt do admin mở theo mùa",
            ].join("\n"),
            inline: false,
        })
        .setTimestamp();
}

function buildPhapBaoInfoEmbed(topic = "home") {
    if (topic === "chests") {
        return buildPhapBaoInfoChestRatesEmbed();
    }

    if (topic === "substats") {
        return buildPhapBaoInfoSubStatsEmbed();
    }

    if (topic === "appraise") {
        return buildPhapBaoInfoAppraiseEmbed();
    }

    if (topic === "upgrade") {
        return buildPhapBaoInfoUpgradeEmbed();
    }

    if (topic === "ex") {
        return buildPhapBaoInfoExEmbed();
    }

    return buildPhapBaoInfoHomeEmbed();
}

function normalizeInfoTopic(rawTopic) {
    const topic = String(rawTopic || "home").toLowerCase();

    const map = {
        tongquan: "home",
        home: "home",

        ruong: "chests",
        chests: "chests",

        dongphu: "substats",
        substats: "substats",

        giamdinh: "appraise",
        appraise: "appraise",

        nangcap: "upgrade",
        upgrade: "upgrade",

        ex: "ex",
    };

    return map[topic] || "home";
}

function phapBaoInfo(interaction) {
    const topic = normalizeInfoTopic(
        interaction.options?.getString("muc") || "home",
    );

    return interaction.reply({
        embeds: [buildPhapBaoInfoEmbed(topic)],
        components: buildPhapBaoInfoButtons(interaction.user.id, topic),
        ephemeral: true,
    });
}

async function handleButton(interaction) {
    if (interaction.customId.startsWith("phapbao_reroll_")) {
        const parts = interaction.customId.split("_");
        const action = parts[2];
        const ownerId = parts[3];
        const token = parts[4];

        if (String(interaction.user.id) !== String(ownerId)) {
            return interaction.reply({
                content: "❌ Đây không phải nút xác nhận roll của bạn.",
                ephemeral: true,
            });
        }

        const pending = pendingRerollConfirms.get(token);

        if (
            !pending ||
            Date.now() - Number(pending.createdAt || 0) > REROLL_CONFIRM_TTL_MS
        ) {
            pendingRerollConfirms.delete(token);

            return interaction.update({
                content:
                    "⏰ Xác nhận roll đã hết hạn. Hãy dùng lại `/rollphapbao`.",
                embeds: [],
                components: [],
            });
        }

        if (action === "cancel") {
            pendingRerollConfirms.delete(token);

            return interaction.update({
                content: "❌ Đã hủy roll dòng phụ.",
                embeds: [],
                components: [],
            });
        }

        if (action === "confirm") {
            pendingRerollConfirms.delete(token);

            return executeConfirmedReroll(
                interaction,
                pending.weaponUid,
                pending.lockedText,
            );
        }

        return undefined;
    }
    if (
        interaction.customId.startsWith("phapbao_prev_") ||
        interaction.customId.startsWith("phapbao_next_")
    ) {
        const parts = interaction.customId.split("_");
        const action = parts[1];
        const ownerId = parts[2];
        const currentPage = Number.parseInt(parts[3], 10) || 1;

        if (String(interaction.user.id) !== String(ownerId)) {
            return interaction.reply({
                content: "❌ Đây không phải kho pháp bảo của bạn.",
                ephemeral: true,
            });
        }

        const user = database.getUser(ownerId);
        const weapons = Array.isArray(user.weapons) ? user.weapons : [];

        const totalPages = Math.max(
            1,
            Math.ceil(weapons.length / PHAPBAO_PAGE_SIZE),
        );

        const nextPage = action === "next" ? currentPage + 1 : currentPage - 1;

        const safePage = clampPhapBaoPage(nextPage, totalPages);

        return interaction.update({
            embeds: [buildWeaponListEmbed(user, safePage)],
            components: buildWeaponListButtons(ownerId, safePage, totalPages),
        });
    }

    if (interaction.customId.startsWith("phapbaoinfo_")) {
        const parts = interaction.customId.split("_");
        const topic = parts[1] || "home";
        const ownerId = parts[2];

        if (String(interaction.user.id) !== String(ownerId)) {
            return interaction.reply({
                content:
                    "❌ Đây không phải bảng pháp bảo của bạn. Tự dùng `/phapbaoinfo` đi anh bạn.",
                ephemeral: true,
            });
        }

        const safeTopic = normalizeInfoTopic(topic);

        return interaction.update({
            embeds: [buildPhapBaoInfoEmbed(safeTopic)],
            components: buildPhapBaoInfoButtons(ownerId, safeTopic),
        });
    }

    return undefined;
}

module.exports = {
    openChest,
    autocompleteChest,
    giveUnidentifiedWeaponReward,

    listWeapons,

    appraiseWeapon,
    autocompleteUnidentifiedWeapon,

    autocompleteIdentifiedWeapon,
    autocompleteAnyWeapon,
    autocompleteUpgradeableWeapon,

    equipWeapon,
    unequipWeapon,
    handleButton,
    dismantleWeapon,
    lockWeapon,

    upgradeWeaponStars,
    mergeWeapon,
    phapBaoInfo,
    rerollWeaponSubStats,
};
