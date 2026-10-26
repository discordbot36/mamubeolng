"use strict";

const { handValue } = require("./strategy");

function normalize(value = "") {
    return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

function textOf(message) {
    return [message.content, ...(message.embeds || []).flatMap(embed => [
        embed.author?.name, embed.title, embed.description, ...(embed.fields || []).flatMap(f => [f.name, f.value]),
        embed.footer?.text,
    ])].filter(Boolean).join("\n");
}

function buttonsOf(message) {
    const result = [];
    function visit(components) {
        for (const component of components || []) {
            if (component.customId || component.custom_id) result.push({
                id: component.customId || component.custom_id,
                label: normalize(component.label || "").trim(),
                disabled: Boolean(component.disabled),
            });
            visit(component.components);
        }
    }
    visit(message.components);
    return result;
}

function fingerprint(message) {
    return JSON.stringify([textOf(message), buttonsOf(message)]);
}

function cardsOf(text = "") {
    // Both A♠ and 1♠ are accepted. Strip Discord custom emojis so their IDs
    // cannot accidentally be interpreted as cards.
    const plain = String(text).replace(/<a?:\w+:\d+>/g, "").replace(/[*`_]/g, "");
    return [...plain.matchAll(/(10|[1-9AJQK])\s*[♠♣♥♦♤♧♡♢]/gi)]
        .map(match => match[1].toUpperCase());
}

function scoreOf(text = "") {
    const match = String(text).replace(/[*`_]/g, "").match(/\[\s*(\d{1,2}|\?)\s*\]/);
    return match && match[1] !== "?" ? Number(match[1]) : null;
}

function outcomeOf(text) {
    const plain = normalize(text);
    const found = [];
    if (/\b(?:ban\s+(?:da\s+)?(?:thang|chien thang)|you\s+(?:have\s+)?won|you win)\b/.test(plain)) found.push("win");
    if (/\b(?:ban\s+(?:da\s+)?thua|you\s+(?:have\s+)?lost|you lose)\b/.test(plain)) found.push("loss");
    if (/\b(?:ban\s+(?:da\s+)?hoa|hai ben hoa|hoa nhau|ket qua\s*:?\s*hoa|you\s+(?:have\s+)?tied|it(?:'s| is) a tie)\b/.test(plain) ||
        /(?:^|\n)[^a-z0-9\n]*(?:hoa|push|tie|draw)\s*[!.\s]*(?:$|\n)/.test(plain)) found.push("push");
    // Conflicting outcome wording is never guessed.
    return found.length === 1 ? found[0] : null;
}

function errorOf(text) {
    const plain = normalize(text);
    return /(?:khong du|khong co du|khong co tien|hoan thanh blackjack truoc khi tiep tuc|insufficient|not enough|het (?:gio|thoi gian)|timed? out|cooldown|cho \d|thu lai|try again|captcha|xac minh|verify|toi da|toi thieu|maximum bet|minimum bet|dang choi)/.test(plain);
}

function readHands(message) {
    const fields = (message.embeds || []).flatMap(e => e.fields || []);
    const dealerField = fields.find(f => /\bchamber\b/.test(normalize(f.name)));
    const playerFields = fields.filter(f => f !== dealerField && scoreOf(f.name) !== null && cardsOf(f.value).length);
    if (dealerField && playerFields.length === 1) {
        return {
            dealerCards: cardsOf(dealerField.value),
            playerCards: cardsOf(playerFields[0].value),
            playerScore: scoreOf(playerFields[0].name),
            dealerScore: scoreOf(dealerField.name),
            dealerHidden: /(?:🂠|🃏|❓|\?|hidden|cardback|<a?:\w*back\w*:)/i.test(String(dealerField.value)),
        };
    }
    // Also accept two labeled sections or two columns in an embed description.
    for (const embed of message.embeds || []) {
        const description = String(embed.description || "").replace(/[*`_]/g, "");
        const sections = description.split(/\[[\d?]{1,2}\]/);
        const scoreTokens = [...description.matchAll(/\[(\d{1,2}|\?)\]/g)];
        if (scoreTokens.length !== 2 || !/\bchamber\b/.test(normalize(sections[0]))) continue;
        let dealerCards = cardsOf(sections[1]);
        let playerCards = cardsOf(sections[2]);
        if (!dealerCards.length) {
            const groups = [...sections[2].matchAll(/\|([^|]+)\|/g)];
            if (groups.length === 2) {
                dealerCards = cardsOf(groups[0][1]);
                playerCards = cardsOf(groups[1][1]);
            }
        }
        if (playerCards.length) return {
            dealerCards, playerCards,
            playerScore: scoreTokens[1][1] === "?" ? null : Number(scoreTokens[1][1]),
            dealerScore: scoreTokens[0][1] === "?" ? null : Number(scoreTokens[0][1]),
            dealerHidden: /(?:🂠|🃏|❓|\?|hidden|cardback|<a?:\w*back\w*:)/i.test(sections[1]),
        };
    }
    return null;
}

function parseGame(message, options = {}) {
    const text = textOf(message);
    const refundedBet = refundedWagerOf(message);
    if (refundedBet !== null) return { kind: "result", outcome: "void", refundedBet };
    if (errorOf(text)) {
        const plain = normalize(text);
        const refusal = /\bban khong (?:co|du) tien de choi\b/.test(plain) ? "funds" :
            /\bvui long hoan thanh blackjack truoc khi tiep tuc\b/.test(plain) ? "busy" : null;
        const rejected = Boolean(refusal) && !buttonsOf(message).length && !(message.embeds || []).some(embed => embed.fields?.length);
        return { kind: "error", reason: text, rejected, refusal };
    }
    const outcome = outcomeOf(text);
    if (outcome) return { kind: "result", outcome };
    const buttons = buttonsOf(message).filter(b => !b.disabled);
    const hit = buttons.find(b => ["tiep", "rut bai", "hit"].includes(b.label));
    const stand = buttons.find(b => ["thoi", "dung", "stand"].includes(b.label));
    if (!hit || !stand) return { kind: "waiting" };
    const hands = readHands(message);
    if (!hands) return { kind: "unknown", reason: "Không đọc được hai tay bài trong embed." };
    const computed = handValue(hands.playerCards, options.aceRule);
    if (hands.playerScore === null || computed.total !== hands.playerScore) {
        return { kind: "unknown", reason: `Điểm hiển thị không khớp: Chamber ghi ${hands.playerScore}, mô hình ${options.aceRule || "standard"} tính ${computed.total} từ [${hands.playerCards.join(", ")}].` };
    }
    if (computed.total > 21) return { kind: "waiting" };
    if (hands.dealerCards.length > 1 && !hands.dealerHidden && hands.dealerScore !== null &&
        hands.dealerScore === handValue(hands.dealerCards, options.aceRule).total) {
        return { kind: "active", cards: hands.playerCards, dealerCard: hands.dealerCards[0],
            dealerCards: hands.dealerCards, hit: hit.id, stand: stand.id };
    }
    if (hands.dealerCards.length !== 1) {
        return { kind: "unknown", reason: "Cần đúng một lá ngửa của Chamber để áp dụng basic strategy." };
    }
    return { kind: "active", cards: hands.playerCards, dealerCard: hands.dealerCards[0], hit: hit.id, stand: stand.id };
}

function wagerOf(message) {
    const match = normalize(textOf(message)).match(/\bban cuoc\s+(\d+)(?=\s|[^\da-z.,]|$)/);
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function refundedWagerOf(message) {
    const plain = normalize(textOf(message));
    // Require the explicit completed cancellation and refund receipt, not just
    // a timeout, an advertised refund, or a board that is still actionable.
    if (!/(?:^|\n)\s*blackjack da huy\s*(?:\n|$)/.test(plain) ||
        buttonsOf(message).some(button => !button.disabled) || outcomeOf(plain)) return null;
    const match = plain.match(/(?:^|\n)\s*da hoan tra\s*\*{0,2}(\d+)\s*💵\*{0,2}(?=\s|$)/);
    const value = match ? Number(match[1]) : null;
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

module.exports = { normalize, textOf, buttonsOf, fingerprint, cardsOf, scoreOf, outcomeOf, parseGame, wagerOf, refundedWagerOf, readHands };
