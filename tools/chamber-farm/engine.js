"use strict";

const { chooseExpectedAction } = require("./decision");
const { parseGame, fingerprint, wagerOf, readHands } = require("./parser");
const { setTimeout: sleep } = require("node:timers/promises");

function inspectRound(message, config, store) {
    const game = parseGame(message, config);
    const hands = readHands(message);
    if (game.kind === "result" && game.outcome === "win") {
        game.natural = Boolean(hands && hands.playerCards.length === 2 && hands.playerScore === 21);
        game.winMultiplier = game.natural ? config.naturalWinMultiplier ?? 1 : 1;
    }
    store.record?.("board", { messageId: message.id, kind: game.kind, outcome: game.outcome,
        cards: hands?.playerCards, dealerCards: hands?.dealerCards,
        playerScore: hands?.playerScore, dealerScore: hands?.dealerScore, dealerHidden: hands?.dealerHidden });
    const actualWager = wagerOf(message) ?? game.refundedBet ?? null;
    if (actualWager !== null && actualWager !== store.data.pending.bet) {
        throw new Error(`Chamber hiển thị cược/hoàn trả ${actualWager}, khác cược đã lưu ${store.data.pending.bet}. Cần đối soát, không tự đổi kết quả.`);
    }
    if (game.outcome === "void" && wagerOf(message) !== null && game.refundedBet !== store.data.pending.bet) {
        throw new Error("Số coin hoàn trả không khớp ván đang chờ; cần đối soát.");
    }
    return game;
}

async function recoverRound({ config, store, transport, log = () => {}, diagnose = () => {} }) {
    const pending = store.data.pending;
    if (!pending || (!pending.messageId && !pending.commandNonce)) throw new Error("Không có ID hoặc mã thao tác ván chờ để kiểm tra; không tự đoán kết quả.");
    const message = pending.messageId ? await transport.fetchRound(pending.messageId) : await transport.findCommandReply(pending.commandNonce);
    transport.validate(message);
    if (pending.messageId && message.id !== pending.messageId) throw new Error("Phản hồi khác ID ván đang chờ.");
    if (!pending.messageId && String(message.nonce) !== pending.commandNonce) throw new Error("Phản hồi khác mã thao tác ván đang chờ.");
    diagnose(message);
    const game = inspectRound(message, config, store);
    if (!pending.messageId) {
        pending.messageId = message.id;
        store.save();
        store.record?.("reply_recovered", { messageId: message.id, nonce: pending.commandNonce });
    }
    if (game.kind !== "result") throw new Error("Ván chờ chưa có kết quả/hoàn tiền rõ ràng. Giữ nguyên trạng thái.");
    store.data.paused = true;
    store.settle(game.outcome, config.roundDelayMs, game);
    log(`Đã đối soát ván chờ: ${game.outcome}${game.refundedBet ? `, hoàn trả ${game.refundedBet} coin` : ""}. Chưa mở ván mới; gõ resume khi chạy lại.`);
    return game.outcome;
}

async function playRound({ config, store, transport, log = () => {}, diagnose = () => {}, delay = sleep }) {
    const bet = store.data.nextBet;
    if (config.maxBet && bet > config.maxBet) throw new Error(`Cược ${bet} vượt MAX_BET=${config.maxBet}.`);
    if (config.maxLossStreak && store.data.lossStreak >= config.maxLossStreak) throw new Error("Đã chạm MAX_LOSS_STREAK.");
    transport.checkBet?.(bet);
    store.begin(bet);
    log(`Bắt đầu /${config.blackjackCommand} ${config.moneyOption}:${bet}`);
    let message;
    try { message = await transport.start(bet); }
    catch (error) {
        if (error.interactionRejected === true && !store.data.pending?.messageId &&
            (!error.commandNonce || error.commandNonce === store.data.pending.commandNonce)) {
            const rejected = store.data.pending;
            store.data.pending = null;
            store.save();
            store.record?.("wager_not_accepted", { roundId: rejected.startedAt, bet,
                nonce: rejected.commandNonce, errorCode: error.code,
                reason: "Discord rate limit rejected this attempt; no settlement, stake change or automatic retry" });
        }
        throw error;
    }
    transport.validate(message);
    store.data.pending.messageId = message.id;
    store.save();
    let standing = false;
    let lastActionHand = null;
    for (let actions = 0; actions < 40; actions++) {
        transport.validate(message);
        diagnose(message);
        const game = inspectRound(message, config, store);
        if (game.kind === "result") {
            store.settle(game.outcome, config.roundDelayMs, game);
            log(`Kết quả ${game.outcome}; cược tiếp ${store.data.nextBet}; chuỗi thua ${store.data.lossStreak}.`);
            return game.outcome;
        }
        if (game.kind === "error") {
            if (game.rejected && actions === 0) {
                store.settle("void", config.roundDelayMs);
                if (game.refusal === "busy") throw new Error("Chamber còn một ván blackjack đang chơi. Hoàn thành ván đó trên Discord rồi gõ resume; lệnh mới bị từ chối không được tính là thua.");
                throw new Error("Chamber báo không có tiền để chơi. Chưa mở ván; giữ nguyên cược. Có coin rồi gõ resume.");
            }
            throw new Error("Chamber trả lỗi/từ chối. Xem diagnostic.json và đối soát trước khi tiếp tục.");
        }
        if (game.kind === "unknown") throw new Error(game.reason);
        const before = fingerprint(message);
        const handKey = game.kind === "active" ? JSON.stringify([message.id, game.cards, game.dealerCards || game.dealerCard]) : null;
        if (game.kind === "active" && !standing && handKey !== lastActionHand) {
            const decision = chooseExpectedAction(game.cards, game.dealerCards || game.dealerCard, config);
            log(`${decision.soft ? "Soft" : "Hard"} ${decision.total}, Chamber ${decision.dealer}: ${decision.action === "hit" ? "Tiếp" : "Thôi"}; EV rút=${decision.hitEV.toFixed(4)}, dừng=${decision.standEV.toFixed(4)} (mô hình ${decision.aceRule}).`);
            await delay(config.actionDelayMs);
            // A delayed edit may have ended/changed the hand while waiting.
            const latest = transport.latest(message);
            if (fingerprint(latest) !== before) {
                message = latest;
                continue;
            }
            lastActionHand = handKey;
            store.data.pending.lastDecision = { action: decision.action, cards: [...game.cards],
                dealerCards: decision.dealerCards, aceRule: decision.aceRule, model: decision.model,
                hitEV: decision.hitEV, standEV: decision.standEV, bustRisk: decision.bustRisk };
            Object.assign(store.data.pending.lastDecision, { dealerStandOn: decision.dealerStandOn, bothBustPush: decision.bothBustPush });
            store.save();
            store.record?.("decision", store.data.pending.lastDecision);
            store.record?.("button_attempt", { action: decision.action });
            const response = await transport.click(message, game[decision.action]);
            store.record?.("button_acknowledged", { action: decision.action });
            standing = decision.action === "stand";
            if (response?.id === message.id && fingerprint(response) !== before) {
                message = response;
                continue;
            }
        }
        // Never click the same unchanged board twice, even if Discord acknowledges
        // the button before Chamber edits the message.
        message = await transport.waitForChange(message, before, config.boardTimeoutMs ?? config.responseTimeoutMs);
    }
    throw new Error("Quá nhiều cập nhật trong một ván; cần kiểm tra thủ công.");
}

module.exports = { playRound, recoverRound };
