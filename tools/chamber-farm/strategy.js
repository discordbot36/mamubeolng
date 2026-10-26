"use strict";

// Multi-deck basic strategy, restricted to Hit / Stand.
// https://wizardofodds.com/games/blackjack/strategy/4-decks/
function handValue(cards, aceRule = "standard") {
    if (!Array.isArray(cards) || cards.length === 0) throw new Error("Không đọc được bài.");
    if (!["standard", "draw_time", "initial_two"].includes(aceRule)) throw new Error("Luật Át không hợp lệ.");
    let aces = 0;
    let total = 0;
    for (const [index, card] of cards.entries()) {
        const rank = String(card).toUpperCase();
        if (rank === "A" || rank === "1") {
            if (aceRule === "initial_two") total += index < 2 && total + 11 <= 21 ? 11 : 1;
            else if (aceRule === "draw_time") total += total + 11 <= 21 ? 11 : 1;
            else { aces++; total += 11; }
        } else if (["J", "Q", "K"].includes(rank)) {
            total += 10;
        } else if (/^(?:[2-9]|10)$/.test(rank)) {
            total += Number(rank);
        } else {
            throw new Error(`Lá bài không hỗ trợ: ${rank}`);
        }
    }
    let softAces = aces;
    while (total > 21 && softAces > 0) {
        total -= 10;
        softAces--;
    }
    return { total, soft: softAces > 0 };
}

function chooseAction(cards, dealerCard) {
    const { total, soft } = handValue(cards);
    const dealer = handValue([dealerCard]).total;
    if (total > 21) throw new Error("Đã quá 21, phải chờ kết quả.");
    let action;
    if (soft) {
        action = total >= 19 || (total === 18 && dealer <= 8) ? "stand" : "hit";
    } else if (total >= 17) {
        action = "stand";
    } else if (total >= 13) {
        action = dealer >= 2 && dealer <= 6 ? "stand" : "hit";
    } else if (total === 12) {
        action = dealer >= 4 && dealer <= 6 ? "stand" : "hit";
    } else {
        action = "hit";
    }
    return { action, total, soft, dealer };
}

function nextBet(current, outcome, base = 1) {
    if (![current, base].every(n => Number.isSafeInteger(n) && n > 0)) {
        throw new Error("Tiền cược phải là số nguyên dương an toàn.");
    }
    if (!["win", "loss", "push", "void"].includes(outcome)) throw new Error("Kết quả không rõ.");
    const value = outcome === "win" ? base : outcome === "loss" ? current * 2 : current;
    if (!Number.isSafeInteger(value)) throw new Error("Tiền cược vượt giới hạn số nguyên an toàn.");
    return value;
}

function bettingPolicy(mode = "martingale", sequence = [1, 2, 3, 5], resetAt = 0) {
    if (!["martingale", "flat", "win_progression"].includes(mode)) throw new Error("BETTING_MODE không hợp lệ.");
    if (!Number.isSafeInteger(resetAt) || resetAt < 0) throw new Error("MARTINGALE_RESET_AT phải là số nguyên không âm.");
    if (mode === "martingale" && resetAt) return { mode, sequence: [], resetAt };
    if (mode !== "win_progression") return { mode, sequence: [] };
    if (!Array.isArray(sequence) || !sequence.length || sequence.length > 32 || sequence[0] !== 1 ||
        sequence.some((n, i) => !Number.isSafeInteger(n) || n < 1 || (i > 0 && n <= sequence[i - 1]))) {
        throw new Error("WIN_BET_SEQUENCE phải là chuỗi số nguyên tăng dần, bắt đầu bằng 1.");
    }
    return { mode, sequence: [...sequence] };
}

function advanceBetting(current, outcome, base, policy = { mode: "martingale" }) {
    if (![current, base].every(n => Number.isSafeInteger(n) && n > 0) ||
        !["win", "loss", "push", "void"].includes(outcome)) throw new Error("Tiền cược/kết quả không hợp lệ.");
    const normalized = bettingPolicy(policy.mode, policy.sequence, policy.resetAt);
    const step = policy.step ?? 0;
    if (!Number.isSafeInteger(step) || step < 0 || (normalized.mode === "win_progression" && step >= normalized.sequence.length)) {
        throw new Error("Vị trí trong chuỗi cược không hợp lệ.");
    }
    if (normalized.mode === "martingale") {
        const reset = outcome === "loss" && normalized.resetAt && current > Math.floor(normalized.resetAt / 2);
        return { nextBet: reset ? base : nextBet(current, outcome, base), step: 0 };
    }
    if (normalized.mode === "flat") return { nextBet: base, step: 0 };
    const expected = base * normalized.sequence[step];
    if (!Number.isSafeInteger(expected) || current !== expected) throw new Error("Tiền cược không khớp bước đã lưu trong chuỗi thắng.");
    const nextStep = outcome === "loss" ? 0 : outcome === "win" ? (step + 1) % normalized.sequence.length : step;
    const following = base * normalized.sequence[nextStep];
    if (!Number.isSafeInteger(following)) throw new Error("Tiền cược vượt giới hạn số nguyên an toàn.");
    return { nextBet: following, step: nextStep };
}

module.exports = { handValue, chooseAction, nextBet, bettingPolicy, advanceBetting };
