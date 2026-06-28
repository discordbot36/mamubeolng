const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");

const {
    addMoney,
    addShopItem,
    formatMoney,
    ensureTuTienProfile,
    updateTuTienProfile,
    getSystemValue,
    setSystemValue,
    deleteSystemValue,
} = require("./database");

const worldBossConfig = require("./config/worldboss");
const shop = require("./config/shop");
const tuTienConfig = require("./config/tutien");
const combat = require("./utils/combat");
const {
    givePhapBaoFarmReward,
    formatPhapBaoFarmReward,
} = require("./utils/phapbaoFarmDrops");

const STATE_KEY = "worldBoss";
const RESPAWN_KEY = "worldBossRespawn";
const BOSS_ROTATION_KEY = "worldBossNextIndex";

let worldBossAttackQueue = Promise.resolve();
let worldBossRespawnTimer = null;

function runWorldBossAttackLocked(callback) {
    const currentTask = worldBossAttackQueue.then(callback, callback);

    worldBossAttackQueue = currentTask.catch(() => {});

    return currentTask;
}

function formatTimeLeft(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes <= 0) {
        return `${seconds} giây`;
    }

    if (seconds <= 0) {
        return `${minutes} phút`;
    }

    return `${minutes} phút ${seconds} giây`;
}

function getAttackCooldownMs() {
    return Number(worldBossConfig.attackCooldownMinutes || 5) * 60 * 1000;
}

function getRespawnMs() {
    return Number(worldBossConfig.respawnHours || 3.6) * 60 * 60 * 1000;
}

function formatRespawnTime(timestamp) {
    if (!timestamp) {
        return "không rõ";
    }

    return `<t:${Math.floor(Number(timestamp) / 1000)}:R>`;
}

function formatNumber(number) {
    return Number(number || 0).toLocaleString("vi-VN");
}
function addTuTienExp(userId, amount) {
    const exp = Math.max(0, Math.floor(Number(amount || 0)));

    if (exp <= 0) {
        return 0;
    }

    updateTuTienProfile(userId, (profile) => {
        profile.exp = Number(profile.exp || 0) + exp;
    });

    return exp;
}

function getWorldBossExpReward(moneyReward, rank) {
    const rate = rank <= 10 ? 0.18 : 0.16;

    return Math.max(25, Math.floor(Number(moneyReward || 0) * rate));
}

function limitDiscordContent(text, maxLength = 1900) {
    const content = String(text || "");

    if (content.length <= maxLength) {
        return content;
    }

    return (
        content.slice(0, maxLength - 80) +
        "\n\n⚠️ Bảng tổng kết quá dài, chỉ hiển thị top đầu."
    );
}

function buildFinishBossContent({
    boss,
    randomWinnerNames,
    topHitLines,
    rewardLines,
    maxLength = 1900,
}) {
    const header =
        `☠️ **Boss ${boss.name} đã bị hạ gục!**\n\n` +
        `🎁 **Luật chia thưởng pháp bảo:**\n` +
        `🥇 Top dame **1-2-3**: mỗi người nhận **1 lượt thưởng pháp bảo**.\n` +
        `🎲 Top dame **4-20**: random **3 người**, mỗi người nhận **1 lượt thưởng pháp bảo**.\n` +
        `🔥 Top **3 người đánh nhiều lượt nhất**: mỗi người nhận **1 lượt thưởng pháp bảo**.\n\n` +
        `🎲 **Người trúng random top 4-20:**\n` +
        `${randomWinnerNames.length > 0 ? randomWinnerNames.join(", ") : "Không đủ người trong top 4-20 để random."}\n\n` +
        `🔥 **Top lượt đánh nhiều nhất:**\n` +
        `${topHitLines.length > 0 ? topHitLines.join("\n") : "Không có dữ liệu lượt đánh."}\n\n` +
        `🎁 **Phần thưởng đã được chia:**\n`;

    const lines = [];
    let content = header;

    for (const line of rewardLines) {
        const nextContent = content + line + "\n";

        if (nextContent.length > maxLength - 120) {
            break;
        }

        lines.push(line);
        content = nextContent;
    }

    const hiddenCount = Math.max(0, rewardLines.length - lines.length);

    if (hiddenCount > 0) {
        content += `\n⚠️ Còn **${formatNumber(hiddenCount)} dòng thưởng** không hiển thị vì bảng quá dài. Phần thưởng vẫn đã chia đầy đủ.`;
    }

    return limitDiscordContent(content, maxLength);
}

function getRealms() {
    if (Array.isArray(tuTienConfig.realms) && tuTienConfig.realms.length > 0) {
        return tuTienConfig.realms;
    }

    return [
        {
            name: "Phàm Lợn",
            maxExp: 500,
        },
    ];
}

function getRealm(profile) {
    const realms = getRealms();

    return realms[profile.realmIndex || 0] || realms[0];
}

function getRealmName(profile) {
    const realm = getRealm(profile);

    return `${realm.name} - Tầng ${profile.floor || 1}`;
}

function getRootById(rootId) {
    const roots = Array.isArray(tuTienConfig.spiritualRoots)
        ? tuTienConfig.spiritualRoots
        : [];

    return roots.find((root) => root.id === rootId);
}

function createWorldBossCombatant(boss) {
    const maxHp = Math.max(1, Number(boss.maxHp || boss.hp || 1));

    const currentHp = Math.max(0, Math.min(maxHp, Number(boss.hp || 0)));

    const configuredStats = worldBossConfig.combatStats || {};

    const fallbackPower = Math.max(1, Math.floor(Math.sqrt(maxHp) * 120));

    const combatPower = Math.max(
        1,
        Number(
            boss.combatPower || configuredStats.combatPower || fallbackPower,
        ),
    );

    const atk = Math.max(
        1,
        Math.floor(
            Number(boss.atk || configuredStats.atk || combatPower * 0.3),
        ),
    );

    const defense = Math.max(
        0,
        Math.floor(
            Number(
                boss.defense ?? configuredStats.defense ?? combatPower * 0.05,
            ),
        ),
    );

    const speed = Math.max(
        1,
        Math.floor(Number(boss.speed || configuredStats.speed || 100)),
    );

    return combat.createCombatantFromStats({
        id: "world_boss",

        name: boss.name || "Boss Thế Giới",

        type: "world_boss",

        combatPower,

        atk,
        defense,

        maxHp,
        currentHp,

        speed,

        critChance: Number(
            boss.critChance ?? configuredStats.critChance ?? 0.08,
        ),

        dodgeChance: Number(
            boss.dodgeChance ?? configuredStats.dodgeChance ?? 0,
        ),

        counterChance: 0,

        damageReduction: Number(
            boss.damageReduction ?? configuredStats.damageReduction ?? 0.05,
        ),

        skills: boss.skills || configuredStats.skills || [],

        shield: Number(boss.shield || 0),

        cooldowns: boss.cooldowns || {},

        buffs: boss.buffs || [],

        debuffs: boss.debuffs || [],

        status: boss.status || {},

        metadata: {
            shieldCapPercent: Number(configuredStats.shieldCapPercent ?? 1),
        },
    });
}

function syncWorldBossCombatant(combatant, boss) {
    boss.hp = Math.max(0, Number(combatant.hp || 0));
    boss.maxHp = Math.max(1, Number(combatant.stats?.maxHp || boss.maxHp || 1));

    boss.shield = Math.max(0, Number(combatant.shield || 0));

    boss.cooldowns = {
        ...(combatant.cooldowns || {}),
    };

    boss.buffs = Array.isArray(combatant.buffs)
        ? combatant.buffs.map((effect) => ({
              ...effect,

              metadata: {
                  ...(effect.metadata || {}),
              },
          }))
        : [];

    boss.debuffs = Array.isArray(combatant.debuffs)
        ? combatant.debuffs.map((effect) => ({
              ...effect,

              metadata: {
                  ...(effect.metadata || {}),
              },
          }))
        : [];

    boss.status = {
        ...(combatant.status || {}),
    };

    return boss;
}
function processWorldBossEffects(bossCombatant) {
    const beforeHp = Math.max(0, Number(bossCombatant.hp || 0));

    const effectResult = combat.processStartOfTurnEffects(bossCombatant);

    const afterHp = Math.max(0, Number(bossCombatant.hp || 0));

    const effectDamage = Math.max(0, beforeHp - afterHp);

    const tickResult = combat.tickCombatEffects(bossCombatant);

    return {
        effectDamage,

        poisonedDamage: Number(effectResult?.poisonDamage || 0),

        defeated: !combat.isCombatantAlive(bossCombatant),

        expiredBuffs: tickResult?.expiredBuffs || [],

        expiredDebuffs: tickResult?.expiredDebuffs || [],
    };
}
function getHpBar(current, max, size = 20) {
    const ratio = Math.max(0, Math.min(1, current / Math.max(1, max)));
    const filled = Math.round(ratio * size);
    const empty = size - filled;

    return `\`${"█".repeat(filled)}${"░".repeat(empty)}\``;
}

function getRanking(boss) {
    return Object.entries(boss.damage || {})
        .map(([userId, data]) => ({
            userId,
            damage: Number(data.damage || 0),
            hits: Number(data.hits || 0),
        }))
        .sort((a, b) => b.damage - a.damage);
}

function createBossButtons(disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("worldboss_attack")
            .setLabel("Đánh Boss")
            .setEmoji("⚔️")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled),
    );
}

function createRankButtons(page, maxPage, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`worldboss_rank_${Math.max(0, page - 1)}`)
            .setLabel("Xem những người mạnh hơn")
            .setEmoji("⬆️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || page <= 0),

        new ButtonBuilder()
            .setCustomId(`worldboss_rank_${Math.min(maxPage, page + 1)}`)
            .setLabel("Xem những người yếu hơn")
            .setEmoji("⬇️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || page >= maxPage),
    );
}

async function getDisplayName(client, userId) {
    const user = await client.users.fetch(userId).catch(() => null);

    if (!user) {
        return `User ${userId}`;
    }

    return user.globalName || user.username;
}

async function buildBossEmbed(client, boss) {
    const ranking = getRanking(boss);
    const hp = Math.max(0, boss.hp || 0);
    const maxHp = Math.max(1, boss.maxHp || 1);
    const percent = Math.floor((hp / maxHp) * 100);

    const topLines = [];

    for (let i = 0; i < Math.min(5, ranking.length); i++) {
        const item = ranking[i];
        const name = await getDisplayName(client, item.userId);

        topLines.push(
            `**#${i + 1} ${name}** — ${formatNumber(item.damage)} dame`,
        );
    }

    const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle(`👹 Boss Thế Giới: ${boss.name}`)
        .setDescription(
            `❤️ **Máu:** ${formatNumber(hp)}/${formatNumber(maxHp)} — **${percent}%**\n` +
                `${getHpBar(hp, maxHp)}\n\n` +
                `⚔️ **Số đạo hữu tham chiến:** ${ranking.length}\n\n` +
                `🏆 **Top dame hiện tại:**\n` +
                `${topLines.length > 0 ? topLines.join("\n") : "Chưa ai đánh boss."}`,
        )
        .setFooter({
            text: "Bấm Đánh Boss để gây sát thương. Boss chết sẽ tự chia thưởng.",
        })
        .setTimestamp();

    if (boss.imageUrl) {
        embed.setImage(boss.imageUrl);
    }

    return embed;
}

async function buildRankingEmbed(client, boss, page = 0, killed = false) {
    const pageSize = Number(worldBossConfig.pageSize || 10);
    const maxRank = Math.min(Number(worldBossConfig.maxRankDisplay || 36), 20);
    const ranking = getRanking(boss).slice(0, maxRank);
    const maxPage = Math.max(0, Math.ceil(ranking.length / pageSize) - 1);
    const safePage = Math.max(0, Math.min(page, maxPage));

    const start = safePage * pageSize;
    const items = ranking.slice(start, start + pageSize);

    const lines = [];

    for (let i = 0; i < items.length; i++) {
        const rank = start + i + 1;
        const item = items[i];
        const name = await getDisplayName(client, item.userId);

        let icon = `#${rank}`;
        if (rank === 1) icon = "🥇";
        if (rank === 2) icon = "🥈";
        if (rank === 3) icon = "🥉";

        lines.push(
            `${icon} **${name}**\n` +
                `> ⚔️ Dame: **${formatNumber(item.damage)}** | Lượt đánh: **${formatNumber(item.hits)}**`,
        );
    }

    const embed = new EmbedBuilder()
        .setColor(killed ? 0x2ecc71 : 0xf1c40f)
        .setTitle(
            killed ? "☠️ Boss đã bị hạ gục" : "🏆 Bảng Xếp Hạng Dame Boss",
        )
        .setDescription(
            lines.length > 0
                ? lines.join("\n\n")
                : "Chưa có ai gây sát thương.",
        )
        .setFooter({
            text: `Trang ${safePage + 1}/${maxPage + 1} • Chỉ hiển thị top ${maxRank}`,
        })
        .setTimestamp();

    if (boss.imageUrl) {
        embed.setThumbnail(boss.imageUrl);
    }

    return {
        embed,
        page: safePage,
        maxPage,
    };
}
async function buildAutoRankingEmbed(client, boss, killed = false) {
    const maxRank = Number(worldBossConfig.maxRankDisplay || 36);
    const ranking = getRanking(boss).slice(0, maxRank);

    const lines = [];

    for (let i = 0; i < ranking.length; i++) {
        const rank = i + 1;
        const item = ranking[i];
        const name = await getDisplayName(client, item.userId);

        let icon = `#${rank}`;
        if (rank === 1) icon = "🥇";
        if (rank === 2) icon = "🥈";
        if (rank === 3) icon = "🥉";

        lines.push(
            `${icon} **${name}** — ⚔️ **${formatNumber(item.damage)}** dame | ${formatNumber(item.hits)} lượt`,
        );
    }

    return new EmbedBuilder()
        .setColor(killed ? 0x2ecc71 : 0xf1c40f)
        .setTitle(
            killed
                ? "☠️ Bảng Xếp Hạng Sau Khi Boss Chết"
                : "🏆 Bảng Xếp Hạng Dame Boss",
        )
        .setDescription(
            lines.length > 0 ? lines.join("\n") : "Chưa có ai gây sát thương.",
        )
        .setFooter({
            text: `Tự động cập nhật • Chỉ hiển thị top ${maxRank}`,
        })
        .setTimestamp();
}

async function updateBossMessage(client, boss) {
    if (!boss.channelId || !boss.messageId) {
        return;
    }

    const channel = await client.channels
        .fetch(boss.channelId)
        .catch(() => null);

    if (!channel || !channel.isTextBased()) {
        return;
    }

    const message = await channel.messages
        .fetch(boss.messageId)
        .catch(() => null);

    if (!message) {
        return;
    }

    const bossEmbed = await buildBossEmbed(client, boss);
    const rankingEmbed = await buildAutoRankingEmbed(client, boss, false);

    await message.edit({
        content: "",
        embeds: [bossEmbed, rankingEmbed],
        components: [createBossButtons(false)],
    });
}

function shuffleArray(array) {
    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = result[i];

        result[i] = result[j];
        result[j] = temp;
    }

    return result;
}
function getBossList() {
    if (
        Array.isArray(worldBossConfig.bosses) &&
        worldBossConfig.bosses.length > 0
    ) {
        return worldBossConfig.bosses;
    }

    return [worldBossConfig.defaultBoss];
}

function getNextBossTemplate() {
    const bosses = getBossList();

    const currentIndex = Number(getSystemValue(BOSS_ROTATION_KEY) || 0);
    const safeIndex = Math.max(0, currentIndex) % bosses.length;

    const bossTemplate = bosses[safeIndex];

    const nextIndex = (safeIndex + 1) % bosses.length;

    setSystemValue(BOSS_ROTATION_KEY, nextIndex);

    return bossTemplate;
}

function createBossState(options = {}) {
    const combatStats = worldBossConfig.combatStats || {};

    const bossTemplate = options.bossTemplate || getNextBossTemplate();

    const name =
        options.name || bossTemplate.name || worldBossConfig.defaultBoss.name;
    const maxHp = Number(
        options.maxHp ||
            bossTemplate.maxHp ||
            worldBossConfig.defaultBoss.maxHp,
    );
    const imageUrl =
        options.imageUrl ||
        bossTemplate.imageUrl ||
        worldBossConfig.defaultBoss.imageUrl;

    return {
        active: true,

        id: bossTemplate.id || "world_boss",

        name,

        hp: maxHp,
        maxHp,

        combatPower: Number(combatStats.combatPower || 0),

        atk: Number(combatStats.atk || 0),

        defense: Number(combatStats.defense || 0),

        speed: Number(combatStats.speed || 100),

        critChance: Number(combatStats.critChance || 0.08),

        dodgeChance: Number(combatStats.dodgeChance || 0),

        damageReduction: Number(combatStats.damageReduction || 0.05),

        skills: Array.isArray(combatStats.skills) ? combatStats.skills : [],

        shield: 0,
        cooldowns: {},
        buffs: [],
        debuffs: [],

        status: {
            stunned: false,
            revived: false,
            reviveAttempted: false,
            defending: false,
        },

        imageUrl,

        channelId: options.channelId || worldBossConfig.channelId,

        messageId: null,

        damage: {},

        spawnedAt: Date.now(),
        spawnedBy: options.spawnedBy || "auto",
    };
}

async function spawnBossInChannel(client, options = {}) {
    const oldBoss = getSystemValue(STATE_KEY);

    if (oldBoss && oldBoss.active) {
        return {
            success: false,
            message: "Đang có boss còn sống, không thể spawn thêm.",
        };
    }

    const channelId = options.channelId || worldBossConfig.channelId;
    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (!channel || !channel.isTextBased()) {
        return {
            success: false,
            message: `Không tìm thấy channel spawn boss: ${channelId}`,
        };
    }

    const boss = createBossState({
        channelId,
        spawnedBy: options.spawnedBy || "auto",
        name: options.name,
        maxHp: options.maxHp,
        imageUrl: options.imageUrl,
    });

    const bossEmbed = await buildBossEmbed(client, boss);
    const rankingEmbed = await buildAutoRankingEmbed(client, boss, false);

    const bossMessage = await channel.send({
        content: "👹 **World Boss đã xuất hiện!**",
        embeds: [bossEmbed, rankingEmbed],
        components: [createBossButtons(false)],
    });

    boss.messageId = bossMessage.id;

    setSystemValue(STATE_KEY, boss);
    deleteSystemValue(RESPAWN_KEY);

    return {
        success: true,
        boss,
    };
}

function clearWorldBossRespawnTimer() {
    if (worldBossRespawnTimer) {
        clearTimeout(worldBossRespawnTimer);
        worldBossRespawnTimer = null;
    }
}

function scheduleWorldBossRespawn(client, respawnAt) {
    clearWorldBossRespawnTimer();

    const delay = Math.max(1000, Number(respawnAt || 0) - Date.now());

    worldBossRespawnTimer = setTimeout(async () => {
        try {
            const currentBoss = getSystemValue(STATE_KEY);

            if (currentBoss && currentBoss.active) {
                return;
            }

            const respawnState = getSystemValue(RESPAWN_KEY);
            const targetRespawnAt = Number(
                respawnState?.respawnAt || respawnAt || 0,
            );

            if (targetRespawnAt > Date.now()) {
                scheduleWorldBossRespawn(client, targetRespawnAt);
                return;
            }

            const result = await spawnBossInChannel(client, {
                channelId: respawnState?.channelId || worldBossConfig.channelId,
                spawnedBy: "auto_respawn",
            });

            if (!result.success) {
                console.error("[WorldBoss AutoRespawn]", result.message);
                scheduleWorldBossRespawn(client, Date.now() + 60 * 1000);
            }
        } catch (error) {
            console.error("[WorldBoss AutoRespawn]", error);
            scheduleWorldBossRespawn(client, Date.now() + 60 * 1000);
        }
    }, delay);
}

function getHitRanking(boss) {
    return Object.entries(boss.damage || {})
        .map(([userId, data]) => ({
            userId,
            damage: Number(data.damage || 0),
            hits: Number(data.hits || 0),
        }))
        .sort((a, b) => {
            if (b.hits !== a.hits) {
                return b.hits - a.hits;
            }

            return b.damage - a.damage;
        });
}

async function finishBoss(client, reason = "killed") {
    const boss = getSystemValue(STATE_KEY);

    if (!boss || !boss.active) {
        return {
            success: false,
            message: "Hiện không có boss nào đang sống.",
        };
    }

    boss.active = false;
    boss.killedAt = Date.now();
    boss.killReason = reason;
    boss.hp = Math.max(0, Number(boss.hp || 0));

    const ranking = getRanking(boss);
    const hitRanking = getHitRanking(boss);

    const top10Rewards = Array.isArray(worldBossConfig.top10Rewards)
        ? worldBossConfig.top10Rewards
        : [];

    const consolationReward = Number(worldBossConfig.consolationReward || 500);
    const maxRankDisplay = Number(worldBossConfig.maxRankDisplay || 36);

    const topDameChestUserIds = ranking.slice(0, 3).map((item) => item.userId);

    const randomPoolUserIds = ranking.slice(3, 20).map((item) => item.userId);
    const randomChestUserIds = shuffleArray(randomPoolUserIds).slice(0, 3);

    const topHitChestUserIds = hitRanking
        .slice(0, 3)
        .map((item) => item.userId);

    const chestRewards = new Map();

    function addChestReward(userId, amount = 1) {
        chestRewards.set(
            userId,
            Number(chestRewards.get(userId) || 0) + amount,
        );
    }

    for (const userId of topDameChestUserIds) {
        addChestReward(userId, 1);
    }

    for (const userId of randomChestUserIds) {
        addChestReward(userId, 1);
    }

    for (const userId of topHitChestUserIds) {
        addChestReward(userId, 1);
    }

    const rewardLines = [];
    let afterDisplayCount = 0;

    for (let i = 0; i < ranking.length; i++) {
        const rank = i + 1;
        const item = ranking[i];
        const name = await getDisplayName(client, item.userId);

        const moneyReward =
            rank <= 10
                ? Number(top10Rewards[rank - 1] || 0)
                : consolationReward;
        const chestReward = Number(chestRewards.get(item.userId) || 0);
        const expReward = getWorldBossExpReward(moneyReward, rank);

        if (moneyReward > 0) {
            addMoney(item.userId, moneyReward);
        }

        if (expReward > 0) {
            addTuTienExp(item.userId, expReward);
        }

        let chestRewardText = "";

        if (chestReward > 0) {
            const chestItemId = worldBossConfig.chestItemId || "tu_luyen_chest";
            const chestItem = shop[chestItemId] || {};

            addShopItem(item.userId, chestItemId, chestReward);

            chestRewardText =
                `${chestItem.emoji || "🎁"} **${chestItem.name || "Rương WorldBoss"}** ` +
                `x${formatNumber(chestReward)}`;
        }
        if (rank <= maxRankDisplay) {
            const tags = [];

            if (topDameChestUserIds.includes(item.userId)) {
                tags.push("Top dame 1-3");
            }

            if (randomChestUserIds.includes(item.userId)) {
                tags.push("Random top 4-20");
            }

            if (topHitChestUserIds.includes(item.userId)) {
                tags.push("Top lượt đánh 1-3");
            }

            rewardLines.push(
                `#${rank} **${name}** — ${formatNumber(item.damage)} dame | ` +
                    `⚔️ ${formatNumber(item.hits)} lượt | ` +
                    `💰 ${formatMoney(moneyReward)}` +
                    ` | ✨ +${formatNumber(expReward)} exp` +
                    `${chestRewardText ? ` | ${chestRewardText}` : ""}` +
                    `${tags.length > 0 ? ` | ${tags.join(", ")}` : ""}`,
            );
        } else {
            afterDisplayCount += 1;
        }
    }

    if (afterDisplayCount > 0) {
        rewardLines.push(
            `\n🎁 **${formatNumber(afterDisplayCount)} người ngoài top ${maxRankDisplay}** mỗi người nhận **${formatMoney(consolationReward)}**.`,
        );
    }

    const randomWinnerNames = [];

    for (const userId of randomChestUserIds) {
        const name = await getDisplayName(client, userId);
        randomWinnerNames.push(`**${name}**`);
    }

    const topHitLines = [];

    for (let i = 0; i < Math.min(3, hitRanking.length); i++) {
        const item = hitRanking[i];
        const name = await getDisplayName(client, item.userId);

        topHitLines.push(
            `#${i + 1} **${name}** — ${formatNumber(item.hits)} lượt đánh`,
        );
    }

    setSystemValue(STATE_KEY, boss);
    deleteSystemValue(RESPAWN_KEY);

    const channel = await client.channels
        .fetch(boss.channelId)
        .catch(() => null);

    if (channel && channel.isTextBased() && boss.messageId) {
        const message = await channel.messages
            .fetch(boss.messageId)
            .catch(() => null);

        const rankingEmbed = await buildAutoRankingEmbed(client, boss, true);

        if (message) {
            const finishContent = buildFinishBossContent({
                boss,
                randomWinnerNames,
                topHitLines,
                rewardLines:
                    rewardLines.length > 0
                        ? rewardLines
                        : ["Không có ai tham chiến."],
            });

            await message.edit({
                content: finishContent,
                embeds: [rankingEmbed],
                components: [],
            });
        }
    }

    deleteSystemValue(STATE_KEY);

    const respawnAt = Date.now() + getRespawnMs();

    setSystemValue(RESPAWN_KEY, {
        channelId: boss.channelId || worldBossConfig.channelId,
        killedAt: boss.killedAt,
        respawnAt,
        reason,
    });

    scheduleWorldBossRespawn(client, respawnAt);

    if (channel && channel.isTextBased()) {
        channel
            .send({
                content:
                    `⏳ Boss mới sẽ tự động xuất hiện ${formatRespawnTime(respawnAt)} ` +
                    `(**${worldBossConfig.respawnHours || 3.6} giờ** sau khi chết).`,
            })
            .catch(() => undefined);
    }

    return {
        success: true,
        message:
            "Boss đã chết, phần thưởng đã được chia và đã hẹn giờ boss mới.",
    };
}

function hasBossAccess(interaction) {
    if (interaction.memberPermissions?.has("Administrator")) {
        return true;
    }

    return false;
}

class WorldBossManager {
    startAutoSpawn(client) {
        const currentBoss = getSystemValue(STATE_KEY);

        if (currentBoss && currentBoss.active) {
            return;
        }

        const respawnState = getSystemValue(RESPAWN_KEY);

        if (respawnState?.respawnAt) {
            scheduleWorldBossRespawn(client, Number(respawnState.respawnAt));
            return;
        }

        if (worldBossConfig.autoSpawnOnStartup === true) {
            scheduleWorldBossRespawn(client, Date.now() + 5000);
        }
    }
    async spawn(interaction) {
        await interaction.deferReply({
            ephemeral: true,
        });

        try {
            if (!hasBossAccess(interaction)) {
                return interaction.editReply({
                    content: "❌ Bạn không có quyền spawn boss.",
                });
            }

            if (interaction.channelId !== worldBossConfig.channelId) {
                return interaction.editReply({
                    content: `❌ Boss chỉ được spawn ở channel <#${worldBossConfig.channelId}>.`,
                });
            }

            const oldBoss = getSystemValue(STATE_KEY);

            if (oldBoss && oldBoss.active) {
                return interaction.editReply({
                    content:
                        "❌ Đang có boss còn sống, không thể spawn thêm. Dùng `/chet` để kết thúc boss cũ hoặc xóa boss trong data.json.",
                });
            }

            const name =
                interaction.options.getString("ten") ||
                worldBossConfig.defaultBoss.name;

            const maxHp =
                interaction.options.getInteger("hp") ||
                worldBossConfig.defaultBoss.maxHp;

            const imageUrl =
                interaction.options.getString("anh") ||
                worldBossConfig.defaultBoss.imageUrl;

            const boss = createBossState({
                channelId: interaction.channelId,
                spawnedBy: interaction.user.id,
                name,
                maxHp,
                imageUrl,
            });

            const bossEmbed = await buildBossEmbed(interaction.client, boss);
            const rankingEmbed = await buildAutoRankingEmbed(
                interaction.client,
                boss,
                false,
            );

            const bossMessage = await interaction.channel.send({
                content: "👹 **Gà Khô kia xấu xa, Xì Mi ta chẳng tha**",
                embeds: [bossEmbed, rankingEmbed],
                components: [createBossButtons(false)],
            });

            boss.messageId = bossMessage.id;

            setSystemValue(STATE_KEY, boss);

            return interaction.editReply({
                content: `✅ Đã spawn boss **${boss.name}** tại <#${interaction.channelId}>.`,
            });
        } catch (error) {
            console.error("[WorldBoss] Lỗi spawn boss:", error);

            return interaction.editReply({
                content: "❌ Bot lỗi khi spawn boss, xem console để sửa.",
            });
        }
    }

    async chet(interaction) {
        await interaction.deferReply({
            ephemeral: true,
        });

        try {
            if (!hasBossAccess(interaction)) {
                return interaction.editReply({
                    content: "❌ Bạn không có quyền ép boss chết.",
                });
            }

            const result = await finishBoss(interaction.client, "forced");

            return interaction.editReply({
                content: result.success
                    ? "✅ Đã ép boss chết và chia thưởng."
                    : `❌ ${result.message}`,
            });
        } catch (error) {
            console.error("[WorldBoss] Lỗi ép boss chết:", error);

            return interaction.editReply({
                content: "❌ Bot lỗi khi ép boss chết, xem console để sửa.",
            });
        }
    }

    async handleButton(interaction) {
        if (interaction.customId === "worldboss_attack") {
            return this.attack(interaction);
        }

        return undefined;
    }

    async attack(interaction) {
        await interaction.deferReply({
            ephemeral: true,
        });

        return runWorldBossAttackLocked(async () => {
            try {
                const boss = getSystemValue(STATE_KEY);

                if (!boss || !boss.active) {
                    return interaction.editReply({
                        content: "❌ Hiện không có boss nào đang sống.",
                    });
                }

                if (interaction.channelId !== worldBossConfig.channelId) {
                    return interaction.editReply({
                        content:
                            `❌ Chỉ có thể đánh boss ở channel ` +
                            `<#${worldBossConfig.channelId}>.`,
                    });
                }

                const profile = ensureTuTienProfile(interaction.user.id);

                if (!profile.rootId) {
                    return interaction.editReply({
                        content:
                            "❌ Bạn chưa thức tỉnh linh căn nên chưa thể đánh boss.",
                    });
                }
                if (!boss.damage || typeof boss.damage !== "object") {
                    boss.damage = {};
                }

                if (!boss.damage[interaction.user.id]) {
                    boss.damage[interaction.user.id] = {
                        damage: 0,
                        hits: 0,
                        lastAttackAt: 0,
                    };
                }

                const playerDamageData = boss.damage[interaction.user.id];

                const now = Date.now();

                const cooldownMs = getAttackCooldownMs();

                const lastAttackAt = Number(playerDamageData.lastAttackAt || 0);

                const timeLeft = cooldownMs - (now - lastAttackAt);

                if (timeLeft > 0) {
                    return interaction.editReply({
                        content:
                            `⏳ Bạn vừa đánh boss rồi.\n` +
                            `Hãy quay lại sau **${formatTimeLeft(
                                timeLeft,
                            )}** để đánh tiếp.`,
                    });
                }

                const playerName =
                    interaction.member?.displayName ||
                    interaction.user.username;

                const player = combat.createCombatant(profile, {
                    userId: interaction.user.id,

                    name: playerName,
                });

                const bossCombatant = createWorldBossCombatant(boss);

                const bossEffectResult = processWorldBossEffects(bossCombatant);

                if (!combat.isCombatantAlive(bossCombatant)) {
                    syncWorldBossCombatant(bossCombatant, boss);

                    setSystemValue(STATE_KEY, boss);

                    await interaction.editReply({
                        content:
                            `☠️ Hiệu ứng đang tồn tại gây **${formatNumber(
                                bossEffectResult.effectDamage,
                            )}** sát thương và kết liễu Boss!\n` +
                            `Đang chia thưởng...`,
                    });

                    await finishBoss(interaction.client, "killed_by_effect");

                    return undefined;
                }

                const action = combat.executeCombatTurn({
                    attacker: player,
                    defender: bossCombatant,

                    useSkillChance: Number(
                        worldBossConfig.activeSkillTriggerChance ?? 0.65,
                    ),

                    allowCounter: false,
                    allowRevive: false,
                });

                let damage = 0;

                if (action.success === true && action.type === "basic_attack") {
                    damage =
                        Number(action.result?.hpDamage || 0) +
                        Number(action.result?.absorbedByShield || 0);
                }

                if (action.success === true && action.type === "skill") {
                    damage =
                        Number(action.result?.totalHpDamage || 0) +
                        Number(action.result?.totalShieldDamage || 0);
                }

                damage = Math.max(0, Math.floor(damage));

                syncWorldBossCombatant(bossCombatant, boss);

                playerDamageData.damage =
                    Number(playerDamageData.damage || 0) + damage;

                playerDamageData.hits = Number(playerDamageData.hits || 0) + 1;

                playerDamageData.lastAttackAt = now;

                boss.lastHitBy = interaction.user.id;

                boss.lastHitAt = now;

                setSystemValue(STATE_KEY, boss);

                let actionText = `⚔️ Bạn đánh **${boss.name}**`;
                const effectText =
                    bossEffectResult.effectDamage > 0
                        ? `\n☠️ Hiệu ứng trước đòn đánh gây thêm **${formatNumber(
                              bossEffectResult.effectDamage,
                          )}** sát thương.`
                        : "";

                if (action.type === "skill" && action.result?.skillName) {
                    actionText = `✨ Bạn thi triển **${action.result.skillName}** lên **${boss.name}**`;
                } else if (action.type === "basic_attack") {
                    actionText = `⚔️ Bạn đánh thường vào **${boss.name}**`;
                }

                if (action.result?.dodged === true) {
                    actionText += ", nhưng Boss đã né được đòn đánh";
                } else {
                    actionText += ` gây **${formatNumber(damage)}** dame`;
                }

                if (boss.hp <= 0) {
                    await interaction.editReply({
                        content:
                            `${actionText}.\n` +
                            `☠️ Boss đã bị kết liễu! Đang chia thưởng...`,
                    });

                    await finishBoss(interaction.client, "killed");

                    return undefined;
                }

                await updateBossMessage(interaction.client, boss);

                return interaction.editReply({
                    content:
                        `${actionText}.\n` +
                        `💪 Lực chiến tính boss: **${formatNumber(
                            player.stats.combatPower,
                        )}**\n` +
                        `❤️ Máu boss còn: **${formatNumber(boss.hp)}/${formatNumber(
                            boss.maxHp,
                        )}**` +
                        (boss.shield > 0
                            ? `\n🛡️ Khiên boss: **${formatNumber(boss.shield)}**`
                            : ""),
                });
            } catch (error) {
                console.error("[WorldBoss] Lỗi khi đánh boss:", error);

                return interaction.editReply({
                    content: "❌ Bot lỗi khi đánh boss, xem console để sửa.",
                });
            }
        });
    }
    async showRanking(interaction, page = 0) {
        await interaction.deferReply({
            ephemeral: true,
        });

        const boss = getSystemValue(STATE_KEY);

        if (!boss) {
            return interaction.editReply({
                content: "❌ Hiện chưa có dữ liệu boss.",
            });
        }

        const data = await buildRankingEmbed(
            interaction.client,
            boss,
            page,
            !boss.active,
        );

        return interaction.editReply({
            embeds: [data.embed],
            components: [
                createRankButtons(data.page, data.maxPage, !boss.active),
            ],
        });
    }
}

module.exports = new WorldBossManager();
