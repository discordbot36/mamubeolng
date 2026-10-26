"use strict";

function waitForInteraction(client, nonce, timeoutMs, deferred = false, parent) {
    return new Promise((resolve, reject) => {
        let finished = false;
        let failureSeen = false;
        const matches = value => value !== undefined && value !== null && String(value) === String(nonce);
        const cleanup = () => {
            clearTimeout(timer);
            client.off("messageCreate", onResponse);
            client.off("interactionModalCreate", onResponse);
            client.off("unhandledPacket", onPacket);
            client.off("chamberInteractionPostError", onPostError);
            client.decrementMaxListeners?.();
        };
        const finish = (error, value) => {
            if (finished) return;
            finished = true;
            cleanup();
            if (error) reject(error); else resolve(value);
        };
        const onResponse = response => {
            if (matches(response?.nonce)) finish(null, response);
        };
        const onPostError = value => {
            if (matches(value?.nonce)) finish(value.error);
        };
        const onPacket = packet => {
            if (!matches(packet?.d?.nonce)) return;
            if (packet.t === "INTERACTION_FAILURE") {
                // Discord can report failure before the application's late
                // response arrives. Keep the original nonce listener until its
                // deadline; never treat this as proof of no wager or resend it.
                failureSeen = true;
            } else if (packet.t === "INTERACTION_SUCCESS" && deferred && parent) {
                // An acknowledged button may edit its original message later.
                // Return that message now; the engine waits for an actual change.
                finish(null, parent);
            }
        };
        const timer = setTimeout(() => {
            const error = new Error(failureSeen ? "Discord báo thao tác thất bại; hết thời gian chờ vẫn chưa nhận được phản hồi Chamber. Không tự gửi lại." : "Hết thời gian chờ phản hồi đúng thao tác; không tự gửi lại lệnh/cược.");
            error.code = failureSeen ? "INTERACTION_FAILED" : "INTERACTION_TIMEOUT";
            finish(error);
        }, timeoutMs);
        client.incrementMaxListeners?.();
        client.on("messageCreate", onResponse);
        client.on("interactionModalCreate", onResponse);
        client.on("unhandledPacket", onPacket);
        client.on("chamberInteractionPostError", onPostError);
    });
}

function installInteractionWaiter(client, timeoutMs, util = require("discord.js-selfbot-v13/src/util/Util"), onWait = () => {}) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error("Thời gian chờ tương tác không hợp lệ.");
    const original = util.createPromiseInteraction;
    if (typeof original !== "function") throw new Error("Phiên bản thư viện không hỗ trợ bộ chờ tương tác này.");
    // Adapter for the pinned 3.7.1 helper, whose public sendSlash/clickButton
    // paths otherwise hard-code a five-second deadline and delay deferred acks.
    const patched = function (target, nonce, upstreamTimeout, deferred, parent) {
        if (target !== client) return original.call(this, target, nonce, upstreamTimeout, deferred, parent);
        onWait({ nonce: String(nonce), deferred: Boolean(deferred), messageId: parent?.id || null });
        return waitForInteraction(target, nonce, timeoutMs, deferred, parent);
    };
    util.createPromiseInteraction = patched;
    return () => { if (util.createPromiseInteraction === patched) util.createPromiseInteraction = original; };
}

module.exports = { waitForInteraction, installInteractionWaiter };
