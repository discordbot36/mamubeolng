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
    getUser,
    updateUser,
    addMoney,
    formatMoney,
    getCurrencyEmoji,
    getBeastMaterials,
    addBeastMaterials,
    getBeastHuntState,
    updateBeastHuntState,
} = require("./database");

const adminConfig = require("./config/admin");
const config = require("./config/sanyeuthu");
const combat = require("./utils/combat");

const activeTimers = new Map();

const ACTIONS = {
    attack: {
        label: "Công kích",
        emoji: "⚔️",
        style: ButtonStyle.Danger,
    },
    guard: {
        label: "Hộ pháp",
        emoji: "🛡️",
        style: ButtonStyle.Primary,
    },
    support: {
        label: "Trợ lực",
        emoji: "✨",
        style: ButtonStyle.Success,
    },
    explore: {
        label: "Thăm dò",
        emoji: "🔍",
        style: ButtonStyle.Secondary,
    },
};

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

function pickWeighted(list, weightKey = "weight") {
    const pool = Array.isArray(list) ? list : [];
    const totalWeight = pool.reduce((total, entry) => {
        return total + Math.max(0, Number(entry?.[weightKey] || 0));
    }, 0);

    if (pool.length <= 0 || totalWeight <= 0) {
        return null;
    }

    let rollValue = Math.random() * totalWeight;

    for (const entry of pool) {
        rollValue -= Math.max(0, Number(entry?.[weightKey] || 0));

        if (rollValue <= 0) {
            return entry;
        }
    }

    return pool[pool.length - 1];
}

function createHuntId() {
    return `syt_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function getAdminIds() {
    return Array.isArray(adminConfig.allowedUserIds)
        ? adminConfig.allowedUserIds.map(String)
        : [];
}
function isValidDiscordId(id) {
    return /^\d{17,20}$/.test(String(id || ""));
}

function getTodayKey() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}

function ensureUserHuntStats(user) {
    if (!user.beastHuntStats) {
        user.beastHuntStats = {
            resetDate: getTodayKey(),
            dailyRuns: 0,
            soloRuns: 0,
            partyRuns: 0,
            lastSoloAt: 0,
            lastPartyAt: 0,
            wins: 0,
            losses: 0,
        };
    }

    const stats = user.beastHuntStats;
    const todayKey = getTodayKey();

    if (stats.resetDate !== todayKey) {
        stats.resetDate = todayKey;
        stats.dailyRuns = 0;
        stats.soloRuns = 0;
        stats.partyRuns = 0;
        stats.lastSoloAt = 0;
        stats.lastPartyAt = 0;
    }

    if (stats.dailyRuns === undefined) {
        stats.dailyRuns =
            Number(stats.soloRuns || 0) + Number(stats.partyRuns || 0);
    }

    if (stats.soloRuns === undefined) {
        stats.soloRuns = 0;
    }

    if (stats.partyRuns === undefined) {
        stats.partyRuns = 0;
    }

    if (stats.wins === undefined) {
        stats.wins = 0;
    }

    if (stats.losses === undefined) {
        stats.losses = 0;
    }

    return stats;
}
function getTimeLeftText(ms) {
    const totalSeconds = Math.ceil(Math.max(0, Number(ms || 0)) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes <= 0) {
        return `${seconds} giây`;
    }

    return `${minutes} phút ${seconds} giây`;
}

function checkRunAvailable(userId, mode) {
    const user = getUser(userId);
    const stats = ensureUserHuntStats(user);
    const now = Date.now();

    if (mode === "solo") {
        if (Number(stats.dailyRuns || 0) >= config.cooldown.maxRunsPerDay) {
            return {
                ok: false,
                message: `Bạn đã hết lượt săn yêu thú hôm nay (**${stats.dailyRuns}/${config.cooldown.maxRunsPerDay}**). Solo không có chế độ hỗ trợ.`,
            };
        }

        const cooldownLeft =
            Number(stats.lastSoloAt || 0) + config.cooldown.soloMs - now;

        if (cooldownLeft > 0) {
            return {
                ok: false,
                message: `Bạn cần nghỉ thêm **${getTimeLeftText(cooldownLeft)}** mới có thể săn solo tiếp.`,
            };
        }

        return {
            ok: true,
            supportOnly: false,
        };
    }

    const cooldownLeft =
        Number(stats.lastPartyAt || 0) + config.cooldown.partyMs - now;

    if (cooldownLeft > 0) {
        return {
            ok: false,
            message: `Bạn cần nghỉ thêm **${getTimeLeftText(cooldownLeft)}** mới có thể săn tổ đội tiếp.`,
        };
    }

    if (Number(stats.dailyRuns || 0) >= config.cooldown.maxRunsPerDay) {
        return {
            ok: true,
            supportOnly: true,
            message: `Bạn đã hết lượt thưởng chính hôm nay. Bạn vẫn có thể hỗ trợ tổ đội nhưng chỉ nhận **10% quà**.`,
        };
    }

    return {
        ok: true,
        supportOnly: false,
    };
}

function consumeRun(userId, mode, supportOnly = false) {
    return updateUser(userId, (user) => {
        const stats = ensureUserHuntStats(user);
        const now = Date.now();

        if (!supportOnly) {
            stats.dailyRuns = Number(stats.dailyRuns || 0) + 1;
        }

        if (mode === "solo") {
            stats.soloRuns = Number(stats.soloRuns || 0) + 1;
            stats.lastSoloAt = now;
        } else {
            if (!supportOnly) {
                stats.partyRuns = Number(stats.partyRuns || 0) + 1;
            }

            stats.lastPartyAt = now;
        }

        return stats;
    });
}

function recordResult(userId, success) {
    return updateUser(userId, (user) => {
        const stats = ensureUserHuntStats(user);

        if (success) {
            stats.wins = Number(stats.wins || 0) + 1;
        } else {
            stats.losses = Number(stats.losses || 0) + 1;
        }

        return stats;
    });
}

function getCombatPower(userId) {
    const profile = ensureTuTienProfile(userId);
    const stats = combat.calculateCombatStats(profile);

    return Math.max(1, Number(stats.combatPower || 1));
}

function clearHuntTimer(huntId) {
    const timer = activeTimers.get(huntId);

    if (timer) {
        clearTimeout(timer);
        activeTimers.delete(huntId);
    }
}

function clearRoundTimer(huntId) {
    const timerKey = `round_${huntId}`;
    const timer = activeTimers.get(timerKey);

    if (timer) {
        clearTimeout(timer);
        activeTimers.delete(timerKey);
    }
}

function getHunt(huntId) {
    const state = getBeastHuntState();

    return state.hunts[huntId] || null;
}

async function getBlockingActiveHunt(userId, client) {
    const state = getBeastHuntState();
    const activeHuntId = state.activeUserHunts[String(userId)];

    if (!activeHuntId) {
        return null;
    }

    const activeHunt = state.hunts[activeHuntId];

    if (!activeHunt || ["finished", "cancelled"].includes(activeHunt.status)) {
        updateBeastHuntState((latestState) => {
            delete latestState.activeUserHunts[String(userId)];
        });

        return null;
    }

    if (activeHunt.channelId && client) {
        const channel = await client.channels
            .fetch(activeHunt.channelId)
            .catch(() => null);

        if (!channel) {
            activeHunt.status = "cancelled";
            activeHunt.cancelledAt = Date.now();
            clearHuntUsers(activeHunt);
            saveHunt(activeHunt);

            return null;
        }
    }

    return activeHunt;
}

function saveHunt(hunt) {
    updateBeastHuntState((state) => {
        state.hunts[hunt.id] = hunt;

        for (const userId of hunt.memberIds || []) {
            state.activeUserHunts[String(userId)] = hunt.id;
        }
    });

    return hunt;
}

function clearHuntUsers(hunt) {
    updateBeastHuntState((state) => {
        state.hunts[hunt.id] = hunt;

        for (const userId of hunt.memberIds || []) {
            delete state.activeUserHunts[String(userId)];
        }
    });
}

function formatMaterials(materials = {}) {
    const lines = Object.entries(materials || {})
        .filter(([, amount]) => Number(amount || 0) > 0)
        .map(([materialId, amount]) => {
            const material = config.materials[materialId] || {
                name: materialId,
                emoji: "📦",
            };

            return `${material.emoji} ${material.name} x${formatNumber(amount)}`;
        });

    return lines.length > 0 ? lines.join("\n") : "Không có";
}

function mergeMaterial(materials, materialId, amount = 1) {
    const safeAmount = Math.floor(Number(amount || 0));

    if (!materialId || safeAmount <= 0) {
        return;
    }

    materials[materialId] = Number(materials[materialId] || 0) + safeAmount;
}

function removeMaterial(materials, materialId, amount = 1) {
    const safeAmount = Math.floor(Number(amount || 0));

    if (!materialId || safeAmount <= 0 || !materials[materialId]) {
        return 0;
    }

    const removed = Math.min(Number(materials[materialId] || 0), safeAmount);
    materials[materialId] = Number(materials[materialId] || 0) - removed;

    if (materials[materialId] <= 0) {
        delete materials[materialId];
    }

    return removed;
}

function pickBeast(mode) {
    const weightKey = mode === "party" ? "partyWeight" : "soloWeight";
    const beast = pickWeighted(config.beasts, weightKey) || config.beasts[0];

    return JSON.parse(JSON.stringify(beast));
}

function pickMechanic(hunt) {
    const battle = hunt.battle;
    const pool = config.mechanics.filter((mechanic) => {
        return mechanic.id !== battle.lastMechanicId;
    });

    const mechanic =
        pool[randomInt(0, pool.length - 1)] || config.mechanics[0] || null;

    if (!mechanic) {
        return null;
    }

    battle.lastMechanicId = mechanic.id;

    const rolePool = Array.isArray(mechanic.roles) ? mechanic.roles : [];
    let requiredRoles = [];

    if (hunt.mode === "solo") {
        requiredRoles = [mechanic.soloRole || rolePool[0] || "attack"];
    } else {
        const memberCount = Math.max(2, Number(hunt.memberIds.length || 2));
        const targetRoleCount =
            memberCount >= 3 && rolePool.length >= 3 ? 3 : 2;

        requiredRoles = rolePool.slice(0, targetRoleCount);
    }

    return {
        id: mechanic.id,
        name: mechanic.name,
        hint: mechanic.hint,
        roles: requiredRoles,
    };
}

function getMemberRoundPower(hunt, userId) {
    const member = hunt.members[userId];

    if (!member) {
        return 1;
    }

    const battle = hunt.battle;
    const totalPower = Math.max(1, Number(battle.totalPower || 1));

    if (hunt.mode === "solo") {
        return Math.max(1, Number(member.power || 1));
    }

    const capRatio = hunt.memberIds.length >= 4 ? 0.34 : 0.42;
    const maximumPower = totalPower * capRatio;

    return Math.max(1, Math.min(Number(member.power || 1), maximumPower));
}

function createBattleState(hunt) {
    const memberCount = Math.max(1, hunt.memberIds.length);
    const totalPower = hunt.memberIds.reduce((total, userId) => {
        return total + Math.max(1, Number(hunt.members[userId]?.power || 1));
    }, 0);

    const beast = hunt.beast;
    const level = Math.max(1, Number(beast.level || 1));
    const modeDifficulty = hunt.mode === "party" ? 0.058 : 0.065;
    const partyTacticTax =
        hunt.mode === "party" ? 1 + (memberCount - 1) * 0.1 : 1;

    const maxBeastHp = Math.max(
        80,
        Math.floor(
            totalPower *
                modeDifficulty *
                Number(beast.hpMultiplier || 1) *
                partyTacticTax,
        ),
    );

    const maxTeamHp = Math.max(
        90,
        Math.floor(totalPower * 0.075 * Math.max(0.85, 1.08 - level * 0.04)),
    );

    const contributions = {};

    for (const userId of hunt.memberIds) {
        contributions[userId] = {
            attack: 0,
            guard: 0,
            support: 0,
            explore: 0,
            correctTurns: 0,
            wrongTurns: 0,
            afkTurns: 0,
            totalScore: 0,
        };
    }

    return {
        turn: 1,
        maxTurns: Math.max(3, Number(beast.maxTurns || 4)),
        beastHp: maxBeastHp,
        maxBeastHp,
        teamHp: maxTeamHp,
        maxTeamHp,
        rhythm: hunt.mode === "party" ? 62 : 68,
        totalPower,
        loot: {
            money: 0,
            materials: {},
            lostMoney: 0,
            lostMaterials: {},
            teamGiftLost: false,
        },
        teamGift: {
            money: 0,
            materials: {},
        },
        actions: {},
        currentMechanic: null,
        contributions,
        perfectTurns: 0,
        failedTurns: 0,
        wrongActions: 0,
        lastMechanicId: null,
        resolving: false,
        resolvedTurn: 0,
        roundMessageId: null,
        roundEndsAt: 0,
        emptyRoundExtended: false,
        startedAt: Date.now(),
        finishedAt: 0,
        result: null,
    };
}

function buildLobbyEmbed(hunt) {
    const memberLines = hunt.memberIds.map((userId, index) => {
        const member = hunt.members[userId];

        return (
            `${index + 1}. <@${userId}>` +
            (userId === hunt.hostId ? " 👑" : "") +
            ` — lực chiến **${formatNumber(member?.power || 0)}**`
        );
    });

    return new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("🐾 TỔ ĐỘI SĂN YÊU THÚ")
        .setDescription(
            `👑 Host: <@${hunt.hostId}>\n` +
                `👥 Thành viên: **${hunt.memberIds.length}/${hunt.maxMembers}**\n` +
                `📌 Tối thiểu bắt đầu: **${hunt.minMembers} người**\n\n` +
                `${memberLines.join("\n")}\n\n` +
                "Bấm **Tham gia** để vào đội. Khi host bấm **Bắt đầu**, kênh sẽ khóa như Bí Cảnh.",
        )
        .setFooter({ text: `ID: ${hunt.id}` })
        .setTimestamp();
}

function buildLobbyButtons(hunt) {
    const cannotJoin =
        hunt.status !== "lobby" ||
        hunt.recruitmentClosed === true ||
        hunt.memberIds.length >= hunt.maxMembers;
    const cannotLeave =
        hunt.status !== "lobby" || hunt.recruitmentClosed === true;
    const cannotStart =
        hunt.status !== "lobby" || hunt.memberIds.length < hunt.minMembers;

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`syt_join_${hunt.id}`)
            .setLabel("Tham gia")
            .setEmoji("🐾")
            .setStyle(ButtonStyle.Success)
            .setDisabled(cannotJoin),
        new ButtonBuilder()
            .setCustomId(`syt_leave_${hunt.id}`)
            .setLabel("Rời đội")
            .setEmoji("🚪")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(cannotLeave),
        new ButtonBuilder()
            .setCustomId(`syt_start_${hunt.id}`)
            .setLabel("Bắt đầu săn")
            .setEmoji("⚔️")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(cannotStart),
    );
}

async function createHuntChannel(interaction, hunt) {
    const guild = interaction.guild;

    if (!guild) {
        throw new Error("Săn yêu thú chỉ có thể mở trong server.");
    }

    const botId = interaction.client.user.id;

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
            id: botId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ManageRoles,
            ],
        },
    ];

    const channel = await guild.channels.create({
        name: `${config.channel.namePrefix}-${hunt.id.slice(-6)}`,
        type: ChannelType.GuildText,
        parent: config.channel.categoryId || undefined,
        permissionOverwrites,
        reason: `Mở săn yêu thú ${hunt.id}`,
    });

    const hostMember = await guild.members.fetch(hunt.hostId).catch(() => null);

    if (hostMember) {
        await channel.permissionOverwrites
            .edit(hostMember, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
            })
            .catch(() => null);
    }

    for (const adminId of getAdminIds().filter(isValidDiscordId)) {
        const adminMember = await guild.members
            .fetch(adminId)
            .catch(() => null);

        if (!adminMember) {
            continue;
        }

        await channel.permissionOverwrites
            .edit(adminMember, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
            })
            .catch(() => null);
    }

    hunt.channelId = channel.id;

    if (hunt.mode === "solo") {
        const message = await channel.send({
            content: `<@${hunt.hostId}> đã bước vào khu săn yêu thú một mình.`,
            embeds: [
                new EmbedBuilder()
                    .setColor(0x27ae60)
                    .setTitle("🐾 SĂN YÊU THÚ SOLO")
                    .setDescription(
                        "Kênh riêng đã được mở. Trận săn sẽ bắt đầu ngay sau vài nhịp thở.",
                    ),
            ],
            components: [],
        });

        hunt.messageId = message.id;
    } else {
        const message = await channel.send({
            content:
                `🐾 <@${hunt.hostId}> đang lập tổ đội săn yêu thú!\n` +
                "Ai muốn đi săn thì bấm **Tham gia**.",
            embeds: [buildLobbyEmbed(hunt)],
            components: [buildLobbyButtons(hunt)],
        });

        hunt.messageId = message.id;
    }

    saveHunt(hunt);

    return channel;
}

async function lockHuntChannel(channel, hunt) {
    hunt.recruitmentClosed = true;

    await channel.permissionOverwrites.edit(channel.guild.roles.everyone.id, {
        ViewChannel: false,
        SendMessages: false,
    });

    for (const userId of hunt.memberIds) {
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

    saveHunt(hunt);
}

function buildActionButtons(hunt) {
    return new ActionRowBuilder().addComponents(
        ...Object.entries(ACTIONS).map(([actionId, action]) => {
            return new ButtonBuilder()
                .setCustomId(`syt_act_${actionId}_${hunt.id}`)
                .setLabel(action.label)
                .setEmoji(action.emoji)
                .setStyle(action.style);
        }),
    );
}

function makeBar(current, max, length = 12) {
    const rate = Math.max(
        0,
        Math.min(1, Number(current || 0) / Math.max(1, Number(max || 1))),
    );
    const filled = Math.round(rate * length);

    return "█".repeat(filled) + "░".repeat(length - filled);
}

function buildBattleEmbed(hunt) {
    const battle = hunt.battle;
    const beast = hunt.beast;
    const mechanic = battle.currentMechanic;
    const selectedCount = Object.keys(battle.actions || {}).length;

    return new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle(`${beast.emoji} ${beast.name} — ${beast.tierName}`)
        .setDescription(
            `**Lượt ${battle.turn}/${battle.maxTurns}: ${mechanic.name}**\n` +
                `${mechanic.hint}\n\n` +
                `🎯 Yêu cầu: **đọc dấu hiệu rồi chọn hành động phù hợp**\n` +
                `🐺 Yêu thú: **${formatNumber(battle.beastHp)}/${formatNumber(battle.maxBeastHp)}**\n` +
                `${makeBar(battle.beastHp, battle.maxBeastHp)}\n` +
                `❤️ Đội săn: **${formatNumber(battle.teamHp)}/${formatNumber(battle.maxTeamHp)}**\n` +
                `${makeBar(battle.teamHp, battle.maxTeamHp)}\n` +
                `🌀 Nhịp phối hợp: **${battle.rhythm}/100**\n` +
                `🎒 Túi chiến lợi phẩm: **${getCurrencyEmoji()} ${formatMoney(battle.loot.money)}**\n` +
                `${formatMaterials(battle.loot.materials)}\n\n` +
                `👥 Đã chọn: **${selectedCount}/${hunt.memberIds.length}**`,
        )
        .setFooter({
            text:
                hunt.mode === "solo"
                    ? "Solo vẫn cần đọc dấu hiệu. Chọn sai sẽ rơi quà tạm."
                    : "Tổ đội thắng bằng phối hợp, không phải chỉ spam sát thương.",
        })
        .setTimestamp();
}

function calculateActionResult(hunt, userId, action) {
    const battle = hunt.battle;
    const memberPower = getMemberRoundPower(hunt, userId);
    const requiredRoles = battle.currentMechanic?.roles || [];
    const matched = requiredRoles.includes(action);
    const baseValue = Math.max(1, memberPower * 0.018);
    const randomMultiplier = combat.randomBetween(0.88, 1.12);

    let damage = 0;
    let protection = 0;
    let rhythm = 0;
    let lootFocus = 0;

    switch (action) {
        case "attack": {
            damage = baseValue * (matched ? 1.25 : 0.18);
            rhythm = matched ? 4 : -7;
            break;
        }

        case "guard": {
            damage = baseValue * (matched ? 0.55 : 0.08);
            protection = baseValue * (matched ? 1.35 : 0.2);
            rhythm = matched ? 8 : -5;
            break;
        }

        case "support": {
            damage = baseValue * (matched ? 0.72 : 0.1);
            protection = baseValue * (matched ? 0.35 : 0.1);
            rhythm = matched ? 11 : -6;
            break;
        }

        case "explore": {
            damage = baseValue * (matched ? 0.9 : 0.08);
            lootFocus = matched ? 10 : -4;
            rhythm = matched ? 7 : -6;
            break;
        }
    }

    return {
        damage: Math.max(0, Math.floor(damage * randomMultiplier)),
        protection: Math.max(0, Math.floor(protection * randomMultiplier)),
        rhythm: Math.floor(rhythm * randomMultiplier),
        lootFocus: Math.floor(lootFocus * randomMultiplier),
        matched,
        wrong: !matched,
    };
}

function rollMoneyLoot(hunt, completed, cleanSolved) {
    const beast = hunt.beast;
    const memberCount = Math.max(1, hunt.memberIds.length);
    const rewardConfig = config.rewards;
    const min =
        hunt.mode === "solo"
            ? rewardConfig.soloMoneyMin
            : rewardConfig.partyMoneyMin;
    const max =
        hunt.mode === "solo"
            ? rewardConfig.soloMoneyMax
            : rewardConfig.partyMoneyMax;
    const partyBonus =
        hunt.mode === "party" ? rewardConfig.partyBonusMultiplier : 1;
    const cleanBonus = cleanSolved ? 1.15 : 1;
    const failBonus = completed ? 1 : 0.42;

    return Math.max(
        0,
        Math.floor(
            randomInt(min, max) *
                memberCount *
                Number(beast.rewardMultiplier || 1) *
                partyBonus *
                cleanBonus *
                failBonus,
        ),
    );
}

function rollMaterialLoot(hunt, completed, cleanSolved, lootFocus) {
    const beast = hunt.beast;
    const materials = {};
    const baseChance = completed ? 0.56 : 0.22;
    const cleanBonus = cleanSolved ? 0.14 : 0;
    const focusBonus = Math.max(
        -0.16,
        Math.min(0.2, Number(lootFocus || 0) / 100),
    );
    const partyBonus = hunt.mode === "party" ? 0.08 : 0;
    const chance = Math.max(
        0.05,
        Math.min(0.86, baseChance + cleanBonus + focusBonus + partyBonus),
    );
    const rolls =
        hunt.mode === "party"
            ? Math.max(1, Math.ceil(hunt.memberIds.length / 2))
            : 1;

    for (let i = 0; i < rolls; i++) {
        if (!combat.roll(chance)) {
            continue;
        }

        const entry = pickWeighted(beast.materials || []);

        if (!entry) {
            continue;
        }

        mergeMaterial(
            materials,
            entry.id,
            randomInt(entry.min || 1, entry.max || 1),
        );
    }

    return materials;
}

function spillLoot(hunt, percent, allowMaterialLoss = true) {
    const battle = hunt.battle;
    const loot = battle.loot;
    const lost = {
        money: 0,
        materials: {},
    };

    const lostMoney = Math.floor(
        Number(loot.money || 0) * Math.max(0, percent),
    );

    if (lostMoney > 0) {
        loot.money = Math.max(0, Number(loot.money || 0) - lostMoney);
        loot.lostMoney = Number(loot.lostMoney || 0) + lostMoney;
        lost.money = lostMoney;
    }

    if (allowMaterialLoss) {
        for (const materialId of Object.keys(loot.materials || {})) {
            if (!combat.roll(Math.min(0.75, percent + 0.15))) {
                continue;
            }

            const removed = removeMaterial(loot.materials, materialId, 1);

            if (removed > 0) {
                mergeMaterial(loot.lostMaterials, materialId, removed);
                mergeMaterial(lost.materials, materialId, removed);
            }
        }
    }

    return lost;
}

function buildLostText(lost) {
    const lines = [];

    if (Number(lost.money || 0) > 0) {
        lines.push(`-${getCurrencyEmoji()} ${formatMoney(lost.money)}`);
    }

    for (const [materialId, amount] of Object.entries(lost.materials || {})) {
        const material = config.materials[materialId] || {
            name: materialId,
            emoji: "📦",
        };

        lines.push(
            `-${material.emoji} ${material.name} x${formatNumber(amount)}`,
        );
    }

    return lines.length > 0 ? lines.join("\n") : "Không rơi thêm gì.";
}

function calculateBeastDamage(
    hunt,
    completed,
    totalProtection,
    wrongActionCount,
    afkCount,
) {
    const battle = hunt.battle;
    const beast = hunt.beast;
    const base = Math.max(
        8,
        battle.maxTeamHp *
            0.13 *
            Number(beast.damageMultiplier || 1) *
            combat.randomBetween(0.85, 1.15),
    );
    const failMultiplier = completed ? 0.55 : 1.18;
    const mistakeMultiplier = 1 + wrongActionCount * 0.18 + afkCount * 0.3;
    const protectedDamage =
        base * failMultiplier * mistakeMultiplier - totalProtection * 0.32;

    return Math.max(1, Math.floor(protectedDamage));
}

function findMvp(hunt) {
    const entries = Object.entries(hunt.battle.contributions || {});

    entries.sort((a, b) => {
        return Number(b[1].totalScore || 0) - Number(a[1].totalScore || 0);
    });

    return entries[0]?.[0] || hunt.hostId;
}

function findMostMistakes(hunt) {
    const entries = Object.entries(hunt.battle.contributions || {});

    entries.sort((a, b) => {
        const bMistakes =
            Number(b[1].wrongTurns || 0) + Number(b[1].afkTurns || 0) * 2;
        const aMistakes =
            Number(a[1].wrongTurns || 0) + Number(a[1].afkTurns || 0) * 2;

        return bMistakes - aMistakes;
    });

    if (!entries[0]) {
        return null;
    }

    const mistakes =
        Number(entries[0][1].wrongTurns || 0) +
        Number(entries[0][1].afkTurns || 0) * 2;

    return mistakes > 0 ? entries[0][0] : null;
}

function splitMoney(totalMoney, memberIds) {
    const result = {};
    const count = Math.max(1, memberIds.length);
    const base = Math.floor(Number(totalMoney || 0) / count);
    let remainder = Number(totalMoney || 0) - base * count;

    for (const userId of memberIds) {
        result[userId] = base + (remainder > 0 ? 1 : 0);
        remainder -= 1;
    }

    return result;
}

function splitMaterials(materials, memberIds) {
    const result = {};

    for (const userId of memberIds) {
        result[userId] = {};
    }

    for (const [materialId, amount] of Object.entries(materials || {})) {
        for (let i = 0; i < Number(amount || 0); i++) {
            const receiver = memberIds[randomInt(0, memberIds.length - 1)];

            mergeMaterial(result[receiver], materialId, 1);
        }
    }

    return result;
}

function getSupportRewardMultiplier() {
    const raw = Number(config.cooldown?.supportRewardMultiplier ?? 0.1);

    if (!Number.isFinite(raw)) {
        return 0.1;
    }

    return Math.max(0, Math.min(1, raw));
}

function getMemberRewardMultiplier(hunt, userId) {
    const raw = hunt?.members?.[userId]?.rewardMultiplier;

    if (raw === undefined || raw === null) {
        return 1;
    }

    const multiplier = Number(raw);

    if (!Number.isFinite(multiplier)) {
        return 1;
    }

    return Math.max(0, Math.min(1, multiplier));
}

function isSupportRewardMember(hunt, userId) {
    return getMemberRewardMultiplier(hunt, userId) < 1;
}

function hasReachedDailyRunLimit(userId) {
    const user = getUser(userId);
    const stats = ensureUserHuntStats(user);

    return (
        Number(stats.dailyRuns || 0) >=
        Number(config.cooldown.maxRunsPerDay || 0)
    );
}

function scaleMoneyReward(money, multiplier) {
    const safeMoney = Math.max(0, Math.floor(Number(money || 0)));
    const safeMultiplier = Math.max(0, Math.min(1, Number(multiplier || 0)));

    if (safeMultiplier >= 1) {
        return safeMoney;
    }

    return Math.floor(safeMoney * safeMultiplier);
}

function scaleMaterialReward(materials, multiplier) {
    const safeMultiplier = Math.max(0, Math.min(1, Number(multiplier || 0)));

    if (safeMultiplier >= 1) {
        return { ...(materials || {}) };
    }

    const result = {};

    for (const [materialId, amount] of Object.entries(materials || {})) {
        const rawAmount = Math.max(0, Number(amount || 0)) * safeMultiplier;
        const wholeAmount = Math.floor(rawAmount);
        const extraChance = rawAmount - wholeAmount;
        const finalAmount = wholeAmount + (combat.roll(extraChance) ? 1 : 0);

        if (finalAmount > 0) {
            mergeMaterial(result, materialId, finalAmount);
        }
    }

    return result;
}

async function finishBattle(channel, hunt, success) {
    hunt = getHunt(hunt.id) || hunt;

    if (!hunt || hunt.status === "finished" || hunt.status === "cancelled") {
        return;
    }

    const battle = hunt.battle;

    battle.finishedAt = Date.now();
    battle.result = success ? "success" : "failed";
    hunt.status = "finished";

    clearHuntTimer(hunt.id);
    clearRoundTimer(hunt.id);

    let finalMoney =
        Number(battle.loot.money || 0) + Number(battle.teamGift.money || 0);
    const finalMaterials = { ...(battle.loot.materials || {}) };

    for (const [materialId, amount] of Object.entries(
        battle.teamGift.materials || {},
    )) {
        mergeMaterial(finalMaterials, materialId, amount);
    }

    if (!success) {
        const savedMoney = Math.floor(finalMoney * 0.25);
        const lostMoney = finalMoney - savedMoney;
        finalMoney = savedMoney;
        battle.loot.lostMoney =
            Number(battle.loot.lostMoney || 0) + Math.max(0, lostMoney);

        for (const materialId of Object.keys(finalMaterials)) {
            const material = config.materials[materialId] || {};
            const keepChance = material.rarity === "common" ? 0.35 : 0.12;

            if (!combat.roll(keepChance)) {
                mergeMaterial(
                    battle.loot.lostMaterials,
                    materialId,
                    finalMaterials[materialId],
                );
                delete finalMaterials[materialId];
            }
        }
    }

    const mvpId = findMvp(hunt);
    const mostMistakesId = findMostMistakes(hunt);

    if (success && mvpId) {
        battle.mvpBonusMoney = randomInt(
            config.rewards.mvpMoneyMin,
            config.rewards.mvpMoneyMax,
        );
    }

    const rawMoneyShare = splitMoney(finalMoney, hunt.memberIds);

    if (success && mvpId && Number(battle.mvpBonusMoney || 0) > 0) {
        rawMoneyShare[mvpId] =
            Number(rawMoneyShare[mvpId] || 0) +
            Number(battle.mvpBonusMoney || 0);
    }

    const rawMaterialShare = splitMaterials(finalMaterials, hunt.memberIds);
    const moneyShare = {};
    const materialShare = {};

    for (const userId of hunt.memberIds) {
        const rewardMultiplier = getMemberRewardMultiplier(hunt, userId);

        moneyShare[userId] = scaleMoneyReward(
            rawMoneyShare[userId] || 0,
            rewardMultiplier,
        );

        materialShare[userId] = scaleMaterialReward(
            rawMaterialShare[userId] || {},
            rewardMultiplier,
        );
    }

    finalMoney = Object.values(moneyShare).reduce((total, money) => {
        return total + Number(money || 0);
    }, 0);

    for (const userId of hunt.memberIds) {
        const money = Number(moneyShare[userId] || 0);

        if (money > 0) {
            addMoney(userId, money);
        }

        if (Object.keys(materialShare[userId] || {}).length > 0) {
            addBeastMaterials(userId, materialShare[userId]);
        }

        recordResult(userId, success);
        quest.trackQuestProgress(userId, "beast_hunt", 1);

        if (success) {
            quest.trackQuestProgress(userId, "beast_hunt_win", 1);
        }
    }

    saveHunt(hunt);
    clearHuntUsers(hunt);

    const memberLines = hunt.memberIds.map((userId) => {
        const contribution = battle.contributions[userId] || {};
        const money = Number(moneyShare[userId] || 0);
        const materials = materialShare[userId] || {};

        return (
            `<@${userId}>` +
            ` — ${getCurrencyEmoji()} ${formatMoney(money)}` +
            (Object.keys(materials).length > 0
                ? `\n${formatMaterials(materials)}`
                : "") +
            `\n✅ đúng nhịp: ${formatNumber(contribution.correctTurns || 0)} | ⚠️ lệch: ${formatNumber(contribution.wrongTurns || 0)} | 💤 AFK: ${formatNumber(contribution.afkTurns || 0)}`
        );
    });

    const finalEmbed = new EmbedBuilder()
        .setColor(success ? 0x2ecc71 : 0xe74c3c)
        .setTitle(
            success ? "🏆 SĂN YÊU THÚ THÀNH CÔNG" : "💀 TỔ ĐỘI BỊ ĐÁNH LUI",
        )
        .setDescription(
            `${hunt.beast.emoji} **${hunt.beast.name}** — ${hunt.beast.tierName}\n` +
                `🔁 Lượt đã đánh: **${formatNumber(battle.resolvedTurn || battle.turn || 0)}/${formatNumber(battle.maxTurns || 0)}**\n` +
                `🌀 Nhịp phối hợp cuối: **${battle.rhythm}/100**\n` +
                `🎒 Tiền giữ lại: **${getCurrencyEmoji()} ${formatMoney(finalMoney)}**\n` +
                `💥 Tiền đã rơi/mất: **${getCurrencyEmoji()} ${formatMoney(battle.loot.lostMoney || 0)}**\n` +
                `📦 Nguyên liệu mất:\n${formatMaterials(battle.loot.lostMaterials)}\n\n` +
                `🏅 MVP: ${mvpId ? `<@${mvpId}>` : "Không có"}` +
                (battle.mvpBonusMoney
                    ? ` — thưởng thêm ${getCurrencyEmoji()} ${formatMoney(battle.mvpBonusMoney)}`
                    : "") +
                `\n⚠️ Lệch nhịp đáng nhớ: ${mostMistakesId ? `<@${mostMistakesId}>` : "Không có"}\n\n` +
                memberLines.join("\n\n"),
        )
        .setFooter({ text: "Kênh sẽ tự xóa giống Bí Cảnh." })
        .setTimestamp();

    await channel.send({
        content: hunt.memberIds.map((userId) => `<@${userId}>`).join(" "),
        embeds: [finalEmbed],
        components: [],
    });

    for (const userId of hunt.memberIds) {
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
        const latestHunt = getHunt(hunt.id);

        if (
            !latestHunt ||
            latestHunt.status !== "finished" ||
            String(latestHunt.channelId) !== String(channel.id)
        ) {
            return;
        }

        channel.delete("Săn yêu thú đã kết thúc").catch(() => null);
    }, deleteDelayMs);
}

async function resolveBattleRound(channel, huntId) {
    let hunt = getHunt(huntId);

    if (!hunt || hunt.status !== "battle" || !hunt.battle) {
        return;
    }

    const battle = hunt.battle;

    if (
        battle.resolving === true ||
        Number(battle.resolvedTurn || 0) >= Number(battle.turn || 0)
    ) {
        return;
    }

    const selectedCount = Object.keys(battle.actions || {}).length;

    if (selectedCount <= 0 && battle.emptyRoundExtended !== true) {
        const timerKey = `round_${hunt.id}`;
        const currentTimer = activeTimers.get(timerKey);

        if (currentTimer) {
            clearTimeout(currentTimer);
            activeTimers.delete(timerKey);
        }

        const graceDurationMs = Math.max(
            10 * 1000,
            Number(config.party.graceDurationMs || 25 * 1000),
        );

        battle.emptyRoundExtended = true;
        battle.roundEndsAt = Date.now() + graceDurationMs;
        saveHunt(hunt);

        const roundMessage = battle.roundMessageId
            ? await channel.messages
                  .fetch(battle.roundMessageId)
                  .catch(() => null)
            : null;

        if (roundMessage) {
            await roundMessage
                .edit({
                    embeds: [buildBattleEmbed(hunt)],
                    components: [buildActionButtons(hunt)],
                })
                .catch(() => null);
        }

        await channel.send({
            content:
                "⏳ **Chưa ai chọn hành động.** Lượt này được gia hạn thêm vài giây, chọn nhanh kẻo bị tính AFK.",
        });

        const timer = setTimeout(() => {
            resolveBattleRound(channel, hunt.id).catch((error) => {
                console.error("[SanYeuThu Grace Round]", error);
            });
        }, graceDurationMs);

        activeTimers.set(timerKey, timer);
        return;
    }

    battle.resolving = true;
    saveHunt(hunt);

    const timerKey = `round_${hunt.id}`;
    const currentTimer = activeTimers.get(timerKey);

    if (currentTimer) {
        clearTimeout(currentTimer);
        activeTimers.delete(timerKey);
    }

    const roundMessage = battle.roundMessageId
        ? await channel.messages.fetch(battle.roundMessageId).catch(() => null)
        : null;

    let totalDamage = 0;
    let totalProtection = 0;
    let totalRhythm = 0;
    let totalLootFocus = 0;
    let wrongActionCount = 0;
    let afkCount = 0;
    const matchedRoles = new Set();
    const resultLines = [];
    const actionCounts = {};

    for (const userId of hunt.memberIds) {
        const action = battle.actions[userId];
        const contribution = battle.contributions[userId] || {
            totalScore: 0,
            correctTurns: 0,
            wrongTurns: 0,
            afkTurns: 0,
        };

        battle.contributions[userId] = contribution;

        if (!action || !ACTIONS[action]) {
            contribution.afkTurns = Number(contribution.afkTurns || 0) + 1;
            afkCount += 1;
            totalRhythm -= hunt.mode === "party" ? 10 : 7;

            if (hunt.members[userId]) {
                hunt.members[userId].afkTurns =
                    Number(hunt.members[userId].afkTurns || 0) + 1;
            }

            resultLines.push(
                `💤 <@${userId}> không hành động, đội hình hở một nhịp.`,
            );
            continue;
        }

        actionCounts[action] = Number(actionCounts[action] || 0) + 1;

        const actionResult = calculateActionResult(hunt, userId, action);

        contribution[action] = Number(contribution[action] || 0) + 1;
        contribution.totalScore =
            Number(contribution.totalScore || 0) +
            actionResult.damage +
            actionResult.protection +
            actionResult.rhythm * 2 +
            actionResult.lootFocus * 2;

        if (actionResult.matched) {
            contribution.correctTurns =
                Number(contribution.correctTurns || 0) + 1;
            matchedRoles.add(action);
        } else {
            contribution.wrongTurns = Number(contribution.wrongTurns || 0) + 1;
            wrongActionCount += 1;
        }

        totalDamage += actionResult.damage;
        totalProtection += actionResult.protection;
        totalRhythm += actionResult.rhythm;
        totalLootFocus += actionResult.lootFocus;

        resultLines.push(
            `${ACTIONS[action].emoji} <@${userId}> dùng **${ACTIONS[action].label}**` +
                (actionResult.matched ? " ✅" : " ⚠️ lệch nhịp"),
        );
    }

    const requiredRoles = battle.currentMechanic?.roles || [];
    const matchedRoleCount = requiredRoles.filter((role) =>
        matchedRoles.has(role),
    ).length;
    const completedMechanic = matchedRoleCount >= requiredRoles.length;
    const cleanSolved =
        completedMechanic && wrongActionCount <= 0 && afkCount <= 0;
    const uniqueActions = Object.keys(actionCounts).length;
    const oneButtonSpam =
        hunt.mode === "party" &&
        hunt.memberIds.length >= 2 &&
        uniqueActions === 1;

    if (oneButtonSpam) {
        totalRhythm -= 12;
        wrongActionCount += 1;
        resultLines.push(
            "💢 Cả đội dồn cùng một kiểu hành động, trận hình mất biến hóa.",
        );
    }

    if (completedMechanic) {
        totalDamage = Math.floor(totalDamage * (cleanSolved ? 1.45 : 1.18));
        totalRhythm += cleanSolved ? 12 : 5;
        battle.perfectTurns =
            Number(battle.perfectTurns || 0) + (cleanSolved ? 1 : 0);
    } else {
        totalDamage = Math.floor(totalDamage * 0.35);
        totalRhythm -= 14 + wrongActionCount * 4 + afkCount * 5;
        battle.failedTurns = Number(battle.failedTurns || 0) + 1;
    }

    const moneyLoot = rollMoneyLoot(hunt, completedMechanic, cleanSolved);
    const materialLoot = rollMaterialLoot(
        hunt,
        completedMechanic,
        cleanSolved,
        totalLootFocus,
    );

    battle.loot.money = Number(battle.loot.money || 0) + moneyLoot;

    for (const [materialId, amount] of Object.entries(materialLoot || {})) {
        mergeMaterial(battle.loot.materials, materialId, amount);
    }

    if (hunt.mode === "party" && cleanSolved && combat.roll(0.18)) {
        const giftMoney = Math.floor(
            moneyLoot * combat.randomBetween(0.12, 0.2),
        );
        battle.teamGift.money = Number(battle.teamGift.money || 0) + giftMoney;

        if (combat.roll(0.45)) {
            const entry = pickWeighted(hunt.beast.materials || []);

            if (entry) {
                mergeMaterial(battle.teamGift.materials, entry.id, 1);
            }
        }
    }

    battle.beastHp = Math.max(0, Number(battle.beastHp || 0) - totalDamage);
    battle.rhythm = Math.max(
        0,
        Math.min(100, Number(battle.rhythm || 0) + totalRhythm - 4),
    );

    const receivedDamage = calculateBeastDamage(
        hunt,
        completedMechanic,
        totalProtection,
        wrongActionCount,
        afkCount,
    );

    battle.teamHp = Math.max(0, Number(battle.teamHp || 0) - receivedDamage);
    battle.wrongActions = Number(battle.wrongActions || 0) + wrongActionCount;

    let lost = { money: 0, materials: {} };

    if (!completedMechanic || oneButtonSpam || battle.rhythm < 35) {
        const baseLoss = !completedMechanic ? 0.16 : 0.08;
        const rhythmLoss = battle.rhythm < 35 ? 0.1 : 0;
        const spamLoss = oneButtonSpam ? 0.08 : 0;

        lost = spillLoot(
            hunt,
            Math.min(0.36, baseLoss + rhythmLoss + spamLoss),
        );
    }

    if (battle.rhythm <= 0) {
        battle.teamHp = 0;
        resultLines.push(
            "💀 Nhịp phối hợp vỡ hoàn toàn, đội săn bị yêu thú đánh tan.",
        );
    }

    battle.resolvedTurn = Number(battle.turn || 0);
    saveHunt(hunt);

    if (roundMessage) {
        await roundMessage.edit({ components: [] }).catch(() => null);
    }

    await channel.send({
        embeds: [
            new EmbedBuilder()
                .setColor(completedMechanic ? 0x2ecc71 : 0xe67e22)
                .setTitle(
                    completedMechanic
                        ? "✅ PHỐI HỢP ĂN Ý"
                        : "⚠️ LỆCH NHỊP CHIẾN ĐẤU",
                )
                .setDescription(
                    `${resultLines.join("\n")}\n\n` +
                        `💥 Sát thương lên yêu thú: **-${formatNumber(totalDamage)}**\n` +
                        `❤️ Sát thương đội chịu: **-${formatNumber(receivedDamage)}**\n` +
                        `🎒 Loot mới nhặt: **${getCurrencyEmoji()} ${formatMoney(moneyLoot)}**\n` +
                        `${formatMaterials(materialLoot)}\n\n` +
                        `💸 Quà rơi do lệch nhịp:\n${buildLostText(lost)}\n\n` +
                        `🐺 Yêu thú: **${formatNumber(battle.beastHp)}/${formatNumber(battle.maxBeastHp)}**\n` +
                        `❤️ Đội săn: **${formatNumber(battle.teamHp)}/${formatNumber(battle.maxTeamHp)}**\n` +
                        `🌀 Nhịp phối hợp: **${battle.rhythm}/100**\n` +
                        `🎒 Túi hiện có: **${getCurrencyEmoji()} ${formatMoney(battle.loot.money)}**\n` +
                        `${formatMaterials(battle.loot.materials)}`,
                ),
        ],
    });

    if (battle.beastHp <= 0) {
        return finishBattle(channel, hunt, true);
    }

    if (battle.teamHp <= 0) {
        return finishBattle(channel, hunt, false);
    }

    if (battle.turn >= battle.maxTurns) {
        const success =
            battle.beastHp <= battle.maxBeastHp * 0.12 && battle.rhythm >= 25;

        return finishBattle(channel, hunt, success);
    }

    battle.turn += 1;
    battle.actions = {};
    battle.resolving = false;
    saveHunt(hunt);

    await openBattleRound(channel, hunt);
}

async function openBattleRound(channel, hunt) {
    const battle = hunt.battle;

    battle.actions = {};
    battle.emptyRoundExtended = false;
    battle.currentMechanic = pickMechanic(hunt);

    saveHunt(hunt);

    const message = await channel.send({
        content: hunt.memberIds.map((id) => `<@${id}>`).join(" "),
        embeds: [buildBattleEmbed(hunt)],
        components: [buildActionButtons(hunt)],
    });

    battle.roundMessageId = message.id;
    const actionDurationMs = Math.max(
        30 * 1000,
        Number(config.party.actionDurationMs || 60 * 1000),
    );

    battle.roundEndsAt = Date.now() + actionDurationMs;

    saveHunt(hunt);

    const oldTimer = activeTimers.get(`round_${hunt.id}`);

    if (oldTimer) {
        clearTimeout(oldTimer);
    }

    const timer = setTimeout(() => {
        resolveBattleRound(channel, hunt.id).catch((error) => {
            console.error("[SanYeuThu Resolve Round]", error);
        });
    }, actionDurationMs);

    activeTimers.set(`round_${hunt.id}`, timer);
}

async function beginBattle(channel, hunt) {
    hunt.status = "battle";
    hunt.startedAt = Date.now();
    hunt.beast = pickBeast(hunt.mode);
    hunt.battle = createBattleState(hunt);

    saveHunt(hunt);

    await channel.send({
        content: hunt.memberIds.map((id) => `<@${id}>`).join(" "),
        embeds: [
            new EmbedBuilder()
                .setColor(0xc0392b)
                .setTitle("⚔️ CUỘC SĂN BẮT ĐẦU")
                .setDescription(
                    `${hunt.beast.emoji} **${hunt.beast.name}** xuất hiện!\n` +
                        `Cấp: **${hunt.beast.tierName}**\n\n` +
                        "Đọc dấu hiệu từng lượt rồi chọn hành động. Quà trong túi chỉ là **quà tạm**, đánh lệch nhịp có thể làm rơi mất.",
                ),
        ],
    });

    await openBattleRound(channel, hunt);
}

async function startHuntDirect(channel, hunt, lobbyMessage = null) {
    let latestHunt = getHunt(hunt.id);

    if (!latestHunt || latestHunt.status !== "lobby") {
        return undefined;
    }

    hunt = latestHunt;

    if (hunt.starting === true) {
        return undefined;
    }

    for (const userId of hunt.memberIds) {
        if (!hunt.members[userId]) {
            hunt.members[userId] = {
                userId,
                power: getCombatPower(userId),
                afkTurns: 0,
                rewardMultiplier: 1,
                supportReward: false,
                supportOnly: false,
            };
        }

        const alreadySupport =
            hunt.members[userId].supportReward === true ||
            hunt.members[userId].supportOnly === true ||
            getMemberRewardMultiplier(hunt, userId) < 1;

        if (alreadySupport) {
            hunt.members[userId].rewardMultiplier =
                getSupportRewardMultiplier();
            hunt.members[userId].supportReward = true;
            hunt.members[userId].supportOnly = true;
            continue;
        }

        const available = checkRunAvailable(userId, hunt.mode);

        if (!available.ok) {
            return channel.send({
                content: `❌ <@${userId}> chưa đủ điều kiện tham gia: ${available.message}`,
            });
        }

        if (available.supportOnly === true) {
            if (String(userId) === String(hunt.hostId)) {
                return channel.send({
                    content: `❌ <@${userId}> đã hết lượt thưởng chính hôm nay, không nên làm host. Hãy để người còn lượt làm host, bạn vào hỗ trợ 10% quà.`,
                });
            }

            hunt.members[userId].rewardMultiplier =
                getSupportRewardMultiplier();
            hunt.members[userId].supportReward = true;
            hunt.members[userId].supportOnly = true;
        } else {
            hunt.members[userId].rewardMultiplier = 1;
            hunt.members[userId].supportReward = false;
            hunt.members[userId].supportOnly = false;
        }
    }
    hunt.starting = true;
    hunt.recruitmentClosed = true;
    hunt.status = "battle";
    saveHunt(hunt);

    clearHuntTimer(hunt.id);
    clearRoundTimer(hunt.id);

    for (const userId of hunt.memberIds) {
        consumeRun(
            userId,
            hunt.mode,
            hunt.members[userId]?.supportOnly === true,
        );
    }

    await lockHuntChannel(channel, hunt);

    const message =
        lobbyMessage ||
        (await channel.messages.fetch(hunt.messageId).catch(() => null));

    if (message) {
        await message
            .edit({
                content: hunt.memberIds.map((id) => `<@${id}>`).join(" "),
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xe74c3c)
                        .setTitle("🔒 KÊNH SĂN ĐÃ KHÓA")
                        .setDescription(
                            `Đội hình **${hunt.memberIds.length} người** đã khóa.\n` +
                                "Chỉ thành viên trong đội mới còn xem và chat được.",
                        ),
                ],
                components: [],
            })
            .catch(() => null);
    }

    hunt.starting = false;
    saveHunt(hunt);

    return beginBattle(channel, hunt);
}
async function expireLobby(client, huntId) {
    let hunt = getHunt(huntId);

    if (!hunt || hunt.status !== "lobby") {
        return;
    }

    if (Date.now() < Number(hunt.expiresAt || 0)) {
        return;
    }

    hunt = getHunt(huntId);

    if (!hunt || hunt.status !== "lobby") {
        return;
    }

    hunt.status = "cancelled";
    hunt.recruitmentClosed = true;
    hunt.cancelledAt = Date.now();
    clearHuntUsers(hunt);
    clearHuntTimer(hunt.id);

    const channel = await client.channels
        .fetch(hunt.channelId)
        .catch(() => null);

    if (!channel) {
        return;
    }

    await channel
        .send({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x95a5a6)
                    .setTitle("🌫️ CUỘC SĂN ĐÃ TAN")
                    .setDescription(
                        "Không đủ đạo hữu tập hợp kịp thời. Dấu vết yêu thú đã biến mất.",
                    ),
            ],
            components: [],
        })
        .catch(() => null);

    setTimeout(() => {
        const latestHunt = getHunt(huntId);

        if (
            !latestHunt ||
            latestHunt.status !== "cancelled" ||
            String(latestHunt.channelId) !== String(channel.id)
        ) {
            return;
        }

        channel.delete("Săn yêu thú hết thời gian tập hợp").catch(() => null);
    }, 10 * 1000);
}

async function createHunt(interaction, mode) {
    if (!config.enabled) {
        return interaction.reply({
            content: "❌ Săn yêu thú đang tạm đóng.",
            ephemeral: true,
        });
    }

    const userId = String(interaction.user.id);
    const blockingHunt = await getBlockingActiveHunt(
        userId,
        interaction.client,
    );

    if (blockingHunt) {
        return interaction.reply({
            content: "❌ Bạn đang ở một cuộc săn yêu thú khác.",
            ephemeral: true,
        });
    }

    const available = checkRunAvailable(userId, mode);

    if (!available.ok) {
        return interaction.reply({
            content: `❌ ${available.message}`,
            ephemeral: true,
        });
    }

    const power = getCombatPower(userId);
    const huntId = createHuntId();
    const hunt = {
        id: huntId,
        guildId: interaction.guildId,
        hostId: userId,
        mode,
        status: "lobby",
        recruitmentClosed: false,
        createdAt: Date.now(),
        expiresAt: Date.now() + config.party.lobbyDurationMs,
        channelId: null,
        messageId: null,
        minMembers: mode === "solo" ? 1 : config.party.minMembers,
        maxMembers: mode === "solo" ? 1 : config.party.maxMembers,
        memberIds: [userId],
        members: {
            [userId]: {
                userId,
                power,
                afkTurns: 0,
                rewardMultiplier: 1,
                supportReward: false,
            },
        },
        beast: null,
        battle: null,
    };

    await interaction.deferReply({
        ephemeral: true,
    });

    const channel = await createHuntChannel(interaction, hunt);

    await interaction.editReply({
        content: `✅ Đã mở kênh săn yêu thú: ${channel}`,
    });

    if (mode === "solo") {
        return startHuntDirect(channel, hunt);
    }

    const timer = setTimeout(() => {
        expireLobby(interaction.client, hunt.id).catch((error) => {
            console.error("[SanYeuThu Expire Lobby]", error);
        });
    }, config.party.lobbyDurationMs);

    activeTimers.set(hunt.id, timer);

    return hunt;
}

async function start(interaction) {
    const mode = interaction.options.getString("chedo") || "solo";
    const safeMode = mode === "todoi" || mode === "party" ? "party" : "solo";

    return createHunt(interaction, safeMode);
}

async function materials(interaction) {
    const userId = String(interaction.user.id);
    const materialsData = getBeastMaterials(userId);
    const lines = Object.entries(config.materials).map(
        ([materialId, material]) => {
            return `${material.emoji} **${material.name}**: ${formatNumber(materialsData[materialId] || 0)}`;
        },
    );

    return interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(0x16a085)
                .setTitle("📦 KHO NGUYÊN LIỆU YÊU THÚ")
                .setDescription(
                    `${lines.join("\n")}\n\n` +
                        "Nguyên liệu này đang tách riêng khỏi kho đồ. Bản sau có thể dùng cho luyện đan, rèn pháp bảo hoặc bán nguyên liệu.",
                )
                .setTimestamp(),
        ],
        ephemeral: true,
    });
}

async function joinHunt(interaction, hunt) {
    const userId = String(interaction.user.id);

    if (hunt.status !== "lobby" || hunt.recruitmentClosed === true) {
        return interaction.reply({
            content: "❌ Cuộc săn đã khóa đội hình.",
            ephemeral: true,
        });
    }

    if (hunt.memberIds.includes(userId)) {
        return interaction.reply({
            content: "❌ Bạn đã ở trong tổ đội.",
            ephemeral: true,
        });
    }

    if (hunt.memberIds.length >= hunt.maxMembers) {
        return interaction.reply({
            content: "❌ Tổ đội đã đủ người.",
            ephemeral: true,
        });
    }

    const blockingHunt = await getBlockingActiveHunt(
        userId,
        interaction.client,
    );

    if (blockingHunt) {
        return interaction.reply({
            content: "❌ Bạn đang ở một cuộc săn yêu thú khác.",
            ephemeral: true,
        });
    }

    const available = checkRunAvailable(userId, "party");
    const joinsAsSupport =
        available.supportOnly === true || hasReachedDailyRunLimit(userId);

    if (!available.ok && !joinsAsSupport) {
        return interaction.reply({
            content: `❌ ${available.message}`,
            ephemeral: true,
        });
    }

    const power = getCombatPower(userId);
    const rewardMultiplier = joinsAsSupport ? getSupportRewardMultiplier() : 1;

    hunt.memberIds.push(userId);
    hunt.members[userId] = {
        userId,
        power,
        afkTurns: 0,
        rewardMultiplier,
        supportReward: joinsAsSupport,
        supportOnly: joinsAsSupport,
    };

    saveHunt(hunt);

    await interaction.channel.permissionOverwrites.edit(userId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
    });

    const message = await interaction.channel.messages
        .fetch(hunt.messageId)
        .catch(() => null);

    if (message) {
        await message
            .edit({
                embeds: [buildLobbyEmbed(hunt)],
                components: [buildLobbyButtons(hunt)],
            })
            .catch(() => null);
    }

    return interaction.reply({
        content:
            `✅ Đã tham gia tổ đội săn yêu thú. Lực chiến: **${formatNumber(power)}**` +
            (available.supportOnly
                ? "\n⚠️ Bạn đã hết lượt thưởng chính, lần này chỉ nhận 10% quà hỗ trợ."
                : ""),
        ephemeral: true,
    });
}

async function leaveHunt(interaction, hunt) {
    const userId = String(interaction.user.id);

    if (hunt.status !== "lobby" || hunt.recruitmentClosed === true) {
        return interaction.reply({
            content: "❌ Cuộc săn đã khóa.",
            ephemeral: true,
        });
    }

    if (userId === hunt.hostId) {
        return interaction.reply({
            content:
                "❌ Host không thể rời đội. Hãy để lobby hết giờ hoặc không bấm bắt đầu.",
            ephemeral: true,
        });
    }

    if (!hunt.memberIds.includes(userId)) {
        return interaction.reply({
            content: "❌ Bạn chưa ở trong tổ đội.",
            ephemeral: true,
        });
    }

    hunt.memberIds = hunt.memberIds.filter((id) => id !== userId);
    delete hunt.members[userId];

    updateBeastHuntState((state) => {
        delete state.activeUserHunts[userId];
        state.hunts[hunt.id] = hunt;
    });

    await interaction.channel.permissionOverwrites
        .delete(userId)
        .catch(() => null);

    const message = await interaction.channel.messages
        .fetch(hunt.messageId)
        .catch(() => null);

    if (message) {
        await message
            .edit({
                embeds: [buildLobbyEmbed(hunt)],
                components: [buildLobbyButtons(hunt)],
            })
            .catch(() => null);
    }

    return interaction.reply({
        content: "✅ Bạn đã rời tổ đội săn yêu thú.",
        ephemeral: true,
    });
}

async function startHunt(interaction, hunt) {
    if (String(interaction.user.id) !== String(hunt.hostId)) {
        return interaction.reply({
            content: "❌ Chỉ host được bắt đầu cuộc săn.",
            ephemeral: true,
        });
    }

    if (hunt.memberIds.length < hunt.minMembers) {
        return interaction.reply({
            content: `❌ Cần ít nhất ${hunt.minMembers} người để săn tổ đội.`,
            ephemeral: true,
        });
    }

    await interaction.deferUpdate().catch((error) => {
        if (error?.code === 10062 || error?.code === 40060) {
            return null;
        }

        throw error;
    });

    return startHuntDirect(interaction.channel, hunt, interaction.message);
}

async function selectAction(interaction, hunt, action) {
    const userId = String(interaction.user.id);

    if (!hunt || hunt.status !== "battle" || !hunt.battle) {
        return interaction.reply({
            content: "❌ Cuộc săn chưa bắt đầu hoặc đã kết thúc.",
            ephemeral: true,
        });
    }

    if (!hunt.memberIds.includes(userId)) {
        return interaction.reply({
            content: "❌ Bạn không thuộc đội săn này.",
            ephemeral: true,
        });
    }

    if (!ACTIONS[action]) {
        return interaction.reply({
            content: "❌ Hành động không hợp lệ.",
            ephemeral: true,
        });
    }

    if (
        hunt.battle.roundMessageId &&
        interaction.message?.id &&
        String(interaction.message.id) !== String(hunt.battle.roundMessageId)
    ) {
        return interaction.reply({
            content: "❌ Nút này thuộc lượt cũ rồi. Hãy bấm ở lượt mới nhất.",
            ephemeral: true,
        });
    }

    if (hunt.battle.resolving === true) {
        return interaction.reply({
            content: "⏳ Lượt này đang xử lý kết quả, không thể chọn nữa.",
            ephemeral: true,
        });
    }

    hunt.battle.actions[userId] = action;
    saveHunt(hunt);

    const selectedCount = Object.keys(hunt.battle.actions || {}).length;

    await interaction.reply({
        content: `${ACTIONS[action].emoji} Bạn đã chọn **${ACTIONS[action].label}**. (${selectedCount}/${hunt.memberIds.length})`,
        ephemeral: true,
    });

    if (selectedCount >= hunt.memberIds.length) {
        const channel = interaction.channel;

        return resolveBattleRound(channel, hunt.id);
    }

    return undefined;
}

async function handleButton(interaction) {
    if (!interaction.customId.startsWith("syt_")) {
        return undefined;
    }

    const parts = interaction.customId.split("_");
    const action = parts[1];

    if (action === "act") {
        const battleAction = parts[2];
        const huntId = parts.slice(3).join("_");
        const hunt = getHunt(huntId);

        if (!hunt) {
            return interaction.reply({
                content: "❌ Cuộc săn không tồn tại.",
                ephemeral: true,
            });
        }

        return selectAction(interaction, hunt, battleAction);
    }

    const huntId = parts.slice(2).join("_");
    const hunt = getHunt(huntId);

    if (!hunt) {
        return interaction.reply({
            content: "❌ Cuộc săn không tồn tại.",
            ephemeral: true,
        });
    }

    if (action === "join") {
        return joinHunt(interaction, hunt);
    }

    if (action === "leave") {
        return leaveHunt(interaction, hunt);
    }

    if (action === "start") {
        return startHunt(interaction, hunt);
    }

    return undefined;
}

async function recover(client) {
    const state = getBeastHuntState();

    for (const hunt of Object.values(state.hunts || {})) {
        if (
            !hunt ||
            !hunt.channelId ||
            ["finished", "cancelled"].includes(hunt.status)
        ) {
            continue;
        }

        const channel = await client.channels
            .fetch(hunt.channelId)
            .catch(() => null);

        if (!channel) {
            hunt.status = "cancelled";
            clearHuntUsers(hunt);
            saveHunt(hunt);
            continue;
        }

        if (hunt.status === "lobby") {
            const remaining = Number(hunt.expiresAt || 0) - Date.now();

            if (remaining <= 0) {
                expireLobby(client, hunt.id).catch((error) => {
                    console.error("[SanYeuThu Recover Expire]", error);
                });
            } else {
                const timer = setTimeout(() => {
                    expireLobby(client, hunt.id).catch((error) => {
                        console.error("[SanYeuThu Recover Expire]", error);
                    });
                }, remaining);

                activeTimers.set(hunt.id, timer);
            }
        }

        if (hunt.status === "battle" && hunt.battle) {
            await lockHuntChannel(channel, hunt).catch(() => null);

            const remaining = Number(hunt.battle.roundEndsAt || 0) - Date.now();
            const timerKey = `round_${hunt.id}`;

            if (remaining <= 0) {
                resolveBattleRound(channel, hunt.id).catch((error) => {
                    console.error("[SanYeuThu Recover Round]", error);
                });
            } else {
                const timer = setTimeout(() => {
                    resolveBattleRound(channel, hunt.id).catch((error) => {
                        console.error("[SanYeuThu Recover Round]", error);
                    });
                }, remaining);

                activeTimers.set(timerKey, timer);
            }
        }
    }
}

module.exports = {
    start,
    materials,
    handleButton,
    recover,
};
