const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");

const {
    getUser,
    transferMoney,
    claimDaily,
    formatMoney,
    getCurrencyEmoji,
    getShop,
    buyItem,
    sellItem,
    sellAllDogs,
    sellAllIphones,
    getInventory,
} = require("../database");

const economyConfig = require("../config/economy");

function isIphoneItem(item) {
    if (!item || typeof item !== "object") {
        return false;
    }

    const id = String(item.id || "").toLowerCase();
    const name = String(item.name || "").toLowerCase();
    const type = String(item.type || "").toLowerCase();

    return (
        type === "iphone" || id.includes("iphone") || name.includes("iphone")
    );
}

function cutAutocompleteName(text) {
    return text.length > 100 ? `${text.slice(0, 97)}...` : text;
}

function formatShopItemAutocompleteDetail(item) {
    const price = Number(item.price || 0).toLocaleString("vi-VN");

    if (item.type === "tu_tien_exp") {
        return `Giá ${price} | +${Number(item.exp || 0).toLocaleString("vi-VN")} exp`;
    }

    if (item.type === "breakthrough_pill") {
        return `Giá ${price} | +${Math.floor(Number(item.bonusChance || 0) * 100)}% đột phá`;
    }

    if (item.type === "root_gacha_pill") {
        return `Giá ${price} | Tẩy linh căn`;
    }

    if (item.type === "skill_scroll") {
        const typeText =
            item.skillScrollType === "active"
                ? "Chủ động"
                : item.skillScrollType === "passive"
                  ? "Bị động"
                  : "Kỹ năng";

        return `Giá ${price} | Bí tịch ${typeText}`;
    }

    if (item.type === "cultivation_chest") {
        return "Không bán | Rương Boss";
    }

    if (item.type === "tower_chest") {
        return "Không bán | Rương Leo Tháp";
    }

    return `Giá ${price}`;
}

function matchAutocomplete(
    entries,
    focusedValue,
    getName = (item) => item.name,
    getDetail = null,
) {
    const search = focusedValue.toLowerCase();

    return entries
        .filter(([id, item]) => {
            return (
                id.toLowerCase().includes(search) ||
                getName(item).toLowerCase().includes(search)
            );
        })
        .slice(0, 25)
        .map(([id, item]) => {
            const name = getName(item);
            const detail = getDetail ? getDetail(item) : "";

            return {
                name: cutAutocompleteName(
                    detail
                        ? `${item.emoji || "🎁"} ${name} | ${detail}`
                        : `${item.emoji || "🎁"} ${name}`,
                ),
                value: id,
            };
        });
}

async function autocompleteShop(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();

    const entries = Object.entries(getShop()).filter(([, item]) => {
        if (item.hidden || item.buyable === false) {
            return false;
        }

        if (item.shopCategory === "skill") {
            return false;
        }

        return true;
    });

    return interaction.respond(
        matchAutocomplete(
            entries,
            focusedValue,
            (item) => item.name,
            formatShopItemAutocompleteDetail,
        ),
    );
}

async function autocompleteInventory(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const inventoryData = getInventory(interaction.user.id);
    const shopData = getShop();

    const choices = [];

    const dogItems = inventoryData.specialItems.filter((item) => {
        return item.type === "dog";
    });

    if (dogItems.length > 0) {
        const totalDogValue = dogItems.reduce((sum, item) => {
            return sum + Math.floor(Number(item.value || 0));
        }, 0);

        choices.push({
            name: cutAutocompleteName(
                `🐶 all - Bán tất cả chó (${dogItems.length} con - ${formatMoney(totalDogValue)})`,
            ),
            value: "all",
        });
    }

    const iphoneItems = inventoryData.specialItems.filter((item) => {
        return isIphoneItem(item);
    });

    if (iphoneItems.length > 0) {
        const totalIphoneValue = iphoneItems.reduce((sum, item) => {
            return sum + Math.max(0, Math.floor(Number(item.value || 0)));
        }, 0);

        choices.push({
            name: cutAutocompleteName(
                `📱 all - Bán tất cả iPhone ` +
                    `(${iphoneItems.length} cái - ${formatMoney(totalIphoneValue)})`,
            ),
            value: "all_iphone",
        });
    }

    for (const [itemId, amount] of Object.entries(inventoryData.shopItems)) {
        if (amount > 0 && shopData[itemId]) {
            const item = shopData[itemId];

            if (item.sellable === false) {
                continue;
            }

            const parts = [`x${amount}`];

            if (item.price) {
                parts.push(
                    `bán ~${formatMoney(Math.floor(Number(item.price || 0) * (economyConfig.sellRate ?? 0.7)))}`,
                );
            }

            if (item.exp) {
                parts.push(`+${formatMoney(item.exp)} exp`);
            }

            if (item.type === "breakthrough_pill") {
                parts.push(
                    `+${Math.floor(Number(item.bonusChance || 0) * 100)}% đột phá`,
                );
            }

            if (item.type === "root_gacha_pill") {
                parts.push("tẩy linh căn");
            }

            choices.push({
                name: cutAutocompleteName(
                    `${item.emoji || "🎁"} ${item.name} (${parts.join(" - ")})`,
                ),
                value: itemId,
            });
        }
    }

    inventoryData.specialItems.forEach((item, index) => {
        const parts = [];

        if (item.weightKg) {
            parts.push(`${item.weightKg}kg`);
        }

        if (item.gemName) {
            parts.push(item.gemName);
        }

        if (item.gradeName) {
            parts.push(item.gradeName);
        }

        if (item.purity !== undefined) {
            parts.push(`${item.purity}%`);
        }

        if (item.value) {
            parts.push(`giá ${item.value}`);
        }

        const detail = parts.length > 0 ? ` (${parts.join(" - ")})` : "";

        choices.push({
            name: `${item.name}${detail}`,
            value: `special:${index}`,
        });
    });

    return interaction.respond(
        choices
            .filter((choice) => {
                return choice.name.toLowerCase().includes(focusedValue);
            })
            .slice(0, 25),
    );
}

async function balance(interaction) {
    const user = getUser(interaction.user.id);
    const coin = getCurrencyEmoji();

    return interaction.reply({
        content:
            `${coin} Tiền: ${formatMoney(user.money)}\n` +
            `🏆 Thắng: ${user.wins}\n` +
            `💀 Thua: ${user.losses}\n` +
            `🔥 Streak: ${user.dailyStreak}`,
    });
}

async function daily(interaction) {
    const result = claimDaily(interaction.user.id);
    const coin = getCurrencyEmoji();

    if (!result.success) {
        const hours = Math.floor(result.timeLeft / 1000 / 60 / 60);

        return interaction.reply({
            content: `⏳ Bạn đã điểm danh rồi!\n` + `Quay lại sau ${hours} giờ`,
            ephemeral: true,
        });
    }

    return interaction.reply({
        content:
            `🎁 Daily Reward\n\n` +
            `${coin} Nhận: ${formatMoney(result.reward)}\n` +
            `🔥 Streak: ${result.streak} ngày`,
    });
}

const SHOP_PAGE_SIZE = 10;
const INVENTORY_PAGE_SIZE = 10;

function clampPage(page, totalPages) {
    return Math.max(0, Math.min(page, totalPages - 1));
}

function getShopPageData(page = 0) {
    const shopData = getShop();
    const items = Object.entries(shopData).filter(([, item]) => {
        return !item.hidden && item.shopCategory !== "skill";
    });

    const totalPages = Math.max(1, Math.ceil(items.length / SHOP_PAGE_SIZE));
    const safePage = clampPage(page, totalPages);
    const startIndex = safePage * SHOP_PAGE_SIZE;
    const pageItems = items.slice(startIndex, startIndex + SHOP_PAGE_SIZE);

    return {
        items,
        pageItems,
        page: safePage,
        totalPages,
        startIndex,
    };
}

function buildShopEmbed(interaction, page = 0) {
    const coin = getCurrencyEmoji();
    const {
        items,
        pageItems,
        page: safePage,
        totalPages,
        startIndex,
    } = getShopPageData(page);

    const embed = new EmbedBuilder()
        .setTitle("🛒 SHOP CỦA MAMU")
        .setDescription(
            `Muốn mua thì dùng:\n` +
                `\`/mua vatpham:<món> soluong:<số lượng>\`\n\n` +
                `📄 Trang **${safePage + 1}/${totalPages}**`,
        )
        .setColor(0xf7a8c8)
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .setFooter({
            text: "Đời là thế thôi, có tiền thì mua",
        })
        .setTimestamp();

    if (items.length <= 0) {
        embed.addFields({
            name: "Trống",
            value: "Shop chưa có gì để bán",
            inline: false,
        });

        return embed;
    }

    pageItems.forEach(([itemId, item], index) => {
        let detail = `${coin} Giá: **${formatMoney(item.price)}**\n`;

        if (item.exp) {
            detail += `✨ Tu vi: **+${formatMoney(item.exp)} exp**\n`;
        }

        if (item.type === "breakthrough_pill") {
            detail += `🌩️ Đột phá: **+${Math.floor((item.bonusChance || 0) * 100)}% tỉ lệ thành công**\n`;
        }

        if (item.type === "root_gacha_pill") {
            detail += `🌱 Linh căn: **Gacha lại linh căn, mỗi viên giảm 5% tỉ lệ linh căn rác**\n`;
        }

        embed.addFields({
            name: `${startIndex + index + 1}. ${item.emoji || "🎁"} ${item.name}`,
            value: detail,
            inline: false,
        });
    });

    return embed;
}

function buildShopButtons(userId, page = 0) {
    const { totalPages } = getShopPageData(page);
    const safePage = clampPage(page, totalPages);

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`shop_prev_${userId}_${safePage}`)
            .setLabel("Trang trước")
            .setEmoji("⬅️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safePage <= 0),

        new ButtonBuilder()
            .setCustomId(`shop_page_${userId}_${safePage}`)
            .setLabel(`${safePage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),

        new ButtonBuilder()
            .setCustomId(`shop_next_${userId}_${safePage}`)
            .setLabel("Trang sau")
            .setEmoji("➡️")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(safePage >= totalPages - 1),
    );
}

async function shop(interaction) {
    return interaction.reply({
        embeds: [buildShopEmbed(interaction, 0)],
        components: [buildShopButtons(interaction.user.id, 0)],
    });
}

async function handleButton(interaction) {
    if (
        interaction.customId.startsWith("shop_prev_") ||
        interaction.customId.startsWith("shop_next_")
    ) {
        const parts = interaction.customId.split("_");
        const action = parts[1];
        const userId = parts[2];
        const currentPage = Number.parseInt(parts[3], 10) || 0;

        if (interaction.user.id !== userId) {
            return interaction.reply({
                content:
                    "❌ Đây không phải shop của bạn, tự mở `/shop` đi anh bạn.",
                ephemeral: true,
            });
        }

        const nextPage = action === "next" ? currentPage + 1 : currentPage - 1;
        const { page } = getShopPageData(nextPage);

        return interaction.update({
            embeds: [buildShopEmbed(interaction, page)],
            components: [buildShopButtons(interaction.user.id, page)],
        });
    }

    if (
        interaction.customId.startsWith("inventory_prev_") ||
        interaction.customId.startsWith("inventory_next_")
    ) {
        const parts = interaction.customId.split("_");
        const action = parts[1];
        const userId = parts[2];
        const currentPage = Number.parseInt(parts[3], 10) || 0;

        if (interaction.user.id !== userId) {
            return interaction.reply({
                content: "❌ Đây không phải kho độ của bạn.",
                ephemeral: true,
            });
        }

        const inventoryData = getInventory(interaction.user.id);
        const shopData = getShop();
        const coin = getCurrencyEmoji();

        const allItems = [];

        for (const [itemId, amount] of Object.entries(
            inventoryData.shopItems,
        )) {
            if (amount > 0 && shopData[itemId]) {
                const item = shopData[itemId];
                let value = `📦 x${amount}`;

                if (item.exp) {
                    value += `\n✨ Tu vi: +${formatMoney(item.exp)} exp mỗi cái`;
                    value += `\n🍖 Dùng: \`/dung vatpham:${itemId}\``;
                }

                if (item.type === "breakthrough_pill") {
                    value += `\n🌩️ Đột phá: +${Math.floor(item.bonusChance * 100)}% tỉ lệ thành công`;
                    value += `\n🧪 Dùng: \`/dung vatpham:${itemId}\``;
                }

                if (item.type === "root_gacha_pill") {
                    value += "\n🌱 Gacha lại linh căn";
                    value += `\n🧪 Dùng: \`/dung vatpham:${itemId}\``;
                }

                if (item.type === "skill_scroll") {
                    const typeText =
                        item.skillScrollType === "active"
                            ? "Chủ động"
                            : "Bị động";

                    value += `\n📚 Bí tịch kỹ năng: **${typeText}**`;
                    value += "\n📖 Mở bí tịch: chưa mở tính năng";
                }

                allItems.push({
                    name: `${item.emoji || "🎁"} ${item.name}`,
                    value,
                });
            }
        }

        for (const item of inventoryData.specialItems) {
            let value = "";

            if (item.weightKg) {
                value += `⚖️ ${item.weightKg}kg\n`;
            }

            if (item.gemName) {
                value += `💎 Ngọc: ${item.gemName}\n`;
            }

            if (item.gradeName) {
                value += `🏷️ Phẩm: ${item.gradeName}\n`;
            }

            if (item.purity !== undefined) {
                value += `✨ Độ tinh khiết: ${item.purity}%\n`;
            }

            if (item.sourceStoneName) {
                value += `🪨 Đá gốc: ${item.sourceStoneName}\n`;
            }

            if (item.value) {
                value += `${coin} Giá trị: ${formatMoney(item.value)}\n`;
            }

            if (!value) {
                value = "📦 x1";
            }

            allItems.push({
                name: `${item.emoji || "🎁"} ${item.name}`,
                value,
            });
        }

        const totalPages = Math.max(
            1,
            Math.ceil(allItems.length / INVENTORY_PAGE_SIZE),
        );

        const nextPage = action === "next" ? currentPage + 1 : currentPage - 1;
        const safePage = clampPage(nextPage, totalPages);

        return interaction.update({
            embeds: [
                buildInventoryEmbed(
                    interaction,
                    allItems,
                    safePage,
                    totalPages,
                ),
            ],
            components: [
                buildInventoryButtons(
                    interaction.user.id,
                    safePage,
                    totalPages,
                ),
            ],
        });
    }

    return undefined;
}

async function buy(interaction) {
    const itemId = interaction.options.getString("vatpham");
    const quantity = interaction.options.getInteger("soluong") || 1;
    const shopData = getShop();
    const item = shopData[itemId];

    if (item && item.shopCategory === "skill") {
        return interaction.reply({
            content: "❌ Bí tịch kỹ năng phải mua bằng `/muakynang`.",
            ephemeral: true,
        });
    }

    const result = buyItem(interaction.user.id, itemId, quantity);
    const coin = getCurrencyEmoji();

    if (!result.success) {
        return interaction.reply({
            content: `❌ ${result.message}`,
            ephemeral: true,
        });
    }

    let detail = "";

    if (result.item.exp) {
        detail += `✨ Tu vi: +${formatMoney(result.item.exp)} exp mỗi cái\n`;
    }

    return interaction.reply({
        content:
            `🛒 Mua thành công!\n\n` +
            `${result.item.emoji || "🎁"} ${result.item.name}\n` +
            detail +
            `📦 Số lượng: x${result.quantity}\n` +
            `${coin} Tổng tiền: ${formatMoney(result.totalPrice)}`,
    });
}

async function inventory(interaction) {
    const inventoryData = getInventory(interaction.user.id);
    const shopData = getShop();
    const coin = getCurrencyEmoji();

    const allItems = [];

    for (const [itemId, amount] of Object.entries(inventoryData.shopItems)) {
        if (amount > 0 && shopData[itemId]) {
            const item = shopData[itemId];
            let value = `📦 x${amount}`;

            if (item.exp) {
                value += `\n✨ Tu vi: +${formatMoney(item.exp)} exp mỗi cái`;
                value += `\n🍖 Dùng: \`/dung vatpham:${itemId}\``;
            }

            if (item.type === "breakthrough_pill") {
                value += `\n🌩️ Đột phá: +${Math.floor(item.bonusChance * 100)}% tỉ lệ thành công`;
                value += `\n🧪 Dùng: \`/dung vatpham:${itemId}\``;
            }

            if (item.type === "root_gacha_pill") {
                value += "\n🌱 Gacha lại linh căn";
                value += `\n🧪 Dùng: \`/dung vatpham:${itemId}\``;
            }

            if (item.type === "skill_scroll") {
                const typeText =
                    item.skillScrollType === "active" ? "Chủ động" : "Bị động";

                value += `\n📚 Bí tịch kỹ năng: **${typeText}**`;
                value += "\n📖 Mở bí tịch: chưa mở tính năng";
            }

            allItems.push({
                name: `${item.emoji || "🎁"} ${item.name}`,
                value,
            });
        }
    }

    for (const item of inventoryData.specialItems) {
        let value = "";

        if (item.weightKg) {
            value += `⚖️ ${item.weightKg}kg\n`;
        }

        if (item.gemName) {
            value += `💎 Ngọc: ${item.gemName}\n`;
        }

        if (item.gradeName) {
            value += `🏷️ Phẩm: ${item.gradeName}\n`;
        }

        if (item.purity !== undefined) {
            value += `✨ Độ tinh khiết: ${item.purity}%\n`;
        }

        if (item.sourceStoneName) {
            value += `🪨 Đá gốc: ${item.sourceStoneName}\n`;
        }

        if (item.value) {
            value += `${coin} Giá trị: ${formatMoney(item.value)}\n`;
        }

        if (!value) {
            value = "📦 x1";
        }

        allItems.push({
            name: `${item.emoji || "🎁"} ${item.name}`,
            value,
        });
    }

    const totalPages = Math.max(
        1,
        Math.ceil(allItems.length / INVENTORY_PAGE_SIZE),
    );

    const embed = buildInventoryEmbed(interaction, allItems, 0, totalPages);

    return interaction.reply({
        embeds: [embed],
        components:
            totalPages > 1
                ? [buildInventoryButtons(interaction.user.id, 0, totalPages)]
                : [],
    });
}

function buildInventoryEmbed(interaction, allItems, page = 0, totalPages = 1) {
    const safePage = clampPage(page, totalPages);
    const startIndex = safePage * INVENTORY_PAGE_SIZE;
    const pageItems = allItems.slice(
        startIndex,
        startIndex + INVENTORY_PAGE_SIZE,
    );

    const embed = new EmbedBuilder()
        .setTitle("🎒 KHO ĐỘ")
        .setColor(0xf7a8c8)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setFooter({
            text: `Trang ${safePage + 1}/${totalPages} • Có gì quý thì giấu kỹ vào`,
        })
        .setTimestamp();

    if (allItems.length <= 0) {
        embed.setDescription("Trống");
        return embed;
    }

    pageItems.forEach((item, index) => {
        embed.addFields({
            name: `${startIndex + index + 1}. ${item.name}`.slice(0, 256),
            value: item.value ? item.value.slice(0, 1024) : "📦 x1",
            inline: false,
        });
    });

    return embed;
}

function buildInventoryButtons(userId, page = 0, totalPages = 1) {
    const safePage = clampPage(page, totalPages);

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`inventory_prev_${userId}_${safePage}`)
            .setLabel("Trang trước")
            .setEmoji("⬅️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safePage <= 0),

        new ButtonBuilder()
            .setCustomId(`inventory_page_${userId}_${safePage}`)
            .setLabel(`${safePage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),

        new ButtonBuilder()
            .setCustomId(`inventory_next_${userId}_${safePage}`)
            .setLabel("Trang sau")
            .setEmoji("➡️")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(safePage >= totalPages - 1),
    );
}

async function sell(interaction) {
    const itemId = interaction.options.getString("vatpham");
    const quantity = interaction.options.getInteger("soluong") || 1;
    const coin = getCurrencyEmoji();

    if (itemId === "all") {
        const result = sellAllDogs(interaction.user.id);

        if (!result.success) {
            return interaction.reply({
                content: `❌ ${result.message}`,
                ephemeral: true,
            });
        }

        return interaction.reply({
            content:
                `💸 Đã có **${result.quantity}** con chó phải trả giá\n` +
                `${coin} Tổng nhận: **${formatMoney(result.totalPrice)}**`,
        });
    }

    if (itemId === "all_iphone") {
    const result = sellAllIphones(
        interaction.user.id,
    );

    if (!result.success) {
        return interaction.reply({
            content: `❌ ${result.message}`,
            ephemeral: true,
        });
    }

    return interaction.reply({
        content:
            `📱 Chủ tiệm Apple bất ngờ vì bạn bán **${result.quantity} iPhone**\n` +
            `${coin} Tổng nhận: **${formatMoney(result.totalPrice)}**`,
    });
}

    const result = sellItem(interaction.user.id, itemId, quantity);

    if (!result.success) {
        return interaction.reply({
            content: `❌ ${result.message}`,
            ephemeral: true,
        });
    }

    let detail = "";

    if (result.item.weightKg) {
        detail += `⚖️ ${result.item.weightKg}kg\n`;
    }

    if (result.item.gemName) {
        detail += `💎 Ngọc: ${result.item.gemName}\n`;
    }

    if (result.item.gradeName) {
        detail += `🏷️ Phẩm: ${result.item.gradeName}\n`;
    }

    if (result.item.purity !== undefined) {
        detail += `✨ Độ tinh khiết: ${result.item.purity}%\n`;
    }

    if (result.item.sourceStoneName) {
        detail += `🪨 Đá gốc: ${result.item.sourceStoneName}\n`;
    }

    if (result.item.exp) {
        detail += `✨ Tu vi: +${formatMoney(result.item.exp)} exp mỗi cái\n`;
    }

    if (result.item.type === "breakthrough_pill") {
        detail += `🌩️ Đột phá: +${Math.floor(result.item.bonusChance * 100)}% tỉ lệ thành công\n`;
    }

    return interaction.reply({
        content:
            `💸 Bán thành công!\n\n` +
            `${result.item.emoji || "🎁"} ${result.item.name}\n` +
            detail +
            `📦 Số lượng: x${result.quantity}\n` +
            `${coin} Tổng nhận: ${formatMoney(result.totalPrice)}`,
    });
}

async function transfer(interaction) {
    const targetUser = interaction.options.getUser("anhemxahoi");
    const amount = interaction.options.getInteger("sotienbothi");
    const coin = getCurrencyEmoji();

    if (targetUser.id === interaction.user.id) {
        return interaction.reply({
            content: "❌ Không thể tự chuyển tiền",
            ephemeral: true,
        });
    }

    if (targetUser.bot) {
        return interaction.reply({
            content: "❌ Không thể chuyển tiền cho bot",
            ephemeral: true,
        });
    }

    const result = transferMoney(interaction.user.id, targetUser.id, amount);

    if (!result.success) {
        return interaction.reply({
            content: `❌ ${result.message}`,
            ephemeral: true,
        });
    }

    return interaction.reply({
        content:
            `💸 Bố thí thành công!\n\n` +
            `👤 Người nhận: ${targetUser}\n` +
            `${coin} Số tiền: ${formatMoney(amount)}`,
    });
}

module.exports = {
    autocompleteShop,
    autocompleteInventory,
    balance,
    daily,
    shop,
    handleButton,
    buy,
    inventory,
    sell,
    transfer,
};
