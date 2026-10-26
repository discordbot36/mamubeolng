"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { waitForInteraction, installInteractionWaiter } = require("../interactions");

test("a message from another nonce cannot satisfy the current slash command", async () => {
    const client = new EventEmitter();
    const waiting = waitForInteraction(client, "request1", 100);
    client.emit("messageCreate", { id: "someone-else", nonce: "request2" });
    const expected = { id: "own-reply", nonce: "request1" };
    client.emit("messageCreate", expected);
    assert.equal(await waiting, expected);
    assert.equal(client.listenerCount("messageCreate"), 0);
    assert.equal(client.listenerCount("unhandledPacket"), 0);
});

test("an exact deferred button acknowledgement returns the parent without waiting for timeout", async () => {
    const client = new EventEmitter();
    const parent = { id: "own-game" };
    const waiting = waitForInteraction(client, "button1", 100, true, parent);
    client.emit("unhandledPacket", { t: "INTERACTION_SUCCESS", d: { nonce: "other" } });
    client.emit("unhandledPacket", { t: "INTERACTION_SUCCESS", d: { nonce: "button1" } });
    assert.equal(await waiting, parent);
    assert.equal(client.listenerCount("unhandledPacket"), 0);
});

test("a slash acknowledgement alone is not mistaken for its game response", async () => {
    const client = new EventEmitter();
    const waiting = waitForInteraction(client, "slash1", 100);
    client.emit("unhandledPacket", { t: "INTERACTION_SUCCESS", d: { nonce: "slash1" } });
    const message = { id: "actual-game", nonce: "slash1" };
    client.emit("messageCreate", message);
    assert.equal(await waiting, message);
});

test("interaction failure and timeout clean listeners and never retry a request", async () => {
    const client = new EventEmitter();
    const failed = waitForInteraction(client, "failed", 100);
    client.emit("unhandledPacket", { t: "INTERACTION_FAILURE", d: { nonce: "failed" } });
    await assert.rejects(failed, { code: "INTERACTION_FAILED" });
    await assert.rejects(waitForInteraction(client, "late", 10), { code: "INTERACTION_TIMEOUT" });
    for (const event of ["messageCreate", "unhandledPacket", "interactionModalCreate"]) assert.equal(client.listenerCount(event), 0);
});

test("failure notification does not discard a later response for the exact same command", async () => {
    const client = new EventEmitter();
    const waiting = waitForInteraction(client, "late-own", 100);
    client.emit("unhandledPacket", { t: "INTERACTION_FAILURE", d: { nonce: "late-own" } });
    client.emit("messageCreate", { id: "wrong", nonce: "another-command" });
    const response = { id: "late-response", nonce: "late-own" };
    client.emit("messageCreate", response);
    assert.equal(await waiting, response);
    for (const event of ["messageCreate", "unhandledPacket", "interactionModalCreate"]) assert.equal(client.listenerCount(event), 0);
});

test("adapter exposes command nonce before waiting so missing response can be recovered after restart", async () => {
    const client = new EventEmitter();
    const recorded = [];
    const util = { createPromiseInteraction() {} };
    const restore = installInteractionWaiter(client, 100, util, value => recorded.push(value));
    try {
        const waiting = util.createPromiseInteraction(client, "123456789012345678");
        assert.deepEqual(recorded, [{ nonce: "123456789012345678", deferred: false, messageId: null }]);
        const response = { id: "reply", nonce: "123456789012345678" };
        client.emit("messageCreate", response);
        assert.equal(await waiting, response);
    } finally { restore(); }
});

test("the adapter honors its configured timeout, stays scoped to this client and restores upstream", async () => {
    const client = new EventEmitter();
    const other = new EventEmitter();
    const original = () => "upstream";
    const util = { createPromiseInteraction: original };
    const restore = installInteractionWaiter(client, 100, util);
    try {
        assert.equal(util.createPromiseInteraction(other, "other"), "upstream");
        const waiting = util.createPromiseInteraction(client, "slow", 1);
        await new Promise(resolve => setTimeout(resolve, 10));
        const response = { id: "slow-response", nonce: "slow" };
        client.emit("messageCreate", response);
        assert.equal(await waiting, response);
    } finally { restore(); }
    assert.equal(util.createPromiseInteraction, original);
});

test("the adapter integrates with the pinned real client without logging in or leaking listener counts", async () => {
    const { Client } = require("discord.js-selfbot-v13");
    const util = require("discord.js-selfbot-v13/src/util/Util");
    const client = new Client();
    const original = util.createPromiseInteraction;
    const listeners = client.getMaxListeners();
    const restore = installInteractionWaiter(client, 100, util);
    try {
        const waiting = util.createPromiseInteraction(client, "local-only", 5000, true, { id: "parent" });
        client.emit("unhandledPacket", { t: "INTERACTION_SUCCESS", d: { nonce: "local-only" } });
        assert.equal((await waiting).id, "parent");
        assert.equal(client.getMaxListeners(), listeners);
    } finally { restore(); client.destroy(); }
    assert.equal(util.createPromiseInteraction, original);
});
