"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { fork } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { runtimeConfig } = require("./betting-controls");
const { StateStore } = require("./state");
const { localClock } = require("./config");

class UiController extends EventEmitter {
    constructor(directory, options = {}) {
        super();
        this.directory = directory;
        this.env = options.env || process.env;
        this.workerFactory = options.workerFactory || (() => fork(path.join(__dirname, "index.js"), ["--managed"], {
            cwd: directory, execArgv: ["--env-file=" + path.join(directory, ".env")],
            env: { ...process.env, CHAMBER_DATA_DIR: directory },
            windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"],
        }));
        this.worker = null;
        this.connecting = null;
        this.waiters = new Map();
        this.logs = [];
        this.current = null;
        this.connectError = null;
        this.inFlight = false;
        this.readDisk();
    }

    readDisk() {
        const config = runtimeConfig(this.env, this.directory);
        const store = new StateStore(path.join(this.directory, "state.json"), config.baseBet);
        const data = store.data;
        this.current = { ready: false, busy: false, stopping: false, paused: data.paused,
            pending: data.pending, rounds: data.rounds, lossStreak: data.lossStreak,
            nextBet: data.nextBet, baseBet: data.baseBet, maxBet: config.maxBet || 50,
            betting: data.betting || { mode: config.bettingMode, sequence: config.winBetSequence, resetAt: config.martingaleResetAt, step: 0 },
            session: data.session || null, daily: data.daily || null, lastError: data.lastError || null,
            today: localClock(new Date(), config.timezone).date, nextRoundAt: data.nextRoundAt };
        this.current.interactionCooldownUntil = data.interactionCooldownUntil || 0;
    }

    status() {
        return { ...this.current, connected: !!this.worker && this.current.ready,
            connecting: !!this.connecting, commandPending: this.inFlight, connectionError: this.connectError,
            logs: this.logs.slice(-80) };
    }

    addLog(text) {
        if (typeof text !== "string") return;
        this.logs.push(text.slice(0, 1800));
        this.logs = this.logs.slice(-100);
        this.emit("change");
    }

    connect() {
        if (this.worker && this.current.ready) return Promise.resolve();
        if (this.connecting) return this.connecting;
        if (this.worker) return Promise.reject(new Error("Tiến trình trước vẫn đang kết nối/kết thúc. Chờ hoàn tất trước khi mở phiên mới."));
        this.connectError = null;
        const worker = this.workerFactory();
        this.worker = worker;
        this.current.ready = false;
        worker.stderr?.on("data", value => this.addLog(String(value).trim()));
        // stdout duplicates structured log events. Read it to avoid pipe backpressure.
        worker.stdout?.resume();
        worker.on("message", message => {
            if (message?.type === "status" && message.status) {
                this.current = message.status;
                if (this.current.ready) this.emit("worker-ready");
            } else if (message?.type === "log") this.addLog(message.text);
            else if (message?.type === "response") {
                if (message.status) this.current = message.status;
                const waiter = this.waiters.get(message.id);
                if (waiter) {
                    this.waiters.delete(message.id);
                    clearTimeout(waiter.timer);
                    if (message.ok) waiter.resolve(this.status());
                    else waiter.reject(new Error(message.error || "Thao tác chưa hoàn tất."));
                }
            }
            this.emit("change");
        });
        worker.once("exit", () => {
            if (this.worker !== worker) return;
            this.worker = null;
            this.current.ready = false;
            this.current.busy = false;
            this.current.stopping = false;
            this.current.paused = true;
            const error = new Error("Phiên bot đã đóng. Mở kết nối lại để tiếp tục.");
            for (const waiter of this.waiters.values()) { clearTimeout(waiter.timer); waiter.reject(error); }
            this.waiters.clear();
            this.emit("worker-exit");
            this.emit("change");
        });
        this.connecting = new Promise((resolve, reject) => {
            const cleanup = () => {
                clearTimeout(timer);
                this.off("worker-ready", ready);
                this.off("worker-exit", exited);
                worker.off("error", failed);
            };
            const ready = () => { cleanup(); resolve(); };
            const exited = () => { cleanup(); reject(new Error(this.logs.at(-1) || "Không kết nối được bot. Có thể một cửa sổ cũ vẫn đang chạy.")); };
            const failed = error => { cleanup(); if (this.worker === worker) this.worker = null; reject(error); };
            const timer = setTimeout(() => { cleanup(); reject(new Error("Kết nối Discord quá thời gian. Bot chưa được yêu cầu đặt cược.")); }, 70000);
            this.once("worker-ready", ready);
            this.once("worker-exit", exited);
            worker.once("error", failed);
        }).catch(error => { this.connectError = error.message; throw error; }).finally(() => {
            this.connecting = null;
            this.emit("change");
        });
        this.emit("change");
        return this.connecting;
    }

    send(command, args = {}) {
        if (!this.worker?.connected || !this.current.ready) return Promise.reject(new Error("Chưa kết nối Discord."));
        const id = randomUUID();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.waiters.delete(id);
                reject(new Error("Thao tác đang chờ phản hồi. Không tự gửi lại; kiểm tra trạng thái hoặc Đối soát ván."));
            }, 180000);
            this.waiters.set(id, { resolve, reject, timer });
            this.worker.send({ type: "command", id, command, args }, error => {
                if (!error || !this.waiters.has(id)) return;
                clearTimeout(timer);
                this.waiters.delete(id);
                reject(new Error("Kết nối điều khiển đã đóng; kiểm tra trạng thái trước khi thử lại."));
            });
        });
    }

    async command(action, args = {}) {
        const mapping = { start: "resume", pause: "pause", account: "account", daily: "daily", recover: "recover", base: "base", disconnect: "quit" };
        if (!Object.hasOwn(mapping, action)) throw new Error("Nút điều khiển không hợp lệ.");
        if (action === "pause" && this.worker?.connected && this.current.ready) return this.send("pause");
        if (this.inFlight) throw new Error("Đang xử lý thao tác trước, vui lòng chờ.");
        if (action === "base" && (!Number.isSafeInteger(args.base) || args.base < 1)) throw new Error("Cược gốc phải là số nguyên từ 1.");
        this.inFlight = true;
        this.emit("change");
        try {
            await this.connect();
            return await this.send(mapping[action], action === "base" ? { base: args.base } : {});
        } finally { this.inFlight = false; this.emit("change"); }
    }

    async close() {
        if (!this.worker) return;
        const worker = this.worker;
        const exited = new Promise(resolve => worker.once("exit", resolve));
        if (this.current.ready && worker.connected) await this.send("quit");
        else if (worker.connected) worker.disconnect();
        // Let an in-flight round finish; never kill it to close a browser tab.
        await exited;
    }
}

module.exports = { UiController };
