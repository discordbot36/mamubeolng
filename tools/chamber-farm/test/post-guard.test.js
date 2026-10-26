"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const RateLimitError = require("discord.js-selfbot-v13/src/rest/RateLimitError");
const { installPostGuard } = require("../post-guard");
const { waitForInteraction } = require("../interactions");
const { StateStore } = require("../state");
const { startSession } = require("../session");
const { playRound } = require("../engine");
const { WalletActions } = require("../wallet-actions");

const limited = timeout => new RateLimitError({ timeout, limit: 1, method: "post", path: "/interactions", route: "/interactions", global: false });

test("ignored SDK POST rejection reaches only its nonce waiter without an unhandled rejection or retry", async () => {
    const client = new EventEmitter();
    let posts = 0;
    const originalApi = { interactions: { post: async () => { posts++; throw limited(12000); } } };
    client.api = originalApi;
    const audit = [];
    const guard = installPostGuard(client, { audit: (event, details) => audit.push({ event, ...details }) });
    try {
        // Reproduce the pinned SDK: fire POST without awaiting its Promise,
        // then attach a nonce waiter. The guard must deliver the POST failure.
        client.api.interactions.post({ data: { nonce: "own" } });
        const own = waitForInteraction(client, "own", 100);
        const other = waitForInteraction(client, "other", 100);
        const error = await own.catch(value => value);
        assert.equal(error.code, "INTERACTION_RATE_LIMIT");
        assert.equal(error.interactionRejected, true);
        assert.equal(error.commandNonce, "own");
        client.emit("messageCreate", { nonce: "other", id: "other-reply" });
        assert.equal((await other).id, "other-reply");
        assert.equal(posts, 1);
        assert.equal(client.listenerCount("apiRequest"), 0);
        assert.equal(client.listenerCount("chamberInteractionPostError"), 0);
        assert.equal(audit[0].source, "preflight");
    } finally { guard.restore(); }
    assert.equal(client.api, originalApi);
    assert.equal(client.listenerCount("rateLimit"), 0);
});

test("POST errors after sending preserve uncertainty; only explicit rate-limit rejections are classified unaccepted", async () => {
    for (const original of [new Error("network disconnect"), limited(3000)]) {
        const client = new EventEmitter();
        client.api = { interactions: { post: async options => {
            client.emit("apiRequest", { path: "/interactions", options });
            throw original;
        } } };
        const events = [];
        const guard = installPostGuard(client, { audit: (event, data) => events.push({ event, ...data }) });
        try {
            client.api.interactions.post({ data: { nonce: "x" } });
            const error = await waitForInteraction(client, "x", 100).catch(value => value);
            assert.equal(error.interactionRejected, original instanceof RateLimitError);
            assert.equal(events[0].source, "http");
        } finally { guard.restore(); }
    }
});

test("a fast gateway reply is caught because the waiter is installed before the guarded POST runs", async () => {
    const client = new EventEmitter();
    client.api = { interactions: { post: async options => {
        client.emit("messageCreate", { nonce: options.data.nonce, id: "fast-reply" });
    } } };
    const guard = installPostGuard(client);
    try {
        client.api.interactions.post({ data: { nonce: "fast" } });
        const response = await waitForInteraction(client, "fast", 100);
        assert.equal(response.id, "fast-reply");
    } finally { guard.restore(); }
});

test("interaction pacing spaces startup commands and respects server cooldown without retrying requests", async () => {
    const client = new EventEmitter();
    client.api = { interactions: { post() { assert.fail("pacing must not submit a request"); } } };
    let clock = 10000;
    const waits = [];
    const guard = installPostGuard(client, { gapMs: 5000, now: () => clock,
        delay: async value => { waits.push(value); clock += value; } });
    try {
        await guard.waitTurn();
        await guard.waitTurn();
        await guard.waitTurn();
        assert.deepEqual(waits, [5000, 5000]);
        client.emit("rateLimit", { route: "/interactions", timeout: 8000 });
        await guard.waitTurn();
        assert.equal(waits.at(-1), 8000);
        client.emit("rateLimit", { route: "/interactions", timeout: 60000 });
        await assert.rejects(guard.waitTurn(), { code: "INTERACTION_COOLDOWN", interactionRejected: true });
        assert.equal(waits.length, 3); // No long sleep or queued POST after timeout.
    } finally { guard.restore(); }
});

test("a restored server cooldown is respected before the first request after restart", async () => {
    const client = new EventEmitter();
    client.api = { interactions: { post() { assert.fail("No request should be sent by the pacer"); } } };
    let clock = 1000;
    const waits = [];
    const guard = installPostGuard(client, { cooldownUntil: 7000, now: () => clock,
        delay: async milliseconds => { waits.push(milliseconds); clock += milliseconds; } });
    try { await guard.waitTurn(); assert.deepEqual(waits, [6000]); }
    finally { guard.restore(); }
});

test("explicit rejected wager clears pending without treating it as a loss, void or new round", async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chamber-rate-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const store = new StateStore(path.join(directory, "state.json"), 1);
    store.data.session = startSession(924, "wallet");
    store.data.nextBet = 4;
    store.data.lossStreak = 2;
    store.configureBetting("martingale", []);
    const before = structuredClone(store.data);
    const error = Object.assign(new Error("rejected"), { code: "INTERACTION_RATE_LIMIT", interactionRejected: true });
    await assert.rejects(playRound({ store, config: { maxBet: 50 }, transport: { start: async () => { throw error; } } }), error);
    assert.equal(store.data.pending, null);
    assert.equal(store.data.nextBet, before.nextBet);
    assert.equal(store.data.lossStreak, before.lossStreak);
    assert.equal(store.data.rounds, before.rounds);
    assert.deepEqual(store.data.session, before.session);
    assert.equal(store.data.lastResult, undefined);
    const unknown = new Error("timeout");
    await assert.rejects(playRound({ store, config: { maxBet: 50 }, transport: { start: async () => { throw unknown; } } }), unknown);
    assert.ok(store.data.pending);
});

test("already-claimed daily does not query wallet again after the startup balance", async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chamber-daily-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const store = new StateStore(path.join(directory, "state.json"), 1);
    let accounts = 0;
    const wallet = new WalletActions({ store, config: { timezone: "Asia/Ho_Chi_Minh" }, transport: {
        account: async () => { accounts++; return { balance: 924, message: { id: "wallet" } }; },
        confirmedDaily: async () => ({ kind: "already", reward: 0, message: { id: "daily" } }),
    } });
    await wallet.daily();
    assert.equal(accounts, 1);
    assert.equal(store.data.daily.status, "already");
    assert.equal(store.data.session.balance, 924);
    assert.equal(store.data.session.estimated, false);
});

test("guard restores the pinned client's original API getter without logging in", async () => {
    const { Client } = require("discord.js-selfbot-v13");
    const client = new Client();
    assert.equal(Object.hasOwn(client, "api"), false);
    const guard = installPostGuard(client);
    assert.equal(typeof client.api.interactions.post, "function");
    assert.equal(typeof client.api.guilds("123").get, "function");
    guard.restore();
    assert.equal(Object.hasOwn(client, "api"), false);
    client.destroy();
});

test("the real pinned sendSlash propagates its ignored rate-limit POST rejection with the correct nonce", async () => {
    const { Client } = require("discord.js-selfbot-v13");
    const TextBasedChannel = require("discord.js-selfbot-v13/src/structures/interfaces/TextBasedChannel");
    const { installInteractionWaiter } = require("../interactions");
    const client = new Client();
    const applicationId = "1117099742921502850";
    let posts = 0, recordedNonce;
    Object.defineProperty(client, "api", { configurable: true, value: { interactions: { post: async options => {
        posts++;
        assert.equal(options.data.nonce, recordedNonce);
        assert.equal(options.data.application_id, applicationId);
        assert.deepEqual(options.data.data.options, [{ type: 4, name: "money", value: 1 }]);
        throw limited(7000);
    } } } });
    const restore = installInteractionWaiter(client, 100, undefined, data => { recordedNonce = data.nonce; });
    const guard = installPostGuard(client);
    try {
        const channel = { client, id: "1135209450144272504", guild: { id: "653508294962315285" },
            searchInteraction: async () => ({ applications: [{ id: applicationId }], application_commands: [{
                application_id: applicationId, id: "123456789012345678", version: "223456789012345678", type: 1,
                name: "blackjack", options: [{ type: 4, name: "money", required: true }],
            }] }) };
        await assert.rejects(TextBasedChannel.prototype.sendSlash.call(channel, applicationId, "blackjack", 1), error => {
            assert.equal(error.code, "INTERACTION_RATE_LIMIT");
            assert.equal(error.commandNonce, recordedNonce);
            assert.equal(error.interactionRejected, true);
            return true;
        });
        assert.equal(posts, 1);
        assert.equal(client.listenerCount("chamberInteractionPostError"), 0);
    } finally { guard.restore(); restore(); client.destroy(); }
});

test("real mutable API router keeps fresh independent paths for GETs and successive interaction POSTs", async () => {
    const { Client } = require("discord.js-selfbot-v13");
    const client = new Client();
    const paths = [];
    client.rest.request = async (method, url) => { paths.push({ method, url }); return {}; };
    const guard = installPostGuard(client);
    try {
        await client.api.guilds("653508294962315285")["application-command-index"].get();
        await client.api.interactions.post({ data: { nonce: "first" } });
        await client.api.interactions.post({ data: { nonce: "second" } });
        await client.api.channels("1135209450144272504").messages.get();
        assert.deepEqual(paths, [
            { method: "get", url: "/guilds/653508294962315285/application-command-index" },
            { method: "post", url: "/interactions" },
            { method: "post", url: "/interactions" },
            { method: "get", url: "/channels/1135209450144272504/messages" },
        ]);
    } finally { guard.restore(); client.destroy(); }
});
