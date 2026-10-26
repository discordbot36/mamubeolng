"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { handValue } = require("../strategy");
const { chooseExpectedAction, dealerDistribution } = require("../decision");
const { parseGame, refundedWagerOf } = require("../parser");
const { StateStore } = require("../state");
const { playRound, recoverRound } = require("../engine");
const { readConfig } = require("../config");
const { DiscordTransport } = require("../transport");
const { fingerprint } = require("../parser");
const { EventEmitter } = require("node:events");

function fresh(t, pending = true) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chamber-recovery-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const store = new StateStore(path.join(directory, "state.json"), 1);
    store.configureBetting("win_progression", [1, 2, 3, 5]);
    store.begin(1);
    store.settle("win", 0);
    if (pending) {
        store.begin(2);
        store.data.pending.messageId = "pending1";
        store.data.paused = true;
        store.save();
    }
    return store;
}

function receipt(amount = 2) {
    return { id: "pending1", embeds: [{ title: "Blackjack Đã Hủy",
        description: `Đã hoàn trả **${amount}💵** do hết thời gian chơi.` }],
    components: [{ components: [{ customId: "hit", label: "Tiếp", disabled: true },
        { customId: "stand", label: "Thôi", disabled: true }] }] };
}
function board(cards, score) {
    return { id: "pending1", embeds: [{ author: { name: "Player, Bạn cược 2💵" }, fields: [
        { name: "Chamber [5 + ?]", value: "5♥ | ?" },
        { name: `Player [${score}]`, value: cards },
    ] }], components: [{ components: [{ customId: "hit", label: "Tiếp" },
        { customId: "stand", label: "Thôi" }] }] };
}

test("missing message ID recovers only an exact persisted nonce and settles a tie once", async t => {
    const store = fresh(t);
    store.data.pending.messageId = null;
    store.data.pending.commandNonce = "123456789012345678";
    store.save();
    const message = board("10♥ 7♠", 17);
    message.nonce = store.data.pending.commandNonce;
    message.embeds[0].footer = { text: "Bạn và Chamber hòa nhau" };
    let reads = 0;
    const transport = { validate() {}, findCommandReply: async nonce => {
        reads++; assert.equal(nonce, message.nonce); return message;
    } };
    assert.equal(await recoverRound({ store, config: { roundDelayMs: 0 }, transport }), "push");
    assert.equal(store.data.pending, null);
    assert.equal(store.data.nextBet, 2);
    assert.equal(store.data.paused, true);
    await assert.rejects(recoverRound({ store, config: {}, transport }));
    assert.equal(reads, 1);
});

test("a wrong nonce or wrong bet cannot bind a missing message ID or alter saved betting state", async t => {
    const store = fresh(t);
    store.data.pending.messageId = null;
    store.data.pending.commandNonce = "123456789012345678";
    store.save();
    const before = fs.readFileSync(store.file, "utf8");
    const message = receipt(); message.nonce = "223456789012345678";
    const transport = { validate() {}, findCommandReply: async () => message };
    await assert.rejects(recoverRound({ store, config: {}, transport }), /mã thao tác/);
    assert.equal(fs.readFileSync(store.file, "utf8"), before);
    message.nonce = store.data.pending.commandNonce;
    message.embeds[0].description = "Đã hoàn trả **1💵** do hết thời gian chơi.";
    await assert.rejects(recoverRound({ store, config: {}, transport }), /khác cược/);
    assert.equal(fs.readFileSync(store.file, "utf8"), before);
});

test("history recovery ignores same-player same-stake messages unless the nonce matches", async () => {
    const own = { id: "own", nonce: "123456789012345678" };
    const other = { id: "other", nonce: "223456789012345678" };
    let reads = 0;
    const channel = { id: "channel", messages: { cache: new Map(), fetch: async options => {
        reads++; assert.deepEqual(options, { limit: 100 });
        return new Map([[own.id, own], [other.id, other]]);
    } } };
    const transport = new DiscordTransport({}, channel, {});
    transport.validate = message => assert.equal(message.id, "own");
    assert.equal(await transport.findCommandReply(own.nonce), own);
    await assert.rejects(transport.findCommandReply("323456789012345678"), /Chưa tìm được/);
    assert.equal(reads, 2);
});

test("failed button acknowledgement can use an updated exact board without clicking twice", async () => {
    let clicks = 0;
    const message = board("10♥ 7♠", 17);
    message.clickButton = async () => { clicks++; const error = new Error("failed"); error.code = "INTERACTION_FAILED"; throw error; };
    const ended = receipt();
    const transport = new DiscordTransport({}, { messages: { cache: new Map() } }, {});
    transport.validate = () => {};
    transport.fetchRound = async id => { assert.equal(id, message.id); return ended; };
    assert.equal(await transport.click(message, "stand"), ended);
    assert.equal(clicks, 1);
});

test("initial-two model matches the stuck board and distinguishing historical ace totals", () => {
    for (const [cards, total] of [
        [["6", "2", "1"], 9], [["6", "3", "1", "6"], 16],
        [["1", "6", "6"], 23], [["1", "7", "1"], 19],
        [["K", "1"], 21], [["1", "1"], 12], [["1", "1", "1"], 13],
    ]) assert.deepEqual(handValue(cards, "initial_two"), { total, soft: false });
    const message = board("6♥ | 2♠ | 1♣ |", 9);
    assert.equal(parseGame(message, { aceRule: "draw_time" }).kind, "unknown");
    const parsed = parseGame(message, { aceRule: "initial_two" });
    assert.equal(parsed.kind, "active");
    assert.equal(chooseExpectedAction(parsed.cards, parsed.dealerCard, { aceRule: "initial_two" }).action, "hit");
    message.embeds[0].fields[1].name = "Player [10]";
    assert.equal(parseGame(message, { aceRule: "initial_two" }).kind, "unknown");
});

test("EV values subsequent aces as one but still allows eleven for the dealer hole card", () => {
    const rules = { aceRule: "initial_two" };
    const decision = chooseExpectedAction(["6", "2"], ["10", "8"], rules);
    const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
    const expectedHit = ranks.reduce((sum, rank) => {
        const next = chooseExpectedAction(["6", "2", rank], ["10", "8"], rules);
        return sum + (rank === "10" ? 4 : 1) / 13 * Math.max(next.hitEV, next.standEV);
    }, 0);
    assert.ok(Math.abs(decision.hitEV - expectedHit) < 1e-12);
    const distribution = dealerDistribution("6", rules);
    const weighted = Array(6).fill(0);
    for (const rank of ranks) {
        dealerDistribution(["6", rank], rules).forEach((p, i) => { weighted[i] += p * (rank === "10" ? 4 : 1) / 13; });
    }
    distribution.forEach((p, i) => assert.ok(Math.abs(p - weighted[i]) < 1e-12));
    assert.deepEqual(dealerDistribution(["6", "A"], rules), [0, 1, 0, 0, 0, 0]);
    assert.ok(Math.abs(chooseExpectedAction(["A", "6"], "9", rules).bustRisk - 9 / 13) < 1e-12);
    const env = { DISCORD_USER_TOKEN: "offline", CHAMBER_BOT_ID: "123456789012345678", CHANNEL_ID: "223456789012345678", ACE_RULE: "initial_two" };
    assert.equal(readConfig(env).aceRule, "initial_two");
});

test("completed cancellation is recognized only with an explicit refund receipt and disabled controls", () => {
    assert.deepEqual(parseGame(receipt()), { kind: "result", outcome: "void", refundedBet: 2 });
    const active = receipt();
    active.components[0].components[0].disabled = false;
    assert.equal(refundedWagerOf(active), null);
    for (const description of ["Hết thời gian chơi.", "Chưa hoàn trả **2💵**", "Sẽ hoàn trả **2💵**", "Đã hoàn trả **1.5💵**", "Đã hoàn trả **0💵**"]) {
        const message = receipt();
        message.embeds[0].description = description;
        assert.equal(refundedWagerOf(message), null);
    }
    const unrelated = receipt();
    unrelated.embeds[0].title = "Thông báo";
    assert.equal(refundedWagerOf(unrelated), null);
});

test("recovery reads only the persisted message and clears an exact refund without advancing the betting sequence", async t => {
    const store = fresh(t);
    const previousRounds = store.data.rounds;
    const operations = [];
    const transport = { fetchRound: async id => { operations.push(["fetch", id]); return receipt(); },
        validate: message => operations.push(["validate", message.id]),
        start: () => assert.fail("must not open a wager"), click: () => assert.fail("must not click") };
    assert.equal(await recoverRound({ config: { roundDelayMs: 15000 }, store, transport }), "void");
    assert.deepEqual(operations, [["fetch", "pending1"], ["validate", "pending1"]]);
    assert.equal(store.data.pending, null);
    assert.equal(store.data.nextBet, 2);
    assert.equal(store.data.betting.step, 1);
    assert.equal(store.data.rounds, previousRounds);
    assert.equal(store.data.paused, true);
    assert.equal(store.data.lastResult.outcome, "void");
    await assert.rejects(recoverRound({ config: {}, store, transport }), /Không có ID/);
    assert.equal(operations.length, 2);
});

test("recovery leaves persisted state intact on an incorrect refund, wrong message, validation failure or active board", async t => {
    for (const [message, validationError] of [[receipt(1)], [{ ...receipt(), id: "other" }],
        [receipt(), true], [board("6♥ | 2♠ | 1♣ |", 9)]]) {
        const store = fresh(t);
        const before = fs.readFileSync(store.file, "utf8");
        await assert.rejects(recoverRound({ config: { aceRule: "initial_two" }, store,
            transport: { fetchRound: async () => message, validate() { if (validationError) throw new Error("Wrong owner"); } } }));
        assert.equal(fs.readFileSync(store.file, "utf8"), before);
    }
});

test("a conflicting original wager header cannot hide a partial refund", async t => {
    const store = fresh(t);
    const message = receipt(1);
    message.embeds[0].author = { name: "Player, Bạn cược 2💵" };
    await assert.rejects(recoverRound({ config: {}, store,
        transport: { fetchRound: async () => message, validate() {} } }), /hoàn trả không khớp/);
    assert.equal(store.data.pending.bet, 2);
});

test("an in-flight game that gets cancelled settles as void without another click or wager", async t => {
    const store = fresh(t, false);
    const active = board("6♥ | 2♠ |", 8);
    let clicks = 0;
    await playRound({ config: { aceRule: "initial_two", roundDelayMs: 0, actionDelayMs: 0, responseTimeoutMs: 20 }, store,
        delay: async () => {}, transport: { start: async bet => { assert.equal(bet, 2); return active; },
            validate() {}, latest: message => message, click: async () => { clicks++; return receipt(); },
            waitForChange: () => assert.fail("already received terminal receipt") } });
    assert.equal(clicks, 1);
    assert.equal(store.data.pending, null);
    assert.equal(store.data.nextBet, 2);
    assert.equal(store.data.lastResult.outcome, "void");
});

test("polling a missed gateway edit reads only the exact message through the pinned v13 channel-history API", async () => {
    require("discord.js-selfbot-v13"); // Initialize upstream's circular internal modules in their public order.
    const MessageManager = require("discord.js-selfbot-v13/src/managers/MessageManager");
    const client = new EventEmitter();
    client.user = { id: "owner" };
    const before = { ...board("6♥ | 2♠ |", 8), channelId: "channel", author: { id: "bot" }, clickButton() {} };
    const after = { ...before, ...receipt(), channelId: "channel", author: { id: "bot" } };
    const calls = [];
    const manager = { cache: new Map([[before.id, before]]),
        _fetchId: () => assert.fail("do not fetch fifty surrounding messages"),
        _fetchMany: async (query, cache) => { calls.push({ query, cache }); return new Map([[after.id, after]]); } };
    manager.fetch = MessageManager.prototype.fetch.bind(manager);
    const transport = new DiscordTransport(client, { id: "channel", messages: manager }, {});
    transport.authorId = "bot";
    const changed = await transport.waitForChange(before, fingerprint(before), 5000);
    assert.equal(changed, after);
    assert.deepEqual(calls, [{ query: { around: before.id, limit: 1 }, cache: true }]);
    assert.equal(client.listenerCount("messageUpdate"), 0);
    assert.equal(client.listenerCount("messageDelete"), 0);
});

test("history reads have a deadline and share stalled requests instead of enqueuing duplicates", async () => {
    const client = new EventEmitter();
    let calls = 0;
    let resolveRead;
    const pending = new Promise(resolve => { resolveRead = resolve; });
    const message = receipt();
    const transport = new DiscordTransport(client, { messages: { fetch: () => { calls++; return pending; } } }, { responseTimeoutMs: 15 });
    await assert.rejects(transport.fetchRound(message.id), { code: "ROUND_READ_TIMEOUT" });
    await assert.rejects(transport.fetchRound(message.id), { code: "ROUND_READ_TIMEOUT" });
    assert.equal(calls, 1);
    resolveRead(new Map([[message.id, message]]));
    assert.equal(await transport.fetchRound(message.id), message);
    assert.equal(transport.pendingReads.size, 0);
    const wrong = new DiscordTransport(client, { messages: { fetch: async () => new Map([["other", message]]) } }, {});
    await assert.rejects(wrong.fetchRound(message.id), /Không tìm thấy đúng/);
});

test("board updates arriving after the interaction deadline can still finish within the board deadline", async () => {
    const client = new EventEmitter();
    client.user = { id: "owner" };
    const before = { ...board("7♠ | 7♦ |", 14), channelId: "channel", author: { id: "bot" }, clickButton() {} };
    const after = { ...before, ...receipt() };
    const transport = new DiscordTransport(client, { id: "channel", messages: { cache: new Map([[before.id, before]]) } }, { responseTimeoutMs: 5 });
    transport.authorId = "bot";
    const waiting = transport.waitForChange(before, fingerprint(before), 200);
    const timer = setTimeout(() => client.emit("messageUpdate", before, after), 30);
    try { assert.equal(await waiting, after); } finally { clearTimeout(timer); }
    assert.equal(client.listenerCount("messageUpdate"), 0);
});

test("a board deadline records timeout evidence and preserves the unchanged board", async () => {
    const client = new EventEmitter();
    const message = board("7♠ | 7♦ |", 14);
    const transport = new DiscordTransport(client, { messages: { cache: new Map([[message.id, message]]) } }, {});
    const events = [];
    transport.audit = (event, detail) => events.push({ event, ...detail });
    await assert.rejects(transport.waitForChange(message, fingerprint(message), 20), { code: "BOARD_UPDATE_TIMEOUT" });
    assert.equal(events.filter(e => e.event === "board_timeout").length, 1);
    assert.equal(events[0].attempt, 0);
    assert.equal(client.listenerCount("messageUpdate"), 0);
    assert.equal(client.listenerCount("messageDelete"), 0);
});

test("round journal records attempts, exact cards, actions and settlement without arbitrary credential fields", async t => {
    const store = fresh(t, false);
    const active = board("7♠ | 7♦ |", 14);
    active.embeds[0].fields[0] = { name: "Chamber [11 + ?]", value: "1♦ | ?" };
    const ended = { ...active, embeds: [{ author: { name: "Player, Bạn cược 2💵" },
        fields: [{ name: "Chamber [20]", value: "1♦ | 9♦ |" }, { name: "Player [25]", value: "7♠ | 7♦ | 2♦ | 9♣ |" }],
        footer: { text: "Bạn đã thua blackjack" } }] };
    const file = path.join(path.dirname(store.file), "rounds.jsonl");
    let clicks = 0;
    await playRound({ config: { aceRule: "initial_two", boardTimeoutMs: 75000, responseTimeoutMs: 30,
        roundDelayMs: 0, actionDelayMs: 0 }, store, delay: async () => {}, transport: {
        start: async () => {
            assert.equal(JSON.parse(fs.readFileSync(file, "utf8").trim().split("\n").at(-1)).event, "wager_attempt");
            return active;
        }, validate() {}, latest: message => message, click: async () => { clicks++; return active; },
        waitForChange: async (_, __, deadline) => { assert.equal(deadline, 75000); return ended; },
    } });
    assert.equal(clicks, 1);
    const entries = fs.readFileSync(file, "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.ok(entries.some(e => e.event === "decision" && e.action === "hit" && e.cards.join() === "7,7"));
    assert.ok(entries.some(e => e.event === "board" && e.playerScore === 25 && e.cards.join() === "7,7,2,9"));
    const result = entries.at(-1);
    assert.equal(result.event, "settlement");
    assert.equal(result.outcome, "loss");
    assert.equal(result.bet, 2);
    assert.equal(result.nextBet, 1);
    assert.ok(result.roundId);
    store.record("probe", { token: "should-not-appear", headers: { Authorization: "should-not-appear" }, config: "should-not-appear" });
    assert.ok(!fs.readFileSync(file, "utf8").includes("should-not-appear"));
    assert.throws(() => store.settle("loss", 0), /Không có ván/);
});

test("a manually completed pending loss is reconciled once without replaying a wager", async t => {
    const store = fresh(t);
    const message = board("7♠ | 7♦ | 2♦ | 9♣ |", 25);
    message.embeds[0].footer = { text: "Bạn đã thua blackjack" };
    const transport = { fetchRound: async () => message, validate() {},
        start() { assert.fail("no wager"); }, click() { assert.fail("no click"); } };
    assert.equal(await recoverRound({ config: { roundDelayMs: 0 }, store, transport }), "loss");
    assert.equal(store.data.nextBet, 1);
    assert.equal(store.data.betting.step, 0);
    assert.equal(store.data.lossStreak, 1);
    assert.equal(store.data.paused, true);
    await assert.rejects(recoverRound({ config: {}, store, transport }), /Không có ID/);
});
