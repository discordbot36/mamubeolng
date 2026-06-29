const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");

const {
    getUser,
    addMoney,
    addWin,
    addLoss,
    formatMoney,
    getCurrencyEmoji,
} = require("./database");

const { GAMBLE_MAX_BET } = require("./config/gamble");
const GAME_EXPIRE_MS = 10 * 60 * 1000;
const games = new Map();
const MIN_BET = 100;
const MAX_BET = GAMBLE_MAX_BET;

const SUITS = ["♠️", "♥️", "♦️", "♣️"];
const RANKS = [
    "A",
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
];

function createDeck() {
    const deck = [];

    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({
                rank,
                suit,
            });
        }
    }

    return shuffle(deck);
}

function shuffle(deck) {
    const cards = [...deck];

    for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = cards[i];

        cards[i] = cards[j];
        cards[j] = temp;
    }

    return cards;
}

function drawCard(game) {
    if (game.deck.length <= 0) {
        game.deck = createDeck();
    }

    return game.deck.pop();
}

function getCardValue(card) {
    if (card.rank === "A") {
        return 11;
    }

    if (["J", "Q", "K"].includes(card.rank)) {
        return 10;
    }

    return Number(card.rank);
}

function calculateHandValue(hand) {
    let total = 0;
    let aces = 0;

    for (const card of hand) {
        total += getCardValue(card);

        if (card.rank === "A") {
            aces += 1;
        }
    }

    while (total > 21 && aces > 0) {
        total -= 10;
        aces -= 1;
    }

    return total;
}

function isBlackjack(hand) {
    return hand.length === 2 && calculateHandValue(hand) === 21;
}

function formatCard(card) {
    return `${card.suit}${card.rank}`;
}

function formatHand(hand, hideFirst = false) {
    if (hideFirst) {
        return `🂠 ${hand.slice(1).map(formatCard).join(" ")}`;
    }

    return hand.map(formatCard).join(" ");
}

function createButtons(game, disabled = false) {
    const userId = game.userId;
    const gameId = game.id;

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`blackjack_hit_${userId}_${gameId}`)
            .setLabel("Rút bài")
            .setEmoji("🃏")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled),

        new ButtonBuilder()
            .setCustomId(`blackjack_stand_${userId}_${gameId}`)
            .setLabel("Dừng")
            .setEmoji("🛑")
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
    );
}

function buildGameEmbed(game, revealDealer = false, resultText = null) {
    const coin = getCurrencyEmoji();
    const playerValue = calculateHandValue(game.playerHand);
    const dealerValue = calculateHandValue(game.dealerHand);

    const dealerText = revealDealer
        ? `${formatHand(game.dealerHand)} (**${dealerValue}**)`
        : `${formatHand(game.dealerHand, true)} (**?**)`;

    const embed = new EmbedBuilder()
        .setColor(resultText ? 0xf1c40f : 0x2ecc71)
        .setTitle("🃏 BLACKJACK MAMU")
        .setDescription(
            `👤 Người chơi: <@${game.userId}>\n` +
                `${coin} Tiền cược: **${formatMoney(game.bet)}**\n\n` +
                `🎴 **Bài của bạn:**\n${formatHand(game.playerHand)} (**${playerValue}**)\n\n` +
                `🤵 **Bài của Dealer:**\n${dealerText}\n\n` +
                `${resultText || "Chọn **Rút bài** hoặc **Dừng**."}`,
        )
        .setFooter({
            text: "Blackjack tự nhiên trả x2.5 • Thắng thường x2 • Hòa hoàn tiền",
        })
        .setTimestamp();

    return embed;
}

function finishGame(game, outcome) {
    const coin = getCurrencyEmoji();
    let resultText = "";
    let payout = 0;

    if (outcome === "player_blackjack") {
        payout = Math.floor(game.bet * 2.5);
        addMoney(game.userId, payout);
        addWin(game.userId);

        resultText =
            `🌟 **BLACKJACK!**\n` +
            `Bạn thắng lớn và nhận **${coin} ${formatMoney(payout)}**.`;
    }

    if (outcome === "player_win") {
        payout = game.bet * 2;
        addMoney(game.userId, payout);
        addWin(game.userId);

        resultText =
            `✅ **Bạn thắng!**\n` + `Nhận **${coin} ${formatMoney(payout)}**.`;
    }

    if (outcome === "dealer_win") {
        addLoss(game.userId);

        resultText =
            `💀 **Bạn thua!**\n` + `Mất **${coin} ${formatMoney(game.bet)}**.`;
    }

    if (outcome === "push") {
        payout = game.bet;
        addMoney(game.userId, payout);

        resultText =
            `🤝 **Hòa bài!**\n` +
            `Hoàn lại **${coin} ${formatMoney(payout)}**.`;
    }

    if (outcome === "player_bust") {
        addLoss(game.userId);

        resultText =
            `💥 **Quắc!**\n` +
            `Bạn vượt quá 21 và mất **${coin} ${formatMoney(game.bet)}**.`;
    }

    if (outcome === "dealer_bust") {
        payout = game.bet * 2;
        addMoney(game.userId, payout);
        addWin(game.userId);

        resultText =
            `🎉 **Dealer quắc!**\n` +
            `Bạn thắng và nhận **${coin} ${formatMoney(payout)}**.`;
    }

    games.delete(game.userId);

    return resultText;
}

function resolveDealer(game) {
    while (calculateHandValue(game.dealerHand) < 17) {
        game.dealerHand.push(drawCard(game));
    }

    const playerValue = calculateHandValue(game.playerHand);
    const dealerValue = calculateHandValue(game.dealerHand);

    if (dealerValue > 21) {
        return "dealer_bust";
    }

    if (playerValue > dealerValue) {
        return "player_win";
    }

    if (dealerValue > playerValue) {
        return "dealer_win";
    }

    return "push";
}

class BlackjackManager {
    async start(interaction) {
        const bet = interaction.options.getInteger("sotien");
        const user = getUser(interaction.user.id);

        if (!Number.isInteger(bet) || bet < MIN_BET || bet > MAX_BET) {
            return interaction.reply({
                content:
                    `❌ Số tiền cược phải từ **${getCurrencyEmoji()} ${formatMoney(MIN_BET)}** ` +
                    `đến **${getCurrencyEmoji()} ${formatMoney(MAX_BET)}**.`,
                ephemeral: true,
            });
        }

        if (games.has(interaction.user.id)) {
            return interaction.reply({
                content: "❌ Bạn đang có một ván Blackjack chưa kết thúc.",
                ephemeral: true,
            });
        }

        if (user.money < bet) {
            return interaction.reply({
                content: "❌ Không đủ tiền để cược.",
                ephemeral: true,
            });
        }

        addMoney(interaction.user.id, -bet);

        const game = {
            id: `${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
            userId: interaction.user.id,
            bet,
            deck: createDeck(),
            playerHand: [],
            dealerHand: [],
            createdAt: Date.now(),
            processing: false,
        };

        game.playerHand.push(drawCard(game));
        game.dealerHand.push(drawCard(game));
        game.playerHand.push(drawCard(game));
        game.dealerHand.push(drawCard(game));

        games.set(interaction.user.id, game);

        if (isBlackjack(game.playerHand)) {
            const resultText = finishGame(game, "player_blackjack");

            return interaction.reply({
                embeds: [buildGameEmbed(game, true, resultText)],
                components: [createButtons(game, true)],
            });
        }

        return interaction.reply({
            embeds: [buildGameEmbed(game)],
            components: [createButtons(game)],
        });
    }

    async handleButton(interaction) {
        if (!interaction.customId.startsWith("blackjack_")) {
            return undefined;
        }

        const parts = interaction.customId.split("_");
        const action = parts[1];
        const userId = parts[2];
        const gameId = parts[3];

        if (interaction.user.id !== userId) {
            return interaction.reply({
                content: "❌ Đây không phải ván Blackjack của bạn.",
                ephemeral: true,
            });
        }

        const game = games.get(userId);

        if (!game || String(game.id) !== String(gameId)) {
            await interaction.message
                ?.edit({
                    components: [
                        createButtons(
                            {
                                userId,
                                id: gameId || "expired",
                            },
                            true,
                        ),
                    ],
                })
                .catch(() => undefined);

            return interaction.reply({
                content:
                    "❌ Ván Blackjack này đã kết thúc hoặc bot vừa restart. Hãy tạo ván mới.",
                ephemeral: true,
            });
        }

        if (Date.now() - Number(game.createdAt || 0) > GAME_EXPIRE_MS) {
            games.delete(userId);

            return interaction.update({
                content: "⏰ Ván Blackjack đã hết hạn. Hãy tạo ván mới.",
                embeds: [],
                components: [createButtons(game, true)],
            });
        }

        if (game.processing) {
            return interaction.reply({
                content: "⏳ Ván này đang xử lý, đừng spam nút.",
                ephemeral: true,
            });
        }

        game.processing = true;

        try {
            if (action === "hit") {
                game.playerHand.push(drawCard(game));

                const playerValue = calculateHandValue(game.playerHand);

                if (playerValue > 21) {
                    const resultText = finishGame(game, "player_bust");

                    return await interaction.update({
                        embeds: [buildGameEmbed(game, true, resultText)],
                        components: [createButtons(game, true)],
                    });
                }

                if (playerValue === 21) {
                    const outcome = resolveDealer(game);
                    const resultText = finishGame(game, outcome);

                    return await interaction.update({
                        embeds: [buildGameEmbed(game, true, resultText)],
                        components: [createButtons(game, true)],
                    });
                }

                return await interaction.update({
                    embeds: [buildGameEmbed(game)],
                    components: [createButtons(game)],
                });
            }

            if (action === "stand") {
                const outcome = resolveDealer(game);
                const resultText = finishGame(game, outcome);

                return await interaction.update({
                    embeds: [buildGameEmbed(game, true, resultText)],
                    components: [createButtons(game, true)],
                });
            }

            return undefined;
        } finally {
            const current = games.get(userId);

            if (current && current.id === game.id) {
                current.processing = false;
            }
        }
    }
}

module.exports = new BlackjackManager();
