"use strict";

const { fingerprint, textOf, buttonsOf } = require("./parser");
const { walletBalance, dailyReceipt } = require("./session");

class DiscordTransport {
    constructor(client, channel, config, dailyChannel = channel) {
        this.client = client;
        this.channel = channel;
        this.config = config;
        this.dailyChannel = dailyChannel;
        this.audit = () => {};
        this.pendingReads = new Map();
        this.pace = async () => {};
    }

    async prepare() {
        const data = await this.loadCatalog(this.channel);
        this.catalog = data;
        const application = data.applications.find(a => a.id === this.config.botId || a.bot_id === this.config.botId);
        if (!application) throw new Error("Không tìm thấy Chamber trong kênh này. Kiểm tra CHAMBER_BOT_ID và CHANNEL_ID.");
        this.applicationId = application.id;
        this.authorId = application.bot_id || this.config.botId;
        const getCommand = name => data.application_commands.find(c =>
            c.application_id === application.id && [c.name, c.name_default].includes(name) && c.type === 1);
        this.blackjack = getCommand(this.config.blackjackCommand);
        if (!this.blackjack) throw new Error("Không tìm thấy slash command blackjack.");
        this.moneyIndex = (this.blackjack.options || []).findIndex(o =>
            [o.name, o.name_default].includes(this.config.moneyOption));
        this.money = this.blackjack.options?.[this.moneyIndex];
        this.accountCommand = this.config.accountCommand ? getCommand(this.config.accountCommand) : null;
        if (!this.money || ![3, 4, 10].includes(this.money.type) || this.money.choices?.length) {
            throw new Error("Option money không phải kiểu số/chuỗi tự do được hỗ trợ.");
        }
        if (this.blackjack.options.some((o, i) => i !== this.moneyIndex && o.required)) {
            throw new Error("Blackjack có thêm option bắt buộc; cần cập nhật cấu hình gửi lệnh.");
        }
        if (this.config.dailyEnabled) {
            // Discord indexes commands per guild. Re-reading that same index for
            // another channel immediately can hit a rate limit. The upstream
            // search helper hides that error by returning an empty command list.
            const sameGuild = this.channel.guild?.id && this.channel.guild.id === this.dailyChannel.guild?.id;
            const dailyData = this.dailyChannel === this.channel || sameGuild
                ? data : await this.loadCatalog(this.dailyChannel);
            this.dailyCatalog = dailyData;
            const daily = dailyData.application_commands.find(c => c.application_id === application.id &&
                [c.name, c.name_default].includes(this.config.dailyCommand) && c.type === 1);
            if (!daily) throw new Error(`Không tìm thấy /${this.config.dailyCommand} của Chamber trong danh sách lệnh.`);
            if (daily.options?.some(o => o.required)) throw new Error(`/${this.config.dailyCommand} có tham số bắt buộc chưa được hỗ trợ.`);
        }
    }

    async loadCatalog(channel) {
        if (!this.client.api || !channel.guild?.id) return channel.searchInteraction();
        try {
            // Chamber is installed in this guild, so a user-app index is not
            // needed. Read directly so HTTP/rate-limit errors are not swallowed.
            return await this.client.api.guilds[channel.guild.id]["application-command-index"].get();
        } catch (error) {
            if (error.name === "RateLimitError") {
                throw new Error("Discord đang giới hạn lượt đọc danh sách lệnh. Đợi một lúc rồi chạy lại; chưa gửi cược.");
            }
            throw error;
        }
    }

    async sendCommand(channel, catalog, name, ...args) {
        await this.pace();
        // Upstream sendSlash normally re-fetches the guild index on EVERY call.
        // Give that invocation an inherited channel with its validated snapshot.
        // Actual channel/message objects and the dependency remain unchanged.
        const context = Object.create(channel, {
            searchInteraction: { value: async () => catalog },
        });
        return channel.sendSlash.call(context, this.applicationId, name, ...args);
    }

    checkBet(bet) {
        if (this.money.min_value !== undefined && bet < this.money.min_value) throw new Error(`Server yêu cầu cược tối thiểu ${this.money.min_value}.`);
        if (this.money.max_value !== undefined && bet > this.money.max_value) throw new Error(`Server giới hạn cược tối đa ${this.money.max_value}.`);
    }

    start(bet) {
        const args = Array(this.moneyIndex + 1).fill(undefined);
        args[this.moneyIndex] = this.money.type === 3 ? String(bet) : bet;
        return this.sendCommand(this.channel, this.catalog, this.config.blackjackCommand, ...args);
    }

    daily() {
        return this.sendCommand(this.dailyChannel, this.dailyCatalog, this.config.dailyCommand);
    }

    async waitParsed(message, read, expectedChannel = this.channel, deadline = Date.now() + (this.config.boardTimeoutMs || 75000)) {
        deadline = Math.min(deadline, Date.now() + (this.config.boardTimeoutMs || 75000));
        while (true) {
            this.validate(message, expectedChannel);
            const value = read(message);
            if (value !== null) return { message, value };
            const remaining = deadline - Date.now();
            if (remaining <= 0) throw new Error("Chamber chưa trả nội dung đầy đủ. Không tự gửi lại lệnh.");
            message = await this.waitForChange(message, fingerprint(message), remaining, expectedChannel);
        }
    }

    async account() {
        if (!this.accountCommand || this.accountCommand.options?.some(option => option.required)) {
            throw new Error("Không tìm thấy /taikhoan không tham số của Chamber trong kênh này.");
        }
        const timeoutMs = this.config.walletTimeoutMs || 20000;
        const deadline = Date.now() + timeoutMs;
        let timer;
        const expired = () => {
            const error = new Error("Kiểm tra /taikhoan quá thời gian; không tự gửi lại. Số dư vẫn là ước tính.");
            error.code = "WALLET_TIMEOUT";
            return error;
        };
        const task = (async () => {
            const reply = await this.sendCommand(this.channel, this.catalog, this.config.accountCommand);
            if (Date.now() >= deadline) throw expired();
            const result = await this.waitParsed(reply, walletBalance, this.channel, deadline);
            return { message: result.message, balance: result.value };
        })();
        try {
            return await Promise.race([task, new Promise((_, reject) => {
                timer = setTimeout(() => reject(expired()), timeoutMs);
            })]);
        } finally { clearTimeout(timer); }
    }

    async confirmedDaily() {
        const reply = await this.daily();
        const result = await this.waitParsed(reply, dailyReceipt, this.dailyChannel);
        return { message: result.message, ...result.value };
    }

    validate(message, expectedChannel = this.channel) {
        if (!message?.id || message.channelId !== expectedChannel.id || message.author?.id !== this.authorId ||
            typeof message.clickButton !== "function") {
            throw new Error("Phản hồi không phải tin nhắn Chamber trong kênh đã cấu hình.");
        }
        const owner = message.interaction?.user?.id || message.interactionMetadata?.user?.id;
        if (owner && owner !== this.client.user.id) throw new Error("Phản hồi thuộc người chơi khác.");
    }

    validateDaily(message) {
        this.validate(message, this.dailyChannel);
    }

    latest(message, channel = this.channel) {
        return channel.messages.cache.get(message.id) || message;
    }

    async fetchRound(messageId, channel = this.channel) {
        // User accounts read channel history. Upstream fetch(id, {force:true})
        // also uses history, but requests 50 messages; request just this one.
        const key = `${channel.id || ""}:${messageId}`;
        let request = this.pendingReads.get(key);
        if (!request) {
            request = Promise.resolve().then(async () => {
                const messages = await channel.messages.fetch({ around: messageId, limit: 1 });
                const message = messages.get(messageId);
                if (!message) throw new Error("Không tìm thấy đúng tin nhắn ván chờ trong lịch sử kênh.");
                return message;
            });
            this.pendingReads.set(key, request);
            const clear = () => { if (this.pendingReads.get(key) === request) this.pendingReads.delete(key); };
            request.then(clear, clear);
        }
        // A stalled read must not leave an unbounded await, or enqueue more
        // reads for the same ID. The underlying promise remains shared until done.
        const timeoutMs = Math.min(this.config.responseTimeoutMs || 30000, 10000);
        let timer;
        try {
            return await Promise.race([request, new Promise((_, reject) => {
                timer = setTimeout(() => {
                    const error = new Error("Đọc lịch sử ván bài quá thời gian; chưa gửi lại thao tác.");
                    error.code = "ROUND_READ_TIMEOUT";
                    reject(error);
                }, timeoutMs);
            })]);
        } finally { clearTimeout(timer); }
    }

    async findCommandReply(nonce) {
        if (!/^\d{17,20}$/.test(String(nonce))) throw new Error("Mã thao tác ván chờ không hợp lệ.");
        const select = messages => [...messages.values()].filter(message => String(message.nonce) === String(nonce));
        const cached = select(this.channel.messages.cache);
        let matches = cached;
        if (!matches.length) {
            const key = `${this.channel.id}:nonce:${nonce}`;
            let request = this.pendingReads.get(key);
            if (!request) {
                request = Promise.resolve().then(() => this.channel.messages.fetch({ limit: 100 }));
                this.pendingReads.set(key, request);
                const clear = () => { if (this.pendingReads.get(key) === request) this.pendingReads.delete(key); };
                request.then(clear, clear);
            }
            let timer;
            try {
                const messages = await Promise.race([request, new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error("Đọc phản hồi ván chờ quá thời gian; giữ nguyên ván chờ.")),
                        Math.min(this.config.responseTimeoutMs || 30000, 10000));
                })]);
                matches = select(messages);
            } finally { clearTimeout(timer); }
        }
        if (matches.length !== 1) throw new Error("Chưa tìm được duy nhất một phản hồi đúng mã thao tác. Giữ nguyên ván chờ; không đoán theo thời gian hoặc tiền cược.");
        this.validate(matches[0]);
        return matches[0];
    }

    async click(message, id) {
        const before = fingerprint(message);
        await this.pace();
        const current = this.latest(message);
        if (fingerprint(current) !== before) return current;
        this.validate(message);
        if (!buttonsOf(message).some(b => b.id === id && !b.disabled)) throw new Error("Nút đã bị tắt/thay đổi.");
        try { return await message.clickButton(id); }
        catch (error) {
            if (!["INTERACTION_FAILED", "INTERACTION_TIMEOUT"].includes(error.code)) throw error;
            let current = this.latest(message);
            if (fingerprint(current) === before) {
                try { current = await this.fetchRound(message.id); }
                catch { throw error; }
            }
            this.validate(current);
            if (current.id === message.id && fingerprint(current) !== before) return current;
            throw error;
        }
    }

    waitForChange(message, before, timeoutMs, expectedChannel = this.channel) {
        return new Promise((resolve, reject) => {
            let finished = false;
            let fetching = false;
            let polls = 0;
            const startedAt = Date.now();
            const finish = (error, value) => {
                if (finished) return;
                finished = true;
                clearTimeout(timeout);
                clearInterval(poll);
                clearTimeout(progress);
                this.client.off("messageUpdate", onUpdate);
                this.client.off("messageDelete", onDelete);
                if (error) reject(error); else resolve(value);
            };
            const inspect = (candidate, source = "cache") => {
                if (candidate?.id !== message.id || fingerprint(candidate) === before) return;
                try {
                    this.validate(candidate, expectedChannel);
                    this.audit("board_changed", { messageId: message.id, source, elapsedMs: Date.now() - startedAt });
                    finish(null, candidate);
                } catch (error) { finish(error); }
            };
            const onUpdate = (_, updated) => inspect(updated, "gateway");
            const onDelete = deleted => {
                if (deleted.id === message.id) finish(new Error("Tin nhắn ván bài đã bị xóa."));
            };
            const timeout = setTimeout(() => {
                this.audit("board_timeout", { messageId: message.id, elapsedMs: Date.now() - startedAt,
                    attempt: polls, timeoutMs });
                const error = new Error(`Hết ${timeoutMs / 1000} giây chờ thay đổi ván bài (${polls} lần đọc lịch sử); không tự cược lại.`);
                error.code = "BOARD_UPDATE_TIMEOUT";
                finish(error);
            }, timeoutMs);
            const progress = setTimeout(() => {
                if (!finished) this.audit("board_waiting", { messageId: message.id, elapsedMs: Date.now() - startedAt, timeoutMs });
            }, Math.min(30000, timeoutMs));
            const poll = setInterval(async () => {
                if (fetching || finished) return;
                fetching = true;
                polls++;
                this.audit("board_read", { messageId: message.id, attempt: polls, elapsedMs: Date.now() - startedAt });
                try {
                    const current = await this.fetchRound(message.id, expectedChannel);
                    if (finished) return;
                    this.audit("board_read_done", { messageId: message.id, attempt: polls, elapsedMs: Date.now() - startedAt });
                    inspect(current, "history");
                } catch (error) {
                    if (finished) return;
                    this.audit("board_read_error", { messageId: message.id, errorCode: error.code || error.name,
                        elapsedMs: Date.now() - startedAt });
                    if (error.code !== "ROUND_READ_TIMEOUT") finish(error);
                }
                finally { fetching = false; }
            }, 3000);
            this.client.on("messageUpdate", onUpdate);
            this.client.on("messageDelete", onDelete);
            inspect(this.latest(message, expectedChannel));
        });
    }
}

function diagnostic(message) {
    return { id: message.id, channelId: message.channelId, authorId: message.author?.id,
        text: textOf(message), embeds: (message.embeds || []).map(e => e.toJSON ? e.toJSON() : e),
        buttons: buttonsOf(message), components: message.components?.map(c => c.toJSON ? c.toJSON() : c) };
}

module.exports = { DiscordTransport, diagnostic };
