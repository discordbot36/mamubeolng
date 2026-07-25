const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");

const questConfig = require("./config/quest");

const {
    getQuestState,
    getActiveQuests,
    claimQuestReward,
    trackQuestProgress,
    trackQuestProgressBatch,
    formatMoney,
    getCurrencyEmoji,
} = require("./database");

const QUEST_TYPES = [
    "daily",
    "weekly",
    "challenge",
];

function formatNumber(value) {
    return Number(value || 0).toLocaleString(
        "vi-VN",
    );
}

function normalizeQuestType(type) {
    return QUEST_TYPES.includes(type)
        ? type
        : "daily";
}

function getQuestGroup(type) {
    return (
        questConfig[normalizeQuestType(type)] ||
        questConfig.daily
    );
}

function getTypeFromInteraction(interaction) {
    return normalizeQuestType(
        interaction.options?.getString?.("ky") ||
            "daily",
    );
}

function progressBar(
    current,
    target,
    size = 10,
) {
    const safeTarget = Math.max(
        1,
        Number(target || 1),
    );

    const ratio = Math.max(
        0,
        Math.min(
            1,
            Number(current || 0) / safeTarget,
        ),
    );

    const filled = Math.round(ratio * size);

    return (
        "█".repeat(filled) +
        "░".repeat(size - filled)
    );
}

function formatReward(reward = {}) {
    const coin = getCurrencyEmoji();
    const parts = [];

    if (reward.money) {
        parts.push(
            `${coin} ${formatMoney(
                reward.money,
            )}`,
        );
    }

    if (reward.tuVi) {
        parts.push(
            `✨ ${formatNumber(
                reward.tuVi,
            )} tu vi`,
        );
    }

    if (Array.isArray(reward.items)) {
        for (const item of reward.items) {
            parts.push(
                `🎁 ${item.itemId} x${
                    item.amount || 1
                }`,
            );
        }
    }

    return parts.length > 0
        ? parts.join(" + ")
        : "Không có";
}

function buildQuestEmbed(
    interaction,
    type = "daily",
) {
    const normalizedType =
        normalizeQuestType(type);

    const group =
        getQuestGroup(normalizedType);

    const state = getQuestState(
        interaction.user.id,
        normalizedType,
    );

    const quests = getActiveQuests(
        interaction.user.id,
        normalizedType,
    );

    const embed = new EmbedBuilder()
        .setColor(group.color || 0x2ecc71)
        .setTitle(group.title)
        .setDescription(
            `${group.description}\n\n` +
                `👤 **${
                    interaction.user.displayName ||
                    interaction.user.username
                }**\n` +
                `🔁 Mã kỳ: \`${state.periodKey}\``,
        )
        .setThumbnail(
            interaction.user.displayAvatarURL(),
        )
        .setTimestamp();

    for (const quest of quests) {
        const current = Number(
            state.progress?.[quest.taskId] || 0,
        );

        const target = Number(
            quest.target || 1,
        );

        const done = current >= target;

        const claimed = Boolean(
            state.claimed?.[quest.id],
        );

        const status = claimed
            ? "✅ Đã nhận"
            : done
              ? "🎁 Có thể nhận"
              : "⏳ Đang làm";

        embed.addFields({
            name: `${done ? "✅" : "▫️"} ${
                quest.name
            }`,
            value:
                `\`${progressBar(
                    current,
                    target,
                )}\` **${formatNumber(
                    Math.min(current, target),
                )}/${formatNumber(target)}**\n` +
                `🎁 Thưởng: ${formatReward(
                    quest.reward,
                )}\n` +
                `📌 Trạng thái: **${status}**`,
            inline: false,
        });
    }

    return embed;
}

function buildQuestButtons(
    userId,
    type = "daily",
) {
    const normalizedType =
        normalizeQuestType(type);

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(
                `quest_view_daily_${userId}`,
            )
            .setLabel("Daily")
            .setEmoji("📅")
            .setStyle(
                normalizedType === "daily"
                    ? ButtonStyle.Success
                    : ButtonStyle.Secondary,
            ),

        new ButtonBuilder()
            .setCustomId(
                `quest_view_weekly_${userId}`,
            )
            .setLabel("Weekly")
            .setEmoji("🗓️")
            .setStyle(
                normalizedType === "weekly"
                    ? ButtonStyle.Primary
                    : ButtonStyle.Secondary,
            ),

        new ButtonBuilder()
            .setCustomId(
                `quest_view_challenge_${userId}`,
            )
            .setLabel("Challenge")
            .setEmoji("🎰")
            .setStyle(
                normalizedType === "challenge"
                    ? ButtonStyle.Danger
                    : ButtonStyle.Secondary,
            ),

        new ButtonBuilder()
            .setCustomId(
                `quest_claimall_${normalizedType}_${userId}`,
            )
            .setLabel("Nhận tất cả")
            .setEmoji("🎁")
            .setStyle(ButtonStyle.Success),
    );
}

async function show(interaction) {
    const type =
        getTypeFromInteraction(interaction);

    return interaction.reply({
        embeds: [
            buildQuestEmbed(
                interaction,
                type,
            ),
        ],
        components: [
            buildQuestButtons(
                interaction.user.id,
                type,
            ),
        ],
    });
}

async function claimAll(
    interaction,
    type,
) {
    const normalizedType =
        normalizeQuestType(type);

    const quests = getActiveQuests(
        interaction.user.id,
        normalizedType,
    );

    const results = [];

    for (const quest of quests) {
        const result = claimQuestReward(
            interaction.user.id,
            normalizedType,
            quest.id,
        );

        if (result.success) {
            results.push(
                `✅ ${quest.name}: ${formatReward(
                    result.reward,
                )}`,
            );
        }
    }

    const text =
        results.length > 0
            ? `🎁 **Đã nhận thưởng:**\n${results.join(
                  "\n",
              )}`
            : "⏳ Chưa có nhiệm vụ nào hoàn thành hoặc đã nhận hết rồi.";

    return interaction.update({
        content: text,
        embeds: [
            buildQuestEmbed(
                interaction,
                normalizedType,
            ),
        ],
        components: [
            buildQuestButtons(
                interaction.user.id,
                normalizedType,
            ),
        ],
    });
}

async function handleButton(interaction) {
    if (
        !interaction.customId.startsWith(
            "quest_",
        )
    ) {
        return undefined;
    }

    const parts =
        interaction.customId.split("_");

    const action = parts[1];

    const type = normalizeQuestType(
        parts[2],
    );

    const userId = parts
        .slice(3)
        .join("_");

    if (interaction.user.id !== userId) {
        return interaction.reply({
            content:
                "❌ Đây không phải bảng nhiệm vụ của bạn. Tự dùng `/quest` đi.",
            ephemeral: true,
        });
    }

    if (action === "view") {
        return interaction.update({
            content: null,
            embeds: [
                buildQuestEmbed(
                    interaction,
                    type,
                ),
            ],
            components: [
                buildQuestButtons(
                    interaction.user.id,
                    type,
                ),
            ],
        });
    }

    if (action === "claimall") {
        return claimAll(
            interaction,
            type,
        );
    }

    return undefined;
}

function trackGambleResult(
    userId,
    gameId,
    result = {},
) {
    const safeGameId = String(
        gameId || "gamble",
    )
        .trim()
        .toLowerCase();

    const bet = Math.max(
        0,
        Math.floor(
            Number(result.bet || 0),
        ),
    );

    const payout = Math.max(
        0,
        Math.floor(
            Number(result.payout || 0),
        ),
    );

    /*
     * Chỉ tính phần lời.
     * Ví dụ cược 10.000, nhận 20.000:
     * profit = 10.000.
     */
    const profit = Math.max(
        0,
        payout - bet,
    );

    const won = Boolean(result.won);

    const progress = {
        gamble_play: 1,
        [`${safeGameId}_play`]: 1,
    };

    if (bet > 0) {
        progress.gamble_wager = bet;
        progress[`${safeGameId}_wager`] =
            bet;
    }

    if (won) {
        progress.gamble_win = 1;
        progress[`${safeGameId}_win`] = 1;
    }

    if (profit > 0) {
        progress.gamble_profit = profit;
        progress[`${safeGameId}_profit`] =
            profit;
    }

    if (
        result.extraProgress &&
        typeof result.extraProgress ===
            "object"
    ) {
        for (const [
            taskId,
            amount,
        ] of Object.entries(
            result.extraProgress,
        )) {
            const safeAmount = Math.max(
                0,
                Math.floor(
                    Number(amount || 0),
                ),
            );

            if (taskId && safeAmount > 0) {
                progress[taskId] =
                    Number(
                        progress[taskId] || 0,
                    ) + safeAmount;
            }
        }
    }

    return trackQuestProgressBatch(
        userId,
        progress,
    );
}

module.exports = {
    show,
    handleButton,
    trackQuestProgress,
    trackGambleResult,
};