require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const botConfig = require("./config/bot");
const router = require("./core/router");
const leaderboard = require("./leaderboard");
const bicanh = require("./bicanh");
const worldboss = require("./worldboss");
const sanyeuthu = require("./sanyeuthu");
const duyen = require("./duyen");
const duyenConfig = require("./config/duyen");
const raidserver = require("./raidserver");

function requireEnv(name) {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Missing env: ${name}`);
    }

    return value;
}

function buildIntents() {
    const intents = [];

    if (botConfig.intents.guilds) {
        intents.push(GatewayIntentBits.Guilds);
    }

    if (botConfig.intents.guildMessages) {
        intents.push(GatewayIntentBits.GuildMessages);
    }

    if (botConfig.intents.messageContent) {
        intents.push(GatewayIntentBits.MessageContent);
    }

    return intents;
}

const client = new Client({ intents: buildIntents() });

client.on("error", (error) => {
    if (isIgnoredInteractionError(error)) {
        return;
    }

    console.error("[Client Error]", error);
});

process.on("unhandledRejection", (error) => {
    if (isIgnoredInteractionError(error)) {
        return;
    }

    console.error("[Unhandled Rejection]", error);
});

process.on("uncaughtException", (error) => {
    console.error("[Uncaught Exception]", error);
});
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getMinutesOfDay(date = new Date(), timezone = "Asia/Ho_Chi_Minh") {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).formatToParts(date);

    const hour =
        Number(parts.find((part) => part.type === "hour")?.value || 0) % 24;
    const minute = Number(
        parts.find((part) => part.type === "minute")?.value || 0,
    );

    return hour * 60 + minute;
}

function isInAvoidWindow(date, window, timezone = "Asia/Ho_Chi_Minh") {
    const nowMinutes = getMinutesOfDay(date, timezone);
    const start =
        Number(window.startHour || 0) * 60 + Number(window.startMinute || 0);
    const end =
        Number(window.endHour || 0) * 60 + Number(window.endMinute || 0);

    if (start <= end) {
        return nowMinutes >= start && nowMinutes <= end;
    }

    return nowMinutes >= start || nowMinutes <= end;
}

function isInDuyenAvoidTime(date = new Date()) {
    const autoConfig = duyenConfig.autoOpen || {};
    const avoidWindows = Array.isArray(autoConfig.avoidWindows)
        ? autoConfig.avoidWindows
        : [];

    const timezone = autoConfig.timezone || "Asia/Ho_Chi_Minh";

    return avoidWindows.some((window) =>
        isInAvoidWindow(date, window, timezone),
    );
}

function getDelayAfterAvoidWindow(date, window, timezone = "Asia/Ho_Chi_Minh") {
    const nowMinutes = getMinutesOfDay(date, timezone);
    const start =
        Number(window.startHour || 0) * 60 + Number(window.startMinute || 0);
    const end =
        Number(window.endHour || 0) * 60 + Number(window.endMinute || 0);

    let minutesUntilEnd = 0;

    if (start <= end) {
        minutesUntilEnd = end - nowMinutes;
    } else if (nowMinutes >= start) {
        minutesUntilEnd = 24 * 60 - nowMinutes + end;
    } else {
        minutesUntilEnd = end - nowMinutes;
    }

    return Math.max(1, minutesUntilEnd + randomInt(5, 20)) * 60 * 1000;
}

function normalizeDuyenDelay(delay) {
    const autoConfig = duyenConfig.autoOpen || {};
    const avoidWindows = Array.isArray(autoConfig.avoidWindows)
        ? autoConfig.avoidWindows
        : [];
    const timezone = autoConfig.timezone || "Asia/Ho_Chi_Minh";
    const targetDate = new Date(Date.now() + delay);

    const matchedWindow = avoidWindows.find((window) => {
        return isInAvoidWindow(targetDate, window, timezone);
    });

    if (!matchedWindow) {
        return delay;
    }

    return (
        delay + getDelayAfterAvoidWindow(targetDate, matchedWindow, timezone)
    );
}

function scheduleAutoDuyen(client) {
    const autoConfig = duyenConfig.autoOpen || {};

    if (!autoConfig.enabled) {
        console.log("[DUYEN AUTO] Đã tắt auto cơ duyên.");
        return;
    }

    const minDelay = Number(autoConfig.minDelayMs || 3 * 60 * 60 * 1000);
    const maxDelay = Number(autoConfig.maxDelayMs || 6 * 60 * 60 * 1000);
    const rawDelay = randomInt(minDelay, maxDelay);
    const delay = normalizeDuyenDelay(rawDelay);

    console.log(
        `[DUYEN AUTO] Lần mở tiếp theo sau khoảng ${Math.round(delay / 60000)} phút.`,
    );

    setTimeout(async () => {
        try {
            if (isInDuyenAvoidTime()) {
                console.log(
                    "[DUYEN AUTO] Đang trong khung giờ raid, bỏ qua lần mở này.",
                );
            } else {
                await duyen.autoStart(client);
                console.log("[DUYEN AUTO] Đã tự động mở Cơ Duyên.");
            }
        } catch (error) {
            console.error("[DUYEN AUTO] Lỗi khi mở cơ duyên:", error);
        }

        scheduleAutoDuyen(client);
    }, delay);
}

function isIgnoredInteractionError(error) {
    return (
        error?.code === 10062 ||
        error?.code === 40060 ||
        error?.rawError?.code === 10062 ||
        error?.rawError?.code === 40060
    );
}

client.once("clientReady", () => {
    console.log(`Logged in as ${client.user.tag}`);

    bicanh.recover(client).catch((error) => {
        console.error("[BiCanh Recover]", error);
    });
    scheduleAutoDuyen(client);
    sanyeuthu.recover(client).catch((error) => {
        console.error("[SanYeuThu Recover]", error);
    });
    raidserver.recover(client).catch((error) => {
        console.error("[RaidServer Recover]", error);
    });

    raidserver.startAutoSchedule(client);
    router.startAutoActiveRain?.(client);

    leaderboard.startAutoUpdate(client);
    worldboss.startAutoSpawn(client);
});

client.on("interactionCreate", async (interaction) => {
    try {
        if (interaction.isAutocomplete()) {
            await router.handleAutocomplete(interaction);
            return;
        }

        if (interaction.isChatInputCommand()) {
            await router.handleCommand(interaction);
            return;
        }

        if (interaction.isModalSubmit()) {
            await router.handleModal(interaction);
            return;
        }

        if (interaction.isButton() || interaction.isStringSelectMenu()) {
            await router.handleButton(interaction);
            return;
        }

        return undefined;
    } catch (error) {
        if (isIgnoredInteractionError(error)) {
            return undefined;
        }

        console.error(error);

        if (!interaction.isRepliable()) {
            return undefined;
        }

        const payload = {
            content: "❌ Bot lỗi rồi, xem console để sửa.",
            ephemeral: true,
        };

        if (interaction.replied || interaction.deferred) {
            return interaction.followUp(payload).catch(() => undefined);
        }

        return interaction.reply(payload).catch(() => undefined);
    }
});

client.on("messageCreate", async (message) => {
    try {
        return router.handleMessage(message);
    } catch (error) {
        console.error(error);
        return undefined;
    }
});

client.login(requireEnv("TOKEN"));
