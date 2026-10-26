"use strict";

const { setTimeout: sleep } = require("node:timers/promises");
const RateLimitError = require("discord.js-selfbot-v13/src/rest/RateLimitError");

// The pinned SDK discards the Promise from POST /interactions. Catch it on
// this client only and deliver a failure to the waiter for the same nonce.
function installPostGuard(client, { gapMs = 5000, cooldownUntil = 0, audit = () => {}, onCooldown = () => {}, now = Date.now, delay = sleep } = {}) {
    const descriptor = Object.getOwnPropertyDescriptor(client, "api");
    let owner = client, apiDescriptor;
    while (owner && !apiDescriptor) { apiDescriptor = Object.getOwnPropertyDescriptor(owner, "api"); owner = Object.getPrototypeOf(owner); }
    const readApi = () => apiDescriptor?.get ? apiDescriptor.get.call(client) : apiDescriptor?.value;
    const api = readApi();
    if (!api?.interactions?.post) return { waitTurn: async () => {}, restore() {} };
    let blockedUntil = Number.isFinite(cooldownUntil) ? cooldownUntil : 0, lastStarted = -Infinity, tail = Promise.resolve();
    const report = (event, data) => { try { audit(event, data); } catch { /* Reporting must never leak a rejected POST. */ } };
    const cooldown = timeout => {
        const duration = Number.isFinite(timeout) && timeout > 0 ? Math.ceil(timeout) : gapMs;
        blockedUntil = Math.max(blockedUntil, now() + duration);
        try { onCooldown(blockedUntil); } catch { /* Preserve the rejection path even if reporting fails. */ }
        return duration;
    };
    const onRateLimit = data => {
        if (data?.global || data?.route === "/interactions") {
            const retryAfterMs = cooldown(data.timeout);
            report("interaction_cooldown", { retryAfterMs });
        }
    };
    client.on("rateLimit", onRateLimit);
    const guardedPost = (endpoint, options) => {
        const nonce = String(options?.data?.nonce || "");
        let attempted = false;
        const onRequest = request => {
            if (request?.path === "/interactions" && String(request.options?.data?.nonce) === nonce) attempted = true;
        };
        client.on("apiRequest", onRequest);
        // Defer the HTTP call one microtask so the SDK installs its response
        // waiter first. Both synchronous throws and rejected POSTs are handled.
        return Promise.resolve().then(() => endpoint.post(options)).then(
            () => { client.off("apiRequest", onRequest); },
            original => {
                client.off("apiRequest", onRequest);
                const limited = original instanceof RateLimitError && original.route === "/interactions" && String(original.method).toLowerCase() === "post";
                const retryAfterMs = limited ? cooldown(original.timeout) : 0;
                const error = new Error(limited
                    ? `Discord đang giới hạn tốc độ thao tác. Lệnh chưa được chấp nhận; đã tạm dừng. Chờ ít nhất ${Math.ceil(retryAfterMs / 1000)} giây trước khi tiếp tục.`
                    : "Gửi thao tác Discord gặp lỗi; chưa xác định được kết quả. Giữ ván chờ, không tự gửi lại.");
                error.code = limited ? "INTERACTION_RATE_LIMIT" : "INTERACTION_POST_ERROR";
                // In this pinned SDK RateLimitError is raised before sending,
                // or for an explicit HTTP 429. Neither accepts the interaction.
                error.interactionRejected = limited;
                error.commandNonce = nonce;
                error.retryAfterMs = retryAfterMs;
                report("interaction_post_rejected", { nonce, errorCode: error.code, retryAfterMs,
                    source: attempted ? "http" : "preflight" });
                client.emit("chamberInteractionPostError", { nonce, error });
            });
    };
    // APIRouter mutates its path on each property access. Preserve the original
    // getter's fresh root per access; retaining one API root corrupts later URLs.
    Object.defineProperty(client, "api", { configurable: true, get() {
        return new Proxy(readApi(), { get(target, key) {
            const value = Reflect.get(target, key);
            if (key !== "interactions") return value;
            return new Proxy(value, { get(endpoint, method) {
                return method === "post" ? options => guardedPost(endpoint, options) : Reflect.get(endpoint, method);
            } });
        } });
    } });
    return {
        waitTurn() {
            const turn = tail.then(async () => {
                const waitMs = Math.max(0, blockedUntil - now(), lastStarted + gapMs - now());
                if (waitMs > 10000) {
                    const error = new Error(`Discord yêu cầu chờ thêm ${Math.ceil(waitMs / 1000)} giây. Đã tạm dừng trước khi gửi thao tác.`);
                    error.code = "INTERACTION_COOLDOWN";
                    error.interactionRejected = true;
                    error.retryAfterMs = waitMs;
                    throw error;
                }
                if (waitMs) {
                    report("interaction_spacing", { timeoutMs: waitMs });
                    await delay(waitMs);
                }
                // A new rate-limit signal may arrive while spacing a request.
                if (blockedUntil > now()) {
                    const error = new Error("Discord vẫn đang giới hạn thao tác. Chưa gửi lệnh; chờ rồi tiếp tục.");
                    error.code = "INTERACTION_COOLDOWN";
                    error.interactionRejected = true;
                    error.retryAfterMs = blockedUntil - now();
                    throw error;
                }
                lastStarted = now();
            });
            tail = turn.catch(() => {});
            return turn;
        },
        restore() {
            client.off("rateLimit", onRateLimit);
            if (descriptor) Object.defineProperty(client, "api", descriptor);
            else delete client.api;
        },
    };
}

module.exports = { installPostGuard };
