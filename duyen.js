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
const DISCORD_MESSAGE_LIMIT = 1900;
const DUYEN_RESULT_KEY_PREFIX = "duyen:lastResult";
const DUYEN_AFK_BAN_KEY_PREFIX = "duyen:afkBan";

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
            {
                type: "item",
                itemId: "da_mamu",
                amount: 1,
                weight: 8,
            },
            {
                type: "item",
                itemId: "da_hoa_dien",
                amount: 1,
                weight: 10,
            },
            {
                type: "item",
                itemId: "da_phi_thuy",
                amount: 1,
                weight: 8,
            },
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
            {
                type: "item",
                itemId: "da_hoa_dien",
                amount: 1,
                weight: 12,
            },
            {
                type: "item",
                itemId: "da_phi_thuy",
                amount: 1,
                weight: 10,
            },
            {
                type: "item",
                itemId: "da_mamu",
                amount: 1,
                weight: 3,
            },
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
            {
                type: "item",
                itemId: "da_ngoc_bich",
                amount: 1,
                weight: 12,
            },
            {
                type: "item",
                itemId: "da_phi_thuy",
                amount: 1,
                weight: 7,
            },
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
            {
                type: "item",
                itemId: "da_ngoc_bich",
                amount: 1,
                weight: 10,
            },
            {
                type: "item",
                itemId: "da_hoa_dien",
                amount: 1,
                weight: 4,
            },
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

function splitLongText(text, limit = DISCORD_MESSAGE_LIMIT) {
    const normalized = String(text || "").trim();

    if (!normalized) {
        return [];
    }

    const chunks = [];
    let current = "";

    const pushCurrent = () => {
        if (current) {
            chunks.push(current);
            current = "";
        }
    };

    for (const rawLine of normalized.split("\n")) {
        let line = rawLine;

        while (line.length > limit) {
            pushCurrent();
            chunks.push(line.slice(0, limit));
            line = line.slice(limit);
        }

        const candidate = current ? `${current}\n${line}` : line;

        if (candidate.length > limit) {
            pushCurrent();
            current = line;
        } else {
            current = candidate;
        }
    }

    pushCurrent();
    return chunks;
}

async function sendLongMessage(channel, text, extraPayload = {}) {
    if (!channel?.send) {
        return [];
    }

    const sent = [];

    for (const content of splitLongText(text)) {
        const message = await channel.send({
            ...extraPayload,
            content,
        });

        sent.push(message);
    }

    return sent;
}

function getDuyenResultKey(guildId, channelId = null) {
    return channelId
        ? `${DUYEN_RESULT_KEY_PREFIX}:${guildId}:${channelId}`
        : `${DUYEN_RESULT_KEY_PREFIX}:${guildId}`;
}

function getAfkBanKey(guildId, userId) {
    return `${DUYEN_AFK_BAN_KEY_PREFIX}:${guildId}:${userId}`;
}

function markTeamActivity(team, userId) {
    if (!(team.activeMembers instanceof Set)) {
        team.activeMembers = new Set(team.activeMembers || []);
    }

    team.activeMembers.add(String(userId));
}

function getActiveMemberIds(team) {
    return team.activeMembers instanceof Set
        ? [...team.activeMembers]
        : Array.isArray(team.activeMembers)
          ? [...team.activeMembers]
          : [];
}

function setAfkBanForNextEvent(event, userId) {
    db.setSystemValue(getAfkBanKey(event.guild.id, userId), {
        sourceEventId: event.id,
        blockedEventId: null,
        createdAt: Date.now(),
    });
}

function isBlockedByAfkBan(event, userId) {
    const key = getAfkBanKey(event.guild.id, userId);

    const record = db.getSystemValue(key);

    if (!record || record.sourceEventId === event.id) {
        return false;
    }

    if (!record.blockedEventId) {
        record.blockedEventId = event.id;
        db.setSystemValue(key, record);
        return true;
    }

    if (record.blockedEventId === event.id) {
        return true;
    }

    db.setSystemValue(key, null);
    return false;
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
        return {
            roles: [],
        };
    }

    const role = getDuyenNotifyRole(event.guild);

    return role
        ? {
              roles: [role.id],
          }
        : {
              roles: [],
          };
}

async function clearDuyenPublicChannel(channel) {
    return undefined;
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
                      return (
                          `**Đội ${team.no}** ` +
                          `(${team.members.length}/${MAX_TEAM_SIZE}): ` +
                          team.members.map(tag).join(" ")
                      );
                  })
                  .join("\n")
            : "Chưa có đội nào.";

    const notifyRole = shouldPingRole ? getDuyenNotifyRole(event.guild) : null;

    const notifyLine = notifyRole ? `<@&${notifyRole.id}>\n` : "";

    return (
        notifyLine +
        "🌌 **BÍ CẢNH TRUYỀN THỪA MỞ RA**\n\n" +
        `⏳ Lập đội trong **10 phút**. ` +
        `Mỗi đội tối đa **${MAX_TEAM_SIZE} người**.\n` +
        "Bot sẽ tạo kênh riêng cho từng đội để bàn mưu.\n\n" +
        `${teamsText}\n\n` +
        "Mỗi round chỉ chọn 1 trong 3 đường. " +
        "Đường có nhiều phiếu nhất sẽ được chọn."
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
                .setCustomId(`duyen_leave_${event.id}`)
                .setEmoji("↩️")
                .setLabel("Rời đội")
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId(`duyen_start_${event.id}`)
                .setEmoji("🔒")
                .setLabel("Bắt đầu sớm")
                .setStyle(ButtonStyle.Danger),
        ),
    ];
}

function buildPathRows(event, team, disabled = false) {
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
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(disabled);
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

            return `**${label}.** ` + `${choice}`;
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
        const voteDiff = Number(b[1]) - Number(a[1]);

        if (voteDiff !== 0) {
            return voteDiff;
        }

        return Number(a[0]) - Number(b[0]);
    });

    return Number(entries[0][0]);
}

function formatPuzzleAnswer(index) {
    return ["A", "B", "C", "D"][index] || "?";
}

function buildFinalRows(event, team, isFinder, disabled = false) {
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
                    )
                    .setDisabled(disabled);
            }),
        ),
    ];
}

function resolveVote(team, bucket, fallbackIds) {
    const votes = team.votes[bucket] || {};

    const validIds = [...new Set(fallbackIds)].filter(Boolean);

    const counts = Object.fromEntries(validIds.map((id) => [id, 0]));

    for (const vote of Object.values(votes)) {
        if (Object.prototype.hasOwnProperty.call(counts, vote)) {
            counts[vote] += 1;
        }
    }

    if (validIds.length <= 0) {
        return {
            choice: null,
            counts,
            totalVotes: 0,
            reason: "no_option",
        };
    }

    const totalVotes = Object.values(counts).reduce((sum, count) => {
        return sum + Number(count || 0);
    }, 0);

    if (totalVotes <= 0) {
        return {
            choice: validIds[0],
            counts,
            totalVotes,
            reason: "no_vote_default_first",
        };
    }

    const maxVotes = Math.max(...Object.values(counts));

    const tiedIds = validIds.filter((id) => {
        return counts[id] === maxVotes;
    });

    /*
     * Chỉ có đúng một lựa chọn đạt số phiếu cao nhất.
     * Trường hợp này luôn lấy lựa chọn đó.
     *
     * Ví dụ:
     * đường 1 = 1 phiếu
     * đường 2 = 0 phiếu
     * đường 3 = 3 phiếu
     *
     * Bot chắc chắn chọn đường 3.
     */
    if (tiedIds.length === 1) {
        return {
            choice: tiedIds[0],
            counts,
            totalVotes,
            reason: "majority",
        };
    }

    /*
     * Chỉ dùng phiếu đội trưởng khi có hòa phiếu.
     */
    const leaderVote = votes[String(team.leaderId)];

    if (leaderVote && tiedIds.includes(leaderVote)) {
        return {
            choice: leaderVote,
            counts,
            totalVotes,
            reason: "leader_tiebreak",
        };
    }

    /*
     * Nếu hòa và đội trưởng không vote vào
     * một lựa chọn đang hòa, ưu tiên lựa chọn
     * xuất hiện trước trên giao diện.
     */
    return {
        choice: tiedIds[0],
        counts,
        totalVotes,
        reason: "display_order_tiebreak",
    };
}

function pickVoteWinner(team, bucket, fallbackIds) {
    return resolveVote(team, bucket, fallbackIds).choice;
}

function formatPathVoteResolution(team, resolution) {
    const tally = team.pathOptions
        .map((pathId) => {
            const path = PATHS[pathId];

            return (
                `${path[0]} ` +
                `${path[1]}: ` +
                `**${resolution.counts[pathId] || 0}**`
            );
        })
        .join(" | ");

    const reasonText = {
        majority: "nhiều phiếu nhất",

        leader_tiebreak: "hòa phiếu, ưu tiên phiếu đội trưởng",

        display_order_tiebreak: "hòa phiếu, ưu tiên lối hiển thị trước",

        no_vote_default_first: "không có phiếu hợp lệ, chọn lối đầu tiên",

        no_option: "không có lựa chọn hợp lệ",
    }[resolution.reason];

    const selectedPath = PATHS[resolution.choice];

    return (
        `🗳️ **Chốt phiếu:** ${tally}\n` +
        `➡️ Kết quả: ` +
        `${selectedPath?.[0] || "❓"} ` +
        `**${selectedPath?.[1] || resolution.choice || "Không xác định"}**` +
        (reasonText ? ` (${reasonText}).` : ".")
    );
}

async function createCategory(interaction, event) {
    const category = await interaction.guild.channels
        .create({
            name: `🌌 Bí Cảnh ` + `${event.shortId}`,

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
            "Bàn ở đây rồi vote. " +
            "Kênh này chỉ đội bạn thấy.",
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
        id: `${Date.now()}` + `${Math.random().toString(36).slice(2, 7)}`,

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

        roundLocked: false,
        resolvingRound: null,
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
                    ? {
                          content: payload,
                      }
                    : {
                          ...payload,
                      };

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

    if (isBlockedByAfkBan(event, userId)) {
        return interaction.reply({
            content:
                "⛔ Bạn đã AFK ở lượt trước nên bị cấm tham gia Cơ Duyên lần này.",
            ephemeral: true,
        });
    }

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
        id: `team` + `${event.teams.length + 1}`,

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
        pathMessageId: null,

        choiceDetails: {},
        finalVoteDetails: null,

        /*
         * Thành viên có thao tác trong Bí Cảnh.
         *
         * Người chơi chỉ cần thực hiện ít nhất
         * một hành động hợp lệ để không bị AFK.
         */
        activeMembers: new Set(),
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

    if (isBlockedByAfkBan(event, userId)) {
        return interaction.reply({
            content:
                "⛔ Bạn đã AFK ở lượt trước nên bị cấm tham gia Cơ Duyên lần này.",
            ephemeral: true,
        });
    }

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
                                label:
                                    `Đội ${team.no} ` +
                                    `(${team.members.length}/${MAX_TEAM_SIZE})`,

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

    if (isBlockedByAfkBan(event, userId)) {
        return interaction.reply({
            content:
                "⛔ Bạn đã AFK ở lượt trước nên bị cấm tham gia Cơ Duyên lần này.",
            ephemeral: true,
        });
    }

    if (event.status !== "lobby") {
        return interaction.reply({
            content: "❌ Bí cảnh đã bắt đầu.",
            ephemeral: true,
        });
    }

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
            `🤝 ${tag(userId)} đã vào đội. ` +
                "Cơ duyên bắt đầu có mùi chia phần.",
        )
        .catch(() => undefined);

    await refreshLobby(event);

    return interaction.update({
        content: `✅ Bạn đã vào ` + `**Đội ${team.no}**.`,

        components: [],
    });
}

async function leaveTeam(interaction, event) {
    const userId = String(interaction.user.id);

    if (event.status !== "lobby") {
        return interaction.reply({
            content: "❌ Chỉ có thể rời đội khi Bí Cảnh chưa bắt đầu.",
            ephemeral: true,
        });
    }

    const team = getUserTeam(event, userId);

    if (!team) {
        return interaction.reply({
            content: "❌ Bạn chưa ở trong đội nào.",
            ephemeral: true,
        });
    }

    const wasLeader = team.leaderId === userId;

    team.members = team.members.filter((id) => id !== userId);

    const channel = await event.guild.channels
        .fetch(team.channelId)
        .catch(() => null);

    /*
     * Xóa quyền xem kênh đội của
     * người vừa rời.
     */
    await channel?.permissionOverwrites.delete(userId).catch(() => undefined);

    if (team.members.length === 0) {
        event.teams = event.teams.filter((item) => item.id !== team.id);

        /*
         * Không xóa kênh chat để giữ
         * nguyên lịch sử.
         */
        await channel
            ?.send(
                "↩️ Đội đã giải tán. " +
                    "Kênh được giữ lại, bot không xóa lịch sử chat.",
            )
            .catch(() => undefined);
    } else {
        /*
         * Nếu đội trưởng rời, chuyển
         * quyền đội trưởng cho thành
         * viên đầu tiên còn lại.
         */
        if (wasLeader) {
            team.leaderId = team.members[0];
        }

        team.stats = buildBaseStats(team.members);

        setupTeamHp(team, true);

        const leaderText = wasLeader
            ? `\n👑 Đội trưởng mới: ${tag(team.leaderId)}.`
            : "";

        await channel
            ?.send(`↩️ ${tag(userId)} đã rời đội.` + leaderText)
            .catch(() => undefined);
    }

    await refreshLobby(event);

    return interaction.reply({
        content: `✅ Bạn đã rời ` + `**Đội ${team.no}**.`,

        ephemeral: true,
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
            `🔒 Bí cảnh đã khóa. ` +
                `**${event.teams.length} đội** tiến vào động phủ.`,
        )
        .catch(() => undefined);

    return startRound(event, 1);
}

async function startRound(event, round) {
    event.round = round;
    event.roundLocked = false;
    event.resolvingRound = null;

    for (const team of event.teams) {
        team.pathOptions = pickRandom(Object.keys(PATHS), 3);

        team.votes[`r${round}`] = {};

        team.pathMessageId = null;

        const lines = team.pathOptions
            .map((id) => {
                const path = PATHS[id];

                return `${path[0]} ` + `**${path[1]}** — ` + `${path[2]}`;
            })
            .join("\n");

        const channel = await event.guild.channels
            .fetch(team.channelId)
            .catch(() => null);

        const pathMessage = await channel
            ?.send({
                content:
                    `🕯️ **ROUND ${round}/${ROUND_MAX} — Chọn hướng đi**\n\n` +
                    `${lines}\n\n` +
                    statsLine(team),

                components: buildPathRows(event, team),
            })
            .catch(() => null);

        /*
         * Bắt buộc phải lưu ID tin nhắn.
         * Nếu không lưu, nút chọn đường
         * sẽ không được khóa khi hết giờ.
         */
        team.pathMessageId = pathMessage?.id || null;
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

async function lockPathVoteMessages(event, round) {
    await Promise.all(
        event.teams.map(async (team) => {
            if (!team.pathMessageId) {
                return;
            }

            const channel = await event.guild.channels
                .fetch(team.channelId)
                .catch(() => null);

            const message = await channel?.messages
                .fetch(team.pathMessageId)
                .catch(() => null);

            await message
                ?.edit({
                    components: buildPathRows(event, team, true),
                })
                .catch(() => undefined);
        }),
    );
}

function grantPuzzleReward(team, puzzle, eligibleUserIds = team.members) {
    const reward = puzzle.reward || {};

    const moneyRange = reward.money || [2000, 4000];

    team.stats.clue += Number(reward.clue || 1);

    team.stats.formation += Number(reward.formation || 3);

    team.stats.noise = Math.max(0, team.stats.noise - 4);

    const money = rnd(moneyRange[0], moneyRange[1]);

    /*
     * Chỉ người thực sự vote câu đố
     * mới nhận tiền câu đố.
     */
    for (const userId of eligibleUserIds) {
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

    const puzzleKey =
        `${Date.now()}` + `${Math.random().toString(36).slice(2, 7)}`;

    const channel = await event.guild.channels
        .fetch(team.channelId)
        .catch(() => null);

    if (!channel) {
        return "🧩 Cổ trận xuất hiện " + "nhưng kênh đội không còn tồn tại.";
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
            `⏳ Có **${PUZZLE_MS / 1000}s** để vote. ` +
            "Đáp án nhiều vote nhất sẽ được chọn.",

        components: buildPuzzleRows(event, team, puzzleKey),
    });

    state.message = message;

    return new Promise((resolve) => {
        setTimeout(async () => {
            activePuzzles.delete(puzzleKey);

            const chosenIndex = pickPuzzleVote(state);

            const correct = chosenIndex === Number(puzzle.answerIndex);

            if (correct) {
                /*
                 * Object.keys(state.votes)
                 * là danh sách người đã vote.
                 * Người không vote không nhận
                 * tiền câu đố.
                 */
                const eligibleUserIds = Object.keys(state.votes);

                const money = grantPuzzleReward(team, puzzle, eligibleUserIds);

                const rewardMemberText =
                    eligibleUserIds.length > 0
                        ? eligibleUserIds.map(tag).join(" ")
                        : "Không có ai";

                await message
                    .edit({
                        content:
                            message.content +
                            "\n\n✅ **Cổ trận được phá giải.**\n" +
                            `Đội chọn **${formatPuzzleAnswer(chosenIndex)}** và đã đúng.\n` +
                            `🧩 +${puzzle.reward?.clue || 1} manh mối, ` +
                            `🪤 +${puzzle.reward?.formation || 3} trận pháp.\n` +
                            `💰 Người nhận ${fmt(money)}: ${rewardMemberText}`,

                        components: buildPuzzleRows(
                            event,
                            team,
                            puzzleKey,
                            true,
                        ),
                    })
                    .catch(() => undefined);

                return resolve(
                    `✅ Đội phá giải Cổ Trận thành công. ` +
                        `Nhận +${puzzle.reward?.clue || 1} manh mối và quà cơ quan.`,
                );
            }

            applyPuzzleFail(team);

            await message
                .edit({
                    content:
                        message.content +
                        "\n\n💀 **Cổ trận phản phệ.**\n" +
                        (chosenIndex >= 0
                            ? `Đội chọn **${formatPuzzleAnswer(chosenIndex)}**, ` +
                              `đáp án đúng là **${formatPuzzleAnswer(puzzle.answerIndex)}**.\n`
                            : `Không ai chọn đáp án. ` +
                              `Đáp án đúng là **${formatPuzzleAnswer(puzzle.answerIndex)}**.\n`) +
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
    return Object.values(votes || {}).filter((item) => {
        return item === action;
    }).length;
}

function grantDuyenBossReward(
    team,
    type,
    success,
    helperIds = [],
    eligibleUserIds = team.members,
) {
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

    /*
     * Chỉ những thành viên đã thực hiện
     * hành động trong trận boss mới nhận quà.
     */
    for (const userId of eligibleUserIds) {
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
            `${tag(userId)}: ` +
                `💰 ${fmt(money)} • ` +
                `Mảnh Pháp Bảo x${fmt(fragment)}`,
        );
    }

    /*
     * Người từ đội khác bấm trợ giúp
     * vẫn nhận phần thưởng hỗ trợ.
     */
    for (const helperId of helperIds) {
        const money = rnd(7000, 15000);

        const fragment = rnd(10, 25);

        db.addMoney(helperId, money);

        db.addShopItem(helperId, "manh_phap_bao", fragment);

        lines.push(
            `🆘 ${tag(helperId)} trợ giúp: ` +
                `💰 ${fmt(money)} • ` +
                `Mảnh Pháp Bảo x${fmt(fragment)}`,
        );
    }

    if (lines.length <= 0) {
        lines.push(
            "😴 Không có thành viên nào thực hiện hành động nên không ai nhận quà boss.",
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
        return "👹 Boss xuất hiện " + "nhưng kênh đội không còn tồn tại.";
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

    const bossParticipantIds = new Set();

    let helped = false;

    await channel.send(
        `${bossConfig.emoji} ` +
            `**${bossConfig.name.toUpperCase()} XUẤT HIỆN**\n` +
            "Máu đội sẽ giữ xuyên suốt Bí Cảnh. " +
            "Đánh ngu là round sau đau tiếp.\n\n" +
            bossHpLine(team, boss),
    );

    for (let turn = 1; turn <= bossConfig.turns; turn += 1) {
        if (boss.hp <= 0 || team.hp <= 0) {
            break;
        }

        const bossKey =
            `${Date.now()}` + `${Math.random().toString(36).slice(2, 7)}`;

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
                `Chọn hành động trong **${BOSS_TURN_MS / 1000}s**. ` +
                "Vote sau sẽ đè vote trước.\n\n" +
                bossHpLine(team, boss),

            components: buildBossRows(
                event,
                team,
                bossKey,
                type === "major" && !helped,
            ),
        });

        await new Promise((resolve) => {
            setTimeout(resolve, BOSS_TURN_MS);
        });

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

        /*
         * Lưu tất cả thành viên đã bấm
         * hành động boss ở bất kỳ turn nào.
         */
        for (const participantId of Object.keys(state.votes)) {
            bossParticipantIds.add(participantId);
        }

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
                `⚔️ Công: **${attackCount}** | ` +
                `🛡️ Thủ: **${guardCount}** | ` +
                `💚 Hồi: **${healCount}** | ` +
                `😴 AFK: **${afkCount}**\n` +
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

    const rewardLines = grantDuyenBossReward(
        team,
        type,
        success,
        [...helperIds],
        [...bossParticipantIds],
    );

    if (!success && team.hp <= 0) {
        team.hp = 1;
    }

    await channel.send(
        success
            ? `✅ **${bossConfig.name} bị hạ.**\n` +
                  `🎁 ${rewardLines.join("\n")}`
            : `💀 **Không hạ được ${bossConfig.name}.** ` +
                  "Đội trọng thương nhưng vẫn lết tiếp.\n" +
                  `🎁 ${rewardLines.join("\n")}`,
    );

    return success
        ? `✅ Gặp và hạ **${bossConfig.name}**. ` +
              `Nhận quà boss, đội còn ❤️ ${fmt(team.hp)}/${fmt(team.maxHp)}.`
        : `💀 Gặp **${bossConfig.name}** nhưng đánh không lại. ` +
              `Đội còn ❤️ ${fmt(team.hp)}/${fmt(team.maxHp)}.`;
}
async function resolvePath(event, team, pathId) {
    let text = applyPath(team, pathId);

    if (pathId === "tran") {
        if (rnd(1, 100) <= PUZZLE_CHANCE_ON_TRAN_PATH) {
            const puzzleText = await runPuzzle(event, team);

            text = `${text}\n` + `${puzzleText}`;
        }
    }

    if (rnd(1, 100) <= MINI_BOSS_CHANCE) {
        const bossText = await runBossEncounter(event, team, "mini");

        text = `${text}\n` + `${bossText}`;
    }

    return text;
}

function applyPath(team, pathId) {
    if (pathId === "khong") {
        const roll = rnd(1, 100);

        if (roll <= 35) {
            team.stats.clue += 3;
            team.stats.trick += 8;

            return (
                "🌀 Không Gian Nứt đưa đội tới gần mạch cơ duyên. " +
                "Hơi có mùi buff bẩn."
            );
        }

        if (roll <= 70) {
            team.stats.combat += 10;
            team.stats.formation += 10;

            return "🌀 Không Gian Nứt không giàu " + "nhưng cũng không ngu.";
        }

        team.stats.fatigue += 18;
        team.stats.noise += 12;

        return "🌀 Đội bị Không Gian Nứt dắt đi vòng, " + "hơi mất mặt.";
    }

    const path = PATHS[pathId];

    /*
     * Tránh lỗi nếu dữ liệu đường đi
     * bị thiếu hoặc không hợp lệ.
     */
    if (!path) {
        return (
            "⚠️ Không xác định được lối đi. " +
            "Bot bỏ qua hiệu ứng của round này."
        );
    }

    const effect = path[3] || {};

    team.stats.combat += effect.combat || 0;

    team.stats.trick += effect.trick || 0;

    team.stats.formation += effect.formation || 0;

    team.stats.noise += effect.noise || 0;

    team.stats.fatigue += effect.fatigue || 0;

    team.stats.clue += effect.clue || 0;

    return `${path[0]} Đội chọn ` + `**${path[1]}**. ` + `${path[2]}`;
}

async function resolveRound(event) {
    /*
     * Chỉ được chốt một lần.
     * Nếu timer hoặc thao tác khác gọi
     * resolveRound lần hai thì bỏ qua.
     */
    if (event.status !== "explore" || event.roundLocked) {
        return;
    }

    const resolvingRound = event.round;

    /*
     * Khóa round ngay lập tức trước
     * khi chạy bất kỳ tác vụ async nào.
     */
    event.roundLocked = true;
    event.resolvingRound = resolvingRound;

    const timerKey = `round_${event.id}_${resolvingRound}`;

    const timer = timers.get(timerKey);

    if (timer) {
        clearTimeout(timer);
        timers.delete(timerKey);
    }

    /*
     * Chụp toàn bộ phiếu đúng tại thời điểm
     * round bị khóa.
     *
     * Sau đoạn này, phiếu gửi trễ sẽ không
     * thể thay đổi kết quả.
     */
    const snapshots = event.teams.map((team) => {
        const resolution = resolveVote(
            team,
            `r${resolvingRound}`,
            team.pathOptions,
        );

        team.choices[`r${resolvingRound}`] = resolution.choice;

        if (!team.choiceDetails) {
            team.choiceDetails = {};
        }

        team.choiceDetails[`r${resolvingRound}`] = resolution;

        return {
            team,
            resolution,
        };
    });

    await lockPathVoteMessages(event, resolvingRound);

    const results = [];

    for (const { team, resolution } of snapshots) {
        try {
            const pathText = await resolvePath(event, team, resolution.choice);

            team.stats.noise = Math.max(
                0,
                Math.round(Number(team.stats.noise || 0)),
            );

            team.stats.fatigue = Math.max(
                0,
                Math.round(Number(team.stats.fatigue || 0)),
            );

            results.push({
                team,

                text:
                    `${formatPathVoteResolution(team, resolution)}` +
                    `\n\n${pathText}`,
            });
        } catch (error) {
            console.error(
                `[Duyen resolveRound] ` +
                    `Lỗi xử lý đội ${team.no}, ` +
                    `round ${resolvingRound}:`,
                error,
            );

            results.push({
                team,

                text:
                    `${formatPathVoteResolution(team, resolution)}\n\n` +
                    "⚠️ Có lỗi khi xử lý hiệu ứng lối đi. " +
                    "Bot đã bỏ qua hiệu ứng để Bí Cảnh tiếp tục.",
            });
        }
    }

    for (const result of results) {
        const channel = await event.guild.channels
            .fetch(result.team.channelId)
            .catch(() => null);

        await channel
            ?.send(`${result.text}\n\n` + `${statsLine(result.team)}`)
            .catch(() => undefined);
    }

    if (resolvingRound >= ROUND_MAX) {
        return discoverOpportunity(event);
    }

    return startRound(event, resolvingRound + 1);
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
                `🐉 Đội ${finder.no} vừa chạm ` +
                    "**Boss Cơ Duyên**. " +
                    "Nếu kẹt quá có thể bấm " +
                    "**Gọi trợ giúp** trong kênh đội.",
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
                return `${option[0]} ` + `**${option[1]}** — ` + `${option[2]}`;
            })
            .join("\n");

        const channel = await event.guild.channels
            .fetch(team.channelId)
            .catch(() => null);

        const finalMessage = await channel
            ?.send({
                content: isFinder
                    ? "🌌 **ĐỘI BẠN PHÁT HIỆN LINH TRÌ TRUYỀN THỪA**\n\n" +
                      `${lines}\n\n` +
                      "Tìm được chưa chắc giữ được. " +
                      "Vote cách xử lý."
                    : "⚠️ **DAO ĐỘNG LINH KHÍ CỰC MẠNH**\n\n" +
                      "Có đội đã phát hiện Cơ Duyên Lớn. " +
                      "Vị trí chưa rõ.\n\n" +
                      `${lines}`,

                components: buildFinalRows(event, team, isFinder),
            })
            .catch(() => null);

        team.finalMessageId = finalMessage?.id || null;
    }

    await event.message
        ?.reply(
            "⚠️ Dao động linh khí cực mạnh! " +
                "Một đội đã phát hiện Cơ Duyên Lớn.",
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

function createUid(prefix = "pb") {
    return (
        `${prefix}_` +
        `${Date.now()}_` +
        `${Math.random().toString(36).slice(2, 8)}`
    );
}

function rollPercent(chance) {
    return Math.random() * 100 < Number(chance || 0);
}

function rollWeighted(pool) {
    const valid = Array.isArray(pool)
        ? pool.filter((item) => {
              return Number(item.weight || 0) > 0;
          })
        : [];

    const total = valid.reduce((sum, item) => {
        return sum + Number(item.weight || 0);
    }, 0);

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

        name: `Phôi Pháp Bảo ` + `${rarity.id} ` + "Chưa Giám Định",

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
        return `💰 ` + `${fmt(reward.amount)}`;
    }

    if (reward.type === "weapon") {
        return `🟦 Phôi Pháp Bảo ` + `**${reward.rarity}**`;
    }

    if (reward.type === "item") {
        const item = shop[reward.itemId];

        const name = item
            ? `${item.emoji || "🎁"} ${item.name}`
            : reward.itemId;

        return `${name} x` + `${fmt(reward.amount)}`;
    }

    return null;
}

function grantTeamRewards(
    team,
    tier = "loser",
    eligibleUserIds = team.members,
) {
    const config = DUYEN_REWARD_POOLS[tier] || DUYEN_REWARD_POOLS.loser;

    const lines = [];

    /*
     * Chỉ người có hoạt động mới nằm
     * trong eligibleUserIds.
     *
     * Người AFK không được tiền,
     * vật phẩm hoặc phôi pháp bảo.
     */
    for (const userId of eligibleUserIds) {
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
            `${tag(userId)}: ` +
                personalRewards.map(formatReward).filter(Boolean).join(" • "),
        );
    }

    /*
     * Phôi SS chỉ có thể rơi vào
     * người không AFK.
     */
    if (eligibleUserIds.length > 0 && rollPercent(config.ssPhoiChance)) {
        const luckyUserId = eligibleUserIds[rnd(0, eligibleUserIds.length - 1)];

        giveUnidentifiedWeapon(luckyUserId, "SS");

        lines.push(
            `🌌 **ĐẠI CƠ DUYÊN NỔ LỚN:** ` +
                `${tag(luckyUserId)} nhận ` +
                "**Phôi Pháp Bảo SS Chưa Giám Định**.",
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
        .filter((team) => {
            return team.finalChoice !== "ignore";
        })
        .sort((a, b) => {
            return b.finalScore - a.finalScore;
        })
        .slice(0, 5)
        .map((team, index) => {
            const source = team.id === finder.id ? FINDER : REACT;

            const choice = source[team.finalChoice];

            return (
                `${team.id === winner.id ? "🏆" : `${index + 1}.`} ` +
                `**${teamDramaName(team)}** — ` +
                `${team.finalScore} điểm — ` +
                `${choice?.[0]} ${choice?.[1]}`
            );
        })
        .join("\n");

    const drama = [];

    const attackers = event.teams.filter((team) => {
        return team.finalChoice === "attack";
    });

    const sneakers = event.teams.filter((team) => {
        return team.finalChoice === "sneak";
    });

    const ambushers = event.teams.filter((team) => {
        return team.finalChoice === "ambush";
    });

    if (finder.finalChoice === "hide") {
        drama.push(
            `🕶️ ${teamDramaName(finder)} che giấu khí tức, ` +
                "khiến vài đội mò đường như tìm nyc.",
        );
    }

    if (finder.finalChoice === "bait") {
        drama.push(
            `🩸 ${teamDramaName(finder)} đặt bẫy quanh Linh Trì. ` +
                "Ai lao vào quá hăng đều thành con lợn chết.",
        );
    }

    if (attackers.length >= 2) {
        drama.push(
            `⚔️ ${attackers.map(teamDramaName).join(", ")} ` +
                "lao vào tranh trực diện, quá nhiều con lợn phải trả giá.",
        );
    }

    if (sneakers.length > 0) {
        drama.push(
            `🕶️ ${sneakers.map(teamDramaName).join(", ")} ` +
                "chọn chim sẻ sau lưng.",
        );
    }

    if (ambushers.length > 0) {
        drama.push(
            `🪤 ${ambushers.map(teamDramaName).join(", ")} ` +
                "mai phục đường rút.",
        );
    }

    if (winner.id !== finder.id) {
        drama.push(
            `💀 ${teamDramaName(finder)} tìm ra cơ duyên trước ` +
                "nhưng không giữ được hết.",
        );
    }

    return (
        "🌌 **BÍ CẢNH TRUYỀN THỪA KHÉP LẠI**\n\n" +
        `🏆 **Đội thắng lớn:** ${teamDramaName(winner)}\n` +
        `🔎 **Đội phát hiện cơ duyên:** ${teamDramaName(finder)}\n\n` +
        `**BXH tranh đoạt:**\n` +
        `${topText || "Không có đội tranh đoạt."}\n\n` +
        `**Diễn biến:**\n` +
        `${
            drama.slice(0, 6).join("\n") || "Thiên Đạo thấy hơi ít drama."
        }\n\n` +
        "**Thiên Đạo kết luận:** Mạnh không sai. " +
        "Mạnh mà không biết chọn thời cơ thì vẫn ăn cám."
    );
}
/*
 * Hàm được giữ lại để tương thích với
 * các vị trí gọi cũ, nhưng không thực
 * hiện xóa kênh hay xóa tin nhắn.
 */
async function cleanup(event, delay) {
    return undefined;
}
async function handlePathVote(interaction, event, parts) {
    const teamId = parts[3];

    const round = Number(parts[4]);

    const pathId = parts[5];

    const userId = String(interaction.user.id);

    /*
     * Chỉ nhận phiếu trong giai đoạn
     * khám phá.
     */
    if (event.status !== "explore") {
        return interaction.reply({
            content: "❌ Hiện tại không phải giai đoạn chọn đường.",
            ephemeral: true,
        });
    }

    /*
     * Không nhận phiếu của round cũ
     * hoặc round chưa bắt đầu.
     */
    if (
        !Number.isInteger(round) ||
        round !== event.round ||
        event.roundLocked ||
        event.resolvingRound === round
    ) {
        return interaction.reply({
            content:
                "⏳ Round này đã khóa hoặc đã kết thúc. " +
                "Phiếu của bạn không được ghi nhận.",
            ephemeral: true,
        });
    }

    const team = event.teams.find((item) => {
        return item.id === teamId;
    });

    if (!team) {
        return interaction.reply({
            content: "❌ Không tìm thấy đội.",
            ephemeral: true,
        });
    }

    /*
     * Chỉ thành viên của đúng đội
     * mới được chọn đường.
     */
    if (!team.members.includes(userId)) {
        return interaction.reply({
            content: "❌ Bạn không thuộc đội này.",
            ephemeral: true,
        });
    }

    /*
     * Chỉ chấp nhận lối đi đang được
     * hiển thị trong round hiện tại.
     *
     * Điều này ngăn người dùng tự sửa
     * customId để vote đường khác.
     */
    if (!team.pathOptions.includes(pathId) || !PATHS[pathId]) {
        return interaction.reply({
            content: "❌ Lối đi này không hợp lệ trong round hiện tại.",
            ephemeral: true,
        });
    }

    const voteBucket = `r${round}`;

    if (!team.votes[voteBucket]) {
        team.votes[voteBucket] = {};
    }

    const previousVote = team.votes[voteBucket][userId] || null;

    /*
     * Mỗi thành viên có đúng một phiếu.
     * Vote mới sẽ ghi đè vote cũ của
     * chính người đó, không ảnh hưởng
     * phiếu của thành viên khác.
     */
    team.votes[voteBucket][userId] = pathId;

    markTeamActivity(team, userId);

    const path = PATHS[pathId];

    const counts = Object.fromEntries(
        team.pathOptions.map((optionId) => {
            return [optionId, 0];
        }),
    );

    for (const votedPathId of Object.values(team.votes[voteBucket])) {
        if (Object.prototype.hasOwnProperty.call(counts, votedPathId)) {
            counts[votedPathId] += 1;
        }
    }

    const tallyText = team.pathOptions
        .map((optionId) => {
            const option = PATHS[optionId];

            return (
                `${option?.[0] || "❓"} ` +
                `${option?.[1] || optionId}: ` +
                `**${counts[optionId] || 0}**`
            );
        })
        .join(" | ");

    return interaction.reply({
        content:
            `${previousVote ? "🔄 Đã đổi phiếu thành" : "✅ Đã chọn"} ` +
            `${path[0]} **${path[1]}**.\n` +
            `🗳️ Phiếu hiện tại: ${tallyText}\n\n` +
            "Khi hết giờ, lối có nhiều phiếu nhất sẽ được chọn. " +
            "Chỉ khi hòa phiếu mới dùng phiếu đội trưởng để phân định.",

        ephemeral: true,
    });
}

async function handlePuzzleVote(interaction, event, parts) {
    const teamId = parts[3];

    const puzzleKey = parts[4];

    const choiceIndex = Number(parts[5]);

    const userId = String(interaction.user.id);

    const team = event.teams.find((item) => {
        return item.id === teamId;
    });

    if (!team) {
        return interaction.reply({
            content: "❌ Không tìm thấy đội.",
            ephemeral: true,
        });
    }

    if (!team.members.includes(userId)) {
        return interaction.reply({
            content: "❌ Bạn không thuộc đội đang giải Cổ Trận.",
            ephemeral: true,
        });
    }

    const state = activePuzzles.get(puzzleKey);

    if (!state || state.eventId !== event.id || state.teamId !== team.id) {
        return interaction.reply({
            content: "⌛ Câu đố này đã kết thúc hoặc không còn tồn tại.",
            ephemeral: true,
        });
    }

    if (
        !Number.isInteger(choiceIndex) ||
        choiceIndex < 0 ||
        choiceIndex >= state.puzzle.choices.length
    ) {
        return interaction.reply({
            content: "❌ Đáp án không hợp lệ.",
            ephemeral: true,
        });
    }

    const previousVote = state.votes[userId];

    state.votes[userId] = choiceIndex;

    markTeamActivity(team, userId);

    const counts = [0, 0, 0, 0];

    for (const votedIndex of Object.values(state.votes)) {
        if (
            Number.isInteger(Number(votedIndex)) &&
            Number(votedIndex) >= 0 &&
            Number(votedIndex) < counts.length
        ) {
            counts[Number(votedIndex)] += 1;
        }
    }

    const tallyText = counts
        .map((count, index) => {
            return `**${formatPuzzleAnswer(index)}:** ${count}`;
        })
        .join(" | ");

    return interaction.reply({
        content:
            `${previousVote !== undefined ? "🔄 Đã đổi đáp án thành" : "✅ Đã chọn"} ` +
            `**${formatPuzzleAnswer(choiceIndex)}**.\n` +
            `🗳️ Phiếu hiện tại: ${tallyText}`,

        ephemeral: true,
    });
}

async function handleFinalVote(interaction, event, parts, isFinderVote) {
    const teamId = parts[3];

    const choiceId = parts[4];

    const userId = String(interaction.user.id);

    if (event.status !== "final") {
        return interaction.reply({
            content: "❌ Giai đoạn tranh đoạt đã kết thúc hoặc chưa bắt đầu.",
            ephemeral: true,
        });
    }

    const team = event.teams.find((item) => {
        return item.id === teamId;
    });

    if (!team) {
        return interaction.reply({
            content: "❌ Không tìm thấy đội.",
            ephemeral: true,
        });
    }

    if (!team.members.includes(userId)) {
        return interaction.reply({
            content: "❌ Bạn không thuộc đội này.",
            ephemeral: true,
        });
    }

    const teamIsFinder = team.id === event.finderId;

    /*
     * Đội tìm thấy cơ duyên chỉ được dùng
     * nhóm lựa chọn FINDER.
     *
     * Các đội còn lại chỉ được dùng
     * nhóm lựa chọn REACT.
     */
    if (teamIsFinder !== isFinderVote) {
        return interaction.reply({
            content: "❌ Loại lựa chọn này không dành cho đội của bạn.",
            ephemeral: true,
        });
    }

    const source = teamIsFinder ? FINDER : REACT;

    if (!Object.prototype.hasOwnProperty.call(source, choiceId)) {
        return interaction.reply({
            content: "❌ Lựa chọn tranh đoạt không hợp lệ.",
            ephemeral: true,
        });
    }

    if (!team.votes.final) {
        team.votes.final = {};
    }

    const previousVote = team.votes.final[userId] || null;

    team.votes.final[userId] = choiceId;

    markTeamActivity(team, userId);

    const option = source[choiceId];

    const counts = Object.fromEntries(
        Object.keys(source).map((optionId) => {
            return [optionId, 0];
        }),
    );

    for (const votedChoice of Object.values(team.votes.final)) {
        if (Object.prototype.hasOwnProperty.call(counts, votedChoice)) {
            counts[votedChoice] += 1;
        }
    }

    const tallyText = Object.entries(source)
        .map(([optionId, optionData]) => {
            return (
                `${optionData[0]} ${optionData[1]}: ` +
                `**${counts[optionId] || 0}**`
            );
        })
        .join(" | ");

    return interaction.reply({
        content:
            `${previousVote ? "🔄 Đã đổi lựa chọn thành" : "✅ Đã chọn"} ` +
            `${option[0]} **${option[1]}**.\n` +
            `🗳️ Phiếu hiện tại: ${tallyText}`,

        ephemeral: true,
    });
}
async function handleBossAction(interaction, event, parts) {
    const teamId = parts[3];

    const bossKey = parts[4];

    const action = parts[5];

    const userId = String(interaction.user.id);

    const team = event.teams.find((item) => {
        return item.id === teamId;
    });

    if (!team) {
        return interaction.reply({
            content: "❌ Không tìm thấy đội.",
            ephemeral: true,
        });
    }

    const state = activeBosses.get(bossKey);

    if (!state || state.eventId !== event.id || state.teamId !== team.id) {
        return interaction.reply({
            content: "⌛ Turn boss này đã kết thúc hoặc không còn tồn tại.",
            ephemeral: true,
        });
    }

    if (!Object.prototype.hasOwnProperty.call(BOSS_ACTIONS, action)) {
        return interaction.reply({
            content: "❌ Hành động boss không hợp lệ.",
            ephemeral: true,
        });
    }

    /*
     * Nút gọi trợ giúp được xử lý riêng.
     * Chỉ thành viên của đội đang đánh boss
     * mới có quyền gọi.
     */
    if (action === "call") {
        if (!team.members.includes(userId)) {
            return interaction.reply({
                content: "❌ Bạn không thuộc đội đang đánh boss.",
                ephemeral: true,
            });
        }

        if (state.bossType !== "major") {
            return interaction.reply({
                content: "❌ Chỉ Boss Cơ Duyên lớn mới có thể gọi trợ giúp.",
                ephemeral: true,
            });
        }

        if (state.helpCalled) {
            return interaction.reply({
                content: "❌ Đội đã gọi trợ giúp trong turn này rồi.",
                ephemeral: true,
            });
        }

        state.helpCalled = true;

        markTeamActivity(team, userId);

        const publicChannel = await event.guild.channels
            .fetch(event.channelId)
            .catch(() => null);

        if (!publicChannel) {
            return interaction.reply({
                content:
                    "⚠️ Đã ghi nhận gọi trợ giúp nhưng không tìm thấy kênh chung.",
                ephemeral: true,
            });
        }

        const supportRows = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `duyen_support_${event.id}_${team.id}_${bossKey}`,
                    )
                    .setEmoji("🆘")
                    .setLabel(`Trợ giúp Đội ${team.no}`)
                    .setStyle(ButtonStyle.Success),
            ),
        ];

        const publicMessage = await publicChannel
            .send({
                content:
                    `🆘 **ĐỘI ${team.no} ĐANG BỊ BOSS ÉP GÓC**\n` +
                    `${tag(userId)} đã phát tín hiệu cầu cứu.\n\n` +
                    "Thành viên đội khác có thể bấm nút bên dưới để hỗ trợ. " +
                    "Người hỗ trợ sẽ nhận phần thưởng nếu trận đấu kết thúc.",

                components: supportRows,
            })
            .catch(() => null);

        state.publicMessage = publicMessage;

        return interaction.reply({
            content:
                "🆘 Đã phát tín hiệu gọi trợ giúp ra kênh chung.\n" +
                "Việc gọi trợ giúp làm đội tăng dấu vết sau khi turn kết thúc.",

            ephemeral: true,
        });
    }

    /*
     * Công, thủ và hồi máu chỉ dành
     * cho thành viên đội đang đánh boss.
     */
    if (!team.members.includes(userId)) {
        return interaction.reply({
            content: "❌ Bạn không thuộc đội đang đánh boss.",
            ephemeral: true,
        });
    }

    const previousAction = state.votes[userId] || null;

    state.votes[userId] = action;

    markTeamActivity(team, userId);

    const option = BOSS_ACTIONS[action];

    const attackCount = countBossActions(state.votes, "attack");

    const guardCount = countBossActions(state.votes, "guard");

    const healCount = countBossActions(state.votes, "heal");

    return interaction.reply({
        content:
            `${previousAction ? "🔄 Đã đổi hành động thành" : "✅ Đã chọn"} ` +
            `${option[0]} **${option[1]}**.\n` +
            `⚔️ Công: **${attackCount}** | ` +
            `🛡️ Thủ: **${guardCount}** | ` +
            `💚 Hồi: **${healCount}**`,

        ephemeral: true,
    });
}

async function handleBossSupport(interaction, event, parts) {
    const teamId = parts[3];

    const bossKey = parts[4];

    const userId = String(interaction.user.id);

    const targetTeam = event.teams.find((item) => {
        return item.id === teamId;
    });

    if (!targetTeam) {
        return interaction.reply({
            content: "❌ Không tìm thấy đội đang cần trợ giúp.",
            ephemeral: true,
        });
    }

    const state = activeBosses.get(bossKey);

    if (
        !state ||
        state.eventId !== event.id ||
        state.teamId !== targetTeam.id
    ) {
        return interaction.reply({
            content: "⌛ Lời kêu gọi này đã hết hiệu lực.",
            ephemeral: true,
        });
    }

    if (!state.helpCalled) {
        return interaction.reply({
            content: "❌ Đội này chưa phát tín hiệu cầu cứu.",
            ephemeral: true,
        });
    }

    /*
     * Thành viên đội đang đánh boss
     * không thể tự bấm hỗ trợ đội mình.
     */
    if (targetTeam.members.includes(userId)) {
        return interaction.reply({
            content: "❌ Bạn không thể tự trợ giúp chính đội mình.",
            ephemeral: true,
        });
    }

    const helperTeam = getUserTeam(event, userId);

    if (!helperTeam) {
        return interaction.reply({
            content:
                "❌ Bạn phải là thành viên của một đội trong Bí Cảnh mới có thể hỗ trợ.",
            ephemeral: true,
        });
    }

    if (state.helpers.has(userId)) {
        return interaction.reply({
            content: "❌ Bạn đã trợ giúp turn này rồi.",
            ephemeral: true,
        });
    }

    state.helpers.add(userId);

    /*
     * Sức mạnh hỗ trợ dựa trên đội
     * của người bấm trợ giúp.
     */
    const supportPower = Math.max(
        8,
        Math.round(
            Number(helperTeam.stats.combat || 0) * 0.18 +
                Number(helperTeam.stats.trick || 0) * 0.12 +
                Number(helperTeam.stats.formation || 0) * 0.15 +
                rnd(5, 18),
        ),
    );

    state.supportPower += supportPower;

    markTeamActivity(helperTeam, userId);

    return interaction.reply({
        content:
            `🆘 Bạn đã trợ giúp **Đội ${targetTeam.no}**.\n` +
            `💥 Sức mạnh hỗ trợ: **+${fmt(supportPower)}** sát thương.\n` +
            "Nếu trận boss kết thúc, bạn sẽ nhận quà hỗ trợ.",

        ephemeral: true,
    });
}

async function handleStartEarly(interaction, event) {
    if (!isDuyenAdmin(interaction)) {
        return interaction.reply({
            content: "❌ Chỉ quản trị viên Bí Cảnh mới được bắt đầu sớm.",
            ephemeral: true,
        });
    }

    if (event.status !== "lobby") {
        return interaction.reply({
            content: "❌ Bí Cảnh đã bắt đầu hoặc đã kết thúc.",
            ephemeral: true,
        });
    }

    await interaction.reply({
        content: "🔒 Đang khóa đội và bắt đầu Bí Cảnh...",
        ephemeral: true,
    });

    return beginExplore(event);
}

async function handleInteraction(interaction) {
    if (!interaction.guildId) {
        return false;
    }

    if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
        return false;
    }

    const customId = String(interaction.customId || "");

    if (!customId.startsWith("duyen_")) {
        return false;
    }

    const parts = customId.split("_");

    const action = parts[1];

    const eventId = parts[2];

    const event = findEvent(eventId);

    if (!event) {
        await interaction
            .reply({
                content:
                    "⌛ Bí Cảnh này không còn hoạt động hoặc bot vừa khởi động lại.",
                ephemeral: true,
            })
            .catch(() => undefined);

        return true;
    }

    try {
        if (action === "create") {
            await createTeam(interaction, event, false);
            return true;
        }

        if (action === "solo") {
            await createTeam(interaction, event, true);
            return true;
        }

        if (action === "join") {
            await showJoinMenu(interaction, event);
            return true;
        }

        if (action === "joinselect") {
            const teamId = interaction.values?.[0];

            if (!teamId) {
                await interaction.reply({
                    content: "❌ Bạn chưa chọn đội.",
                    ephemeral: true,
                });

                return true;
            }

            await joinTeam(interaction, event, teamId);
            return true;
        }

        if (action === "leave") {
            await leaveTeam(interaction, event);
            return true;
        }

        if (action === "start") {
            await handleStartEarly(interaction, event);
            return true;
        }

        if (action === "path") {
            await handlePathVote(interaction, event, parts);
            return true;
        }

        if (action === "puzzle") {
            await handlePuzzleVote(interaction, event, parts);
            return true;
        }

        if (action === "finder") {
            await handleFinalVote(interaction, event, parts, true);
            return true;
        }

        if (action === "react") {
            await handleFinalVote(interaction, event, parts, false);
            return true;
        }

        if (action === "boss") {
            await handleBossAction(interaction, event, parts);
            return true;
        }

        if (action === "support") {
            await handleBossSupport(interaction, event, parts);
            return true;
        }

        await interaction.reply({
            content: "❌ Không nhận diện được thao tác Bí Cảnh.",
            ephemeral: true,
        });

        return true;
    } catch (error) {
        console.error("[Duyen handleInteraction]", error);

        const payload = {
            content:
                "⚠️ Có lỗi khi xử lý thao tác Bí Cảnh. " +
                "Phiếu hoặc hành động có thể chưa được ghi nhận.",

            ephemeral: true,
        };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(payload).catch(() => undefined);
        } else {
            await interaction.reply(payload).catch(() => undefined);
        }

        return true;
    }
}
async function showLastResult(interaction) {
    if (!interaction.guildId) {
        return interaction.reply({
            content: "❌ Lệnh này chỉ dùng trong máy chủ.",
            ephemeral: true,
        });
    }

    const channelKey = getDuyenResultKey(
        interaction.guildId,
        interaction.channelId,
    );

    const guildKey = getDuyenResultKey(interaction.guildId);

    const result = db.getSystemValue(channelKey) || db.getSystemValue(guildKey);

    if (!result) {
        return interaction.reply({
            content: "📭 Chưa có kết quả Bí Cảnh nào được lưu.",
            ephemeral: true,
        });
    }

    const createdAt = Number(result.createdAt || 0);

    const timeText = createdAt
        ? `<t:${Math.floor(createdAt / 1000)}:F>`
        : "Không xác định";

    const lines = [
        "🌌 **KẾT QUẢ BÍ CẢNH GẦN NHẤT**",
        "",
        `🕒 Thời gian: ${timeText}`,
    ];

    if (result.winnerTeamNo) {
        lines.push(`🏆 Đội thắng: **Đội ${result.winnerTeamNo}**`);
    }

    if (result.winnerMembers?.length) {
        lines.push(`👥 Thành viên: ${result.winnerMembers.map(tag).join(" ")}`);
    }

    if (result.finderTeamNo) {
        lines.push(`🔍 Đội tìm thấy Cơ Duyên: **Đội ${result.finderTeamNo}**`);
    }

    if (Array.isArray(result.rankings) && result.rankings.length > 0) {
        lines.push("", "📊 **Xếp hạng:**");

        for (const ranking of result.rankings) {
            lines.push(
                `**#${ranking.rank} — Đội ${ranking.teamNo}** ` +
                    `• Điểm: **${fmt(ranking.score)}** ` +
                    `• Lựa chọn: **${ranking.choiceLabel || "Không rõ"}**`,
            );
        }
    }

    if (result.summary) {
        lines.push("", result.summary);
    }

    const chunks = splitLongText(lines.join("\n"));

    if (chunks.length <= 0) {
        return interaction.reply({
            content: "📭 Kết quả được lưu nhưng không có nội dung hiển thị.",
            ephemeral: true,
        });
    }

    await interaction.reply({
        content: chunks.shift(),
        ephemeral: true,
    });

    for (const content of chunks) {
        await interaction
            .followUp({
                content,
                ephemeral: true,
            })
            .catch(() => undefined);
    }

    return undefined;
}

function getFinalChoiceLabel(team, finder) {
    const source = team.id === finder.id ? FINDER : REACT;

    const option = source[team.finalChoice];

    return option?.[1] || team.finalChoice || "Không chọn";
}

function buildFinalVoteResolution(team, finder) {
    const source = team.id === finder.id ? FINDER : REACT;

    const resolution = team.finalVoteDetails;

    if (!resolution) {
        return "🗳️ Không có dữ liệu chốt phiếu.";
    }

    const tally = Object.keys(source)
        .map((choiceId) => {
            const option = source[choiceId];

            return (
                `${option[0]} ${option[1]}: ` +
                `**${resolution.counts[choiceId] || 0}**`
            );
        })
        .join(" | ");

    const reasonText = {
        majority: "nhiều phiếu nhất",

        leader_tiebreak: "hòa phiếu, ưu tiên phiếu đội trưởng",

        display_order_tiebreak: "hòa phiếu, ưu tiên lựa chọn hiển thị trước",

        no_vote_default_first: "không có phiếu, chọn lựa chọn đầu tiên",

        no_option: "không có lựa chọn hợp lệ",
    }[resolution.reason];

    const selected = source[resolution.choice];

    return (
        `🗳️ **Chốt chiến thuật:** ${tally}\n` +
        `➡️ Kết quả: ` +
        `${selected?.[0] || "❓"} ` +
        `**${selected?.[1] || resolution.choice || "Không xác định"}**` +
        (reasonText ? ` (${reasonText}).` : ".")
    );
}

async function lockFinalVoteMessages(event, finder) {
    await Promise.all(
        event.teams.map(async (team) => {
            if (!team.finalMessageId) {
                return;
            }

            const channel = await event.guild.channels
                .fetch(team.channelId)
                .catch(() => null);

            const message = await channel?.messages
                .fetch(team.finalMessageId)
                .catch(() => null);

            await message
                ?.edit({
                    components: buildFinalRows(
                        event,
                        team,
                        team.id === finder.id,
                        true,
                    ),
                })
                .catch(() => undefined);
        }),
    );
}

function getRewardPoolForTeam(team, winner, finder) {
    if (team.id === winner.id) {
        return {
            id: "winner",
            config: DUYEN_REWARD_POOLS.winner,
        };
    }

    if (team.id !== finder.id && team.finalChoice === "ignore") {
        return {
            id: "ignore",
            config: DUYEN_REWARD_POOLS.ignore,
        };
    }

    const sortedTeams = [...winner.eventTeams].sort((a, b) => {
        return b.finalScore - a.finalScore;
    });

    const position = sortedTeams.findIndex((item) => {
        return item.id === team.id;
    });

    if (position === 1) {
        return {
            id: "runner",
            config: DUYEN_REWARD_POOLS.runner,
        };
    }

    return {
        id: "loser",
        config: DUYEN_REWARD_POOLS.loser,
    };
}

function grantFinalReward(userId, poolConfig) {
    const rewards = [];

    const money = rnd(poolConfig.money[0], poolConfig.money[1]);

    db.addMoney(userId, money);

    rewards.push({
        type: "money",
        amount: money,
    });

    const rolls = Math.max(0, Number(poolConfig.rolls || 0));

    for (let index = 0; index < rolls; index += 1) {
        const rolled = rollWeighted(poolConfig.pool);

        const reward = giveRewardItem(userId, rolled);

        if (reward) {
            rewards.push(reward);
        }
    }

    if (rollPercent(poolConfig.ssPhoiChance)) {
        giveUnidentifiedWeapon(userId, "SS");

        rewards.push({
            type: "weapon",
            rarity: "SS",
        });
    }

    return rewards;
}

function formatUserRewardLine(userId, rewards) {
    const groupedItems = new Map();

    const formatted = [];

    for (const reward of rewards) {
        if (reward.type === "item") {
            const key = reward.itemId;

            groupedItems.set(
                key,
                Number(groupedItems.get(key) || 0) + Number(reward.amount || 0),
            );

            continue;
        }

        const text = formatReward(reward);

        if (text) {
            formatted.push(text);
        }
    }

    for (const [itemId, amount] of groupedItems.entries()) {
        const item =
            shop.getItem?.(itemId) ||
            shop.items?.find?.((entry) => entry.id === itemId) ||
            null;

        formatted.push(
            `${item?.emoji || "🎁"} ` +
                `${item?.name || itemId} x${fmt(amount)}`,
        );
    }

    return (
        `${tag(userId)}: ` +
        (formatted.length > 0 ? formatted.join(" • ") : "Không có phần thưởng.")
    );
}

async function grantTeamFinalRewards(
    event,
    team,
    winner,
    finder,
    activeOnly = true,
) {
    const activeIds = new Set(getActiveMemberIds(team));

    const eligibleIds = activeOnly
        ? team.members.filter((userId) => {
              return activeIds.has(String(userId));
          })
        : [...team.members];

    const afkIds = team.members.filter((userId) => {
        return !activeIds.has(String(userId));
    });

    const sortedTeams = [...event.teams].sort((a, b) => {
        return b.finalScore - a.finalScore;
    });

    let poolConfig = DUYEN_REWARD_POOLS.loser;

    let poolId = "loser";

    if (team.id === winner.id) {
        poolConfig = DUYEN_REWARD_POOLS.winner;
        poolId = "winner";
    } else if (sortedTeams[1]?.id === team.id) {
        poolConfig = DUYEN_REWARD_POOLS.runner;
        poolId = "runner";
    } else if (team.finalChoice === "ignore") {
        poolConfig = DUYEN_REWARD_POOLS.ignore;
        poolId = "ignore";
    }

    const rewardLines = [];

    for (const userId of eligibleIds) {
        const rewards = grantFinalReward(userId, poolConfig);

        rewardLines.push(formatUserRewardLine(userId, rewards));
    }

    /*
     * Người không thực hiện bất kỳ hành động
     * hợp lệ nào trong toàn bộ Bí Cảnh:
     *
     * - Không nhận phần thưởng cuối.
     * - Bị cấm tham gia Bí Cảnh kế tiếp.
     */
    for (const userId of afkIds) {
        setAfkBanForNextEvent(event, userId);

        rewardLines.push(
            `😴 ${tag(userId)}: AFK, không nhận quà và bị cấm tham gia lượt kế tiếp.`,
        );
    }

    return {
        poolId,
        eligibleIds,
        afkIds,
        rewardLines,
    };
}

async function resolveFinal(event) {
    if (event.status !== "final") {
        return;
    }

    event.status = "resolving_final";

    const timerKey = `final_${event.id}`;

    const timer = timers.get(timerKey);

    if (timer) {
        clearTimeout(timer);
        timers.delete(timerKey);
    }

    const finder = event.teams.find((team) => {
        return team.id === event.finderId;
    });

    if (!finder) {
        console.error("[Duyen resolveFinal] Không tìm thấy đội finder.");

        return finishEventWithError(event);
    }

    for (const team of event.teams) {
        const source =
            team.id === finder.id ? Object.keys(FINDER) : Object.keys(REACT);

        const resolution = resolveVote(team, "final", source);

        team.finalChoice = resolution.choice;

        team.finalVoteDetails = resolution;
    }

    await lockFinalVoteMessages(event, finder);

    // Tính điểm
    for (const team of event.teams) {
        team.finalScore = calculateFinalScore(event, team, finder);
    }

    // Xếp hạng: điểm cao hơn thắng
    const ranking = [...event.teams].sort((a, b) => {
        // 1. Điểm cao hơn đứng trước
        if (b.finalScore !== a.finalScore) {
            return b.finalScore - a.finalScore;
        }

        // 2. Nếu bằng điểm thì ưu tiên đội tìm thấy cơ duyên
        if (a.id === finder.id && b.id !== finder.id) {
            return -1;
        }

        if (b.id === finder.id && a.id !== finder.id) {
            return 1;
        }

        // 3. Cuối cùng giữ thứ tự đội
        return a.no - b.no;
    });

    const winner = ranking[0] || null;
    const runner = ranking[1] || null;
    /*
     * Gắn tạm danh sách đội để một số hàm
     * phần thưởng có thể xác định thứ hạng.
     */
    for (const team of event.teams) {
        team.eventTeams = event.teams;
    }

    const winner = [...event.teams].sort((a, b) => {
        const scoreDiff = Number(b.finalScore || 0) - Number(a.finalScore || 0);

        if (scoreDiff !== 0) {
            return scoreDiff;
        }

        // Nếu hòa điểm, ưu tiên đội tìm thấy cơ duyên.
        if (a.id === finder.id) {
            return -1;
        }

        if (b.id === finder.id) {
            return 1;
        }

        // Nếu vẫn hòa, ưu tiên đội có số nhỏ hơn.
        return Number(a.no || 999) - Number(b.no || 999);
    })[0];

    const sortedTeams = [...event.teams].sort((a, b) => {
        return b.finalScore - a.finalScore;
    });

    const teamRewardResults = new Map();

    for (const team of event.teams) {
        const rewardResult = await grantTeamFinalRewards(
            event,
            team,
            winner,
            finder,
            true,
        );

        teamRewardResults.set(team.id, rewardResult);
    }

    for (const team of event.teams) {
        const channel = await event.guild.channels
            .fetch(team.channelId)
            .catch(() => null);

        const rewardResult = teamRewardResults.get(team.id);

        const position =
            sortedTeams.findIndex((item) => {
                return item.id === team.id;
            }) + 1;

        const resultTitle =
            team.id === winner.id
                ? "🏆 **ĐỘI BẠN GIÀNH ĐƯỢC CƠ DUYÊN**"
                : `📊 **ĐỘI BẠN XẾP HẠNG #${position}**`;

        const resultText =
            `${resultTitle}\n\n` +
            `${buildFinalVoteResolution(team, finder)}\n\n` +
            `🎯 Điểm tranh đoạt: **${fmt(team.finalScore)}**\n` +
            `🔍 Đội tìm thấy: **Đội ${finder.no}**\n` +
            `🏆 Đội chiến thắng: **Đội ${winner.no}**\n\n` +
            `🎁 **Phần thưởng:**\n` +
            `${rewardResult.rewardLines.join("\n")}`;

        await sendLongMessage(channel, resultText).catch(() => undefined);
    }

    const rankingLines = sortedTeams.map((team, index) => {
        const choiceLabel = getFinalChoiceLabel(team, finder);

        return (
            `**#${index + 1} — Đội ${team.no}** ` +
            `• ${fmt(team.finalScore)} điểm ` +
            `• ${choiceLabel}`
        );
    });

    const publicResult =
        "🌌 **BÍ CẢNH TRUYỀN THỪA KẾT THÚC**\n\n" +
        `🏆 **Đội ${winner.no}** giành được Cơ Duyên Lớn!\n` +
        `👥 ${winner.members.map(tag).join(" ")}\n\n` +
        `🔍 Đội phát hiện đầu tiên: **Đội ${finder.no}**\n\n` +
        `📊 **Xếp hạng:**\n${rankingLines.join("\n")}`;

    const publicChannel = await event.guild.channels
        .fetch(event.channelId)
        .catch(() => null);

    await sendLongMessage(publicChannel, publicResult).catch(() => undefined);

    const storedResult = {
        eventId: event.id,
        createdAt: Date.now(),

        channelId: event.channelId,

        winnerTeamNo: winner.no,
        winnerMembers: [...winner.members],

        finderTeamNo: finder.no,

        rankings: sortedTeams.map((team, index) => {
            return {
                rank: index + 1,
                teamNo: team.no,
                score: team.finalScore,
                choice: team.finalChoice,
                choiceLabel: getFinalChoiceLabel(team, finder),
                members: [...team.members],
            };
        }),

        summary:
            `🏆 Đội ${winner.no} chiến thắng với ` +
            `**${fmt(winner.finalScore)}** điểm.`,
    };

    db.setSystemValue(getDuyenResultKey(event.guild.id), storedResult);

    db.setSystemValue(
        getDuyenResultKey(event.guild.id, event.channelId),
        storedResult,
    );

    event.status = "finished";

    events.delete(event.key);

    return cleanup(event);
}
async function finishEventWithError(event) {
    if (!event) {
        return;
    }

    event.status = "error";

    /*
     * Dừng toàn bộ timer liên quan
     * đến Bí Cảnh hiện tại.
     */
    for (const [timerKey, timer] of timers.entries()) {
        if (!timerKey.includes(event.id)) {
            continue;
        }

        clearTimeout(timer);
        timers.delete(timerKey);
    }

    const publicChannel = await event.guild?.channels
        .fetch(event.channelId)
        .catch(() => null);

    await publicChannel
        ?.send(
            "⚠️ **Bí Cảnh gặp lỗi khi tổng kết.**\n" +
                "Sự kiện đã được đóng để tránh phát thưởng hoặc xử lý trùng.\n" +
                "Kênh đội và lịch sử chat vẫn được giữ nguyên.",
        )
        .catch(() => undefined);

    /*
     * Thông báo riêng trong từng kênh đội.
     */
    for (const team of event.teams || []) {
        const teamChannel = await event.guild.channels
            .fetch(team.channelId)
            .catch(() => null);

        await teamChannel
            ?.send(
                "⚠️ Bí Cảnh gặp lỗi khi tổng kết.\n" +
                    "Bot không xóa kênh hoặc lịch sử chat của đội.",
            )
            .catch(() => undefined);
    }

    events.delete(event.key);

    return cleanup(event);
}

/*
 * Không xóa kênh, không xóa category
 * và không xóa kết quả.
 *
 * Hàm này chỉ dừng timer và dọn trạng thái
 * tạm đang nằm trong bộ nhớ.
 */
async function cleanup(event, delay = 0) {
    if (!event) {
        return;
    }

    if (delay > 0) {
        await new Promise((resolve) => {
            setTimeout(resolve, delay);
        });
    }

    /*
     * Dừng tất cả timer thuộc event.
     */
    for (const [timerKey, timer] of timers.entries()) {
        if (!timerKey.includes(event.id)) {
            continue;
        }

        clearTimeout(timer);
        timers.delete(timerKey);
    }

    /*
     * Xóa các câu đố tạm thuộc event.
     */
    for (const [puzzleKey, state] of activePuzzles.entries()) {
        if (state.eventId !== event.id) {
            continue;
        }

        activePuzzles.delete(puzzleKey);
    }

    /*
     * Xóa các trạng thái boss tạm
     * thuộc event.
     */
    for (const [bossKey, state] of activeBosses.entries()) {
        if (state.eventId !== event.id) {
            continue;
        }

        if (state.publicMessage) {
            await state.publicMessage
                .edit({
                    components: [],
                })
                .catch(() => undefined);
        }

        activeBosses.delete(bossKey);
    }

    /*
     * Chỉ xóa sự kiện khỏi bộ nhớ.
     *
     * Không gọi channel.delete().
     * Không gọi message.delete().
     * Không xóa category.
     */
    events.delete(event.key);
}

function hasActiveEvent(guildId, channelId) {
    return events.has(eventKey(guildId, channelId));
}

function getActiveEvent(guildId, channelId) {
    return events.get(eventKey(guildId, channelId)) || null;
}

function getActiveEvents() {
    return [...events.values()];
}

async function forceStop(interaction) {
    const key = eventKey(interaction.guildId, interaction.channelId);

    const event = events.get(key);

    if (!event) {
        return interaction.reply({
            content: "❌ Kênh này không có Bí Cảnh đang hoạt động.",
            ephemeral: true,
        });
    }

    if (!isDuyenAdmin(interaction)) {
        return interaction.reply({
            content: "❌ Bạn không có quyền dừng Bí Cảnh.",
            ephemeral: true,
        });
    }

    event.status = "stopped";

    await interaction.reply({
        content:
            "🛑 Đã dừng Bí Cảnh.\n" +
            "Kênh đội và toàn bộ lịch sử chat vẫn được giữ nguyên.",
        ephemeral: true,
    });

    const publicChannel = await event.guild.channels
        .fetch(event.channelId)
        .catch(() => null);

    await publicChannel
        ?.send(
            "🛑 **Bí Cảnh đã bị quản trị viên dừng.**\n" +
                "Không có phần thưởng tổng kết.\n" +
                "Các kênh và tin nhắn không bị xóa.",
        )
        .catch(() => undefined);

    for (const team of event.teams) {
        const teamChannel = await event.guild.channels
            .fetch(team.channelId)
            .catch(() => null);

        await teamChannel
            ?.send(
                "🛑 Bí Cảnh đã bị quản trị viên dừng.\n" +
                    "Kênh đội được giữ nguyên.",
            )
            .catch(() => undefined);
    }

    return cleanup(event);
}

module.exports = {
    /*
     * Mở Bí Cảnh bằng interaction.
     */
    start,

    /*
     * Mở Bí Cảnh tự động theo config.
     */
    autoStart,

    /*
     * Nhận và xử lý button/select menu
     * bắt đầu bằng customId duyen_.
     */
    handleInteraction,

    /*
     * Hiển thị kết quả gần nhất.
     */
    showLastResult,

    /*
     * Dừng sự kiện thủ công.
     */
    forceStop,

    /*
     * Các hàm trạng thái hỗ trợ
     * cho command hoặc scheduler.
     */
    hasActiveEvent,
    getActiveEvent,
    getActiveEvents,

    /*
     * Xuất ra để tương thích với
     * những file cũ đang gọi trực tiếp.
     */
    cleanup,
};
