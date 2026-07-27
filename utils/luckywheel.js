const { EmbedBuilder } = require("discord.js");

const {
    addMoney,
    addShopItem,
    formatMoney,
    getCurrencyEmoji,
    getShop,
} = require("../database");

/*
 * Tỉ lệ vòng quay xuất hiện.
 *
 * 0.55 = 55%
 * 0.70 = 70%
 */
const DROP_CHANCES = {
    work: 0.55,
    dungeon: 0.7,
    dungeon_sweep: 0.7,
};

/*
 * Tỉ lệ loại phần thưởng.
 * Tổng weight hiện tại là 100.
 */
const CATEGORY_POOL = [
    {
        id: "money",
        label: "💰 TIỀN",
        weight: 50,
    },
    {
        id: "stone",
        label: "💎 ĐÁ",
        weight: 32,
    },
    {
        id: "scroll",
        label: "📜 BÍ TỊCH",
        weight: 18,
    },
];

/*
 * Đá càng ngon thì weight càng thấp.
 */
const STONE_POOL = [
    {
        itemId: "da_lo",
        min: 2,
        max: 5,
        weight: 28,
    },
    {
        itemId: "da_cho_Tau",
        min: 1,
        max: 4,
        weight: 25,
    },
    {
        itemId: "da_thach_anh",
        min: 1,
        max: 3,
        weight: 20,
    },
    {
        itemId: "da_ma_nao",
        min: 1,
        max: 2,
        weight: 14,
    },
    {
        itemId: "da_ngoc_bich",
        min: 1,
        max: 1,
        weight: 8,
    },
    {
        itemId: "da_phi_thuy",
        min: 1,
        max: 1,
        weight: 4,
    },
    {
        itemId: "da_hoa_dien",
        min: 1,
        max: 1,
        weight: 1,
    },
];

/*
 * Bí tịch cao cấp có tỉ lệ thấp để tránh phá game.
 */
const SCROLL_POOL = [
    {
        itemId: "bi_tich_rach_chu_dong",
        weight: 28,
    },
    {
        itemId: "bi_tich_rach_bi_dong",
        weight: 28,
    },
    {
        itemId: "bi_tich_thuong_chu_dong",
        weight: 16,
    },
    {
        itemId: "bi_tich_thuong_bi_dong",
        weight: 14,
    },
    {
        itemId: "bi_tich_ngau_nhien_chu_dong",
        weight: 7,
    },
    {
        itemId: "bi_tich_ngau_nhien_bi_dong",
        weight: 5,
    },
    {
        itemId: "bi_tich_cao_cap_chu_dong",
        weight: 1,
    },
    {
        itemId: "bi_tich_cao_cap_bi_dong",
        weight: 1,
    },
];

const SPIN_FRAMES = [
    ["💰 TIỀN", "💎 ĐÁ", "📜 BÍ TỊCH"],
    ["💎 ĐÁ", "📜 BÍ TỊCH", "💰 TIỀN"],
    ["📜 BÍ TỊCH", "💰 TIỀN", "💎 ĐÁ"],
    ["💰 TIỀN", "📜 BÍ TỊCH", "💎 ĐÁ"],
];

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickWeighted(entries) {
    const totalWeight = entries.reduce(
        (total, entry) => total + Number(entry.weight || 0),
        0,
    );

    let rolled = Math.random() * totalWeight;

    for (const entry of entries) {
        rolled -= Number(entry.weight || 0);

        if (rolled <= 0) {
            return entry;
        }
    }

    return entries[entries.length - 1];
}

function getMoneyRange(source) {
    /*
     * Phó bản cho nhiều tiền hơn work.
     */
    if (source === "dungeon" || source === "dungeon_sweep") {
        return [10000, 80000];
    }

    return [3000, 25000];
}

function getScrollTypeLabel(item) {
    if (item?.skillScrollType === "active") {
        return "Chủ động";
    }

    if (item?.skillScrollType === "passive") {
        return "Bị động";
    }

    return "";
}

function rollPrize(source) {
    const category = pickWeighted(CATEGORY_POOL);
    const shop = getShop();

    /*
     * Trúng tiền.
     */
    if (category.id === "money") {
        const [min, max] = getMoneyRange(source);
        const amount = randomInt(min, max);

        return {
            category,

            grant(userId) {
                addMoney(userId, amount);
            },

            text: `${getCurrencyEmoji()} **${formatMoney(amount)}**`,
        };
    }

    /*
     * Trúng đá.
     */
    if (category.id === "stone") {
        const rolledItem = pickWeighted(STONE_POOL);
        const amount = randomInt(rolledItem.min, rolledItem.max);
        const item = shop[rolledItem.itemId];

        return {
            category,

            grant(userId) {
                addShopItem(userId, rolledItem.itemId, amount);
            },

            text:
                `${item?.emoji || "💎"} ` +
                `**${item?.name || rolledItem.itemId} x${amount}**`,
        };
    }

    /*
     * Trúng bí tịch.
     */
    const rolledItem = pickWeighted(SCROLL_POOL);
    const item = shop[rolledItem.itemId];
    const typeLabel = getScrollTypeLabel(item);

    return {
        category,

        grant(userId) {
            addShopItem(userId, rolledItem.itemId, 1);
        },

        text:
            `${item?.emoji || "📜"} ` +
            `**${item?.name || rolledItem.itemId}**` +
            `${typeLabel ? ` — ${typeLabel}` : ""}`,
    };
}

function buildSpinEmbed(frame, step) {
    return new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("🎡 VÒNG QUAY MAY MẮN ĐÃ RƠI!")
        .setDescription(
            "Kim đang quay...\n\n" +
                "```\n" +
                `      ${step % 2 === 0 ? "▼" : "◆"}\n` +
                `${frame[0]}  ➜  [ ${frame[1]} ]  ➜  ${frame[2]}\n` +
                "```",
        )
        .setFooter({
            text: "Đang chọn quà ngẫu nhiên...",
        });
}

function buildResultEmbed(prize) {
    return new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle("🎉 VÒNG QUAY DỪNG LẠI!")
        .setDescription(
            `Kim chỉ vào: **${prize.category.label}**\n\n` +
                `🎁 Bạn nhận được: ${prize.text}\n\n` +
                "Quà đã được cộng thẳng vào tài khoản/kho đồ.",
        )
        .setTimestamp();
}

function addWheelEmbed(basePayload, wheelEmbed) {
    return {
        ...basePayload,

        embeds: [
            ...(basePayload.embeds || []),
            wheelEmbed,
        ],
    };
}

async function sendInitial(interaction, responseType, payload) {
    /*
     * Dùng cho interaction nút bấm.
     */
    if (responseType === "update") {
        return interaction.update(payload);
    }

    /*
     * Dùng khi interaction đã được defer trước đó.
     */
    if (responseType === "editReply") {
        return interaction.editReply(payload);
    }

    /*
     * Mặc định dùng cho slash command.
     */
    return interaction.reply(payload);
}

async function runLuckyWheel(
    interaction,
    {
        userId,
        source = "work",
        responseType = "reply",
        basePayload = {},
    },
) {
    const dropChance = Number(
        DROP_CHANCES[source] ?? DROP_CHANCES.work,
    );

    /*
     * Không rơi vòng quay thì gửi kết quả bình thường.
     */
    if (Math.random() >= dropChance) {
        return sendInitial(
            interaction,
            responseType,
            basePayload,
        );
    }

    const prize = rollPrize(source);

    try {
        /*
         * Phản hồi Discord ngay để không bị timeout interaction.
         */
        await sendInitial(
            interaction,
            responseType,
            addWheelEmbed(
                basePayload,
                buildSpinEmbed(SPIN_FRAMES[0], 0),
            ),
        );

        /*
         * Cộng quà đúng một lần.
         */
        prize.grant(userId);

        /*
         * Tạo cảm giác vòng quay đang chạy.
         */
        for (
            let index = 1;
            index < SPIN_FRAMES.length;
            index += 1
        ) {
            await sleep(index < 3 ? 500 : 700);

            await interaction.editReply(
                addWheelEmbed(
                    basePayload,
                    buildSpinEmbed(
                        SPIN_FRAMES[index],
                        index,
                    ),
                ),
            );
        }

        await sleep(750);

        /*
         * Hiện kết quả cuối cùng.
         */
        return interaction.editReply(
            addWheelEmbed(
                basePayload,
                buildResultEmbed(prize),
            ),
        );
    } catch (error) {
        console.error(
            "[LUCKY WHEEL] Animation error:",
            error,
        );

        /*
         * Animation lỗi thì vẫn cố hiện kết quả cuối.
         */
        if (interaction.replied || interaction.deferred) {
            try {
                return await interaction.editReply(
                    addWheelEmbed(
                        basePayload,
                        buildResultEmbed(prize),
                    ),
                );
            } catch (editError) {
                console.error(
                    "[LUCKY WHEEL] Final edit error:",
                    editError,
                );
            }
        }

        return undefined;
    }
}

module.exports = {
    runLuckyWheel,
};