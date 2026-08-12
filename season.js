const { EmbedBuilder } = require("discord.js");

const database = require("./database");
const leaderboardConfig = require("./config/leaderboard");
const { giveUnidentifiedWeaponReward } = require("./phapbao");

const SEASON_STATE_KEY = "seasonLeague";
const DEFAULT_DURATION_DAYS = 15;
const AUTO_CHECK_INTERVAL_MS = 5 * 60 * 1000;

let autoSeasonInterval = null;
let isProcessingSeason = false;

const RANK_POINTS = [
    100, // Hạng 1
    85, // Hạng 2
    70, // Hạng 3
    60, // Hạng 4
    52, // Hạng 5
    45, // Hạng 6
    38, // Hạng 7
    32, // Hạng 8
    27, // Hạng 9
    22, // Hạng 10
    15, // Hạng 11
    15, // Hạng 12
    15, // Hạng 13
    15, // Hạng 14
    15, // Hạng 15
    8, // Hạng 16
    8, // Hạng 17
    8, // Hạng 18
    8, // Hạng 19
    8, // Hạng 20
];

const REWARDS = {
    1: {
        exChests: 2,
        fragments: 1200,
        weaponRarity: null,
        label: "2 Rương Quán Quân EX + 1.200 Mảnh Pháp Bảo",
    },

    2: {
        exChests: 1,
        fragments: 800,
        weaponRarity: "SSS",
        label: "1 Rương Quán Quân EX + 1 Phôi SSS + 800 Mảnh Pháp Bảo",
    },

    3: {
        exChests: 1,
        fragments: 600,
        weaponRarity: null,
        label: "1 Rương Quán Quân EX + 600 Mảnh Pháp Bảo",
    },

    4: {
        exChests: 0,
        fragments: 500,
        weaponRarity: "SSS",
        label: "1 Phôi SSS + 500 Mảnh Pháp Bảo",
    },

    5: {
        exChests: 0,
        fragments: 400,
        weaponRarity: "SSS",
        label: "1 Phôi SSS + 400 Mảnh Pháp Bảo",
    },

    6: {
        exChests: 0,
        fragments: 300,
        weaponRarity: "SS",
        label: "1 Phôi SS + 300 Mảnh Pháp Bảo",
    },

    7: {
        exChests: 0,
        fragments: 300,
        weaponRarity: "SS",
        label: "1 Phôi SS + 300 Mảnh Pháp Bảo",
    },

    8: {
        exChests: 0,
        fragments: 200,
        weaponRarity: "S",
        label: "1 Phôi S + 200 Mảnh Pháp Bảo",
    },

    9: {
        exChests: 0,
        fragments: 200,
        weaponRarity: "S",
        label: "1 Phôi S + 200 Mảnh Pháp Bảo",
    },

    10: {
        exChests: 0,
        fragments: 200,
        weaponRarity: "S",
        label: "1 Phôi S + 200 Mảnh Pháp Bảo",
    },
};

const usernameCache = new Map();
const USERNAME_CACHE_TTL_MS = 60 * 60 * 1000;

function formatNumber(value) {
    return Number(value || 0).toLocaleString("vi-VN");
}

function formatDate(timestamp) {
    if (!timestamp) {
        return "Chưa xác định";
    }

    return new Date(timestamp).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
    });
}

function getExcludedUserIds() {
    return new Set(
        Array.isArray(leaderboardConfig.excludedUserIds)
            ? leaderboardConfig.excludedUserIds.map(String)
            : [],
    );
}

function getSeasonState() {
    return database.getSystemValue(SEASON_STATE_KEY) || null;
}

function getSeasonStats(user, seasonId) {
    if (
        !user.seasonStats ||
        String(user.seasonStats.seasonId) !== String(seasonId)
    ) {
        return null;
    }

    return user.seasonStats;
}

function getRankPoints(index) {
    return Number(RANK_POINTS[index] || 0);
}

function calculateNoiTuScore(stats) {
    const noitu = stats?.noitu || {};

    return (
        Number(noitu.correct || 0) +
        Number(noitu.botStuckWins || 0) * 10 +
        Number(noitu.forfeitWins || 0) * 4
    );
}

function buildDogActivityRanking(users, seasonId) {
    return users
        .map((user) => {
            const stats = getSeasonStats(user, seasonId);
            const dog = stats?.dog || {};

            return {
                userId: String(user.userId),
                bestDogValue: Number(dog.bestDogValue || 0),
                totalDogValue: Number(dog.totalValue || 0),
                dogsCaught: Number(dog.totalCaught || 0),
            };
        })
        .filter((item) => {
            return item.bestDogValue > 0 || item.dogsCaught > 0;
        })
        .sort((a, b) => {
            if (b.bestDogValue !== a.bestDogValue) {
                return b.bestDogValue - a.bestDogValue;
            }

            if (b.totalDogValue !== a.totalDogValue) {
                return b.totalDogValue - a.totalDogValue;
            }

            return b.dogsCaught - a.dogsCaught;
        })
        .slice(0, 20);
}

function buildNoiTuActivityRanking(users, seasonId) {
    return users
        .map((user) => {
            const stats = getSeasonStats(user, seasonId);
            const noitu = stats?.noitu || {};

            return {
                userId: String(user.userId),
                score: calculateNoiTuScore(stats),
                correct: Number(noitu.correct || 0),
                botStuckWins: Number(noitu.botStuckWins || 0),
                forfeitWins: Number(noitu.forfeitWins || 0),
            };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }

            if (b.botStuckWins !== a.botStuckWins) {
                return b.botStuckWins - a.botStuckWins;
            }

            return b.correct - a.correct;
        })
        .slice(0, 20);
}

function buildTowerActivityRanking(users, seasonId) {
    return users
        .map((user) => {
            const stats = getSeasonStats(user, seasonId);
            const tower = stats?.tower || {};

            return {
                userId: String(user.userId),
                floorsCleared: Number(tower.floorsCleared || 0),
                chestsEarned: Number(tower.chestsEarned || 0),
            };
        })
        .filter((item) => item.floorsCleared > 0)
        .sort((a, b) => {
            if (b.floorsCleared !== a.floorsCleared) {
                return b.floorsCleared - a.floorsCleared;
            }

            return b.chestsEarned - a.chestsEarned;
        })
        .slice(0, 20);
}

function applyActivityPoints(scoreMap, ranking, activityName) {
    ranking.forEach((item, index) => {
        const userId = String(item.userId);

        if (!scoreMap.has(userId)) {
            scoreMap.set(userId, {
                userId,
                points: 0,
                dogPoints: 0,
                noituPoints: 0,
                towerPoints: 0,
                firstPlaces: 0,
                topThreePlaces: 0,
                activityRanks: {},
            });
        }

        const result = scoreMap.get(userId);
        const points = getRankPoints(index);
        const rank = index + 1;

        result.points += points;
        result[`${activityName}Points`] = points;
        result.activityRanks[activityName] = rank;

        if (rank === 1) {
            result.firstPlaces += 1;
        }

        if (rank <= 3) {
            result.topThreePlaces += 1;
        }
    });
}

function buildSeasonRanking(limit = 20) {
    const season = getSeasonState();

    if (!season?.id) {
        return [];
    }

    const excludedIds = getExcludedUserIds();

    const users = database.getAllUsers().filter((user) => {
        return !excludedIds.has(String(user.userId));
    });

    const dogRanking = buildDogActivityRanking(users, season.id);
    const noituRanking = buildNoiTuActivityRanking(users, season.id);
    const towerRanking = buildTowerActivityRanking(users, season.id);

    const scoreMap = new Map();

    applyActivityPoints(scoreMap, dogRanking, "dog");
    applyActivityPoints(scoreMap, noituRanking, "noitu");
    applyActivityPoints(scoreMap, towerRanking, "tower");

    return Array.from(scoreMap.values())
        .filter((item) => item.points > 0)
        .sort((a, b) => {
            if (b.points !== a.points) {
                return b.points - a.points;
            }

            if (b.firstPlaces !== a.firstPlaces) {
                return b.firstPlaces - a.firstPlaces;
            }

            if (b.topThreePlaces !== a.topThreePlaces) {
                return b.topThreePlaces - a.topThreePlaces;
            }

            const activityTotalA = a.dogPoints + a.noituPoints + a.towerPoints;

            const activityTotalB = b.dogPoints + b.noituPoints + b.towerPoints;

            if (activityTotalB !== activityTotalA) {
                return activityTotalB - activityTotalA;
            }

            return String(a.userId).localeCompare(String(b.userId));
        })
        .slice(0, Math.max(1, Number(limit || 20)));
}

async function getUsername(client, userId) {
    const cached = usernameCache.get(String(userId));

    if (
        cached &&
        Date.now() - Number(cached.updatedAt || 0) < USERNAME_CACHE_TTL_MS
    ) {
        return cached.username;
    }

    const user = await client.users.fetch(userId).catch(() => null);
    const username =
        user?.globalName ||
        user?.displayName ||
        user?.username ||
        `User ${userId}`;

    usernameCache.set(String(userId), {
        username,
        updatedAt: Date.now(),
    });

    return username;
}

function getRankIcon(index) {
    if (index === 0) {
        return "🥇";
    }

    if (index === 1) {
        return "🥈";
    }

    if (index === 2) {
        return "🥉";
    }

    return `**#${index + 1}**`;
}

function formatActivityRank(rank) {
    return rank ? `#${rank}` : "—";
}

async function buildSeasonEmbed(client) {
    const season = getSeasonState();

    if (!season) {
        return new EmbedBuilder()
            .setColor(0x95a5a6)
            .setTitle("🏆 BẢNG XẾP HẠNG MÙA")
            .setDescription("Hiện chưa có mùa giải nào được mở.");
    }

    const ranking = buildSeasonRanking(10);

    for (const item of ranking) {
        item.username = await getUsername(client, item.userId);
    }

    const statusText =
        season.status === "active" ? "🟢 Đang diễn ra" : "🔴 Đã kết thúc";

    const lines = ranking.map((item, index) => {
        const reward = REWARDS[index + 1];

        return (
            `${getRankIcon(index)} **${item.username}** — ` +
            `**${formatNumber(item.points)} điểm**\n` +
            `> 🐕 Chó: ${formatActivityRank(item.activityRanks.dog)} • ` +
            `📚 Nối từ: ${formatActivityRank(item.activityRanks.noitu)} • ` +
            `🗼 Leo tháp: ${formatActivityRank(item.activityRanks.tower)}\n` +
            `> 🎁 ${reward?.label || "Không có phần thưởng Top 10"}`
        );
    });

    return new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(`🏆 BẢNG XẾP HẠNG ${season.name}`)
        .setDescription(
            `Trạng thái: **${statusText}**\n` +
                `Bắt đầu: **${formatDate(season.startedAt)}**\n` +
                `Kết thúc dự kiến: **${formatDate(season.endsAt)}**\n\n` +
                `Điểm mùa được quy đổi từ thứ hạng **Bắt chó, Nối từ và Leo tháp**.\n\n` +
                `${
                    lines.length > 0
                        ? lines.join("\n\n")
                        : "Chưa có người chơi nào ghi được điểm mùa."
                }`,
        )
        .setFooter({
            text: "Chiến lực và tài phú là BXH flex, không tính vào Điểm Mùa.",
        })
        .setTimestamp();
}

function createSeasonId() {
    const now = new Date();

    return (
        `season_` +
        `${now.getFullYear()}_` +
        `${String(now.getMonth() + 1).padStart(2, "0")}_` +
        `${Date.now()}`
    );
}

async function show(interaction) {
    return interaction.reply({
        embeds: [await buildSeasonEmbed(interaction.client)],
    });
}

async function start(interaction) {
    const currentSeason = getSeasonState();

    if (currentSeason?.status === "active") {
        return interaction.reply({
            content:
                `❌ Đang có mùa giải hoạt động: **${currentSeason.name}**.\n` +
                `Hãy chốt mùa hiện tại trước.`,
            ephemeral: true,
        });
    }

    const seasonNumber = Math.max(
        1,
        interaction.options.getInteger("mua") || 1,
    );

    const durationDays = DEFAULT_DURATION_DAYS;

    const now = Date.now();

    const season = {
        id: createSeasonId(),
        number: seasonNumber,
        name: `MÙA ${seasonNumber}`,
        status: "active",
        startedAt: now,
        endsAt: now + durationDays * 24 * 60 * 60 * 1000,
        finishedAt: 0,
        rewardsGranted: false,
        winners: [],
    };

    database.setSystemValue(SEASON_STATE_KEY, season);

    return interaction.reply({
        content:
            `🏆 **ĐÃ MỞ ${season.name}**\n\n` +
            `⏱️ Thời lượng: **${durationDays} ngày**\n` +
            `📅 Kết thúc dự kiến: **${formatDate(season.endsAt)}**\n\n` +
            `Từ bây giờ, thành tích bắt chó, nối từ và leo tháp mới bắt đầu được tính.`,
    });
}

function grantReward(userId, rank, season) {
    const reward = REWARDS[rank];

    if (!reward) {
        return [];
    }

    const rewardLines = [];

    if (reward.exChests > 0) {
        database.addShopItem(userId, "ruong_quan_quan_ex", reward.exChests);

        rewardLines.push(`🌈 Rương Quán Quân EX x${reward.exChests}`);
    }

    if (reward.fragments > 0) {
        database.addShopItem(userId, "manh_phap_bao", reward.fragments);

        rewardLines.push(`🧩 Mảnh Pháp Bảo x${formatNumber(reward.fragments)}`);
    }

    if (reward.weaponRarity) {
        giveUnidentifiedWeaponReward(
            userId,
            reward.weaponRarity,
            `season_${season.number}_rank_${rank}`,
        );

        rewardLines.push(`🎲 Phôi ${reward.weaponRarity} chưa giám định x1`);
    }

    database.updateUser(userId, (user) => {
        if (!Array.isArray(user.seasonAchievements)) {
            user.seasonAchievements = [];
        }

        user.seasonAchievements.push({
            seasonId: season.id,
            seasonNumber: season.number,
            rank,
            points: 0,
            title:
                rank === 1
                    ? `Quán Quân Mùa ${season.number}`
                    : `Top ${rank} Mùa ${season.number}`,
            receivedAt: Date.now(),
        });

        if (rank === 1) {
            /*
             * Xóa danh hiệu Đương Kim của Quán Quân cũ.
             * Thành tựu seasonAchievements vẫn được giữ vĩnh viễn.
             */
            const allUsers = database.getAllUsers();

            for (const oldUser of allUsers) {
                if (
                    String(oldUser.userId) === String(userId) ||
                    !oldUser.currentSeasonTitle
                ) {
                    continue;
                }

                database.updateUser(oldUser.userId, (oldData) => {
                    delete oldData.currentSeasonTitle;
                });
            }

            user.currentSeasonTitle = `Đương Kim Quán Quân Mùa ${season.number}`;
        }
    });

    return rewardLines;
}

async function finish(interaction) {
    const season = getSeasonState();

    if (!season || season.status !== "active") {
        return interaction.reply({
            content: "❌ Hiện không có mùa giải đang hoạt động.",
            ephemeral: true,
        });
    }

    if (season.rewardsGranted) {
        return interaction.reply({
            content: "❌ Mùa này đã được chốt và phát thưởng trước đó.",
            ephemeral: true,
        });
    }

    const confirm = interaction.options.getString("xacnhan");

    if (confirm !== "dongy") {
        return interaction.reply({
            content:
                `⚠️ Bạn sắp chốt **${season.name}** và phát thưởng Top 10.\n\n` +
                `Hãy chạy lại lệnh với:\n` +
                `\`xacnhan: Đồng ý\``,
            ephemeral: true,
        });
    }

    await interaction.deferReply();

    const ranking = buildSeasonRanking(10);

    if (ranking.length <= 0) {
        return interaction.editReply({
            content: "❌ Chưa có ai đạt điểm mùa nên không thể chốt.",
        });
    }

    /*
     * Khóa mùa trước khi phát quà để tránh chạy lệnh hai lần.
     */
    database.setSystemValue(SEASON_STATE_KEY, {
        ...season,
        status: "rewarding",
        rewardsGranted: true,
        rewardingAt: Date.now(),
    });

    const winnerLines = [];
    const winners = [];

    try {
        for (let index = 0; index < ranking.length; index += 1) {
            const rank = index + 1;
            const item = ranking[index];
            const username = await getUsername(interaction.client, item.userId);

            const rewards = grantReward(item.userId, rank, season);

            database.updateUser(item.userId, (user) => {
                const achievements = user.seasonAchievements || [];

                const achievement = achievements[achievements.length - 1];

                if (achievement && achievement.seasonId === season.id) {
                    achievement.points = item.points;
                }
            });

            winners.push({
                rank,
                userId: item.userId,
                username,
                points: item.points,
                rewards,
            });

            winnerLines.push(
                `${getRankIcon(index)} <@${item.userId}> — ` +
                    `**${formatNumber(item.points)} điểm**\n` +
                    `> ${rewards.join(" • ")}`,
            );
        }

        const finishedSeason = {
            ...season,
            status: "finished",
            finishedAt: Date.now(),
            rewardsGranted: true,
            winners,
        };

        database.setSystemValue(SEASON_STATE_KEY, finishedSeason);

        const history = database.getSystemValue("seasonLeagueHistory") || [];

        history.push(finishedSeason);

        database.setSystemValue("seasonLeagueHistory", history.slice(-20));
    } catch (error) {
        console.error("[SEASON] Lỗi phát thưởng:", error);

        database.setSystemValue(SEASON_STATE_KEY, {
            ...season,
            status: "reward_error",
            rewardsGranted: true,
            errorAt: Date.now(),
            errorMessage: error.message,
            winners,
        });

        return interaction.editReply({
            content:
                `❌ Có lỗi trong lúc phát thưởng.\n` +
                `Đã phát thành công cho **${winners.length} người** trước khi lỗi.\n` +
                `Không chạy lại lệnh để tránh phát trùng. Hãy xem log.`,
        });
    }

    return interaction.editReply({
        embeds: [
            new EmbedBuilder()
                .setColor(0xf1c40f)
                .setTitle(`🏆 KẾT QUẢ ${season.name}`)
                .setDescription(
                    `Mùa giải đã được khóa và phát thưởng thành công.\n\n` +
                        winnerLines.join("\n\n"),
                )
                .setFooter({
                    text: "Tiền, chiến lực, chó, tháp và thành tích vĩnh viễn không bị reset.",
                })
                .setTimestamp(),
        ],
    });
}

async function status(interaction) {
    const season = getSeasonState();

    if (!season) {
        return interaction.reply({
            content: "Hiện chưa có dữ liệu mùa giải.",
            ephemeral: true,
        });
    }

    return interaction.reply({
        content:
            `🏆 **${season.name}**\n` +
            `Trạng thái: **${season.status}**\n` +
            `Bắt đầu: **${formatDate(season.startedAt)}**\n` +
            `Kết thúc dự kiến: **${formatDate(season.endsAt)}**\n` +
            `Đã phát thưởng: **${season.rewardsGranted ? "Có" : "Chưa"}**`,
        ephemeral: true,
    });
}
function getNextSeasonNumber() {
    const current = getSeasonState();

    if (Number(current?.number || 0) > 0) {
        return Number(current.number) + 1;
    }

    const history = database.getSystemValue("seasonLeagueHistory") || [];

    const highestNumber = history.reduce((highest, item) => {
        return Math.max(highest, Number(item?.number || 0));
    }, 0);

    return highestNumber + 1;
}

function openAutomaticSeason() {
    const current = getSeasonState();

    if (
        current &&
        ["active", "rewarding", "reward_error"].includes(current.status)
    ) {
        return current;
    }

    const seasonNumber = getNextSeasonNumber();
    const now = Date.now();

    const season = {
        id: createSeasonId(),
        number: seasonNumber,
        name: `MÙA ${seasonNumber}`,
        status: "active",
        startedAt: now,
        endsAt: now + DEFAULT_DURATION_DAYS * 24 * 60 * 60 * 1000,
        finishedAt: 0,
        rewardsGranted: false,
        winners: [],
        automatic: true,
    };

    database.setSystemValue(SEASON_STATE_KEY, season);

    console.log(
        `[SEASON] Đã tự mở ${season.name}, kết thúc lúc ${formatDate(
            season.endsAt,
        )}`,
    );

    return season;
}

async function getSeasonAnnouncementChannel(client) {
    const channelId = leaderboardConfig.channelId;

    if (!channelId) {
        return null;
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (!channel || !channel.isTextBased()) {
        return null;
    }

    return channel;
}

async function announceSeasonOpened(client, season) {
    const channel = await getSeasonAnnouncementChannel(client);

    if (!channel) {
        return;
    }

    await channel.send({
        embeds: [
            new EmbedBuilder()
                .setColor(0x2ecc71)
                .setTitle(`🏆 ${season.name} ĐÃ BẮT ĐẦU`)
                .setDescription(
                    `Một mùa giải mới đã tự động được mở.\n\n` +
                        `⏱️ Thời lượng: **${DEFAULT_DURATION_DAYS} ngày**\n` +
                        `📅 Bắt đầu: **${formatDate(season.startedAt)}**\n` +
                        `🏁 Kết thúc: **${formatDate(season.endsAt)}**\n\n` +
                        `Điểm mùa được tính từ:\n` +
                        `🐕 Bắt chó\n` +
                        `📚 Nối từ\n` +
                        `🗼 Leo tháp\n\n` +
                        `Dùng \`/muagiai\` để xem thứ hạng.`,
                )
                .setTimestamp(),
        ],
    });
}

async function finishAutomaticSeason(client, season) {
    const channel = await getSeasonAnnouncementChannel(client);

    /*
     * Tái sử dụng hàm finish hiện có bằng một interaction nội bộ.
     * Không cần người dùng chạy slash command.
     */
    const automaticInteraction = {
        client,

        options: {
            getString(name) {
                if (name === "xacnhan") {
                    return "dongy";
                }

                return null;
            },
        },

        async deferReply() {
            return undefined;
        },

        async editReply(payload) {
            if (channel) {
                return channel.send(payload);
            }

            console.log(
                `[SEASON] Đã chốt ${season.name} nhưng không tìm thấy channel BXH để thông báo.`,
            );

            return undefined;
        },
    };

    await finish(automaticInteraction);

    const stateAfterFinish = getSeasonState();

    /*
     * Nếu mùa không có ai ghi điểm, hàm finish sẽ không chốt.
     * Tự đóng mùa rỗng để hệ thống không bị kẹt vĩnh viễn.
     */
    if (
        stateAfterFinish?.status === "active" &&
        Number(stateAfterFinish.endsAt || 0) <= Date.now()
    ) {
        const emptyFinishedSeason = {
            ...stateAfterFinish,
            status: "finished",
            finishedAt: Date.now(),
            rewardsGranted: false,
            winners: [],
            emptySeason: true,
        };

        database.setSystemValue(SEASON_STATE_KEY, emptyFinishedSeason);

        const history = database.getSystemValue("seasonLeagueHistory") || [];

        history.push(emptyFinishedSeason);

        database.setSystemValue("seasonLeagueHistory", history.slice(-20));

        if (channel) {
            await channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x95a5a6)
                        .setTitle(`🏁 ${season.name} ĐÃ KẾT THÚC`)
                        .setDescription(
                            "Mùa giải không có người chơi ghi điểm nên không phát phần thưởng.",
                        )
                        .setTimestamp(),
                ],
            });
        }
    }
}

async function processAutomaticSeason(client) {
    if (isProcessingSeason) {
        return;
    }

    isProcessingSeason = true;

    try {
        let season = getSeasonState();

        /*
         * Chưa có mùa hoặc mùa cũ đã kết thúc:
         * tự động mở mùa tiếp theo.
         */
        if (!season || season.status === "finished") {
            const newSeason = openAutomaticSeason();

            await announceSeasonOpened(client, newSeason);

            return;
        }

        /*
         * Nếu lần phát thưởng trước gặp lỗi thì không tự chạy tiếp,
         * tránh phát quà trùng.
         */
        if (season.status === "rewarding" || season.status === "reward_error") {
            console.error(
                `[SEASON] ${season.name} đang ở trạng thái ${season.status}. Cần kiểm tra thủ công.`,
            );

            return;
        }

        if (season.status !== "active") {
            return;
        }

        if (Number(season.endsAt || 0) > Date.now()) {
            return;
        }

        console.log(
            `[SEASON] ${season.name} đã hết hạn, bắt đầu tự động chốt.`,
        );

        await finishAutomaticSeason(client, season);

        season = getSeasonState();

        if (season?.status === "finished") {
            const newSeason = openAutomaticSeason();

            await announceSeasonOpened(client, newSeason);
        }
    } catch (error) {
        console.error("[SEASON] Lỗi vận hành mùa tự động:", error);
    } finally {
        isProcessingSeason = false;
    }
}

async function startAutoSeason(client) {
    if (autoSeasonInterval) {
        return;
    }

    /*
     * Chạy ngay khi bot khởi động.
     * Nếu bot từng offline qua thời điểm hết mùa,
     * mùa cũ sẽ được chốt ngay tại đây.
     */
    await processAutomaticSeason(client);

    autoSeasonInterval = setInterval(() => {
        processAutomaticSeason(client).catch((error) => {
            console.error("[SEASON] Lỗi bộ đếm tự động:", error);
        });
    }, AUTO_CHECK_INTERVAL_MS);

    console.log(
        `[SEASON] Đã bật tự động mở/chốt mùa ` +
            `mỗi ${DEFAULT_DURATION_DAYS} ngày.`,
    );
}
module.exports = {
    show,
    start,
    finish,
    status,
    buildSeasonRanking,
    buildSeasonEmbed,
    startAutoSeason,
    processAutomaticSeason,
};
