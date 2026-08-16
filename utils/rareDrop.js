const { EmbedBuilder } = require("discord.js");

const GAMBLE_DROP_MIN_PAYOUT = 50_000_000;
const GEM_DROP_MIN_VALUE = 5_000_000;
const DOG_DROP_MIN_VALUE = 800;

async function announceRareDrop(client, data) {
    const channelId = process.env.RARE_DROP_CHANNEL_ID;

    if (!channelId) return;

    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (!channel || !channel.isTextBased()) return;

    const embed = new EmbedBuilder()
        .setTitle("🌟 LUCKY DROPS")
        .setColor(0xffd700)
        .setDescription(
            `${data.user} vừa nổ Lucky Drop!\n\n` +
                `${data.emoji || "🎁"} **${data.name}**\n` +
                `${data.detail || ""}`,
        )
        .setTimestamp();

    return channel.send({
        embeds: [embed],
    });
}

function isRareDog(item) {
    if (!item) return false;

    return item.type === "dog" && Number(item.value || 0) > DOG_DROP_MIN_VALUE;
}

function isRareGem(item) {
    if (!item) return false;

    return Number(item.value || 0) > GEM_DROP_MIN_VALUE;
}

function isRareGamblePayout(payout) {
    return Number(payout || 0) > GAMBLE_DROP_MIN_PAYOUT;
}

async function announceGambleWin(client, data) {
    if (!isRareGamblePayout(data?.payout)) return;

    try {
        return await announceRareDrop(client, {
            user: data.user,
            emoji: "💰",
            name: `NỔ GAMBLE ${data.game || ""}`.trim(),
            detail:
                `🎰 Game: **${data.game || "Gamble"}**\n` +
                `💵 Nhận: **${Number(data.payout).toLocaleString("vi-VN")}**`,
        });
    } catch (error) {
        console.error("[LUCKY DROPS] Không thể thông báo gamble:", error);
        return undefined;
    }
}

module.exports = {
    announceRareDrop,
    announceGambleWin,
    isRareDog,
    isRareGem,
    isRareGamblePayout,
};
