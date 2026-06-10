const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");

const questConfig = require("./config/quest");

const {
    getQuestState,
    claimQuestReward,
    trackQuestProgress,
    formatMoney,
    getCurrencyEmoji,
} = require("./database");

function formatNumber(value) {
    return Number(value || 0).toLocaleString("vi-VN");
}

function getQuestGroup(type) {
    return type === "weekly" ? questConfig.weekly : questConfig.daily;
}

function getTypeFromInteraction(interaction) {
    const raw = interaction.options?.getString?.("ky") || "daily";
    return raw === "weekly" ? "weekly" : "daily";
}

function progressBar(current, target, size = 10) {
    const safeTarget = Math.max(1, Number(target || 1));
    const ratio = Math.max(0, Math.min(1, Number(current || 0) / safeTarget));
    const filled = Math.round(ratio * size);

    return "█".repeat(filled) + "░".repeat(size - filled);
}

function formatReward(reward = {}) {
    const coin = getCurrencyEmoji();
    const parts = [];

    if (reward.money) {
        parts.push(`${coin} ${formatMoney(reward.money)}`);
    }

    if (reward.tuVi) {
        parts.push(`✨ ${formatNumber(reward.tuVi)} tu vi`);
    }

    if (Array.isArray(reward.items)) {
        for (const item of reward.items) {
            parts.push(`🎁 ${item.itemId} x${item.amount || 1}`);
        }
    }

    return parts.length > 0 ? parts.join(" + ") : "Không có";
}

function buildQuestEmbed(interaction, type = "daily") {
    const group = getQuestGroup(type);
    const state = getQuestState(interaction.user.id, type);

    const embed = new EmbedBuilder()
        .setColor(type === "weekly" ? 0x9b59b6 : 0x2ecc71)
        .setTitle(group.title)
        .setDescription(
            `${group.description}\n\n` +
                `👤 **${interaction.user.displayName || interaction.user.username}**\n` +
                `🔁 Mã kỳ: \`${state.periodKey}\``,
        )
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp();

    for (const quest of group.quests) {
        const current = Number(state.progress?.[quest.taskId] || 0);
        const target = Number(quest.target || 1);
        const done = current >= target;
        const claimed = Boolean(state.claimed?.[quest.id]);
        const status = claimed ? "✅ Đã nhận" : done ? "🎁 Có thể nhận" : "⏳ Đang làm";

        embed.addFields({
            name: `${done ? "✅" : "▫️"} ${quest.name}`,
            value:
                `\`${progressBar(current, target)}\` **${Math.min(current, target)}/${target}**\n` +
                `🎁 Thưởng: ${formatReward(quest.reward)}\n` +
                `📌 Trạng thái: **${status}**`,
            inline: false,
        });
    }

    return embed;
}

function buildQuestButtons(userId, type = "daily") {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`quest_view_daily_${userId}`)
            .setLabel("Daily")
            .setEmoji("📅")
            .setStyle(type === "daily" ? ButtonStyle.Success : ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`quest_view_weekly_${userId}`)
            .setLabel("Weekly")
            .setEmoji("🗓️")
            .setStyle(type === "weekly" ? ButtonStyle.Primary : ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`quest_claimall_${type}_${userId}`)
            .setLabel("Nhận tất cả")
            .setEmoji("🎁")
            .setStyle(ButtonStyle.Danger),
    );
}

async function show(interaction) {
    const type = getTypeFromInteraction(interaction);

    return interaction.reply({
        embeds: [buildQuestEmbed(interaction, type)],
        components: [buildQuestButtons(interaction.user.id, type)],
    });
}

async function claimAll(interaction, type) {
    const group = getQuestGroup(type);
    const results = [];

    for (const quest of group.quests) {
        const result = claimQuestReward(interaction.user.id, type, quest.id);

        if (result.success) {
            results.push(`✅ ${quest.name}: ${formatReward(result.reward)}`);
        }
    }

    const text =
        results.length > 0
            ? `🎁 **Đã nhận thưởng:**\n${results.join("\n")}`
            : "⏳ Chưa có nhiệm vụ nào hoàn thành hoặc đã nhận hết rồi.";

    return interaction.update({
        content: text,
        embeds: [buildQuestEmbed(interaction, type)],
        components: [buildQuestButtons(interaction.user.id, type)],
    });
}

async function handleButton(interaction) {
    if (!interaction.customId.startsWith("quest_")) {
        return undefined;
    }

    const parts = interaction.customId.split("_");
    const action = parts[1];
    const type = parts[2] === "weekly" ? "weekly" : "daily";
    const userId = parts.slice(3).join("_");

    if (interaction.user.id !== userId) {
        return interaction.reply({
            content: "❌ Đây không phải bảng nhiệm vụ của bạn. Tự dùng `/quest` đi.",
            ephemeral: true,
        });
    }

    if (action === "view") {
        return interaction.update({
            content: null,
            embeds: [buildQuestEmbed(interaction, type)],
            components: [buildQuestButtons(interaction.user.id, type)],
        });
    }

    if (action === "claimall") {
        return claimAll(interaction, type);
    }

    return undefined;
}

module.exports = {
    show,
    handleButton,
    trackQuestProgress,
};