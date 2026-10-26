"use strict";

// Local browser QA only. This file is excluded from the executable and never
// loads credentials, logs into Discord, or writes the user's live state.
const { createUiServer } = require("../ui-server");
const { startSession, settleSession, creditDaily, refreshWallet } = require("../session");
const state = { ready: true, connected: true, paused: true, busy: false, pending: null,
    rounds: 6, nextBet: 1, baseBet: 1, maxBet: 50, stopping: false,
    today: "2026-10-24", daily: null, betting: { mode: "martingale", sequence: [], resetAt: 32, step: 0 },
    session: startSession(1000, "demo-wallet"), logs: ["BẢN KIỂM THỬ GIAO DIỆN · không kết nối Discord", "Đã lấy số dư mẫu 1.000 coin."] };
for (const [i, outcome] of ["win", "win", "loss", "win", "push", "win"].entries()) settleSession(state.session, outcome, [1, 2, 3, 1, 2, 2][i], "demo-" + i);
const controller = { status: () => structuredClone(state), command: async (action, args) => {
    if (action === "pause") state.paused = true;
    else if (action === "start") state.paused = false;
    else if (action === "base") {
        if (!state.paused) throw new Error("Tạm dừng trước khi đổi cược.");
        if (args.base > 50) throw new Error("Vượt trần 50 coin.");
        state.baseBet = args.base; state.nextBet = args.base;
    } else if (action === "daily") {
        creditDaily(state.session, 10, "demo-daily"); state.daily = { date: state.today, status: "confirmed", reward: 10 };
    } else if (action === "account") refreshWallet(state.session, state.session.balance, "demo-wallet-refresh");
    else if (action === "disconnect") { state.connected = false; state.ready = false; state.paused = true; }
    state.logs.push("Đã kiểm thử nút: " + action);
    return structuredClone(state);
} };
createUiServer(controller).then(app => {
    console.log(app.url);
    process.once("SIGINT", () => app.close().then(() => process.exit(0)));
}).catch(error => { console.error(error.message); process.exit(1); });
