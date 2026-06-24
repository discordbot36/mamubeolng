const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
} = require("discord.js");

const database = require("./database");
const raidConfig = require("./config/raidserver");
const combat = require("./utils/combat");

const STATE_KEY = "raidServer";
const VIETNAM_UTC_OFFSET_HOURS = 7;
const timers = new Map();

const ACTIONS = {
    attack: { label: "Công Kích", emoji: "⚔️", style: ButtonStyle.Danger },
    guard: { label: "Hộ Pháp", emoji: "🛡️", style: ButtonStyle.Primary },
    cleanse: { label: "Thanh Tẩy", emoji: "✨", style: ButtonStyle.Success },
    break: { label: "Phá Giáp", emoji: "🩸", style: ButtonStyle.Secondary },
    dodge: { label: "Né Tránh", emoji: "💨", style: ButtonStyle.Secondary },
    focus: { label: "Tụ Linh", emoji: "🔮", style: ButtonStyle.Primary },
};

const MECHANICS = {
    death_mark: {
        title: "☠️ Tử Ấn Trảm",
        weight: 22,
        minStage: 1,
        hint: "Boss nâng kiếm, mặt đất nứt đỏ. Một đạo hữu bị khắc Tử Ấn, cần được bảo vệ.",
    },
    clones: {
        title: "🪞 Phân Thân Giả",
        weight: 14,
        minStage: 1,
        hint: "Boss tách thành ba bóng. Cần Tụ Linh để tìm bản thể trước khi dồn sát thương.",
    },
    top_damage_target: {
        title: "👑 Sát Ý Phản Phệ",
        weight: 12,
        minStage: 1,
        hint: "Boss nhìn thẳng vào người gây sát thương cao nhất. Tham công lúc này rất dễ bị phản sát thương.",
    },
    anti_spam: {
        title: "🔥 Boss Đọc Lối Đánh",
        weight: 9,
        minStage: 1,
        hint: "Boss bắt đầu đọc được những người chỉ lặp lại một hành động.",
    },
    dice_fate: {
        title: "🎲 Thiên Mệnh Xúc Xắc",
        weight: 15,
        minStage: 2,
        hint: "Thiên Mệnh chọn một người gieo xúc xắc. Cả đội có thể Cầu Phúc bằng Tụ Linh/Hộ Pháp.",
    },
    soul_link: {
        title: "🔗 Liên Kết Sinh Mệnh",
        weight: 13,
        minStage: 2,
        hint: "Hai đạo hữu bị nối sinh mệnh. Một người sai, người kia cũng có thể chết theo.",
    },
    lantern_holder: {
        title: "🕯️ Người Giữ Đèn",
        weight: 10,
        minStage: 2,
        hint: "Một đạo hữu giữ Đèn Trấn Hồn. Nếu sống qua phase này, cả raid được buff lớn.",
    },
    belly_roll: {
        title: "🐷 Mamu Lăn Bụng 3 Tạ 6",
        weight: 12,
        minStage: 1,
        hint: "Mamu hít một hơi, bụng rung chuyển như thiên thạch.",
    },
};

function now() {
    return Date.now();
}

function randomInt(min, max) {
    const safeMin = Math.ceil(Number(min || 0));
    const safeMax = Math.floor(Number(max || safeMin));

    if (safeMax <= safeMin) {
        return safeMin;
    }

    return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value || 0)));
}

function formatNumber(value) {
    return Number(Math.floor(value || 0)).toLocaleString("vi-VN");
}

function formatTimeLeft(ms) {
    const seconds = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;

    if (m <= 0) {
        return `${s}s`;
    }

    return `${m}m ${s}s`;
}

function hpBar(current, max, size = 14) {
    const ratio = clamp(current / Math.max(1, Number(max || 1)), 0, 1);
    const filled = Math.round(ratio * size);

    return `${"█".repeat(filled)}${"░".repeat(size - filled)}`;
}

function weightedPick(items) {
    const list = (items || []).filter((item) => Number(item.weight || 0) > 0);
    const total = list.reduce((sum, item) => {
        return sum + Number(item.weight || 0);
    }, 0);

    if (!list.length || total <= 0) {
        return null;
    }

    let roll = Math.random() * total;

    for (const item of list) {
        roll -= Number(item.weight || 0);

        if (roll <= 0) {
            return item;
        }
    }

    return list[list.length - 1];
}

function pickOne(items) {
    const list = (items || []).filter(Boolean);

    if (!list.length) {
        return null;
    }

    return list[randomInt(0, list.length - 1)];
}

function createRaidId() {
    return `raid_${Date.now()}_${randomInt(1000, 9999)}`;
}

function getVietnamParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: raidConfig.timezone || "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).formatToParts(date);

    const out = {};

    for (const part of parts) {
        if (part.type !== "literal") {
            out[part.type] = Number(part.value);
        }
    }

    return out;
}

function vietnamLocalToTimestamp(year, month, day, hour, minute, second = 0) {
    return Date.UTC(
        year,
        month - 1,
        day,
        hour - VIETNAM_UTC_OFFSET_HOURS,
        minute,
        second,
    );
}

function getNextDailyTimestamp(hour, minute) {
    return getDailyTimestampAfter(now(), hour, minute);
}

function getDailyTimestampAfter(baseMs, hour, minute) {
    const parts = getVietnamParts(new Date(Number(baseMs || now())));

    let target = vietnamLocalToTimestamp(
        parts.year,
        parts.month,
        parts.day,
        hour,
        minute,
        0,
    );

    if (target <= Number(baseMs || now())) {
        target += 24 * 60 * 60 * 1000;
    }

    return target;
}

function formatClock(hour, minute) {
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getDateKey() {
    const p = getVietnamParts();

    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(
        p.day,
    ).padStart(2, "0")}`;
}

function getState() {
    const state = database.getSystemValue(STATE_KEY) || {};

    if (!Array.isArray(state.history)) {
        state.history = [];
    }

    return state;
}

function saveState(state) {
    database.setSystemValue(STATE_KEY, state || {});
}

function getCurrentRaid() {
    return getState().current || null;
}

function setCurrentRaid(raid) {
    const state = getState();
    state.current = raid;
    saveState(state);
}

function clearCurrentRaid() {
    const state = getState();

    if (state.current) {
        state.history.unshift({
            id: state.current.id,
            dateKey: state.current.dateKey,
            result: state.current.result || "unknown",
            finishedAt: now(),
        });

        state.history = state.history.slice(0, 20);
    }

    state.current = null;
    saveState(state);
}

function setTimer(key, delayMs, fn) {
    clearTimer(key);

    const timer = setTimeout(
        () => {
            timers.delete(key);
            fn();
        },
        Math.max(1000, Number(delayMs || 0)),
    );

    timers.set(key, timer);
}

function clearTimer(key) {
    const timer = timers.get(key);

    if (timer) {
        clearTimeout(timer);
    }

    timers.delete(key);
}

function clearRaidTimers(raidId) {
    for (const key of Array.from(timers.keys())) {
        if (key.includes(raidId)) {
            clearTimer(key);
        }
    }
}

function getAlivePlayers(raid) {
    return Object.values(raid.players || {}).filter((p) => p.alive !== false);
}

function getRegisteredPlayers(raid) {
    return Object.values(raid.players || {});
}

function getBossStage(raid) {
    const hpPercent = (raid.boss.hp / Math.max(1, raid.boss.maxHp)) * 100;

    if (hpPercent <= 35) {
        return 3;
    }

    if (hpPercent <= 70) {
        return 2;
    }

    return 1;
}

function actionCount(raid, action) {
    return Object.values(raid.phase?.actions || {}).filter((a) => a === action)
        .length;
}

function requiredByAlive(raid, ratio, min = 1) {
    return Math.max(min, Math.ceil(getAlivePlayers(raid).length * ratio));
}

function addBossDamage(raid, amount, reason = "damage") {
    const safe = Math.max(0, Math.floor(Number(amount || 0)));

    raid.boss.hp = Math.max(0, Number(raid.boss.hp || 0) - safe);
    raid.stats.totalDamage = Number(raid.stats.totalDamage || 0) + safe;

    if (reason === "mechanic") {
        raid.stats.mechanicDamage =
            Number(raid.stats.mechanicDamage || 0) + safe;
    }

    return safe;
}

function addMechanicDamage(raid, multiplier = 1) {
    const percent = Number(
        raidConfig.perfectMechanic?.successBossHpPercent || 0.035,
    );

    return addBossDamage(
        raid,
        raid.boss.maxHp * percent * multiplier,
        "mechanic",
    );
}

function addRage(raid, amount) {
    raid.boss.rage = clamp(
        Number(raid.boss.rage || 0) + Number(amount || 0),
        0,
        raidConfig.boss.maxRage || 100,
    );
}

function addSpirit(raid, amount) {
    raid.boss.spirit = clamp(
        Number(raid.boss.spirit || 0) + Number(amount || 0),
        0,
        raidConfig.boss.maxSpirit || 100,
    );
}

function damagePlayer(raid, player, amount, reason = "") {
    if (!player || player.alive === false) {
        return 0;
    }

    const safe = Math.max(0, Math.floor(Number(amount || 0)));

    player.hp = Math.max(0, Number(player.hp || 0) - safe);

    if (player.hp <= 0) {
        player.alive = false;
        player.deadAtPhase = raid.phase?.number || 0;
        raid.stats.deaths = Number(raid.stats.deaths || 0) + 1;

        if (reason) {
            player.deathReason = reason;
        }
    }

    return safe;
}

function healPlayer(player, amount) {
    if (!player || player.alive === false) {
        return 0;
    }

    const safe = Math.max(0, Math.floor(Number(amount || 0)));

    player.hp = Math.min(
        Number(player.maxHp || 1),
        Number(player.hp || 0) + safe,
    );

    return safe;
}

function revivePlayer(player, hpPercent = 0.35) {
    if (!player || player.alive !== false) {
        return false;
    }

    player.alive = true;
    player.hp = Math.max(1, Math.floor(Number(player.maxHp || 1) * hpPercent));
    player.revived = true;

    return true;
}

function getPlayerPower(userId) {
    try {
        const user = database.getUser(userId);
        const profile = user?.tuTienProfile || {};

        return Math.max(1, combat.calculateCombatPower(profile) || 1);
    } catch (_) {
        return 1;
    }
}

function createRaidPlayer(userId) {
    const power = getPlayerPower(userId);
    const maxHp = Math.max(6000, Math.floor(7000 + Math.sqrt(power) * 38));

    return {
        userId,
        registeredAt: now(),
        ready: false,

        power,
        maxHp,
        hp: maxHp,
        alive: true,
        deadAtPhase: null,

        damage: 0,
        mechanicScore: 0,
        supportScore: 0,
        diceScore: 0,
        heavenScore: 0,

        actionsTaken: 0,
        activePhases: 0,
        afkPhases: 0,
        mistakes: 0,
        lastActions: [],

        rewardEligible: false,
        rewardReason: null,
    };
}

function buildRegisterRows() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("raid_join")
                .setLabel("Đăng Ký Tham Gia")
                .setEmoji("⚔️")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("raid_leave")
                .setLabel("Hủy Đăng Ký")
                .setEmoji("🚪")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId("raid_ready")
                .setLabel("Sẵn Sàng")
                .setEmoji("✅")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("raid_list")
                .setLabel("Danh Sách")
                .setEmoji("📊")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId("raid_rules")
                .setLabel("Luật")
                .setEmoji("📜")
                .setStyle(ButtonStyle.Secondary),
        ),
    ];
}
function buildPrepareRows() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("raid_ready")
                .setLabel("Tôi Đã Vác Heo Tới")
                .setEmoji("✅")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("raid_list")
                .setLabel("Danh Sách")
                .setEmoji("📊")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId("raid_rules")
                .setLabel("Luật")
                .setEmoji("📜")
                .setStyle(ButtonStyle.Secondary),
        ),
    ];
}
function buildActionRows(raid) {
    const disabled = raid.status !== "battle";
    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();

    for (const id of ["attack", "guard", "cleanse", "break", "dodge"]) {
        const action = ACTIONS[id];

        row1.addComponents(
            new ButtonBuilder()
                .setCustomId(`raid_act_${id}`)
                .setLabel(action.label)
                .setEmoji(action.emoji)
                .setStyle(action.style)
                .setDisabled(disabled),
        );
    }

    const focus = ACTIONS.focus;

    row2.addComponents(
        new ButtonBuilder()
            .setCustomId("raid_act_focus")
            .setLabel(focus.label)
            .setEmoji(focus.emoji)
            .setStyle(focus.style)
            .setDisabled(disabled),
    );

    return [row1, row2];
}

function buildRegisterEmbed(raid) {
    const count = getRegisteredPlayers(raid).length;
    const ready = getRegisteredPlayers(raid).filter((p) => p.ready).length;

    return new EmbedBuilder()
        .setColor(0xff5555)
        .setTitle("☠️ RAID SERVER SẮP MỞ")
        .setDescription(
            [
                `**Boss:** ${raidConfig.boss.name}`,
                `**Mở đăng ký:** ${formatClock(raidConfig.registerHour, raidConfig.registerMinute)}`,
                `**Gom người:** ${formatClock(raidConfig.prepareHour, raidConfig.prepareMinute)}`,
                `**Bắt đầu:** ${formatClock(raidConfig.startHour, raidConfig.startMinute)}`,
                `**Chuẩn bị:** ${raidConfig.prepareMinutes} phút`,
                "",
                "Bấm **Đăng Ký Tham Gia** để được gọi vào raid lúc 20:50.",
                "Ai đăng ký nhưng tới giờ không đánh / AFK sẽ **không nhận quà**.",
            ].join("\n"),
        )
        .addFields(
            { name: "Người đăng ký", value: `${count}`, inline: true },
            { name: "Sẵn sàng", value: `${ready}`, inline: true },
            {
                name: "Rương chính",
                value: "🌈 Rương Tàn Tích EX",
                inline: true,
            },
        )
        .setFooter({
            text: "20:50 bot sẽ tạo channel. 21:00 boss chạy.",
        });
}

function buildPrepareEmbed(raid) {
    const count = getRegisteredPlayers(raid).length;
    const ready = getRegisteredPlayers(raid).filter((p) => p.ready).length;

    return new EmbedBuilder()
        .setColor(0xffaa33)
        .setTitle("🐷 MAMU ĐANG ĐƯỢC KHIÊNG RA SÂN")
        .setDescription(
            [
                `**Boss:** ${raidConfig.battleDisplayName || raidConfig.boss.name}`,
                `**Bắt đầu:** ${formatClock(raidConfig.startHour, raidConfig.startMinute)}`,
                `**Thời gian chuẩn bị:** ${raidConfig.prepareMinutes} phút`,
                "",
                "Bấm **Tôi Đã Vác Heo Tới** để xác nhận có mặt.",
                "Đúng 21:00 channel đổi tên và raid tự chạy.",
            ].join("\n"),
        )
        .addFields(
            { name: "Người được gọi", value: `${count}`, inline: true },
            { name: "Đã có mặt", value: `${ready}`, inline: true },
        );
}

function buildPhaseEmbed(raid) {
    const alive = getAlivePlayers(raid).length;
    const total = getRegisteredPlayers(raid).length;
    const chosen = Object.keys(raid.phase.actions || {}).length;
    const mechanic = MECHANICS[raid.phase.mechanicId] || {
        title: "🐉 Thiên Đạo Cứu Rỗi",
        hint: "Thiên Đạo đang nhìn xuống chiến trường.",
    };

    const targetText =
        (raid.phase.targetUserIds || []).map((id) => `<@${id}>`).join(", ") ||
        "Không có";

    return new EmbedBuilder()
        .setColor(0xcc2222)
        .setTitle(`${mechanic.title} — Phase ${raid.phase.number}`)
        .setDescription(
            [
                mechanic.hint,
                "",
                `🎯 **Mục tiêu:** ${targetText}`,
                `❤️ **Boss:** ${formatNumber(raid.boss.hp)} / ${formatNumber(
                    raid.boss.maxHp,
                )} HP`,
                hpBar(raid.boss.hp, raid.boss.maxHp),
                `💀 **Nộ Boss:** ${Math.floor(raid.boss.rage || 0)} / ${
                    raidConfig.boss.maxRage || 100
                }`,
                `🔮 **Tụ Linh Server:** ${Math.floor(raid.boss.spirit || 0)} / ${
                    raidConfig.boss.maxSpirit || 100
                }`,
                `👥 **Còn sống:** ${alive} / ${total}`,
                `✅ **Đã chọn:** ${chosen} / ${alive}`,
                `⏳ **Còn:** ${formatTimeLeft(
                    Number(raid.phase.endsAt || 0) - now(),
                )}`,
            ].join("\n"),
        );
}

function buildResultEmbed(raid, result, logs) {
    const alive = getAlivePlayers(raid).length;
    const total = getRegisteredPlayers(raid).length;

    return new EmbedBuilder()
        .setColor(result === "win" ? 0x33aa66 : 0xaa3333)
        .setTitle(
            result === "win"
                ? "✅ RAID SERVER THÀNH CÔNG"
                : result === "lose"
                  ? "❌ RAID SERVER THẤT BẠI"
                  : "📌 Kết quả phase",
        )
        .setDescription(
            [
                `**Boss:** ${raidConfig.boss.name}`,
                `**Người sống:** ${alive} / ${total}`,
                `**Tổng damage:** ${formatNumber(raid.stats.totalDamage)}`,
                `**Damage từ mechanic:** ${formatNumber(
                    raid.stats.mechanicDamage,
                )}`,
                "",
                ...logs.slice(0, 12),
            ].join("\n"),
        );
}

function pickMechanic(raid) {
    if (shouldTriggerHeavenSave(raid)) {
        return "heaven_save";
    }

    const stage = getBossStage(raid);
    const choices = Object.entries(MECHANICS)
        .filter(([, mechanic]) => stage >= mechanic.minStage)
        .map(([id, mechanic]) => ({
            id,
            weight: mechanic.weight,
        }));

    return weightedPick(choices)?.id || "death_mark";
}

function shouldTriggerHeavenSave(raid) {
    if (!raidConfig.heavenSave?.enabled || raid.stats.heavenSaveUsed) {
        return false;
    }

    const total = Math.max(1, getRegisteredPlayers(raid).length);
    const deadRatio = (total - getAlivePlayers(raid).length) / total;
    const bossHpPercent = (raid.boss.hp / Math.max(1, raid.boss.maxHp)) * 100;

    const danger =
        bossHpPercent <= Number(raidConfig.heavenSave.minBossHpPercent || 35) ||
        deadRatio >= Number(raidConfig.heavenSave.minDeadRatio || 0.4) ||
        Number(raid.boss.rage || 0) >=
            Number(raidConfig.heavenSave.minRage || 90);

    return (
        danger &&
        Math.random() < Number(raidConfig.heavenSave.triggerChance || 0.28)
    );
}

function chooseTargets(raid, mechanicId) {
    const alive = getAlivePlayers(raid);

    if (!alive.length) {
        return [];
    }

    if (mechanicId === "soul_link") {
        const first = pickOne(alive);
        const second = pickOne(alive.filter((p) => p.userId !== first?.userId));

        return [first?.userId, second?.userId].filter(Boolean);
    }

    if (mechanicId === "top_damage_target") {
        const top = [...alive].sort((a, b) => {
            return Number(b.damage || 0) - Number(a.damage || 0);
        })[0];

        return [top?.userId].filter(Boolean);
    }

    if (["death_mark", "dice_fate", "lantern_holder"].includes(mechanicId)) {
        return [pickOne(alive)?.userId].filter(Boolean);
    }

    return [];
}

function createBoss(activeCount) {
    const count = Math.max(1, Number(activeCount || 1));
    const maxHp = Math.floor(
        Number(raidConfig.boss.baseHp || 8000000) +
            count * Number(raidConfig.boss.hpPerPlayer || 2500000),
    );

    return {
        name: raidConfig.boss.name,
        hp: maxHp,
        maxHp,
        atk: Math.floor(
            Number(raidConfig.boss.baseAtk || 2500) +
                count * Number(raidConfig.boss.atkPerPlayer || 180),
        ),
        rage: 0,
        spirit: 0,
    };
}

function applyPlayerActionDamage(raid, logs) {
    let damage = 0;

    for (const player of getAlivePlayers(raid)) {
        const action = raid.phase.actions[player.userId];

        if (!action) {
            continue;
        }

        const base = Math.floor(
            45000 + Math.sqrt(Math.max(1, player.power || 1)) * 150,
        );

        let dealt = 0;

        if (action === "attack") dealt = base;
        if (action === "break") dealt = Math.floor(base * 0.55);
        if (action === "focus") dealt = Math.floor(base * 0.25);
        if (["guard", "cleanse", "dodge"].includes(action)) {
            dealt = Math.floor(base * 0.12);
        }

        damage += dealt;
        player.damage = Number(player.damage || 0) + dealt;
    }

    if (damage > 0) {
        addBossDamage(raid, damage, "damage");
        logs.push(
            `⚔️ Sát thương người chơi gây ra: **${formatNumber(damage)}**.`,
        );
    }
}

function countAndMarkAfk(raid) {
    for (const player of getAlivePlayers(raid)) {
        const action = raid.phase.actions[player.userId];

        if (action) {
            player.actionsTaken += 1;
            player.activePhases += 1;
            player.lastActions.push(action);
            player.lastActions = player.lastActions.slice(-4);
        } else {
            player.afkPhases += 1;
        }
    }
}

function resolveDeathMark(raid, logs) {
    const target = raid.players[raid.phase.targetUserIds[0]];
    const guards = actionCount(raid, "guard");
    const cleanses = actionCount(raid, "cleanse");
    const targetAction = raid.phase.actions[target?.userId];
    const needGuard = requiredByAlive(raid, 0.22);

    const success =
        target &&
        (targetAction === "dodge" || targetAction === "guard") &&
        guards >= needGuard;

    if (success) {
        const dmg = addMechanicDamage(raid, cleanses > 0 ? 1.25 : 1);
        addRage(raid, -5);
        addSpirit(raid, 10);
        logs.push(
            `🛡️ Tử Ấn được hóa giải. Boss bị phản chấn **${formatNumber(dmg)}** HP.`,
        );
    } else {
        if (target) {
            damagePlayer(
                raid,
                target,
                raid.boss.atk * 5.5,
                "Không hóa giải Tử Ấn",
            );
        }

        addRage(raid, 15);
        logs.push(
            `☠️ Tử Ấn nổ. ${target ? `<@${target.userId}>` : "Một người"} nhận sát thương chí mạng.`,
        );
    }
}

function resolveClones(raid, logs) {
    const focus = actionCount(raid, "focus");
    const attacks = actionCount(raid, "attack");
    const needFocus = requiredByAlive(raid, 0.18);
    const success = focus >= needFocus && attacks >= 1;

    if (success) {
        const dmg = addMechanicDamage(raid, 1.35);
        addSpirit(raid, 15);
        logs.push(
            `🪞 Cả đội tìm đúng bản thể. Boss nhận thêm **${formatNumber(dmg)}** sát thương thật.`,
        );
    } else {
        addRage(raid, 10);

        for (const p of getAlivePlayers(raid).filter((p) => {
            return raid.phase.actions[p.userId] === "attack";
        })) {
            damagePlayer(raid, p, raid.boss.atk * 1.4, "Đánh nhầm phân thân");
            p.mistakes += 1;
        }

        logs.push("🪞 Đánh nhầm phân thân, người tham công bị phản damage.");
    }
}

function resolveTopDamageTarget(raid, logs) {
    const target = raid.players[raid.phase.targetUserIds[0]];

    if (!target) {
        return;
    }

    const action = raid.phase.actions[target.userId];

    if (action === "guard" || action === "dodge") {
        const dmg = addMechanicDamage(raid, 1.1);
        target.mechanicScore += 2;
        logs.push(
            `👑 <@${target.userId}> né được phản phệ, boss lộ sơ hở mất **${formatNumber(dmg)}** HP.`,
        );
    } else {
        damagePlayer(
            raid,
            target,
            raid.boss.atk * 3.8,
            "Tham công khi bị boss gọi tên",
        );
        target.mistakes += 1;
        addRage(raid, 12);
        logs.push(`👑 <@${target.userId}> bị phản sát thương vì không thủ/né.`);
    }
}

function resolveAntiSpam(raid, logs) {
    const punished = [];

    for (const player of getAlivePlayers(raid)) {
        const last = player.lastActions || [];
        const current = raid.phase.actions[player.userId];

        if (
            current &&
            last.length >= 2 &&
            last.slice(-2).every((a) => a === current)
        ) {
            punished.push(player);
            damagePlayer(
                raid,
                player,
                raid.boss.atk * 1.8,
                "Bị boss đọc lối đánh",
            );
            player.mistakes += 1;
        }
    }

    if (punished.length) {
        addRage(raid, punished.length * 3);
        logs.push(
            `🔥 ${punished.length} người spam hành động bị boss phản chế.`,
        );
    } else {
        const dmg = addMechanicDamage(raid, 0.9);
        addSpirit(raid, 8);
        logs.push(
            `🔥 Không ai bị bắt bài. Boss mất **${formatNumber(dmg)}** HP vì hụt nhịp.`,
        );
    }
}

function resolveDiceFate(raid, logs) {
    const target = raid.players[raid.phase.targetUserIds[0]];
    const bless = actionCount(raid, "focus") + actionCount(raid, "guard");

    let roll = randomInt(1, 6);

    if (bless >= requiredByAlive(raid, 0.25) && roll <= 3) {
        roll += 1;
    }

    if (!raid.phase.actions[target?.userId]) {
        roll = 1;
    }

    if (target) {
        target.diceScore += roll;
    }

    if (roll <= 1) {
        if (target) {
            damagePlayer(raid, target, raid.boss.atk * 5, "Roll Thiên Mệnh 1");
        }

        addRage(raid, 18);
        logs.push(`🎲 <@${target?.userId}> roll **1**. Đại họa giáng xuống.`);
    } else if (roll <= 3) {
        addRage(raid, 8);
        logs.push(`🎲 Roll **${roll}**. Không tốt, boss tăng Nộ.`);
    } else if (roll <= 5) {
        const dmg = addMechanicDamage(raid, 1.15);
        addSpirit(raid, 12);
        logs.push(
            `🎲 Roll **${roll}**. Thiên Mệnh mở yếu điểm, boss mất **${formatNumber(dmg)}** HP.`,
        );
    } else {
        const dmg = addMechanicDamage(raid, 1.8);

        for (const p of getAlivePlayers(raid)) {
            healPlayer(p, p.maxHp * 0.12);
        }

        addSpirit(raid, 20);
        logs.push(
            `🎲 Roll **6**! Đại cát, boss mất **${formatNumber(dmg)}** HP và cả đội hồi máu.`,
        );
    }
}

function resolveSoulLink(raid, logs) {
    const [aId, bId] = raid.phase.targetUserIds;
    const a = raid.players[aId];
    const b = raid.players[bId];
    const cleanses = actionCount(raid, "cleanse");
    const safeA = ["guard", "dodge"].includes(raid.phase.actions[aId]);
    const safeB = ["guard", "dodge"].includes(raid.phase.actions[bId]);

    const success =
        a && b && safeA && safeB && cleanses >= requiredByAlive(raid, 0.18);

    if (success) {
        const dmg = addMechanicDamage(raid, 1.2);
        logs.push(
            `🔗 Liên Kết Sinh Mệnh bị cắt. Boss mất **${formatNumber(dmg)}** HP.`,
        );
    } else {
        if (a)
            damagePlayer(
                raid,
                a,
                raid.boss.atk * 2.5,
                "Liên Kết Sinh Mệnh thất bại",
            );
        if (b)
            damagePlayer(
                raid,
                b,
                raid.boss.atk * 2.5,
                "Liên Kết Sinh Mệnh thất bại",
            );

        addRage(raid, 12);
        logs.push(
            "🔗 Liên kết không được cắt đúng lúc, hai người bị kéo máu cùng nhau.",
        );
    }
}

function resolveLanternHolder(raid, logs) {
    const target = raid.players[raid.phase.targetUserIds[0]];
    const guards = actionCount(raid, "guard");
    const cleanses = actionCount(raid, "cleanse");
    const targetSafe = ["guard", "dodge", "focus"].includes(
        raid.phase.actions[target?.userId],
    );

    const success =
        target &&
        targetSafe &&
        guards + cleanses >= requiredByAlive(raid, 0.25);

    if (success) {
        const dmg = addMechanicDamage(raid, 1.5);

        for (const p of getAlivePlayers(raid)) {
            healPlayer(p, p.maxHp * 0.08);
        }

        addSpirit(raid, 25);
        logs.push(
            `🕯️ Đèn Trấn Hồn còn sáng. Boss mất **${formatNumber(dmg)}** HP, cả đội hồi máu.`,
        );
    } else {
        if (target) {
            damagePlayer(raid, target, raid.boss.atk * 3.2, "Đèn Trấn Hồn vỡ");
        }

        addRage(raid, 18);
        logs.push("🕯️ Đèn Trấn Hồn vỡ, boss cuồng nộ.");
    }
}

function resolveBellyRoll(raid, logs) {
    const dodges = actionCount(raid, "dodge");
    const guards = actionCount(raid, "guard");
    const success = dodges + guards >= requiredByAlive(raid, 0.45);

    if (success) {
        const dmg = addMechanicDamage(raid, 1.25);

        addRage(raid, -8);
        logs.push(
            `🐷 Mamu lăn hụt, tự vấp bụng té sấp mặt. Boss mất **${formatNumber(dmg)}** HP.`,
        );
    } else {
        for (const p of getAlivePlayers(raid)) {
            const action = raid.phase.actions[p.userId];

            if (action !== "dodge") {
                damagePlayer(
                    raid,
                    p,
                    raid.boss.atk * 2.2,
                    "Bị Mamu 3 tạ 6 cán qua",
                );
                p.mistakes += 1;
            }
        }

        addRage(raid, 15);
        logs.push(
            "🐷 Mamu lăn qua chiến trường. Ai không né bị cán dẹp như bánh tráng.",
        );
    }
}
function resolveHeavenSave(raid, logs) {
    raid.stats.heavenSaveUsed = true;

    const pray = Object.values(raid.phase.actions || {}).filter((a) => {
        return a === "focus" || a === "guard";
    }).length;

    let blood = 0;

    for (const player of getAlivePlayers(raid)) {
        if (raid.phase.actions[player.userId] === "cleanse") {
            blood += 1;
            damagePlayer(
                raid,
                player,
                player.hp * 0.2,
                "Đốt máu cầu Thiên Đạo",
            );
            player.heavenScore += 3;
        }
    }

    const score = pray + blood * 3;
    const alive = getAlivePlayers(raid).length;

    if (score >= Math.ceil(alive * 0.75)) {
        const dead = getRegisteredPlayers(raid)
            .filter((p) => p.alive === false)
            .slice(0, 3);

        dead.forEach((p) => revivePlayer(p, 0.35));

        const dmg = addMechanicDamage(raid, 1.8);
        addRage(raid, -35);
        logs.push(
            `🐉 Thiên mệnh nghịch chuyển! Hồi sinh ${dead.length} người, boss mất **${formatNumber(dmg)}** HP.`,
        );
    } else if (score >= Math.ceil(alive * 0.45)) {
        const dead = getRegisteredPlayers(raid)
            .filter((p) => p.alive === false)
            .slice(0, 1);

        dead.forEach((p) => revivePlayer(p, 0.3));

        for (const p of getAlivePlayers(raid)) {
            healPlayer(p, p.maxHp * 0.15);
        }

        addRage(raid, -20);
        logs.push(
            `🐉 Thiên Đạo khai ân. Hồi sinh ${dead.length} người và hồi máu đội hình.`,
        );
    } else {
        addRage(raid, 6);
        logs.push("🐉 Thiên Đạo im lặng. Cầu nguyện không đủ thành tâm.");
    }
}

function resolveMechanic(raid, logs) {
    switch (raid.phase.mechanicId) {
        case "death_mark":
            return resolveDeathMark(raid, logs);
        case "clones":
            return resolveClones(raid, logs);
        case "top_damage_target":
            return resolveTopDamageTarget(raid, logs);
        case "anti_spam":
            return resolveAntiSpam(raid, logs);
        case "dice_fate":
            return resolveDiceFate(raid, logs);
        case "soul_link":
            return resolveSoulLink(raid, logs);
        case "lantern_holder":
            return resolveLanternHolder(raid, logs);
        case "heaven_save":
            return resolveHeavenSave(raid, logs);
        default:
            return resolveDeathMark(raid, logs);
        case "belly_roll":
            return resolveBellyRoll(raid, logs);
    }
}

function buildSummaryLines(raid) {
    const players = getRegisteredPlayers(raid);

    const topDamage = [...players]
        .sort((a, b) => Number(b.damage || 0) - Number(a.damage || 0))
        .slice(0, 5);

    const topMechanic = [...players]
        .sort((a, b) => {
            return (
                Number(b.mechanicScore || 0) +
                Number(b.supportScore || 0) -
                (Number(a.mechanicScore || 0) + Number(a.supportScore || 0))
            );
        })
        .slice(0, 5);

    return [
        "",
        "🏆 **Top Damage:**",
        ...topDamage.map((p, i) => {
            return `${i + 1}. <@${p.userId}> — ${formatNumber(p.damage)}`;
        }),
        "",
        "🧠 **Top Cơ Chế/Hỗ Trợ:**",
        ...topMechanic.map((p, i) => {
            return `${i + 1}. <@${p.userId}> — ${
                Number(p.mechanicScore || 0) + Number(p.supportScore || 0)
            } điểm`;
        }),
    ];
}

class RaidServerManager {
    startAutoSchedule(client) {
        if (!raidConfig.enabled) {
            return;
        }

        const target = getNextDailyTimestamp(
            raidConfig.registerHour,
            raidConfig.registerMinute,
        );

        setTimer("raid_auto_register", target - now(), async () => {
            await this.openRegistrationAuto(client).catch((error) => {
                console.error("[RaidServer Auto]", error);
            });

            this.startAutoSchedule(client);
        });
    }

    async recover(client) {
        const raid = getCurrentRaid();

        if (!raid) {
            return;
        }

        if (raid.status === "registering") {
            const prepareDelay = Number(raid.prepareStartsAt || 0) - now();
            const startDelay = Number(raid.battleStartsAt || 0) - now();

            if (prepareDelay <= 0) {
                await this.prepareRaid(client, raid.id);
            } else {
                setTimer(`raid_prepare_${raid.id}`, prepareDelay, () => {
                    this.prepareRaid(client, raid.id).catch(console.error);
                });
            }

            setTimer(
                `raid_start_${raid.id}`,
                Math.max(1000, startDelay),
                () => {
                    this.startBattle(client, raid.id).catch(console.error);
                },
            );
        }

        if (raid.status === "preparing") {
            const delay = Number(raid.battleStartsAt || 0) - now();

            if (delay <= 0) {
                await this.startBattle(client, raid.id);
            } else {
                setTimer(`raid_start_${raid.id}`, delay, () => {
                    this.startBattle(client, raid.id).catch(console.error);
                });
            }
        }

        if (raid.status === "battle") {
            const delay = Number(raid.phase?.endsAt || 0) - now();

            setTimer(`raid_phase_${raid.id}`, Math.max(1000, delay), () => {
                this.resolvePhase(client, raid.id).catch(console.error);
            });
        }
    }

    async openRegistration(interaction) {
        return this.createRegistration(
            interaction.client,
            interaction.guild,
            interaction.channel,
            interaction,
        );
    }

    async openRegistrationAuto(client) {
        const guildId = process.env.GUILD_ID;
        const guild = guildId
            ? await client.guilds.fetch(guildId).catch(() => null)
            : client.guilds.cache.first();

        if (!guild) {
            return;
        }

        const channel = await this.findAnnounceChannel(guild);

        return this.createRegistration(client, guild, channel, null);
    }

    async findAnnounceChannel(guild) {
        if (raidConfig.announceChannelId) {
            const channel = await guild.channels
                .fetch(raidConfig.announceChannelId)
                .catch(() => null);

            if (channel) {
                return channel;
            }
        }

        return (
            guild.systemChannel ||
            guild.channels.cache.find((c) => {
                return c.type === ChannelType.GuildText && c.viewable;
            })
        );
    }

    async createRegistration(client, guild, sourceChannel, interaction = null) {
        const existing = getCurrentRaid();

        if (existing && !["finished", "cancelled"].includes(existing.status)) {
            const message = "❌ Đang có raid mở rồi.";

            if (interaction) {
                return interaction.reply({
                    content: message,
                    ephemeral: true,
                });
            }

            return sourceChannel?.send(message).catch(() => null);
        }

        if (!sourceChannel) {
            if (interaction) {
                return interaction.reply({
                    content: "❌ Không tìm thấy kênh để mở đăng ký raid.",
                    ephemeral: true,
                });
            }

            return null;
        }

        const registerAt = now();

        const prepareStartsAt = getDailyTimestampAfter(
            registerAt,
            raidConfig.prepareHour ?? raidConfig.startHour,
            raidConfig.prepareMinute ?? raidConfig.startMinute,
        );

        const configuredStartAt = getDailyTimestampAfter(
            registerAt,
            raidConfig.startHour,
            raidConfig.startMinute,
        );

        const battleStartsAt = Math.max(
            configuredStartAt,
            prepareStartsAt +
                Number(raidConfig.prepareMinutes || 10) * 60 * 1000,
        );

        const raid = {
            id: createRaidId(),
            dateKey: getDateKey(),
            status: "registering",

            guildId: guild.id,
            sourceChannelId: sourceChannel.id,
            raidChannelId: null,
            registerMessageId: null,

            createdAt: registerAt,
            prepareStartsAt,
            battleStartsAt,
            battleEndsAt:
                battleStartsAt +
                Number(raidConfig.maxBattleMinutes || 20) * 60 * 1000,

            boss: null,
            players: {},
            phase: null,

            stats: {
                totalDamage: 0,
                mechanicDamage: 0,
                deaths: 0,
                heavenSaveUsed: false,
                rageBursts: 0,
            },
        };

        setCurrentRaid(raid);

        const roleMention = await this.getNotifyMention(guild);
        const mentionText = roleMention ? `${roleMention}\n\n` : "";

        const msg = await sourceChannel.send({
            content: `${mentionText}☠️ **Raid Server đã mở đăng ký!**`,
            embeds: [buildRegisterEmbed(raid)],
            components: buildRegisterRows(),
            allowedMentions: {
                parse: ["roles"],
            },
        });

        raid.registerMessageId = msg.id;
        setCurrentRaid(raid);

        setTimer(`raid_prepare_${raid.id}`, prepareStartsAt - now(), () => {
            this.prepareRaid(client, raid.id).catch(console.error);
        });

        setTimer(`raid_start_${raid.id}`, battleStartsAt - now(), () => {
            this.startBattle(client, raid.id).catch(console.error);
        });

        if (interaction) {
            return interaction.reply({
                content: `✅ Đã mở đăng ký raid tại <#${sourceChannel.id}>. 20:50 bot sẽ tạo channel raid và tag người đăng ký.`,
                ephemeral: true,
            });
        }

        return null;
    }
    async createRaidChannel(guild, raid) {
        const registeredIds = Object.keys(raid.players || {});
        const permissionOverwrites = [];

        if (raidConfig.privateRaidChannel) {
            permissionOverwrites.push({
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel],
            });
        }

        for (const userId of registeredIds) {
            permissionOverwrites.push({
                id: userId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                ],
            });
        }

        return guild.channels.create({
            name: raidConfig.channelName || "raid-server",
            type: ChannelType.GuildText,
            parent: raidConfig.categoryId || undefined,
            permissionOverwrites,
            reason: "Raid Server gom người chuẩn bị",
        });
    }

    async prepareRaid(client, raidId) {
        const raid = getCurrentRaid();

        if (!raid || raid.id !== raidId || raid.status !== "registering") {
            return;
        }

        const guild = await client.guilds.fetch(raid.guildId).catch(() => null);
        const sourceChannel = raid.sourceChannelId
            ? await client.channels
                  .fetch(raid.sourceChannelId)
                  .catch(() => null)
            : null;

        if (!guild) {
            return;
        }

        const registered = getRegisteredPlayers(raid);

        if (registered.length < Number(raidConfig.minPlayers || 2)) {
            raid.status = "cancelled";
            raid.result = "not_enough_players";
            setCurrentRaid(raid);

            await sourceChannel
                ?.send(
                    "❌ Raid bị hủy vì không đủ người đăng ký trước giờ gom người.",
                )
                .catch(() => null);

            clearRaidTimers(raid.id);
            clearCurrentRaid();
            return;
        }

        for (const player of registered) {
            player.ready = false;
        }

        const raidChannel = await this.createRaidChannel(guild, raid);

        raid.raidChannelId = raidChannel.id;
        raid.status = "preparing";

        setCurrentRaid(raid);

        const registeredIds = registered.map((p) => p.userId);
        const mentionText = registeredIds.map((id) => `<@${id}>`).join(" ");

        await raidChannel
            .send({
                content: [
                    mentionText,
                    "",
                    `🐷 **${raidConfig.battleDisplayName || "Mamu 3 tạ 6 18m"} đang bò vào server!**`,
                    `Có **${raidConfig.prepareMinutes || 10} phút** chuẩn bị. Đúng 21:00 raid tự chạy.`,
                ].join("\n"),
                embeds: [buildPrepareEmbed(raid)],
                components: buildPrepareRows(),
                allowedMentions: {
                    users: registeredIds,
                },
            })
            .catch(() => null);

        await sourceChannel
            ?.send(
                `🐷 Đã gom người vào <#${raidChannel.id}>. Raid bắt đầu lúc 21:00.`,
            )
            .catch(() => null);
    }

    async getNotifyMention(guild) {
        if (raidConfig.notifyRoleId) {
            return `<@&${raidConfig.notifyRoleId}>`;
        }

        const role = guild.roles.cache.find(
            (r) => r.name === raidConfig.notifyRoleName,
        );

        return role ? `<@&${role.id}>` : `@${raidConfig.notifyRoleName}`;
    }

    async forceStart(interaction) {
        const raid = getCurrentRaid();

        if (!raid) {
            return interaction.reply({
                content: "❌ Chưa có raid.",
                ephemeral: true,
            });
        }

        await interaction.reply({
            content: "✅ Ép bắt đầu raid.",
            ephemeral: true,
        });

        return this.startBattle(interaction.client, raid.id);
    }

    async cancel(interaction) {
        const raid = getCurrentRaid();

        if (!raid) {
            return interaction.reply({
                content: "❌ Chưa có raid.",
                ephemeral: true,
            });
        }

        clearRaidTimers(raid.id);

        raid.status = "cancelled";
        raid.result = "cancelled";

        setCurrentRaid(raid);
        clearCurrentRaid();

        return interaction.reply({
            content: "✅ Đã hủy raid hiện tại.",
            ephemeral: true,
        });
    }

    async status(interaction) {
        const raid = getCurrentRaid();

        if (!raid) {
            return interaction.reply({
                content: "Không có raid đang chạy.",
                ephemeral: true,
            });
        }

        return interaction.reply({
            content: [
                `Status: **${raid.status}**`,
                `Người đăng ký: **${getRegisteredPlayers(raid).length}**`,
                `Còn sống: **${getAlivePlayers(raid).length}**`,
                raid.boss
                    ? `Boss HP: **${formatNumber(raid.boss.hp)} / ${formatNumber(
                          raid.boss.maxHp,
                      )}**`
                    : "Boss chưa bắt đầu.",
            ].join("\n"),
            ephemeral: true,
        });
    }

    async handleButton(interaction) {
        const id = interaction.customId;

        if (!id || !id.startsWith("raid_")) {
            return undefined;
        }

        if (id === "raid_join") return this.joinRaid(interaction);
        if (id === "raid_leave") return this.leaveRaid(interaction);
        if (id === "raid_ready") return this.readyRaid(interaction);
        if (id === "raid_list") return this.showList(interaction);
        if (id === "raid_rules") return this.showRules(interaction);

        if (id.startsWith("raid_act_")) {
            return this.selectAction(interaction, id.replace("raid_act_", ""));
        }

        return undefined;
    }

    async joinRaid(interaction) {
        const raid = getCurrentRaid();

        if (!raid || raid.status !== "registering") {
            return interaction.reply({
                content: "❌ Hiện không mở đăng ký raid.",
                ephemeral: true,
            });
        }

        if (!raid.players[interaction.user.id]) {
            raid.players[interaction.user.id] = createRaidPlayer(
                interaction.user.id,
            );
        }

        setCurrentRaid(raid);

        return interaction.reply({
            content: "✅ Bạn đã đăng ký Raid Server.",
            ephemeral: true,
        });
    }

    async leaveRaid(interaction) {
        const raid = getCurrentRaid();

        if (!raid || raid.status !== "registering") {
            return interaction.reply({
                content: "❌ Không thể hủy lúc này.",
                ephemeral: true,
            });
        }

        delete raid.players[interaction.user.id];
        setCurrentRaid(raid);

        return interaction.reply({
            content: "🚪 Đã hủy đăng ký raid.",
            ephemeral: true,
        });
    }

    async readyRaid(interaction) {
        const raid = getCurrentRaid();

        if (!raid || !raid.players[interaction.user.id]) {
            return interaction.reply({
                content: "❌ Bạn chưa đăng ký raid.",
                ephemeral: true,
            });
        }

        raid.players[interaction.user.id].ready = true;
        setCurrentRaid(raid);

        return interaction.reply({
            content: "✅ Bạn đã sẵn sàng.",
            ephemeral: true,
        });
    }

    async showList(interaction) {
        const raid = getCurrentRaid();

        if (!raid) {
            return interaction.reply({
                content: "Không có raid.",
                ephemeral: true,
            });
        }

        const list =
            getRegisteredPlayers(raid)
                .map((p, i) => {
                    return `${i + 1}. <@${p.userId}> ${p.ready ? "✅" : ""}`;
                })
                .join("\n") || "Chưa ai đăng ký.";

        return interaction.reply({
            content: list.slice(0, 1900),
            ephemeral: true,
        });
    }

    async showRules(interaction) {
        return interaction.reply({
            content: [
                "📜 **Luật Raid Server**",
                "- Có HP riêng, chết là mất quyền đánh chính.",
                "- Phải đọc mechanic, không spam Công Kích.",
                "- Đăng ký nhưng không đánh/AFK sẽ không nhận quà.",
                "- Thắng mới có 🌈 Rương Tàn Tích EX.",
                "- Xử lý mechanic chuẩn gây sát thương thật theo % máu boss.",
            ].join("\n"),
            ephemeral: true,
        });
    }

    async selectAction(interaction, action) {
        const raid = getCurrentRaid();

        if (
            !raid ||
            raid.status !== "battle" ||
            !raid.phase ||
            raid.phase.resolved
        ) {
            return interaction.reply({
                content: "❌ Phase hiện tại không nhận hành động.",
                ephemeral: true,
            });
        }

        const player = raid.players[interaction.user.id];

        if (!player) {
            return interaction.reply({
                content: "❌ Bạn không đăng ký raid này.",
                ephemeral: true,
            });
        }

        if (player.alive === false) {
            return interaction.reply({
                content: "💀 Bạn đã chết, không thể hành động chính.",
                ephemeral: true,
            });
        }

        raid.phase.actions[interaction.user.id] = action;
        setCurrentRaid(raid);

        return interaction.reply({
            content: `✅ Đã chọn **${ACTIONS[action]?.emoji || ""} ${
                ACTIONS[action]?.label || action
            }**.`,
            ephemeral: true,
        });
    }

    async startBattle(client, raidId) {
        const raid = getCurrentRaid();

        if (!raid || raid.id !== raidId || raid.status === "battle") {
            return;
        }

        const registered = getRegisteredPlayers(raid);

        let channel = raid.raidChannelId
            ? await client.channels.fetch(raid.raidChannelId).catch(() => null)
            : null;

        if (!channel) {
            const guild = await client.guilds
                .fetch(raid.guildId)
                .catch(() => null);

            if (!guild) {
                return;
            }

            channel = await this.createRaidChannel(guild, raid);
            raid.raidChannelId = channel.id;
        }

        if (registered.length < Number(raidConfig.minPlayers || 2)) {
            raid.status = "cancelled";
            raid.result = "not_enough_players";

            setCurrentRaid(raid);

            await channel
                ?.send("❌ Raid bị hủy vì không đủ người đăng ký.")
                .catch(() => null);

            clearRaidTimers(raid.id);
            clearCurrentRaid();
            return;
        }

        const scaleCount = Math.max(
            registered.filter((p) => p.ready).length,
            Math.ceil(registered.length * 0.6),
            1,
        );

        raid.status = "battle";
        raid.boss = createBoss(scaleCount);
        raid.phase = null;
        raid.battleStartedAt = now();
        raid.battleEndsAt =
            now() + Number(raidConfig.maxBattleMinutes || 20) * 60 * 1000;

        setCurrentRaid(raid);

        await channel
            ?.setName(
                raidConfig.battleChannelName || "mamu-3-ta-6-18m",
                "Raid Server bắt đầu",
            )
            .catch(() => null);

        await channel
            ?.send(
                [
                    `🐷 **${raidConfig.battleDisplayName || "Mamu 3 tạ 6 18m"} đã thức tỉnh!**`,
                    "🔒 **RAID ĐÃ KHÓA**",
                    `Người đăng ký: **${registered.length}**`,
                    `Độ khó scale theo: **${scaleCount}** người`,
                    "Ai không bấm hành động sẽ bị tính AFK và không nhận quà.",
                ].join("\n"),
            )
            .catch(() => null);

        return this.startNextPhase(client, raid.id);
    }

    async startNextPhase(client, raidId) {
        const raid = getCurrentRaid();

        if (!raid || raid.id !== raidId || raid.status !== "battle") {
            return;
        }

        const channel = await client.channels
            .fetch(raid.raidChannelId)
            .catch(() => null);

        if (!channel) {
            return;
        }

        const mechanicId = pickMechanic(raid);

        raid.phase = {
            number: Number(raid.phase?.number || 0) + 1,
            mechanicId,
            targetUserIds: chooseTargets(raid, mechanicId),
            actions: {},
            startedAt: now(),
            endsAt: now() + Number(raidConfig.phaseSeconds || 30) * 1000,
            resolved: false,
        };

        setCurrentRaid(raid);

        await channel.send({
            embeds: [buildPhaseEmbed(raid)],
            components: buildActionRows(raid),
        });

        setTimer(
            `raid_phase_${raid.id}`,
            Number(raidConfig.phaseSeconds || 30) * 1000,
            () => {
                this.resolvePhase(client, raid.id).catch(console.error);
            },
        );
    }

    async resolvePhase(client, raidId) {
        const raid = getCurrentRaid();

        if (
            !raid ||
            raid.id !== raidId ||
            raid.status !== "battle" ||
            raid.phase?.resolved
        ) {
            return;
        }

        const channel = await client.channels
            .fetch(raid.raidChannelId)
            .catch(() => null);

        raid.phase.resolved = true;

        const logs = [];

        countAndMarkAfk(raid);
        applyPlayerActionDamage(raid, logs);
        resolveMechanic(raid, logs);

        if (
            Number(raid.boss.rage || 0) >=
            Number(raidConfig.boss.maxRage || 100)
        ) {
            raid.stats.rageBursts += 1;
            raid.boss.rage = 35;

            logs.push("💀 Boss tung Cấm Kỵ Diệt Server Kiếm vì Nộ đạt 100!");

            for (const p of getAlivePlayers(raid)) {
                damagePlayer(raid, p, raid.boss.atk * 1.6, "Boss bùng Nộ");
            }
        }

        setCurrentRaid(raid);

        const result = this.checkEnd(raid);

        if (result) {
            return this.finishRaid(client, raid.id, result, logs);
        }

        await channel
            ?.send({
                embeds: [
                    buildResultEmbed(raid, "phase", logs).setTitle(
                        `📌 Kết quả Phase ${raid.phase.number}`,
                    ),
                ],
            })
            .catch(() => null);

        return this.startNextPhase(client, raid.id);
    }

    checkEnd(raid) {
        if (raid.boss.hp <= 0) {
            return "win";
        }

        if (getAlivePlayers(raid).length <= 0) {
            return "lose";
        }

        if (now() >= Number(raid.battleEndsAt || 0)) {
            return "lose";
        }

        return null;
    }

    async finishRaid(client, raidId, result, logs = []) {
        const raid = getCurrentRaid();

        if (!raid || raid.id !== raidId) {
            return;
        }

        const channel = await client.channels
            .fetch(raid.raidChannelId)
            .catch(() => null);

        raid.status = "finished";
        raid.result = result;

        this.distributeRewards(raid, result, logs);

        setCurrentRaid(raid);

        await channel
            ?.send({
                embeds: [
                    buildResultEmbed(raid, result, [
                        ...logs,
                        ...buildSummaryLines(raid),
                    ]),
                ],
            })
            .catch(() => null);

        clearRaidTimers(raid.id);
        clearCurrentRaid();
    }

    distributeRewards(raid, result, logs) {
        for (const player of getRegisteredPlayers(raid)) {
            const diedOk =
                player.deadAtPhase === null ||
                Number(player.deadAtPhase || 0) >=
                    Number(raidConfig.reward.minDeathPhaseForChest || 3);

            const eligible =
                result === "win" &&
                player.actionsTaken >=
                    Number(raidConfig.reward.minActionsForChest || 3) &&
                player.activePhases >=
                    Number(raidConfig.reward.minPhasesForChest || 4) &&
                player.afkPhases <=
                    Number(raidConfig.reward.maxAfkPhasesForChest || 2) &&
                diedOk;

            if (eligible) {
                database.addShopItem(
                    player.userId,
                    raidConfig.reward.chestItemId || "ruong_tan_tich_ex",
                    1,
                );

                database.addMoney(
                    player.userId,
                    randomInt(
                        raidConfig.reward.winMoneyMin,
                        raidConfig.reward.winMoneyMax,
                    ),
                );

                database.updateTuTienProfile(player.userId, (profile) => {
                    profile.exp =
                        Number(profile.exp || 0) +
                        randomInt(
                            raidConfig.reward.winExpMin,
                            raidConfig.reward.winExpMax,
                        );
                });

                player.rewardEligible = true;
            } else if (player.actionsTaken > 0) {
                database.addMoney(
                    player.userId,
                    randomInt(
                        raidConfig.reward.loseMoneyMin,
                        raidConfig.reward.loseMoneyMax,
                    ),
                );

                database.updateTuTienProfile(player.userId, (profile) => {
                    profile.exp =
                        Number(profile.exp || 0) +
                        randomInt(
                            raidConfig.reward.loseExpMin,
                            raidConfig.reward.loseExpMax,
                        );
                });

                player.rewardEligible = false;
                player.rewardReason =
                    result !== "win" ? "Raid thua" : "Không đủ điều kiện rương";
            } else {
                player.rewardEligible = false;
                player.rewardReason = "Đăng ký nhưng không đánh";
            }
        }

        const chestCount = getRegisteredPlayers(raid).filter(
            (p) => p.rewardEligible,
        ).length;

        logs.push(
            result === "win"
                ? `🎁 Đã phát **${chestCount}** Rương Tàn Tích EX cho người đủ điều kiện.`
                : "🎁 Raid thua, không phát Rương Tàn Tích EX.",
        );
    }
}

module.exports = new RaidServerManager();
