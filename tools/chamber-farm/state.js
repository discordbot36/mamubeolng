"use strict";

const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const os = require("node:os");
const { createHash, randomUUID } = require("node:crypto");
const { bettingPolicy, advanceBetting } = require("./strategy");
const { settleSession } = require("./session");

class StateStore {
    constructor(file, baseBet) {
        this.file = file;
        if (fs.existsSync(file)) {
            this.data = JSON.parse(fs.readFileSync(file, "utf8"));
            const data = this.data;
            if (data.version !== 1 || data.baseBet !== baseBet || !Number.isSafeInteger(data.nextBet) || data.nextBet < 1 ||
                !Number.isSafeInteger(data.lossStreak) || data.lossStreak < 0 ||
                !Number.isSafeInteger(data.rounds) || data.rounds < 0 ||
                !Number.isFinite(data.nextRoundAt) || data.nextRoundAt < 0 ||
                (data.pending && (!Number.isSafeInteger(data.pending.bet) || data.pending.bet < 1))) {
                throw new Error("state.json không hợp lệ hoặc BASE_BET đã đổi. Kiểm tra trạng thái trước khi chạy.");
            }
            if (data.betting) advanceBetting(data.nextBet, "push", baseBet, data.betting);
            if (data.pendingBettingChange) bettingPolicy(data.pendingBettingChange.mode, data.pendingBettingChange.sequence, data.pendingBettingChange.resetAt);
        } else {
            this.data = {
                version: 1, baseBet, nextBet: baseBet, lossStreak: 0, rounds: 0,
                pending: null, daily: null, paused: false, nextRoundAt: 0,
            };
        }
    }

    save() {
        const temporary = `${this.file}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify(this.data, null, 2) + "\n", { mode: 0o600 });
        fs.renameSync(temporary, this.file);
        this.onSave?.();
    }

    record(event, details = {}) {
        // Structured evidence only: never serialize messages, clients, configs,
        // request objects, headers, or arbitrary unknown fields into the log.
        const allowed = ["roundId", "messageId", "bet", "nextBet", "outcome", "kind", "cards", "dealerCards",
            "playerScore", "dealerScore", "dealerHidden", "action", "aceRule", "hitEV", "standEV",
            "bustRisk", "elapsedMs", "attempt", "source", "timeoutMs", "errorCode", "reason", "balance", "reward",
            "baseBet", "previousBaseBet", "natural", "winMultiplier", "netDelta", "dealerStandOn", "bothBustPush", "nonce", "retryAfterMs"];
        const entry = { version: 1, at: new Date().toISOString(), event,
            sessionId: this.data.session?.id || null,
            roundId: this.data.pending?.startedAt || null,
            messageId: this.data.pending?.messageId || null, bet: this.data.pending?.bet || null };
        for (const key of allowed) if (details[key] !== undefined) entry[key] = details[key];
        fs.appendFileSync(path.join(path.dirname(this.file), "rounds.jsonl"), JSON.stringify(entry) + "\n", { mode: 0o600 });
    }

    configureBetting(mode, sequence, resetAt = 0) {
        const requested = bettingPolicy(mode, sequence, resetAt);
        const active = bettingPolicy(this.data.betting?.mode, this.data.betting?.sequence, this.data.betting?.resetAt);
        if (JSON.stringify(active) === JSON.stringify(requested)) {
            this.data.betting = { ...active, step: this.data.betting?.step ?? 0 };
            delete this.data.pendingBettingChange;
            return { changed: false, deferred: false };
        }
        if (this.data.pending) {
            this.data.betting = { ...active, step: this.data.betting?.step ?? 0 };
            this.data.pendingBettingChange = requested;
            return { changed: true, deferred: true };
        }
        this.applyBetting(requested);
        return { changed: true, deferred: false };
    }

    applyBetting(policy) {
        this.data.betting = { ...policy, sequence: [...policy.sequence], step: 0 };
        this.data.nextBet = this.data.baseBet;
        delete this.data.pendingBettingChange;
    }

    begin(bet) {
        if (this.data.pending) throw new Error("Ván trước chưa xác định kết quả.");
        this.data.pending = { bet, startedAt: new Date().toISOString(), messageId: null };
        this.save(); // Persist BEFORE sending a command that may spend coins.
        this.record("wager_attempt");
    }

    settle(outcome, delayMs, details = {}) {
        if (!this.data.pending) throw new Error("Không có ván chờ đối soát.");
        const bet = this.data.pending.bet;
        const roundId = this.data.pending.startedAt;
        const activePolicy = this.data.betting || { mode: "martingale", step: 0 };
        // Do not change the policy of an in-flight or unresolved stake.
        const following = advanceBetting(bet, outcome, this.data.baseBet, activePolicy);
        const winMultiplier = details.natural ? details.winMultiplier ?? 1 : 1;
        if (![1, 2].includes(winMultiplier)) throw new Error("Hệ số thưởng blackjack không hợp lệ.");
        this.data.nextBet = following.nextBet;
        this.data.betting = { ...bettingPolicy(activePolicy.mode, activePolicy.sequence, activePolicy.resetAt), step: following.step };
        this.data.lossStreak = outcome === "loss" ? this.data.lossStreak + 1 : outcome === "win" ? 0 : this.data.lossStreak;
        if (outcome !== "void") this.data.rounds++;
        this.data.lastResult = { outcome, bet, messageId: this.data.pending.messageId,
            bettingMode: activePolicy.mode, decision: this.data.pending.lastDecision,
            natural: Boolean(details.natural), winMultiplier,
            at: new Date().toISOString() };
        settleSession(this.data.session, outcome, bet, this.data.pending.messageId, undefined, details);
        this.data.pending = null;
        if (this.data.pendingBettingChange) this.applyBetting(this.data.pendingBettingChange);
        this.data.nextRoundAt = Date.now() + delayMs;
        this.save();
        this.record("settlement", { roundId, messageId: this.data.lastResult.messageId, bet, outcome,
            natural: Boolean(details.natural), winMultiplier,
            netDelta: outcome === "win" ? bet * winMultiplier : outcome === "loss" ? -bet : 0,
            nextBet: this.data.nextBet });
    }

    bind(accountId, channelId, botId) {
        const identity = { accountId, channelId, botId };
        if (this.data.identity && JSON.stringify(this.data.identity) !== JSON.stringify(identity)) {
            throw new Error("state.json thuộc tài khoản/kênh/bot khác. Dùng thư mục cấu hình riêng.");
        }
        this.data.identity = identity;
        this.save();
    }
}

async function acquireLock(directory) {
    const file = path.join(directory, "runner.lock");
    const canonicalDirectory = fs.realpathSync(directory);
    const key = createHash("sha256").update(process.platform === "win32"
        ? canonicalDirectory.toLowerCase() : canonicalDirectory).digest("hex").slice(0, 32);
    // Windows named pipes and Linux abstract sockets disappear when the process
    // dies. The OS, rather than a leftover file, owns the single-instance guard.
    const endpoint = process.platform === "win32" ? `\\\\.\\pipe\\chamber-farm-${key}`
        : process.platform === "linux" ? `\0chamber-farm-${key}` : path.join(os.tmpdir(), `chamber-farm-${key}.sock`);
    const guard = net.createServer(socket => socket.destroy());
    const closeGuard = () => guard.listening ? new Promise(resolve => guard.close(resolve)) : Promise.resolve();
    const busyError = pid => new Error(`Bot đang chạy${pid ? ` (PID ${pid})` : " ở cửa sổ khác"}. Đóng phiên đó trước khi mở thêm.`);
    let created = false;
    const lockId = randomUUID();
    try {
        await new Promise((resolve, reject) => {
            guard.once("error", reject);
            guard.listen(endpoint, () => {
                guard.off("error", reject);
                resolve();
            });
        });
        guard.unref();
        if (fs.existsSync(file)) {
            const previous = fs.readFileSync(file, "utf8").trim();
            let pid;
            try { pid = /^\d+$/.test(previous) ? Number(previous) : JSON.parse(previous).pid; }
            catch { /* An invalid legacy file must be reviewed, never guessed. */ }
            if (!Number.isSafeInteger(pid) || pid < 1 || pid > 0x7fffffff) {
                throw new Error("runner.lock không có PID hợp lệ. Cần kiểm tra file khóa trước khi chạy.");
            }
            try {
                process.kill(pid, 0);
                throw busyError(pid);
            } catch (error) {
                // EPERM or another unexpected error is not proof that a process
                // has died. Only ESRCH allows reclaiming a legacy lock.
                if (error.code !== "ESRCH") throw error;
            }
            fs.unlinkSync(file);
        }
        const handle = fs.openSync(file, "wx", 0o600);
        created = true;
        try { fs.writeFileSync(handle, JSON.stringify({ version: 2, pid: process.pid, lockId }) + "\n"); }
        finally { fs.closeSync(handle); }
    } catch (error) {
        if (created) fs.rmSync(file, { force: true });
        await closeGuard();
        if (error.code === "EADDRINUSE" || error.code === "EEXIST") throw busyError();
        throw error;
    }
    let releasePromise;
    return () => {
        if (releasePromise) return releasePromise;
        try {
            const current = JSON.parse(fs.readFileSync(file, "utf8"));
            if (current.lockId === lockId) fs.unlinkSync(file);
        } catch (error) {
            if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
        } finally { releasePromise = closeGuard(); }
        return releasePromise;
    };
}

module.exports = { StateStore, acquireLock };
