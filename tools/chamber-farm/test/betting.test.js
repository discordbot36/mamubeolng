"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { advanceBetting } = require("../strategy");
const { StateStore } = require("../state");
const { readConfig } = require("../config");
const { playRound } = require("../engine");

const sequence = [1, 2, 3, 5];
function fresh(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chamber-betting-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    return new StateStore(path.join(directory, "state.json"), 1);
}
function result(store, outcome) {
    store.begin(store.data.nextBet);
    store.settle(outcome, 15_000);
}

test("reset-at-32 Martingale repeats 1,2,4,8,16,32,1 and books the full 63-coin loss", t => {
    const store = fresh(t);
    store.configureBetting("martingale", [], 32);
    store.data.session = require("../session").startSession(1000, "wallet");
    const stakes = [];
    for (let i = 0; i < 6; i++) { stakes.push(store.data.nextBet); result(store, "loss"); }
    assert.deepEqual(stakes, [1, 2, 4, 8, 16, 32]);
    assert.equal(store.data.nextBet, 1);
    assert.equal(store.data.session.balance, 937);
    assert.equal(store.data.session.netBlackjack, -63);
    assert.equal(store.data.rounds, 6);
    assert.equal(store.data.lossStreak, 6);
    result(store, "loss");
    assert.equal(store.data.nextBet, 2);
    result(store, "win");
    assert.equal(store.data.nextBet, 1);
});

test("ties and refunds at 32 keep the stake; restart retains the reset threshold", t => {
    let store = fresh(t);
    store.configureBetting("martingale", [], 32);
    for (let i = 0; i < 5; i++) result(store, "loss");
    for (const outcome of ["push", "void"]) {
        result(store, outcome);
        assert.equal(store.data.nextBet, 32);
        store = new StateStore(store.file, 1);
        assert.equal(store.data.betting.resetAt, 32);
        assert.equal(store.configureBetting("martingale", [], 32).changed, false);
    }
    result(store, "loss");
    assert.equal(new StateStore(store.file, 1).data.nextBet, 1);
});

test("enabling the reset threshold waits for an unresolved stake and preserves its actual amount", t => {
    const store = fresh(t);
    for (let i = 0; i < 5; i++) result(store, "loss");
    store.begin(32);
    assert.equal(store.configureBetting("martingale", [], 32).deferred, true);
    assert.equal(store.data.pending.bet, 32);
    assert.equal(store.data.betting.resetAt, undefined);
    store.settle("loss", 0);
    assert.equal(store.data.lastResult.bet, 32);
    assert.equal(store.data.betting.resetAt, 32);
    assert.equal(store.data.nextBet, 1);
});

test("reset preview matches actual progression, supports a changed base and keeps the server cap", () => {
    const { bettingPreview } = require("../betting-controls");
    const preview = bettingPreview(1, [], 1000, 50, 1, "martingale", 32);
    assert.deepEqual(preview.stakes, [1, 2, 4, 8, 16, 32]);
    assert.equal(preview.resetTo, 1);
    assert.equal(preview.blockedNext, null);
    assert.equal(preview.cycleCapital, 63);
    const otherBase = bettingPreview(3, [], 1000, 50, 1, "martingale", 32);
    assert.deepEqual(otherBase.stakes, [3, 6, 12, 24]);
    assert.equal(advanceBetting(24, "loss", 3, { mode: "martingale", resetAt: 32 }).nextBet, 3);
    assert.equal(bettingPreview(33, [], 1000, 50, 1, "martingale", 32).allowed, false);
    const lowerCap = bettingPreview(1, [], 1000, 20, 1, "martingale", 32);
    assert.equal(lowerCap.resetTo, null);
    assert.equal(lowerCap.blockedNext, 32);
});

test("new configuration defaults to reset at 32 while zero explicitly keeps uncapped legacy Martingale", () => {
    const env = { DISCORD_USER_TOKEN: "offline-only", CHAMBER_BOT_ID: "123456789012345678", CHANNEL_ID: "223456789012345678", MAX_BET: "50" };
    assert.equal(readConfig(env).martingaleResetAt, 32);
    assert.equal(readConfig({ ...env, MARTINGALE_RESET_AT: "0" }).martingaleResetAt, 0);
    assert.throws(() => readConfig({ ...env, MARTINGALE_RESET_AT: "-1" }));
    assert.throws(() => readConfig({ ...env, BASE_BET: "33" }));
});

test("four wins stake 1, 2, 3, 5 then return to 1; a 1:1 payout would net 11", () => {
    const policy = { mode: "win_progression", sequence, step: 0 };
    let stake = 1;
    const stakes = [];
    for (let i = 0; i < 4; i++) {
        stakes.push(stake);
        const advanced = advanceBetting(stake, "win", 1, policy);
        stake = advanced.nextBet;
        policy.step = advanced.step;
    }
    assert.deepEqual(stakes, sequence);
    assert.equal(stakes.reduce((a, b) => a + b, 0), 11);
    assert.equal(stake, 1);
    assert.equal(policy.step, 0);
});

test("a loss at any progression step returns to 1; ties and refused commands preserve the step", () => {
    for (const [step, stake] of sequence.entries()) {
        const policy = { mode: "win_progression", sequence, step };
        assert.deepEqual(advanceBetting(stake, "loss", 1, policy), { nextBet: 1, step: 0 });
        for (const outcome of ["push", "void"]) {
            assert.deepEqual(advanceBetting(stake, outcome, 1, policy), { nextBet: stake, step });
        }
    }
    assert.throws(() => advanceBetting(1, "unknown", 1, { mode: "win_progression", sequence, step: 0 }));
    assert.throws(() => advanceBetting(8, "win", 1, { mode: "win_progression", sequence, step: 0 }));
});

test("a restart retains the winning step and a subsequent loss resets only the stake", t => {
    const store = fresh(t);
    store.configureBetting("win_progression", sequence);
    result(store, "win");
    result(store, "win");
    const reopened = new StateStore(store.file, 1);
    reopened.configureBetting("win_progression", sequence);
    assert.equal(reopened.data.nextBet, 3);
    assert.equal(reopened.data.betting.step, 2);
    result(reopened, "push");
    assert.equal(reopened.data.nextBet, 3);
    result(reopened, "loss");
    assert.equal(reopened.data.nextBet, 1);
    assert.equal(reopened.data.betting.step, 0);
    assert.equal(reopened.data.rounds, 4);
    assert.equal(reopened.data.lossStreak, 1);
});

test("a new policy cannot reprice an unresolved legacy Martingale wager", t => {
    const store = fresh(t);
    for (let i = 0; i < 3; i++) result(store, "loss");
    store.begin(8);
    const change = store.configureBetting("win_progression", sequence);
    assert.equal(change.deferred, true);
    store.save();
    const reopened = new StateStore(store.file, 1);
    assert.equal(reopened.data.nextBet, 8);
    assert.equal(reopened.data.pending.bet, 8);
    assert.equal(reopened.data.betting.mode, "martingale");
    assert.equal(reopened.data.pendingBettingChange.mode, "win_progression");
    reopened.settle("loss", 15_000);
    assert.equal(reopened.data.lastResult.bet, 8);
    assert.equal(reopened.data.lastResult.bettingMode, "martingale");
    assert.equal(reopened.data.nextBet, 1);
    assert.equal(reopened.data.lossStreak, 4);
    assert.equal(reopened.data.betting.mode, "win_progression");
    assert.equal(reopened.data.pendingBettingChange, undefined);
});

test("switching policy without a pending wager preserves records, daily check-in and pause", t => {
    const store = fresh(t);
    result(store, "loss");
    store.data.paused = true;
    store.data.daily = { date: "2026-10-22", status: "response-received" };
    const change = store.configureBetting("win_progression", sequence);
    assert.equal(change.deferred, false);
    assert.equal(store.data.nextBet, 1);
    assert.equal(store.data.rounds, 1);
    assert.equal(store.data.lossStreak, 1);
    assert.equal(store.data.lastResult.outcome, "loss");
    assert.equal(store.data.paused, true);
    assert.equal(store.data.daily.date, "2026-10-22");
});

test("policy configuration rejects descending sequences, overflow and a stake above the server cap", () => {
    const env = { DISCORD_USER_TOKEN: "offline-only", CHAMBER_BOT_ID: "123456789012345678",
        CHANNEL_ID: "223456789012345678", BETTING_MODE: "win_progression", MAX_BET: "50" };
    assert.equal(readConfig(env).bettingMode, "win_progression");
    assert.deepEqual(readConfig(env).winBetSequence, sequence);
    assert.throws(() => readConfig({ ...env, WIN_BET_SEQUENCE: "1,3,2,6" }));
    assert.throws(() => readConfig({ ...env, WIN_BET_SEQUENCE: "1,2,51" }));
    assert.throws(() => readConfig({ ...env, WIN_BET_SEQUENCE: "1,2,3.5" }));
    assert.throws(() => readConfig({ ...env, BASE_BET: "9007199254740991", MAX_BET: "0" }));
    assert.throws(() => readConfig({ ...env, BETTING_MODE: "unknown" }));
});

test("round engine dispatches correct stakes across wins, a tie, a loss and a complete cycle", async t => {
    const store = fresh(t);
    store.configureBetting("win_progression", sequence);
    const stakes = [];
    for (const outcome of ["win", "win", "push", "loss", "win", "win", "win", "win"]) {
        const message = { id: `round${stakes.length}`, content: "", components: [],
            embeds: [{ description: outcome === "win" ? "Bạn đã thắng blackjack" :
                outcome === "loss" ? "Bạn đã thua blackjack" : "Bạn đã hòa blackjack" }] };
        await playRound({ config: { maxBet: 50, maxLossStreak: 0, roundDelayMs: 15_000,
            blackjackCommand: "blackjack", moneyOption: "money" }, store,
            transport: { start: async stake => { stakes.push(stake); return message; }, validate() {} } });
    }
    assert.deepEqual(stakes, [1, 2, 3, 3, 1, 2, 3, 5]);
    assert.equal(store.data.nextBet, 1);
});

test("flat mode remains available without advancing stakes after either outcome", t => {
    const store = fresh(t);
    store.configureBetting("flat", []);
    for (const outcome of ["win", "loss", "push", "win"]) {
        result(store, outcome);
        assert.equal(store.data.nextBet, 1);
    }
});

test("a new command refused because a different blackjack is active cannot advance or lose the stake", async t => {
    const store = fresh(t);
    store.configureBetting("win_progression", sequence);
    result(store, "win");
    const message = { id: "busy1", content: "", components: [], embeds: [{ title: "Thất Bại",
        description: "Vui lòng hoàn thành blackjack trước khi tiếp tục!", fields: [] }] };
    await assert.rejects(playRound({ config: { maxBet: 50, roundDelayMs: 15_000 }, store,
        transport: { start: async () => message, validate() {} } }), /còn một ván/);
    assert.equal(store.data.nextBet, 2);
    assert.equal(store.data.betting.step, 1);
    assert.equal(store.data.rounds, 1);
    assert.equal(store.data.pending, null);
    assert.equal(store.data.lastResult.outcome, "void");
});
