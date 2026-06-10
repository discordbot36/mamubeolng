const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    ChannelType,
} = require("discord.js");

const {
    ensureTuTienProfile,
    getSecretRealmState,
    updateSecretRealmState,
    getSecretRealmFatigue,
    updateSecretRealmFatigue,
    addShopItem,
} = require("./database");

const adminConfig = require("./config/admin");
const shopConfig = require("./config/shop");
const config = require("./config/bicanh");

const combat = require("./utils/combat");

const activeTimers = new Map();
function clearRealmTimer(realmId) {
    const timer = activeTimers.get(realmId);

    if (timer) {
        clearTimeout(timer);
        activeTimers.delete(realmId);
    }
}

function clearRoundTimer(realmId) {
    const timerKey = `round_${realmId}`;
    const timer = activeTimers.get(timerKey);

    if (timer) {
        clearTimeout(timer);
        activeTimers.delete(timerKey);
    }
}

async function safeReply(interaction, payload) {
    if (!interaction.isRepliable || !interaction.isRepliable()) {
        return undefined;
    }

    if (interaction.replied || interaction.deferred) {
        return interaction.followUp(payload).catch(() => undefined);
    }

    return interaction.reply(payload).catch(() => undefined);
}
const ACTIONS = {
    attack: {
        label: "Công kích",
        emoji: "⚔️",
    },
    guard: {
        label: "Hộ pháp",
        emoji: "🛡️",
    },
    support: {
        label: "Trợ lực",
        emoji: "✨",
    },
    explore: {
        label: "Thăm dò",
        emoji: "🔍",
    },
};

const ROUND_MECHANICS = [
    {
        id: "break_gate",
        name: "Phá Vỡ Thạch Môn",
        description: "Cần Công kích phá cửa và Hộ pháp chống phản chấn.",
        roles: ["attack", "guard"],
    },
    {
        id: "find_core",
        name: "Truy Tìm Trận Nhãn",
        description: "Cần Thăm dò tìm lõi và Công kích phá trận.",
        roles: ["explore", "attack"],
    },
    {
        id: "spirit_storm",
        name: "Linh Khí Bạo Loạn",
        description: "Cần Hộ pháp bảo vệ và Trợ lực ổn định linh khí.",
        roles: ["guard", "support"],
    },
    {
        id: "boss_shield",
        name: "Huyết Khiên Ma Tôn",
        description: "Cần Công kích, Trợ lực và Thăm dò để phá khiên.",
        roles: ["attack", "support", "explore"],
    },
];

function formatNumber(value) {
    return Number(value || 0).toLocaleString("vi-VN");
}
function randomInt(min, max) {
    const safeMin = Math.ceil(Number(min || 0));

    const safeMax = Math.floor(Number(max || safeMin));

    if (safeMax <= safeMin) {
        return safeMin;
    }

    return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}
function rollSecretRealmReward() {
    const pool = Array.isArray(config.rewards?.rewardPool)
        ? config.rewards.rewardPool
        : [];

    if (pool.length <= 0) {
        return null;
    }

    const totalWeight = pool.reduce((total, entry) => {
        return total + Math.max(0, Number(entry.weight || 0));
    }, 0);

    if (totalWeight <= 0) {
        return null;
    }

    let rollValue = Math.random() * totalWeight;

    for (const entry of pool) {
        rollValue -= Math.max(0, Number(entry.weight || 0));

        if (rollValue <= 0) {
            const minAmount = Math.max(1, Number(entry.minAmount || 1));

            const maxAmount = Math.max(
                minAmount,
                Number(entry.maxAmount || minAmount),
            );

            return {
                itemId: entry.itemId,

                amount: randomInt(minAmount, maxAmount),
            };
        }
    }

    const fallback = pool[pool.length - 1];

    return {
        itemId: fallback.itemId,
        amount: Math.max(1, Number(fallback.minAmount || 1)),
    };
}
function mergeRewardItem(rewardMap, itemId, amount) {
    if (!itemId || Number(amount || 0) <= 0) {
        return;
    }

    rewardMap[itemId] = Number(rewardMap[itemId] || 0) + Number(amount);
}
function createRealmId() {
    return `bicanh_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function getAdminIds() {
    return Array.isArray(adminConfig.allowedUserIds)
        ? adminConfig.allowedUserIds.map(String)
        : [];
}

function getFatigueLevel(runs) {
    const safeRuns = Math.max(0, Number(runs || 0));
    const levels = Array.isArray(config.fatigue.levels)
        ? config.fatigue.levels
        : [];

    return (
        levels
            .slice()
            .reverse()
            .find((level) => safeRuns >= Number(level.runs || 0)) || {
            runs: 0,
            powerMultiplier: 1,
            rewardMultiplier: 1,
        }
    );
}

function getTodayKey() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}

function resetFatigueIfNeeded(fatigue) {
    const todayKey = getTodayKey();

    if (fatigue.resetDate !== todayKey) {
        fatigue.guestRuns = 0;
        fatigue.hostRuns = 0;
        fatigue.resetDate = todayKey;
        fatigue.updatedAt = Date.now();
    }

    return fatigue;
}

async function createRealmChannel(interaction, realm) {
    const guild = interaction.guild;

    if (!guild) {
        throw new Error("Bí cảnh chỉ có thể mở trong server.");
    }

    const permissionOverwrites = [
        {
            id: guild.roles.everyone.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.ReadMessageHistory,
            ],
            deny: [PermissionFlagsBits.SendMessages],
        },
        {
            id: realm.hostId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
            ],
        },
        {
            id: interaction.client.user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ManageRoles,
            ],
        },
    ];

    for (const adminId of getAdminIds()) {
        permissionOverwrites.push({
            id: adminId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
            ],
        });
    }

    const channel = await guild.channels.create({
        name: `${config.channel.namePrefix}-${realm.id.slice(-6)}`,
        type: ChannelType.GuildText,
        parent: config.channel.categoryId || undefined,
        permissionOverwrites,
        reason: `Mở Bí Cảnh ${realm.id}`,
    });

    realm.channelId = channel.id;

    const message = await channel.send({
        content:
            `🌌 <@${realm.hostId}> vừa phát hiện một Bí Cảnh Hữu Duyên!\n` +
            `Mọi người đủ điều kiện có thể bấm **Tham gia**.`,

        embeds: [buildLobbyEmbed(realm)],
        components: [buildLobbyButtons(realm)],
    });

    realm.messageId = message.id;

    saveRealm(realm);

    return channel;
}

function getRealm(realmId) {
    const state = getSecretRealmState();

    return state.realms[realmId] || null;
}

function clearRealmUsers(realm) {
    updateSecretRealmState((state) => {
        state.realms[realm.id] = realm;

        for (const userId of realm.memberIds || []) {
            delete state.activeUserRealms[String(userId)];
        }
    });
}

function saveRealm(realm) {
    updateSecretRealmState((state) => {
        state.realms[realm.id] = realm;

        for (const userId of realm.memberIds) {
            state.activeUserRealms[String(userId)] = realm.id;
        }
    });

    return realm;
}

function buildLobbyEmbed(realm) {
    const memberLines = realm.memberIds.map((userId, index) => {
        const member = realm.members[userId];

        return (
            `${index + 1}. ` +
            `<@${userId}>` +
            (userId === realm.hostId ? " 👑" : "") +
            ` — ${formatNumber(member.effectivePower)} lực chiến hiệu dụng`
        );
    });

    return new EmbedBuilder()
        .setColor(0x8e44ad)
        .setTitle("🌌 BÍ CẢNH HỮU DUYÊN")
        .setDescription(
            `👑 Host: <@${realm.hostId}>\n` +
                `👥 Thành viên: **${realm.memberIds.length}/${realm.maxMembers}**\n` +
                `📌 Tối thiểu bắt đầu: **${realm.minMembers} người**\n\n` +
                `${memberLines.join("\n")}\n\n` +
                `Người chơi đủ điều kiện có thể bấm **Tham gia**.\n` +
                `Khi đủ ${realm.maxMembers} người, Bí Cảnh sẽ tự bắt đầu.`,
        )
        .setFooter({
            text: `ID: ${realm.id}`,
        })
        .setTimestamp();
}

function buildLobbyButtons(realm) {
    const cannotJoin =
        realm.status !== "lobby" ||
        realm.recruitmentClosed === true ||
        realm.memberIds.length >= realm.maxMembers;

    const cannotLeave =
        realm.status !== "lobby" || realm.recruitmentClosed === true;

    const cannotStart =
        realm.status !== "lobby" || realm.memberIds.length < realm.minMembers;

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`bicanh_join_${realm.id}`)
            .setLabel("Tham gia")
            .setEmoji("🌌")
            .setStyle(ButtonStyle.Success)
            .setDisabled(cannotJoin),

        new ButtonBuilder()
            .setCustomId(`bicanh_leave_${realm.id}`)
            .setLabel("Rời đội")
            .setEmoji("🚪")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(cannotLeave),

        new ButtonBuilder()
            .setCustomId(`bicanh_start_${realm.id}`)
            .setLabel("Bắt đầu")
            .setEmoji("⚔️")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(cannotStart),
    );
}

async function tryTrigger(interaction, source) {
    if (!config.enabled) {
        return null;
    }

    const userId = interaction.user.id;

    const state = getSecretRealmState();

    if (state.activeUserRealms[String(userId)]) {
        return null;
    }

    const chance = Number(config.triggerChance?.[source] || 0);
    if (chance <= 0) {
        return null;
    }
    if (!combat.roll(chance)) {
        return null;
    }

    const fatigue = resetFatigueIfNeeded(getSecretRealmFatigue(userId));

    if (Number(fatigue.hostRuns || 0) >= config.fatigue.maxHostRuns) {
        return null;
    }

    const profile = ensureTuTienProfile(userId);

    const stats = combat.calculateCombatStats(profile);

    const realmId = createRealmId();

    const realm = {
        id: realmId,
        guildId: interaction.guildId,

        hostId: String(userId),

        source,
        status: "lobby",
        recruitmentClosed: false,

        createdAt: Date.now(),

        expiresAt: Date.now() + config.party.lobbyDurationMs,

        channelId: null,
        messageId: null,

        minMembers: config.party.minMembers,

        maxMembers: config.party.maxMembers,

        hostPower: stats.combatPower,

        memberIds: [String(userId)],

        members: {
            [String(userId)]: {
                userId: String(userId),

                originalPower: stats.combatPower,

                effectivePower: stats.combatPower,

                fatiguePowerMultiplier: 1,

                fatigueRewardMultiplier: 1,

                afkTurns: 0,
            },
        },

        battle: null,
    };

    await createRealmChannel(interaction, realm);
    const timer = setTimeout(() => {
        expireLobby(interaction.client, realm.id).catch((error) => {
            console.error("[BiCanh Expire Lobby]", error);
        });
    }, config.party.lobbyDurationMs);

    activeTimers.set(realm.id, timer);

    return realm;
}

async function joinRealm(interaction, realm) {
    const userId = String(interaction.user.id);

    if (realm.status !== "lobby" || realm.recruitmentClosed === true) {
        return interaction.reply({
            content: "❌ Bí cảnh đã khóa tuyển thành viên.",
            ephemeral: true,
        });
    }

    if (realm.memberIds.includes(userId)) {
        return interaction.reply({
            content: "❌ Bạn đã ở trong đội.",
            ephemeral: true,
        });
    }

    if (realm.memberIds.length >= realm.maxMembers) {
        return interaction.reply({
            content: "❌ Đội đã đủ người.",
            ephemeral: true,
        });
    }

    const state = getSecretRealmState();

    if (state.activeUserRealms[userId]) {
        return interaction.reply({
            content: "❌ Bạn đang ở Bí Cảnh khác.",
            ephemeral: true,
        });
    }

    const profile = ensureTuTienProfile(userId);

    if (!profile.rootId) {
        return interaction.reply({
            content: "❌ Bạn chưa có linh căn.",
            ephemeral: true,
        });
    }

    const stats = combat.calculateCombatStats(profile);

    const minPower = realm.hostPower * config.powerLimits.minGuestRatio;

    if (stats.combatPower < minPower) {
        return interaction.reply({
            content:
                `❌ Lực chiến quá thấp.\n` +
                `Yêu cầu tối thiểu: **${formatNumber(minPower)}**`,
            ephemeral: true,
        });
    }

    const fatigue = resetFatigueIfNeeded(getSecretRealmFatigue(userId));

    if (Number(fatigue.guestRuns || 0) >= config.fatigue.maxGuestRuns) {
        return interaction.reply({
            content: "❌ Bạn đã quá mệt để tham gia thêm Bí Cảnh hôm nay.",
            ephemeral: true,
        });
    }

    const level = getFatigueLevel(Number(fatigue.guestRuns || 0));

    const guestRatio = stats.combatPower / Math.max(1, realm.hostPower);

    let weakRewardMultiplier = 1;

    if (guestRatio < 0.4) {
        weakRewardMultiplier = Number(
            config.powerLimits.veryWeakGuestRewardMultiplier || 0.3,
        );
    } else if (
        guestRatio < Number(config.powerLimits.recommendedGuestRatio || 0.6)
    ) {
        weakRewardMultiplier = Number(
            config.powerLimits.weakGuestRewardMultiplier || 0.55,
        );
    }

    const cappedPower = Math.min(
        stats.combatPower,
        realm.hostPower * config.powerLimits.maxEffectiveRatio,
    );

    const effectivePower = Math.floor(cappedPower * level.powerMultiplier);

    realm.memberIds.push(userId);

    realm.members[userId] = {
        userId,

        originalPower: stats.combatPower,

        effectivePower,

        fatiguePowerMultiplier: level.powerMultiplier,

        fatigueRewardMultiplier: level.rewardMultiplier * weakRewardMultiplier,
        afkTurns: 0,
    };

    saveRealm(realm);

    await interaction.channel.permissionOverwrites.edit(userId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
    });

    const lobbyMessage = await interaction.channel.messages
        .fetch(realm.messageId)
        .catch(() => null);

    const rewardPercent = Math.floor(
        level.rewardMultiplier * weakRewardMultiplier * 100,
    );

    if (realm.memberIds.length >= realm.maxMembers) {
        realm.recruitmentClosed = true;
        saveRealm(realm);

        await safeReply(interaction, {
            content:
                `✅ Đã tham gia Bí Cảnh.\n` +
                `💪 Lực chiến gốc: **${formatNumber(stats.combatPower)}**\n` +
                `⛓️ Lực chiến hiệu dụng: **${formatNumber(effectivePower)}**\n` +
                `💤 Hiệu lực thưởng: **${rewardPercent}%**\n\n` +
                `👥 Đội đã đủ **${realm.maxMembers}/${realm.maxMembers}** người, Bí Cảnh tự bắt đầu!`,
            ephemeral: true,
        });

        if (lobbyMessage) {
            await lobbyMessage
                .edit({
                    embeds: [buildLobbyEmbed(realm)],
                    components: [buildLobbyButtons(realm)],
                })
                .catch(() => null);
        }

        return startRealmDirect(interaction.channel, realm, lobbyMessage);
    }

    if (lobbyMessage) {
        await lobbyMessage
            .edit({
                embeds: [buildLobbyEmbed(realm)],
                components: [buildLobbyButtons(realm)],
            })
            .catch(() => null);
    }

    return interaction.reply({
        content:
            `✅ Đã tham gia Bí Cảnh.\n` +
            `💪 Lực chiến gốc: **${formatNumber(stats.combatPower)}**\n` +
            `⛓️ Lực chiến hiệu dụng: **${formatNumber(effectivePower)}**\n` +
            `💤 Hiệu lực thưởng: **${rewardPercent}%**`,
        ephemeral: true,
    });
}

async function lockRealmChannel(channel, realm) {
    realm.recruitmentClosed = true;

    await channel.permissionOverwrites.edit(channel.guild.roles.everyone.id, {
        ViewChannel: false,
        SendMessages: false,
    });

    for (const userId of realm.memberIds) {
        await channel.permissionOverwrites.edit(userId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
        });
    }

    for (const adminId of getAdminIds()) {
        await channel.permissionOverwrites
            .edit(adminId, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
            })
            .catch(() => null);
    }

    saveRealm(realm);
}

async function leaveRealm(interaction, realm) {
    const userId = String(interaction.user.id);

    if (realm.status !== "lobby" || realm.recruitmentClosed === true) {
        return interaction.reply({
            content: "❌ Bí cảnh đã khóa.",
            ephemeral: true,
        });
    }

    if (userId === realm.hostId) {
        return interaction.reply({
            content: "❌ Host không thể rời đội.",
            ephemeral: true,
        });
    }

    if (!realm.memberIds.includes(userId)) {
        return interaction.reply({
            content: "❌ Bạn chưa tham gia.",
            ephemeral: true,
        });
    }

    realm.memberIds = realm.memberIds.filter((id) => id !== userId);

    delete realm.members[userId];

    updateSecretRealmState((state) => {
        delete state.activeUserRealms[userId];

        state.realms[realm.id] = realm;
    });

    await interaction.channel.permissionOverwrites
        .delete(userId)
        .catch(() => null);

    const message = await interaction.channel.messages
        .fetch(realm.messageId)
        .catch(() => null);

    if (message) {
        await message.edit({
            embeds: [buildLobbyEmbed(realm)],
            components: [buildLobbyButtons(realm)],
        });
    }

    return interaction.reply({
        content: "✅ Bạn đã rời Bí Cảnh.",
        ephemeral: true,
    });
}

async function startRealmDirect(channel, realm, lobbyMessage = null) {
    let latestRealm = getRealm(realm.id);

    if (!latestRealm || latestRealm.status !== "lobby") {
        return undefined;
    }

    realm = latestRealm;

    if (realm.starting === true) {
        return undefined;
    }

    realm.starting = true;
    realm.recruitmentClosed = true;
    realm.status = "battle";
    realm.startedAt = Date.now();

    saveRealm(realm);

    clearRealmTimer(realm.id);
    clearRoundTimer(realm.id);

    await lockRealmChannel(channel, realm);

    updateSecretRealmFatigue(realm.hostId, (data) => {
        const safe = resetFatigueIfNeeded(data);

        safe.hostRuns = Number(safe.hostRuns || 0) + 1;
        safe.resetDate = getTodayKey();
        safe.updatedAt = Date.now();
    });

    const message =
        lobbyMessage ||
        (await channel.messages.fetch(realm.messageId).catch(() => null));

    if (message) {
        await message
            .edit({
                content: realm.memberIds.map((id) => `<@${id}>`).join(" "),
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xe74c3c)
                        .setTitle("⚔️ BÍ CẢNH BẮT ĐẦU")
                        .setDescription(
                            `Đội hình **${realm.memberIds.length} người** đã khóa.\n` +
                                `Chỉ thành viên trong đội mới còn xem và chat được.`,
                        ),
                ],
                components: [],
            })
            .catch(() => null);
    }

    realm.starting = false;
    saveRealm(realm);

    return beginBattle(channel, realm);
}

async function startRealm(interaction, realm) {
    if (String(interaction.user.id) !== String(realm.hostId)) {
        if (realm.status !== "lobby") {
            return interaction.reply({
                content: "❌ Bí cảnh đã bắt đầu hoặc đã kết thúc.",
                ephemeral: true,
            });
        }

        return interaction.reply({
            content: "❌ Chỉ host được bắt đầu.",
            ephemeral: true,
        });
    }

    if (realm.memberIds.length < realm.minMembers) {
        return interaction.reply({
            content: `❌ Cần ít nhất ${realm.minMembers} người.`,
            ephemeral: true,
        });
    }

    await interaction.deferUpdate().catch((error) => {
        if (error?.code === 10062 || error?.code === 40060) {
            return null;
        }

        throw error;
    });

    return startRealmDirect(interaction.channel, realm, interaction.message);
}
async function expireLobby(client, realmId) {
    let realm = getRealm(realmId);

    if (!realm || realm.status !== "lobby") {
        return;
    }

    if (Date.now() < Number(realm.expiresAt || 0)) {
        return;
    }

    realm = getRealm(realmId);

    if (!realm || realm.status !== "lobby") {
        return;
    }

    realm.status = "cancelled";
    realm.recruitmentClosed = true;
    realm.cancelledAt = Date.now();

    updateSecretRealmState((state) => {
        state.realms[realm.id] = realm;

        for (const userId of realm.memberIds || []) {
            delete state.activeUserRealms[String(userId)];
        }
    });

    clearRealmTimer(realm.id);

    const channel = await client.channels
        .fetch(realm.channelId)
        .catch(() => null);

    if (!channel) {
        return;
    }

    await channel
        .send({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x95a5a6)
                    .setTitle("🌫️ BÍ CẢNH ĐÃ BIẾN MẤT")
                    .setDescription(
                        "Không đủ đạo hữu tập hợp kịp thời. Lối vào Bí Cảnh đã khép lại.",
                    ),
            ],
            components: [],
        })
        .catch(() => null);

    setTimeout(() => {
        const latestRealm = getRealm(realmId);

        if (
            !latestRealm ||
            latestRealm.status !== "cancelled" ||
            String(latestRealm.channelId) !== String(channel.id)
        ) {
            return;
        }

        channel.delete("Bí cảnh hết thời gian tập hợp").catch(() => null);
    }, 10 * 1000);
}

async function handleButton(interaction) {
    if (!interaction.customId.startsWith("bicanh_")) {
        return undefined;
    }

    const parts = interaction.customId.split("_");

    const action = parts[1];

    if (action === "act") {
        const battleAction = parts[2];
        const realmId = parts.slice(3).join("_");
        const realm = getRealm(realmId);

        if (!realm) {
            return interaction.reply({
                content: "❌ Bí cảnh không tồn tại.",
                ephemeral: true,
            });
        }

        return selectBattleAction(interaction, realm, battleAction);
    }

    const realmId = parts.slice(2).join("_");
    const realm = getRealm(realmId);

    if (!realm) {
        return interaction.reply({
            content: "❌ Bí cảnh không tồn tại.",
            ephemeral: true,
        });
    }

    if (action === "join") {
        return joinRealm(interaction, realm);
    }

    if (action === "leave") {
        return leaveRealm(interaction, realm);
    }

    if (action === "start") {
        return startRealm(interaction, realm);
    }

    return undefined;
}

async function recover(client) {
    const state = getSecretRealmState();

    for (const realm of Object.values(state.realms)) {
        if (
            !realm.channelId ||
            ["finished", "cancelled"].includes(realm.status)
        ) {
            continue;
        }

        const channel = await client.channels
            .fetch(realm.channelId)
            .catch(() => null);

        if (!channel) {
            updateSecretRealmState((currentState) => {
                realm.status = "cancelled";
                realm.cancelledAt = Date.now();

                currentState.realms[realm.id] = realm;

                for (const userId of realm.memberIds || []) {
                    delete currentState.activeUserRealms[String(userId)];
                }
            });

            continue;
        }

        if (realm.status === "lobby") {
            const remaining = Number(realm.expiresAt || 0) - Date.now();

            if (remaining <= 0) {
                await expireLobby(client, realm.id);
                continue;
            }

            const oldTimer = activeTimers.get(realm.id);

            if (oldTimer) {
                clearTimeout(oldTimer);
            }

            const timer = setTimeout(() => {
                expireLobby(client, realm.id).catch((error) => {
                    console.error("[BiCanh Recover Expire]", error);
                });
            }, remaining);

            activeTimers.set(realm.id, timer);
        }

        if (realm.recruitmentClosed === true || realm.status === "battle") {
            await lockRealmChannel(channel, realm);
        }

        if (realm.status === "battle" && realm.battle) {
            realm.battle.resolving = false;

            saveRealm(realm);

            const timerKey = `round_${realm.id}`;

            const oldTimer = activeTimers.get(timerKey);

            if (oldTimer) {
                clearTimeout(oldTimer);
            }

            const remaining = Math.max(
                0,
                Number(realm.battle.roundEndsAt || 0) - Date.now(),
            );

            if (remaining <= 0) {
                await resolveBattleRound(channel, realm.id);
            } else {
                const timer = setTimeout(() => {
                    resolveBattleRound(channel, realm.id).catch((error) => {
                        console.error("[BiCanh Recover Round]", error);
                    });
                }, remaining);

                activeTimers.set(timerKey, timer);
            }
        }
    }
}

function createBattleState(realm) {
    const memberCount = Math.max(1, realm.memberIds.length);

    const totalEffectivePower = realm.memberIds.reduce((total, userId) => {
        const member = realm.members[userId];

        return total + Math.max(1, Number(member?.effectivePower || 1));
    }, 0);

    const difficultyMultiplier = Number(
        config.scaling?.difficulty?.[memberCount] || 1,
    );

    const requiredProgress = Math.max(
        100,
        Math.floor(totalEffectivePower * difficultyMultiplier * 0.055),
    );

    const maxTeamHp = Math.max(100, Math.floor(totalEffectivePower * 0.12));

    const contributions = {};

    for (const userId of realm.memberIds) {
        contributions[userId] = {
            attack: 0,
            guard: 0,
            support: 0,
            explore: 0,

            totalScore: 0,
            successfulTurns: 0,
            afkTurns: 0,
        };
    }

    return {
        turn: 1,
        maxTurns: 8,

        progress: 0,
        requiredProgress,

        teamHp: maxTeamHp,
        maxTeamHp,

        energy: 50,
        stability: 50,

        totalEffectivePower,
        difficultyMultiplier,

        actions: {},
        contributions,

        currentMechanic: null,

        resolving: false,
        resolvedTurn: 0,

        roundMessageId: null,
        roundEndsAt: 0,

        startedAt: Date.now(),
        finishedAt: 0,

        result: null,
    };
}

function getContributionCap(realm) {
    const memberCount = Math.max(
        2,
        Math.min(6, Number(realm.memberIds.length || 2)),
    );

    return Number(config.scaling?.contributionCap?.[memberCount] || 0.5);
}

function getMemberRoundPower(realm, userId) {
    const member = realm.members[userId];

    if (!member) {
        return 1;
    }

    const totalPower = Math.max(
        1,
        Number(realm.battle?.totalEffectivePower || 1),
    );

    const capRatio = getContributionCap(realm);

    const maximumPower = totalPower * capRatio;

    return Math.max(
        1,
        Math.min(Number(member.effectivePower || 1), maximumPower),
    );
}

function calculateActionResult(realm, userId, action) {
    const battle = realm.battle;

    const mechanic = battle.currentMechanic;

    const memberPower = getMemberRoundPower(realm, userId);

    const requiredRoles = Array.isArray(mechanic?.roles) ? mechanic.roles : [];

    const isRequiredAction = requiredRoles.includes(action);

    const baseValue = Math.max(1, memberPower * 0.012);

    const randomMultiplier = combat.randomBetween(0.9, 1.1);

    let progress = 0;
    let protection = 0;
    let energy = 0;
    let stability = 0;

    switch (action) {
        case "attack": {
            progress = baseValue * (isRequiredAction ? 1.35 : 0.75);

            break;
        }

        case "guard": {
            protection = baseValue * (isRequiredAction ? 1.4 : 0.8);

            stability = 4 * (isRequiredAction ? 1.25 : 0.75);

            break;
        }

        case "support": {
            energy = 8 * (isRequiredAction ? 1.3 : 0.8);

            stability = 7 * (isRequiredAction ? 1.25 : 0.75);

            progress = baseValue * (isRequiredAction ? 0.65 : 0.3);

            break;
        }

        case "explore": {
            progress = baseValue * (isRequiredAction ? 1.15 : 0.55);

            energy = 4 * (isRequiredAction ? 1.2 : 0.7);

            break;
        }
    }

    return {
        progress: Math.max(0, Math.floor(progress * randomMultiplier)),

        protection: Math.max(0, Math.floor(protection * randomMultiplier)),

        energy: Math.max(0, Math.floor(energy * randomMultiplier)),

        stability: Math.max(0, Math.floor(stability * randomMultiplier)),

        matchedMechanic: isRequiredAction,
    };
}

function calculateRealmDamage(realm, matchedRoleCount, totalProtection) {
    const battle = realm.battle;

    const mechanicRoleCount = Math.max(
        1,
        Number(battle.currentMechanic?.roles?.length || 1),
    );

    const missingRoles = Math.max(0, mechanicRoleCount - matchedRoleCount);

    const baseDamage = battle.maxTeamHp * combat.randomBetween(0.07, 0.12);

    const missingRolePenalty = battle.maxTeamHp * 0.045 * missingRoles;

    const instabilityPenalty =
        battle.stability < 30 ? battle.maxTeamHp * 0.06 : 0;

    const energyPenalty = battle.energy < 20 ? battle.maxTeamHp * 0.04 : 0;

    const rawDamage =
        baseDamage + missingRolePenalty + instabilityPenalty + energyPenalty;

    return Math.max(0, Math.floor(rawDamage - totalProtection));
}

function getParticipationMultiplier(realm, userId) {
    const contribution = realm.battle?.contributions?.[userId] || {};

    const totalActions =
        Number(contribution.attack || 0) +
        Number(contribution.guard || 0) +
        Number(contribution.support || 0) +
        Number(contribution.explore || 0);

    const completedTurns = Math.max(1, Number(realm.battle?.turn || 1));

    const participationRate = totalActions / completedTurns;
    if (totalActions <= 0) {
        return 0;
    }

    return Math.max(0.35, Math.min(1, participationRate));
}
function giveSecretRealmReward(realm, userId) {
    const isHost = String(userId) === String(realm.hostId);

    const member = realm.members?.[userId] || {};

    const fatigueMultiplier = isHost
        ? 1
        : Math.max(0, Number(member.fatigueRewardMultiplier ?? 1));

    const participationMultiplier = getParticipationMultiplier(realm, userId);

    const finalMultiplier = Math.max(
        0,
        Math.min(1, fatigueMultiplier * participationMultiplier),
    );

    const items = {};

    if (finalMultiplier <= 0) {
        return {
            items,
            participationMultiplier,
            fatigueMultiplier,
            rollsGranted: 0,
        };
    }

    /*
     * Quà cám bảo hiểm.
     */
    const guaranteed = config.rewards?.guaranteedFeed || {};

    const guaranteedMin = isHost
        ? Number(guaranteed.hostMin || 1)
        : Number(guaranteed.guestMin || 1);

    const guaranteedMax = isHost
        ? Number(guaranteed.hostMax || guaranteedMin)
        : Number(guaranteed.guestMax || guaranteedMin);

    const baseGuaranteed = randomInt(guaranteedMin, guaranteedMax);

    const guaranteedAmount = Math.max(
        1,
        Math.floor(baseGuaranteed * finalMultiplier),
    );

    mergeRewardItem(items, guaranteed.itemId, guaranteedAmount);

    /*
     * Số lượt random.
     */
    const baseRolls = isHost
        ? Number(config.rewards.hostRolls || 3)
        : Number(config.rewards.guestRolls || 2);

    /*
     * Người tham gia đầy đủ nhận đủ roll.
     * Người thiếu lượt có thể bị giảm roll.
     */
    const rollsGranted = Math.max(1, Math.ceil(baseRolls * finalMultiplier));

    for (let rollIndex = 0; rollIndex < rollsGranted; rollIndex += 1) {
        const reward = rollSecretRealmReward();

        if (!reward) {
            continue;
        }

        mergeRewardItem(items, reward.itemId, reward.amount);
    }

    /*
     * Phát toàn bộ item đã gộp.
     */
    for (const [itemId, amount] of Object.entries(items)) {
        addShopItem(userId, itemId, amount);
    }

    return {
        items,
        participationMultiplier,
        fatigueMultiplier,
        rollsGranted,
    };
}

async function finishBattle(channel, realm, success) {
    /*
     * Chống kết thúc và chia thưởng
     * hai lần.
     */
    const latestRealm = getRealm(realm.id);

    if (
        !latestRealm ||
        latestRealm.status !== "battle" ||
        latestRealm.battle?.result
    ) {
        return;
    }

    realm = latestRealm;

    const battle = realm.battle;

    battle.result = success ? "win" : "lose";

    battle.finishedAt = Date.now();

    battle.resolving = true;

    realm.status = "finished";
    realm.recruitmentClosed = true;
    realm.finishedAt = Date.now();

    const roundTimerKey = `round_${realm.id}`;

    const roundTimer = activeTimers.get(roundTimerKey);

    if (roundTimer) {
        clearTimeout(roundTimer);

        activeTimers.delete(roundTimerKey);
    }

    const lobbyTimer = activeTimers.get(realm.id);

    if (lobbyTimer) {
        clearTimeout(lobbyTimer);

        activeTimers.delete(realm.id);
    }

    if (battle.roundMessageId) {
        const roundMessage = await channel.messages
            .fetch(battle.roundMessageId)
            .catch(() => null);

        if (roundMessage) {
            await roundMessage
                .edit({
                    components: [],
                })
                .catch(() => null);
        }
    }

    const resultLines = [];

    if (success) {
        for (const userId of realm.memberIds) {
            const reward = giveSecretRealmReward(realm, userId);

            const member = realm.members?.[userId] || {};

            const contribution = battle.contributions?.[userId] || {};

            const rewardParts = [];

            for (const [itemId, amount] of Object.entries(reward.items || {})) {
                const item = shopConfig[itemId] || {};

                rewardParts.push(
                    `${item.emoji || "🎁"} ` +
                        `**${item.name || itemId}** ` +
                        `x${formatNumber(amount)}`,
                );
            }

            if (rewardParts.length === 0) {
                rewardParts.push("Không nhận được vật phẩm");
            }

            resultLines.push(
                `<@${userId}> — ` +
                    `${rewardParts.join(" | ")}\n` +
                    `> Đóng góp: **${formatNumber(
                        contribution.totalScore || 0,
                    )}** | ` +
                    `AFK: **${formatNumber(member.afkTurns || 0)} lượt**`,
            );
        }
    } else {
        for (const userId of realm.memberIds) {
            const contribution = battle.contributions?.[userId] || {};

            resultLines.push(
                `<@${userId}> — ` +
                    `Đóng góp **${formatNumber(
                        contribution.totalScore || 0,
                    )}**`,
            );
        }
    }

    /*
     * Host đã tăng hostRuns khi bắt đầu.
     * Chỉ tăng guestRuns cho thành viên khách.
     */
    for (const userId of realm.memberIds) {
        if (String(userId) === String(realm.hostId)) {
            continue;
        }

        updateSecretRealmFatigue(userId, (data) => {
            const safe = resetFatigueIfNeeded(data);

            safe.guestRuns = Number(safe.guestRuns || 0) + 1;
            safe.resetDate = getTodayKey();
            safe.updatedAt = Date.now();
        });
    }

    clearRealmUsers(realm);

    const finalEmbed = new EmbedBuilder()
        .setColor(success ? 0x2ecc71 : 0xe74c3c)
        .setTitle(
            success
                ? "🏆 CHINH PHỤC BÍ CẢNH THÀNH CÔNG"
                : "💀 BÍ CẢNH THẤT BẠI",
        )
        .setDescription(
            (success
                ? `Đội đã hoàn thành Bí Cảnh trong **${battle.turn}/${battle.maxTurns} lượt**.`
                : `Đội đã không thể vượt qua Bí Cảnh.`) +
                `\n\n` +
                `📈 Tiến độ: **${formatNumber(battle.progress)}/${formatNumber(
                    battle.requiredProgress,
                )}**\n` +
                `❤️ Sinh lực còn lại: **${formatNumber(
                    battle.teamHp,
                )}/${formatNumber(battle.maxTeamHp)}**\n\n` +
                `### Kết quả thành viên\n` +
                resultLines.join("\n\n"),
        )
        .setFooter({
            text: "Channel Bí Cảnh sẽ tự động đóng.",
        })
        .setTimestamp();

    await channel.send({
        content: realm.memberIds.map((userId) => `<@${userId}>`).join(" "),

        embeds: [finalEmbed],
        components: [],
    });

    /*
     * Sau khi kết thúc, không cho thành viên
     * gửi thêm tin nhắn nhưng vẫn xem được
     * bảng kết quả đến lúc channel bị xóa.
     */
    for (const userId of realm.memberIds) {
        await channel.permissionOverwrites
            .edit(userId, {
                ViewChannel: true,
                SendMessages: false,
                ReadMessageHistory: true,
            })
            .catch(() => null);
    }

    const deleteDelayMs = Math.max(
        5000,
        Number(config.channel.deleteDelayMs || 10 * 60 * 1000),
    );

    setTimeout(() => {
        channel.delete("Bí cảnh đã kết thúc").catch(() => null);
    }, deleteDelayMs);
}

async function resolveBattleRound(channel, realmId) {
    const realm = getRealm(realmId);

    if (!realm || realm.status !== "battle" || !realm.battle) {
        return;
    }

    const battle = realm.battle;

    if (
        battle.resolving === true ||
        Number(battle.resolvedTurn || 0) >= Number(battle.turn || 0)
    ) {
        return;
    }

    battle.resolving = true;

    saveRealm(realm);

    const timerKey = `round_${realm.id}`;

    const currentTimer = activeTimers.get(timerKey);

    if (currentTimer) {
        clearTimeout(currentTimer);
        activeTimers.delete(timerKey);
    }

    const roundMessage = battle.roundMessageId
        ? await channel.messages.fetch(battle.roundMessageId).catch(() => null)
        : null;

    const resultLines = [];

    let totalProgress = 0;
    let totalProtection = 0;
    let totalEnergy = 0;
    let totalStability = 0;

    const matchedRoles = new Set();

    for (const userId of realm.memberIds) {
        const action = battle.actions[userId];

        const contribution = battle.contributions[userId] || {
            attack: 0,
            guard: 0,
            support: 0,
            explore: 0,
            totalScore: 0,
            successfulTurns: 0,
            afkTurns: 0,
        };

        battle.contributions[userId] = contribution;

        if (!action || !ACTIONS[action]) {
            contribution.afkTurns = Number(contribution.afkTurns || 0) + 1;

            if (realm.members[userId]) {
                realm.members[userId].afkTurns =
                    Number(realm.members[userId].afkTurns || 0) + 1;
            }

            battle.stability = Math.max(0, battle.stability - 5);

            resultLines.push(`💤 <@${userId}> không hành động.`);

            continue;
        }

        const actionResult = calculateActionResult(realm, userId, action);

        contribution[action] = Number(contribution[action] || 0) + 1;

        const score =
            actionResult.progress +
            actionResult.protection +
            actionResult.energy * 2 +
            actionResult.stability * 2;

        contribution.totalScore = Number(contribution.totalScore || 0) + score;

        if (actionResult.matchedMechanic) {
            contribution.successfulTurns =
                Number(contribution.successfulTurns || 0) + 1;

            matchedRoles.add(action);
        }

        totalProgress += actionResult.progress;
        totalProtection += actionResult.protection;
        totalEnergy += actionResult.energy;
        totalStability += actionResult.stability;

        resultLines.push(
            `${ACTIONS[action].emoji} <@${userId}> dùng **${ACTIONS[action].label}**` +
                (actionResult.matchedMechanic ? " ✅" : ""),
        );
    }

    const requiredRoles = battle.currentMechanic?.roles || [];

    const matchedRoleCount = requiredRoles.filter((role) => {
        return matchedRoles.has(role);
    }).length;

    const completedMechanic = matchedRoleCount >= requiredRoles.length;

    if (completedMechanic) {
        totalProgress = Math.floor(totalProgress * 1.25);

        totalStability += 8;
        totalEnergy += 5;
    } else {
        totalProgress = Math.floor(totalProgress * 0.72);

        battle.stability = Math.max(0, battle.stability - 8);
    }

    battle.progress = Math.min(
        battle.requiredProgress,
        battle.progress + totalProgress,
    );

    battle.energy = Math.max(0, Math.min(100, battle.energy + totalEnergy - 8));

    battle.stability = Math.max(
        0,
        Math.min(100, battle.stability + totalStability - 7),
    );

    const receivedDamage = calculateRealmDamage(
        realm,
        matchedRoleCount,
        totalProtection,
    );

    battle.teamHp = Math.max(0, battle.teamHp - receivedDamage);

    battle.resolvedTurn = Number(battle.turn || 0);

    saveRealm(realm);

    if (roundMessage) {
        await roundMessage
            .edit({
                components: [],
            })
            .catch(() => null);
    }

    await channel.send({
        embeds: [
            new EmbedBuilder()
                .setColor(completedMechanic ? 0x2ecc71 : 0xe67e22)
                .setTitle(
                    completedMechanic
                        ? "✅ PHÁ GIẢI CƠ CHẾ THÀNH CÔNG"
                        : "⚠️ PHÁ GIẢI CƠ CHẾ THẤT BẠI",
                )
                .setDescription(
                    `${resultLines.join("\n")}\n\n` +
                        `📈 Tiến độ nhận được: **+${formatNumber(totalProgress)}**\n` +
                        `💥 Sát thương đội chịu: **-${formatNumber(receivedDamage)}**\n\n` +
                        `📊 Tổng tiến độ: **${formatNumber(battle.progress)}/${formatNumber(battle.requiredProgress)}**\n` +
                        `❤️ Sinh lực còn lại: **${formatNumber(battle.teamHp)}/${formatNumber(battle.maxTeamHp)}**\n` +
                        `🔵 Linh khí: **${battle.energy}/100**\n` +
                        `🌀 Ổn định: **${battle.stability}/100**`,
                ),
        ],
    });

    if (battle.progress >= battle.requiredProgress) {
        return finishBattle(channel, realm, true);
    }

    if (battle.teamHp <= 0) {
        return finishBattle(channel, realm, false);
    }

    if (battle.turn >= battle.maxTurns) {
        const success = battle.progress >= battle.requiredProgress * 0.9;

        return finishBattle(channel, realm, success);
    }

    battle.turn += 1;
    battle.actions = {};
    battle.resolving = false;

    saveRealm(realm);

    await openBattleRound(channel, realm);
}

function buildBattleButtons(realm) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`bicanh_act_attack_${realm.id}`)
            .setLabel("Công kích")
            .setEmoji("⚔️")
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId(`bicanh_act_guard_${realm.id}`)
            .setLabel("Hộ pháp")
            .setEmoji("🛡️")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(`bicanh_act_support_${realm.id}`)
            .setLabel("Trợ lực")
            .setEmoji("✨")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(`bicanh_act_explore_${realm.id}`)
            .setLabel("Thăm dò")
            .setEmoji("🔍")
            .setStyle(ButtonStyle.Secondary),
    );
}

async function beginBattle(channel, realm) {
    realm.status = "battle";
    realm.battle = createBattleState(realm);

    saveRealm(realm);

    await openBattleRound(channel, realm);
}

async function openBattleRound(channel, realm) {
    const battle = realm.battle;

    battle.actions = {};

    battle.currentMechanic =
        ROUND_MECHANICS[(battle.turn - 1) % ROUND_MECHANICS.length];

    saveRealm(realm);

    const message = await channel.send({
        content: realm.memberIds.map((id) => `<@${id}>`).join(" "),

        embeds: [buildBattleEmbed(realm)],

        components: [buildBattleButtons(realm)],
    });

    battle.roundMessageId = message.id;
    battle.roundEndsAt = Date.now() + config.party.actionDurationMs;

    saveRealm(realm);

    const oldTimer = activeTimers.get(`round_${realm.id}`);

    if (oldTimer) {
        clearTimeout(oldTimer);
    }

    const timer = setTimeout(() => {
        resolveBattleRound(channel, realm.id).catch((error) => {
            console.error("[BiCanh Resolve Round]", error);
        });
    }, config.party.actionDurationMs);

    activeTimers.set(`round_${realm.id}`, timer);
}

function makeBar(current, max, length = 12) {
    const rate = Math.max(
        0,
        Math.min(1, Number(current || 0) / Math.max(1, Number(max || 1))),
    );

    const filled = Math.round(rate * length);

    return "█".repeat(filled) + "░".repeat(length - filled);
}

function buildBattleEmbed(realm) {
    const battle = realm.battle;
    const mechanic = battle.currentMechanic;

    const selectedCount = Object.keys(battle.actions || {}).length;

    return new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle(`⚔️ BÍ CẢNH — LƯỢT ${battle.turn}/${battle.maxTurns}`)
        .setDescription(
            `### ${mechanic.name}\n` +
                `${mechanic.description}\n\n` +
                `📈 Tiến độ: **${battle.progress}/${battle.requiredProgress}**\n` +
                `${makeBar(battle.progress, battle.requiredProgress)}\n\n` +
                `❤️ Sinh lực đội: **${battle.teamHp}/${battle.maxTeamHp}**\n` +
                `${makeBar(battle.teamHp, battle.maxTeamHp)}\n\n` +
                `🔵 Linh khí: **${battle.energy}/100**\n` +
                `🌀 Ổn định: **${battle.stability}/100**\n\n` +
                `👥 Đã chọn: **${selectedCount}/${realm.memberIds.length}**\n` +
                `⏰ Mỗi người hãy chọn một hành động.`,
        )
        .setFooter({
            text: `ID: ${realm.id}`,
        });
}

async function selectBattleAction(interaction, realm, action) {
    const userId = String(interaction.user.id);

    if (realm.status !== "battle" || !realm.battle) {
        return interaction.reply({
            content: "❌ Trận Bí Cảnh chưa bắt đầu.",
            ephemeral: true,
        });
    }
    if (realm.battle.resolving === true) {
        return interaction.reply({
            content: "⏳ Lượt này đang được tổng kết.",
            ephemeral: true,
        });
    }
    if (!realm.memberIds.includes(userId)) {
        return interaction.reply({
            content: "❌ Bạn không thuộc đội Bí Cảnh.",
            ephemeral: true,
        });
    }

    if (!ACTIONS[action]) {
        return interaction.reply({
            content: "❌ Hành động không hợp lệ.",
            ephemeral: true,
        });
    }
    if (realm.battle.actions[userId]) {
        return interaction.reply({
            content: "❌ Bạn đã chọn hành động cho lượt này.",
            ephemeral: true,
        });
    }

    realm.battle.actions[userId] = action;

    if (!realm.battle.contributions[userId]) {
        realm.battle.contributions[userId] = {
            attack: 0,
            guard: 0,
            support: 0,
            explore: 0,
            afkTurns: 0,
        };
    }

    saveRealm(realm);

    await interaction.reply({
        content: `${ACTIONS[action].emoji} Bạn đã chọn **${ACTIONS[action].label}** cho lượt này.`,
        ephemeral: true,
    });

    if (Object.keys(realm.battle.actions).length >= realm.memberIds.length) {
        const timer = activeTimers.get(`round_${realm.id}`);

        if (timer) {
            clearTimeout(timer);
            activeTimers.delete(`round_${realm.id}`);
        }

        await resolveBattleRound(interaction.channel, realm.id);
    }
}

module.exports = {
    tryTrigger,
    handleButton,
    recover,
};
