const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} = require("discord.js");

const {
    formatMoney,
    getCurrencyEmoji,
    getShop,
    updateUser,
} = require("./database");

const economyConfig = require("./config/economy");

const MAX_TIER = 4;

const SUCCESS_BY_TARGET_TIER = {
    1: 0.85,
    2: 0.65,
    3: 0.4,
    4: 0.15,
};

/*
 * Tầng 1: quà khởi đầu.
 * Tầng 5: pool cao nhất, có Rương Tàn Tích EX.
 */
const POOLS = [
    [
        {
            type: "money",
            min: 5000,
            max: 30000,
            weight: 35,
        },
        {
            type: "item",
            itemId: "da_thach_anh",
            min: 2,
            max: 5,
            weight: 14,
        },
        {
            type: "item",
            itemId: "da_ma_nao",
            min: 1,
            max: 3,
            weight: 10,
        },
        {
            type: "item",
            itemId: "cam_lon_tang_trong",
            min: 1,
            max: 3,
            weight: 13,
        },
        {
            type: "item",
            itemId: "cam_lon_xin_vl",
            min: 1,
            max: 2,
            weight: 10,
        },
        {
            type: "item",
            itemId: "bi_tich_rach_chu_dong",
            amount: 1,
            weight: 7,
        },
        {
            type: "item",
            itemId: "bi_tich_rach_bi_dong",
            amount: 1,
            weight: 7,
        },
        {
            type: "item",
            itemId: "ruong_phap_bao_rach",
            amount: 1,
            weight: 4,
            riskValue: 50000,
        },
    ],

    [
        {
            type: "money",
            min: 40000,
            max: 150000,
            weight: 27,
        },
        {
            type: "item",
            itemId: "da_ngoc_bich",
            min: 1,
            max: 3,
            weight: 14,
        },
        {
            type: "item",
            itemId: "da_phi_thuy",
            min: 1,
            max: 2,
            weight: 8,
        },
        {
            type: "item",
            itemId: "cam_on_em_vi_tat_ca",
            min: 1,
            max: 3,
            weight: 14,
        },
        {
            type: "item",
            itemId: "bi_tich_thuong_chu_dong",
            amount: 1,
            weight: 10,
        },
        {
            type: "item",
            itemId: "bi_tich_thuong_bi_dong",
            amount: 1,
            weight: 10,
        },
        {
            type: "item",
            itemId: "ruong_phap_bao_thuong",
            amount: 1,
            weight: 12,
            riskValue: 180000,
        },
        {
            type: "item",
            itemId: "ruong_phap_bao_tinh_anh",
            amount: 1,
            weight: 5,
            riskValue: 350000,
        },
    ],

    [
        {
            type: "money",
            min: 200000,
            max: 800000,
            weight: 20,
        },
        {
            type: "item",
            itemId: "da_hoa_dien",
            min: 1,
            max: 3,
            weight: 13,
        },
        {
            type: "item",
            itemId: "da_mamu",
            amount: 1,
            weight: 8,
        },
        {
            type: "item",
            itemId: "bi_tich_cao_cap_chu_dong",
            amount: 1,
            weight: 11,
        },
        {
            type: "item",
            itemId: "bi_tich_cao_cap_bi_dong",
            amount: 1,
            weight: 11,
        },
        {
            type: "item",
            itemId: "bi_tich_thien_giai_chu_dong",
            amount: 1,
            weight: 5,
        },
        {
            type: "item",
            itemId: "bi_tich_thien_giai_bi_dong",
            amount: 1,
            weight: 5,
        },
        {
            type: "item",
            itemId: "ruong_phap_bao_tinh_anh",
            amount: 1,
            weight: 15,
            riskValue: 350000,
        },
        {
            type: "item",
            itemId: "ruong_phap_bao_mamu",
            amount: 1,
            weight: 12,
            riskValue: 700000,
        },
    ],

    [
        {
            type: "money",
            min: 800000,
            max: 2500000,
            weight: 25,
        },
        {
            type: "item",
            itemId: "da_mamu",
            min: 2,
            max: 5,
            weight: 18,
        },
        {
            type: "item",
            itemId: "bi_tich_thien_giai_chu_dong",
            amount: 1,
            weight: 13,
        },
        {
            type: "item",
            itemId: "bi_tich_thien_giai_bi_dong",
            amount: 1,
            weight: 13,
        },
        {
            type: "item",
            itemId: "ruong_phap_bao_tinh_anh",
            min: 1,
            max: 2,
            weight: 17,
            riskValue: 350000,
        },
        {
            type: "item",
            itemId: "ruong_phap_bao_mamu",
            amount: 1,
            weight: 14,
            riskValue: 700000,
        },
    ],

    [
        {
            type: "money",
            min: 3000000,
            max: 10000000,
            weight: 28,
        },
        {
            type: "item",
            itemId: "da_mamu",
            min: 5,
            max: 12,
            weight: 18,
        },
        {
            type: "item",
            itemId: "bi_tich_mamu_cam_thuat_chu_dong",
            amount: 1,
            weight: 13,
        },
        {
            type: "item",
            itemId: "bi_tich_mamu_cam_thuat_bi_dong",
            amount: 1,
            weight: 13,
        },
        {
            type: "item",
            itemId: "ruong_phap_bao_mamu",
            min: 1,
            max: 2,
            weight: 23,
            riskValue: 700000,
        },
        {
            type: "item",
            itemId: "ruong_tan_tich_ex",
            amount: 1,
            weight: 5,
            riskValue: 12000000,
        },
    ],
];

const SPIN_FRAMES = [
    "💰  ➜  🌾  ➜  💎",
    "📜  ➜  🎁  ➜  💰",
    "💎  ➜  📜  ➜  🌈",
    "🎁  ➜  💰  ➜  📜",
];

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function randomInt(min, max) {
    return Math.floor(
        Math.random() * (max - min + 1),
    ) + min;
}

function pickWeighted(entries) {
    const total = entries.reduce(
        (sum, entry) => {
            return sum + Number(entry.weight || 0);
        },
        0,
    );

    let roll = Math.random() * total;

    for (const entry of entries) {
        roll -= Number(entry.weight || 0);

        if (roll <= 0) {
            return entry;
        }
    }

    return entries[entries.length - 1];
}

function rollPrize(tier) {
    const entry = pickWeighted(POOLS[tier]);

    if (entry.type === "money") {
        return {
            type: "money",
            amount: randomInt(
                entry.min,
                entry.max,
            ),
        };
    }

    return {
        type: "item",
        itemId: entry.itemId,
        amount:
            entry.amount ||
            randomInt(entry.min, entry.max),
        riskValue: Number(entry.riskValue || 0),
    };
}

function ensureWheel(user) {
    if (
        !user.dailyWheel ||
        typeof user.dailyWheel !== "object"
    ) {
        user.dailyWheel = {
            tickets: 0,
            pending: null,
        };
    }

    user.dailyWheel.tickets = Math.max(
        0,
        Math.floor(
            Number(user.dailyWheel.tickets || 0),
        ),
    );

    if (!user.dailyWheel.pending) {
        user.dailyWheel.pending = null;
    }

    return user.dailyWheel;
}

function getPrizeValue(prize) {
    if (prize.type === "money") {
        return Number(prize.amount || 0);
    }

    const item = getShop()[prize.itemId];

    const unitValue = Math.max(
        Number(item?.price || 0),
        Number(prize.riskValue || 0),
    );

    return (
        unitValue *
        Math.max(1, Number(prize.amount || 1))
    );
}

/*
 * Tỷ lệ nền theo tầng:
 *
 * Tầng 1 -> 2: 85%
 * Tầng 2 -> 3: 65%
 * Tầng 3 -> 4: 40%
 * Tầng 4 -> 5: 15%
 *
 * Món đang giữ càng đắt sẽ bị trừ thêm,
 * tối đa 12%.
 */
function getSuccessChance(pending) {
    const targetTier =
        Number(pending.tier || 0) + 1;

    if (targetTier > MAX_TIER) {
        return 0;
    }

    const baseChance = Number(
        SUCCESS_BY_TARGET_TIER[targetTier] || 0,
    );

    const valuePenalty = Math.min(
        0.12,
        Math.floor(
            getPrizeValue(pending.prize) / 100000,
        ) * 0.01,
    );

    return Math.max(
        0.03,
        baseChance - valuePenalty,
    );
}

function toPublicState(wheel) {
    return {
        tickets: wheel.tickets,

        pending: wheel.pending
            ? {
                  ...wheel.pending,

                  successChance:
                      getSuccessChance(
                          wheel.pending,
                      ),

                  canGreed:
                      wheel.pending.tier <
                      MAX_TIER,
              }
            : null,
    };
}

function openWheel(
    userId,
    grantTicket = false,
) {
    return updateUser(userId, (user) => {
        const wheel = ensureWheel(user);

        if (grantTicket) {
            /*
             * config/economy.js của bạn đang để 1,
             * nên mỗi ngày chỉ cộng 1 lượt.
             */
            wheel.tickets += Math.max(
                1,
                Math.floor(
                    Number(
                        economyConfig.daily
                            ?.wheel
                            ?.spinsPerDay || 1,
                    ),
                ),
            );
        }

        /*
         * Nếu còn quà chưa quyết định,
         * không quay đè quà cũ.
         */
        if (wheel.pending) {
            return {
                success: true,
                resumed: true,
                ...toPublicState(wheel),
            };
        }

        if (wheel.tickets <= 0) {
            return {
                success: false,
                message:
                    "Bạn không còn lượt quay điểm danh.",
                ...toPublicState(wheel),
            };
        }

        wheel.tickets -= 1;

        wheel.pending = {
            id:
                Date.now().toString(36) +
                Math.random()
                    .toString(36)
                    .slice(2, 8),

            tier: 0,
            prize: rollPrize(0),
            createdAt: Date.now(),
        };

        return {
            success: true,
            resumed: false,
            ...toPublicState(wheel),
        };
    });
}

function grantPrize(user, prize) {
    if (prize.type === "money") {
        user.money =
            Number(user.money || 0) +
            Number(prize.amount || 0);

        return;
    }

    if (!user.inventory) {
        user.inventory = {};
    }

    user.inventory[prize.itemId] =
        Number(
            user.inventory[prize.itemId] || 0,
        ) + Number(prize.amount || 1);
}

function resolveWheel(
    userId,
    pendingId,
    action,
) {
    return updateUser(userId, (user) => {
        const wheel = ensureWheel(user);
        const pending = wheel.pending;

        /*
         * Chống bấm cùng một nút hai lần.
         */
        if (
            !pending ||
            pending.id !== pendingId
        ) {
            return {
                success: false,
                message:
                    "Lượt quay này đã được xử lý rồi.",
                ...toPublicState(wheel),
            };
        }

        if (action === "take") {
            const prize = pending.prize;

            grantPrize(user, prize);
            wheel.pending = null;

            return {
                success: true,
                outcome: "taken",
                prize,
                ...toPublicState(wheel),
            };
        }

        if (
            action !== "greed" ||
            pending.tier >= MAX_TIER
        ) {
            return {
                success: false,
                message:
                    "Không thể tham thêm ở tầng này.",
                ...toPublicState(wheel),
            };
        }

        const successChance =
            getSuccessChance(pending);

        /*
         * Tham thất bại:
         * xóa toàn bộ quà đang giữ.
         */
        if (
            Math.random() >= successChance
        ) {
            const lostPrize = pending.prize;

            wheel.pending = null;

            return {
                success: true,
                outcome: "lost",
                lostPrize,
                successChance,
                ...toPublicState(wheel),
            };
        }

        /*
         * Tham thành công:
         * chuyển sang pool tầng tiếp theo.
         */
        pending.tier += 1;
        pending.prize =
            rollPrize(pending.tier);

        return {
            success: true,
            outcome: "upgraded",
            previousSuccessChance:
                successChance,
            ...toPublicState(wheel),
        };
    });
}

function formatPrize(prize) {
    if (prize.type === "money") {
        return (
            `${getCurrencyEmoji()} ` +
            `**${formatMoney(prize.amount)}**`
        );
    }

    const item = getShop()[prize.itemId];

    return (
        `${item?.emoji || "🎁"} ` +
        `**${item?.name || prize.itemId}** ` +
        `x${Number(prize.amount || 1)}`
    );
}

function buildWheelEmbed(
    state,
    notice = "",
) {
    const pending = state.pending;

    const success = Math.round(
        pending.successChance * 100,
    );

    const lose = 100 - success;

    return new EmbedBuilder()
        .setColor(
            pending.canGreed
                ? 0xffc107
                : 0xff2d95,
        )
        .setTitle(
            pending.canGreed
                ? "🎡 VÒNG QUAY ĐIỂM DANH"
                : "🌈 ĐÃ CHẠM TẦNG CAO NHẤT!",
        )
        .setDescription(
            `${notice ? `${notice}\n\n` : ""}` +
                `🎁 Quà đang giữ: ` +
                `${formatPrize(pending.prize)}\n` +
                `📈 Tầng quà: ` +
                `**${pending.tier + 1}/5**\n` +
                `🎟️ Lượt quay còn lại: ` +
                `**${state.tickets}**\n\n` +
                (
                    pending.canGreed
                        ? (
                            `😈 Tham: ` +
                            `**${success}% thành công**, ` +
                            `**${lose}% mất sạch**.\n` +
                            "Quà càng đắt và càng gần " +
                            "Rương EX thì càng khó thành công."
                        )
                        : (
                            "Đây là pool cao nhất, " +
                            "hãy nhận quà."
                        )
                ),
        )
        .setFooter({
            text:
                "Quà chỉ được cộng sau khi " +
                "bấm Lấy quà.",
        });
}

function buildWheelButtons(
    userId,
    state,
) {
    const pending = state.pending;

    const row =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `dailywheel_take_` +
                        `${userId}_` +
                        `${pending.id}`,
                    )
                    .setLabel("Lấy quà")
                    .setEmoji("✅")
                    .setStyle(
                        ButtonStyle.Success,
                    ),
            );

    if (pending.canGreed) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `dailywheel_greed_` +
                    `${userId}_` +
                    `${pending.id}`,
                )
                .setLabel(
                    `Tham (` +
                    `${Math.round(
                        pending.successChance *
                            100,
                    )}% thắng)`,
                )
                .setEmoji("😈")
                .setStyle(
                    ButtonStyle.Danger,
                ),
        );
    }

    return [row];
}

function buildNextButton(
    userId,
    tickets,
) {
    if (tickets <= 0) {
        return [];
    }

    return [
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `dailywheel_next_` +
                        `${userId}`,
                    )
                    .setLabel(
                        `Quay lượt tiếp ` +
                        `(${tickets})`,
                    )
                    .setEmoji("🎡")
                    .setStyle(
                        ButtonStyle.Primary,
                    ),
            ),
    ];
}

function buildSpinEmbed(index) {
    return new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(
            "🎡 VÒNG QUAY ĐANG QUAY...",
        )
        .setDescription(
            "```\n" +
                `       ${
                    index % 2 === 0
                        ? "▼"
                        : "◆"
                }\n` +
                ` ${SPIN_FRAMES[index]}\n` +
                "```",
        );
}

async function showWheel(
    interaction,
    state,
    content,
    responseType = "reply",
) {
    /*
     * Nếu đang có quà cũ chưa xử lý,
     * hiện lại quà đó thay vì quay đè.
     */
    if (state.resumed) {
        const payload = {
            content,
            embeds: [
                buildWheelEmbed(state),
            ],
            components:
                buildWheelButtons(
                    interaction.user.id,
                    state,
                ),
        };

        if (responseType === "update") {
            return interaction.update(
                payload,
            );
        }

        return interaction.reply(payload);
    }

    const firstPayload = {
        content,
        embeds: [buildSpinEmbed(0)],
        components: [],
    };

    if (responseType === "update") {
        await interaction.update(
            firstPayload,
        );
    } else {
        await interaction.reply(
            firstPayload,
        );
    }

    for (
        let index = 1;
        index < SPIN_FRAMES.length;
        index += 1
    ) {
        await sleep(350 + index * 100);

        await interaction.editReply({
            content,
            embeds: [
                buildSpinEmbed(index),
            ],
            components: [],
        });
    }

    await sleep(500);

    return interaction.editReply({
        content,
        embeds: [
            buildWheelEmbed(state),
        ],
        components:
            buildWheelButtons(
                interaction.user.id,
                state,
            ),
    });
}

async function start(
    interaction,
    content,
    grantTicket = false,
) {
    const state = openWheel(
        interaction.user.id,
        grantTicket,
    );

    if (!state.success) {
        return interaction.reply({
            content: `❌ ${state.message}`,
            ephemeral: true,
        });
    }

    return showWheel(
        interaction,
        state,
        content,
        "reply",
    );
}

async function handleButton(interaction) {
    const nextMatch =
        interaction.customId.match(
            /^dailywheel_next_(\d+)$/,
        );

    if (nextMatch) {
        const userId = nextMatch[1];

        if (
            interaction.user.id !== userId
        ) {
            return interaction.reply({
                content:
                    "❌ Đây không phải vòng quay của bạn.",
                ephemeral: true,
            });
        }

        const state = openWheel(
            userId,
            false,
        );

        if (!state.success) {
            return interaction.reply({
                content:
                    `❌ ${state.message}`,
                ephemeral: true,
            });
        }

        return showWheel(
            interaction,
            state,
            "🎟️ Đang dùng lượt quay tiếp theo...",
            "update",
        );
    }

    const actionMatch =
        interaction.customId.match(
            /^dailywheel_(take|greed)_(\d+)_([a-z0-9]+)$/,
        );

    if (!actionMatch) {
        return undefined;
    }

    const [
        ,
        action,
        userId,
        pendingId,
    ] = actionMatch;

    if (
        interaction.user.id !== userId
    ) {
        return interaction.reply({
            content:
                "❌ Đây không phải phần quà của bạn.",
            ephemeral: true,
        });
    }

    const result = resolveWheel(
        userId,
        pendingId,
        action,
    );

    if (!result.success) {
        return interaction.reply({
            content: `❌ ${result.message}`,
            ephemeral: true,
        });
    }

    if (
        result.outcome === "upgraded"
    ) {
        return interaction.update({
            content: "",
            embeds: [
                buildWheelEmbed(
                    result,
                    `🔥 **THAM THÀNH CÔNG!** ` +
                        `Bạn đã vượt cửa ` +
                        `${Math.round(
                            result
                                .previousSuccessChance *
                                100,
                        )}%.`,
                ),
            ],
            components:
                buildWheelButtons(
                    userId,
                    result,
                ),
        });
    }

    if (result.outcome === "lost") {
        return interaction.update({
            content: "",
            embeds: [
                new EmbedBuilder()
                    .setColor(0x8b0000)
                    .setTitle(
                        "💀 THAM THẤT BẠI — MẤT TẤT CẢ!",
                    )
                    .setDescription(
                        `Bạn đã đánh mất ` +
                            `${formatPrize(
                                result.lostPrize,
                            )}.\n\n` +
                            `Cửa thành công lúc bấm là ` +
                            `**${Math.round(
                                result.successChance *
                                    100,
                            )}%**.`,
                    ),
            ],
            components:
                buildNextButton(
                    userId,
                    result.tickets,
                ),
        });
    }

    return interaction.update({
        content: "",
        embeds: [
            new EmbedBuilder()
                .setColor(0x2ecc71)
                .setTitle(
                    "✅ ĐÃ NHẬN QUÀ!",
                )
                .setDescription(
                    `${formatPrize(
                        result.prize,
                    )} đã được cộng vào ` +
                        "tài khoản/kho đồ.",
                ),
        ],
        components:
            buildNextButton(
                userId,
                result.tickets,
            ),
    });
}

module.exports = {
    handleButton,
    start,
};