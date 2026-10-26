"use strict";

const { randomUUID } = require("node:crypto");
const { normalize, textOf } = require("./parser");

function coinAmount(value) {
    const plain = String(value).replace(/[*`_]/g, "").trim();
    const match = plain.match(/^(\d{1,3}(?:[.,]\d{3})+|\d+)\s*💵$/u);
    if (!match) return null;
    const amount = Number(match[1].replace(/[.,]/g, ""));
    return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function walletBalance(message) {
    const fields = (message.embeds || []).flatMap(embed => embed.fields || []);
    const wallets = fields.filter(field => normalize(field.name).replace(/[^a-z ]/g, "").trim() === "vi tien");
    return wallets.length === 1 ? coinAmount(wallets[0].value) : null;
}

function dailyReceipt(message) {
    const plain = normalize(textOf(message)).replace(/[*`_]/g, "");
    if (/(?:da diem danh hom nay|da diem danh roi|already (?:checked|claimed))/.test(plain)) return { kind: "already", reward: 0 };
    if (!/(?:chuc mung|diem danh thanh cong|thong qua diem danh)/.test(plain)) return null;
    const match = plain.match(/\bban\s+(?:da\s+)?nhan\s+(?:duoc\s+)?(\d{1,3}(?:[.,]\d{3})+|\d+)\s*💵/u);
    if (!match) return null;
    const reward = coinAmount(match[1] + " 💵");
    return reward === null ? null : { kind: "success", reward };
}

function startSession(balance, messageId, now = new Date().toISOString()) {
    if (!Number.isSafeInteger(balance) || balance < 0) throw new Error("Số dư /taikhoan không hợp lệ.");
    return { id: randomUUID(), startedAt: now, initialBalance: balance, balance,
        verifiedBalance: balance, verifiedAt: now, walletMessageId: messageId, estimated: false,
        netBlackjack: 0, dailyCredits: 0, adjustments: 0,
        rounds: 0, wins: 0, losses: 0, pushes: 0, history: [], creditedDaily: [] };
}

function refreshWallet(session, balance, messageId, now = new Date().toISOString()) {
    if (!Number.isSafeInteger(balance) || balance < 0) throw new Error("Số dư /taikhoan không hợp lệ.");
    session.adjustments += balance - session.balance;
    session.balance = balance;
    session.verifiedBalance = balance;
    session.verifiedAt = now;
    session.walletMessageId = messageId;
    session.estimated = false;
}

function settleSession(session, outcome, bet, messageId, now = new Date().toISOString(), details = {}) {
    if (!session) return;
    const winMultiplier = details.natural ? details.winMultiplier ?? 1 : 1;
    if (![1, 2].includes(winMultiplier)) throw new Error("Hệ số thưởng blackjack không hợp lệ.");
    const delta = outcome === "win" ? bet * winMultiplier : outcome === "loss" ? -bet : 0;
    session.balance += delta;
    session.netBlackjack += delta;
    // Ordinary wins use 1:1. A two-card 21 uses the configured observed payout;
    // all amounts still remain estimates until /taikhoan confirms the wallet.
    if (outcome === "win" || outcome === "loss") session.estimated = true;
    if (outcome !== "void") session.rounds++;
    if (outcome === "win") session.wins++;
    if (outcome === "loss") session.losses++;
    if (outcome === "push") session.pushes++;
    session.history.push({ at: now, kind: "blackjack", outcome, bet, delta, balance: session.balance, messageId,
        natural: Boolean(details.natural), winMultiplier });
    session.history = session.history.slice(-50);
}

function creditDaily(session, reward, messageId, now = new Date().toISOString()) {
    if (!session || session.creditedDaily.includes(messageId)) return;
    if (!Number.isSafeInteger(reward) || reward < 0) throw new Error("Thưởng điểm danh không hợp lệ.");
    session.balance += reward;
    session.dailyCredits += reward;
    session.estimated = true;
    session.creditedDaily.push(messageId);
    session.creditedDaily = session.creditedDaily.slice(-30);
    session.history.push({ at: now, kind: "daily", delta: reward, balance: session.balance, messageId });
    session.history = session.history.slice(-50);
}

module.exports = { coinAmount, walletBalance, dailyReceipt, startSession, refreshWallet, settleSession, creditDaily };
