const { EmbedBuilder } = require("discord.js");
const { getSystemValue, setSystemValue, getBalance, removeMoney, addMoney, formatMoney, getCurrencyEmoji } = require("./database");

const INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;
const TICKET_PRICE = 10000;
const STARTING_JACKPOT = 1000000;
const ROLLOVER_RATE = 0.5;
const SYSTEM_KEY = "vietlott645";
let clientRef;
let timer;
let drawing = false;

function freshState() {
    return { nextDrawAt: Date.now() + INTERVAL_MS, jackpot: STARTING_JACKPOT, round: 1, tickets: [], results: [] };
}
function state() {
    return getSystemValue(SYSTEM_KEY) || freshState();
}
function save(value) { setSystemValue(SYSTEM_KEY, value); }
function formatDate(timestamp) {
    return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp)) + " (giờ Việt Nam)";
}
function parseNumbers(input) {
    const values = String(input || "").split(/[ ,;.-]+/).filter(Boolean).map(Number);
    if (values.length !== 6 || values.some((n) => !Number.isInteger(n) || n < 1 || n > 45) || new Set(values).size !== 6) return null;
    return values.sort((a, b) => a - b);
}
function chooseNumbers() {
    const pool = Array.from({ length: 45 }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, 6).sort((a, b) => a - b);
}
function currency(value) { return `${formatMoney(value)} ${getCurrencyEmoji()}`; }
function schedule() {
    clearTimeout(timer);
    const current = state();
    if (!current.nextDrawAt) { current.nextDrawAt = Date.now() + INTERVAL_MS; save(current); }
    timer = setTimeout(async () => {
        await draw();
        schedule();
    }, Math.min(Math.max(0, current.nextDrawAt - Date.now()), 2147480000));
    timer.unref?.();
}
async function draw() {
    if (drawing) return;
    drawing = true;
    try {
        const current = state();
        if (current.nextDrawAt > Date.now()) return;
        const announcementChannels = [...new Set((current.tickets || []).map((ticket) => ticket.channelId).filter(Boolean))];
        const numbers = chooseNumbers();
        const tiers = { 3: 100000, 4: 500000, 5: 5000000 };
        const winners = [];
        for (const ticket of current.tickets) {
            const matches = ticket.numbers.filter((n) => numbers.includes(n)).length;
            if (matches >= 3) winners.push({ ...ticket, matches, prize: matches === 6 ? current.jackpot : tiers[matches] });
        }
        const jackpotWinner = winners.some((w) => w.matches === 6);
        for (const winner of winners) addMoney(winner.userId, winner.prize);
        const result = { round: current.round, numbers, drawnAt: Date.now(), winners };
        current.results = [result, ...(current.results || [])].slice(0, 10);
        current.jackpot = jackpotWinner ? STARTING_JACKPOT : Math.floor(current.jackpot + current.tickets.length * TICKET_PRICE * ROLLOVER_RATE);
        current.round += 1;
        current.tickets = [];
        current.nextDrawAt = Date.now() + INTERVAL_MS;
        save(current);
        if (clientRef) {
            const channelIds = announcementChannels.length ? announcementChannels : (current.lastChannelId ? [current.lastChannelId] : []);
            const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle(`🎉 Kết quả Vietlott 6/45 — kỳ ${result.round}`)
                .setDescription(`**Bộ số:** ${numbers.map((n) => `\`${String(n).padStart(2, "0")}\``).join(" · ")}\n\n${winners.length ? winners.map((w) => `<@${w.userId}> trúng **${w.matches}/6** — ${currency(w.prize)}`).join("\n") : "Không có vé trúng thưởng."}\n\n${jackpotWinner ? "🎊 Có người trúng Jackpot!" : `Jackpot được cộng dồn lên **${currency(current.jackpot)}**.`}\nKỳ tiếp theo: **${formatDate(current.nextDrawAt)}**`);
            for (const id of channelIds) { const channel = await clientRef.channels.fetch(id).catch(() => null); if (channel?.isTextBased()) await channel.send({ embeds: [embed] }).catch(() => undefined); }
        }
    } finally { drawing = false; }
}
async function handle(interaction) {
    const sub = interaction.options.getSubcommand();
    const current = state();
    current.nextDrawAt ||= Date.now() + INTERVAL_MS;
    if (sub === "lich") {
        save(current);
        return interaction.reply({ content: `🎟️ **Vietlott 6/45 — kỳ ${current.round}**\nJackpot hiện tại: **${currency(current.jackpot)}**\nMở bán đến trước giờ quay: **${formatDate(current.nextDrawAt)}**\nGiá vé: **${currency(TICKET_PRICE)}**/vé. Dùng **/vietlott mua** và nhập 6 số khác nhau từ 1 đến 45.`, ephemeral: true });
    }
    if (sub === "mua") {
        const numbers = parseNumbers(interaction.options.getString("so"));
        if (!numbers) return interaction.reply({ content: "Vui lòng chọn đúng 6 số khác nhau từ 1 đến 45 (ví dụ: 1 8 16 24 32 45).", ephemeral: true });
        if (Date.now() >= current.nextDrawAt) { await draw(); return interaction.reply({ content: "Kỳ quay đã đóng bán vé. Hãy xem lịch kỳ tiếp theo bằng /vietlott lich.", ephemeral: true }); }
        const payment = removeMoney(interaction.user.id, TICKET_PRICE);
        if (!payment.success) return interaction.reply({ content: `Bạn cần **${currency(TICKET_PRICE)}** để mua vé.`, ephemeral: true });
        const ticket = { userId: interaction.user.id, numbers, purchasedAt: Date.now(), channelId: interaction.channelId };
        current.tickets.push(ticket); current.lastChannelId = interaction.channelId; save(current);
        return interaction.reply({ content: `✅ Đã mua vé kỳ **${current.round}**: ${numbers.map((n) => `**${n}**`).join(" · ")}\nGiá vé: ${currency(TICKET_PRICE)}. Dò vé tự động lúc **${formatDate(current.nextDrawAt)}**.`, ephemeral: true });
    }
    const latest = (current.results || [])[0];
    if (!latest) return interaction.reply({ content: `Chưa có kết quả nào. Kỳ hiện tại quay lúc **${formatDate(current.nextDrawAt)}**.`, ephemeral: true });
    const mine = latest.winners.filter((winner) => winner.userId === interaction.user.id);
    return interaction.reply({ content: `🎱 **Kết quả kỳ ${latest.round}:** ${latest.numbers.join(" · ")}\n${mine.length ? mine.map((w) => `Bạn trúng ${w.matches}/6: **${currency(w.prize)}**`).join("\n") : "Bạn chưa có vé trúng ở kỳ gần nhất."}\nJackpot hiện tại: **${currency(current.jackpot)}**.`, ephemeral: true });
}
function start(client) { clientRef = client; if (!getSystemValue(SYSTEM_KEY)) save(freshState()); schedule(); }
module.exports = { handle, start, draw };
