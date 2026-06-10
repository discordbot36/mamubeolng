const { addMoney, formatMoney, getCurrencyEmoji } = require("./database");

const adminConfig = require("./config/admin");

function isAllowed(userId) {
    const allowedUserIds = Array.isArray(adminConfig.allowedUserIds)
        ? adminConfig.allowedUserIds.map(String)
        : [];

    return allowedUserIds.includes(String(userId));
}

function isValidAmount(amount) {
    return Number.isInteger(amount) && amount > 0;
}

class AdminManager {
    async addMoney(interaction) {
        if (!isAllowed(interaction.user.id)) {
            return interaction.reply({
                content: adminConfig.messages.noPermission,
                ephemeral: true,
            });
        }

        const targetUser = interaction.options.getUser("user");
        const amount = interaction.options.getInteger("amount");
        const coin = getCurrencyEmoji();

        if (!isValidAmount(amount)) {
            return interaction.reply({
                content: adminConfig.messages.invalidAmount,
                ephemeral: true,
            });
        }

        if (targetUser.bot) {
            return interaction.reply({
                content: "❌ Không cộng tiền cho bot",
                ephemeral: true,
            });
        }

        addMoney(targetUser.id, amount);

        return interaction.reply({
            content:
                `✅ Đã cộng tiền\n\n` +
                `👤 User: ${targetUser}\n` +
                `${coin} Số tiền: ${formatMoney(amount)}`,
            ephemeral: true,
        });
    }

    async removeMoney(interaction) {
        if (!isAllowed(interaction.user.id)) {
            return interaction.reply({
                content: adminConfig.messages.noPermission,
                ephemeral: true,
            });
        }

        const targetUser = interaction.options.getUser("user");
        const amount = interaction.options.getInteger("amount");
        const coin = getCurrencyEmoji();

        if (!isValidAmount(amount)) {
            return interaction.reply({
                content: adminConfig.messages.invalidAmount,
                ephemeral: true,
            });
        }

        if (targetUser.bot) {
            return interaction.reply({
                content: "❌ Không trừ tiền bot",
                ephemeral: true,
            });
        }

        addMoney(targetUser.id, -amount);

        return interaction.reply({
            content:
                `✅ Đã trừ tiền\n\n` +
                `👤 User: ${targetUser}\n` +
                `${coin} Số tiền: ${formatMoney(amount)}`,
            ephemeral: true,
        });
    }
    async anonSay(interaction) {
        if (!isAllowed(interaction.user.id)) {
            return interaction.reply({
                content: adminConfig.messages.noPermission,
                ephemeral: true,
            });
        }

        const channel = interaction.options.getChannel("kenh");
        const content = interaction.options.getString("noidung");

        if (
            !channel ||
            !channel.isTextBased() ||
            typeof channel.send !== "function"
        ) {
            return interaction.reply({
                content: "❌ Kênh này không gửi tin nhắn được.",
                ephemeral: true,
            });
        }

        const botMember = interaction.guild.members.me;

        if (
            botMember &&
            channel.permissionsFor(botMember) &&
            !channel.permissionsFor(botMember).has("SendMessages")
        ) {
            return interaction.reply({
                content: "❌ Bot không có quyền gửi tin nhắn trong kênh này.",
                ephemeral: true,
            });
        }

        if (!content || content.trim().length <= 0) {
            return interaction.reply({
                content: "❌ Nội dung không được để trống.",
                ephemeral: true,
            });
        }

        await channel.send({
            content: content.trim(),
            allowedMentions: {
                parse: [],
            },
        });

        console.log(
            `[ANON SAY] ${interaction.user.tag} (${interaction.user.id}) -> #${channel.name} (${channel.id}): ${content.trim()}`,
        );

        return interaction.reply({
            content: `✅ Đã gửi tin nhắn ẩn danh vào ${channel}.`,
            ephemeral: true,
        });
    }
}

module.exports = new AdminManager();
