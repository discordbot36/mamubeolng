const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} = require("discord.js");

const { getUser, updateUser } = require("./database");

const MAX_PLAYERS = 6;
const rooms = new Map();

function getRoomKey(interaction) {
    return `${interaction.guildId || "dm"}_${interaction.channelId}`;
}

function createDeck() {
    const suits = ["♠", "♥", "♦", "♣"];
    const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const deck = suits.flatMap((suit) => ranks.map((rank) => ({ suit, rank })));
    for (let i = deck.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function cardPoints(card) {
    if (["J", "Q", "K"].includes(card.rank)) return 0;
    return card.rank === "A" ? 1 : Number(card.rank);
}

function scoreHand(hand) {
    return hand.reduce((sum, card) => sum + cardPoints(card), 0) % 10;
}

function handText(hand) {
    return hand.map(({ rank, suit }) => `${rank}${suit}`).join("  ");
}

function createButtons(room, { finished = false } = {}) {
    const row = new ActionRowBuilder();
    if (room.status === "waiting") {
        row.addComponents(
            new ButtonBuilder().setCustomId(`caorua_join_${room.id}`).setLabel("Tham gia").setEmoji("🙋").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`caorua_start_${room.id}`).setLabel("Chia bài").setEmoji("🃏").setStyle(ButtonStyle.Success),
        );
    } else if (finished) {
        row.addComponents(
            new ButtonBuilder().setCustomId(`caorua_next_${room.id}`).setLabel("Ván tiếp theo").setEmoji("🔄").setStyle(ButtonStyle.Primary),
        );
    }
    row.addComponents(
        new ButtonBuilder().setCustomId(`caorua_leave_${room.id}`).setLabel("Rời phòng").setEmoji("🚪").setStyle(ButtonStyle.Secondary),
    );
    return row;
}

function roomEmbed(room) {
    const players = room.players.map((player, index) => {
        const user = `<@${player.id}>`;
        if (!player.hand) return `${index + 1}. ${user}`;
        return `${index + 1}. ${user} — **${scoreHand(player.hand)} nút** — ${handText(player.hand)}`;
    });
    let description = `Chủ phòng: <@${room.hostId}>\nNgười chơi (${room.players.length}/${MAX_PLAYERS}):\n${players.join("\n")}`;
    if (room.status === "waiting") description += "\n\nBấm **Tham gia** để vào phòng. Chủ phòng bấm **Chia bài** khi sẵn sàng.";
    if (room.status === "finished") {
        const top = Math.max(...room.players.map((player) => scoreHand(player.hand)));
        const winners = room.players.filter((player) => scoreHand(player.hand) === top);
        description += `\n\n🏆 ${winners.map((player) => `<@${player.id}>`).join(", ")} thắng với **${top} nút**. Mỗi người thắng nhận **1 điểm Cào Rùa**.`;
    }
    return new EmbedBuilder().setColor(room.status === "finished" ? 0xf1c40f : 0x3498db)
        .setTitle("🐢 Ba Cào — Cào Rùa").setDescription(description)
        .setFooter({ text: "Chỉ có điểm trò chơi, không dùng tiền hoặc vật phẩm quy đổi." });
}

async function create(interaction) {
    const key = getRoomKey(interaction);
    if (rooms.has(key)) return interaction.reply({ content: "Phòng Cào Rùa ở kênh này đang hoạt động.", ephemeral: true });
    const room = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, key, hostId: interaction.user.id, players: [{ id: interaction.user.id, hand: null }], status: "waiting" };
    rooms.set(key, room);
    await interaction.reply({ embeds: [roomEmbed(room)], components: [createButtons(room)] });
}

async function handleButton(interaction) {
    if (!interaction.customId.startsWith("caorua_")) return undefined;
    const [, action, roomId] = interaction.customId.split("_");
    const room = [...rooms.values()].find((candidate) => candidate.id === roomId);
    if (!room || room.key !== getRoomKey(interaction)) return interaction.reply({ content: "Phòng này đã đóng hoặc không còn tồn tại.", ephemeral: true });
    const userId = interaction.user.id;
    const playerIndex = room.players.findIndex((player) => player.id === userId);

    if (action === "join") {
        if (room.status !== "waiting") return interaction.reply({ content: "Ván đã bắt đầu; không thể tham gia lúc này.", ephemeral: true });
        if (playerIndex !== -1) return interaction.reply({ content: "Bạn đã ở trong phòng.", ephemeral: true });
        if (room.players.length >= MAX_PLAYERS) return interaction.reply({ content: "Phòng đã đủ 6 người.", ephemeral: true });
        room.players.push({ id: userId, hand: null });
    } else if (action === "leave") {
        if (room.status === "playing") return interaction.reply({ content: "Không thể rời phòng khi đang chia bài.", ephemeral: true });
        if (playerIndex === -1) return interaction.reply({ content: "Bạn không ở trong phòng.", ephemeral: true });
        room.players.splice(playerIndex, 1);
        if (userId === room.hostId && room.players.length) room.hostId = room.players[0].id;
        if (!room.players.length) rooms.delete(room.key);
    } else if (action === "start") {
        if (userId !== room.hostId) return interaction.reply({ content: "Chỉ chủ phòng mới có thể chia bài.", ephemeral: true });
        if (room.status !== "waiting") return interaction.reply({ content: "Ván này đã được chia bài.", ephemeral: true });
        if (room.players.length < 2) return interaction.reply({ content: "Cần ít nhất 2 người để bắt đầu.", ephemeral: true });
        const deck = createDeck();
        for (const player of room.players) player.hand = [deck.pop(), deck.pop(), deck.pop()];
        room.status = "finished";
        const highScore = Math.max(...room.players.map((player) => scoreHand(player.hand)));
        for (const winner of room.players.filter((player) => scoreHand(player.hand) === highScore)) {
            updateUser(winner.id, (user) => { user.caoRuaPoints = Number(user.caoRuaPoints || 0) + 1; });
        }
    } else if (action === "next") {
        if (room.status !== "finished") return interaction.reply({ content: "Hãy hoàn tất ván hiện tại trước.", ephemeral: true });
        if (!room.players.some((player) => player.id === userId)) return interaction.reply({ content: "Chỉ người trong phòng mới có thể bắt đầu ván tiếp theo.", ephemeral: true });
        for (const player of room.players) player.hand = null;
        room.status = "waiting";
    }
    if (rooms.has(room.key)) await interaction.update({ embeds: [roomEmbed(room)], components: [createButtons(room, { finished: room.status === "finished" })] });
    else await interaction.update({ content: "Phòng đã đóng.", embeds: [], components: [] });
    return undefined;
}

async function points(interaction) {
    const user = getUser(interaction.user.id);
    return interaction.reply({ content: `🐢 Bạn đang có **${Number(user.caoRuaPoints || 0)} điểm Cào Rùa**.`, ephemeral: true });
}

module.exports = { create, points, handleButton };
