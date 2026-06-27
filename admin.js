const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const {
    addMoney,
    removeMoney: takeMoney,
    formatMoney,
    getCurrencyEmoji,
    getShop,
    addShopItem,
} = require("./database");

const adminConfig = require("./config/admin");

const activityStats = new Map();
const activeRains = new Map();
const autoActiveRainTimers = new Map();

const ACTIVITY_WINDOW_MS = 3 * 60 * 60 * 1000;
const MESSAGE_COOLDOWN_MS = 20 * 1000;
const COMMAND_COOLDOWN_MS = 10 * 1000;
const RAIN_EXPIRE_MS = 60 * 60 * 1000;

const MIN_SCORE_TO_PICK = 8;
const MAX_SCORE_PER_MESSAGE = 3;
const MAX_RAIN_TARGETS = 20;

const AUTO_ACTIVE_RAIN_CHANNEL_IDS = [
    "1508916752514420816",
    "1509179670967615578",
];

const AUTO_ACTIVE_RAIN_TARGET_COUNT = 3;
const AUTO_ACTIVE_RAIN_REWARD = 3000;

const AUTO_ACTIVE_RAIN_MIN_DELAY_MS = 60 * 60 * 1000;
const AUTO_ACTIVE_RAIN_MAX_DELAY_MS = 3 * 60 * 60 * 1000;

const COMMAND_ACTIVITY_SCORE = 3;

function isAllowed(userId) {
    const allowedUserIds = Array.isArray(adminConfig.allowedUserIds)
        ? adminConfig.allowedUserIds.map(String)
        : [];

    return allowedUserIds.includes(String(userId));
}

function isValidAmount(amount) {
    return Number.isInteger(amount) && amount > 0;
}

function getActivityKey(guildId, channelId) {
    return `${guildId}_${channelId}`;
}

function normalizeMessageContent(content) {
    return String(content || "")
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, "")
        .replace(/<a?:\w+:\d+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function calculateQualityScore(content) {
    const text = normalizeMessageContent(content);

    if (!text || text.length < 5) {
        return 0;
    }

    const noSpace = text.replace(/\s/g, "");

    if (/^(.)\1+$/.test(noSpace)) {
        return 0;
    }

    const words = text.split(" ").filter(Boolean);
    const uniqueWords = new Set(words);

    if (words.length <= 1 && text.length < 12) {
        return 0;
    }

    if (words.length >= 3 && uniqueWords.size <= 1) {
        return 0;
    }

    let score = 1;

    if (words.length >= 5) {
        score += 1;
    }

    if (text.length >= 40) {
        score += 1;
    }

    return Math.min(score, MAX_SCORE_PER_MESSAGE);
}

function getChannelBucket(guildId, channelId) {
    const key = getActivityKey(guildId, channelId);

    if (!activityStats.has(key)) {
        activityStats.set(key, {
            users: new Map(),
        });
    }

    return activityStats.get(key);
}

function pruneSamples(stat) {
    const now = Date.now();

    stat.samples = stat.samples.filter((sample) => {
        return now - sample.createdAt <= ACTIVITY_WINDOW_MS;
    });
}

function getUserScore(stat) {
    pruneSamples(stat);

    return stat.samples.reduce((sum, sample) => {
        return sum + sample.score;
    }, 0);
}

function getTopActiveUsers(guildId, channelId, limit, excludedUserIds) {
    if (limit <= 0) {
        return [];
    }

    const bucket = getChannelBucket(guildId, channelId);
    const users = [];

    for (const [userId, stat] of bucket.users.entries()) {
        if (excludedUserIds.has(userId)) {
            continue;
        }

        const score = getUserScore(stat);

        if (score < MIN_SCORE_TO_PICK) {
            continue;
        }

        users.push({
            userId,
            score,
            messageCount: stat.samples.length,
        });
    }

    return users
        .sort((a, b) => {
            return b.score - a.score;
        })
        .slice(0, limit);
}

function getRandomActiveUsers(guildId, channelId, limit, excludedUserIds) {
    if (limit <= 0) {
        return [];
    }

    const bucket = getChannelBucket(guildId, channelId);
    const candidates = [];

    for (const [userId, stat] of bucket.users.entries()) {
        if (excludedUserIds.has(userId)) {
            continue;
        }

        const score = getUserScore(stat);

        if (score <= 0) {
            continue;
        }

        candidates.push({
            userId,
            score,
            messageCount: stat.samples.length,
        });
    }

    for (let i = candidates.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = candidates[i];

        candidates[i] = candidates[j];
        candidates[j] = temp;
    }

    return candidates.slice(0, limit);
}

function getRecentActiveUsers(guildId, channelId, limit) {
    if (limit <= 0) {
        return [];
    }

    const bucket = getChannelBucket(guildId, channelId);
    const users = [];

    for (const [userId, stat] of bucket.users.entries()) {
        pruneSamples(stat);

        if (!Array.isArray(stat.samples) || stat.samples.length <= 0) {
            continue;
        }

        const lastActiveAt = stat.samples.reduce((latest, sample) => {
            return Math.max(latest, Number(sample.createdAt || 0));
        }, 0);

        if (lastActiveAt <= 0) {
            continue;
        }

        users.push({
            userId,
            lastActiveAt,
            messageCount: stat.samples.length,
            score: getUserScore(stat),
        });
    }

    return users
        .sort((a, b) => {
            return b.lastActiveAt - a.lastActiveAt;
        })
        .slice(0, limit);
}

function randomDelay(minMs, maxMs) {
    const min = Number(minMs || 0);
    const max = Number(maxMs || min);

    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatDelay(ms) {
    const minutes = Math.round(Number(ms || 0) / 60000);

    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const restMinutes = minutes % 60;

        return restMinutes > 0 ? `${hours}h${restMinutes}p` : `${hours}h`;
    }

    return `${minutes} phút`;
}

function buildActiveRainReasonText(user) {
    if (user.reason === "random" || user.reason === "admin") {
        return "🎲 ngẫu nhiên";
    }

    return "🏆 tương tác tốt";
}

function normalizeSearchText(text) {
    return String(text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d");
}

function cutChoiceName(text) {
    const safe = String(text || "");

    return safe.length > 100 ? `${safe.slice(0, 97)}...` : safe;
}

function formatGiftItemChoice(itemId, item) {
    const name = item?.name || itemId;
    const emoji = item?.emoji || "🎁";
    const type = item?.type || "item";

    return cutChoiceName(`${emoji} ${name} | ${itemId} | ${type}`);
}

class AdminManager {
    recordCommandActivity(interaction) {
        if (!interaction || !interaction.guildId || !interaction.channelId) {
            return undefined;
        }

        if (!interaction.user || interaction.user.bot) {
            return undefined;
        }

        const bucket = getChannelBucket(
            interaction.guildId,
            interaction.channelId,
        );

        if (!bucket.users.has(interaction.user.id)) {
            bucket.users.set(interaction.user.id, {
                lastMessageAt: 0,
                lastCommandAt: 0,
                lastContent: "",
                samples: [],
            });
        }

        const stat = bucket.users.get(interaction.user.id);
        const now = Date.now();

        if (now - Number(stat.lastCommandAt || 0) < COMMAND_COOLDOWN_MS) {
            return undefined;
        }

        stat.lastCommandAt = now;

        stat.samples.push({
            score: COMMAND_ACTIVITY_SCORE,
            createdAt: now,
            type: "command",
        });

        pruneSamples(stat);

        return undefined;
    }

    async runAutoActiveRain(client, channelId) {
        const channel = await client.channels
            .fetch(channelId)
            .catch(() => null);

        if (
            !channel ||
            !channel.guildId ||
            !channel.isTextBased() ||
            typeof channel.send !== "function"
        ) {
            return undefined;
        }

        const selectedUsers = getRecentActiveUsers(
            channel.guildId,
            channel.id,
            AUTO_ACTIVE_RAIN_TARGET_COUNT,
        );

        if (selectedUsers.length <= 0) {
            return undefined;
        }

        for (const user of selectedUsers) {
            addMoney(user.userId, AUTO_ACTIVE_RAIN_REWARD);
        }

        const coin = getCurrencyEmoji();

        const rainDonorId = "1442869815847948470";

        const receiverLines = selectedUsers
            .map((user) => {
                return `- <@${user.userId}>`;
            })
            .join("\n");

        await channel.send({
            content: `<@${rainDonorId}> tặng cơn mưa\n` + `${receiverLines}`,
            allowedMentions: {
                users: [
                    rainDonorId,
                    ...selectedUsers.map((user) => user.userId),
                ],
            },
        });

        return undefined;
    }

    scheduleAutoActiveRain(client, channelId) {
        const safeChannelId = String(channelId || "");

        if (!safeChannelId || autoActiveRainTimers.has(safeChannelId)) {
            return;
        }

        const delay = randomDelay(
            AUTO_ACTIVE_RAIN_MIN_DELAY_MS,
            AUTO_ACTIVE_RAIN_MAX_DELAY_MS,
        );

        const timer = setTimeout(async () => {
            autoActiveRainTimers.delete(safeChannelId);

            try {
                await this.runAutoActiveRain(client, safeChannelId);
            } catch (error) {
                console.error(`[AutoActiveRain] ${safeChannelId}`, error);
            }

            this.scheduleAutoActiveRain(client, safeChannelId);
        }, delay);

        autoActiveRainTimers.set(safeChannelId, timer);

        console.log(
            `[AutoActiveRain] Channel ${safeChannelId} sẽ rain sau ${formatDelay(delay)}`,
        );
    }

    startAutoActiveRain(client) {
        for (const channelId of AUTO_ACTIVE_RAIN_CHANNEL_IDS) {
            this.scheduleAutoActiveRain(client, channelId);
        }
    }

    async autocompleteGiftItem(interaction) {
        const focusedValue = interaction.options.getFocused();
        const search = normalizeSearchText(focusedValue);
        const shopData = getShop();

        const choices = Object.entries(shopData)
            .filter(([itemId, item]) => {
                const text = normalizeSearchText(
                    `${itemId} ${item?.name || ""} ${item?.description || ""} ${item?.type || ""}`,
                );

                return text.includes(search);
            })
            .slice(0, 25)
            .map(([itemId, item]) => {
                return {
                    name: formatGiftItemChoice(itemId, item),
                    value: itemId,
                };
            });

        return interaction.respond(choices);
    }

    async giveItem(interaction) {
        if (!isAllowed(interaction.user.id)) {
            return interaction.reply({
                content: adminConfig.messages.noPermission,
                ephemeral: true,
            });
        }

        const targetUser = interaction.options.getUser("user", true);
        const itemId = interaction.options.getString("vatpham", true);
        const amount = interaction.options.getInteger("soluong") || 1;
        const shopData = getShop();
        const item = shopData[itemId];

        if (targetUser.bot) {
            return interaction.reply({
                content: "❌ Không tặng vật phẩm cho bot.",
                ephemeral: true,
            });
        }

        if (!item) {
            return interaction.reply({
                content:
                    `❌ Không tìm thấy item ID: \`${itemId}\` trong \`config/shop.js\`.\n` +
                    "Gõ từ khóa trong ô `vatpham` để bot gợi ý item hợp lệ.",
                ephemeral: true,
            });
        }

        if (!Number.isInteger(amount) || amount <= 0) {
            return interaction.reply({
                content: "❌ Số lượng không hợp lệ.",
                ephemeral: true,
            });
        }

        addShopItem(targetUser.id, itemId, amount);

        return interaction.reply({
            content:
                `✅ Đã tặng vật phẩm.\n\n` +
                `👤 Người nhận: ${targetUser}\n` +
                `🎁 Vật phẩm: ${item.emoji || "🎁"} **${item.name || itemId}**\n` +
                `🆔 ID: \`${itemId}\`\n` +
                `📦 Số lượng: **${amount.toLocaleString("vi-VN")}**`,
            ephemeral: true,
        });
    }
    async addMoney(interaction) {
        if (!isAllowed(interaction.user.id)) {
            return interaction.reply({
                content: adminConfig.messages.noPermission,
                ephemeral: true,
            });
        }

        const targetUser = interaction.options.getUser("user");
        const amount = interaction.options.getInteger("amount");
        const coin = getCurrencyEmoji();

        if (!isValidAmount(amount)) {
            return interaction.reply({
                content: adminConfig.messages.invalidAmount,
                ephemeral: true,
            });
        }

        if (targetUser.bot) {
            return interaction.reply({
                content: "❌ Không cộng tiền cho bot",
                ephemeral: true,
            });
        }

        addMoney(targetUser.id, amount);

        return interaction.reply({
            content:
                `✅ Đã cộng tiền\n\n` +
                `👤 User: ${targetUser}\n` +
                `${coin} Số tiền: ${formatMoney(amount)}`,
            ephemeral: true,
        });
    }

    async rain(interaction) {
        if (!isAllowed(interaction.user.id)) {
            return interaction.reply({
                content: adminConfig.messages.noPermission,
                ephemeral: true,
            });
        }

        const amount = interaction.options.getInteger("sotien");
        const maxClaims = interaction.options.getInteger("songuoi");
        const targetChannel =
            interaction.options.getChannel("kenh") || interaction.channel;

        const coin = getCurrencyEmoji();

        if (!isValidAmount(amount)) {
            return interaction.reply({
                content: adminConfig.messages.invalidAmount,
                ephemeral: true,
            });
        }

        if (!Number.isInteger(maxClaims) || maxClaims <= 0) {
            return interaction.reply({
                content: "❌ Số người nhận không hợp lệ.",
                ephemeral: true,
            });
        }

        if (maxClaims > MAX_RAIN_TARGETS) {
            return interaction.reply({
                content: `❌ Một lần rain tối đa ${MAX_RAIN_TARGETS} người thôi.`,
                ephemeral: true,
            });
        }

        if (amount < maxClaims) {
            return interaction.reply({
                content:
                    "❌ Số tiền rain phải lớn hơn hoặc bằng số người nhận.",
                ephemeral: true,
            });
        }

        if (
            !targetChannel ||
            !targetChannel.isTextBased() ||
            typeof targetChannel.send !== "function"
        ) {
            return interaction.reply({
                content: "❌ Kênh này không gửi rain được.",
                ephemeral: true,
            });
        }

        const botMember = interaction.guild.members.me;

        if (
            botMember &&
            targetChannel.permissionsFor(botMember) &&
            !targetChannel.permissionsFor(botMember).has("SendMessages")
        ) {
            return interaction.reply({
                content: "❌ Bot không có quyền gửi tin nhắn trong kênh đó.",
                ephemeral: true,
            });
        }

        const payResult = takeMoney(interaction.user.id, amount);

        if (!payResult.success) {
            return interaction.reply({
                content: `❌ Bạn không đủ tiền để tạo rain.\n${payResult.message}`,
                ephemeral: true,
            });
        }

        const rainId = `${Date.now()}_${Math.floor(Math.random() * 999999)}`;
        const perClaim = Math.floor(amount / maxClaims);

        const state = {
            type: "normal",
            id: rainId,
            creatorId: interaction.user.id,
            creatorTag: interaction.user.tag,
            amount,
            remaining: amount,
            perClaim,
            maxClaims,
            claimedUserIds: new Set(),
            expiresAt: Date.now() + RAIN_EXPIRE_MS,
        };

        activeRains.set(rainId, state);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`admin_rain_claim_${rainId}`)
                .setLabel("Nhặt mưa")
                .setEmoji("🌧️")
                .setStyle(ButtonStyle.Success),
        );

        let rainMessage;

        try {
            rainMessage = await targetChannel.send({
                content:
                    `🌧️ **MƯA ĐỒNG LỢN!**\n\n` +
                    `👤 Người tạo: ${interaction.user}\n` +
                    `${coin} Tổng mưa: **${formatMoney(amount)}**\n` +
                    `🐷 Số người nhận: **${maxClaims}**\n` +
                    `⏳ Thời gian: **60 phút**\n\n` +
                    `Bấm nút bên dưới để nhặt mưa!`,
                components: [row],
            });
        } catch (error) {
            addMoney(interaction.user.id, amount);
            activeRains.delete(rainId);

            return interaction.reply({
                content: "❌ Gửi rain thất bại, đã hoàn tiền lại cho bạn.",
                ephemeral: true,
            });
        }

        setTimeout(async () => {
            const current = activeRains.get(rainId);

            if (!current) {
                return;
            }

            const refund = Math.max(0, Math.floor(current.remaining || 0));

            if (refund > 0) {
                addMoney(current.creatorId, refund);
            }

            activeRains.delete(rainId);

            await rainMessage
                .edit({
                    content:
                        `🌧️ **MƯA ĐỒNG LỢN ĐÃ KẾT THÚC**\n\n` +
                        `👤 Người tạo: <@${current.creatorId}>\n` +
                        `${coin} Tổng mưa ban đầu: **${formatMoney(current.amount)}**\n` +
                        `✅ Đã nhận: **${current.claimedUserIds.size}/${current.maxClaims} người**\n` +
                        `↩️ Hoàn lại: **${formatMoney(refund)}** ${coin}`,
                    components: [],
                    allowedMentions: {
                        users: [],
                    },
                })
                .catch(() => undefined);
        }, RAIN_EXPIRE_MS);

        return interaction.reply({
            content:
                `✅ Đã tạo rain ở ${targetChannel}\n` +
                `${coin} Tổng mưa: **${formatMoney(amount)}**\n` +
                `🐷 Tối đa: **${maxClaims} người**`,
            ephemeral: true,
        });
    }

    async activeRain(interaction) {
        if (!isAllowed(interaction.user.id)) {
            return interaction.reply({
                content: adminConfig.messages.noPermission,
                ephemeral: true,
            });
        }

        const amount = interaction.options.getInteger("sotien");
        const maxTargets = interaction.options.getInteger("songuoi");
        const randomCount = interaction.options.getInteger("ngaunhien") || 0;
        const pickedInput = interaction.options.getString("chon") || "";
        const pickedUserIds = parsePickedUserIds(pickedInput);
        const targetChannel =
            interaction.options.getChannel("kenh") || interaction.channel;

        const coin = getCurrencyEmoji();

        if (!isValidAmount(amount)) {
            return interaction.reply({
                content: adminConfig.messages.invalidAmount,
                ephemeral: true,
            });
        }

        if (!Number.isInteger(maxTargets) || maxTargets <= 0) {
            return interaction.reply({
                content: "❌ Số người nhận không hợp lệ.",
                ephemeral: true,
            });
        }

        if (maxTargets > MAX_RAIN_TARGETS) {
            return interaction.reply({
                content: `❌ Một lần active rain tối đa ${MAX_RAIN_TARGETS} người thôi.`,
                ephemeral: true,
            });
        }

        if (randomCount > maxTargets) {
            return interaction.reply({
                content:
                    "❌ Số suất ngẫu nhiên không được lớn hơn tổng số người.",
                ephemeral: true,
            });
        }

        if (amount < maxTargets) {
            return interaction.reply({
                content:
                    "❌ Số tiền rain phải lớn hơn hoặc bằng tổng số người nhận.",
                ephemeral: true,
            });
        }

        if (
            !targetChannel ||
            !targetChannel.isTextBased() ||
            typeof targetChannel.send !== "function"
        ) {
            return interaction.reply({
                content: "❌ Kênh này không dùng để active rain được.",
                ephemeral: true,
            });
        }

        const botMember = interaction.guild.members.me;

        if (
            botMember &&
            targetChannel.permissionsFor(botMember) &&
            !targetChannel.permissionsFor(botMember).has("SendMessages")
        ) {
            return interaction.reply({
                content: "❌ Bot không có quyền gửi tin nhắn trong kênh đó.",
                ephemeral: true,
            });
        }

        const selectedMap = new Map();

        function addSelected(userId, reason, score = 0, messageCount = 0) {
            const safeUserId = String(userId || "");

            if (!safeUserId) {
                return;
            }

            if (safeUserId === interaction.user.id) {
                return;
            }

            if (selectedMap.has(safeUserId)) {
                return;
            }

            if (selectedMap.size >= maxTargets) {
                return;
            }

            selectedMap.set(safeUserId, {
                userId: safeUserId,
                reason,
                score,
                messageCount,
            });
        }

        for (const userId of pickedUserIds) {
            addSelected(userId, "admin");
        }

        const safeRandomCount = Math.min(
            randomCount,
            Math.max(0, maxTargets - selectedMap.size),
        );

        const randomUsers = getRandomActiveUsers(
            interaction.guildId,
            targetChannel.id,
            safeRandomCount,
            new Set([...selectedMap.keys(), interaction.user.id]),
        );

        for (const user of randomUsers) {
            addSelected(user.userId, "random", user.score, user.messageCount);
        }

        const activeNeed = Math.max(0, maxTargets - selectedMap.size);

        const activeUsers = getTopActiveUsers(
            interaction.guildId,
            targetChannel.id,
            activeNeed,
            new Set([...selectedMap.keys(), interaction.user.id]),
        );

        for (const user of activeUsers) {
            addSelected(user.userId, "active", user.score, user.messageCount);
        }

        const selectedUsers = [...selectedMap.values()];

        if (selectedUsers.length <= 0) {
            return interaction.reply({
                content:
                    `❌ Chưa tìm thấy ai phù hợp trong ${targetChannel}.\n` +
                    `Bot chỉ tính dữ liệu chat từ lúc bot chạy sau khi sửa code.`,
                ephemeral: true,
            });
        }

        const payResult = takeMoney(interaction.user.id, amount);

        if (!payResult.success) {
            return interaction.reply({
                content: `❌ Bạn không đủ tiền để tạo active rain.\n${payResult.message}`,
                ephemeral: true,
            });
        }

        const rainId = `${Date.now()}_${Math.floor(Math.random() * 999999)}`;
        const allowedUserIds = selectedUsers.map((user) => user.userId);
        const perClaim = Math.floor(amount / allowedUserIds.length);

        const state = {
            type: "active",
            id: rainId,
            creatorId: interaction.user.id,
            channelId: targetChannel.id,
            messageId: null,
            amount,
            remaining: amount,
            perClaim,
            allowedUserIds: new Set(allowedUserIds),
            claimedUserIds: new Set(),
            expiresAt: Date.now() + RAIN_EXPIRE_MS,
        };

        activeRains.set(rainId, state);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`admin_active_rain_claim_${rainId}`)
                .setLabel("Nhận quà")
                .setEmoji("🎁")
                .setStyle(ButtonStyle.Success),
        );

        const tagText = allowedUserIds
            .map((userId) => `<@${userId}>`)
            .join(" ");

        const scoreText = selectedUsers
            .map((user, index) => {
                const reasonText = buildActiveRainReasonText(user);

                if (user.reason === "active") {
                    return (
                        `${index + 1}. <@${user.userId}> - ${reasonText} ` +
                        `(**${user.score} điểm** / ${user.messageCount} tin tốt)`
                    );
                }

                return `${index + 1}. <@${user.userId}> - ${reasonText}`;
            })
            .join("\n");

        const activeCount = selectedUsers.filter((user) => {
            return user.reason === "active";
        }).length;

        const randomPickedCount = selectedUsers.filter((user) => {
            return user.reason === "random" || user.reason === "admin";
        }).length;

        let rainMessage;

        try {
            rainMessage = await targetChannel.send({
                content:
                    `🎁 **ACTIVE RAIN - QUÀ CHO NGƯỜI TƯƠNG TÁC TỐT**\n\n` +
                    `${tagText}\n\n` +
                    `👤 Người tạo: ${interaction.user}\n` +
                    `${coin} Tổng quà: **${formatMoney(amount)}**\n` +
                    `🐷 Người được chọn: **${allowedUserIds.length}/${maxTargets}**\n` +
                    `🏆 Tương tác tốt: **${activeCount}**\n` +
                    `🎲 Ngẫu nhiên: **${randomPickedCount}**\n` +
                    `⏳ Thời gian nhận: **60 phút**\n\n` +
                    `📊 **Danh sách được chọn:**\n${scoreText}\n\n` +
                    `Chỉ người được tag mới bấm nút nhận được. Không bấm thì phần tiền đó hoàn lại người tạo.`,
                components: [row],
                allowedMentions: {
                    users: allowedUserIds,
                },
            });
        } catch (error) {
            activeRains.delete(rainId);
            addMoney(interaction.user.id, amount);

            return interaction.reply({
                content: "❌ Gửi active rain thất bại, đã hoàn tiền lại.",
                ephemeral: true,
            });
        }

        state.messageId = rainMessage.id;

        setTimeout(async () => {
            const current = activeRains.get(rainId);

            if (!current) {
                return;
            }

            const refund = Math.max(0, Math.floor(current.remaining || 0));

            if (refund > 0) {
                addMoney(current.creatorId, refund);
            }

            activeRains.delete(rainId);

            const claimedCount = current.claimedUserIds.size;
            const totalCount = current.allowedUserIds.size;

            await rainMessage
                .edit({
                    content:
                        `🎁 **ACTIVE RAIN ĐÃ KẾT THÚC**\n\n` +
                        `👤 Người tạo: <@${current.creatorId}>\n` +
                        `${coin} Tổng quà ban đầu: **${formatMoney(current.amount)}**\n` +
                        `✅ Đã nhận: **${claimedCount}/${totalCount} người**\n` +
                        `↩️ Hoàn lại cho người tạo: **${formatMoney(refund)}** ${coin}`,
                    components: [],
                    allowedMentions: {
                        users: [],
                    },
                })
                .catch(() => undefined);
        }, RAIN_EXPIRE_MS);

        return interaction.reply({
            content:
                `✅ Đã tạo active rain ở ${targetChannel}\n` +
                `Đã tag **${allowedUserIds.length} người**.`,
            ephemeral: true,
        });
    }

    async handleNormalRainClaim(interaction) {
        const rainId = interaction.customId.replace("admin_rain_claim_", "");

        const state = activeRains.get(rainId);
        const coin = getCurrencyEmoji();

        if (!state) {
            return interaction.reply({
                content: "❌ Cơn mưa này đã kết thúc.",
                ephemeral: true,
            });
        }

        if (Date.now() > state.expiresAt) {
            return interaction.reply({
                content: "❌ Cơn mưa này đã hết hạn.",
                ephemeral: true,
            });
        }

        if (interaction.user.bot) {
            return interaction.reply({
                content: "❌ Bot không được nhặt mưa.",
                ephemeral: true,
            });
        }

        if (interaction.user.id === state.creatorId) {
            return interaction.reply({
                content: "❌ Người tạo rain không được tự nhặt.",
                ephemeral: true,
            });
        }

        if (state.claimedUserIds.has(interaction.user.id)) {
            return interaction.reply({
                content: "❌ Bạn đã nhặt cơn mưa này rồi.",
                ephemeral: true,
            });
        }

        if (
            state.claimedUserIds.size >= state.maxClaims ||
            state.remaining <= 0
        ) {
            activeRains.delete(rainId);

            return interaction.reply({
                content: "❌ Cơn mưa này đã được nhặt hết.",
                ephemeral: true,
            });
        }

        const isLastClaim = state.claimedUserIds.size === state.maxClaims - 1;
        const reward = isLastClaim
            ? state.remaining
            : Math.min(state.perClaim, state.remaining);

        state.claimedUserIds.add(interaction.user.id);
        state.remaining -= reward;

        addMoney(interaction.user.id, reward);

        const claimedCount = state.claimedUserIds.size;

        if (claimedCount >= state.maxClaims || state.remaining <= 0) {
            activeRains.delete(rainId);

            await interaction.message
                .edit({
                    content:
                        `🌧️ **MƯA ĐỒNG LỢN ĐÃ HẾT!**\n\n` +
                        `👤 Người tạo: <@${state.creatorId}>\n` +
                        `${coin} Tổng mưa: **${formatMoney(state.amount)}**\n` +
                        `🐷 Đã có **${claimedCount}/${state.maxClaims}** người nhặt.`,
                    components: [],
                    allowedMentions: {
                        users: [],
                    },
                })
                .catch(() => undefined);
        } else {
            await interaction.message
                .edit({
                    content:
                        `🌧️ **MƯA ĐỒNG LỢN!**\n\n` +
                        `👤 Người tạo: <@${state.creatorId}>\n` +
                        `${coin} Tổng mưa: **${formatMoney(state.amount)}**\n` +
                        `🐷 Đã nhặt: **${claimedCount}/${state.maxClaims}**\n` +
                        `⏳ Ai chưa nhặt thì bấm trong thời gian còn lại.`,
                    allowedMentions: {
                        users: [],
                    },
                })
                .catch(() => undefined);
        }

        return interaction.reply({
            content: `🌧️ Bạn đã nhặt được **${formatMoney(reward)}** ${coin}`,
            ephemeral: true,
        });
    }

    async handleActiveRainClaim(interaction) {
        const rainId = interaction.customId.replace(
            "admin_active_rain_claim_",
            "",
        );

        const state = activeRains.get(rainId);
        const coin = getCurrencyEmoji();

        if (!state) {
            return interaction.reply({
                content: "❌ Active rain này đã kết thúc.",
                ephemeral: true,
            });
        }

        if (Date.now() > state.expiresAt) {
            return interaction.reply({
                content: "❌ Active rain này đã hết hạn.",
                ephemeral: true,
            });
        }

        if (!state.allowedUserIds.has(interaction.user.id)) {
            return interaction.reply({
                content: "❌ Bạn không nằm trong danh sách được tag nhận quà.",
                ephemeral: true,
            });
        }

        if (state.claimedUserIds.has(interaction.user.id)) {
            return interaction.reply({
                content: "❌ Bạn đã nhận quà active rain này rồi.",
                ephemeral: true,
            });
        }

        const isLastClaim =
            state.claimedUserIds.size === state.allowedUserIds.size - 1;

        const reward = isLastClaim
            ? state.remaining
            : Math.min(state.perClaim, state.remaining);

        if (reward <= 0) {
            activeRains.delete(rainId);

            return interaction.reply({
                content: "❌ Quà đã hết.",
                ephemeral: true,
            });
        }

        state.claimedUserIds.add(interaction.user.id);
        state.remaining -= reward;

        addMoney(interaction.user.id, reward);

        const claimedCount = state.claimedUserIds.size;
        const totalCount = state.allowedUserIds.size;

        if (claimedCount >= totalCount || state.remaining <= 0) {
            activeRains.delete(rainId);

            await interaction.message
                .edit({
                    content:
                        `🎁 **ACTIVE RAIN ĐÃ ĐƯỢC NHẬN HẾT**\n\n` +
                        `👤 Người tạo: <@${state.creatorId}>\n` +
                        `${coin} Tổng quà: **${formatMoney(state.amount)}**\n` +
                        `✅ Đã nhận: **${claimedCount}/${totalCount} người**`,
                    components: [],
                    allowedMentions: {
                        users: [],
                    },
                })
                .catch(() => undefined);
        } else {
            await interaction.message
                .edit({
                    content:
                        `🎁 **ACTIVE RAIN ĐANG DIỄN RA**\n\n` +
                        `👤 Người tạo: <@${state.creatorId}>\n` +
                        `${coin} Tổng quà: **${formatMoney(state.amount)}**\n` +
                        `✅ Đã nhận: **${claimedCount}/${totalCount} người**\n` +
                        `⏳ Ai được tag chưa nhận thì bấm trong thời gian còn lại.`,
                    allowedMentions: {
                        users: [],
                    },
                })
                .catch(() => undefined);
        }

        return interaction.reply({
            content: `🎁 Bạn đã nhận được **${formatMoney(reward)}** ${coin}`,
            ephemeral: true,
        });
    }

    async handleButton(interaction) {
        if (!interaction.isButton()) {
            return undefined;
        }

        if (interaction.customId.startsWith("admin_active_rain_claim_")) {
            return this.handleActiveRainClaim(interaction);
        }

        if (interaction.customId.startsWith("admin_rain_claim_")) {
            return this.handleNormalRainClaim(interaction);
        }

        return undefined;
    }

    async handleMessage(message) {
        if (!message || !message.guildId || !message.channelId) {
            return undefined;
        }

        if (!message.author || message.author.bot) {
            return undefined;
        }

        const content = normalizeMessageContent(message.content);

        if (!content) {
            return undefined;
        }

        if (content.startsWith("/") || content.startsWith("!")) {
            return undefined;
        }

        const score = Math.max(1, calculateQualityScore(content));
        const bucket = getChannelBucket(message.guildId, message.channelId);

        if (!bucket.users.has(message.author.id)) {
            bucket.users.set(message.author.id, {
                lastMessageAt: 0,
                lastContent: "",
                samples: [],
            });
        }

        const stat = bucket.users.get(message.author.id);
        const now = Date.now();

        if (now - stat.lastMessageAt < MESSAGE_COOLDOWN_MS) {
            return undefined;
        }

        if (
            stat.lastContent === content &&
            now - stat.lastMessageAt < 5 * 60 * 1000
        ) {
            return undefined;
        }

        stat.lastMessageAt = now;
        stat.lastContent = content;
        stat.samples.push({
            score,
            createdAt: now,
        });

        pruneSamples(stat);

        return undefined;
    }

    async removeMoney(interaction) {
        if (!isAllowed(interaction.user.id)) {
            return interaction.reply({
                content: adminConfig.messages.noPermission,
                ephemeral: true,
            });
        }

        const targetUser = interaction.options.getUser("user");
        const amount = interaction.options.getInteger("amount");
        const coin = getCurrencyEmoji();

        if (!isValidAmount(amount)) {
            return interaction.reply({
                content: adminConfig.messages.invalidAmount,
                ephemeral: true,
            });
        }

        if (targetUser.bot) {
            return interaction.reply({
                content: "❌ Không trừ tiền bot",
                ephemeral: true,
            });
        }

        const result = takeMoney(targetUser.id, amount);

        if (!result.success) {
            return interaction.reply({
                content: `❌ ${result.message}`,
                ephemeral: true,
            });
        }

        return interaction.reply({
            content:
                `✅ Đã trừ tiền\n\n` +
                `👤 User: ${targetUser}\n` +
                `${coin} Số tiền: ${formatMoney(amount)}`,
            ephemeral: true,
        });
    }

    async anonSay(interaction) {
        if (!isAllowed(interaction.user.id)) {
            return interaction.reply({
                content: adminConfig.messages.noPermission,
                ephemeral: true,
            });
        }

        const channel = interaction.options.getChannel("kenh");
        const content = interaction.options.getString("noidung");

        if (
            !channel ||
            !channel.isTextBased() ||
            typeof channel.send !== "function"
        ) {
            return interaction.reply({
                content: "❌ Kênh này không gửi tin nhắn được.",
                ephemeral: true,
            });
        }

        const botMember = interaction.guild.members.me;

        if (
            botMember &&
            channel.permissionsFor(botMember) &&
            !channel.permissionsFor(botMember).has("SendMessages")
        ) {
            return interaction.reply({
                content: "❌ Bot không có quyền gửi tin nhắn trong kênh này.",
                ephemeral: true,
            });
        }

        if (!content || content.trim().length <= 0) {
            return interaction.reply({
                content: "❌ Nội dung không được để trống.",
                ephemeral: true,
            });
        }

        await channel.send({
            content: content.trim(),
            allowedMentions: {
                parse: [],
            },
        });

        console.log(
            `[ANON SAY] ${interaction.user.tag} (${interaction.user.id}) -> #${channel.name} (${channel.id}): ${content.trim()}`,
        );

        return interaction.reply({
            content: `✅ Đã gửi tin nhắn ẩn danh vào ${channel}.`,
            ephemeral: true,
        });
    }
}

module.exports = new AdminManager();
