"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { handValue, chooseAction } = require("../strategy");
const { chooseExpectedAction, dealerDistribution } = require("../decision");
const { parseGame, wagerOf } = require("../parser");
const { playRound } = require("../engine");
const { StateStore } = require("../state");
const { readConfig } = require("../config");

function close(actual, expected, tolerance = 0.000001) {
    assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} versus ${expected}`);
}
function board(playerCards, playerScore, dealerCards = "9♣ 🂠", dealerScore = "?") {
    return { id: "game1", content: "", embeds: [{ author: { name: "Player, Bạn cược 1💵" }, fields: [
        { name: `Chamber [${dealerScore}]`, value: dealerCards },
        { name: `Player [${playerScore}]`, value: playerCards },
    ] }], components: [{ components: [
        { customId: "hit", label: "Tiếp" }, { customId: "stand", label: "Thôi" },
    ] }] };
}
function fresh(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chamber-ev-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    return new StateStore(path.join(directory, "state.json"), 1);
}

test("observed Chamber rules stop the dealer at 16 and tie when both sides bust", () => {
    const options = { aceRule: "initial_two", dealerStandOn: 16, bothBustPush: true };
    assert.deepEqual(dealerDistribution(["10", "6"], options), [0, 1, 0, 0, 0, 0, 0]);
    assert.ok(dealerDistribution(["10", "6"], { dealerStandOn: 17 })[0] > 0);
    const againstBusted = chooseExpectedAction(["10", "10", "A"], ["10", "10", "5"], options);
    close(againstBusted.standEV, 1);
    close(againstBusted.hitEV, 0); // Every draw busts; both-bust is a push.
    const ordinary = chooseExpectedAction(["10", "10", "A"], "6", options);
    close(ordinary.hitEV, -(1 - dealerDistribution("6", options)[0]));
    for (const aceRule of ["standard", "draw_time", "initial_two"]) for (const dealerStandOn of [16, 17]) {
        for (const dealer of ["A", "2", "6", "10"]) {
            const probabilities = dealerDistribution(dealer, { aceRule, dealerStandOn });
            close(probabilities.reduce((sum, value) => sum + value, 0), 1, 1e-12);
        }
    }
});

test("natural blackjack uses observed payout without doubling ordinary three-card wins", async t => {
    for (const [cards, natural, delta] of [["K♥ A♠", true, 2], ["K♥ 5♠ 6♦", false, 1]]) {
        const store = fresh(t);
        store.data.session = require("../session").startSession(100, "wallet");
        const message = board(cards, 21, "10♦ 9♣", 19);
        message.embeds[0].footer = { text: "Bạn đã thắng blackjack" };
        await playRound({ config: { maxBet: 50, roundDelayMs: 0, naturalWinMultiplier: 2 }, store,
            transport: { start: async () => message, validate() {} } });
        assert.equal(store.data.lastResult.natural, natural);
        assert.equal(store.data.session.balance, 100 + delta);
        assert.equal(store.data.session.history[0].delta, delta);
    }
});

test("standard-model EV matches independently published infinite-deck S17 values", () => {
    // Wizard of Odds, Expected Returns in Infinite-Deck Blackjack.
    // Values are conditional on the dealer not already holding a natural.
    const cases = [
        [["10", "6"], "10", -0.540430, -0.539826, "hit"],
        [["10", "2"], "4", -0.211063, -0.213537, "stand"],
        [["A", "7"], "9", -0.183163, -0.100744, "hit"],
    ];
    for (const [cards, dealer, standEV, hitEV, action] of cases) {
        const decision = chooseExpectedAction(cards, dealer, { aceRule: "standard", dealerPeek: true });
        close(decision.standEV, standEV);
        close(decision.hitEV, hitEV);
        assert.equal(decision.action, action);
    }
});

test("standard EV agrees with the reference Hit/Stand chart across hard and soft totals", () => {
    const hands = [];
    for (let total = 4; total <= 20; total++) {
        const left = Math.max(2, total - 10);
        hands.push([String(left), String(total - left)]);
    }
    hands.push(["10", "9", "2"]);
    for (let kicker = 1; kicker <= 10; kicker++) hands.push(["A", kicker === 1 ? "A" : String(kicker)]);
    for (const cards of hands) for (const dealer of ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"]) {
        assert.equal(chooseExpectedAction(cards, dealer, { dealerPeek: true }).action,
            chooseAction(cards, dealer).action, `${cards} versus ${dealer}`);
    }
});

test("dealer probability distributions normalize under both ace models, peek settings and S17/H17", () => {
    for (const aceRule of ["standard", "draw_time", "initial_two"]) for (const dealerPeek of [false, true]) {
        for (const dealerHitsSoft17 of [false, true]) for (const dealer of ["A", "2", "6", "9", "10"]) {
            const distribution = dealerDistribution(dealer, { aceRule, dealerPeek, dealerHitsSoft17 });
            close(distribution.reduce((sum, n) => sum + n, 0), 1, 1e-12);
            assert.ok(distribution.every(n => n >= 0 && n <= 1));
        }
    }
    assert.deepEqual(dealerDistribution(["A", "6"], { dealerHitsSoft17: false }), [0, 1, 0, 0, 0, 0]);
    assert.ok(dealerDistribution(["A", "6"], { dealerHitsSoft17: true })[0] > 0);
});

test("draw-time ace values reproduce both discriminating hands observed in Chamber", () => {
    assert.deepEqual(handValue(["1", "6", "6"], "draw_time"), { total: 23, soft: false });
    assert.deepEqual(handValue(["1", "7", "1"], "draw_time"), { total: 19, soft: false });
    assert.equal(handValue(["1", "6", "6"], "standard").total, 13);
    assert.equal(handValue(["1", "7", "1"], "standard").total, 19);
    assert.equal(handValue(["6", "1", "6"], "draw_time").total, 23);
});

test("the observed ace model avoids the standard soft-hand hit that can bust in Chamber", () => {
    assert.equal(chooseExpectedAction(["1", "6"], "9", { aceRule: "standard" }).action, "hit");
    const decision = chooseExpectedAction(["1", "6"], "9", { aceRule: "draw_time" });
    assert.equal(decision.action, "stand");
    assert.ok(decision.standEV > decision.hitEV);
    close(decision.bustRisk, 9 / 13, 1e-12);
    assert.equal(chooseExpectedAction(["1", "7"], "9", { aceRule: "draw_time" }).action, "stand");
});

test("a fully exposed dealer hand can justify hitting 17 when standing would certainly lose", () => {
    const decision = chooseExpectedAction(["10", "7"], ["9", "9"], { aceRule: "standard" });
    assert.equal(decision.action, "hit");
    assert.equal(decision.standEV, -1);
    assert.ok(decision.hitEV > -1);
    const message = board("10♥ 7♠", 17, "9♦ 9♣", 18);
    assert.deepEqual(parseGame(message).dealerCards, ["9", "9"]);
    message.embeds[0].fields[0].value += " 🂠";
    assert.equal(parseGame(message).kind, "unknown");
});

test("the parser stops on a score inconsistent with the selected model", () => {
    assert.equal(parseGame(board("1♥ 6♦ 6♣", 23), { aceRule: "draw_time" }).kind, "waiting");
    assert.equal(parseGame(board("1♥ 6♦ 6♣", 23), { aceRule: "standard" }).kind, "unknown");
    assert.equal(parseGame(board("1♥ 6♦ K♣", 17), { aceRule: "draw_time" }).kind, "unknown");
});

test("the actual author-header stake is read and a mismatched reply cannot settle a wager", async t => {
    const message = board("10♥ 7♠", 17);
    message.embeds[0].author.name = "Player, Bạn cược 2💵";
    message.embeds[0].footer = { text: "Bạn đã thắng blackjack" };
    assert.equal(wagerOf(message), 2);
    const store = fresh(t);
    await assert.rejects(playRound({ config: { maxBet: 50, roundDelayMs: 15_000 }, store,
        transport: { start: async () => message, validate() {} } }), /khác cược đã lưu/);
    assert.equal(store.data.pending.bet, 1);
    assert.equal(store.data.rounds, 0);
    assert.equal(store.data.nextBet, 1);
});

test("the engine uses the selected ace model and records why it stood", async t => {
    const store = fresh(t);
    const active = board("1♥ 6♦", 17);
    const ended = { ...active, embeds: [{ description: "Bạn đã thắng blackjack" }] };
    const clicked = [];
    await playRound({ config: { aceRule: "draw_time", maxBet: 50, roundDelayMs: 15_000, actionDelayMs: 0,
        responseTimeoutMs: 100 }, store, delay: async () => {}, transport: {
        start: async () => active, validate() {}, latest: message => message,
        click: async (message, id) => { clicked.push(id); return message; }, waitForChange: async () => ended,
    } });
    assert.deepEqual(clicked, ["stand"]);
    assert.equal(store.data.lastResult.decision.aceRule, "draw_time");
    assert.ok(store.data.lastResult.decision.standEV > store.data.lastResult.decision.hitEV);
});

test("invalid model settings and unknown ranks fail rather than generating a recommendation", () => {
    const env = { DISCORD_USER_TOKEN: "offline-only", CHAMBER_BOT_ID: "123456789012345678", CHANNEL_ID: "223456789012345678" };
    assert.throws(() => readConfig({ ...env, ACE_RULE: "guess" }));
    assert.throws(() => readConfig({ ...env, DEALER_PEEK: "yes" }));
    assert.throws(() => chooseExpectedAction(["JOKER", "6"], "9"));
    assert.throws(() => chooseExpectedAction(["10", "10", "5"], "9"));
});
