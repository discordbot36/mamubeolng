const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require("discord.js");

const {
    addMoney,
    addWin,
    addLoss,
    formatMoney,
    getCurrencyEmoji,
    getUser,
} = require("./database");

const raceConfig = require("./config/race");

const games = new Map();

function getGameKey(guildId, channelId) {
    return `${guildId}_${channelId}`;
}

function getPigs() {
    return raceConfig.pigs.slice(0, raceConfig.maxPigs || 5);
}

function getPigLabel(pig) {
    return `${pig.name}`;
}

function getBetListText(game) {
    if (game.bets.length <= 0) {
        return "Chưa có ai xuống tiền";
    }

    return game.bets
        .map((bet) => {
            const pig = getPigs()[bet.pigIndex];

            return `<@${bet.userId}> ${pig.emoji && typeof pig.emoji === "string" ? pig.emoji : "🐷"} ${pig.name}: ${formatMoney(bet.amount)}`;
        })
        .join("\n");
}

function createPigButtons(game, disabled = false) {
    return new ActionRowBuilder().addComponents(
        getPigs().map((pig, index) => {
            const button = new ButtonBuilder()
                .setCustomId(`race_bet_${game.id}_${index}`)
                .setLabel(getPigLabel(pig))
                .setStyle(pig.style || ButtonStyle.Primary)
                .setDisabled(disabled);

            if (pig.emoji) {
                button.setEmoji(pig.emoji);
            }

            return button;
        }),
    );
}

function buildStartContent(game) {
    const coin = getCurrencyEmoji();

    return (
        `🐖 **Đua Lợn Mamu - Trường đua dưới lòng đất**\n\n` +
        `Bấm chọn lợn, sau đó nhập số tiền muốn cược.\n` +
        `Một người có thể đặt nhiều vé cược.\n\n` +
        `Tỉ lệ trả thưởng: **x${raceConfig.payout}**\n` +
        `⏳ Bắt đầu sau **${Math.ceil(raceConfig.countdownMs / 1000)} giây**\n\n` +
        `${coin} **Danh sách cược:**\n${getBetListText(game)}`
    );
}

function createBetModal(gameId, pigIndex) {
    const pig = getPigs()[pigIndex];

    const modal = new ModalBuilder()
        .setCustomId(`race_modal_${gameId}_${pigIndex}`)
        .setTitle(`Cược ${pig.name}`);

    const input = new TextInputBuilder()
        .setCustomId("amount")
        .setLabel(`Số tiền muốn cược, tối đa ${formatMoney(raceConfig.maxBet)}`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(12)
        .setPlaceholder("Ví dụ: 1000");

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    return modal;
}
async function safeEditMessage(message, payload, label = "Race") {
    if (!message || typeof message.edit !== "function") {
        return false;
    }

    try {
        await message.edit(payload);
        return true;
    } catch (error) {
        if (error?.code === 10008 || error?.status === 404) {
            console.warn(
                `[${label}] Message đã bị xóa hoặc không còn tồn tại, bỏ qua edit.`,
            );
            return false;
        }

        throw error;
    }
}
class RaceManager {
    buildBoard(positions) {
        const pigs = getPigs();
        const maxNameLength = Math.max(...pigs.map((pig) => pig.name.length));
        const runner = raceConfig.runnerEmoji || "🐖";

        return pigs
            .map((pig, index) => {
                const name = pig.name.padEnd(maxNameLength, " ");
                const position = Math.min(
                    positions[index],
                    raceConfig.finishLine,
                );
                const beforePig = "─".repeat(position);
                const afterPig = "─".repeat(raceConfig.finishLine - position);

                return `${name} |${beforePig}${runner}${afterPig}🏁`;
            })
            .join("\n");
    }

    movePigs(positions) {
        return positions.map((position) => {
            return (
                position + Math.floor(Math.random() * (raceConfig.maxStep + 1))
            );
        });
    }

    async start(interaction) {
        const key = getGameKey(interaction.guildId, interaction.channelId);

        if (games.has(key)) {
            return interaction.reply({
                content: raceConfig.messages.alreadyRunning,
                ephemeral: true,
            });
        }

        const game = {
            id: `${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
            key,
            bets: [],
            closed: false,
            messageId: null,
            channelId: interaction.channelId,
        };

        games.set(key, game);

        await interaction.reply({
            content: buildStartContent(game),
            components: [createPigButtons(game)],
        });

        const gameMessage = await interaction.fetchReply();
        game.messageId = gameMessage.id;

        setTimeout(() => {
            this.run(interaction, gameMessage, game).catch((error) => {
                console.error(error);
                games.delete(key);
            });
        }, raceConfig.countdownMs);

        return undefined;
    }

    async handleButton(interaction) {
        if (!interaction.customId.startsWith("race_bet_")) {
            return undefined;
        }

        const parts = interaction.customId.split("_");
        const gameId = parts[2];
        const pigIndex = Number.parseInt(parts[3], 10);

        const game = Array.from(games.values()).find(
            (item) => item.id === gameId,
        );

        if (!game || game.closed) {
            return interaction.reply({
                content: raceConfig.messages.closed,
                ephemeral: true,
            });
        }

        if (!getPigs()[pigIndex]) {
            return interaction.reply({
                content: "❌ Con lợn này không tồn tại",
                ephemeral: true,
            });
        }

        return interaction.showModal(createBetModal(gameId, pigIndex));
    }

    async handleModal(interaction) {
        if (!interaction.customId.startsWith("race_modal_")) {
            return undefined;
        }

        const parts = interaction.customId.split("_");
        const gameId = parts[2];
        const pigIndex = Number.parseInt(parts[3], 10);

        const game = Array.from(games.values()).find(
            (item) => item.id === gameId,
        );

        if (!game || game.closed) {
            return interaction.reply({
                content: raceConfig.messages.closed,
                ephemeral: true,
            });
        }

        const rawAmount = interaction.fields.getTextInputValue("amount");
        const amount = Number.parseInt(rawAmount.replace(/[^\d]/g, ""), 10);
        const user = getUser(interaction.user.id);
        const pig = getPigs()[pigIndex];

        if (
            !amount ||
            amount < raceConfig.minBet ||
            amount > raceConfig.maxBet
        ) {
            return interaction.reply({
                content: raceConfig.messages.invalidBet,
                ephemeral: true,
            });
        }

        if (user.money < amount) {
            return interaction.reply({
                content:
                    `${raceConfig.messages.notEnoughMoney}\n` +
                    `Cần: ${formatMoney(amount)}`,
                ephemeral: true,
            });
        }

        addMoney(interaction.user.id, -amount);

        game.bets.push({
            userId: interaction.user.id,
            pigIndex,
            amount,
        });

        await interaction.reply({
            content: `✅ Đã cược ${formatMoney(amount)} vào ${pig.name}`,
            ephemeral: true,
        });

        const message = await interaction.channel.messages
            .fetch(game.messageId)
            .catch(() => null);

        if (message) {
            await safeEditMessage(
                message,
                {
                    content: buildStartContent(game),
                    components: [createPigButtons(game)],
                },
                "Race Bet Update",
            );
        }

        return undefined;
    }

    async run(interaction, raceMessage, game) {
        game.closed = true;
        games.delete(game.key);

        if (game.bets.length <= 0) {
            await safeEditMessage(
                raceMessage,
                {
                    content: raceConfig.messages.noBet,
                    components: [createPigButtons(game, true)],
                },
                "Race No Bet",
            );

            return undefined;
        }

        const lockedEdited = await safeEditMessage(
            raceMessage,
            {
                content:
                    `🐖 Bàn đua lợn đã khóa cược\n\n` +
                    `${getBetListText(game)}\n\n` +
                    `🏁 Chuẩn bị xuất phát...`,
                components: [createPigButtons(game, true)],
            },
            "Race Lock",
        );

        if (!lockedEdited) {
            game.messageDeleted = true;
        }

        let positions = getPigs().map(() => 0);

        const interval = setInterval(async () => {
            try {
                positions = this.movePigs(positions);

                if (!game.messageDeleted) {
                    const boardEdited = await safeEditMessage(
                        raceMessage,
                        {
                            content: `\`\`\`\n${this.buildBoard(positions)}\n\`\`\``,
                            components: [createPigButtons(game, true)],
                        },
                        "Race Board",
                    );

                    if (!boardEdited) {
                        game.messageDeleted = true;
                    }
                }

                const winnerIndex = positions.findIndex((pos) => {
                    return pos >= raceConfig.finishLine;
                });

                if (winnerIndex === -1) {
                    return;
                }

                clearInterval(interval);

                const pigs = getPigs();
                const winnerPig = pigs[winnerIndex];
                const resultLines = [];

                for (const bet of game.bets) {
                    if (bet.pigIndex === winnerIndex) {
                        const receive = Math.floor(
                            bet.amount * raceConfig.payout,
                        );
                        const net = receive - bet.amount;

                        addMoney(bet.userId, receive);
                        addWin(bet.userId);

                        resultLines.push(
                            `<@${bet.userId}> ăn ${formatMoney(net)} từ ${winnerPig.name}`,
                        );
                    } else {
                        addLoss(bet.userId);

                        resultLines.push(
                            `<@${bet.userId}> bay ${formatMoney(bet.amount)}`,
                        );
                    }
                }

                return interaction.channel.send(
                    `🏆 **${winnerPig.name}** chiến thắng!\n\n` +
                        `${resultLines.join("\n")}\n\n` +
                        `🏁 Xong kèo, đời là thế thôi`,
                );
            } catch (error) {
                clearInterval(interval);
                console.error("[Race Run Error]", error);
                games.delete(game.key);
            }
        }, raceConfig.raceTickMs);

        return undefined;
    }
}

module.exports = new RaceManager();
