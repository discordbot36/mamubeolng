"use strict";

const { startSession, refreshWallet, creditDaily } = require("./session");
const { localClock } = require("./config");

class WalletActions {
    constructor({ store, config, transport, log = () => {} }) {
        Object.assign(this, { store, config, transport, log });
        this.initialized = false;
        this.lastWalletRound = 0;
        this.lastPeriodicRound = 0;
    }

    async account() {
        if (this.store.data.pending) throw new Error("Đối soát ván đang chờ trước khi cập nhật số dư.");
        const reply = await this.transport.account();
        if (!this.initialized) {
            this.store.data.session = startSession(reply.balance, reply.message.id);
            this.initialized = true;
        } else refreshWallet(this.store.data.session, reply.balance, reply.message.id);
        this.lastWalletRound = this.store.data.session.rounds;
        this.store.save();
        this.store.record("wallet_verified", { messageId: reply.message.id, balance: reply.balance });
        this.log(`Ví Tiền: ${reply.balance} coin, đã xác nhận bằng /${this.config.accountCommand}.`);
        return reply.balance;
    }

    async ensure() {
        if (!this.initialized) await this.account();
    }

    async periodic() {
        const interval = this.config.walletEveryRounds ?? 50;
        const rounds = this.store.data.session?.rounds || 0;
        if (!interval || !this.initialized || this.store.data.pending ||
            rounds - Math.max(this.lastWalletRound, this.lastPeriodicRound) < interval) return false;
        // Count attempts, not only successful verifications: a failed lookup or
        // repeated void at this round number must not spam /taikhoan again.
        this.lastPeriodicRound = rounds;
        try {
            await this.account();
            return true;
        } catch (error) {
            this.store.data.session.estimated = true;
            this.store.save();
            this.store.record("wallet_check_failed", { errorCode: error.code || error.name,
                reason: "Periodic wallet check failed; kept estimated balance, no immediate retry" });
            this.log(`Kiểm tra ví định kỳ chưa thành công. Giữ số dư ước tính; không gửi lại /${this.config.accountCommand} trước ${interval} ván nữa.`);
            return false;
        }
    }

    async daily() {
        if (this.store.data.pending) throw new Error("Chờ ván hiện tại kết thúc trước khi điểm danh.");
        const date = localClock(new Date(), this.config.timezone).date;
        if (this.store.data.daily?.date === date) throw new Error("Hôm nay đã gửi điểm danh. Dùng Kiểm tra số dư để xác nhận ví, không gửi lặp.");
        await this.ensure();
        this.store.data.daily = { date, status: "attempted" };
        this.store.save();
        try {
            const result = await this.transport.confirmedDaily();
            if (result.kind === "success") creditDaily(this.store.data.session, result.reward, result.message.id);
            this.store.data.daily = { date, status: result.kind === "success" ? "confirmed" : "already",
                reward: result.reward, messageId: result.message.id };
            this.store.save();
            this.store.record("daily_confirmed", { messageId: result.message.id, reward: result.reward });
            this.log(result.kind === "success" ? `Điểm danh thành công: +${result.reward} coin.` : "Chamber xác nhận hôm nay đã điểm danh.");
        } catch (error) {
            this.store.data.daily.status = "uncertain";
            this.store.save();
            throw error;
        }
        // Confirm wallet after the reward, rather than claiming the estimate
        // includes every other change to the user's wallet.
        if (this.store.data.daily.status === "confirmed") await this.account();
        return this.store.data.daily;
    }
}

module.exports = { WalletActions };
