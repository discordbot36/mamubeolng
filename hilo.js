const crypto = require("crypto");

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");

const {
    getBalance,
    addMoney,
    removeMoney,
    addWin,
    addLoss,
    getCurrencyEmoji,
    formatMoney,
} = require("./database");

const { GAMBLE_MAX_BET } = require("./config/gamble");
const quest = require("./quest");

const MIN_BET = 100;
const MAX_BET = GAMBLE_MAX_BET;

const RTP = 0.99;
const MAX_PAYOUT = 10_000_000_000;
const MAX_SKIPS = 52;
const SESSION_TIMEOUT_MS = 3 * 60 * 1000;

const activeSessions = new Map();

const RANKS = [
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
    "A",
];

const SUITS = [
    {
        symbol: "♦",
        name: "Rô",
        color: "red",
    },
    {
        symbol: "♥",
        name: "Cơ",
        color: "red",
    },
    {
        symbol: "♠",
        name: "Bích",
        color: "black",
    },
    {
        symbol: "♣",
        name: "Tép",
        color: "black",
    },
];

function createSessionId() {
    return `${Date.now()}${crypto.randomInt(1000, 9999)}`;
}

function getSessionKey(userId) {
    return String(userId);
}

function drawCard() {
    /*
     * Stake Hilo sử dụng bộ bài vô hạn.
     * Mỗi lần rút luôn có đủ 52 khả năng.
     */
    const cardIndex = crypto.randomInt(0, 52);
    const rankIndex = Math.floor(cardIndex / 4);
    const suitIndex = cardIndex % 4;

    return {
        rankIndex,
        rank: RANKS[rankIndex],
        suitIndex,
        suit: SUITS[suitIndex],
    };
}

function formatCard(card) {
    if (!card) {
        return "❓";
    }

    return `${card.suit.symbol} ${card.rank}`;
}

function getCardColor(card) {
    return card?.suit?.color === "red"
        ? 0xe74c3c
        : 0x2c3e50;
}

function isSameRankWinAllowed(card) {
    /*
     * Theo luật Stake:
     * - Lá 2 đến Q: cùng hạng vẫn thắng.
     * - K và A: cùng hạng không thắng.
     */
    return Number(card?.rankIndex || 0) <= 10;
}

function getWinningOutcomeCount(card, choice) {
    const rankIndex = Number(card?.rankIndex || 0);
    const sameRankWin = isSameRankWinAllowed(card);

    let winningRanks = 0;

    if (choice === "higher") {
        winningRanks = 12 - rankIndex;
    }

    if (choice === "lower") {
        winningRanks = rankIndex;
    }

    if (sameRankWin) {
        winningRanks += 1;
    }

    /*
     * Mỗi rank có 4 chất nhưng xác suất rank đều bằng nhau,
     * nên có thể tính trực tiếp trên 13 hạng.
     */
    return Math.max(0, Math.min(13, winningRanks));
}

function getChoiceChance(card, choice) {
    return getWinningOutcomeCount(card, choice) / 13;
}

function getChoiceMultiplier(card, choice) {
    const chance = getChoiceChance(card, choice);

    if (chance <= 0) {
        return 0;
    }

    return RTP / chance;
}

function formatPercent(chance) {
    return `${(Number(chance || 0) * 100).toFixed(2)}%`;
}

function formatMultiplier(multiplier) {
    return `${Number(multiplier || 0).toFixed(2)}x`;
}

function getPayout(session) {
    return Math.min(
        MAX_PAYOUT,
        Math.floor(
            Number(session.bet || 0) *
                Number(session.multiplier || 1),
        ),
    );
}

function isWinningChoice(currentCard, nextCard, choice) {
    const currentRank = Number(currentCard.rankIndex);
    const nextRank = Number(nextCard.rankIndex);

    if (nextRank === currentRank) {
        return isSameRankWinAllowed(currentCard);
    }

    if (choice === "higher") {
        return nextRank > currentRank;
    }

    if (choice === "lower") {
        return nextRank < currentRank;
    }

    return false;
}

function formatHistory(session) {
    const history = Array.isArray(session.history)
        ? session.history.slice(-8)
        : [];

    if (history.length <= 0) {
        return "Chưa rút lá tiếp theo.";
    }

    return history
        .map((card) => {
            return formatCard(card);
        })
        .join("  →  ");
}

function buildButtons(session, disabled = false) {
    const higherChance = getChoiceChance(
        session.currentCard,
        "higher",
    );

    const lowerChance = getChoiceChance(
        session.currentCard,
        "lower",
    );

    const higherMultiplier = getChoiceMultiplier(
        session.currentCard,
        "higher",
    );

    const lowerMultiplier = getChoiceMultiplier(
        session.currentCard,
        "lower",
    );

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(
                `hilo_higher_${session.userId}_${session.id}`,
            )
            .setLabel(
                higherChance > 0
                    ? `Cao hơn ${formatMultiplier(
                          higherMultiplier,
                      )}`
                    : "Không thể cao hơn",
            )
            .setEmoji("⬆️")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled || higherChance <= 0),

        new ButtonBuilder()
            .setCustomId(
                `hilo_lower_${session.userId}_${session.id}`,
            )
            .setLabel(
                lowerChance > 0
                    ? `Thấp hơn ${formatMultiplier(
                          lowerMultiplier,
                      )}`
                    : "Không thể thấp hơn",
            )
            .setEmoji("⬇️")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled || lowerChance <= 0),

        new ButtonBuilder()
            .setCustomId(
                `hilo_skip_${session.userId}_${session.id}`,
            )
            .setLabel(
                `Bỏ qua ${session.skipsUsed}/${MAX_SKIPS}`,
            )
            .setEmoji("⏭️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(
                disabled ||
                    session.skipsUsed >= MAX_SKIPS,
            ),

        new ButtonBuilder()
            .setCustomId(
                `hilo_cashout_${session.userId}_${session.id}`,
            )
            .setLabel("Chốt lời")
            .setEmoji("💰")
            .setStyle(ButtonStyle.Success)
            .setDisabled(
                disabled || session.correctGuesses <= 0,
            ),
    );
}

function buildGameEmbed(session, title = "🃏 CAO HƠN – THẤP HƠN") {
    const coin = getCurrencyEmoji();

    const higherChance = getChoiceChance(
        session.currentCard,
        "higher",
    );

    const lowerChance = getChoiceChance(
        session.currentCard,
        "lower",
    );

    const higherMultiplier = getChoiceMultiplier(
        session.currentCard,
        "higher",
    );

    const lowerMultiplier = getChoiceMultiplier(
        session.currentCard,
        "lower",
    );

    return new EmbedBuilder()
        .setColor(getCardColor(session.currentCard))
        .setTitle(title)
        .setDescription(
            `<@${session.userId}>\n\n` +
                `## ${formatCard(session.currentCard)}\n` +
                `Lá hiện tại: **${session.currentCard.rank} ${session.currentCard.suit.name}**\n\n` +
                `⬆️ **Cao hơn:** ${formatPercent(
                    higherChance,
                )} • **${formatMultiplier(
                    higherMultiplier,
                )}**\n` +
                `⬇️ **Thấp hơn:** ${formatPercent(
                    lowerChance,
                )} • **${formatMultiplier(
                    lowerMultiplier,
                )}**\n\n` +
                `💰 Cược: **${coin} ${formatMoney(
                    session.bet,
                )}**\n` +
                `🔥 Chuỗi đúng: **${session.correctGuesses}**\n` +
                `📈 Hệ số cộng dồn: **${formatMultiplier(
                    session.multiplier,
                )}**\n` +
                `🎁 Có thể nhận: **${coin} ${formatMoney(
                    getPayout(session),
                )}**\n` +
                `⏭️ Đã bỏ qua: **${session.skipsUsed}/${MAX_SKIPS}**\n\n` +
                `🃏 Lịch sử:\n${formatHistory(session)}`,
        )
        .setFooter({
            text:
                "Lá 2–Q: trùng hạng vẫn thắng. K và A: trùng hạng sẽ thua. RTP 99%.",
        })
        .setTimestamp();
}

function buildLoseEmbed(
    session,
    previousCard,
    resultCard,
    choice,
) {
    const coin = getCurrencyEmoji();

    return new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("💥 CAO HƠN – THẤP HƠN: THUA")
        .setDescription(
            `<@${session.userId}> đã chọn **${
                choice === "higher"
                    ? "⬆️ Cao hơn"
                    : "⬇️ Thấp hơn"
            }**.\n\n` +
                `Lá trước: **${formatCard(
                    previousCard,
                )}**\n` +
                `Lá mới: **${formatCard(
                    resultCard,
                )}**\n\n` +
                `❌ Dự đoán sai.\n` +
                `🔥 Chuỗi dừng tại: **${session.correctGuesses}**\n` +
                `💸 Mất tiền cược: **${coin} ${formatMoney(
                    session.bet,
                )}**\n` +
                `💼 Số dư: **${coin} ${formatMoney(
                    getBalance(session.userId),
                )}**`,
        )
        .setTimestamp();
}

function buildCashoutEmbed(session, auto = false) {
    const coin = getCurrencyEmoji();
    const payout = getPayout(session);
    const profit = payout - session.bet;

    return new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle(
            auto
                ? "⏰ CAO HƠN – THẤP HƠN: TỰ CHỐT"
                : "💰 CAO HƠN – THẤP HƠN: CHỐT LỜI",
        )
        .setDescription(
            `<@${session.userId}> đã dừng đúng lúc.\n\n` +
                `🔥 Chuỗi đúng: **${session.correctGuesses}**\n` +
                `📈 Hệ số cuối: **${formatMultiplier(
                    session.multiplier,
                )}**\n` +
                `🎁 Nhận về: **${coin} ${formatMoney(
                    payout,
                )}**\n` +
                `📊 Lợi nhuận: **${coin} ${formatMoney(
                    profit,
                )}**\n` +
                `💼 Số dư mới: **${coin} ${formatMoney(
                    getBalance(session.userId),
                )}**`,
        )
        .setTimestamp();
}

function safeTrackQuest(userId, result) {
    try {
        if (
            quest &&
            typeof quest.trackGambleResult === "function"
        ) {
            quest.trackGambleResult(
                userId,
                "hilo",
                result,
            );
        }
    } catch (error) {
        console.error(
            "[Hilo trackGambleResult]",
            error,
        );
    }
}

function clearSession(session) {
    if (session?.timeout) {
        clearTimeout(session.timeout);
    }

    activeSessions.delete(
        getSessionKey(session.userId),
    );
}

function scheduleTimeout(session, client) {
    if (session.timeout) {
        clearTimeout(session.timeout);
    }

    session.timeout = setTimeout(async () => {
        const currentSession =
            activeSessions.get(
                getSessionKey(session.userId),
            );

        if (
            !currentSession ||
            currentSession.id !== session.id ||
            currentSession.processing
        ) {
            return;
        }

        currentSession.processing = true;

        let embed;

        if (currentSession.correctGuesses > 0) {
            const payout = getPayout(currentSession);

            addMoney(currentSession.userId, payout);
            addWin(currentSession.userId);

            safeTrackQuest(currentSession.userId, {
                bet: currentSession.bet,
                payout,
                won: true,
            });

            embed = buildCashoutEmbed(
                currentSession,
                true,
            );
        } else {
            /*
             * Chưa đoán lần nào thì hoàn cược,
             * tránh người chơi mất tiền vì quên hoặc Discord lag.
             */
            addMoney(
                currentSession.userId,
                currentSession.bet,
            );

            embed = new EmbedBuilder()
                .setColor(0x95a5a6)
                .setTitle(
                    "⏰ CAO HƠN – THẤP HƠN: HẾT HẠN",
                )
                .setDescription(
                    `<@${currentSession.userId}> chưa dự đoán lần nào.\n` +
                        `Tiền cược đã được hoàn lại.`,
                )
                .setTimestamp();
        }

        clearSession(currentSession);

        const channel = await client.channels
            .fetch(currentSession.channelId)
            .catch(() => null);

        const message =
            channel?.isTextBased()
                ? await channel.messages
                      .fetch(currentSession.messageId)
                      .catch(() => null)
                : null;

        if (message) {
            await message
                .edit({
                    embeds: [embed],
                    components: [],
                })
                .catch(() => null);
        }
    }, SESSION_TIMEOUT_MS);
}

class HiloManager {
    async play(interaction) {
        const userId = String(interaction.user.id);
        const bet =
            interaction.options.getInteger("cuoc");
        const coin = getCurrencyEmoji();

        if (
            !Number.isInteger(bet) ||
            bet < MIN_BET ||
            bet > MAX_BET
        ) {
            return interaction.reply({
                content:
                    `❌ Cược phải từ **${coin} ${formatMoney(
                        MIN_BET,
                    )}** đến **${coin} ${formatMoney(
                        MAX_BET,
                    )}**.`,
                ephemeral: true,
            });
        }

        if (activeSessions.has(getSessionKey(userId))) {
            return interaction.reply({
                content:
                    "❌ Bạn đang có một ván Cao hơn – Thấp hơn chưa kết thúc.",
                ephemeral: true,
            });
        }

        const balance = getBalance(userId);

        if (balance < bet) {
            return interaction.reply({
                content:
                    `❌ Không đủ tiền.\n` +
                    `💰 Số dư: **${coin} ${formatMoney(
                        balance,
                    )}**`,
                ephemeral: true,
            });
        }

        const removed = removeMoney(userId, bet);

        if (!removed.success) {
            return interaction.reply({
                content: `❌ ${removed.message}`,
                ephemeral: true,
            });
        }

        const firstCard = drawCard();

        const session = {
            id: createSessionId(),
            userId,
            bet,

            currentCard: firstCard,
            history: [firstCard],

            multiplier: 1,
            correctGuesses: 0,
            skipsUsed: 0,

            processing: false,
            channelId: interaction.channelId,
            messageId: null,
            timeout: null,
            createdAt: Date.now(),
        };

        activeSessions.set(
            getSessionKey(userId),
            session,
        );

        const message = await interaction.reply({
            embeds: [buildGameEmbed(session)],
            components: [buildButtons(session)],
            fetchReply: true,
        });

        session.messageId = message.id;

        scheduleTimeout(session, interaction.client);

        return undefined;
    }

    async handleButton(interaction) {
        if (
            !interaction.customId.startsWith("hilo_")
        ) {
            return undefined;
        }

        const parts = interaction.customId.split("_");
        const action = parts[1];
        const userId = parts[2];
        const sessionId = parts.slice(3).join("_");

        if (
            String(interaction.user.id) !==
            String(userId)
        ) {
            return interaction.reply({
                content:
                    "❌ Đây không phải ván Cao hơn – Thấp hơn của bạn.",
                ephemeral: true,
            });
        }

        const session = activeSessions.get(
            getSessionKey(userId),
        );

        if (!session || session.id !== sessionId) {
            return interaction.reply({
                content:
                    "❌ Ván này đã kết thúc hoặc hết hạn.",
                ephemeral: true,
            });
        }

        if (session.processing) {
            return interaction.reply({
                content:
                    "⏳ Lượt trước đang được xử lý.",
                ephemeral: true,
            });
        }

        session.processing = true;

        if (session.timeout) {
            clearTimeout(session.timeout);
        }

        try {
            if (action === "cashout") {
                if (session.correctGuesses <= 0) {
                    session.processing = false;
                    scheduleTimeout(
                        session,
                        interaction.client,
                    );

                    return interaction.reply({
                        content:
                            "❌ Phải đoán đúng ít nhất một lần mới có thể chốt lời.",
                        ephemeral: true,
                    });
                }

                const payout = getPayout(session);

                addMoney(userId, payout);
                addWin(userId);

                safeTrackQuest(userId, {
                    bet: session.bet,
                    payout,
                    won: true,
                });

                clearSession(session);

                return interaction.update({
                    embeds: [
                        buildCashoutEmbed(
                            session,
                            false,
                        ),
                    ],
                    components: [],
                });
            }

            if (action === "skip") {
                if (session.skipsUsed >= MAX_SKIPS) {
                    session.processing = false;
                    scheduleTimeout(
                        session,
                        interaction.client,
                    );

                    return interaction.reply({
                        content:
                            "❌ Bạn đã dùng hết 52 lượt bỏ qua.",
                        ephemeral: true,
                    });
                }

                const nextCard = drawCard();

                session.currentCard = nextCard;
                session.history.push(nextCard);
                session.skipsUsed += 1;
                session.processing = false;

                scheduleTimeout(
                    session,
                    interaction.client,
                );

                return interaction.update({
                    embeds: [
                        buildGameEmbed(
                            session,
                            "⏭️ ĐÃ BỎ QUA LÁ BÀI",
                        ),
                    ],
                    components: [buildButtons(session)],
                });
            }

            if (
                action !== "higher" &&
                action !== "lower"
            ) {
                session.processing = false;
                scheduleTimeout(
                    session,
                    interaction.client,
                );

                return undefined;
            }

            const previousCard = session.currentCard;
            const stepMultiplier =
                getChoiceMultiplier(
                    previousCard,
                    action,
                );

            if (stepMultiplier <= 0) {
                session.processing = false;
                scheduleTimeout(
                    session,
                    interaction.client,
                );

                return interaction.reply({
                    content:
                        "❌ Không thể chọn hướng này với lá hiện tại.",
                    ephemeral: true,
                });
            }

            const nextCard = drawCard();

            session.history.push(nextCard);

            const won = isWinningChoice(
                previousCard,
                nextCard,
                action,
            );

            if (!won) {
                addLoss(userId);

                safeTrackQuest(userId, {
                    bet: session.bet,
                    payout: 0,
                    won: false,
                });

                clearSession(session);

                return interaction.update({
                    embeds: [
                        buildLoseEmbed(
                            session,
                            previousCard,
                            nextCard,
                            action,
                        ),
                    ],
                    components: [],
                });
            }

            session.correctGuesses += 1;
            session.multiplier *= stepMultiplier;
            session.currentCard = nextCard;

            const payout = getPayout(session);

            if (payout >= MAX_PAYOUT) {
                addMoney(userId, payout);
                addWin(userId);

                safeTrackQuest(userId, {
                    bet: session.bet,
                    payout,
                    won: true,
                });

                clearSession(session);

                return interaction.update({
                    embeds: [
                        buildCashoutEmbed(
                            session,
                            true,
                        ),
                    ],
                    components: [],
                });
            }

            session.processing = false;

            scheduleTimeout(
                session,
                interaction.client,
            );

            return interaction.update({
                embeds: [
                    buildGameEmbed(
                        session,
                        "✅ ĐOÁN ĐÚNG — CHƠI TIẾP?",
                    ),
                ],
                components: [buildButtons(session)],
            });
        } catch (error) {
            session.processing = false;

            scheduleTimeout(
                session,
                interaction.client,
            );

            console.error(
                "[Hilo] Lỗi xử lý:",
                error,
            );

            if (
                interaction.replied ||
                interaction.deferred
            ) {
                return interaction
                    .editReply({
                        content:
                            "❌ Có lỗi khi xử lý Cao hơn – Thấp hơn.",
                    })
                    .catch(() => null);
            }

            return interaction
                .reply({
                    content:
                        "❌ Có lỗi khi xử lý Cao hơn – Thấp hơn.",
                    ephemeral: true,
                })
                .catch(() => null);
        }
    }
}

module.exports = new HiloManager();