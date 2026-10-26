const { EmbedBuilder } = require("discord.js");
const { getSystemValue, setSystemValue, getBalance, removeGamblingMoney: removeMoney, addGamblingMoney: addMoney, formatMoney, getCurrencyEmoji } = require("./database");

const INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;
const TICKET_PRICE = 10000;
const STARTING_JACKPOT = 3000000000;
const PRIZES = { 3: 300000, 4: 10000000, 5: 300000000 };
const ROLLOVER_RATE = 0.5;
const SYSTEM_KEY = "vietlott645";
let clientRef;
let timer;
let drawing = false;

function freshState() {
    return { nextDrawAt: Date.now() + INTERVAL_MS, jackpot: STARTING_JACKPOT, round: 1, tickets: [], results: [] };
}
function state() {
    const current = getSystemValue(SYSTEM_KEY) || freshState();
    current.jackpot = Math.max(STARTING_JACKPOT, Number(current.jackpot) || 0);
    current.tickets ||= [];
    current.results ||= [];
    return current;
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
function numberLine(numbers) { return numbers.map((n) => String(n).padStart(2, "0")).join(" · "); }
function prizeTable(jackpot) {
    return `💎 **6/6 số — Jackpot: ${currency(jackpot)}** (chia đều theo vé trúng)\n🥇 5/6 số: **${currency(PRIZES[5])}**/vé\n🥈 4/6 số: **${currency(PRIZES[4])}**/vé\n🥉 3/6 số: **${currency(PRIZES[3])}**/vé\nMỗi vé nhận một hạng giải cao nhất, không cần đúng thứ tự.`;
}
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
        const tiers = PRIZES;
        const winners = [];
        for (const ticket of current.tickets) {
            const matches = ticket.numbers.filter((n) => numbers.includes(n)).length;
            if (matches >= 3) winners.push({ ...ticket, matches, prize: matches === 6 ? current.jackpot : tiers[matches] });
        }
        const jackpotTickets = winners.filter((winner) => winner.matches === 6);
        const jackpotWinner = jackpotTickets.length > 0;
        if (jackpotWinner) {
            const share = Math.floor(current.jackpot / jackpotTickets.length);
            for (const winner of jackpotTickets) winner.prize = share;
        }
        for (const winner of winners) addMoney(winner.userId, winner.prize);
        const result = { round: current.round, numbers, drawnAt: Date.now(), winners, ticketCount: current.tickets.length, jackpot: current.jackpot, prizes: { ...PRIZES } };
        current.results = [result, ...(current.results || [])].slice(0, 10);
        current.jackpot = jackpotWinner ? STARTING_JACKPOT : Math.floor(current.jackpot + current.tickets.length * TICKET_PRICE * ROLLOVER_RATE);
        current.round += 1;
        current.tickets = [];
        current.nextDrawAt = Date.now() + INTERVAL_MS;
        save(current);
        if (clientRef) {
            const channelIds = announcementChannels.length ? announcementChannels : (current.lastChannelId ? [current.lastChannelId] : []);
            const winnerLines = winners.slice(0, 12).map((w) => `<@${w.userId}> · ${w.matches}/6 số · **${currency(w.prize)}**`);
            if (winners.length > 12) winnerLines.push(`… và ${winners.length - 12} vé trúng khác. Xem phần thưởng của bạn bằng /vietlott ketqua.`);
            const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle(`🎉 Vietlott 6/45 — kết quả kỳ #${result.round}`)
                .setDescription(`🎱 **${numberLine(numbers)}**\n${winnerLines.join("\n") || "Chưa có vé trúng thưởng kỳ này."}`)
                .addFields(
                    { name: "📊 Tổng kết", value: `${result.ticketCount} vé tham gia · ${winners.length} vé trúng\nĐã tự cộng thưởng: **${currency(winners.reduce((sum, w) => sum + w.prize, 0))}**` },
                    { name: "💎 Jackpot", value: jackpotWinner ? `Chia đều cho **${jackpotTickets.length} vé** trúng 6 số. Jackpot kỳ mới: **${currency(current.jackpot)}**.` : `Cộng dồn kỳ tới: **${currency(current.jackpot)}**` },
                    { name: "⏰ Kỳ tiếp theo", value: `${formatDate(current.nextDrawAt)}\nDùng /vietlott mua để chọn vé; /vietlott ve để kiểm tra vé.` },
                ).setFooter({ text: "Trò chơi dùng tiền ảo trong bot • Thưởng tự động vào ví" });
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
        const embed = new EmbedBuilder().setColor(0xf1c40f).setTitle(`🎟️ Vietlott 6/45 — kỳ #${current.round}`)
            .setDescription(prizeTable(current.jackpot))
            .addFields(
                { name: "⏰ Giờ quay", value: `${formatDate(current.nextDrawAt)}\n<t:${Math.floor(current.nextDrawAt / 1000)}:R> · Chu kỳ 3 ngày` },
                { name: "🎫 Cách mua", value: `**${currency(TICKET_PRICE)}/vé** · 1–20 vé/lần\n/vietlott mua: bot chọn số ngẫu nhiên\nHoặc nhập 6 số khác nhau từ 01–45, ví dụ: 01 08 16 24 32 45.` },
                { name: "🔎 Theo dõi", value: "/vietlott ve — xem vé của bạn\n/vietlott ketqua — dò kết quả và tiền thưởng\nThưởng tự động cộng vào ví; dùng /thongke để xem lãi/lỗ." },
            ).setFooter({ text: "Tiền ảo trong bot • Jackpot tối thiểu 3 tỷ xu • Không có người trúng thì cộng dồn" });
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    if (sub === "ve") {
        const mine = current.tickets.filter((ticket) => ticket.userId === interaction.user.id);
        const page = interaction.options.getInteger("trang") || 1;
        const pages = Math.max(1, Math.ceil(mine.length / 10));
        if (!Number.isInteger(page) || page < 1 || page > pages) return interaction.reply({ content: `Vui lòng chọn trang từ 1 đến ${pages}.`, ephemeral: true });
        const lines = mine.slice((page - 1) * 10, page * 10).map((ticket, i) => `**Vé #${(page - 1) * 10 + i + 1}:** ${numberLine(ticket.numbers)}`);
        const embed = new EmbedBuilder().setColor(0x3498db).setTitle(`🎫 Vé của bạn — kỳ #${current.round}`)
            .setDescription(lines.join("\n") || "Bạn chưa mua vé kỳ này. Dùng /vietlott mua để tham gia.")
            .addFields({ name: "⏰ Tự dò và trả thưởng", value: formatDate(current.nextDrawAt) })
            .setFooter({ text: `${mine.length} vé · Trang ${page}/${pages} · /vietlott ve trang để xem thêm` });
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    if (sub === "mua") {
        const rawNumbers = interaction.options.getString("so");
        const chosen = rawNumbers ? parseNumbers(rawNumbers) : null;
        const quantity = interaction.options.getInteger("soluong") || 1;
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return interaction.reply({ content: "Mỗi lần mua từ 1 đến 20 vé.", ephemeral: true });
        if (rawNumbers && !chosen) return interaction.reply({ content: "Vui lòng chọn đúng 6 số khác nhau từ 1 đến 45 (ví dụ: 1 8 16 24 32 45), hoặc bỏ trống để chọn ngẫu nhiên.", ephemeral: true });
        if (Date.now() >= current.nextDrawAt) { await draw(); return interaction.reply({ content: "Kỳ quay đã đóng bán vé. Hãy xem lịch kỳ tiếp theo bằng /vietlott lich.", ephemeral: true }); }
        const totalCost = TICKET_PRICE * quantity;
        const payment = removeMoney(interaction.user.id, totalCost);
        if (!payment.success) return interaction.reply({ content: `Bạn cần **${currency(totalCost)}** để mua **${quantity} vé**. Số dư: **${currency(getBalance(interaction.user.id))}**; còn thiếu **${currency(Math.max(0, totalCost - getBalance(interaction.user.id)))}**.`, ephemeral: true });
        const tickets = [];
        const seen = new Set();
        for (let index = 0; index < quantity; index += 1) {
            let numbers = chosen;
            if (!numbers) {
                do { numbers = chooseNumbers(); } while (seen.has(numbers.join("-")));
                seen.add(numbers.join("-"));
            }
            tickets.push({ userId: interaction.user.id, numbers: [...numbers], purchasedAt: Date.now(), channelId: interaction.channelId });
        }
        current.tickets.push(...tickets); current.lastChannelId = interaction.channelId; save(current);
        const ticketList = tickets.map((ticket, index) => `**${index + 1}.** ${ticket.numbers.map((n) => `\`${String(n).padStart(2, "0")}\``).join(" · ")}`).join("\n");
        return interaction.reply({ content: `✅ Đã mua **${quantity} vé** kỳ **${current.round}**${chosen ? " (dãy số đã chọn)" : " (số ngẫu nhiên)"}:\n${ticketList}\nTổng tiền: **${currency(totalCost)}** · Số dư còn lại: **${currency(payment.balance)}**.\n⏰ Tự dò và cộng thưởng lúc **${formatDate(current.nextDrawAt)}**.\n${chosen && quantity > 1 ? "ℹ️ Các vé dùng cùng bộ số bạn chọn.\n" : ""}Dùng /vietlott ve để xem lại vé.`, ephemeral: true });
    }
    const latest = (current.results || [])[0];
    if (!latest) return interaction.reply({ content: `Chưa có kết quả nào. Kỳ hiện tại quay lúc **${formatDate(current.nextDrawAt)}**.`, ephemeral: true });
    const mine = latest.winners.filter((winner) => winner.userId === interaction.user.id);
    const totalPrize = mine.reduce((sum, winner) => sum + winner.prize, 0);
    const summary = [6, 5, 4, 3].map((matches) => {
        const tickets = mine.filter((w) => w.matches === matches);
        return tickets.length ? `${matches}/6 số: **${tickets.length} vé** · ${currency(tickets.reduce((sum, w) => sum + w.prize, 0))}` : null;
    }).filter(Boolean);
    const embed = new EmbedBuilder().setColor(totalPrize ? 0x2ecc71 : 0x3498db)
        .setTitle(`🎱 Kết quả Vietlott — kỳ #${latest.round}`)
        .setDescription(`**${numberLine(latest.numbers)}**\nQuay lúc: ${formatDate(latest.drawnAt)}`)
        .addFields(
            { name: "🎁 Phần thưởng của bạn", value: summary.join("\n") || "Bạn không có vé trúng ở kỳ này." },
            { name: "💰 Đã tự cộng vào ví", value: currency(totalPrize) },
            { name: "💎 Jackpot kỳ tiếp theo", value: `${currency(current.jackpot)}\nQuay lúc ${formatDate(current.nextDrawAt)}` },
        ).setFooter({ text: "Xem vé kỳ đang mở bằng /vietlott ve • Lãi/lỗ tại /thongke" });
    return interaction.reply({ embeds: [embed], ephemeral: true });
}
function start(client) { clientRef = client; save(state()); schedule(); }
module.exports = { handle, start, draw };
