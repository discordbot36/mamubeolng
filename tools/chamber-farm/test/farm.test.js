"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter, once } = require("node:events");
const { execFileSync, fork } = require("node:child_process");
const { handValue, chooseAction, nextBet } = require("../strategy");
const { parseGame, fingerprint, cardsOf, outcomeOf } = require("../parser");
const { readConfig, dailyDue, localClock } = require("../config");
const { StateStore, acquireLock } = require("../state");
const { playRound } = require("../engine");
const { DiscordTransport } = require("../transport");

const config = {
    baseBet: 1, maxBet: 0, maxLossStreak: 0, roundDelayMs: 15_000,
    actionDelayMs: 0, responseTimeoutMs: 100, blackjackCommand: "blackjack", moneyOption: "money",
};

function board(player, score, dealer = "6♣ 🂠", result = "", disabled = false) {
    return {
        id: "message1", channelId: "channel1", author: { id: "chamber1" },
        interaction: { user: { id: "me" } }, clickButton() {}, content: "",
        embeds: [{ description: `viptanphu, Bạn cược 1\n${result}`, fields: [
            { name: "Chamber `[?]`", value: `| ${dealer} |` },
            { name: `viptanphu \`[${score}]\``, value: `| ${player} |` },
        ] }],
        components: [{ components: [
            { customId: "hit1", label: "Tiếp", disabled },
            { customId: "stand1", label: "Thôi", disabled },
        ] }],
    };
}

function storeFor(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chamber-test-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    return new StateStore(path.join(directory, "state.json"), 1);
}

test("multi-ace hands remain soft only while an ace still counts as 11", () => {
    assert.deepEqual(handValue(["A", "6"]), { total: 17, soft: true });
    assert.deepEqual(handValue(["A", "A", "5"]), { total: 17, soft: true });
    assert.deepEqual(handValue(["A", "6", "K"]), { total: 17, soft: false });
    assert.deepEqual(handValue(["A", "A", "9"]), { total: 21, soft: true });
    assert.deepEqual(handValue(["A", "A", "K"]), { total: 12, soft: false });
});

test("basic strategy handles dealer-dependent hard hands, soft hands and unavailable splitting", () => {
    const cases = [
        [["10", "2"], "3", "hit"], [["10", "2"], "4", "stand"],
        [["10", "6"], "6", "stand"], [["10", "6"], "10", "hit"],
        [["10", "7"], "A", "stand"], [["A", "6"], "6", "hit"],
        [["A", "7"], "8", "stand"], [["A", "7"], "9", "hit"],
        [["A", "7"], "A", "hit"], [["A", "8"], "10", "stand"],
        [["8", "8"], "10", "hit"], [["A", "A"], "6", "hit"],
        [["5", "6"], "6", "hit"], [["A", "6", "10"], "A", "stand"],
    ];
    for (const [cards, dealer, expected] of cases) {
        assert.equal(chooseAction(cards, dealer).action, expected, `${cards} versus ${dealer}`);
    }
});

test("Martingale doubles only on a loss and rejects unknown results and overflow", () => {
    let bet = 1;
    for (const expected of [2, 4, 8, 16]) {
        bet = nextBet(bet, "loss");
        assert.equal(bet, expected);
    }
    assert.equal(nextBet(bet, "push"), 16);
    assert.equal(nextBet(bet, "void"), 16);
    assert.equal(nextBet(bet, "win"), 1);
    assert.throws(() => nextBet(16, "unknown"));
    assert.throws(() => nextBet(2 ** 52, "loss"));
});

test("the supplied screenshot's result is a win even with disabled buttons", () => {
    const message = board("J♥ 1♠", 21, "7♦ 8♥ 7♣", "🎲 Bạn đã thắng blackjack", true);
    message.embeds[0].fields[0].name = "Chamber `[22]`";
    assert.deepEqual(parseGame(message), { kind: "result", outcome: "win" });
});

test("an active board exposes exact custom IDs, player's full hand and one dealer upcard", () => {
    assert.deepEqual(parseGame(board("A♥ 7♠", 18, "9♦ 🂠")), {
        kind: "active", cards: ["A", "7"], dealerCard: "9", hit: "hit1", stand: "stand1",
    });
    assert.deepEqual(cardsOf("|10♠️J♥1♠| <:coin123:123456789012345678>"), ["10", "J", "1"]);
});

test("parser supports two-column descriptions and sequential labeled hands", () => {
    const inline = board("10♥ 2♠", 12);
    inline.embeds = [{ description: "Chamber `[?]` viptanphu `[12]`\n| 🂠 6♣ | | 10♥ 2♠ |" }];
    assert.equal(parseGame(inline).dealerCard, "6");
    const sequential = board("A♥ 7♠", 18);
    sequential.embeds = [{ description: "Chamber `[?]`\n| 🂠 9♣ |\nviptanphu `[18]`\n| A♥ 7♠ |" }];
    assert.equal(parseGame(sequential).cards[0], "A");
});

test("unrecognized, inconsistent, hidden or fully revealed boards never trigger a guess", () => {
    assert.equal(parseGame(board("10♥ 2♠", 16)).kind, "unknown");
    assert.equal(parseGame(board("A♥ 7♠", 18, "🂠 🂠")).kind, "unknown");
    assert.equal(parseGame(board("A♥ 7♠", 18, "6♣ 5♠")).kind, "unknown");
    assert.equal(parseGame(board("10♥ 6♠ 8♦", 24)).kind, "waiting");
    assert.equal(parseGame(board("A♥ 7♠", 18, "6♣", "Không đủ tiền")).kind, "error");
    assert.equal(outcomeOf("Bạn đã thắng nhưng ván trước bạn đã thua"), null);
    assert.equal(outcomeOf("Bạn cược 1"), null);
    assert.equal(outcomeOf("Bạn đã hòa blackjack"), "push");
    assert.equal(outcomeOf("Hòa, Bạn cược 1\nChamber [?] Hòa [18]"), null);
    assert.equal(outcomeOf("🎲 Hòa!"), "push");
});

test("state survives restarts without resetting the loss streak or unresolved bet", t => {
    const store = storeFor(t);
    store.begin(1);
    store.settle("loss", 15_000);
    store.begin(2);
    const reopened = new StateStore(store.file, 1);
    assert.equal(reopened.data.nextBet, 2);
    assert.equal(reopened.data.lossStreak, 1);
    assert.equal(reopened.data.pending.bet, 2);
    assert.throws(() => reopened.begin(2));
    reopened.settle("push", 15_000);
    assert.equal(reopened.data.nextBet, 2);
    assert.equal(reopened.data.lossStreak, 1);
});

test("state is bound to its account/channel/bot and rejects changed bankroll baseline", t => {
    const store = storeFor(t);
    store.bind("me", "channel1", "chamber1");
    assert.throws(() => store.bind("other", "channel1", "chamber1"));
    assert.throws(() => new StateStore(store.file, 2));
});

test("one-process lock refuses a second runner even if its marker was deleted", async t => {
    const store = storeFor(t);
    const directory = path.dirname(store.file);
    const release = await acquireLock(directory);
    try {
        await assert.rejects(acquireLock(directory), /Bot đang chạy/);
        fs.unlinkSync(path.join(directory, "runner.lock"));
        await assert.rejects(acquireLock(directory), /Bot đang chạy/);
    } finally { await release(); }
    const releaseAgain = await acquireLock(directory);
    await releaseAgain();
});

test("a legacy lock for a live PID is preserved", async t => {
    const store = storeFor(t);
    const file = path.join(path.dirname(store.file), "runner.lock");
    fs.writeFileSync(file, String(process.pid));
    await assert.rejects(acquireLock(path.dirname(store.file)), /Bot đang chạy/);
    assert.equal(fs.readFileSync(file, "utf8"), String(process.pid));
});

test("invalid PID markers are left for inspection without probing process groups", async t => {
    const store = storeFor(t);
    const file = path.join(path.dirname(store.file), "runner.lock");
    for (const value of ["0", "-1", "not a PID", '{"pid":0}']) {
        fs.writeFileSync(file, value);
        await assert.rejects(acquireLock(path.dirname(store.file)), /PID hợp lệ/);
        assert.equal(fs.readFileSync(file, "utf8"), value);
    }
});

test("a crashed runner's lock is reclaimed without touching saved bets", async t => {
    const store = storeFor(t);
    store.begin(1);
    store.settle("loss", 15_000);
    store.begin(2);
    const before = fs.readFileSync(store.file, "utf8");
    const directory = path.dirname(store.file);
    const child = fork(path.join(__dirname, "lock-worker.js"), [directory], { stdio: ["ignore", "ignore", "ignore", "ipc"] });
    t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
    const [message] = await once(child, "message");
    assert.equal(message, "locked");
    await assert.rejects(acquireLock(directory), /Bot đang chạy/);
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
    assert.ok(fs.existsSync(path.join(directory, "runner.lock")));
    const release = await acquireLock(directory);
    assert.equal(fs.readFileSync(store.file, "utf8"), before);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "runner.lock"), "utf8")).pid, process.pid);
    await release();
});

test("two simultaneous starts cannot both reclaim the same dead PID marker", async t => {
    const store = storeFor(t);
    const directory = path.dirname(store.file);
    const deadPid = Number(execFileSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" }));
    fs.writeFileSync(path.join(directory, "runner.lock"), String(deadPid));
    const attempts = await Promise.allSettled([acquireLock(directory), acquireLock(directory)]);
    assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(attempts.filter(result => result.status === "rejected").length, 1);
    for (const result of attempts) if (result.status === "fulfilled") await result.value();
});

test("releasing a runner never deletes a replacement marker owned by someone else", async t => {
    const store = storeFor(t);
    const directory = path.dirname(store.file);
    const release = await acquireLock(directory);
    const replacement = JSON.stringify({ pid: process.pid, lockId: "different-owner" });
    fs.writeFileSync(path.join(directory, "runner.lock"), replacement);
    await release();
    await release();
    assert.equal(fs.readFileSync(path.join(directory, "runner.lock"), "utf8"), replacement);
});

test("daily schedule catches up once per local date and handles UTC+7 midnight", () => {
    const dailyConfig = { dailyEnabled: true, dailyTime: "00:05", timezone: "Asia/Ho_Chi_Minh" };
    assert.equal(dailyDue(dailyConfig, {}, new Date("2026-10-20T17:04:00Z")), false);
    assert.equal(dailyDue(dailyConfig, {}, new Date("2026-10-20T17:05:00Z")), true);
    assert.equal(dailyDue(dailyConfig, { daily: { date: "2026-10-21", status: "uncertain" } }, new Date("2026-10-21T08:00:00Z")), false);
    assert.equal(localClock(new Date("2026-10-20T17:00:00Z"), dailyConfig.timezone).time, "00:00");
});

test("configuration rejects bad money, IDs, flags and schedule", () => {
    const env = { DISCORD_USER_TOKEN: "local-test-only", CHAMBER_BOT_ID: "123456789012345678", CHANNEL_ID: "223456789012345678" };
    assert.equal(readConfig(env).baseBet, 1);
    assert.equal(readConfig(env).dailyChannelId, env.CHANNEL_ID);
    assert.equal(readConfig({ ...env, DAILY_CHANNEL_ID: "1135209424538062858" }).dailyChannelId, "1135209424538062858");
    assert.throws(() => readConfig({ ...env, BASE_BET: "1.5" }));
    assert.throws(() => readConfig({ ...env, CHANNEL_ID: "channel" }));
    assert.throws(() => readConfig({ ...env, DAILY_CHANNEL_ID: "invalid" }));
    assert.throws(() => readConfig({ ...env, DAILY_ENABLED: "yes" }));
    assert.throws(() => readConfig({ ...env, DAILY_TIME: "25:00" }));
});

test("CLI check validates settings without logging in, spending coins or printing the token", () => {
    const token = "offline-secret-not-a-discord-token";
    const output = execFileSync(process.execPath, [path.join(__dirname, "..", "index.js"), "--check"], {
        encoding: "utf8", env: { ...process.env, DISCORD_USER_TOKEN: token,
            CHAMBER_BOT_ID: "123456789012345678", CHANNEL_ID: "223456789012345678" },
    });
    assert.match(output, /Cấu hình hợp lệ/);
    assert.match(output, /Chưa đăng nhập/);
    assert.ok(!output.includes(token));
});

test("CLI finishes after cleanup even if an upstream dependency leaves a timer running", () => {
    const wrapper = `setInterval(() => {}, 1000); process.argv.push('--check'); require(${JSON.stringify(path.join(__dirname, "..", "index.js"))});`;
    const output = execFileSync(process.execPath, ["-e", wrapper], {
        encoding: "utf8", timeout: 5000, env: { ...process.env, DISCORD_USER_TOKEN: "offline-test-only",
            CHAMBER_BOT_ID: "123456789012345678", CHANNEL_ID: "223456789012345678" },
    });
    assert.match(output, /Cấu hình hợp lệ/);
});

test("a round hits soft 18 versus 9, then stands on hard 18, and settles once", async t => {
    const store = storeFor(t);
    const messages = [board("A♥ 7♠", 18, "9♣"), board("A♥ 7♠ K♦", 18, "9♣"),
        board("A♥ 7♠ K♦", 18, "9♣ 8♥", "Bạn đã thắng blackjack", true)];
    let position = 0;
    const clicked = [];
    const transport = {
        start: async bet => { assert.equal(bet, 1); return messages[0]; },
        validate() {}, latest: message => message,
        click: async (message, id) => { clicked.push(id); return message; },
        waitForChange: async (message, before) => {
            assert.equal(fingerprint(message), before);
            return messages[++position];
        },
    };
    await playRound({ config, store, transport, delay: async () => {} });
    assert.deepEqual(clicked, ["hit1", "stand1"]);
    assert.equal(store.data.rounds, 1);
    assert.equal(store.data.nextBet, 1);
    assert.equal(store.data.pending, null);
});

test("a timeout preserves the pending stake and never retries the slash command", async t => {
    const store = storeFor(t);
    let starts = 0;
    let clicks = 0;
    const transport = {
        start: async () => { starts++; return board("10♥ 6♠", 16, "10♣"); },
        validate() {}, latest: message => message,
        click: async () => { clicks++; },
        waitForChange: async () => { throw new Error("timeout"); },
    };
    await assert.rejects(playRound({ config, store, transport, delay: async () => {} }), /timeout/);
    assert.equal(starts, 1);
    assert.equal(clicks, 1);
    assert.equal(new StateStore(store.file, 1).data.pending.bet, 1);
    assert.equal(store.data.nextBet, 1);
});

test("a footer-only edit after a hit never causes the same hand to be clicked again", async t => {
    const store = storeFor(t);
    const initial = board("10♥ 2♠", 12, "10♣");
    const footerEdit = board("10♥ 2♠", 12, "10♣");
    footerEdit.embeds[0].footer = { text: "Thời gian còn lại 20 giây" };
    const changedHand = board("10♥ 2♠ 5♦", 17, "10♣");
    const result = board("10♥ 2♠ 5♦", 17, "10♣ 8♦", "Bạn đã thua blackjack", true);
    const updates = [footerEdit, changedHand, result];
    const clicked = [];
    await playRound({ config, store, delay: async () => {}, transport: {
        start: async () => initial, validate() {}, latest: message => message,
        click: async (message, id) => { clicked.push(id); return message; },
        waitForChange: async () => updates.shift(),
    } });
    assert.deepEqual(clicked, ["hit1", "stand1"]);
    assert.equal(store.data.nextBet, 2);
});

test("immediate natural blackjack settles without clicking either disabled button", async t => {
    const store = storeFor(t);
    await playRound({ config, store, transport: {
        start: async () => board("J♥ 1♠", 21, "7♦ 8♥ 7♣", "Bạn đã thắng blackjack", true),
        validate() {}, click() { assert.fail("must not click"); },
    } });
    assert.equal(store.data.lastResult.outcome, "win");
});

test("Chamber's actual empty-wallet response is a refusal, not an unresolved or lost bet", async t => {
    const store = storeFor(t);
    const response = { id: "refused1", content: "", embeds: [{
        title: "Blackjack Thất Bại", description: "Bạn không có tiền để chơi", fields: [],
    }], components: [] };
    assert.equal(parseGame(response).rejected, true);
    await assert.rejects(playRound({ config, store, transport: {
        start: async () => response, validate() {}, click() { assert.fail("must not click"); },
    } }), /không có tiền/);
    assert.equal(store.data.pending, null);
    assert.equal(store.data.nextBet, 1);
    assert.equal(store.data.rounds, 0);
    assert.equal(store.data.lossStreak, 0);
    assert.equal(store.data.lastResult.outcome, "void");
});

test("a result arriving during action delay prevents a stale click", async t => {
    const store = storeFor(t);
    const ended = board("10♥ 6♠", 16, "6♣ 10♦ 8♥", "Bạn đã thắng blackjack", true);
    await playRound({ config, store, transport: {
        start: async () => board("10♥ 6♠", 16), validate() {}, latest: () => ended,
        click() { assert.fail("must not click stale board"); },
    }, delay: async () => {} });
    assert.equal(store.data.rounds, 1);
});

test("configured betting limits stop before sending or reserving money", async t => {
    const store = storeFor(t);
    store.data.nextBet = 8;
    await assert.rejects(playRound({ config: { ...config, maxBet: 4 }, store,
        transport: { start() { assert.fail("must not send"); } } }), /MAX_BET/);
    assert.equal(store.data.pending, null);
});

test("transport respects the money option position and type in the live command schema", async () => {
    let args;
    const client = new EventEmitter();
    client.user = { id: "me" };
    const channel = { id: "channel1", searchInteraction: async () => ({
        applications: [{ id: "app1", bot_id: "chamber1" }], application_commands: [{
            application_id: "app1", name: "blackjack", type: 1, options: [
                { name: "optional", type: 3 }, { name: "money", type: 4, min_value: 1, max_value: 100 },
            ],
        }],
    }), sendSlash: async (...parameters) => { args = parameters; } };
    const transport = new DiscordTransport(client, channel, { ...config, botId: "chamber1" });
    await transport.prepare();
    await transport.start(8);
    assert.deepEqual(args, ["app1", "blackjack", undefined, 8]);
    assert.throws(() => transport.checkBet(128), /100/);
    assert.throws(() => transport.validate({ ...board("10♥ 2♠", 12), interaction: { user: { id: "other" } } }));
});

test("waitForChange catches an edit already in cache and ignores other players' messages", async () => {
    const client = new EventEmitter();
    client.user = { id: "me" };
    const initial = board("10♥ 2♠", 12);
    const updated = board("10♥ 2♠ 3♦", 15);
    const cache = new Map([[initial.id, updated]]);
    const channel = { id: "channel1", messages: { cache } };
    const transport = new DiscordTransport(client, channel, { ...config, botId: "chamber1" });
    transport.authorId = "chamber1";
    assert.equal(await transport.waitForChange(initial, fingerprint(initial), 30), updated);
    cache.set(initial.id, initial);
    const waiting = transport.waitForChange(initial, fingerprint(initial), 30);
    client.emit("messageUpdate", null, { ...updated, id: "other-game" });
    client.emit("messageUpdate", null, updated);
    assert.equal(await waiting, updated);
    assert.equal(client.listenerCount("messageUpdate"), 0);
});

test("daily and blackjack use their own channels and command schemas", async () => {
    const client = new EventEmitter();
    client.user = { id: "me" };
    const sent = [];
    const applications = [{ id: "app1", bot_id: "chamber1" }];
    const blackjackChannel = { id: "1135209450144272504", searchInteraction: async () => ({
        applications, application_commands: [{ application_id: "app1", name: "blackjack", type: 1,
            options: [{ name: "money", type: 4, required: true }] }],
    }), sendSlash: async (...args) => sent.push({ channel: "blackjack", args }) };
    const dailyChannel = { id: "1135209424538062858", searchInteraction: async () => ({
        applications, application_commands: [{ application_id: "app1", name: "diemdanh", type: 1 }],
    }), sendSlash: async (...args) => sent.push({ channel: "daily", args }) };
    const transport = new DiscordTransport(client, blackjackChannel, {
        ...config, botId: "chamber1", dailyEnabled: true, dailyCommand: "diemdanh",
    }, dailyChannel);
    await transport.prepare();
    await transport.daily();
    await transport.start(1);
    assert.deepEqual(sent, [
        { channel: "daily", args: ["app1", "diemdanh"] },
        { channel: "blackjack", args: ["app1", "blackjack", 1] },
    ]);
    const dailyReply = { ...board("A♥ 7♠", 18), channelId: dailyChannel.id };
    assert.doesNotThrow(() => transport.validateDaily(dailyReply));
    assert.throws(() => transport.validate(dailyReply));
    assert.throws(() => transport.validateDaily({ ...dailyReply, channelId: blackjackChannel.id }));
});

test("same-guild channels share one catalog, including during repeated slash dispatch", async () => {
    const client = new EventEmitter();
    client.user = { id: "me" };
    const guild = { id: "653508294962315285" };
    const catalog = { applications: [{ id: "app1", bot_id: "chamber1" }], application_commands: [
        { application_id: "app1", name: "diemdanh", type: 1 },
        { application_id: "app1", name: "blackjack", type: 1,
            options: [{ name: "money", type: 4, required: true }] },
    ] };
    let indexReads = 0;
    client.api = { guilds: { [guild.id]: { "application-command-index": { get: async () => {
        indexReads++;
        if (indexReads > 1) throw Object.assign(new Error("rate limited"), { name: "RateLimitError" });
        return catalog;
    } } } } };
    const sent = [];
    const channel = id => ({ id, guild,
        searchInteraction: async () => { assert.fail("must not call the upstream uncached search"); },
        // Model upstream sendSlash reading this.searchInteraction() on every call.
        async sendSlash(...args) {
            assert.equal(await this.searchInteraction(), catalog);
            sent.push({ channelId: this.id, args });
        },
    });
    const blackjackChannel = channel("1135209450144272504");
    const dailyChannel = channel("1135209424538062858");
    const originalSearch = blackjackChannel.searchInteraction;
    const transport = new DiscordTransport(client, blackjackChannel, {
        ...config, botId: "chamber1", dailyEnabled: true, dailyCommand: "diemdanh",
    }, dailyChannel);
    await transport.prepare();
    await transport.daily();
    await transport.start(1);
    await transport.start(2);
    assert.equal(indexReads, 1);
    assert.equal(blackjackChannel.searchInteraction, originalSearch);
    assert.deepEqual(sent, [
        { channelId: dailyChannel.id, args: ["app1", "diemdanh"] },
        { channelId: blackjackChannel.id, args: ["app1", "blackjack", 1] },
        { channelId: blackjackChannel.id, args: ["app1", "blackjack", 2] },
    ]);
});

test("index rate limits are reported as rate limits instead of a missing daily command", async () => {
    const guild = { id: "guild1" };
    const client = { api: { guilds: { [guild.id]: { "application-command-index": { get: async () => {
        throw Object.assign(new Error("rate limit"), { name: "RateLimitError" });
    } } } } } };
    const transport = new DiscordTransport(client, { guild }, config);
    await assert.rejects(transport.prepare(), /giới hạn lượt đọc/);
});
