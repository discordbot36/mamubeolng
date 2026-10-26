const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { randomInt } = require("crypto");
const { getUser, settleCaoRuaRound, formatMoney, getCurrencyEmoji } = require("./database");
const { GAMBLE_MAX_BET } = require("./config/gamble");
const rooms = new Map();
const MAX_PLAYERS = 6;
const IDLE_MS = 10 * 60 * 1000;
const money = (n) => `${formatMoney(n)} ${getCurrencyEmoji()}`;
const keyFor = (i) => `${i.guildId}_${i.channelId}`;
function shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}
function createDeck() {
    return shuffle(["♠", "♥", "♦", "♣"].flatMap((suit) =>
        ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].map((rank) => ({ rank, suit }))));
}
function scoreHand(hand) {
    return hand.reduce((sum, c) => sum + (c.rank === "A" ? 1 : ["J", "Q", "K"].includes(c.rank) ? 0 : Number(c.rank)), 0) % 10;
}
function buttons(room) {
    const row = new ActionRowBuilder();
    const add = (action, label, style) => row.addComponents(new ButtonBuilder()
        .setCustomId(`caorua_${action}_${room.id}_${room.round}`).setLabel(label).setStyle(style));
    if (room.status === "waiting") {
        add("join", "Tham gia", ButtonStyle.Primary);
        add("ready", "Sẵn sàng / Hủy sẵn sàng", ButtonStyle.Secondary);
        add("start", "Chia bài", ButtonStyle.Success);
    } else add("next", "Chuẩn bị ván mới", ButtonStyle.Primary);
    add("leave", "Rời phòng", ButtonStyle.Secondary);
    add("close", "Đóng phòng", ButtonStyle.Danger);
    return row;
}
function roomEmbed(room) {
    const lines = room.players.map((p, index) => {
        if (!p.hand) return `${index + 1}. <@${p.id}> ${p.ready ? "✅ Sẵn sàng" : "⏳ Chưa sẵn sàng"}`;
        const payout = room.result.payouts[p.id];
        const net = payout - room.bet;
        return `${payout ? "🏆" : "•"} <@${p.id}> — ${p.hand.map((c) => c.rank + c.suit).join(" ")} — **${scoreHand(p.hand)} nút**\nNhận ${money(payout)} · Lãi/lỗ **${net > 0 ? "+" : ""}${money(net)}**`;
    });
    return new EmbedBuilder().setColor(room.status === "finished" ? 0xf1c40f : 0x3498db)
        .setTitle(`🃏 Ba Cào — ván ${room.round}`)
        .setDescription(`Chủ phòng: <@${room.hostId}> · ${room.players.length}/${MAX_PLAYERS} người\n**Cược: ${money(room.bet)}/người/ván**\nQuỹ ${room.status === "finished" ? "đã trả" : "dự kiến"}: **${money(room.bet * room.players.length)}**\n\n${lines.join("\n")}`)
        .addFields({ name: room.status === "waiting" ? "Cách chơi" : "Đã thanh toán vào ví", value: room.status === "waiting"
            ? "Tham gia → xác nhận Sẵn sàng → chủ phòng Chia bài khi tất cả đã sẵn sàng. Chỉ trừ tiền khi chia bài; rời phòng chờ không mất tiền."
            : "Người cao nút nhất nhận quỹ; hòa chia đều. Ván mới cần từng người xác nhận sẵn sàng lại. Xem lãi/lỗ tại /thongke." })
        .setFooter({ text: "A = 1; 10/J/Q/K = 0; tổng lấy hàng đơn vị. Không xét chất, ba tây hay sáp. Không phí. Phòng tự đóng sau 10 phút không thao tác." });
}
function touch(room) {
    clearTimeout(room.timer);
    room.timer = setTimeout(() => {
        if (rooms.get(room.key) !== room) return;
        rooms.delete(room.key);
        room.message?.edit({ content: "⌛ Phòng Ba Cào đã hết thời gian chờ. Tạo phòng mới bằng /caorua; không có tiền cược bị giữ.", embeds: [], components: [] }).catch(() => undefined);
    }, IDLE_MS);
    room.timer.unref?.();
}
async function create(interaction) {
    const fail = (content) => interaction.reply({ content, ephemeral: true });
    if (!interaction.guildId) return fail("Hãy tạo phòng trong kênh máy chủ để bạn bè cùng tham gia.");
    const key = keyFor(interaction);
    if (rooms.has(key)) return fail("Kênh này đã có phòng Ba Cào. Hãy tham gia phòng hiện tại hoặc nhờ chủ phòng đóng phòng.");
    const bet = interaction.options.getInteger("cuoc") ?? 1000;
    if (!Number.isSafeInteger(bet) || bet < 100 || bet > GAMBLE_MAX_BET) return fail(`Mức cược từ ${money(100)} đến ${money(GAMBLE_MAX_BET)}.`);
    if (getUser(interaction.user.id).money < bet) return fail(`Bạn cần ít nhất ${money(bet)} để tạo bàn cược này.`);
    const room = { id: randomInt(281474976710655).toString(36), key, hostId: interaction.user.id, bet, round: 1, players: [{ id: interaction.user.id, hand: null, ready: true }], status: "waiting" };
    rooms.set(key, room);
    try {
        await interaction.reply({ embeds: [roomEmbed(room)], components: [buttons(room)] });
        room.message = await interaction.fetchReply();
        touch(room);
    } catch (error) {
        rooms.delete(key);
        throw error;
    }
}
async function handleButton(interaction) {
    if (!interaction.customId.startsWith("caorua_")) return undefined;
    const fail = (content) => interaction.reply({ content, ephemeral: true });
    const [, action, id, round] = interaction.customId.split("_");
    const room = rooms.get(keyFor(interaction));
    if (!room || room.id !== id) return fail("Phòng đã đóng. Dùng /caorua để mở phòng mới.");
    if (Number(round) !== room.round) return fail("Nút thuộc ván cũ. Hãy dùng nút trên bảng phòng mới nhất.");
    if (room.busy) return fail("Phòng đang cập nhật, vui lòng thử lại sau giây lát.");
    const userId = interaction.user.id;
    const player = room.players.find((p) => p.id === userId);
    if (interaction.user.bot) return fail("Bot không thể tham gia cược.");
    room.busy = true;
    try {
        if (action === "join") {
            if (room.status !== "waiting") return await fail("Chờ chủ phòng chuẩn bị ván mới để tham gia.");
            if (player) return await fail("Bạn đã ở trong phòng; bấm Sẵn sàng để xác nhận cược.");
            if (room.players.length >= MAX_PLAYERS) return await fail("Phòng đã đủ 6 người.");
            if (getUser(userId).money < room.bet) return await fail(`Bạn cần ${money(room.bet)} để tham gia.`);
            room.players.push({ id: userId, hand: null, ready: false });
        } else if (action === "ready") {
            if (!player || room.status !== "waiting") return await fail("Bạn cần tham gia phòng đang chờ trước.");
            if (!player.ready && getUser(userId).money < room.bet) return await fail(`Bạn cần ${money(room.bet)} để sẵn sàng.`);
            player.ready = !player.ready;
        } else if (action === "start") {
            if (userId !== room.hostId) return await fail("Chỉ chủ phòng được chia bài.");
            if (room.status !== "waiting") return await fail("Ván này đã được thanh toán.");
            if (room.players.length < 2) return await fail("Cần ít nhất 2 người chơi.");
            if (room.players.some((p) => !p.ready)) return await fail("Hãy chờ tất cả người chơi xác nhận Sẵn sàng với mức cược trên bàn.");
            const deck = createDeck();
            const dealt = room.players.map((p) => ({ ...p, hand: [deck.pop(), deck.pop(), deck.pop()] }));
            const high = Math.max(...dealt.map((p) => scoreHand(p.hand)));
            const winners = shuffle(dealt.filter((p) => scoreHand(p.hand) === high).map((p) => p.id));
            const result = settleCaoRuaRound(dealt.map((p) => p.id), winners, room.bet);
            if (!result.success) {
                for (const p of room.players) if (result.insufficient?.includes(p.id)) p.ready = false;
                await interaction.update({ embeds: [roomEmbed(room)], components: [buttons(room)] });
                return await interaction.followUp({ content: result.message + (result.insufficient ? "\nThiếu tiền: " + result.insufficient.map((id) => `<@${id}>`).join(", ") : ""), ephemeral: true });
            }
            room.players = dealt;
            room.result = result;
            room.status = "finished";
        } else if (action === "next") {
            if (userId !== room.hostId) return await fail("Chỉ chủ phòng được chuẩn bị ván mới.");
            if (room.status !== "finished") return await fail("Phòng đang chờ sẵn sàng.");
            room.round += 1;
            room.status = "waiting";
            room.result = null;
            room.players.forEach((p) => { p.hand = null; p.ready = false; });
        } else if (action === "leave") {
            if (!player) return await fail("Bạn chưa ở trong phòng.");
            // Reset all remaining players before seating changes in the next round.
            if (room.status === "finished") {
                room.players.forEach((p) => { p.hand = null; p.ready = false; });
                room.status = "waiting";
                room.round += 1;
                room.result = null;
            }
            room.players = room.players.filter((p) => p.id !== userId);
            if (room.hostId === userId && room.players.length) room.hostId = room.players[0].id;
            if (!room.players.length) rooms.delete(room.key);
        } else if (action === "close") {
            if (userId !== room.hostId) return await fail("Chỉ chủ phòng được đóng phòng.");
            rooms.delete(room.key);
        } else return await fail("Thao tác không hợp lệ.");
        if (rooms.has(room.key)) {
            touch(room);
            await interaction.update({ embeds: [roomEmbed(room)], components: [buttons(room)] });
        } else {
            clearTimeout(room.timer);
            await interaction.update({ content: "Phòng Ba Cào đã đóng. Mọi ván đã chơi được thanh toán; không có tiền cược bị giữ.", embeds: [], components: [] });
        }
        return true;
    } finally { room.busy = false; }
}
async function points(interaction) {
    const user = getUser(interaction.user.id);
    return interaction.reply({ content: `🐢 Bạn có **${Number(user.caoRuaPoints || 0)} điểm Cào Rùa**.\nDùng /caorua cuoc để mở bàn tiền game; /thongke để xem tổng lãi/lỗ.`, ephemeral: true });
}
module.exports = { create, points, handleButton };
