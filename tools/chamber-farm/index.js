"use strict";

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { once } = require("node:events");
const { setTimeout: sleep } = require("node:timers/promises");
const { dailyDue, localClock } = require("./config");
const { StateStore, acquireLock } = require("./state");
const { playRound, recoverRound } = require("./engine");
const { DiscordTransport, diagnostic } = require("./transport");
const { installInteractionWaiter } = require("./interactions");
const { installPostGuard } = require("./post-guard");
const { runtimeConfig, changeBaseBet } = require("./betting-controls");
const { WalletActions } = require("./wallet-actions");

async function main() {
    const dataDirectory = process.env.CHAMBER_DATA_DIR ? path.resolve(process.env.CHAMBER_DATA_DIR) : __dirname;
    const config = runtimeConfig(process.env, dataDirectory);
    const managed = process.argv.includes("--managed");
    const send = value => { if (process.connected) process.send(value, () => {}); };
    const log = value => {
        const text = `[${new Date().toLocaleString("vi-VN", { timeZone: config.timezone })}] ${value}`;
        console.log(text);
        send({ type: "log", text });
    };
    // Only print error text after removing credentials, never an error/request object.
    const safeError = error => String(error?.message || "Lỗi không rõ").split(config.token).join("[REDACTED]");
    if (process.argv.includes("--check")) {
        const store = new StateStore(path.join(dataDirectory, "state.json"), config.baseBet);
        const change = store.configureBetting(config.bettingMode, config.winBetSequence, config.martingaleResetAt);
        log(`Cấu hình hợp lệ. Cược tiếp ${store.data.nextBet}; điểm danh ${config.dailyTime} (${config.timezone}).`);
        log(`Cược: ${config.bettingMode}${config.bettingMode === "win_progression" ? ` [${config.winBetSequence.join(" → ")}]` : ""}; trần ${config.maxBet || "không đặt"}.${change.deferred ? " Chờ đối soát ván cũ trước khi đổi chế độ." : ""}`);
        log(`Chọn bài theo EV; luật Át ${config.aceRule}; dealer soft 17: ${config.dealerHitsSoft17 ? "rút" : "dừng"}.`);
        log(`Chờ xác nhận thao tác ${config.responseTimeoutMs / 1000}s; chờ cập nhật bài ${config.boardTimeoutMs / 1000}s.`);
        log(`Kênh blackjack: ${config.channelId}; kênh điểm danh: ${config.dailyChannelId}.`);
        log("Chưa đăng nhập hoặc gửi lệnh Discord. npm start để chạy.");
        return;
    }
    const releaseLock = await acquireLock(dataDirectory);
    let store;
    let client;
    let consoleInput;
    let stopping = false;
    let busy = false;
    let unhandled;
    let restoreInteractionWaiter;
    let postGuard;
    let consoleRecovery;
    let readyForCommands = false;
    let ipcHandler;
    let activeOperation;
    let nextDailyCheckAt = 0;
    const loginAbort = new AbortController();
    const quit = () => { stopping = true; };
    const snapshot = () => ({ ready: readyForCommands, busy, stopping,
        paused: store?.data.paused ?? true, pending: store?.data.pending || null,
        rounds: store?.data.rounds || 0, lossStreak: store?.data.lossStreak || 0,
        nextBet: store?.data.nextBet ?? config.baseBet, baseBet: store?.data.baseBet ?? config.baseBet,
        betting: store?.data.betting || { mode: config.bettingMode, sequence: config.winBetSequence, resetAt: config.martingaleResetAt, step: 0 },
        maxBet: config.maxBet || 50, session: store?.data.session || null,
        interactionCooldownUntil: store?.data.interactionCooldownUntil || 0,
        daily: store?.data.daily || null, lastError: store?.data.lastError || null,
        today: localClock(new Date(), config.timezone).date, nextRoundAt: store?.data.nextRoundAt || 0 });
    const publish = () => send({ type: "status", status: snapshot() });
    process.once("SIGINT", quit);
    process.once("SIGTERM", quit);
    process.once("disconnect", quit);
    process.once("exit", releaseLock);
    try {
        // Read mutable betting state only after obtaining the process guard.
        store = new StateStore(path.join(dataDirectory, "state.json"), config.baseBet);
        store.onSave = publish;
        const bettingChange = store.configureBetting(config.bettingMode, config.winBetSequence, config.martingaleResetAt);
        if (managed) { store.data.paused = true; store.save(); }
        const { Client } = require("discord.js-selfbot-v13");
        client = new Client({ retryLimit: 0, captchaRetryLimit: 0, rejectOnRateLimit: () => true });
        restoreInteractionWaiter = installInteractionWaiter(client, config.responseTimeoutMs, undefined, interaction => {
            if (!interaction.deferred && store.data.pending && !store.data.pending.messageId) {
                store.data.pending.commandNonce = interaction.nonce;
                store.save();
                store.record("slash_wait", { nonce: interaction.nonce });
            }
        });
        client.on("error", error => {
            store.data.paused = true;
            store.save();
            log(`Discord báo lỗi, đã pause: ${safeError(error)}`);
        });
        // The upstream interaction helpers may reject their POST independently.
        // Stop the process on an unhandled rejection; pending state remains on disk.
        unhandled = error => {
            log(`Dừng vì lỗi chưa xử lý: ${safeError(error)}`);
            stopping = true;
            client.destroy();
        };
        process.on("unhandledRejection", unhandled);
        const ready = once(client, "ready", { signal: AbortSignal.any([loginAbort.signal, AbortSignal.timeout(60_000)]) });
        await Promise.all([client.login(config.token), ready]);
        const channel = await client.channels.fetch(config.channelId);
        if (!channel?.guild || typeof channel.sendSlash !== "function") throw new Error("CHANNEL_ID phải là kênh văn bản trong server.");
        const dailyChannel = !config.dailyEnabled || config.dailyChannelId === config.channelId
            ? channel : await client.channels.fetch(config.dailyChannelId);
        if (config.dailyEnabled && (!dailyChannel?.guild || typeof dailyChannel.sendSlash !== "function" ||
            dailyChannel.guild.id !== channel.guild.id)) {
            throw new Error("DAILY_CHANNEL_ID phải là kênh văn bản trong cùng server với kênh blackjack.");
        }
        const transport = new DiscordTransport(client, channel, config, dailyChannel);
        transport.audit = (event, details) => {
            store.record(event, details);
            if (event === "board_waiting") log("Chamber chưa cập nhật bài sau 30 giây; đang đọc lại lịch sử, không bấm lại nút.");
            if (event === "interaction_cooldown") log(`Discord giới hạn thao tác; cần chờ ${Math.ceil(details.retryAfterMs / 1000)} giây.`);
        };
        postGuard = installPostGuard(client, { gapMs: config.interactionGapMs, cooldownUntil: store.data.interactionCooldownUntil || 0, audit: transport.audit,
            onCooldown: until => {
                store.data.interactionCooldownUntil = Math.max(store.data.interactionCooldownUntil || 0, until);
                store.save();
            } });
        transport.pace = () => postGuard.waitTurn();
        await transport.prepare();
        if (process.argv.includes("--verify")) {
            log(`Đã xác minh trực tiếp /${config.blackjackCommand} ${config.moneyOption} trong kênh ${config.channelId}.`);
            if (config.dailyEnabled) log(`Đã xác minh /${config.dailyCommand} trong kênh ${config.dailyChannelId}.`);
            log("Chưa gửi slash command hoặc đặt cược. npm start để chạy.");
            return;
        }
        store.bind(client.user.id, config.channelId, config.botId);
        const diagnose = message => {
            fs.writeFileSync(path.join(dataDirectory, "diagnostic.json"), JSON.stringify(diagnostic(message), null, 2) + "\n", { mode: 0o600 });
        };
        const wallet = new WalletActions({ store, config, transport, log });
        if (process.argv.includes("--recover")) {
            await recoverRound({ config, store, transport, log, diagnose: message => {
                fs.writeFileSync(path.join(dataDirectory, "diagnostic.json"), JSON.stringify(diagnostic(message), null, 2) + "\n", { mode: 0o600 });
            } });
            return;
        }
        log(`Đã kết nối ${client.user.username}. Tiếp/Thôi theo EV (${config.aceRule}); cược ${config.bettingMode}; gốc ${config.baseBet}.`);
        if (bettingChange.deferred) log("Chế độ mới sẽ áp dụng sau khi đối soát ván cũ, bắt đầu lại ở cược gốc.");
        if (store.data.pending) {
            store.data.paused = true;
            store.save();
            log(`Có ván chưa rõ kết quả (cược ${store.data.pending.bet}). Xem Discord rồi gõ reconcile win|loss|push|void.`);
        }
        const help = "Lệnh: status | pause | resume | account | daily | recover | reconcile win/loss/push/void | quit";
        const exclusive = async action => {
            if (busy) throw new Error("Bot đang xử lý ván/thao tác khác. Chờ hoàn tất rồi thử lại.");
            busy = true;
            publish();
            activeOperation = Promise.resolve().then(action);
            try { return await activeOperation; } finally { activeOperation = null; busy = false; publish(); }
        };
        const command = async (name, args = {}) => {
            if (stopping && !["status", "pause", "quit"].includes(name)) throw new Error("Phiên đang kết thúc. Chờ ngắt kết nối xong trước khi mở phiên mới.");
            if (name === "status") return snapshot();
            if (name === "pause") {
                store.data.paused = true;
                store.save();
                log("Đã tạm dừng mở ván mới; ván hiện tại được xử lý xong.");
            } else if (name === "quit") { quit(); publish(); }
            else await exclusive(async () => {
                if (name === "resume") {
                    if (store.data.pending) throw new Error("Còn ván chưa rõ kết quả. Bấm Đối soát ván trước.");
                    if (store.data.interactionCooldownUntil > Date.now()) throw new Error(`Discord đang giới hạn thao tác. Chờ thêm ${Math.ceil((store.data.interactionCooldownUntil - Date.now()) / 1000)} giây.`);
                    if (config.maxBet && store.data.nextBet > config.maxBet) throw new Error(`Cược tiếp ${store.data.nextBet} vượt trần ${config.maxBet} coin. Đổi cược gốc khi tạm dừng để bắt đầu chuỗi mới.`);
                    await wallet.ensure();
                    if (store.data.session.balance < store.data.nextBet) throw new Error("Số dư theo phiên không đủ cược tiếp. Kiểm tra lại ví hoặc giảm cược.");
                    store.data.paused = false;
                    delete store.data.lastError;
                    store.save();
                    log("Đã bắt đầu/tiếp tục phiên.");
                } else if (name === "account") await wallet.account();
                else if (name === "daily") await wallet.daily();
                else if (name === "base") changeBaseBet(store, config, args.base, false, transport);
                else if (name === "recover") {
                    if (!store.data.paused) throw new Error("Tạm dừng trước khi đối soát ván.");
                    consoleRecovery = recoverRound({ config, store, transport, log, diagnose });
                    try { await consoleRecovery; } finally { consoleRecovery = null; }
                } else if (name === "reconcile") {
                    if (!store.data.paused) throw new Error("Tạm dừng trước khi ghi kết quả.");
                    store.settle(args.result, config.roundDelayMs);
                } else throw new Error(help);
            });
            return snapshot();
        };
        ipcHandler = async request => {
            if (request?.type !== "command" || typeof request.id !== "string") return;
            try {
                const result = await command(request.command, request.args || {});
                send({ type: "response", id: request.id, ok: true, status: result });
            } catch (error) {
                send({ type: "response", id: request.id, ok: false, error: safeError(error), status: snapshot() });
                log(safeError(error));
            }
        };
        process.on("message", ipcHandler);
        if (!managed) {
            consoleInput = readline.createInterface({ input: process.stdin, output: process.stdout });
            consoleInput.on("line", line => {
                const [name, result] = line.trim().toLowerCase().split(/\s+/);
                if (!name) return;
                command(name, { result }).then(status => {
                    if (name === "status") log(JSON.stringify(status));
                }).catch(error => log(safeError(error)));
            });
            log(help);
        }
        readyForCommands = true;
        publish();
        if (!managed && !store.data.paused && !store.data.pending) {
            try { await exclusive(() => wallet.ensure()); }
            catch (error) { store.data.paused = true; store.save(); log(safeError(error)); }
        }
        while (!stopping) {
            if (!busy && !store.data.pending && Date.now() >= nextDailyCheckAt && (!managed || wallet.initialized) && dailyDue(config, store.data)) {
                busy = true;
                try {
                    await wallet.daily();
                } catch (error) {
                    nextDailyCheckAt = Date.now() + 300000;
                    log(`Điểm danh chưa xác nhận, không tự gửi lặp hôm nay: ${safeError(error)}`);
                } finally {
                    busy = false;
                    publish();
                }
            }
            if (!stopping && !busy && !store.data.paused && Date.now() >= store.data.nextRoundAt) {
                busy = true;
                publish();
                try {
                    await wallet.ensure();
                    if (store.data.session.balance < store.data.nextBet) throw new Error("Số dư theo phiên không đủ cược tiếp; kiểm tra ví hoặc giảm cược.");
                    await playRound({ config, store, transport, log, diagnose });
                    await wallet.periodic();
                } catch (error) {
                    store.data.paused = true;
                    store.data.lastError = { at: new Date().toISOString(), reason: safeError(error),
                        code: error.code || error.name,
                        messageId: store.data.pending?.messageId || null };
                    store.save();
                    store.record("paused_error", { reason: safeError(error), errorCode: error.code || error.name });
                    log(`Đã pause: ${safeError(error)}`);
                    if (store.data.pending) log("Gõ recover để đọc kết quả thật; nếu vẫn chưa rõ thì xem Discord và reconcile win|loss|push|void. Không tự khởi động ván mới.");
                } finally { busy = false; publish(); }
            }
            if (!stopping) await sleep(1000);
        }
    } finally {
        loginAbort.abort();
        consoleInput?.close();
        await activeOperation?.catch(() => {});
        // Keep the process lock until console recovery finishes settling state.
        await consoleRecovery?.catch(() => {});
        client?.destroy();
        restoreInteractionWaiter?.();
        postGuard?.restore();
        if (unhandled) process.off("unhandledRejection", unhandled);
        if (ipcHandler) process.off("message", ipcHandler);
        process.off("SIGINT", quit);
        process.off("SIGTERM", quit);
        process.off("disconnect", quit);
        await releaseLock();
        process.off("exit", releaseLock);
    }
}

function finish(code) {
    // The upstream client may leave timers alive after destroy(). All application
    // work and the lock cleanup have completed before this CLI shuts down.
    process.exitCode = code;
    process.stdout.write("", () => process.stderr.write("", () => process.exit(code)));
}

main().then(() => finish(process.exitCode || 0)).catch(error => {
    const token = process.env.DISCORD_USER_TOKEN;
    const message = String(error?.message || "Lỗi không rõ");
    console.error(token ? message.split(token).join("[REDACTED]") : message);
    finish(1);
});
