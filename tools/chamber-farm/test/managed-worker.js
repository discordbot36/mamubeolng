"use strict";

// Real CLI/IPC loop with a fully offline Discord adapter for end-to-end tests.
require("discord.js-selfbot-v13");
const Module = require("node:module");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
let balance = 1000;
const calls = path.join(process.env.CHAMBER_DATA_DIR, "test-commands.jsonl");
class Client extends EventEmitter {
    constructor() {
        super();
        this.user = { id: "1341609211074969720", username: "Offline QA" };
        this.channels = { fetch: async id => {
            const channel = { id, guild: { id: "guild" }, messages: { cache: new Map() } };
            channel.searchInteraction = async () => ({ applications: [{ id: process.env.CHAMBER_BOT_ID }],
                application_commands: [
                    { application_id: process.env.CHAMBER_BOT_ID, name: "blackjack", type: 1, options: [{ name: "money", type: 4, min_value: 1, max_value: 50 }] },
                    { application_id: process.env.CHAMBER_BOT_ID, name: "diemdanh", type: 1 },
                    { application_id: process.env.CHAMBER_BOT_ID, name: "taikhoan", type: 1 },
                ] });
            channel.sendSlash = async (application, command, bet) => {
                fs.appendFileSync(calls, JSON.stringify({ command, bet }) + "\n");
                const message = { id: String(Date.now()), channelId: id, author: { id: process.env.CHAMBER_BOT_ID },
                    interaction: { user: this.user }, clickButton() {}, components: [] };
                if (command === "taikhoan") message.embeds = [{ fields: [{ name: "• Ví Tiền", value: `**\`${balance} 💵\`**` }] }];
                else if (command === "diemdanh") { balance += 10; message.embeds = [{ title: "Chúc Mừng!", description: "Bạn nhận được **10 💵** thông qua điểm danh!" }]; }
                else { balance += bet; message.embeds = [{ author: { name: `Player, Bạn cược ${bet}💵` }, footer: { text: "Bạn đã thắng blackjack" } }]; }
                return message;
            };
            return channel;
        } };
    }
    async login() { setImmediate(() => this.emit("ready")); }
    destroy() {}
}
const original = Module._load;
Module._load = function (request, ...args) {
    return request === "discord.js-selfbot-v13" ? { Client } : original.call(this, request, ...args);
};
process.argv.push("--managed");
require("../index");
