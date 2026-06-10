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
    getCurrencyEmoji,
    formatMoney,
} = require("./database");

/*
 * Kết quả thật sự 50/50.
 * Payout x1.96 tạo house edge khoảng 2% mỗi lần lật.
 */
const PAYOUT_MULTIPLIER = 1.96;

const MIN_BET = 100;
const MAX_BET = 50000;

/*
 * Chặn chuỗi thắng làm tiền tăng vô hạn.
 * Có thể chỉnh con số này.
 */
const MAX_PAYOUT = 10000000;

/*
 * Không thao tác trong 2 phút:
 * hệ thống tự rút số tiền đang giữ.
 */
const SESSION_TIMEOUT_MS = 2 * 60 * 1000;

const activeFlipSessions = new Map();

const SIDES = {
    face: {
        id: "face",
        name: "Mặt Lợn",
        emoji: "🐷",
    },

    butt: {
        id: "butt",
        name: "Đít Lợn",
        emoji: "🍑",
    },
};

function createSessionId() {
    return `${Date.now()}${Math.floor(
        Math.random() * 10000,
    )}`;
}

function getSessionKey(userId) {
    return String(userId);
}

function getPotentialPayout(pot) {
    return Math.min(
        MAX_PAYOUT,
        Math.floor(
            Number(pot || 0) *
                PAYOUT_MULTIPLIER,
        ),
    );
}

function buildSideButtons(
    session,
    allowCashout = false,
    disabled = false,
) {
    const row =
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `flip_face_${session.userId}_${session.id}`,
                )
                .setLabel("Mặt Lợn")
                .setEmoji("🐷")
                .setStyle(
                    ButtonStyle.Primary,
                )
                .setDisabled(disabled),

            new ButtonBuilder()
                .setCustomId(
                    `flip_butt_${session.userId}_${session.id}`,
                )
                .setLabel("Đít Lợn")
                .setEmoji("🍑")
                .setStyle(
                    ButtonStyle.Primary,
                )
                .setDisabled(disabled),
        );

    if (allowCashout) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `flip_cashout_${session.userId}_${session.id}`,
                )
                .setLabel("Rút tiền")
                .setEmoji("💰")
                .setStyle(
                    ButtonStyle.Success,
                )
                .setDisabled(disabled),
        );
    }

    return row;
}

function buildStartEmbed(
    interaction,
    session,
) {
    const coin = getCurrencyEmoji();

    return new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(
            "🐷 FLIP LỢN — CHỌN MỘT MẶT",
        )
        .setDescription(
            `${interaction.user} đã đặt cược.\n\n` +
                `💰 Tiền cược: **${coin} ${formatMoney(
                    session.bet,
                )}**\n` +
                `🎲 Tỉ lệ kết quả: **50% / 50%**\n` +
                `📈 Mỗi lần thắng: **x${PAYOUT_MULTIPLIER}**\n\n` +
                `Hãy chọn **Mặt Lợn** hoặc **Đít Lợn**.`,
        )
        .setFooter({
            text:
                "Thắng có thể lật tiếp hoặc rút tiền.",
        })
        .setTimestamp();
}

function buildWinEmbed(
    interaction,
    session,
    selectedSide,
    resultSide,
    reachedCap,
) {
    const coin = getCurrencyEmoji();

    const nextPayout =
        getPotentialPayout(session.pot);

    return new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle(
            reachedCap
                ? "🏆 FLIP LỢN — CHẠM GIỚI HẠN"
                : "🐷 FLIP LỢN — THẮNG",
        )
        .setDescription(
            `${interaction.user} chọn ${selectedSide.emoji} **${selectedSide.name}**.\n\n` +
                `🎲 Kết quả: ${resultSide.emoji} **${resultSide.name}**\n` +
                `✅ Bạn đã đoán đúng!\n\n` +
                `🔢 Chuỗi thắng: **${session.winStreak}**\n` +
                `💰 Tiền đang giữ: **${coin} ${formatMoney(
                    session.pot,
                )}**\n` +
                (
                    reachedCap
                        ? `🏦 Đã chạm mức trả thưởng tối đa và tự động rút tiền.`
                        : `🚀 Nếu thắng lượt tiếp: **${coin} ${formatMoney(
                              nextPayout,
                          )}**\n\n` +
                          `Bạn muốn **lật tiếp** hay **rút tiền**?`
                ),
        )
        .setFooter({
            text:
                "Lật tiếp mà thua sẽ mất toàn bộ tiền đang giữ.",
        })
        .setTimestamp();
}

function buildLoseEmbed(
    interaction,
    session,
    selectedSide,
    resultSide,
) {
    const coin = getCurrencyEmoji();
    const newBalance = getBalance(
        session.userId,
    );

    return new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle(
            "🐷 FLIP LỢN — THUA",
        )
        .setDescription(
            `${interaction.user} chọn ${selectedSide.emoji} **${selectedSide.name}**.\n\n` +
                `🎲 Kết quả: ${resultSide.emoji} **${resultSide.name}**\n` +
                `❌ Bạn đã đoán sai.\n\n` +
                `🔥 Chuỗi dừng tại: **${session.winStreak} lần thắng**\n` +
                `💸 Mất toàn bộ tiền đang giữ: **${coin} ${formatMoney(
                    session.pot,
                )}**\n` +
                `💼 Số dư hiện tại: **${coin} ${formatMoney(
                    newBalance,
                )}**`,
        )
        .setTimestamp();
}

function buildCashoutEmbed(
    interaction,
    session,
    auto = false,
) {
    const coin = getCurrencyEmoji();

    const newBalance = getBalance(
        session.userId,
    );

    const profit =
        session.pot - session.bet;

    return new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(
            auto
                ? "⏰ FLIP LỢN — TỰ ĐỘNG RÚT"
                : "💰 FLIP LỢN — RÚT TIỀN",
        )
        .setDescription(
            `${interaction?.user || `<@${session.userId}>`} đã dừng cuộc chơi.\n\n` +
                `🔥 Chuỗi thắng: **${session.winStreak}**\n` +
                `🎁 Nhận về: **${coin} ${formatMoney(
                    session.pot,
                )}**\n` +
                `📈 Lợi nhuận: **${coin} ${formatMoney(
                    profit,
                )}**\n` +
                `💼 Số dư mới: **${coin} ${formatMoney(
                    newBalance,
                )}**`,
        )
        .setTimestamp();
}

function clearSession(session) {
    if (session?.timeout) {
        clearTimeout(session.timeout);
    }

    activeFlipSessions.delete(
        getSessionKey(session.userId),
    );
}

function scheduleSessionTimeout(
    session,
    client,
) {
    if (session.timeout) {
        clearTimeout(session.timeout);
    }

    session.timeout = setTimeout(
        async () => {
            const currentSession =
                activeFlipSessions.get(
                    getSessionKey(
                        session.userId,
                    ),
                );

            if (
                !currentSession ||
                currentSession.id !==
                    session.id ||
                currentSession.processing
            ) {
                return;
            }

            currentSession.processing = true;

            addMoney(
                currentSession.userId,
                currentSession.pot,
            );

            clearSession(
                currentSession,
            );

            const channel =
                await client.channels
                    .fetch(
                        currentSession.channelId,
                    )
                    .catch(() => null);

            const message =
                channel?.isTextBased()
                    ? await channel.messages
                          .fetch(
                              currentSession.messageId,
                          )
                          .catch(
                              () => null,
                          )
                    : null;

            if (message) {
                await message
                    .edit({
                        embeds: [
                            buildCashoutEmbed(
                                null,
                                currentSession,
                                true,
                            ),
                        ],
                        components: [],
                    })
                    .catch(() => null);
            }
        },
        SESSION_TIMEOUT_MS,
    );
}

class FlipManager {
    async play(interaction) {
        const bet =
            interaction.options.getInteger(
                "cuoc",
            );

        const userId =
            interaction.user.id;

        const coin =
            getCurrencyEmoji();

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

        const existingSession =
            activeFlipSessions.get(
                getSessionKey(userId),
            );

        if (existingSession) {
            return interaction.reply({
                content:
                    "❌ Bạn đang có một ván Flip Lợn chưa kết thúc.",
                ephemeral: true,
            });
        }

        const balance =
            getBalance(userId);

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

        const removeResult =
            removeMoney(userId, bet);

        if (!removeResult.success) {
            return interaction.reply({
                content:
                    `❌ ${removeResult.message}`,
                ephemeral: true,
            });
        }

        const session = {
            id: createSessionId(),

            userId:
                String(userId),

            bet,
            pot: bet,

            round: 1,
            winStreak: 0,

            processing: false,

            channelId:
                interaction.channelId,

            messageId: null,

            createdAt: Date.now(),
            timeout: null,
        };

        activeFlipSessions.set(
            getSessionKey(userId),
            session,
        );

        const message =
            await interaction.reply({
                embeds: [
                    buildStartEmbed(
                        interaction,
                        session,
                    ),
                ],

                components: [
                    buildSideButtons(
                        session,
                        false,
                    ),
                ],

                fetchReply: true,
            });

        session.messageId =
            message.id;

        scheduleSessionTimeout(
            session,
            interaction.client,
        );

        return undefined;
    }

    async handleButton(interaction) {
        if (
            !interaction.customId.startsWith(
                "flip_",
            )
        ) {
            return undefined;
        }

        const parts =
            interaction.customId.split(
                "_",
            );

        const action = parts[1];
        const userId = parts[2];
        const sessionId =
            parts.slice(3).join("_");

        if (
            String(interaction.user.id) !==
            String(userId)
        ) {
            return interaction.reply({
                content:
                    "❌ Đây không phải ván Flip Lợn của bạn.",
                ephemeral: true,
            });
        }

        const session =
            activeFlipSessions.get(
                getSessionKey(userId),
            );

        if (
            !session ||
            session.id !== sessionId
        ) {
            return interaction.reply({
                content:
                    "❌ Ván Flip Lợn đã kết thúc hoặc hết hạn.",
                ephemeral: true,
            });
        }

        if (session.processing) {
            return interaction.reply({
                content:
                    "⏳ Lượt lật đang được xử lý.",
                ephemeral: true,
            });
        }

        session.processing = true;

        if (session.timeout) {
            clearTimeout(
                session.timeout,
            );
        }

        try {
            if (action === "cashout") {
                addMoney(
                    session.userId,
                    session.pot,
                );

                clearSession(session);

                return interaction.update({
                    embeds: [
                        buildCashoutEmbed(
                            interaction,
                            session,
                            false,
                        ),
                    ],
                    components: [],
                });
            }

            const selectedSide =
                SIDES[action];

            if (!selectedSide) {
                session.processing = false;

                return interaction.reply({
                    content:
                        "❌ Mặt được chọn không hợp lệ.",
                    ephemeral: true,
                });
            }

            /*
             * Kết quả thật sự 50/50.
             */
            const resultSide =
                Math.random() < 0.5
                    ? SIDES.face
                    : SIDES.butt;

            const isWin =
                resultSide.id ===
                selectedSide.id;

            if (!isWin) {
                const lostPot =
                    session.pot;

                session.pot =
                    lostPot;

                clearSession(session);

                return interaction.update({
                    embeds: [
                        buildLoseEmbed(
                            interaction,
                            session,
                            selectedSide,
                            resultSide,
                        ),
                    ],
                    components: [],
                });
            }

            session.winStreak += 1;
            session.round += 1;

            session.pot =
                getPotentialPayout(
                    session.pot,
                );

            const reachedCap =
                session.pot >=
                MAX_PAYOUT;

            if (reachedCap) {
                addMoney(
                    session.userId,
                    session.pot,
                );

                clearSession(session);

                return interaction.update({
                    embeds: [
                        buildWinEmbed(
                            interaction,
                            session,
                            selectedSide,
                            resultSide,
                            true,
                        ),
                    ],
                    components: [],
                });
            }

            session.processing = false;

            scheduleSessionTimeout(
                session,
                interaction.client,
            );

            return interaction.update({
                embeds: [
                    buildWinEmbed(
                        interaction,
                        session,
                        selectedSide,
                        resultSide,
                        false,
                    ),
                ],

                components: [
                    buildSideButtons(
                        session,
                        true,
                    ),
                ],
            });
        } catch (error) {
            session.processing = false;

            scheduleSessionTimeout(
                session,
                interaction.client,
            );

            console.error(
                "[Flip] Lỗi xử lý nút:",
                error,
            );

            if (
                interaction.replied ||
                interaction.deferred
            ) {
                return interaction
                    .editReply({
                        content:
                            "❌ Có lỗi khi xử lý Flip Lợn.",
                    })
                    .catch(() => null);
            }

            return interaction
                .reply({
                    content:
                        "❌ Có lỗi khi xử lý Flip Lợn.",
                    ephemeral: true,
                })
                .catch(() => null);
        }
    }
}

module.exports = new FlipManager();