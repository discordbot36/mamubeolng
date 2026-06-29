const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
} = require("discord.js");

const db = require("./database");

const events = new Map();
const timers = new Map();

const MAX_TEAM_SIZE = 4;
const MAX_TEAMS = 6;
const LOBBY_MS = 90_000;
const ROUND_MS = 40_000;
const FINAL_MS = 45_000;
const ROUND_MAX = 3;

const PATHS = {
    linh: [
        "🌿",
        "Linh Khí Lộ",
        "Dễ gặp cơ duyên, nhưng ồn.",
        { clue: 2, noise: 12 },
    ],
    am: [
        "🕶️",
        "Âm Ảnh Lộ",
        "Tăng mưu kế, hợp đội yếu rình thời cơ.",
        { trick: 22, noise: -8 },
    ],
    tran: [
        "🪨",
        "Cổ Trận Lộ",
        "Tăng trận pháp, dùng để thủ/bẫy.",
        { formation: 22, clue: 1 },
    ],
    huyet: [
        "🩸",
        "Huyết Sát Lộ",
        "Tăng chiến lực, nhưng mệt và ồn.",
        { combat: 22, fatigue: 12, noise: 10 },
    ],
    khong: ["🌀", "Không Gian Nứt", "Random mạnh, có thể lời hoặc lạc.", null],
};

const FINDER = {
    fast: [
        "⚡",
        "Khai thác nhanh",
        "Ăn nhiều nếu không ai tới kịp, yếu khi bị tranh.",
    ],
    defend: ["🛡️", "Dựng trận", "Khắc chế lao tới, hợp đội trận pháp."],
    hide: ["🕶️", "Che giấu", "Làm đội khác khó tìm đúng vị trí."],
    bait: ["🩸", "Dụ địch vào bẫy", "Khắc chế đội lao tới tranh."],
    retreat: ["🚪", "Rút lui", "Ăn ít nhưng chắc, sợ bị mai phục."],
};

const REACT = {
    attack: ["⚔️", "Lao tới", "Nhanh, hợp đội mạnh, dễ dính bẫy."],
    sneak: ["🕶️", "Âm thầm", "Chậm hơn, mạnh khi nhiều đội đánh nhau."],
    ambush: ["🪤", "Mai phục", "Chờ đội ôm bảo vật đi ra."],
    ignore: ["🙏", "Bỏ qua", "An toàn, nhận quà nhỏ."],
};

function rnd(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function fmt(n) {
    return Number(n || 0).toLocaleString("vi-VN");
}

function tag(id) {
    return `<@${id}>`;
}

function eventKey(guildId, channelId) {
    return `${guildId}_${channelId}`;
}

function findEvent(id) {
    return [...events.values()].find((event) => event.id === id) || null;
}

function getUserTeam(event, userId) {
    return (
        event.teams.find((team) => {
            return team.members.includes(String(userId));
        }) || null
    );
}

function pickRandom(list, count) {
    const copy = [...list];
    const result = [];

    while (copy.length > 0 && result.length < count) {
        const index = rnd(0, copy.length - 1);
        result.push(copy.splice(index, 1)[0]);
    }

    return result;
}

function buildBaseStats(memberIds) {
    let combat = 35;
    let trick = 35;
    let formation = 35;
    let noise = 20;

    for (const id of memberIds) {
        const user = db.getUser(id);
        const profile = user?.tuTienProfile || {};
        const realm = Number(profile.realmIndex || 0);
        const stage = Number(profile.stage || 1);
        const equipped = user?.equippedWeaponUid ? 1 : 0;

        const power = realm * 12 + stage * 2 + equipped * 8;

        combat += power * 0.45;
        trick += Math.max(0, 14 - realm * 2);
        formation += equipped ? 5 : 0;
        noise += power * 0.18;
    }

    return {
        combat: Math.round(combat),
        trick: Math.round(trick),
        formation: Math.round(formation),
        luck: rnd(20, 60),
        noise: Math.round(noise + Math.max(0, memberIds.length - 2) * 4),
        fatigue: 0,
        clue: 0,
    };
}

function statsLine(team) {
    return (
        `⚔️ ${team.stats.combat} | ` +
        `🕶️ ${team.stats.trick} | ` +
        `🪤 ${team.stats.formation} | ` +
        `🍀 ${team.stats.luck} | ` +
        `🔊 ${team.stats.noise} | ` +
        `🧩 ${team.stats.clue} | ` +
        `😵 ${team.stats.fatigue}`
    );
}

function buildLobbyText(event) {
    const teamsText =
        event.teams.length > 0
            ? event.teams
                  .map((team) => {
                      return `**Đội ${team.no}** (${team.members.length}/${MAX_TEAM_SIZE}): ${team.members.map(tag).join(" ")}`;
                  })
                  .join("\n")
            : "Chưa có đội nào.";

    return (
        "🌌 **BÍ CẢNH TRUYỀN THỪA MỞ RA**\n\n" +
        `⏳ Lập đội trong **${LOBBY_MS / 1000}s**. Mỗi đội tối đa **${MAX_TEAM_SIZE} người**.\n` +
        "Bot sẽ tạo kênh riêng cho từng đội để bàn mưu.\n\n" +
        `${teamsText}\n\n` +
        "Mỗi round chỉ chọn 1 trong 3 đường. Không quá đau đầu, nhưng chọn ngu vẫn ăn nghiệp."
    );
}

function buildLobbyRows(event) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`duyen_create_${event.id}`)
                .setEmoji("🧍")
                .setLabel("Tạo đội")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId(`duyen_join_${event.id}`)
                .setEmoji("🤝")
                .setLabel("Vào đội")
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId(`duyen_solo_${event.id}`)
                .setEmoji("🚪")
                .setLabel("Đi solo")
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId(`duyen_start_${event.id}`)
                .setEmoji("🔒")
                .setLabel("Bắt đầu sớm")
                .setStyle(ButtonStyle.Danger),
        ),
    ];
}

function buildPathRows(event, team) {
    return [
        new ActionRowBuilder().addComponents(
            ...team.pathOptions.map((pathId) => {
                const path = PATHS[pathId];

                return new ButtonBuilder()
                    .setCustomId(
                        `duyen_path_${event.id}_${team.id}_${event.round}_${pathId}`,
                    )
                    .setEmoji(path[0])
                    .setLabel(path[1])
                    .setStyle(ButtonStyle.Primary);
            }),
        ),
    ];
}

function buildFinalRows(event, team, isFinder) {
    const source = isFinder ? FINDER : REACT;
    const prefix = isFinder ? "finder" : "react";

    return [
        new ActionRowBuilder().addComponents(
            ...Object.entries(source).map(([id, option]) => {
                return new ButtonBuilder()
                    .setCustomId(`duyen_${prefix}_${event.id}_${team.id}_${id}`)
                    .setEmoji(option[0])
                    .setLabel(option[1])
                    .setStyle(
                        id === "attack" || id === "bait"
                            ? ButtonStyle.Danger
                            : ButtonStyle.Primary,
                    );
            }),
        ),
    ];
}

function pickVoteWinner(team, bucket, fallbackIds) {
    const votes = team.votes[bucket] || {};
    const counts = {};

    for (const vote of Object.values(votes)) {
        counts[vote] = Number(counts[vote] || 0) + 1;
    }

    return [...fallbackIds].sort((a, b) => {
        return Number(counts[b] || 0) - Number(counts[a] || 0);
    })[0];
}

async function createCategory(interaction, event) {
    const category = await interaction.guild.channels
        .create({
            name: `🌌 Bí Cảnh ${event.shortId}`,
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
                {
                    id: interaction.guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: interaction.client.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ManageChannels,
                        PermissionFlagsBits.ReadMessageHistory,
                    ],
                },
            ],
        })
        .catch(() => null);

    if (category) {
        event.categoryId = category.id;
    }
}

async function createTeamChannel(event, team) {
    const overwrites = [
        {
            id: event.guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
        },
        {
            id: event.guild.client.user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ReadMessageHistory,
            ],
        },
        ...team.members.map((id) => {
            return {
                id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                ],
            };
        }),
    ];

    const channel = await event.guild.channels.create({
        name: `duyen-doi-${team.no}`,
        type: ChannelType.GuildText,
        parent: event.categoryId || null,
        permissionOverwrites: overwrites,
    });

    team.channelId = channel.id;

    await channel.send(
        `🌌 **ĐỘI ${team.no} TIẾN VÀO BÍ CẢNH**\n` +
            `Thành viên: ${team.members.map(tag).join(" ")}\n\n` +
            `${statsLine(team)}\n\n` +
            "Bàn ở đây rồi vote. Kênh này chỉ đội bạn thấy.",
    );
}

async function refreshLobby(event) {
    await event.message
        ?.edit({
            content: buildLobbyText(event),
            components: event.status === "lobby" ? buildLobbyRows(event) : [],
        })
        .catch(() => undefined);
}

async function start(interaction) {
    const key = eventKey(interaction.guildId, interaction.channelId);

    if (events.has(key)) {
        return interaction.reply({
            content: "❌ Kênh này đang có Bí Cảnh rồi.",
            ephemeral: true,
        });
    }

    const event = {
        id: `${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
        shortId: Math.random().toString(36).slice(2, 6).toUpperCase(),
        key,
        guild: interaction.guild,
        channelId: interaction.channelId,
        status: "lobby",
        teams: [],
        round: 0,
        finderId: null,
        message: null,
        categoryId: null,
    };

    events.set(key, event);

    await createCategory(interaction, event);

    await interaction.reply({
        content: buildLobbyText(event),
        components: buildLobbyRows(event),
    });

    event.message = await interaction.fetchReply();

    timers.set(
        `lobby_${event.id}`,
        setTimeout(() => {
            beginExplore(event).catch((error) => {
                console.error("[Duyen beginExplore]", error);
            });
        }, LOBBY_MS),
    );

    return undefined;
}

async function createTeam(interaction, event, solo = false) {
    const userId = String(interaction.user.id);

    if (event.status !== "lobby") {
        return interaction.reply({
            content: "❌ Bí cảnh đã bắt đầu.",
            ephemeral: true,
        });
    }

    if (getUserTeam(event, userId)) {
        return interaction.reply({
            content: "❌ Bạn đã có đội.",
            ephemeral: true,
        });
    }

    if (event.teams.length >= MAX_TEAMS) {
        return interaction.reply({
            content: "❌ Đã đủ số đội.",
            ephemeral: true,
        });
    }

    const team = {
        id: `team${event.teams.length + 1}`,
        no: event.teams.length + 1,
        leaderId: userId,
        members: [userId],
        locked: solo,
        stats: buildBaseStats([userId]),
        votes: {},
        choices: {},
        pathOptions: [],
        finalChoice: null,
        finalScore: 0,
        channelId: null,
    };

    event.teams.push(team);

    await createTeamChannel(event, team);
    await refreshLobby(event);

    return interaction.reply({
        content: solo
            ? `🚪 Bạn đi solo ở **Đội ${team.no}**.`
            : `🧍 Bạn đã tạo **Đội ${team.no}**.`,
        ephemeral: true,
    });
}

async function showJoinMenu(interaction, event) {
    const userId = String(interaction.user.id);

    if (event.status !== "lobby") {
        return interaction.reply({
            content: "❌ Bí cảnh đã bắt đầu.",
            ephemeral: true,
        });
    }

    if (getUserTeam(event, userId)) {
        return interaction.reply({
            content: "❌ Bạn đã có đội.",
            ephemeral: true,
        });
    }

    const openTeams = event.teams.filter((team) => {
        return !team.locked && team.members.length < MAX_TEAM_SIZE;
    });

    if (openTeams.length <= 0) {
        return interaction.reply({
            content: "❌ Chưa có đội trống. Tạo đội mới hoặc đi solo.",
            ephemeral: true,
        });
    }

    return interaction.reply({
        content: "Chọn đội muốn vào:",
        ephemeral: true,
        components: [
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`duyen_joinselect_${event.id}`)
                    .setPlaceholder("Chọn đội")
                    .addOptions(
                        openTeams.map((team) => {
                            return {
                                label: `Đội ${team.no} (${team.members.length}/${MAX_TEAM_SIZE})`,
                                value: team.id,
                            };
                        }),
                    ),
            ),
        ],
    });
}

async function joinTeam(interaction, event, teamId) {
    const userId = String(interaction.user.id);
    const team = event.teams.find((item) => item.id === teamId);

    if (!team || team.locked || team.members.length >= MAX_TEAM_SIZE) {
        return interaction.reply({
            content: "❌ Đội này không vào được.",
            ephemeral: true,
        });
    }

    if (getUserTeam(event, userId)) {
        return interaction.reply({
            content: "❌ Bạn đã có đội.",
            ephemeral: true,
        });
    }

    team.members.push(userId);
    team.stats = buildBaseStats(team.members);

    const channel = await event.guild.channels
        .fetch(team.channelId)
        .catch(() => null);

    await channel?.permissionOverwrites
        .edit(userId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
        })
        .catch(() => undefined);

    await channel
        ?.send(
            `🤝 ${tag(userId)} đã vào đội. Cơ duyên bắt đầu có mùi chia phần.`,
        )
        .catch(() => undefined);

    await refreshLobby(event);

    return interaction.update({
        content: `✅ Bạn đã vào **Đội ${team.no}**.`,
        components: [],
    });
}
async function beginExplore(event) {
    if (event.status !== "lobby") {
        return;
    }

    const timer = timers.get(`lobby_${event.id}`);

    if (timer) {
        clearTimeout(timer);
        timers.delete(`lobby_${event.id}`);
    }

    if (event.teams.length <= 0) {
        events.delete(event.key);

        await event.message
            ?.edit({
                content:
                    "🌌 Bí cảnh đóng lại vì không ai vào. Cơ duyên không chờ người lười.",
                components: [],
            })
            .catch(() => undefined);

        return cleanup(event, 15_000);
    }

    event.status = "explore";

    await refreshLobby(event);

    await event.message
        ?.reply(
            `🔒 Bí cảnh đã khóa. **${event.teams.length} đội** tiến vào động phủ.`,
        )
        .catch(() => undefined);

    return startRound(event, 1);
}

async function startRound(event, round) {
    event.round = round;

    for (const team of event.teams) {
        team.pathOptions = pickRandom(Object.keys(PATHS), 3);
        team.votes[`r${round}`] = {};

        const lines = team.pathOptions
            .map((id) => {
                const path = PATHS[id];
                return `${path[0]} **${path[1]}** — ${path[2]}`;
            })
            .join("\n");

        const channel = await event.guild.channels
            .fetch(team.channelId)
            .catch(() => null);

        await channel
            ?.send({
                content:
                    `🕯️ **ROUND ${round}/${ROUND_MAX} — Chọn hướng đi**\n\n` +
                    `${lines}\n\n` +
                    statsLine(team),
                components: buildPathRows(event, team),
            })
            .catch(() => undefined);
    }

    timers.set(
        `round_${event.id}_${round}`,
        setTimeout(() => {
            resolveRound(event).catch((error) => {
                console.error("[Duyen resolveRound]", error);
            });
        }, ROUND_MS),
    );
}

function applyPath(team, pathId) {
    if (pathId === "khong") {
        const roll = rnd(1, 100);

        if (roll <= 35) {
            team.stats.clue += 3;
            team.stats.trick += 8;
            return "🌀 Không Gian Nứt đưa đội tới gần mạch cơ duyên. Hơi có mùi buff bẩn.";
        }

        if (roll <= 70) {
            team.stats.combat += 10;
            team.stats.formation += 10;
            return "🌀 Không Gian Nứt không giàu nhưng cũng không ngu.";
        }

        team.stats.fatigue += 18;
        team.stats.noise += 12;
        return "🌀 Đội bị Không Gian Nứt dắt đi vòng, hơi mất mặt.";
    }

    const path = PATHS[pathId];
    const effect = path[3];

    team.stats.combat += effect.combat || 0;
    team.stats.trick += effect.trick || 0;
    team.stats.formation += effect.formation || 0;
    team.stats.noise += effect.noise || 0;
    team.stats.fatigue += effect.fatigue || 0;
    team.stats.clue += effect.clue || 0;

    return `${path[0]} Đội chọn **${path[1]}**. ${path[2]}`;
}

async function resolveRound(event) {
    const timerKey = `round_${event.id}_${event.round}`;
    const timer = timers.get(timerKey);

    if (timer) {
        clearTimeout(timer);
        timers.delete(timerKey);
    }

    for (const team of event.teams) {
        const chosen = pickVoteWinner(
            team,
            `r${event.round}`,
            team.pathOptions,
        );

        team.choices[`r${event.round}`] = chosen;

        const text = applyPath(team, chosen);

        team.stats.noise = Math.max(0, Math.round(team.stats.noise));

        const channel = await event.guild.channels
            .fetch(team.channelId)
            .catch(() => null);

        await channel
            ?.send(`${text}\n\n${statsLine(team)}`)
            .catch(() => undefined);
    }

    if (event.round >= ROUND_MAX) {
        return discoverOpportunity(event);
    }

    return startRound(event, event.round + 1);
}

function getDiscoveryScore(team) {
    return (
        team.stats.clue * 30 +
        team.stats.trick * 0.8 +
        team.stats.luck * 0.7 -
        team.stats.noise * 0.35 -
        team.stats.fatigue * 0.25 +
        rnd(1, 55)
    );
}

async function discoverOpportunity(event) {
    event.status = "final";

    let finder = event.teams[0];
    let bestScore = -999999;

    for (const team of event.teams) {
        team.discoveryScore = Math.round(getDiscoveryScore(team));

        if (team.discoveryScore > bestScore) {
            bestScore = team.discoveryScore;
            finder = team;
        }
    }

    event.finderId = finder.id;

    for (const team of event.teams) {
        team.votes.final = {};

        const isFinder = team.id === finder.id;
        const source = isFinder ? FINDER : REACT;

        const lines = Object.values(source)
            .map((option) => {
                return `${option[0]} **${option[1]}** — ${option[2]}`;
            })
            .join("\n");

        const channel = await event.guild.channels
            .fetch(team.channelId)
            .catch(() => null);

        await channel
            ?.send({
                content: isFinder
                    ? `🌌 **ĐỘI BẠN PHÁT HIỆN LINH TRÌ TRUYỀN THỪA**\n\n${lines}\n\nTìm được chưa chắc giữ được. Vote cách xử lý.`
                    : `⚠️ **DAO ĐỘNG LINH KHÍ CỰC MẠNH**\n\nCó đội đã phát hiện Cơ Duyên Lớn. Vị trí chưa rõ.\n\n${lines}`,
                components: buildFinalRows(event, team, isFinder),
            })
            .catch(() => undefined);
    }

    await event.message
        ?.reply(
            "⚠️ Dao động linh khí cực mạnh! Một đội đã phát hiện Cơ Duyên Lớn.",
        )
        .catch(() => undefined);

    timers.set(
        `final_${event.id}`,
        setTimeout(() => {
            resolveFinal(event).catch((error) => {
                console.error("[Duyen resolveFinal]", error);
            });
        }, FINAL_MS),
    );
}
async function startRound(event, round) {
    event.round = round;

    for (const team of event.teams) {
        team.pathOptions = pickRandom(Object.keys(PATHS), 3);
        team.votes[`r${round}`] = {};

        const lines = team.pathOptions
            .map((id) => {
                const path = PATHS[id];
                return `${path[0]} **${path[1]}** — ${path[2]}`;
            })
            .join("\n");

        const channel = await event.guild.channels
            .fetch(team.channelId)
            .catch(() => null);

        await channel
            ?.send({
                content:
                    `🕯️ **ROUND ${round}/${ROUND_MAX} — Chọn hướng đi**\n\n` +
                    `${lines}\n\n` +
                    statsLine(team),
                components: buildPathRows(event, team),
            })
            .catch(() => undefined);
    }

    timers.set(
        `round_${event.id}_${round}`,
        setTimeout(() => {
            resolveRound(event).catch((error) => {
                console.error("[Duyen resolveRound]", error);
            });
        }, ROUND_MS),
    );
}

function applyPath(team, pathId) {
    if (pathId === "khong") {
        const roll = rnd(1, 100);

        if (roll <= 35) {
            team.stats.clue += 3;
            team.stats.trick += 8;
            return "🌀 Không Gian Nứt đưa đội tới gần mạch cơ duyên. Hơi có mùi buff bẩn.";
        }

        if (roll <= 70) {
            team.stats.combat += 10;
            team.stats.formation += 10;
            return "🌀 Không Gian Nứt không giàu nhưng cũng không ngu.";
        }

        team.stats.fatigue += 18;
        team.stats.noise += 12;
        return "🌀 Đội bị Không Gian Nứt dắt đi vòng, hơi mất mặt.";
    }

    const path = PATHS[pathId];
    const effect = path[3];

    team.stats.combat += effect.combat || 0;
    team.stats.trick += effect.trick || 0;
    team.stats.formation += effect.formation || 0;
    team.stats.noise += effect.noise || 0;
    team.stats.fatigue += effect.fatigue || 0;
    team.stats.clue += effect.clue || 0;

    return `${path[0]} Đội chọn **${path[1]}**. ${path[2]}`;
}

async function resolveRound(event) {
    const timerKey = `round_${event.id}_${event.round}`;
    const timer = timers.get(timerKey);

    if (timer) {
        clearTimeout(timer);
        timers.delete(timerKey);
    }

    for (const team of event.teams) {
        const chosen = pickVoteWinner(
            team,
            `r${event.round}`,
            team.pathOptions,
        );

        team.choices[`r${event.round}`] = chosen;

        const text = applyPath(team, chosen);

        team.stats.noise = Math.max(0, Math.round(team.stats.noise));

        const channel = await event.guild.channels
            .fetch(team.channelId)
            .catch(() => null);

        await channel
            ?.send(`${text}\n\n${statsLine(team)}`)
            .catch(() => undefined);
    }

    if (event.round >= ROUND_MAX) {
        return discoverOpportunity(event);
    }

    return startRound(event, event.round + 1);
}

function getDiscoveryScore(team) {
    return (
        team.stats.clue * 30 +
        team.stats.trick * 0.8 +
        team.stats.luck * 0.7 -
        team.stats.noise * 0.35 -
        team.stats.fatigue * 0.25 +
        rnd(1, 55)
    );
}

async function discoverOpportunity(event) {
    event.status = "final";

    let finder = event.teams[0];
    let bestScore = -999999;

    for (const team of event.teams) {
        team.discoveryScore = Math.round(getDiscoveryScore(team));

        if (team.discoveryScore > bestScore) {
            bestScore = team.discoveryScore;
            finder = team;
        }
    }

    event.finderId = finder.id;

    for (const team of event.teams) {
        team.votes.final = {};

        const isFinder = team.id === finder.id;
        const source = isFinder ? FINDER : REACT;

        const lines = Object.values(source)
            .map((option) => {
                return `${option[0]} **${option[1]}** — ${option[2]}`;
            })
            .join("\n");

        const channel = await event.guild.channels
            .fetch(team.channelId)
            .catch(() => null);

        await channel
            ?.send({
                content: isFinder
                    ? `🌌 **ĐỘI BẠN PHÁT HIỆN LINH TRÌ TRUYỀN THỪA**\n\n${lines}\n\nTìm được chưa chắc giữ được. Vote cách xử lý.`
                    : `⚠️ **DAO ĐỘNG LINH KHÍ CỰC MẠNH**\n\nCó đội đã phát hiện Cơ Duyên Lớn. Vị trí chưa rõ.\n\n${lines}`,
                components: buildFinalRows(event, team, isFinder),
            })
            .catch(() => undefined);
    }

    await event.message
        ?.reply(
            "⚠️ Dao động linh khí cực mạnh! Một đội đã phát hiện Cơ Duyên Lớn.",
        )
        .catch(() => undefined);

    timers.set(
        `final_${event.id}`,
        setTimeout(() => {
            resolveFinal(event).catch((error) => {
                console.error("[Duyen resolveFinal]", error);
            });
        }, FINAL_MS),
    );
}
