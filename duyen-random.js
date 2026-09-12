const crypto = require("crypto");
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} = require("discord.js");
const db = require("./database");
const config = require("./config/duyen");

const activeEvents = new Map();
const timers = new Map();
const STATE_KEY = "duyen:random:active";

const MERCHANT_OFFERS = [
    { id: "gold", emoji: "🪙", name: "Túi linh thạch", cost: 5_000, reward: 9_000 },
    { id: "jade", emoji: "💎", name: "Ngọc đổi vận", cost: 14_000, reward: 26_000 },
    { id: "relic", emoji: "🗝️", name: "Mảnh cổ vật", cost: 35_000, reward: 70_000 },
];

function getOptions() {
    return config.randomEvents || {};
}

function keyOf(guildId, channelId) {
    return `${guildId}:${channelId}`;
}

function randomInt(min, max) {
    return crypto.randomInt(min, max + 1);
}

function selectKind() {
    const weights = getOptions().weights || { doors: 45, merchant: 30, beast: 25 };
    const entries = Object.entries(weights).filter(([, weight]) => Number(weight) > 0);
    const total = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);
    let roll = crypto.randomInt(0, Math.max(1, Math.floor(total * 1000))) / 1000;

    for (const [kind, weight] of entries) {
        roll -= Number(weight);
        if (roll <= 0) return kind;
    }
    return "doors";
}

function saveState() {
    const plain = [...activeEvents.values()].map((event) => ({
        ...event,
        message: undefined,
        guild: undefined,
    }));
    db.setSystemValue(STATE_KEY, plain);
}

function clearTimer(event) {
    const timer = timers.get(event.id);
    if (timer) clearTimeout(timer);
    timers.delete(event.id);
}

function eventTitle(kind) {
    return {
        doors: "🚪 CƠ DUYÊN — BA CỔNG ĐÁ",
        merchant: "🦊 CƠ DUYÊN — THƯƠNG NHÂN BÍ ẨN",
        beast: "🐉 CƠ DUYÊN — YÊU THÚ LẠC ĐÀN",
    }[kind] || "✨ CƠ DUYÊN";
}

function eventDescription(event) {
    const coin = db.getCurrencyEmoji();
    const remaining = Math.max(0, Math.ceil((event.expiresAt - Date.now()) / 1000));

    if (event.kind === "doors") {
        return "Ba cánh cổng vừa xuất hiện. Chọn một cổng — có thể nhận linh thạch, gặp tiền bối, hoặc chỉ mang về một câu chuyện.\n\n" +
            `⏳ Còn **${remaining}s** • Mỗi người chọn một lần.`;
    }
    if (event.kind === "merchant") {
        const offers = event.offers.map((offer, index) =>
            `${offer.emoji} **${index + 1}. ${offer.name}** — ${coin} ${db.formatMoney(offer.cost)}\n> Giá trị bí ẩn, chỉ mua một lần.`,
        );
        return `Một thương nhân lạ ghé qua trong chốc lát. Hàng hóa có lời, nhưng không hoàn tiền.\n\n${offers.join("\n\n")}\n\n⏳ Còn **${remaining}s**.`;
    }
    const hpPercent = Math.max(0, Math.ceil((event.hp / event.maxHp) * 100));
    return `Yêu thú đang quấy phá linh mạch! Cả kênh cùng đánh bại nó để chia thưởng.\n\n❤️ HP: **${event.hp.toLocaleString("en-US")} / ${event.maxHp.toLocaleString("en-US")}** (${hpPercent}%)\n👥 Người tham gia: **${Object.keys(event.damageByUser).length}**\n⏳ Còn **${remaining}s**.`;
}

function buildComponents(event, disabled = false) {
    const row = new ActionRowBuilder();
    if (event.kind === "doors") {
        for (const [index, label, emoji] of [[0, "Cổng Ngọc", "💎"], [1, "Cổng Sương", "🌫️"], [2, "Cổng Huyết", "🩸"]]) {
            row.addComponents(new ButtonBuilder()
                .setCustomId(`duyenrandom_door_${event.id}_${index}`)
                .setLabel(label).setEmoji(emoji).setStyle(ButtonStyle.Primary).setDisabled(disabled));
        }
    } else if (event.kind === "merchant") {
        event.offers.forEach((offer, index) => row.addComponents(new ButtonBuilder()
            .setCustomId(`duyenrandom_buy_${event.id}_${index}`)
            .setLabel(`${offer.name} (${db.formatMoney(offer.cost)})`).setEmoji(offer.emoji)
            .setStyle(ButtonStyle.Success).setDisabled(disabled)));
    } else {
        row.addComponents(new ButtonBuilder()
            .setCustomId(`duyenrandom_attack_${event.id}`)
            .setLabel("Tấn công yêu thú").setEmoji("⚔️").setStyle(ButtonStyle.Danger).setDisabled(disabled));
    }
    return [row];
}

function buildEmbed(event, ending = null) {
    return new EmbedBuilder()
        .setColor(ending === "success" ? 0x2ecc71 : ending ? 0x95a5a6 : 0x9b59b6)
        .setTitle(eventTitle(event.kind))
        .setDescription(eventDescription(event))
        .setFooter({ text: "Cơ duyên chỉ là điểm nhấn vui — phần thưởng được giới hạn để bảo toàn kinh tế." })
        .setTimestamp();
}

function scheduleFinish(event) {
    clearTimer(event);
    const delay = Math.max(1, event.expiresAt - Date.now());
    const timer = setTimeout(() => finish(event, "expired").catch((error) => console.error("[DuyenRandom finish]", error)), delay);
    timers.set(event.id, timer);
}

async function updateMessage(event, ending = null) {
    if (!event.message && event.channel?.messages && event.messageId) {
        event.message = await event.channel.messages.fetch(event.messageId).catch(() => null);
    }
    if (!event.message) return;
    await event.message.edit({ embeds: [buildEmbed(event, ending)], components: buildComponents(event, Boolean(ending)) }).catch(() => undefined);
}

async function finish(event, reason) {
    if (!event || event.finished) return;
    event.finished = true;
    clearTimer(event);

    const killed = event.kind === "beast" && event.hp <= 0;
    if (event.kind === "beast" && killed) {
        const totalDamage = Math.max(1, Object.values(event.damageByUser).reduce((sum, value) => sum + value, 0));
        for (const [userId, damage] of Object.entries(event.damageByUser)) {
            const reward = 3_000 + Math.floor((damage / totalDamage) * 12_000);
            db.addMoney(userId, reward);
        }
        event.resultText = "Yêu thú đã bị đánh bại; phần thưởng được chia theo sát thương.";
    } else if (event.kind === "beast") {
        event.resultText = "Yêu thú đã chạy thoát. Không ai mất gì cả.";
    } else {
        event.resultText = reason === "expired" ? "Cơ duyên đã tan biến." : "Cơ duyên đã khép lại.";
    }

    activeEvents.delete(event.key);
    saveState();
    await updateMessage(event, killed ? "success" : "ended");
    if (event.message && event.resultText) {
        await event.message.reply({ content: `✨ ${event.resultText}` }).catch(() => undefined);
    }
}

function makeEvent(channel) {
    const kind = selectKind();
    const durationMs = Math.max(30_000, Number(getOptions().durationMs || 5 * 60 * 1000));
    const event = {
        id: `${Date.now()}${crypto.randomInt(1000, 9999)}`,
        key: keyOf(channel.guildId, channel.id),
        guildId: channel.guildId,
        channelId: channel.id,
        kind,
        createdAt: Date.now(),
        expiresAt: Date.now() + durationMs,
        users: {},
        messageId: null,
        channel,
    };
    if (kind === "merchant") event.offers = MERCHANT_OFFERS;
    if (kind === "beast") {
        event.maxHp = Math.max(1_000, Number(getOptions().beastHp || 6_000));
        event.hp = event.maxHp;
        event.damageByUser = {};
        event.lastAttackAt = {};
    }
    return event;
}

async function start(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: "❌ Cơ duyên chỉ mở trong server.", ephemeral: true });
    const key = keyOf(interaction.guildId, interaction.channelId);
    if (activeEvents.has(key)) return interaction.reply({ content: "⏳ Kênh này đang có một cơ duyên khác.", ephemeral: true });

    const event = makeEvent(interaction.channel);
    activeEvents.set(key, event);
    try {
        await interaction.reply({ embeds: [buildEmbed(event)], components: buildComponents(event) });
        event.message = await interaction.fetchReply();
        event.messageId = event.message.id;
        saveState();
        scheduleFinish(event);
        return undefined;
    } catch (error) {
        activeEvents.delete(key);
        saveState();
        throw error;
    }
}

async function autoStart(client) {
    const auto = config.autoOpen || {};
    if (!auto.enabled || !getOptions().enabled) return false;
    const channel = await client.channels.fetch(auto.channelId).catch(() => null);
    if (!channel?.guild || !channel.isTextBased()) return false;
    const key = keyOf(channel.guildId, channel.id);
    if (activeEvents.has(key)) return false;
    let message = null;
    const fake = {
        guildId: channel.guildId, channelId: channel.id, channel, user: client.user,
        reply: async (payload) => { message = await channel.send(payload); return message; },
        fetchReply: async () => message,
    };
    await start(fake);
    return true;
}

async function handleButton(interaction) {
    const customId = String(interaction.customId || "");
    if (!customId.startsWith("duyenrandom_")) return undefined;
    const [, action, eventId, option] = customId.split("_");
    const event = [...activeEvents.values()].find((item) => item.id === eventId);
    if (!event || event.finished) {
        await interaction.reply({ content: "⌛ Cơ duyên này đã kết thúc.", ephemeral: true }).catch(() => undefined);
        return true;
    }
    if (event.expiresAt <= Date.now()) {
        await finish(event, "expired");
        await interaction.reply({ content: "⌛ Cơ duyên vừa tan biến.", ephemeral: true }).catch(() => undefined);
        return true;
    }

    const userId = String(interaction.user.id);
    if (action === "door") {
        if (event.users[userId]) {
            await interaction.reply({ content: "❌ Bạn đã chọn một cổng rồi.", ephemeral: true });
            return true;
        }
        const rewards = [
            { text: "Bạn tìm thấy một túi linh thạch.", money: randomInt(3_000, 7_000) },
            { text: "Một tiền bối chỉ điểm, nhận lộc nhỏ.", money: randomInt(5_000, 10_000) },
            { text: "Cổng chỉ còn sương mù. Lần này chưa có quà.", money: 0 },
        ];
        const reward = rewards[crypto.randomInt(0, rewards.length)];
        event.users[userId] = true;
        if (reward.money) db.addMoney(userId, reward.money);
        saveState();
        await interaction.reply({ content: `🚪 ${reward.text}${reward.money ? ` Nhận **${db.getCurrencyEmoji()} ${db.formatMoney(reward.money)}**.` : ""}`, ephemeral: true });
        return true;
    }
    if (action === "buy") {
        if (event.users[userId]) {
            await interaction.reply({ content: "❌ Bạn chỉ có thể mua một món từ thương nhân.", ephemeral: true });
            return true;
        }
        const offer = event.offers?.[Number(option)];
        if (!offer) {
            await interaction.reply({ content: "❌ Món hàng không còn tồn tại.", ephemeral: true });
            return true;
        }
        const charged = db.removeMoney(userId, offer.cost);
        if (!charged.success) {
            await interaction.reply({ content: `❌ ${charged.message}`, ephemeral: true });
            return true;
        }
        db.addMoney(userId, offer.reward);
        event.users[userId] = true;
        saveState();
        await interaction.reply({ content: `${offer.emoji} Bạn đổi **${db.getCurrencyEmoji()} ${db.formatMoney(offer.cost)}** lấy **${db.getCurrencyEmoji()} ${db.formatMoney(offer.reward)}**.`, ephemeral: true });
        return true;
    }
    if (action === "attack") {
        const last = Number(event.lastAttackAt[userId] || 0);
        if (Date.now() - last < 5_000) {
            await interaction.reply({ content: "⏳ Bạn cần hồi sức 5 giây trước khi đánh tiếp.", ephemeral: true });
            return true;
        }
        const damage = randomInt(160, 420);
        event.lastAttackAt[userId] = Date.now();
        event.damageByUser[userId] = Number(event.damageByUser[userId] || 0) + damage;
        event.hp = Math.max(0, event.hp - damage);
        saveState();
        await interaction.deferUpdate();
        await updateMessage(event);
        if (event.hp <= 0) await finish(event, "killed");
        return true;
    }
    return undefined;
}

async function recover(client) {
    const stored = db.getSystemValue(STATE_KEY);
    if (!Array.isArray(stored)) return;
    db.deleteSystemValue(STATE_KEY);
    for (const event of stored) {
        if (!event?.channelId || event.expiresAt <= Date.now()) continue;
        const channel = await client.channels.fetch(event.channelId).catch(() => null);
        if (!channel?.isTextBased()) continue;
        event.channel = channel;
        event.guildId = channel.guildId;
        event.key = keyOf(event.guildId, event.channelId);
        event.message = event.messageId ? await channel.messages.fetch(event.messageId).catch(() => null) : null;
        activeEvents.set(event.key, event);
        scheduleFinish(event);
    }
    saveState();
}

module.exports = { start, autoStart, handleButton, recover };
