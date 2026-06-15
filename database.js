const fs = require("fs");

const shop = require("./config/shop");
const economy = require("./config/economy");
const currency = require("./config/currency");
const databaseConfig = require("./config/database");
const messages = require("./config/messages");
const tuTienConfig = require("./config/tutien");
const questConfig = require("./config/quest");

const DATA_FILE = databaseConfig.dataFile;
const DEFAULT_DATA = { users: {}, system: {} };

function createDefaultUser() {
    return {
        money: economy.startingMoney,
        ...databaseConfig.defaultUser,
    };
}

function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        saveData(DEFAULT_DATA);
    }

    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    if (!data.users) {
        data.users = {};
    }

    if (!data.system) {
        data.system = {};
    }

    return data;
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getShiftedDate(offsetHours = 7) {
    return new Date(Date.now() + offsetHours * 60 * 60 * 1000);
}

function getDailyQuestKey() {
    return getShiftedDate(questConfig.timezoneOffsetHours)
        .toISOString()
        .slice(0, 10);
}

function getWeeklyQuestKey() {
    const date = getShiftedDate(questConfig.timezoneOffsetHours);
    const day = date.getUTCDay();
    const diffToMonday = (day + 6) % 7;

    date.setUTCDate(date.getUTCDate() - diffToMonday);

    return date.toISOString().slice(0, 10);
}

function getQuestPeriodKey(type) {
    return type === "weekly" ? getWeeklyQuestKey() : getDailyQuestKey();
}

function ensureQuestBucket(user, type) {
    if (!user.quests) {
        user.quests = {};
    }

    const periodKey = getQuestPeriodKey(type);

    if (!user.quests[type] || user.quests[type].periodKey !== periodKey) {
        user.quests[type] = {
            periodKey,
            progress: {},
            claimed: {},
        };
    }

    if (!user.quests[type].progress) {
        user.quests[type].progress = {};
    }

    if (!user.quests[type].claimed) {
        user.quests[type].claimed = {};
    }

    return user.quests[type];
}

function getQuestState(userId, type = "daily") {
    return withData((data) => {
        const user = ensureUser(data, userId);
        return ensureQuestBucket(user, type);
    });
}

function trackQuestProgress(userId, taskId, amount = 1) {
    return withData((data) => {
        const user = ensureUser(data, userId);
        const safeAmount = Math.max(1, Number(amount || 1));

        for (const type of ["daily", "weekly"]) {
            const bucket = ensureQuestBucket(user, type);
            bucket.progress[taskId] =
                Number(bucket.progress[taskId] || 0) + safeAmount;
        }

        return user.quests;
    });
}

function findQuestConfig(type, questId) {
    const group = type === "weekly" ? questConfig.weekly : questConfig.daily;
    return group.quests.find((quest) => quest.id === questId);
}

function claimQuestReward(userId, type = "daily", questId) {
    return withData((data) => {
        const user = ensureUser(data, userId);
        const bucket = ensureQuestBucket(user, type);
        const quest = findQuestConfig(type, questId);

        if (!quest) {
            return {
                success: false,
                message: "Không tìm thấy nhiệm vụ.",
            };
        }

        if (bucket.claimed[quest.id]) {
            return {
                success: false,
                message: "Bạn đã nhận thưởng nhiệm vụ này rồi.",
            };
        }

        const current = Number(bucket.progress[quest.taskId] || 0);
        const target = Number(quest.target || 1);

        if (current < target) {
            return {
                success: false,
                message: "Nhiệm vụ chưa hoàn thành.",
            };
        }

        const reward = quest.reward || {};

        if (reward.money) {
            user.money = Number(user.money || 0) + Number(reward.money || 0);
        }

        if (reward.tuVi) {
            if (!user.tuTienProfile) {
                user.tuTienProfile = JSON.parse(
                    JSON.stringify(tuTienConfig.defaultProfile || {}),
                );
            }

            user.tuTienProfile.exp =
                Number(user.tuTienProfile.exp || 0) + Number(reward.tuVi || 0);
        }

        if (Array.isArray(reward.items)) {
            if (!user.inventory) {
                user.inventory = {};
            }

            for (const itemReward of reward.items) {
                const itemId = itemReward.itemId;
                const amount = Math.max(1, Number(itemReward.amount || 1));

                if (!itemId) {
                    continue;
                }

                user.inventory[itemId] =
                    Number(user.inventory[itemId] || 0) + amount;
            }
        }

        bucket.claimed[quest.id] = Date.now();

        return {
            success: true,
            quest,
            reward,
        };
    });
}

function ensurePhapBaoData(user) {
    if (!Array.isArray(user.weapons)) {
        user.weapons = [];
    }

    if (user.equippedWeaponUid === undefined) {
        user.equippedWeaponUid = null;
    }

    if (!user.phapBaoStats) {
        user.phapBaoStats = {
            openedChests: 0,
            appraised: 0,
            dismantled: 0,
            merged: 0,
            upgradedStars: 0,
            rerolled: 0,
            totalFragmentsEarned: 0,
            totalFragmentsSpent: 0,
            totalMoneySpent: 0,
            bestRarityFound: null,
            bestWeaponName: null,
            updatedAt: 0,
        };
    }

    if (user.phapBaoStats.openedChests === undefined) {
        user.phapBaoStats.openedChests = 0;
    }

    if (user.phapBaoStats.appraised === undefined) {
        user.phapBaoStats.appraised = 0;
    }

    if (user.phapBaoStats.dismantled === undefined) {
        user.phapBaoStats.dismantled = 0;
    }

    if (user.phapBaoStats.merged === undefined) {
        user.phapBaoStats.merged = 0;
    }

    if (user.phapBaoStats.upgradedStars === undefined) {
        user.phapBaoStats.upgradedStars = 0;
    }

    if (user.phapBaoStats.rerolled === undefined) {
        user.phapBaoStats.rerolled = 0;
    }

    if (user.phapBaoStats.totalFragmentsEarned === undefined) {
        user.phapBaoStats.totalFragmentsEarned = 0;
    }

    if (user.phapBaoStats.totalFragmentsSpent === undefined) {
        user.phapBaoStats.totalFragmentsSpent = 0;
    }

    if (user.phapBaoStats.totalMoneySpent === undefined) {
        user.phapBaoStats.totalMoneySpent = 0;
    }

    if (user.phapBaoStats.bestRarityFound === undefined) {
        user.phapBaoStats.bestRarityFound = null;
    }

    if (user.phapBaoStats.bestWeaponName === undefined) {
        user.phapBaoStats.bestWeaponName = null;
    }

    if (user.phapBaoStats.updatedAt === undefined) {
        user.phapBaoStats.updatedAt = 0;
    }

    return {
        weapons: user.weapons,
        equippedWeaponUid: user.equippedWeaponUid,
        stats: user.phapBaoStats,
    };
}

function ensureUser(data, userId) {
    if (!data.users[userId]) {
        data.users[userId] = createDefaultUser();
    }

    const user = data.users[userId];

    if (!user.inventory) {
        user.inventory = {};
    }
    if (!Array.isArray(user.inventoryItems)) {
        user.inventoryItems = [];
    }

    ensurePhapBaoData(user);

    return user;
}

function withData(mutator) {
    const data = loadData();
    const result = mutator(data);

    saveData(data);

    return result;
}

function getCurrencyEmoji() {
    return currency.emoji;
}

function formatMoney(amount) {
    return Number(amount).toLocaleString(currency.locale);
}

function createUser(userId) {
    return withData((data) => ensureUser(data, userId));
}

function getUser(userId) {
    return withData((data) => ensureUser(data, userId));
}

function updateUser(userId, updater) {
    return withData((data) => {
        const user = ensureUser(data, userId);

        return updater(user, data);
    });
}

function addMoney(userId, amount) {
    return withData((data) => {
        const user = ensureUser(data, userId);

        user.money += amount;

        if (user.money < 0) {
            user.money = 0;
        }

        return user.money;
    });
}

function getBalance(userId) {
    const user = getUser(userId);
    return Number(user.money || 0);
}

function removeMoney(userId, amount) {
    const safeAmount = Math.max(0, Number(amount || 0));

    if (safeAmount <= 0) {
        return {
            success: false,
            message: "Số tiền không hợp lệ.",
        };
    }

    const user = getUser(userId);
    const currentMoney = Number(user.money || 0);

    if (currentMoney < safeAmount) {
        return {
            success: false,
            message: "Không đủ tiền.",
        };
    }

    addMoney(userId, -safeAmount);

    return {
        success: true,
        balance: currentMoney - safeAmount,
    };
}

function addWin(userId) {
    return withData((data) => {
        ensureUser(data, userId).wins += 1;
    });
}

function ensureNoiTuStats(user) {
    if (!user.noituStats) {
        user.noituStats = {
            correct: 0,
            wins: 0,
            botStuckWins: 0,
            forfeitWins: 0,
            totalMoney: 0,
            updatedAt: 0,
        };
    }

    if (user.noituStats.correct === undefined) {
        user.noituStats.correct = 0;
    }

    if (user.noituStats.wins === undefined) {
        user.noituStats.wins = 0;
    }

    if (user.noituStats.botStuckWins === undefined) {
        user.noituStats.botStuckWins = 0;
    }

    if (user.noituStats.forfeitWins === undefined) {
        user.noituStats.forfeitWins = 0;
    }

    if (user.noituStats.totalMoney === undefined) {
        user.noituStats.totalMoney = 0;
    }

    if (user.noituStats.updatedAt === undefined) {
        user.noituStats.updatedAt = 0;
    }

    return user.noituStats;
}

function recordNoiTuCorrect(userId, reward = 0) {
    return withData((data) => {
        const user = ensureUser(data, userId);
        const stats = ensureNoiTuStats(user);

        stats.correct += 1;
        stats.totalMoney += Math.max(0, Math.floor(Number(reward || 0)));
        stats.updatedAt = Date.now();

        return stats;
    });
}

function recordNoiTuWin(userId, reward = 0, type = "normal") {
    return withData((data) => {
        const user = ensureUser(data, userId);
        const stats = ensureNoiTuStats(user);

        stats.wins += 1;

        if (type === "bot_stuck") {
            stats.botStuckWins += 1;
        }

        if (type === "forfeit") {
            stats.forfeitWins += 1;
        }

        stats.totalMoney += Math.max(0, Math.floor(Number(reward || 0)));
        stats.updatedAt = Date.now();

        return stats;
    });
}

function recordNoiTuReward(userId, reward = 0) {
    return withData((data) => {
        const user = ensureUser(data, userId);
        const stats = ensureNoiTuStats(user);

        stats.totalMoney += Math.max(0, Math.floor(Number(reward || 0)));
        stats.updatedAt = Date.now();

        return stats;
    });
}

function getNoiTuLeaderboard(limit = 10) {
    return withData((data) => {
        const users = Object.entries(data.users || {}).map(([userId, user]) => {
            const stats = ensureNoiTuStats(user);

            return {
                userId,
                correct: Number(stats.correct || 0),
                wins: Number(stats.wins || 0),
                botStuckWins: Number(stats.botStuckWins || 0),
                forfeitWins: Number(stats.forfeitWins || 0),
                totalMoney: Number(stats.totalMoney || 0),
                updatedAt: Number(stats.updatedAt || 0),
            };
        });

        return users
            .filter((user) => {
                return user.correct > 0 || user.wins > 0 || user.totalMoney > 0;
            })
            .sort((a, b) => {
                if (b.correct !== a.correct) {
                    return b.correct - a.correct;
                }

                if (b.wins !== a.wins) {
                    return b.wins - a.wins;
                }

                return b.totalMoney - a.totalMoney;
            })
            .slice(0, limit);
    });
}

function addLoss(userId) {
    return withData((data) => {
        ensureUser(data, userId).losses += 1;
    });
}

function claimWorkCooldown(userId, cooldownMs) {
    return withData((data) => {
        const user = ensureUser(data, userId);
        const now = Date.now();
        const lastWork = user.lastWork || 0;
        const timeLeft = cooldownMs - (now - lastWork);

        if (timeLeft > 0) {
            return { success: false, timeLeft };
        }

        user.lastWork = now;

        return { success: true, timeLeft: 0 };
    });
}

function transferMoney(fromUserId, toUserId, amount) {
    return withData((data) => {
        const sender = ensureUser(data, fromUserId);
        const receiver = ensureUser(data, toUserId);

        if (amount <= 0) {
            return { success: false, message: messages.invalidAmount };
        }

        if (sender.money < amount) {
            return { success: false, message: messages.notEnoughMoney };
        }

        sender.money -= amount;
        receiver.money += amount;

        return { success: true };
    });
}

function getVietnamDateKey(timestamp = Date.now()) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(timestamp));
}

function getVietnamDayNumber(timestamp = Date.now()) {
    const dateKey = getVietnamDateKey(timestamp);
    const [year, month, day] = dateKey.split("-").map(Number);

    return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function getMsUntilVietnamMidnight() {
    const now = new Date();

    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(now);

    const year = Number(parts.find((p) => p.type === "year")?.value);
    const month = Number(parts.find((p) => p.type === "month")?.value);
    const day = Number(parts.find((p) => p.type === "day")?.value);

    const nextMidnightVietnamAsUtc = Date.UTC(
        year,
        month - 1,
        day + 1,
        -7,
        0,
        0,
    );

    return Math.max(0, nextMidnightVietnamAsUtc - Date.now());
}

function claimDaily(userId) {
    return withData((data) => {
        const user = ensureUser(data, userId);
        const now = Date.now();
        const daily = economy.daily;

        const todayKey = getVietnamDateKey(now);
        const todayNumber = getVietnamDayNumber(now);

        const lastDaily = Number(user.lastDaily || 0);
        const lastDailyDate =
            user.lastDailyDate || getVietnamDateKey(lastDaily);
        const lastDailyNumber =
            lastDaily > 0 ? getVietnamDayNumber(lastDaily) : 0;

        if (lastDailyDate === todayKey) {
            return {
                success: false,
                timeLeft: getMsUntilVietnamMidnight(),
            };
        }

        if (lastDailyNumber > 0 && todayNumber - lastDailyNumber === 1) {
            user.dailyStreak = Number(user.dailyStreak || 0) + 1;
        } else {
            user.dailyStreak = 1;
        }

        const reward = Math.min(
            Math.ceil(
                daily.baseReward *
                    Math.pow(daily.growthRate, user.dailyStreak - 1),
            ),
            daily.maxReward,
        );

        user.money += reward;
        user.lastDaily = now;
        user.lastDailyDate = todayKey;

        return {
            success: true,
            reward,
            streak: user.dailyStreak,
        };
    });
}

function getShop() {
    return shop;
}

function normalizeItemId(itemId, currentShop = shop) {
    const rawItemId = String(itemId).trim();

    if (currentShop[rawItemId]) {
        return rawItemId;
    }

    const cleanItemId = rawItemId.replace(/;+$/, "");

    if (currentShop[cleanItemId]) {
        return cleanItemId;
    }

    return rawItemId;
}
function buyItem(userId, itemId, quantity = 1) {
    return withData((data) => {
        const user = ensureUser(data, userId);
        const normalizedItemId = normalizeItemId(itemId);
        const item = shop[normalizedItemId];

        quantity = Math.floor(Number(quantity));

        if (!quantity || quantity <= 0) {
            return {
                success: false,
                message: "Số lượng phải lớn hơn 0",
            };
        }

        if (!item) {
            return {
                success: false,
                message: messages.itemNotFound,
            };
        }

        if (item.hidden || item.buyable === false) {
            return {
                success: false,
                message: "Vật phẩm này không thể mua trong shop",
            };
        }

        const totalPrice = item.price * quantity;

        if (user.money < totalPrice) {
            return {
                success: false,
                message: "Không đủ tiền",
            };
        }

        if (!user.inventory[normalizedItemId]) {
            user.inventory[normalizedItemId] = 0;
        }

        user.money -= totalPrice;
        user.inventory[normalizedItemId] += quantity;

        return {
            success: true,
            item,
            quantity,
            totalPrice,
        };
    });
}

function sellItem(userId, itemId, quantity = 1) {
    return withData((data) => {
        const user = ensureUser(data, userId);

        quantity = Math.floor(Number(quantity));

        if (!quantity || quantity <= 0) {
            return {
                success: false,
                message: "Số lượng phải lớn hơn 0",
            };
        }

        if (String(itemId).startsWith("special:")) {
            const specialIndex = Number.parseInt(
                String(itemId).split(":")[1],
                10,
            );
            const specialItem = user.inventoryItems[specialIndex];

            if (!specialItem) {
                return {
                    success: false,
                    message: "Vật phẩm không tồn tại trong kho",
                };
            }

            if (specialItem.type === "dog" && !specialItem.dogStatsCounted) {
                if (!user.dogStats) {
                    user.dogStats = {
                        totalCaught: 0,
                        totalValue: 0,
                        bestDogValue: 0,
                        bestDogName: null,
                        bestDogWeightKg: 0,
                    };
                }

                if (user.dogStats.totalCaught === undefined) {
                    user.dogStats.totalCaught = 0;
                }

                if (user.dogStats.totalValue === undefined) {
                    user.dogStats.totalValue = 0;
                }

                if (user.dogStats.bestDogValue === undefined) {
                    user.dogStats.bestDogValue = 0;
                }

                if (user.dogStats.bestDogName === undefined) {
                    user.dogStats.bestDogName = null;
                }

                if (user.dogStats.bestDogWeightKg === undefined) {
                    user.dogStats.bestDogWeightKg = 0;
                }

                const dogValue = Number(specialItem.value || 0);

                user.dogStats.totalCaught += 1;
                user.dogStats.totalValue += dogValue;

                if (dogValue > Number(user.dogStats.bestDogValue || 0)) {
                    user.dogStats.bestDogValue = dogValue;
                    user.dogStats.bestDogName =
                        specialItem.name || "Chó không tên";
                    user.dogStats.bestDogWeightKg = Number(
                        specialItem.weightKg || 0,
                    );
                }

                specialItem.dogStatsCounted = true;
            }

            if (quantity !== 1) {
                return {
                    success: false,
                    message: "Đồ đặc biệt chỉ bán từng món một",
                };
            }

            const sellPrice = Math.floor(specialItem.value || 0);

            if (sellPrice <= 0) {
                return {
                    success: false,
                    message: "Vật phẩm này chưa có giá bán",
                };
            }

            user.inventoryItems.splice(specialIndex, 1);
            user.money += sellPrice;

            return {
                success: true,
                item: specialItem,
                quantity: 1,
                sellPrice,
                totalPrice: sellPrice,
                special: true,
            };
        }

        const normalizedItemId = normalizeItemId(itemId);
        const item = shop[normalizedItemId];

        if (!item) {
            return {
                success: false,
                message: messages.itemNotFound,
            };
        }

        if (
            item.sellable === false ||
            item.type === "tu_tien_exp" ||
            item.type === "breakthrough_pill" ||
            item.type === "cultivation_chest" ||
            item.type === "tower_chest"
        ) {
            return {
                success: false,
                message: "Vật phẩm này không thể bán",
            };
        }

        if (
            !user.inventory[normalizedItemId] ||
            user.inventory[normalizedItemId] < quantity
        ) {
            return {
                success: false,
                message: "Không đủ vật phẩm để bán",
            };
        }

        const sellRate = economy.sellRate ?? 0.7;
        const sellPrice = Math.floor(item.price * sellRate);
        const totalPrice = sellPrice * quantity;

        user.inventory[normalizedItemId] -= quantity;

        if (user.inventory[normalizedItemId] <= 0) {
            delete user.inventory[normalizedItemId];
        }

        user.money += totalPrice;

        return {
            success: true,
            item,
            quantity,
            sellPrice,
            totalPrice,
            special: false,
        };
    });
}

function isIphoneItem(item) {
    if (!item || typeof item !== "object") {
        return false;
    }

    const id = String(item.id || "").toLowerCase();
    const name = String(item.name || "").toLowerCase();
    const type = String(item.type || "").toLowerCase();

    return (
        type === "iphone" || id.includes("iphone") || name.includes("iphone")
    );
}

function sellAllIphones(userId) {
    return withData((data) => {
        const user = ensureUser(data, userId);

        const keptItems = [];
        const soldItems = [];

        let totalPrice = 0;

        for (const item of user.inventoryItems) {
            if (!isIphoneItem(item)) {
                keptItems.push(item);
                continue;
            }

            const sellPrice = Math.max(0, Math.floor(Number(item.value || 0)));

            /*
             * Không xóa iPhone chưa có giá.
             */
            if (sellPrice <= 0) {
                keptItems.push(item);
                continue;
            }

            soldItems.push(item);
            totalPrice += sellPrice;
        }

        if (soldItems.length <= 0) {
            return {
                success: false,
                message: "Bạn không có iPhone nào có thể bán.",
            };
        }

        user.inventoryItems = keptItems;
        user.money = Number(user.money || 0) + totalPrice;

        return {
            success: true,
            quantity: soldItems.length,
            totalPrice,
            soldItems,
        };
    });
}

function sellAllDoThachUnder360k(userId) {
    return withData((data) => {
        const user = ensureUser(data, userId);

        const keptItems = [];
        const soldItems = [];

        let totalPrice = 0;

        for (const item of user.inventoryItems) {
            const value = Math.max(0, Math.floor(Number(item.value || 0)));

            if (item.type !== "dothach") {
                keptItems.push(item);
                continue;
            }

            if (value <= 0) {
                keptItems.push(item);
                continue;
            }

            if (value >= 360000) {
                keptItems.push(item);
                continue;
            }

            soldItems.push(item);
            totalPrice += value;
        }
        if (soldItems.length <= 0) {
            return {
                success: false,
                message: "Bạn không có đá dưới 360k",
            };
        }

        user.inventoryItems = keptItems;
        user.money = Number(user.money || 0) + totalPrice;

        return {
            success: true,
            quantity: soldItems.length,
            totalPrice,
            soldItems,
        };
    });
}

function sellAllDogs(userId) {
    return withData((data) => {
        const user = ensureUser(data, userId);

        if (!user.dogStats) {
            user.dogStats = {
                totalCaught: 0,
                totalValue: 0,
                bestDogValue: 0,
                bestDogName: null,
                bestDogWeightKg: 0,
            };
        }

        const keptItems = [];
        const soldItems = [];

        let totalPrice = 0;

        for (const item of user.inventoryItems) {
            if (item.type !== "dog") {
                keptItems.push(item);
                continue;
            }

            const dogValue = Math.max(0, Math.floor(Number(item.value || 0)));
            if (!item.dogStatsCounted) {
                user.dogStats.totalCaught =
                    Number(user.dogStats.totalCaught || 0) + 1;

                user.dogStats.totalValue =
                    Number(user.dogStats.totalValue || 0) + dogValue;

                if (dogValue > Number(user.dogStats.bestDogValue || 0)) {
                    user.dogStats.bestDogValue = dogValue;
                    user.dogStats.bestDogName = item.name || "Chó không tên";

                    user.dogStats.bestDogWeightKg = Number(item.weightKg || 0);
                }

                item.dogStatsCounted = true;
            }

            if (dogValue <= 0) {
                keptItems.push(item);
                continue;
            }

            soldItems.push(item);
            totalPrice += dogValue;
        }

        if (soldItems.length <= 0) {
            return {
                success: false,
                message: "Bạn không có con chó nào có thể bán.",
            };
        }

        user.inventoryItems = keptItems;
        user.money = Number(user.money || 0) + totalPrice;

        return {
            success: true,
            quantity: soldItems.length,
            totalPrice,
            soldItems,
        };
    });
}

function addInventoryItem(userId, item) {
    return withData((data) => {
        const user = ensureUser(data, userId);

        const storedItem = {
            ...item,
            createdAt: Date.now(),
        };

        if (storedItem.type === "dog") {
            if (!user.dogStats) {
                user.dogStats = {
                    totalCaught: 0,
                    totalValue: 0,
                    bestDogValue: 0,
                    bestDogName: null,
                    bestDogWeightKg: 0,
                };
            }

            const dogValue = Number(storedItem.value || 0);

            user.dogStats.totalCaught += 1;
            user.dogStats.totalValue += dogValue;

            if (dogValue > Number(user.dogStats.bestDogValue || 0)) {
                user.dogStats.bestDogValue = dogValue;
                user.dogStats.bestDogName = storedItem.name || "Chó không tên";
                user.dogStats.bestDogWeightKg = Number(
                    storedItem.weightKg || 0,
                );
            }

            storedItem.dogStatsCounted = true;
        }

        user.inventoryItems.push(storedItem);

        return storedItem;
    });
}

function getInventory(userId) {
    return withData((data) => {
        const user = ensureUser(data, userId);

        return {
            shopItems: user.inventory,
            specialItems: user.inventoryItems,
        };
    });
}

function ensureTuTienProfile(userId) {
    return withData((data) => {
        const user = ensureUser(data, userId);

        if (!user.tuTienProfile) {
            user.tuTienProfile = JSON.parse(
                JSON.stringify(tuTienConfig.defaultProfile),
            );
        }

        return user.tuTienProfile;
    });
}

function updateTuTienProfile(userId, updater) {
    return withData((data) => {
        const user = ensureUser(data, userId);

        if (!user.tuTienProfile) {
            user.tuTienProfile = JSON.parse(
                JSON.stringify(tuTienConfig.defaultProfile),
            );
        }

        updater(user.tuTienProfile);

        return user.tuTienProfile;
    });
}

function ensureTowerProfile(userId) {
    return withData((data) => {
        const user = ensureUser(data, userId);

        if (!user.tower) {
            user.tower = {
                floor: 0,
                highestFloor: 0,
                lastLoseAt: 0,
                loseCooldownUntil: 0,
                totalEarned: 0,
                totalChests: 0,
            };
        }

        user.tower.floor = Number(user.tower.floor || 0);
        user.tower.highestFloor = Number(
            user.tower.highestFloor || user.tower.floor || 0,
        );
        user.tower.lastLoseAt = Number(user.tower.lastLoseAt || 0);
        user.tower.loseCooldownUntil = Number(
            user.tower.loseCooldownUntil || 0,
        );
        user.tower.totalEarned = Number(user.tower.totalEarned || 0);
        user.tower.totalChests = Number(user.tower.totalChests || 0);

        return user.tower;
    });
}

function updateTowerProfile(userId, updater) {
    return withData((data) => {
        const user = ensureUser(data, userId);

        if (!user.tower) {
            user.tower = {
                floor: 0,
                highestFloor: 0,
                lastLoseAt: 0,
                loseCooldownUntil: 0,
                totalEarned: 0,
                totalChests: 0,
            };
        }

        updater(user.tower, user);

        user.tower.floor = Number(user.tower.floor || 0);
        user.tower.highestFloor = Math.max(
            Number(user.tower.highestFloor || 0),
            Number(user.tower.floor || 0),
        );
        user.tower.lastLoseAt = Number(user.tower.lastLoseAt || 0);
        user.tower.loseCooldownUntil = Number(
            user.tower.loseCooldownUntil || 0,
        );
        user.tower.totalEarned = Number(user.tower.totalEarned || 0);
        user.tower.totalChests = Number(user.tower.totalChests || 0);

        return user.tower;
    });
}

function consumeShopItem(userId, itemId, quantity = 1) {
    return withData((data) => {
        const user = ensureUser(data, userId);

        quantity = Math.floor(Number(quantity));

        if (!quantity || quantity <= 0) {
            return {
                success: false,
                message: "Số lượng phải lớn hơn 0",
            };
        }

        if (!user.inventory[itemId] || user.inventory[itemId] < quantity) {
            return {
                success: false,
                message: "Không đủ vật phẩm",
            };
        }

        user.inventory[itemId] -= quantity;

        if (user.inventory[itemId] <= 0) {
            delete user.inventory[itemId];
        }

        return {
            success: true,
        };
    });
}

function getAllUsers() {
    return withData((data) => {
        return Object.entries(data.users || {}).map(([userId, user]) => ({
            userId,
            ...user,
        }));
    });
}

function getSystemValue(key) {
    return withData((data) => {
        if (!data.system) {
            data.system = {};
        }

        return data.system[key];
    });
}

function setSystemValue(key, value) {
    return withData((data) => {
        if (!data.system) {
            data.system = {};
        }

        data.system[key] = value;

        return data.system[key];
    });
}

function deleteSystemValue(key) {
    return withData((data) => {
        if (!data.system) {
            data.system = {};
        }

        delete data.system[key];

        return true;
    });
}

function addShopItem(userId, itemId, amount = 1) {
    return withData((data) => {
        const user = ensureUser(data, userId);

        if (!user.inventory) {
            user.inventory = {};
        }

        user.inventory[itemId] =
            Number(user.inventory[itemId] || 0) + Number(amount || 1);

        return user.inventory[itemId];
    });
}

function ensureDungeonProfile(user) {
    if (!user.dungeon) {
        user.dungeon = {
            highestClearedStage: 0,
            sweepCooldownUntil: 0,
            totalChallenges: 0,
            totalWins: 0,
            totalLosses: 0,
            totalSweeps: 0,
            stageClears: {},
        };
    }

    if (user.dungeon.highestClearedStage === undefined) {
        user.dungeon.highestClearedStage = 0;
    }

    if (user.dungeon.sweepCooldownUntil === undefined) {
        user.dungeon.sweepCooldownUntil = 0;
    }

    if (user.dungeon.totalChallenges === undefined) {
        user.dungeon.totalChallenges = 0;
    }

    if (user.dungeon.totalWins === undefined) {
        user.dungeon.totalWins = 0;
    }

    if (user.dungeon.totalLosses === undefined) {
        user.dungeon.totalLosses = 0;
    }

    if (user.dungeon.totalSweeps === undefined) {
        user.dungeon.totalSweeps = 0;
    }

    if (!user.dungeon.stageClears) {
        user.dungeon.stageClears = {};
    }

    return user.dungeon;
}

function getDungeonProfile(userId) {
    return withData((data) => {
        const user = ensureUser(data, userId);

        return ensureDungeonProfile(user);
    });
}

function updateDungeonProfile(userId, updater) {
    return withData((data) => {
        const user = ensureUser(data, userId);
        const dungeon = ensureDungeonProfile(user);

        updater(dungeon, user);

        return dungeon;
    });
}

function ensureSecretRealmState(data) {
    if (!data.system) {
        data.system = {};
    }

    if (!data.system.secretRealms) {
        data.system.secretRealms = {
            realms: {},
            userFatigue: {},
            activeUserRealms: {},
        };
    }

    const state = data.system.secretRealms;

    if (!state.realms) {
        state.realms = {};
    }

    if (!state.userFatigue) {
        state.userFatigue = {};
    }

    if (!state.activeUserRealms) {
        state.activeUserRealms = {};
    }

    return state;
}

function getSecretRealmState() {
    return withData((data) => {
        return ensureSecretRealmState(data);
    });
}

function updateSecretRealmState(updater) {
    return withData((data) => {
        const state = ensureSecretRealmState(data);

        updater(state);

        return state;
    });
}

function getSecretRealmFatigue(userId) {
    return withData((data) => {
        const state = ensureSecretRealmState(data);

        if (!state.userFatigue[userId]) {
            state.userFatigue[userId] = {
                guestRuns: 0,
                hostRuns: 0,
                resetDate: "",
                updatedAt: 0,
            };
        }

        return state.userFatigue[userId];
    });
}

function updateSecretRealmFatigue(userId, updater) {
    return withData((data) => {
        const state = ensureSecretRealmState(data);

        if (!state.userFatigue[userId]) {
            state.userFatigue[userId] = {
                guestRuns: 0,
                hostRuns: 0,
                resetDate: "",
                updatedAt: 0,
            };
        }

        updater(state.userFatigue[userId]);

        return state.userFatigue[userId];
    });
}

module.exports = {
    createUser,
    getUser,
    updateUser,
    getBalance,
    addMoney,
    removeMoney,
    addWin,
    addLoss,
    recordNoiTuCorrect,
    recordNoiTuWin,
    claimDaily,
    claimWorkCooldown,
    formatMoney,
    getCurrencyEmoji,
    transferMoney,
    getShop,
    buyItem,
    addInventoryItem,
    getInventory,
    consumeShopItem,
    sellItem,
    sellAllDogs,
    sellAllIphones,
    sellAllDoThachUnder360k,
    ensureTuTienProfile,
    updateTuTienProfile,
    ensureTowerProfile,
    updateTowerProfile,
    getAllUsers,
    getSystemValue,
    setSystemValue,
    deleteSystemValue,
    addShopItem,
    getDungeonProfile,
    updateDungeonProfile,
    getQuestState,
    trackQuestProgress,
    claimQuestReward,
    getSecretRealmState,
    updateSecretRealmState,
    getSecretRealmFatigue,
    updateSecretRealmFatigue,
};
