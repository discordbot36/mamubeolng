"use strict";

const { bettingPolicy } = require("./strategy");

function readConfig(env = process.env) {
    const integer = (name, fallback, min = 0) => {
        const raw = env[name] ?? String(fallback);
        if (!/^\d+$/.test(raw)) throw new Error(`${name} phải là số nguyên >= ${min}.`);
        const value = Number(raw);
        if (!Number.isSafeInteger(value) || value < min) throw new Error(`${name} phải là số nguyên >= ${min}.`);
        return value;
    };
    const flag = (name, fallback) => {
        const raw = env[name] ?? String(fallback);
        if (!["true", "false"].includes(raw)) throw new Error(`${name} phải là true hoặc false.`);
        return raw === "true";
    };
    const id = (name, fallback = "") => {
        const raw = env[name] || fallback;
        if (!/^\d{17,20}$/.test(raw)) throw new Error(`Điền ${name} bằng Discord ID trong .env.`);
        return raw;
    };
    const command = (name, fallback) => {
        const raw = env[name] ?? fallback;
        if (!/^[\p{L}\p{N}_-]{1,32}$/u.test(raw)) throw new Error(`${name} không hợp lệ; không thêm dấu /.`);
        return raw;
    };
    const dailyTime = env.DAILY_TIME ?? "00:05";
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(dailyTime)) throw new Error("DAILY_TIME phải có dạng HH:MM.");
    const timezone = env.TIMEZONE ?? "Asia/Ho_Chi_Minh";
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone }).format();
    const token = env.DISCORD_USER_TOKEN?.trim();
    if (!token) throw new Error("Điền DISCORD_USER_TOKEN trên máy của bạn trong .env.");
    const sequenceText = env.WIN_BET_SEQUENCE ?? "1,2,3,5";
    if (!/^\d+(?:\s*,\s*\d+)*$/.test(sequenceText)) throw new Error("WIN_BET_SEQUENCE phải có dạng 1,2,3,5.");
    const policy = bettingPolicy(env.BETTING_MODE || "martingale", sequenceText.split(",").map(Number), integer("MARTINGALE_RESET_AT", 32));
    const aceRule = env.ACE_RULE || "standard";
    if (!["standard", "draw_time", "initial_two"].includes(aceRule)) throw new Error("ACE_RULE phải là standard, draw_time hoặc initial_two.");
    const dealerStandOn = integer("DEALER_STAND_ON", 17, 16);
    if (![16, 17].includes(dealerStandOn)) throw new Error("DEALER_STAND_ON phải là 16 hoặc 17.");
    const naturalWinMultiplier = integer("NATURAL_WIN_MULTIPLIER", 1, 1);
    if (![1, 2].includes(naturalWinMultiplier)) throw new Error("NATURAL_WIN_MULTIPLIER phải là 1 hoặc 2.");
    const config = {
        token, botId: id("CHAMBER_BOT_ID"), channelId: id("CHANNEL_ID"),
        dailyChannelId: id("DAILY_CHANNEL_ID", env.CHANNEL_ID),
        baseBet: integer("BASE_BET", 1, 1), maxBet: integer("MAX_BET", 0),
        bettingMode: policy.mode, winBetSequence: policy.sequence,
        martingaleResetAt: policy.resetAt || 0,
        aceRule, dealerHitsSoft17: flag("DEALER_HITS_SOFT_17", false), dealerPeek: flag("DEALER_PEEK", false),
        dealerStandOn, bothBustPush: flag("BOTH_BUST_PUSH", false), naturalWinMultiplier,
        maxLossStreak: integer("MAX_LOSS_STREAK", 0),
        roundDelayMs: integer("ROUND_DELAY_SECONDS", 15, 5) * 1000,
        actionDelayMs: integer("ACTION_DELAY_MS", 1500, 500),
        interactionGapMs: integer("INTERACTION_GAP_SECONDS", 5, 3) * 1000,
        responseTimeoutMs: integer("RESPONSE_TIMEOUT_SECONDS", 30, 5) * 1000,
        boardTimeoutMs: integer("BOARD_UPDATE_TIMEOUT_SECONDS", 75, 5) * 1000,
        walletEveryRounds: integer("WALLET_EVERY_ROUNDS", 50),
        walletTimeoutMs: integer("WALLET_TIMEOUT_SECONDS", 20, 5) * 1000,
        dailyEnabled: flag("DAILY_ENABLED", true), dailyTime, timezone,
        dailyCommand: command("DAILY_COMMAND", "diemdanh"),
        accountCommand: command("ACCOUNT_COMMAND", "taikhoan"),
        blackjackCommand: command("BLACKJACK_COMMAND", "blackjack"),
        moneyOption: command("MONEY_OPTION", "money"),
    };
    if (config.maxBet && config.maxBet < config.baseBet) throw new Error("MAX_BET nhỏ hơn BASE_BET.");
    if (config.martingaleResetAt && config.baseBet > config.martingaleResetAt) throw new Error("BASE_BET lớn hơn MARTINGALE_RESET_AT.");
    if (policy.mode === "win_progression") {
        const largest = config.baseBet * policy.sequence.at(-1);
        if (!Number.isSafeInteger(largest) || (config.maxBet && largest > config.maxBet)) {
            throw new Error("Chuỗi cược thắng vượt MAX_BET hoặc giới hạn số nguyên an toàn.");
        }
    }
    return config;
}

function localClock(date, timezone) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(date).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function dailyDue(config, state, date = new Date()) {
    const clock = localClock(date, config.timezone);
    return config.dailyEnabled && clock.time >= config.dailyTime && state.daily?.date !== clock.date;
}

module.exports = { readConfig, localClock, dailyDue };
