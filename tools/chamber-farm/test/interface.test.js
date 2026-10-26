"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { walletBalance, dailyReceipt, startSession, refreshWallet, settleSession, creditDaily } = require("../session");
const { WalletActions } = require("../wallet-actions");
const { runtimeConfig, bettingPreview, changeBaseBet } = require("../betting-controls");
const { StateStore } = require("../state");
const { readConfig } = require("../config");
const { DiscordTransport } = require("../transport");
const { createUiServer } = require("../ui-server");
const { UiController } = require("../ui-controller");

const env = { DISCORD_USER_TOKEN: "offline-interface-secret", CHAMBER_BOT_ID: "123456789012345678", CHANNEL_ID: "223456789012345678",
    DAILY_CHANNEL_ID: "323456789012345678", BETTING_MODE: "win_progression", MAX_BET: "50" };
function fixture(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chamber-ui-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const store = new StateStore(path.join(directory, "state.json"), 1);
    store.configureBetting("win_progression", [1, 2, 3, 5]);
    store.data.paused = true;
    store.save();
    return { directory, store, config: readConfig(env) };
}
function wallet(value = "118") { return { embeds: [{ title: "Tài khoản của Player", fields: [{ name: "• Ví Tiền", value: "**`" + value + " 💵`**" }] }] }; }

test("wallet parser reads the real taikhoan field, accepts zero and rejects ambiguous amounts", () => {
    assert.equal(walletBalance(wallet()), 118);
    assert.equal(walletBalance(wallet("0")), 0);
    assert.equal(walletBalance(wallet("1,234")), 1234);
    assert.equal(walletBalance(wallet("1.234")), 1234);
    for (const value of ["1.5", "-2", "1,23", "9007199254740993"]) assert.equal(walletBalance(wallet(value)), null);
    assert.equal(walletBalance({ embeds: [] }), null);
    const duplicate = wallet(); duplicate.embeds[0].fields.push({ ...duplicate.embeds[0].fields[0] });
    assert.equal(walletBalance(duplicate), null);
});

test("session arithmetic separates blackjack estimates, confirmed daily credit and wallet corrections", () => {
    const session = startSession(1000, "wallet1");
    settleSession(session, "win", 2, "win1");
    settleSession(session, "loss", 4, "loss1");
    settleSession(session, "push", 2, "push1");
    settleSession(session, "void", 2, "void1");
    creditDaily(session, 10, "daily1");
    creditDaily(session, 10, "daily1");
    assert.equal(session.balance, 1008);
    assert.equal(session.netBlackjack, -2);
    assert.equal(session.dailyCredits, 10);
    assert.equal(session.rounds, 3);
    assert.equal(session.estimated, true);
    refreshWallet(session, 1007, "wallet2");
    assert.equal(session.adjustments, -1);
    assert.equal(session.balance, 1007);
    assert.equal(session.estimated, false);
    assert.equal(session.verifiedBalance, 1007);
});

test("a placeholder wallet response is awaited without resending taikhoan", async () => {
    const client = new EventEmitter(); client.user = { id: "owner" };
    const channel = { id: "channel", messages: { cache: new Map() } };
    const transport = new DiscordTransport(client, channel, { accountCommand: "taikhoan", boardTimeoutMs: 100 });
    transport.authorId = "bot"; transport.accountCommand = { name: "taikhoan" };
    const initial = { id: "reply", channelId: "channel", author: { id: "bot" }, clickButton() {}, embeds: [] };
    const final = { ...initial, ...wallet("0") };
    let sends = 0, waits = 0;
    transport.sendCommand = async () => { sends++; return initial; };
    transport.waitForChange = async (message, before, timeout, expected) => {
        waits++; assert.equal(expected, channel); assert.equal(message.id, "reply"); assert.ok(timeout <= 100); return final;
    };
    assert.equal((await transport.account()).balance, 0);
    assert.equal(sends, 1); assert.equal(waits, 1);
});

test("confirmed daily waits in the daily channel, never in the blackjack channel", async () => {
    const client = new EventEmitter(); client.user = { id: "owner" };
    const daily = { id: "daily" };
    const transport = new DiscordTransport(client, { id: "blackjack" }, { boardTimeoutMs: 100 }, daily);
    transport.authorId = "bot";
    const initial = { id: "daily1", channelId: "daily", author: { id: "bot" }, clickButton() {}, embeds: [] };
    transport.daily = async () => initial;
    transport.waitForChange = async (_, __, ___, channel) => {
        assert.equal(channel, daily);
        return { ...initial, embeds: [{ title: "Chúc Mừng!", description: "Bạn nhận được **10💵** thông qua điểm danh." }] };
    };
    assert.equal((await transport.confirmedDaily()).reward, 10);
    assert.equal(dailyReceipt({ embeds: [{ description: "Bạn sẽ được 10💵 nếu điểm danh" }] }), null);
    assert.deepEqual(dailyReceipt({ content: "Bạn đã điểm danh hôm nay rồi" }), { kind: "already", reward: 0 });
});

test("session begins with the true wallet and daily credit is checked against the wallet without duplicates", async t => {
    const { store, config } = fixture(t);
    let reads = 0, claims = 0;
    const transport = { account: async () => ({ balance: ++reads === 1 ? 118 : 128, message: { id: "wallet" + reads } }),
        confirmedDaily: async () => {
            claims++; assert.equal(store.data.daily.status, "attempted");
            return { kind: "success", reward: 10, message: { id: "daily1" } };
        } };
    const actions = new WalletActions({ store, config, transport });
    await actions.daily();
    assert.equal(store.data.session.initialBalance, 118);
    assert.equal(store.data.session.balance, 128);
    assert.equal(store.data.session.dailyCredits, 10);
    assert.equal(store.data.session.adjustments, 0);
    assert.equal(store.data.daily.status, "confirmed");
    assert.equal(store.data.session.estimated, false);
    await assert.rejects(actions.daily(), /đã gửi điểm danh/);
    assert.equal(reads, 2); assert.equal(claims, 1);
});

test("periodic wallet uses 50-round intervals and never repeats on a void or failed lookup", async t => {
    const { store, config } = fixture(t);
    config.walletEveryRounds = 50;
    let sends = 0;
    const actions = new WalletActions({ store, config, transport: { account: async () => {
        sends++;
        if (sends === 3) throw new Error("Discord unavailable");
        return { balance: 1000, message: { id: "wallet" + sends } };
    } } });
    await actions.ensure();
    for (let round = 1; round < 50; round++) {
        store.data.session.rounds = round;
        assert.equal(await actions.periodic(), false);
    }
    assert.equal(sends, 1);
    store.data.session.rounds = 50;
    assert.equal(await actions.periodic(), true);
    assert.equal(await actions.periodic(), false); // Void leaves rounds unchanged.
    assert.equal(sends, 2);
    store.data.session.rounds = 100;
    assert.equal(await actions.periodic(), false); // Failure does not pause play.
    assert.equal(store.data.session.estimated, true);
    assert.equal(await actions.periodic(), false);
    store.data.session.rounds = 149;
    assert.equal(await actions.periodic(), false);
    assert.equal(sends, 3);
    store.data.session.rounds = 150;
    assert.equal(await actions.periodic(), true);
    config.walletEveryRounds = 0;
    store.data.session.rounds = 1000;
    assert.equal(await actions.periodic(), false);
    assert.equal(sends, 4);
});

test("wallet command deadline ignores a late reply and never resends the command", async () => {
    let resolveReply, sends = 0, parsed = 0;
    const transport = new DiscordTransport({}, {}, { walletTimeoutMs: 10 });
    transport.accountCommand = { name: "taikhoan" };
    transport.sendCommand = () => { sends++; return new Promise(resolve => { resolveReply = resolve; }); };
    transport.waitParsed = async () => { parsed++; return { message: { id: "late" }, value: 1000 }; };
    await assert.rejects(transport.account(), { code: "WALLET_TIMEOUT" });
    resolveReply(wallet());
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(sends, 1);
    assert.equal(parsed, 0);
});

test("an uncertain daily response is not credited or resent, and a failed wallet never starts a session", async t => {
    const { store, config } = fixture(t);
    let sends = 0;
    const actions = new WalletActions({ store, config, transport: {
        account: async () => ({ balance: 118, message: { id: "wallet1" } }),
        confirmedDaily: async () => { sends++; throw new Error("timeout"); },
    } });
    await assert.rejects(actions.daily(), /timeout/);
    assert.equal(store.data.daily.status, "uncertain");
    assert.equal(store.data.session.dailyCredits, 0);
    await assert.rejects(actions.daily()); assert.equal(sends, 1);
    const failed = new WalletActions({ store, config, transport: { account: async () => { throw new Error("wallet unavailable"); } } });
    await assert.rejects(failed.ensure()); assert.equal(failed.initialized, false);
});

test("changing base is atomic in state, retains session/history and cannot touch an active or unresolved wager", t => {
    const { store, config, directory } = fixture(t);
    store.data.session = startSession(1000, "wallet1");
    const checks = [];
    changeBaseBet(store, config, 2, false, { checkBet: n => checks.push(n) });
    assert.deepEqual(checks, [2, 4, 6, 10]);
    assert.equal(store.data.baseBet, 2); assert.equal(store.data.nextBet, 2);
    assert.equal(store.data.session.balance, 1000);
    const restarted = runtimeConfig(env, directory);
    assert.equal(restarted.baseBet, 2);
    assert.equal(new StateStore(store.file, restarted.baseBet).data.nextBet, 2);
    const before = fs.readFileSync(store.file, "utf8");
    assert.throws(() => changeBaseBet(store, config, 11), /vượt trần/);
    assert.equal(fs.readFileSync(store.file, "utf8"), before);
    store.begin(2);
    assert.throws(() => changeBaseBet(store, config, 4), /Chờ|chờ/);
    assert.equal(store.data.pending.bet, 2);
});

test("capital preview respects the server cap and reports when no 1% stake is possible", () => {
    const preview = bettingPreview(2, [1, 2, 3, 5], 1000, 50, 1);
    assert.deepEqual(preview.stakes, [2, 4, 6, 10]); assert.equal(preview.riskPercent, 1);
    assert.equal(preview.suggestedBase, 2);
    assert.equal(bettingPreview(1, [1, 2, 3, 5], 118, 50, 1).suggestedBase, null);
    assert.equal(bettingPreview(16, [1, 2, 3, 5], 100000, 50).allowed, false);
    assert.throws(() => bettingPreview(0, [1, 2, 3, 5], 1000));
});

test("Martingale preview and base controls match the doubling sequence and preserve wallet", t => {
    const { store, config } = fixture(t);
    config.bettingMode = "martingale"; config.winBetSequence = [];
    store.configureBetting("martingale", []);
    store.data.session = startSession(102, "wallet");
    const preview = bettingPreview(1, [], 102, 50, 1, "martingale");
    assert.deepEqual(preview.stakes, [1, 2, 4, 8, 16, 32]);
    assert.equal(preview.cycleCapital, 63);
    assert.equal(preview.blockedNext, 64);
    assert.equal(preview.allowed, true);
    const raised = changeBaseBet(store, config, 2);
    assert.deepEqual(raised.stakes, [2, 4, 8, 16, 32]);
    assert.equal(store.data.nextBet, 2);
    assert.equal(store.data.session.balance, 102);
    assert.throws(() => changeBaseBet(store, config, 51), /vượt trần/);
});

test("Martingale keeps pushes, resets on wins and never sends the 64-coin stake", async t => {
    const { store } = fixture(t);
    store.configureBetting("martingale", []);
    for (const bet of [1, 2, 4, 8, 16, 32]) {
        assert.equal(store.data.nextBet, bet);
        store.begin(bet); store.settle("push", 0);
        assert.equal(store.data.nextBet, bet);
        store.begin(bet); store.settle("loss", 0);
    }
    assert.equal(store.data.nextBet, 64);
    let sent = 0;
    await assert.rejects(require("../engine").playRound({ store, config: { maxBet: 50 },
        transport: { start: async () => { sent++; } } }), /vượt MAX_BET/);
    assert.equal(sent, 0);
    assert.equal(store.data.pending, null);
    changeBaseBet(store, { bettingMode: "martingale", winBetSequence: [], maxBet: 50 }, 1);
    store.begin(1); store.settle("loss", 0);
    store.begin(2); store.settle("win", 0);
    assert.equal(store.data.nextBet, 1);
});

test("local UI API requires its capability and correct origin/host before any command", async t => {
    const commands = [];
    const controller = { status: () => ({ betting: { sequence: [1, 2, 3, 5] }, maxBet: 50, session: { balance: 1000 } }),
        command: async (action, args) => { commands.push({ action, args }); return { ok: true }; } };
    const app = await createUiServer(controller);
    t.after(() => app.close());
    const post = body => ({ method: "POST", headers: { Authorization: "Bearer " + app.token, "Content-Type": "application/json", Origin: app.origin }, body: JSON.stringify(body) });
    assert.equal((await fetch(app.origin + "/api/status")).status, 401);
    const foreignHost = await new Promise((resolve, reject) => {
        require("node:http").get(app.origin + "/api/status", { headers: { Host: "foreign.test", Authorization: "Bearer " + app.token } }, response => {
            response.resume(); response.on("end", () => resolve(response.statusCode));
        }).on("error", reject);
    });
    assert.equal(foreignHost, 403);
    const foreign = post({ action: "start" }); foreign.headers.Origin = "https://foreign.test";
    assert.equal((await fetch(app.origin + "/api/command", foreign)).status, 403);
    assert.equal(commands.length, 0);
    const preview = await fetch(app.origin + "/api/preview", post({ base: 2 }));
    assert.equal((await preview.json()).maximum, 10);
    assert.equal((await fetch(app.origin + "/api/command", post({ action: "account" }))).status, 200);
    assert.deepEqual(commands, [{ action: "account", args: {} }]);
    const html = await fetch(app.origin + "/");
    assert.equal(html.status, 200); assert.match(html.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.ok(!(await html.text()).includes(app.token));
});

test("local UI preview exposes the configured reset-to-base instead of a blocked 64 stake", async t => {
    const app = await createUiServer({ status: () => ({ betting: { mode: "martingale", sequence: [], resetAt: 32 },
        maxBet: 50, session: { balance: 1000 } }) });
    t.after(() => app.close());
    const response = await fetch(app.origin + "/api/preview", { method: "POST",
        headers: { Authorization: "Bearer " + app.token, "Content-Type": "application/json" }, body: JSON.stringify({ base: 1 }) });
    const preview = await response.json();
    assert.equal(preview.resetTo, 1);
    assert.equal(preview.blockedNext, null);
    assert.equal(preview.resetAt, 32);
});

test("UI controller connects paused, serializes commands and never retries an unresolved request", async t => {
    const { directory } = fixture(t);
    const worker = new EventEmitter(); worker.connected = true; worker.stdout = { resume() {} }; worker.stderr = new EventEmitter();
    const sent = [];
    worker.send = (message, callback) => { sent.push(message); callback?.(); };
    const controller = new UiController(directory, { env, workerFactory: () => {
        setImmediate(() => worker.emit("message", { type: "status", status: { ready: true, paused: true, busy: false } }));
        return worker;
    } });
    await controller.connect();
    const pending = controller.command("account");
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(controller.command("daily"), /thao tác trước/);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].command, "account");
    worker.emit("message", { type: "response", id: sent[0].id, ok: true, status: { ready: true, paused: true } });
    await pending;
    await assert.rejects(controller.command("__proto__"), /không hợp lệ/);
    assert.equal(sent.length, 1);
    controller.current.stopping = true;
    worker.emit("exit", 0);
    assert.equal(controller.status().connected, false);
    assert.equal(controller.status().stopping, false);
    assert.equal(controller.status().paused, true);
});

test("real managed IPC starts paused, reads wallet before daily/play, credits results, and changes base without a restart", async t => {
    const { directory } = fixture(t);
    const { fork } = require("node:child_process");
    const worker = fork(path.join(__dirname, "managed-worker.js"), [], { execArgv: [], silent: true,
        env: { ...process.env, ...env, CHAMBER_DATA_DIR: directory, ROUND_DELAY_SECONDS: "5" } });
    t.after(() => { if (worker.exitCode === null) worker.kill(); });
    let stderr = "";
    worker.stderr.on("data", chunk => { stderr += chunk; });
    worker.stdout.resume();
    const wait = predicate => new Promise((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(new Error("Worker timeout: " + stderr)); }, 8000);
        const cleanup = () => { clearTimeout(timer); worker.off("message", inspect); worker.off("exit", exited); };
        const inspect = message => { if (predicate(message)) { cleanup(); resolve(message); } };
        const exited = () => { cleanup(); reject(new Error("Worker exited: " + stderr)); };
        worker.on("message", inspect); worker.once("exit", exited);
    });
    const initial = await wait(message => message.type === "status" && message.status.ready);
    assert.equal(initial.status.paused, true);
    const callFile = path.join(directory, "test-commands.jsonl");
    assert.equal(fs.existsSync(callFile), false);
    let serial = 0;
    const command = async (name, args = {}) => {
        const id = "test-" + ++serial;
        const reply = wait(message => message.type === "response" && message.id === id);
        worker.send({ type: "command", id, command: name, args });
        const result = await reply;
        assert.equal(result.ok, true, result.error);
        return result.status;
    };
    const daily = await command("daily");
    assert.equal(daily.session.initialBalance, 1000);
    assert.equal(daily.session.balance, 1010);
    assert.equal(daily.session.dailyCredits, 10);
    assert.deepEqual(fs.readFileSync(callFile, "utf8").trim().split("\n").map(line => JSON.parse(line).command), ["taikhoan", "diemdanh", "taikhoan"]);
    const raised = await command("base", { base: 2 });
    assert.equal(raised.baseBet, 2); assert.equal(raised.nextBet, 2);
    const settled = wait(message => message.type === "status" && message.status.session?.rounds === 1);
    await command("resume");
    const completed = await settled;
    assert.equal(completed.status.session.balance, 1012);
    assert.equal(completed.status.session.netBlackjack, 2);
    await command("pause");
    const exit = new Promise(resolve => worker.once("exit", resolve));
    await command("quit");
    assert.equal(await exit, 0);
    const calls = fs.readFileSync(callFile, "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.equal(calls.filter(call => call.command === "blackjack").length, 1);
    assert.equal(calls.at(-1).bet, 2);
    assert.ok(!stderr.includes(env.DISCORD_USER_TOKEN));
});
