const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
} = require("discord.js");

const db = require("./database");
const duyenConfig = require("./config/duyen");
const duyenPuzzles = require("./config/duyenPuzzles");
const shop = require("./config/shop");
const weaponConfig = require("./weapon");
const adminConfig = require("./config/admin");
const events = new Map();
const timers = new Map();
const activePuzzles = new Map();
const activeBosses = new Map();
const MAX_TEAM_SIZE = 4;
const MAX_TEAMS = 6;
const LOBBY_MS = 10 * 60 * 1000;
const ROUND_MS = 36_000;
const FINAL_MS = 45_000;
const ROUND_MAX = 6;
const PUZZLE_MS = 60_000;
const PUZZLE_CHANCE_ON_TRAN_PATH = 100;
const MINI_BOSS_CHANCE = 45;
const MAJOR_BOSS_CHANCE = 80;
const BOSS_TURN_MS = 35_000;
const DUYEN_ENCOUNTER_CHANCE = 48;
const BONUS_PATH_OPTION_CLUE = 5;

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
const BOSS_ACTIONS = {
    attack: ["⚔️", "Công kích"],
    guard: ["🛡️", "Thủ trận"],
    heal: ["💚", "Hồi máu"],
    call: ["🆘", "Gọi trợ giúp"],
};
function isDuyenAdmin(interaction) {
    const allowedUserIds = Array.isArray(adminConfig.allowedUserIds)
        ? adminConfig.allowedUserIds.map(String)
        : [];

    return allowedUserIds.includes(String(interaction.user.id));
}
const DUYEN_BOSSES = {
    mini: {
        emoji: "👹",
        name: "Mini Boss Cơ Duyên",
        hp: 150,
        atk: 34,
        turns: 3,
        money: [9000, 18000],
        fragment: [12, 28],
        clue: 2,
    },
    major: {
        emoji: "🐉",
        name: "Boss Cơ Duyên",
        hp: 320,
        atk: 58,
        turns: 5,
        money: [28000, 52000],
        fragment: [35, 90],
        clue: 5,
    },
};
const DUYEN_REWARD_POOLS = {
    winner: {
        money: [35000, 70000],
        rolls: 3,
        ssPhoiChance: 2.5,
        pool: [
            {
                type: "item",
                itemId: "manh_phap_bao",
                min: 90,
                max: 220,
                weight: 28,
            },
            {
                type: "item",
                itemId: "ruong_phap_bao_tinh_anh",
                amount: 1,
                weight: 16,
            },
            {
                type: "item",
                itemId: "ruong_phap_bao_mamu",
                amount: 1,
                weight: 6,
            },

            {
                type: "item",
                itemId: "bi_tich_cao_cap_chu_dong",
                amount: 1,
                weight: 12,
            },
            {
                type: "item",
                itemId: "bi_tich_cao_cap_bi_dong",
                amount: 1,
                weight: 12,
            },
            {
                type: "item",
                itemId: "bi_tich_thien_giai_chu_dong",
                amount: 1,
                weight: 4,
            },
            {
                type: "item",
                itemId: "bi_tich_thien_giai_bi_dong",
                amount: 1,
                weight: 4,
            },
            {
                type: "item",
                itemId: "bi_tich_mamu_cam_thuat_chu_dong",
                amount: 1,
                weight: 0.7,
            },
            {
                type: "item",
                itemId: "bi_tich_mamu_cam_thuat_bi_dong",
                amount: 1,
                weight: 0.5,
            },

            { type: "item", itemId: "da_mamu", amount: 1, weight: 8 },
            { type: "item", itemId: "da_hoa_dien", amount: 1, weight: 10 },
            { type: "item", itemId: "da_phi_thuy", amount: 1, weight: 8 },
        ],
    },

    runner: {
        money: [12000, 25000],
        rolls: 2,
        ssPhoiChance: 0.6,
        pool: [
            {
                type: "item",
                itemId: "manh_phap_bao",
                min: 45,
                max: 120,
                weight: 35,
            },
            {
                type: "item",
                itemId: "ruong_phap_bao_tinh_anh",
                amount: 1,
                weight: 7,
            },
            {
                type: "item",
                itemId: "bi_tich_cao_cap_chu_dong",
                amount: 1,
                weight: 12,
            },
            {
                type: "item",
                itemId: "bi_tich_cao_cap_bi_dong",
                amount: 1,
                weight: 12,
            },
            {
                type: "item",
                itemId: "bi_tich_thien_giai_chu_dong",
                amount: 1,
                weight: 1.5,
            },
            {
                type: "item",
                itemId: "bi_tich_thien_giai_bi_dong",
                amount: 1,
                weight: 1.5,
            },
            { type: "item", itemId: "da_hoa_dien", amount: 1, weight: 12 },
            { type: "item", itemId: "da_phi_thuy", amount: 1, weight: 10 },
            { type: "item", itemId: "da_mamu", amount: 1, weight: 3 },
        ],
    },

    ignore: {
        money: [5000, 9000],
        rolls: 1,
        ssPhoiChance: 0,
        pool: [
            {
                type: "item",
                itemId: "manh_phap_bao",
                min: 15,
                max: 45,
                weight: 35,
            },
            {
                type: "item",
                itemId: "bi_tich_thuong_chu_dong",
                amount: 1,
                weight: 16,
            },
            {
                type: "item",
                itemId: "bi_tich_thuong_bi_dong",
                amount: 1,
                weight: 16,
            },
            { type: "item", itemId: "da_ngoc_bich", amount: 1, weight: 12 },
            { type: "item", itemId: "da_phi_thuy", amount: 1, weight: 7 },
        ],
    },

    loser: {
        money: [3000, 7000],
        rolls: 1,
        ssPhoiChance: 0,
        pool: [
            {
                type: "item",
                itemId: "manh_phap_bao",
                min: 10,
                max: 35,
                weight: 40,
            },
            {
                type: "item",
                itemId: "bi_tich_thuong_chu_dong",
                amount: 1,
                weight: 10,
            },
            {
                type: "item",
                itemId: "bi_tich_thuong_bi_dong",
                amount: 1,
                weight: 10,
            },
            { type: "item", itemId: "da_ngoc_bich", amount: 1, weight: 10 },
            { type: "item", itemId: "da_hoa_dien", amount: 1, weight: 4 },
        ],
    },
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
function getDuyenNotifyRole(guild) {
    if (!guild) {
        return null;
    }

    const autoConfig = duyenConfig.autoOpen || {};
    const roleId = autoConfig.notifyRoleId || duyenConfig.notifyRoleId;

    if (roleId) {
        return guild.roles.cache.get(String(roleId)) || null;
    }

    const roleName = String(
        autoConfig.notifyRoleName ||
            duyenConfig.notifyRoleName ||
            "Lợn Tu Tiên",
    )
        .trim()
        .toLowerCase();

    return (
        guild.roles.cache.find((role) => {
            return (
                String(role.name || "")
                    .trim()
                    .toLowerCase() === roleName
            );
        }) || null
    );
}

function buildDuyenAllowedMentions(event, shouldPingRole = false) {
    if (!shouldPingRole) {
        return { roles: [] };
    }

    const role = getDuyenNotifyRole(event.guild);

    return role ? { roles: [role.id] } : { roles: [] };
}
async function clearDuyenPublicChannel(channel) {
    const autoConfig = duyenConfig.autoOpen || {};

    if (autoConfig.clearChannelBeforeOpen === false) {
        return;
    }

    if (!channel?.isTextBased?.() || !channel.messages?.fetch) {
        return;
    }

    const permissions = channel.permissionsFor?.(channel.guild.members.me);

    if (!permissions?.has(PermissionFlagsBits.ManageMessages)) {
        console.warn(
            `[DUYEN CLEAN] Bot thiếu quyền Manage Messages ở channel ${channel.id}.`,
        );
        return;
    }

    const maxBatches = Number(autoConfig.clearChannelMaxBatches || 20);
    const reason =
        autoConfig.clearChannelReason || "Dọn kênh trước khi mở Cơ Duyên";

    for (let batch = 0; batch < maxBatches; batch += 1) {
        const messages = await channel.messages
            .fetch({ limit: 100 })
            .catch(() => null);

        if (!messages || messages.size <= 0) {
            break;
        }

        const deleted = await channel
            .bulkDelete(messages, true)
            .catch((error) => {
                console.error("[DUYEN CLEAN] Không thể bulk delete:", error);
                return null;
            });

        if (!deleted || deleted.size <= 0) {
            break;
        }
    }

    await channel
        .send("🧹 Thiên Đạo vừa quét sạch tạp âm. Cơ duyên mới sắp mở...")
        .then((message) => {
            setTimeout(() => {
                message.delete().catch(() => undefined);
            }, 3500);
        })
        .catch(() => undefined);
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

function calculateTeamMaxHp(team) {
    return Math.max(
        180,
        Math.round(
            160 +
                team.members.length * 80 +
                Number(team.stats.combat || 0) * 1.2 +
                Number(team.stats.formation || 0) * 0.9,
        ),
    );
}

function setupTeamHp(team, reset = false) {
    const oldMaxHp = Number(team.maxHp || 0);
    const newMaxHp = calculateTeamMaxHp(team);

    team.maxHp = newMaxHp;

    if (reset || team.hp === undefined || team.hp === null) {
        team.hp = newMaxHp;
        return;
    }

    const ratio = oldMaxHp > 0 ? Number(team.hp || 0) / oldMaxHp : 1;
    team.hp = Math.max(1, Math.min(newMaxHp, Math.round(newMaxHp * ratio)));
}

function statsLine(team) {
    const hpText = team.maxHp ? ` | ❤️ ${fmt(team.hp)}/${fmt(team.maxHp)}` : "";

    return (
        `⚔️ ${team.stats.combat} | ` +
        `🕶️ ${team.stats.trick} | ` +
        `🪤 ${team.stats.formation} | ` +
        `🍀 ${team.stats.luck} | ` +
        `🔊 ${team.stats.noise} | ` +
        `🧩 ${team.stats.clue} | ` +
        `😵 ${team.stats.fatigue}` +
        hpText
    );
}

function buildLobbyText(event, shouldPingRole = false) {
    const teamsText =
        event.teams.length > 0
            ? event.teams
                  .map((team) => {
                      return `**Đội ${team.no}** (${team.members.length}/${MAX_TEAM_SIZE}): ${team.members.map(tag).join(" ")}`;
                  })
                  .join("\n")
            : "Chưa có đội nào.";
    const notifyRole = shouldPingRole ? getDuyenNotifyRole(event.guild) : null;
    const notifyLine = notifyRole ? `<@&${notifyRole.id}>\n` : "";
    return (
        notifyLine +
        "🌌 **BÍ CẢNH TRUYỀN THỪA MỞ RA**\n\n" +
        `⏳ Lập đội trong **10 phút**. Mỗi đội tối đa **${MAX_TEAM_SIZE} người**.\n` +
        "Bot sẽ tạo kênh riêng cho từng đội để bàn mưu.\n\n" +
        `${teamsText}\n\n` +
        "Mỗi round chỉ chọn 1 trong 3 đường. Hãy làm con lợn thông minh"
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
function buildPuzzleRows(event, team, puzzleKey, disabled = false) {
    const labels = ["A", "B", "C", "D"];

    return [
        new ActionRowBuilder().addComponents(
            labels.map((label, index) => {
                return new ButtonBuilder()
                    .setCustomId(
                        `duyen_puzzle_${event.id}_${team.id}_${puzzleKey}_${index}`,
                    )
                    .setLabel(label)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled);
            }),
        ),
    ];
}

function formatPuzzleChoices(puzzle) {
    return puzzle.choices
        .map((choice, index) => {
            const label = ["A", "B", "C", "D"][index];
            return `**${label}.** ${choice}`;
        })
        .join("\n");
}

function pickPuzzle() {
    return duyenPuzzles[rnd(0, duyenPuzzles.length - 1)];
}

function pickPuzzleVote(state) {
    const counts = {};

    for (const choiceIndex of Object.values(state.votes)) {
        counts[choiceIndex] = Number(counts[choiceIndex] || 0) + 1;
    }

    const entries = Object.entries(counts);

    if (entries.length <= 0) {
        return -1;
    }

    entries.sort((a, b) => {
        return Number(b[1]) - Number(a[1]);
    });

    return Number(entries[0][0]);
}

function formatPuzzleAnswer(index) {
    return ["A", "B", "C", "D"][index] || "?";
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
        content: buildLobbyText(event, true),
        components: buildLobbyRows(event),
        allowedMentions: buildDuyenAllowedMentions(event, true),
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
async function autoStart(client) {
    const autoConfig = duyenConfig.autoOpen || {};

    if (!autoConfig.enabled) {
        return false;
    }

    const channel = await client.channels
        .fetch(autoConfig.channelId)
        .catch(() => null);

    if (!channel || !channel.guild) {
        console.error(
            "[DUYEN AUTO] Không tìm thấy channel:",
            autoConfig.channelId,
        );
        return false;
    }

    const key = eventKey(channel.guildId, channel.id);

    if (events.has(key)) {
        console.log("[DUYEN AUTO] Kênh này đang có Cơ Duyên rồi, bỏ qua.");
        return false;
    }

    let sentMessage = null;

    const fakeInteraction = {
        guild: channel.guild,
        guildId: channel.guildId,
        channel,
        channelId: channel.id,
        client,
        user: client.user,

        reply: async (payload) => {
            const cleanPayload =
                typeof payload === "string"
                    ? { content: payload }
                    : { ...payload };

            delete cleanPayload.ephemeral;

            sentMessage = await channel.send(cleanPayload);
            return sentMessage;
        },

        fetchReply: async () => sentMessage,
    };

    await start(fakeInteraction);

    return true;
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
        hp: 0,
        maxHp: 0,
        channelId: null,
        pathHistory: [],
    };
    setupTeamHp(team, true);
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
    setupTeamHp(team, true);
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
function grantPuzzleReward(team, puzzle) {
    const reward = puzzle.reward || {};
    const moneyRange = reward.money || [2000, 4000];

    team.stats.clue += Number(reward.clue || 1);
    team.stats.formation += Number(reward.formation || 3);
    team.stats.noise = Math.max(0, team.stats.noise - 4);

    const money = rnd(moneyRange[0], moneyRange[1]);

    for (const userId of team.members) {
        db.addMoney(userId, money);
    }

    return money;
}

function applyPuzzleFail(team) {
    team.stats.fatigue += 12;
    team.stats.noise += 18;
}

async function runPuzzle(event, team) {
    const puzzle = pickPuzzle();
    const puzzleKey = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;

    const channel = await event.guild.channels
        .fetch(team.channelId)
        .catch(() => null);

    if (!channel) {
        return "🧩 Cổ trận xuất hiện nhưng kênh đội không còn tồn tại.";
    }

    const state = {
        eventId: event.id,
        teamId: team.id,
        puzzleKey,
        puzzle,
        votes: {},
        message: null,
    };

    activePuzzles.set(puzzleKey, state);

    const message = await channel.send({
        content:
            "🧩 **CƠ QUAN CỔ TRẬN**\n\n" +
            "Một cửa đá khắc đầy phù văn chắn trước mặt.\n" +
            "Cổ trận yêu cầu cả đội chọn đáp án đúng.\n\n" +
            `**Câu hỏi:** ${puzzle.question}\n\n` +
            `${formatPuzzleChoices(puzzle)}\n\n` +
            `⏳ Có **${PUZZLE_MS / 1000}s** để vote. Đáp án nhiều vote nhất sẽ được chọn.`,
        components: buildPuzzleRows(event, team, puzzleKey),
    });

    state.message = message;

    return new Promise((resolve) => {
        setTimeout(async () => {
            activePuzzles.delete(puzzleKey);

            const chosenIndex = pickPuzzleVote(state);
            const correct = chosenIndex === Number(puzzle.answerIndex);

            if (correct) {
                const money = grantPuzzleReward(team, puzzle);

                await message
                    .edit({
                        content:
                            message.content +
                            "\n\n✅ **Cổ trận được phá giải.**\n" +
                            `Đội chọn **${formatPuzzleAnswer(chosenIndex)}** và đã đúng.\n` +
                            `Đội nhận 🧩 +${puzzle.reward?.clue || 1} manh mối, 🪤 +${puzzle.reward?.formation || 3} trận pháp, 💰 ${fmt(money)} mỗi người.`,
                        components: buildPuzzleRows(
                            event,
                            team,
                            puzzleKey,
                            true,
                        ),
                    })
                    .catch(() => undefined);

                return resolve(
                    `✅ Đội phá giải Cổ Trận thành công. Nhận +${puzzle.reward?.clue || 1} manh mối và quà cơ quan.`,
                );
            }

            applyPuzzleFail(team);

            await message
                .edit({
                    content:
                        message.content +
                        "\n\n💀 **Cổ trận phản phệ.**\n" +
                        (chosenIndex >= 0
                            ? `Đội chọn **${formatPuzzleAnswer(chosenIndex)}**, đáp án đúng là **${formatPuzzleAnswer(puzzle.answerIndex)}**.\n`
                            : `Không ai chọn đáp án. Đáp án đúng là **${formatPuzzleAnswer(puzzle.answerIndex)}**.\n`) +
                        "Đội bị 😵 +12 mệt mỏi, 🔊 +18 dấu vết.\n" +
                        "Thiên Đạo kết luận: câu này không khó, người khó là đội bạn.",
                    components: buildPuzzleRows(event, team, puzzleKey, true),
                })
                .catch(() => undefined);

            return resolve("💀 Đội giải sai Cổ Trận, bị phản phệ.");
        }, PUZZLE_MS);
    });
}
function buildBossRows(
    event,
    team,
    bossKey,
    canCallHelp = false,
    disabled = false,
) {
    const buttons = [
        new ButtonBuilder()
            .setCustomId(`duyen_boss_${event.id}_${team.id}_${bossKey}_attack`)
            .setEmoji(BOSS_ACTIONS.attack[0])
            .setLabel(BOSS_ACTIONS.attack[1])
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`duyen_boss_${event.id}_${team.id}_${bossKey}_guard`)
            .setEmoji(BOSS_ACTIONS.guard[0])
            .setLabel(BOSS_ACTIONS.guard[1])
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`duyen_boss_${event.id}_${team.id}_${bossKey}_heal`)
            .setEmoji(BOSS_ACTIONS.heal[0])
            .setLabel(BOSS_ACTIONS.heal[1])
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
    ];

    if (canCallHelp) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(
                    `duyen_boss_${event.id}_${team.id}_${bossKey}_call`,
                )
                .setEmoji(BOSS_ACTIONS.call[0])
                .setLabel(BOSS_ACTIONS.call[1])
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled),
        );
    }

    return [new ActionRowBuilder().addComponents(...buttons)];
}

function bossHpLine(team, boss) {
    return (
        `👹 Boss: **${fmt(boss.hp)}/${fmt(boss.maxHp)}**\n` +
        `❤️ Đội: **${fmt(team.hp)}/${fmt(team.maxHp)}**`
    );
}

function countBossActions(votes, action) {
    return Object.values(votes || {}).filter((item) => item === action).length;
}

function grantDuyenBossReward(team, type, success, helperIds = []) {
    const bossConfig = DUYEN_BOSSES[type] || DUYEN_BOSSES.mini;
    const lines = [];

    if (success) {
        team.stats.clue += Number(bossConfig.clue || 1);
        team.stats.combat += type === "major" ? 10 : 4;
        team.stats.formation += type === "major" ? 6 : 2;
    } else {
        team.stats.fatigue += type === "major" ? 22 : 12;
        team.stats.noise += type === "major" ? 16 : 8;
    }

    for (const userId of team.members) {
        const money = success
            ? rnd(bossConfig.money[0], bossConfig.money[1])
            : rnd(3000, 7000);
        const fragment = success
            ? rnd(bossConfig.fragment[0], bossConfig.fragment[1])
            : rnd(5, 12);

        db.addMoney(userId, money);
        db.addShopItem(userId, "manh_phap_bao", fragment);

        if (success && type === "major") {
            db.addShopItem(userId, "ruong_phap_bao_tinh_anh", 1);
        }

        lines.push(
            `${tag(userId)}: 💰 ${fmt(money)} • Mảnh Pháp Bảo x${fmt(fragment)}`,
        );
    }

    for (const helperId of helperIds) {
        const money = rnd(7000, 15000);
        const fragment = rnd(10, 25);

        db.addMoney(helperId, money);
        db.addShopItem(helperId, "manh_phap_bao", fragment);

        lines.push(
            `🆘 ${tag(helperId)} trợ giúp: 💰 ${fmt(money)} • Mảnh Pháp Bảo x${fmt(fragment)}`,
        );
    }

    return lines;
}
async function runBossEncounter(event, team, type = "mini") {
    const bossConfig = DUYEN_BOSSES[type] || DUYEN_BOSSES.mini;
    const channel = await event.guild.channels
        .fetch(team.channelId)
        .catch(() => null);

    if (!channel) {
        return "👹 Boss xuất hiện nhưng kênh đội không còn tồn tại.";
    }

    setupTeamHp(team, false);

    const boss = {
        hp: Math.round(
            bossConfig.hp +
                Number(team.stats.combat || 0) *
                    (type === "major" ? 1.35 : 0.9) +
                team.members.length * (type === "major" ? 55 : 25),
        ),
        maxHp: 0,
    };

    boss.maxHp = boss.hp;

    const helperIds = new Set();
    let helped = false;

    await channel.send(
        `${bossConfig.emoji} **${bossConfig.name.toUpperCase()} XUẤT HIỆN**\n` +
            `Máu đội sẽ giữ xuyên suốt Bí Cảnh. Đánh ngu là round sau đau tiếp.\n\n` +
            bossHpLine(team, boss),
    );

    for (let turn = 1; turn <= bossConfig.turns; turn += 1) {
        if (boss.hp <= 0 || team.hp <= 0) {
            break;
        }

        const bossKey = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
        const state = {
            eventId: event.id,
            teamId: team.id,
            bossKey,
            bossType: type,
            votes: {},
            helpers: new Set(),
            supportPower: 0,
            helpCalled: false,
            publicMessage: null,
        };

        activeBosses.set(bossKey, state);

        const message = await channel.send({
            content:
                `⚔️ **Boss Turn ${turn}/${bossConfig.turns}**\n` +
                `Chọn hành động trong **${BOSS_TURN_MS / 1000}s**. Vote sau sẽ đè vote trước.\n\n` +
                bossHpLine(team, boss),
            components: buildBossRows(
                event,
                team,
                bossKey,
                type === "major" && !helped,
            ),
        });

        await new Promise((resolve) => setTimeout(resolve, BOSS_TURN_MS));
        activeBosses.delete(bossKey);

        await message
            .edit({
                components: buildBossRows(
                    event,
                    team,
                    bossKey,
                    type === "major" && !helped,
                    true,
                ),
            })
            .catch(() => undefined);

        for (const helperId of state.helpers) {
            helperIds.add(helperId);
        }

        if (state.helpCalled) {
            helped = true;
            team.stats.noise += 10;
        }

        const attackCount = countBossActions(state.votes, "attack");
        const guardCount = countBossActions(state.votes, "guard");
        const healCount = countBossActions(state.votes, "heal");
        const afkCount = Math.max(
            0,
            team.members.length - Object.keys(state.votes).length,
        );

        const damage = Math.max(
            8,
            Math.round(
                (Number(team.stats.combat || 1) * 0.55 +
                    Number(team.stats.trick || 1) * 0.22 +
                    rnd(8, 28)) *
                    (0.35 + attackCount * 0.42) +
                    state.supportPower,
            ),
        );

        const protection = Math.round(
            guardCount *
                (Number(team.stats.formation || 1) * 0.22 + rnd(10, 22)),
        );

        const receivedDamage = Math.max(
            0,
            Math.round(
                bossConfig.atk +
                    turn * 8 +
                    afkCount * 8 -
                    protection -
                    healCount * 8,
            ),
        );

        const healAmount = healCount
            ? Math.round(team.maxHp * (0.08 + healCount * 0.035))
            : 0;

        boss.hp = Math.max(0, boss.hp - damage);
        team.hp = Math.max(
            0,
            Math.min(team.maxHp, team.hp - receivedDamage + healAmount),
        );

        await channel.send(
            `📌 **Kết quả Boss Turn ${turn}**\n` +
                `⚔️ Công: **${attackCount}** | 🛡️ Thủ: **${guardCount}** | 💚 Hồi: **${healCount}** | 😴 AFK: **${afkCount}**\n` +
                `💥 Gây boss: **-${fmt(damage)}**` +
                (state.supportPower
                    ? ` *(trợ giúp +${fmt(state.supportPower)})*`
                    : "") +
                `\n❤️ Đội mất: **-${fmt(receivedDamage)}**` +
                (healAmount ? ` | 💚 Hồi: **+${fmt(healAmount)}**` : "") +
                `\n\n${bossHpLine(team, boss)}`,
        );
    }

    const success = boss.hp <= 0;
    const rewardLines = grantDuyenBossReward(team, type, success, [
        ...helperIds,
    ]);

    if (!success && team.hp <= 0) {
        team.hp = 1;
    }

    await channel.send(
        success
            ? `✅ **${bossConfig.name} bị hạ.**\n🎁 ${rewardLines.join("\n")}`
            : `💀 **Không hạ được ${bossConfig.name}.** Đội trọng thương nhưng vẫn lết tiếp.\n🎁 ${rewardLines.join("\n")}`,
    );

    return success
        ? `✅ Gặp và hạ **${bossConfig.name}**. Nhận quà boss, đội còn ❤️ ${fmt(team.hp)}/${fmt(team.maxHp)}.`
        : `💀 Gặp **${bossConfig.name}** nhưng đánh không lại. Đội còn ❤️ ${fmt(team.hp)}/${fmt(team.maxHp)}.`;
}
async function resolvePath(event, team, pathId) {
    let text = applyPath(team, pathId);

    if (pathId === "tran") {
        if (rnd(1, 100) <= PUZZLE_CHANCE_ON_TRAN_PATH) {
            const puzzleText = await runPuzzle(event, team);
            text = `${text}\n${puzzleText}`;
        }
    }

    if (rnd(1, 100) <= MINI_BOSS_CHANCE) {
        const bossText = await runBossEncounter(event, team, "mini");
        text = `${text}\n${bossText}`;
    }

    return text;
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

    const results = await Promise.all(
        event.teams.map(async (team) => {
            const chosen = pickVoteWinner(
                team,
                `r${event.round}`,
                team.pathOptions,
            );

            team.choices[`r${event.round}`] = chosen;

            const text = await resolvePath(event, team, chosen);

            team.stats.noise = Math.max(0, Math.round(team.stats.noise));
            team.stats.fatigue = Math.max(0, Math.round(team.stats.fatigue));

            return {
                team,
                text,
            };
        }),
    );

    for (const result of results) {
        const channel = await event.guild.channels
            .fetch(result.team.channelId)
            .catch(() => null);

        await channel
            ?.send(`${result.text}\n\n${statsLine(result.team)}`)
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
    event.status = "boss";

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
    if (rnd(1, 100) <= MAJOR_BOSS_CHANCE) {
        const publicChannel = await event.guild.channels
            .fetch(event.channelId)
            .catch(() => null);

        await publicChannel
            ?.send(
                `🐉 Đội ${finder.no} vừa chạm **Boss Cơ Duyên**. Nếu kẹt quá có thể bấm **Gọi trợ giúp** trong kênh đội.`,
            )
            .catch(() => undefined);

        await runBossEncounter(event, finder, "major");
    }

    event.status = "final";

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

function calculateFinalScore(event, team, finder) {
    const attackCount = event.teams.filter((item) => {
        return item.finalChoice === "attack";
    }).length;

    let score =
        rnd(20, 75) +
        team.stats.combat * 0.35 +
        team.stats.trick * 0.25 +
        team.stats.formation * 0.22 +
        team.stats.luck * 0.12 -
        team.stats.fatigue * 0.35 -
        team.stats.noise * 0.12;

    if (team.id === finder.id) {
        score += 30;

        if (team.finalChoice === "fast") {
            score += attackCount ? -18 : 45;
        }

        if (team.finalChoice === "defend") {
            score += 18 + team.stats.formation * 0.35 + (attackCount ? 25 : 0);
        }

        if (team.finalChoice === "hide") {
            score += team.stats.trick * 0.45 - Math.max(0, attackCount - 1) * 8;
        }

        if (team.finalChoice === "bait") {
            score += attackCount ? 38 + team.stats.formation * 0.25 : -12;
        }

        if (team.finalChoice === "retreat") {
            const ambushCount = event.teams.filter((item) => {
                return item.finalChoice === "ambush";
            }).length;

            score += 15 - ambushCount * 20;
        }

        return Math.round(score);
    }

    if (team.finalChoice === "attack") {
        score += 24 + team.stats.combat * 0.25;

        if (finder.finalChoice === "defend") {
            score -= 24;
        }

        if (finder.finalChoice === "bait") {
            score -= 34;
        }

        if (finder.finalChoice === "hide") {
            score -= 15;
        }
    }

    if (team.finalChoice === "sneak") {
        score += 16 + team.stats.trick * 0.38;

        if (attackCount >= 2) {
            score += 28;
        }

        if (finder.finalChoice === "hide") {
            score -= 10;
        }
    }

    if (team.finalChoice === "ambush") {
        score += team.stats.formation * 0.35 + team.stats.trick * 0.25;

        if (finder.finalChoice === "retreat") {
            score += 45;
        }

        if (attackCount) {
            score += 10;
        }
    }

    return Math.round(score);
}

function pickWeightedWinner(teams) {
    const top = [...teams]
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, 3);

    const minScore = Math.min(...top.map((team) => team.finalScore));

    let totalWeight = 0;

    const weights = top.map((team) => {
        const weight = Math.max(10, team.finalScore - minScore + 25);
        totalWeight += weight;
        return weight;
    });

    let roll = Math.random() * totalWeight;

    for (let i = 0; i < top.length; i += 1) {
        roll -= weights[i];

        if (roll <= 0) {
            return top[i];
        }
    }

    return top[0];
}

function createUid(prefix = "pb") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function rollPercent(chance) {
    return Math.random() * 100 < Number(chance || 0);
}

function rollWeighted(pool) {
    const valid = Array.isArray(pool)
        ? pool.filter((item) => Number(item.weight || 0) > 0)
        : [];

    const total = valid.reduce(
        (sum, item) => sum + Number(item.weight || 0),
        0,
    );

    if (total <= 0) {
        return null;
    }

    let roll = Math.random() * total;

    for (const item of valid) {
        roll -= Number(item.weight || 0);

        if (roll <= 0) {
            return item;
        }
    }

    return valid[valid.length - 1] || null;
}

function createUnidentifiedWeapon(rarityId = "SS", source = "duyen") {
    const rarity = weaponConfig.getRarity(rarityId);
    const now = Date.now();

    return {
        uid: createUid("pb"),
        type: "phap_bao",
        state: "unidentified",

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

function giveUnidentifiedWeapon(userId, rarityId = "SS") {
    const weapon = createUnidentifiedWeapon(rarityId, "duyen_major");

    return db.updateUser(userId, (user) => {
        if (!Array.isArray(user.weapons)) {
            user.weapons = [];
        }

        if (!user.phapBaoStats) {
            user.phapBaoStats = {};
        }

        user.weapons.push(weapon);

        const rarityRank = {
            F: 1,
            E: 2,
            D: 3,
            C: 4,
            B: 5,
            A: 6,
            S: 7,
            SS: 8,
            SSS: 9,
            EX: 10,
        };

        const oldBest = user.phapBaoStats.bestRarityFound;
        const oldRank = rarityRank[oldBest] || 0;
        const newRank = rarityRank[weapon.rarity] || 0;

        if (newRank > oldRank) {
            user.phapBaoStats.bestRarityFound = weapon.rarity;
            user.phapBaoStats.bestWeaponName = weapon.name;
        }

        return weapon;
    });
}

function giveRewardItem(userId, reward) {
    if (!reward) {
        return null;
    }

    if (reward.type === "item") {
        const amount =
            reward.min && reward.max
                ? rnd(reward.min, reward.max)
                : Number(reward.amount || 1);

        db.addShopItem(userId, reward.itemId, amount);

        return {
            type: "item",
            itemId: reward.itemId,
            amount,
        };
    }

    return null;
}

function formatReward(reward) {
    if (!reward) {
        return null;
    }

    if (reward.type === "money") {
        return `💰 ${fmt(reward.amount)}`;
    }

    if (reward.type === "weapon") {
        return `🟦 Phôi Pháp Bảo **${reward.rarity}**`;
    }

    if (reward.type === "item") {
        const item = shop[reward.itemId];
        const name = item
            ? `${item.emoji || "🎁"} ${item.name}`
            : reward.itemId;

        return `${name} x${fmt(reward.amount)}`;
    }

    return null;
}

function grantTeamRewards(team, tier = "loser") {
    const config = DUYEN_REWARD_POOLS[tier] || DUYEN_REWARD_POOLS.loser;
    const lines = [];

    for (const userId of team.members) {
        const money = rnd(config.money[0], config.money[1]);

        db.addMoney(userId, money);

        const personalRewards = [
            {
                type: "money",
                amount: money,
            },
        ];

        for (let i = 0; i < Number(config.rolls || 1); i += 1) {
            const rolled = rollWeighted(config.pool);
            const given = giveRewardItem(userId, rolled);

            if (given) {
                personalRewards.push(given);
            }
        }

        lines.push(
            `${tag(userId)}: ${personalRewards
                .map(formatReward)
                .filter(Boolean)
                .join(" • ")}`,
        );
    }

    if (rollPercent(config.ssPhoiChance)) {
        const luckyUserId = team.members[rnd(0, team.members.length - 1)];

        giveUnidentifiedWeapon(luckyUserId, "SS");

        lines.push(
            `🌌 **ĐẠI CƠ DUYÊN NỔ LỚN:** ${tag(luckyUserId)} nhận **Phôi Pháp Bảo SS Chưa Giám Định**.`,
        );
    }

    return lines;
}
function teamDramaName(team) {
    const members = Array.isArray(team.members)
        ? team.members.map(tag).join(" ")
        : "";

    return members ? `Đội ${team.no} (${members})` : `Đội ${team.no}`;
}

function buildResultText(event, winner, finder) {
    const topText = [...event.teams]
        .filter((team) => team.finalChoice !== "ignore")
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, 5)
        .map((team, index) => {
            const source = team.id === finder.id ? FINDER : REACT;
            const choice = source[team.finalChoice];

            return (
                `${team.id === winner.id ? "🏆" : `${index + 1}.`} ` +
                `**${teamDramaName(team)}** — ${team.finalScore} điểm — ` +
                `${choice?.[0]} ${choice?.[1]}`
            );
        })
        .join("\n");

    const drama = [];

    const attackers = event.teams.filter(
        (team) => team.finalChoice === "attack",
    );
    const sneakers = event.teams.filter((team) => team.finalChoice === "sneak");
    const ambushers = event.teams.filter(
        (team) => team.finalChoice === "ambush",
    );

    if (finder.finalChoice === "hide") {
        drama.push(
            `🕶️ ${teamDramaName(finder)} che giấu khí tức, khiến vài đội mò đường như tìm nyc.`,
        );
    }

    if (finder.finalChoice === "bait") {
        drama.push(
            `🩸 ${teamDramaName(finder)} đặt bẫy quanh Linh Trì. Ai lao vào quá hăng đều thành con lợn chết.`,
        );
    }

    if (attackers.length >= 2) {
        drama.push(
            `⚔️ ${attackers.map(teamDramaName).join(", ")} lao vào tranh trực diện, quá nhiều con lợn phải trả giá.`,
        );
    }

    if (sneakers.length > 0) {
        drama.push(
            `🕶️ ${sneakers.map(teamDramaName).join(", ")} chọn chim sẻ sau lưng.`,
        );
    }

    if (ambushers.length > 0) {
        drama.push(
            `🪤 ${ambushers.map(teamDramaName).join(", ")} mai phục đường rút.`,
        );
    }

    if (winner.id !== finder.id) {
        drama.push(
            `💀 ${teamDramaName(finder)} tìm ra cơ duyên trước nhưng không giữ được hết.`,
        );
    }

    return (
        "🌌 **BÍ CẢNH TRUYỀN THỪA KHÉP LẠI**\n\n" +
        `🏆 **Đội thắng lớn:** ${teamDramaName(winner)}\n` +
        `🔎 **Đội phát hiện cơ duyên:** ${teamDramaName(finder)}\n\n` +
        `**BXH tranh đoạt:**\n${topText || "Không có đội tranh đoạt."}\n\n` +
        `**Diễn biến:**\n${drama.slice(0, 6).join("\n") || "Thiên Đạo thấy hơi ít drama."}\n\n` +
        "**Thiên Đạo kết luận:** Mạnh không sai. Mạnh mà không biết chọn thời cơ thì vẫn ăn cám."
    );
}

async function resolveFinal(event) {
    if (event.status !== "final") {
        return;
    }

    const timer = timers.get(`final_${event.id}`);

    if (timer) {
        clearTimeout(timer);
        timers.delete(`final_${event.id}`);
    }

    event.status = "done";

    const finder = event.teams.find((team) => team.id === event.finderId);

    if (!finder) {
        events.delete(event.key);
        return cleanup(event, 30_000);
    }

    for (const team of event.teams) {
        const source = team.id === finder.id ? FINDER : REACT;
        team.finalChoice = pickVoteWinner(team, "final", Object.keys(source));
    }

    const contestants = event.teams.filter((team) => {
        return team.finalChoice !== "ignore";
    });

    for (const team of contestants) {
        team.finalScore = calculateFinalScore(event, team, finder);
    }

    const winnerPool = contestants.length ? contestants : [finder];

    const winner = [...winnerPool].sort((a, b) => {
        const scoreDiff = Number(b.finalScore || 0) - Number(a.finalScore || 0);

        if (scoreDiff !== 0) {
            return scoreDiff;
        }

        if (a.id === finder.id) {
            return -1;
        }

        if (b.id === finder.id) {
            return 1;
        }

        return Number(a.no || 999) - Number(b.no || 999);
    })[0];

    const rewardLines = [];

    const winnerTier =
        winner.id === finder.id && finder.finalChoice === "retreat"
            ? "runner"
            : "winner";

    rewardLines.push(`🏆 **Đội ${winner.no} — Thắng lớn:**`);
    rewardLines.push(...grantTeamRewards(winner, winnerTier));

    const sortedTeams = [...event.teams].sort((a, b) => {
        return Number(b.finalScore || 0) - Number(a.finalScore || 0);
    });

    const runnerTeam = sortedTeams.find((team) => {
        return team.id !== winner.id && team.finalChoice !== "ignore";
    });

    for (const team of sortedTeams) {
        if (team.id === winner.id) {
            continue;
        }

        if (team.finalChoice === "ignore") {
            rewardLines.push(`🙏 **Đội ${team.no} — Bỏ qua tranh đoạt:**`);
            rewardLines.push(...grantTeamRewards(team, "ignore"));
            continue;
        }

        if (runnerTeam && team.id === runnerTeam.id) {
            rewardLines.push(`🥈 **Đội ${team.no} — Ăn được phần phụ:**`);
            rewardLines.push(...grantTeamRewards(team, "runner"));
            continue;
        }

        rewardLines.push(`🎒 **Đội ${team.no} — Quà an ủi:**`);
        rewardLines.push(...grantTeamRewards(team, "loser"));
    }

    const publicChannel = await event.guild.channels
        .fetch(event.channelId)
        .catch(() => null);

    await publicChannel
        ?.send(
            buildResultText(event, winner, finder) +
                `\n\n🎁 **Thưởng Bí Cảnh:**\n${rewardLines.slice(0, 18).join("\n")}` +
                (rewardLines.length > 18
                    ? "\n...và một số phần thưởng khác đã được phát vào kho."
                    : ""),
        )
        .catch(() => undefined);

    for (const team of event.teams) {
        const teamChannel = await event.guild.channels
            .fetch(team.channelId)
            .catch(() => null);

        await teamChannel
            ?.send(
                `📜 Tổng kết đội ${team.no}: **${team.finalScore || 0}** điểm.\n` +
                    "Kênh đội tự xóa sau 5 phút, có gì chửi nhau thì chửi nhanh.",
            )
            .catch(() => undefined);
    }

    events.delete(event.key);

    cleanup(event, 5 * 60_000);
}

async function cleanup(event, delay) {
    setTimeout(async () => {
        for (const team of event.teams) {
            const channel = await event.guild.channels
                .fetch(team.channelId)
                .catch(() => null);

            await channel
                ?.delete("Xóa kênh đội Bí Cảnh")
                .catch(() => undefined);
        }

        if (event.categoryId) {
            const category = await event.guild.channels
                .fetch(event.categoryId)
                .catch(() => null);

            await category
                ?.delete("Xóa category Bí Cảnh")
                .catch(() => undefined);
        }
    }, delay);
}

async function handlePathVote(interaction, event, parts) {
    const teamId = parts[3];
    const round = Number(parts[4]);
    const pathId = parts[5];
    const userId = String(interaction.user.id);

    const team = event.teams.find((item) => item.id === teamId);

    if (!team || !team.members.includes(userId)) {
        return interaction.reply({
            content: "❌ Bạn không thuộc đội này.",
            ephemeral: true,
        });
    }

    if (event.status !== "explore" || event.round !== round) {
        return interaction.reply({
            content: "❌ Lượt vote này đã hết hạn.",
            ephemeral: true,
        });
    }

    if (!team.pathOptions.includes(pathId)) {
        return interaction.reply({
            content: "❌ Đường này không có trong lượt này.",
            ephemeral: true,
        });
    }

    team.votes[`r${round}`][userId] = pathId;

    return interaction.reply({
        content: `${PATHS[pathId][0]} Bạn vote **${PATHS[pathId][1]}**. Có thể bấm lại để đổi trước khi hết giờ.`,
        ephemeral: true,
    });
}

async function handleFinalVote(interaction, event, parts, isFinderVote) {
    const teamId = parts[3];
    const choice = parts[4];
    const userId = String(interaction.user.id);

    const team = event.teams.find((item) => item.id === teamId);

    if (!team || !team.members.includes(userId)) {
        return interaction.reply({
            content: "❌ Bạn không thuộc đội này.",
            ephemeral: true,
        });
    }

    if (event.status !== "final") {
        return interaction.reply({
            content: "❌ Pha chọn cuối đã hết hạn.",
            ephemeral: true,
        });
    }

    const isFinder = team.id === event.finderId;

    if (isFinder !== isFinderVote) {
        return interaction.reply({
            content: "❌ Nút này không dành cho đội bạn.",
            ephemeral: true,
        });
    }

    const source = isFinder ? FINDER : REACT;

    if (!source[choice]) {
        return interaction.reply({
            content: "❌ Lựa chọn không hợp lệ.",
            ephemeral: true,
        });
    }

    team.votes.final[userId] = choice;

    return interaction.reply({
        content: `${source[choice][0]} Bạn vote **${source[choice][1]}**.`,
        ephemeral: true,
    });
}
async function handlePuzzleVote(interaction, event, parts) {
    const teamId = parts[3];
    const puzzleKey = parts[4];
    const choiceIndex = Number(parts[5]);
    const userId = String(interaction.user.id);

    const state = activePuzzles.get(puzzleKey);

    if (!state) {
        return interaction.reply({
            content: "❌ Cổ trận này đã hết thời gian.",
            ephemeral: true,
        });
    }

    const team = event.teams.find((item) => item.id === teamId);

    if (!team || !team.members.includes(userId)) {
        return interaction.reply({
            content: "❌ Bạn không thuộc đội này.",
            ephemeral: true,
        });
    }

    if (event.status !== "explore") {
        return interaction.reply({
            content: "❌ Cổ trận này đã đóng.",
            ephemeral: true,
        });
    }

    if (choiceIndex < 0 || choiceIndex > 3) {
        return interaction.reply({
            content: "❌ Đáp án không hợp lệ.",
            ephemeral: true,
        });
    }

    state.votes[userId] = choiceIndex;

    return interaction.reply({
        content:
            `✅ Bạn đã vote **${formatPuzzleAnswer(choiceIndex)}**.\n` +
            "Có thể bấm đáp án khác để đổi trước khi hết giờ.",
        ephemeral: true,
    });
}
async function handleBossAction(interaction, event, parts) {
    const teamId = parts[3];
    const bossKey = parts[4];
    const action = parts[5];
    const userId = String(interaction.user.id);
    const state = activeBosses.get(bossKey);

    if (!state || state.eventId !== event.id || state.teamId !== teamId) {
        return interaction.reply({
            content: "❌ Lượt boss này đã hết hạn.",
            ephemeral: true,
        });
    }

    const team = event.teams.find((item) => item.id === teamId);

    if (!team || !team.members.includes(userId)) {
        return interaction.reply({
            content: "❌ Bạn không thuộc đội này.",
            ephemeral: true,
        });
    }

    if (action === "call") {
        if (state.bossType !== "major") {
            return interaction.reply({
                content: "❌ Chỉ Boss Cơ Duyên mới gọi trợ giúp được.",
                ephemeral: true,
            });
        }

        if (state.helpCalled) {
            return interaction.reply({
                content: "❌ Đội đã gọi trợ giúp rồi.",
                ephemeral: true,
            });
        }

        state.helpCalled = true;

        const publicChannel = await event.guild.channels
            .fetch(event.channelId)
            .catch(() => null);

        await publicChannel
            ?.send({
                content:
                    `🆘 **Đội ${team.no} đang bị Boss Cơ Duyên dí.**\n` +
                    `Đội khác có thể trợ giúp để nhận quà phụ.`,
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(
                                `duyen_help_${event.id}_${team.id}_${bossKey}`,
                            )
                            .setEmoji("🆘")
                            .setLabel("Trợ giúp boss")
                            .setStyle(ButtonStyle.Success),
                    ),
                ],
            })
            .catch(() => null);

        return interaction.reply({
            content:
                "🆘 Đã gọi trợ giúp. Đội khác bấm hỗ trợ sẽ cộng sát thương cho lượt boss này.",
            ephemeral: true,
        });
    }

    if (!BOSS_ACTIONS[action]) {
        return interaction.reply({
            content: "❌ Hành động boss không hợp lệ.",
            ephemeral: true,
        });
    }

    state.votes[userId] = action;

    return interaction.reply({
        content: `${BOSS_ACTIONS[action][0]} Bạn chọn **${BOSS_ACTIONS[action][1]}**.`,
        ephemeral: true,
    });
}

async function handleBossHelp(interaction, event, parts) {
    const teamId = parts[3];
    const bossKey = parts[4];
    const userId = String(interaction.user.id);
    const state = activeBosses.get(bossKey);

    if (!state || state.eventId !== event.id || state.teamId !== teamId) {
        return interaction.reply({
            content: "❌ Lượt trợ giúp này đã hết hạn.",
            ephemeral: true,
        });
    }

    const targetTeam = event.teams.find((item) => item.id === teamId);
    const helperTeam = getUserTeam(event, userId);

    if (!helperTeam || helperTeam.id === targetTeam?.id) {
        return interaction.reply({
            content:
                "❌ Chỉ người thuộc đội khác trong Bí Cảnh mới trợ giúp được.",
            ephemeral: true,
        });
    }

    if (state.helpers.has(userId)) {
        return interaction.reply({
            content: "❌ Bạn đã trợ giúp lượt này rồi.",
            ephemeral: true,
        });
    }

    const supportPower = Math.round(
        25 +
            Number(helperTeam.stats.combat || 0) * 0.12 +
            Number(helperTeam.stats.formation || 0) * 0.08,
    );

    state.helpers.add(userId);
    state.supportPower += supportPower;
    helperTeam.stats.noise += 4;

    return interaction.reply({
        content: `🆘 Bạn trợ giúp Đội ${targetTeam?.no || "?"}, cộng **${fmt(supportPower)}** sát thương boss và sẽ nhận quà phụ nếu boss kết thúc.`,
        ephemeral: true,
    });
}
async function handleButton(interaction) {
    if (!interaction.customId.startsWith("duyen_")) {
        return undefined;
    }

    const parts = interaction.customId.split("_");
    const action = parts[1];
    const event = findEvent(parts[2]);

    if (!event) {
        return interaction.reply({
            content: "❌ Bí cảnh đã kết thúc hoặc bot vừa restart.",
            ephemeral: true,
        });
    }

    if (action === "create") {
        return createTeam(interaction, event, false);
    }

    if (action === "solo") {
        return createTeam(interaction, event, true);
    }

    if (action === "join") {
        return showJoinMenu(interaction, event);
    }

    if (action === "joinselect") {
        return joinTeam(interaction, event, interaction.values?.[0]);
    }
    if (action === "boss") {
        return handleBossAction(interaction, event, parts);
    }

    if (action === "help") {
        return handleBossHelp(interaction, event, parts);
    }

    if (action === "start") {
        if (!isDuyenAdmin(interaction)) {
            return interaction.reply({
                content: "❌ Chỉ admin được bắt đầu sớm Bí Cảnh.",
                ephemeral: true,
            });
        }

        if (event.status !== "lobby") {
            return interaction.reply({
                content: "❌ Bí Cảnh đã bắt đầu rồi.",
                ephemeral: true,
            });
        }

        await interaction.reply({
            content: "🔒 Admin đã bắt đầu sớm.",
            ephemeral: true,
        });

        return beginExplore(event);
    }
    if (action === "puzzle") {
        return handlePuzzleVote(interaction, event, parts);
    }

    if (action === "path") {
        return handlePathVote(interaction, event, parts);
    }

    if (action === "finder") {
        return handleFinalVote(interaction, event, parts, true);
    }

    if (action === "react") {
        return handleFinalVote(interaction, event, parts, false);
    }

    return undefined;
}

module.exports = {
    start,
    autoStart,
    handleButton,
};
