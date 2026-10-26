"use strict";
const fs = require("node:fs");
const state = JSON.parse(fs.readFileSync("/var/lib/chamber-farm/state.json", "utf8"));
console.log(JSON.stringify({
    paused: state.paused, nextBet: state.nextBet, baseBet: state.baseBet,
    betting: state.betting, lossStreak: state.lossStreak, rounds: state.rounds,
    pending: state.pending ? { bet: state.pending.bet, startedAt: state.pending.startedAt,
        messageId: state.pending.messageId } : null,
    session: state.session ? { balance: state.session.balance, estimated: state.session.estimated,
        verifiedBalance: state.session.verifiedBalance, verifiedAt: state.session.verifiedAt,
        initialBalance: state.session.initialBalance, netBlackjack: state.session.netBlackjack,
        rounds: state.session.rounds, wins: state.session.wins, losses: state.session.losses, pushes: state.session.pushes } : null,
    lastError: state.lastError || null, daily: state.daily ? { date: state.daily.date, status: state.daily.status } : null,
}, null, 2));
