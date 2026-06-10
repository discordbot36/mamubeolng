const { EmbedBuilder } = require("discord.js");

async function announceRareDrop(client, data) {
    const channelId = process.env.RARE_DROP_CHANNEL_ID;

    if (!channelId) return;

    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (!channel || !channel.isTextBased()) return;

    const embed = new EmbedBuilder()
        .setTitle("🌟 VẬT PHẨM HIẾM XUẤT HIỆN")
        .setColor(0xffd700)
        .setDescription(
            `${data.user} vừa mở ra vật phẩm hiếm!\n\n` +
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

    const dogId = item.id || item.dogId || "";
    const name = `${item.name || ""} ${item.dogName || ""}`.toLowerCase();
    const weight = Number(item.weightKg || item.weight || 0);

    return (dogId === "cho_do" || name.includes("chộ đó")) && weight > 10;
}

function isRareGem(item) {
    if (!item) return false;

    return Number(item.value || 0) > 100000;
}

function isRareSkill(skill) {
    if (!skill) return false;

    return ["A", "S"].includes(skill.tier);
}

module.exports = {
    announceRareDrop,
    isRareDog,
    isRareGem,
    isRareSkill,
};