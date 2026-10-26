"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { readConfig } = require("./config");
const { bettingPolicy } = require("./strategy");

function runtimeConfig(env, directory) {
    let base = env.BASE_BET;
    const file = path.join(directory, "state.json");
    if (fs.existsSync(file)) {
        const state = JSON.parse(fs.readFileSync(file, "utf8"));
        if (state.uiBettingOverride === true) {
            if (!Number.isSafeInteger(state.baseBet) || state.baseBet < 1) throw new Error("Mức cược đã lưu trong giao diện không hợp lệ.");
            base = String(state.baseBet);
        }
    }
    return readConfig({ ...env, ...(base === undefined ? {} : { BASE_BET: base }) });
}

function bettingPreview(base, sequence, balance, maxBet = 50, percent = 1, mode = "win_progression", resetAt = 0) {
    if (!Number.isSafeInteger(base) || base < 1) throw new Error("Cược gốc phải là số nguyên từ 1.");
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) throw new Error("Tỷ lệ vốn phải lớn hơn 0 và không quá 100%.");
    const policy = bettingPolicy(mode, sequence, resetAt);
    const ceiling = policy.resetAt ? Math.min(maxBet, policy.resetAt) : maxBet;
    const stakes = mode === "martingale" ? [base] : mode === "flat" ? [base] : policy.sequence.map(n => n * base);
    if (mode === "martingale") {
        while (stakes.at(-1) <= Math.floor(ceiling / 2)) stakes.push(stakes.at(-1) * 2);
    }
    if (stakes.some(n => !Number.isSafeInteger(n))) throw new Error("Mức cược quá lớn.");
    const maximum = stakes.at(-1);
    const known = Number.isSafeInteger(balance) && balance >= 0;
    const factor = mode === "win_progression" ? policy.sequence.at(-1) : 1;
    const largestBase = Math.floor(ceiling / factor);
    // For Martingale this is a base-stake budget, not a claim that the whole
    // doubling cycle is covered by that percentage.
    const suggestedBase = known ? Math.min(largestBase, Math.floor(balance * percent / 100 / factor)) : null;
    const resets = mode === "martingale" && policy.resetAt && maximum > Math.floor(policy.resetAt / 2);
    return { base, mode, stakes, maximum, allowed: maximum <= ceiling, maxBet, ceiling, resetAt: policy.resetAt || 0,
        cycleCapital: stakes.reduce((sum, stake) => sum + stake, 0),
        blockedNext: mode === "martingale" && !resets ? maximum * 2 : null,
        resetTo: resets ? base : null,
        riskPercent: known && balance > 0 ? maximum / balance * 100 : null,
        targetPercent: percent, suggestedBase: suggestedBase && suggestedBase >= 1 ? suggestedBase : null,
        minimumCapital: Math.ceil(maximum * 100 / percent) };
}

function changeBaseBet(store, config, base, busy = false, transport) {
    if (busy || !store.data.paused || store.data.pending) throw new Error("Tạm dừng và chờ hết ván hiện tại trước khi đổi cược.");
    const preview = bettingPreview(base, config.winBetSequence, store.data.session?.balance, config.maxBet || 50, 1, config.bettingMode, config.martingaleResetAt);
    if (!preview.allowed) throw new Error(`Cược lớn nhất ${preview.maximum} vượt trần ${preview.ceiling} coin.`);
    preview.stakes.forEach(bet => transport?.checkBet?.(bet));
    const previous = store.data.baseBet;
    store.data.baseBet = base;
    store.data.uiBettingOverride = true;
    store.applyBetting(bettingPolicy(config.bettingMode, config.winBetSequence, config.martingaleResetAt));
    delete store.data.lastError;
    store.save();
    config.baseBet = base;
    store.record("betting_changed", { baseBet: base, previousBaseBet: previous });
    return preview;
}

module.exports = { runtimeConfig, bettingPreview, changeBaseBet };
