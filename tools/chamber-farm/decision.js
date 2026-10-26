"use strict";

const { handValue } = require("./strategy");

// Independent-rank / infinite-deck model. Ten-valued cards have probability
// 4/13; each other rank has probability 1/13. This is an explicit model, not
// a recovered implementation of Chamber's RNG or shoe.
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
const PROBABILITIES = RANKS.map(rank => rank === "10" ? 4 / 13 : 1 / 13);
const dealerCache = new Map();

function rulesOf(options = {}) {
    const aceRule = options.aceRule ?? "standard";
    if (!["standard", "draw_time", "initial_two"].includes(aceRule)) throw new Error("Luật Át không hợp lệ.");
    for (const name of ["dealerHitsSoft17", "dealerPeek", "bothBustPush"]) {
        if (options[name] !== undefined && typeof options[name] !== "boolean") throw new Error(`${name} phải là boolean.`);
    }
    const dealerStandOn = options.dealerStandOn ?? 17;
    if (![16, 17].includes(dealerStandOn)) throw new Error("Điểm dừng nhà cái phải là 16 hoặc 17.");
    return { aceRule, dealerHitsSoft17: options.dealerHitsSoft17 ?? false,
        dealerPeek: options.dealerPeek ?? false, dealerStandOn, bothBustPush: options.bothBustPush ?? false };
}

function addRank(state, rank, aceRule) {
    const ace = rank === "A" || rank === "1";
    if (aceRule === "initial_two") {
        return { total: state.total + (ace ? state.count < 2 && state.total + 11 <= 21 ? 11 : 1 : Number(rank)),
            soft: false, count: Math.min(2, state.count + 1) };
    }
    if (aceRule === "draw_time") {
        return { total: state.total + (ace ? state.total + 11 <= 21 ? 11 : 1 : Number(rank)), soft: false };
    }
    let aces = (state.soft ? 1 : 0) + (ace ? 1 : 0);
    let total = state.total + (ace ? 11 : Number(rank));
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return { total, soft: aces > 0 };
}

function dealerDistribution(dealerCards, options = {}) {
    const rules = rulesOf(options);
    const cards = Array.isArray(dealerCards) ? dealerCards : [dealerCards];
    if (!cards.length) throw new Error("Thiếu lá ngửa của Chamber.");
    const initial = { ...handValue(cards, rules.aceRule), count: Math.min(2, cards.length) };
    const cacheKey = JSON.stringify([cards, rules]);
    if (dealerCache.has(cacheKey)) return [...dealerCache.get(cacheKey)];
    const memo = new Map();
    // Index 0 is bust, followed by dealerStandOn through 21. Keep the
    // standard S17 vector unchanged for independent published-value tests.
    const empty = () => Array(23 - rules.dealerStandOn).fill(0);
    const walk = state => {
        if (state.total > 21) { const terminal = empty(); terminal[0] = 1; return terminal; }
        if (state.total >= rules.dealerStandOn && !(state.total === 17 && state.soft && rules.dealerHitsSoft17)) {
            const terminal = empty();
            terminal[state.total - rules.dealerStandOn + 1] = 1;
            return terminal;
        }
        const key = `${state.total}:${state.soft}:${state.count ?? 2}`;
        if (memo.has(key)) return memo.get(key);
        const result = empty();
        RANKS.forEach((rank, i) => {
            const next = walk(addRank(state, rank, rules.aceRule));
            next.forEach((probability, j) => { result[j] += PROBABILITIES[i] * probability; });
        });
        memo.set(key, result);
        return result;
    };
    let result;
    if (cards.length > 1) result = walk(initial);
    else {
        result = empty();
        let mass = 0;
        RANKS.forEach((rank, i) => {
            const nextState = addRank(initial, rank, rules.aceRule);
            // Peek means an already settled dealer natural has been excluded
            // before the player is offered a decision.
            if (rules.dealerPeek && nextState.total === 21) return;
            mass += PROBABILITIES[i];
            const next = walk(nextState);
            next.forEach((probability, j) => { result[j] += PROBABILITIES[i] * probability; });
        });
        result = result.map(value => value / mass);
    }
    if (dealerCache.size >= 256) dealerCache.clear();
    dealerCache.set(cacheKey, result);
    return [...result];
}

function chooseExpectedAction(cards, dealerCards, options = {}) {
    const rules = rulesOf(options);
    const player = { ...handValue(cards, rules.aceRule), count: Math.min(2, cards.length) };
    if (player.total > 21) throw new Error("Đã quá 21, phải chờ kết quả.");
    const dealer = Array.isArray(dealerCards) ? dealerCards : [dealerCards];
    const probabilities = dealerDistribution(dealer, rules);
    const stand = total => probabilities.reduce((value, probability, index) => {
        const dealerTotal = index + rules.dealerStandOn - 1;
        const payoff = index === 0 ? 1 : total > dealerTotal ? 1 : total < dealerTotal ? -1 : 0;
        return value + probability * payoff;
    }, 0);
    const memo = new Map();
    const best = state => {
        if (state.total > 21) return rules.bothBustPush ? -(1 - probabilities[0]) : -1;
        const key = `${state.total}:${state.soft}:${state.count ?? 2}`;
        if (memo.has(key)) return memo.get(key);
        const standing = stand(state.total);
        const hitting = RANKS.reduce((value, rank, i) => value + PROBABILITIES[i] * best(addRank(state, rank, rules.aceRule)), 0);
        const value = Math.max(standing, hitting);
        memo.set(key, value);
        return value;
    };
    const standEV = stand(player.total);
    let bustRisk = 0;
    const hitEV = RANKS.reduce((value, rank, i) => {
        const next = addRank(player, rank, rules.aceRule);
        if (next.total > 21) bustRisk += PROBABILITIES[i];
        return value + PROBABILITIES[i] * best(next);
    }, 0);
    return {
        action: hitEV > standEV + 1e-12 ? "hit" : "stand",
        total: player.total, soft: player.soft,
        dealer: handValue(dealer, rules.aceRule).total,
        standEV, hitEV, bustRisk, aceRule: rules.aceRule,
        model: "independent_ranks", dealerCards: [...dealer],
        dealerStandOn: rules.dealerStandOn, bothBustPush: rules.bothBustPush,
    };
}

module.exports = { chooseExpectedAction, dealerDistribution, rulesOf };
