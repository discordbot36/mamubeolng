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

const config = require("./config/vecao");

const sessions = new Map();

function createSessionId() {
    return `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(items) {
    const result = [...items];

    for (let i = result.length - 1; i > 0; i -= 1) {
        const j = randomInt(0, i);
        const temp = result[i];

        result[i] = result[j];
        result[j] = temp;
    }

    return result;
}

function pickWeightedOutcome() {
    const totalChance = config.outcomeTable.reduce((sum, outcome) => {
        return sum + Number(outcome.chance || 0);
    }, 0);

    let roll = randomInt(1, totalChance);

    for (const outcome of config.outcomeTable) {
        roll -= Number(outcome.chance || 0);

        if (roll <= 0) {
            return outcome;
        }
    }

    return config.outcomeTable[0];
}

function createFillerSymbols(excludedSymbolId = null) {
    return Object.values(config.symbols).filter((symbol) => {
        return symbol.id !== excludedSymbolId;
    });
}

function createLosingBoard() {
    const symbols = createFillerSymbols();
    const board = [];

    // Board thua: mỗi biểu tượng xuất hiện tối đa 2 lần, không có bộ 3.
    for (const symbol of shuffle(symbols)) {
        board.push(symbol.id, symbol.id);

        if (board.length >= config.gridSize) {
            break;
        }
    }

    while (board.length < config.gridSize) {
        const symbol = symbols[randomInt(0, symbols.length - 1)];
        const count = board.filter((id) => id === symbol.id).length;

        if (count < 2) {
            board.push(symbol.id);
        }
    }

    return shuffle(board).slice(0, config.gridSize);
}

function createWinningBoard(symbolId) {
    const fillers = createFillerSymbols(symbolId);
    const board = [symbolId, symbolId, symbolId];

    // Vé trúng: đúng 3 biểu tượng thắng + filler không tạo thêm bộ 3 khác.
    for (const symbol of shuffle(fillers)) {
        if (board.length >= config.gridSize) {
            break;
        }

        board.push(symbol.id, symbol.id);
    }

    while (board.length < config.gridSize) {
        const symbol = fillers[randomInt(0, fillers.length - 1)];
        const count = board.filter((id) => id === symbol.id).length;

        if (count < 2) {
            board.push(symbol.id);
        }
    }

    return shuffle(board).slice(0, config.gridSize);
}

function createBoard(outcome) {
    if (!outcome.symbolId || Number(outcome.multiplier || 0) <= 0) {
        return createLosingBoard();
    }

    return createWinningBoard(outcome.symbolId);
}

function getVisibleGrid(session) {
    const lines = [];

    for (let row = 0; row < 3; row += 1) {
        const cells = [];

        for (let col = 0; col < 3; col += 1) {
            const index = row * 3 + col;

            if (!session.revealed[index]) {
                cells.push("⬜");
                continue;
            }

            const symbolId = session.board[index];
            cells.push(config.symbols[symbolId]?.emoji || "❔");
        }

        lines.push(cells.join(" "));
    }

    return lines.join("\n");
}

function getRevealedCount(session) {
    return session.revealed.filter(Boolean).length;
}

function isFullyRevealed(session) {
    return getRevealedCount(session) >= config.gridSize;
}

function getHitSymbolText(session) {
    if (
        !session.outcome.symbolId ||
        Number(session.outcome.multiplier || 0) <= 0
    ) {
        return "Không có bộ 3 biểu tượng trúng.";
    }

    const symbol = config.symbols[session.outcome.symbolId];

    return `Bộ trúng: ${symbol.emoji} **${symbol.name}** x3`;
}

function getProfitText(profit) {
    const coin = getCurrencyEmoji();

    if (profit > 0) {
        return `Lời **${coin} ${formatMoney(profit)}**`;
    }

    if (profit < 0) {
        return `Lỗ **${coin} ${formatMoney(Math.abs(profit))}**`;
    }

    return "Hòa vốn";
}

function buildEmbed(session, interactionUser, finished = false) {
    const coin = getCurrencyEmoji();
    const revealedCount = getRevealedCount(session);
    const payout = Math.floor(
        session.bet * Number(session.outcome.multiplier || 0),
    );
    const profit = payout - session.bet;
    const color = finished
        ? profit > 0
            ? 0x2ecc71
            : profit < 0
              ? 0xe74c3c
              : 0xf1c40f
        : 0x9b59b6;

    const title = finished ? session.outcome.title : "🎫 VÉ CÀO THIÊN ĐẠO";
    const statusText = finished
        ? `${session.outcome.text}\n${getHitSymbolText(session)}\n\n` +
          `📈 Hệ số: **x${session.outcome.multiplier}**\n` +
          `🎁 Nhận: **${coin} ${formatMoney(payout)}**\n` +
          `📊 Kết quả: ${getProfitText(profit)}`
        : "Dùng móng heo cào từng ô để khai mở thiên cơ.";

    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(
            `${interactionUser} đang cào vé.\n\n` +
                `💰 Giá vé: **${coin} ${formatMoney(session.bet)}**\n` +
                `🧧 Đã cào: **${revealedCount}/${config.gridSize} ô**\n\n` +
                `${getVisibleGrid(session)}\n\n` +
                statusText,
        )
        .setFooter({
            text: "Cào đủ 9 ô để chốt thưởng • Vé tối đa 500,000",
        })
        .setTimestamp();
}

function buildComponents(session, disabled = false) {
    const rows = [];

    for (let row = 0; row < 3; row += 1) {
        const actionRow = new ActionRowBuilder();

        for (let col = 0; col < 3; col += 1) {
            const index = row * 3 + col;
            const revealed = Boolean(session.revealed[index]);
            const symbolId = session.board[index];
            const emoji = revealed
                ? config.symbols[symbolId]?.emoji || "❔"
                : "⬜";

            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `vecao_reveal_${session.userId}_${session.id}_${index}`,
                    )
                    .setLabel(String(index + 1))
                    .setEmoji(emoji)
                    .setStyle(
                        revealed ? ButtonStyle.Secondary : ButtonStyle.Primary,
                    )
                    .setDisabled(disabled || revealed),
            );
        }

        rows.push(actionRow);
    }

    rows.push(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`vecao_all_${session.userId}_${session.id}`)
                .setLabel("Cào hết")
                .setEmoji("🧹")
                .setStyle(ButtonStyle.Success)
                .setDisabled(disabled),

            new ButtonBuilder()
                .setCustomId(`vecao_info_${session.userId}_${session.id}`)
                .setLabel("Bảng thưởng")
                .setEmoji("📜")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled),
        ),
    );

    return rows;
}

function settleSession(session) {
    if (session.settled) {
        return;
    }

    const payout = Math.floor(
        session.bet * Number(session.outcome.multiplier || 0),
    );
    const profit = payout - session.bet;

    if (payout > 0) {
        addMoney(session.userId, payout);
    }

    if (profit > 0) {
        addWin(session.userId);
    } else if (profit < 0) {
        addLoss(session.userId);
    }

    session.settled = true;
    sessions.delete(session.userId);
}

function buildPayoutText() {
    const rows = config.outcomeTable
        .filter((outcome) => outcome.id !== "lose")
        .map((outcome) => {
            const symbol = config.symbols[outcome.symbolId];
            const label = symbol
                ? `${symbol.emoji} ${symbol.name} x3`
                : outcome.title;

            return `${label}: **x${outcome.multiplier}**`;
        });

    return rows.join("\n");
}

class VeCaoManager {
    async start(interaction) {
        const bet = interaction.options.getInteger("cuoc");
        const userId = interaction.user.id;
        const user = getUser(userId);
        const coin = getCurrencyEmoji();

        if (
            !Number.isInteger(bet) ||
            bet < config.minBet ||
            bet > config.maxBet
        ) {
            return interaction.reply({
                content:
                    `❌ Giá vé phải từ **${coin} ${formatMoney(config.minBet)}** ` +
                    `đến **${coin} ${formatMoney(config.maxBet)}**.`,
                ephemeral: true,
            });
        }

        if (sessions.has(userId)) {
            return interaction.reply({
                content: "❌ Bạn đang có một vé cào chưa cào xong.",
                ephemeral: true,
            });
        }

        if (Number(user.money || 0) < bet) {
            return interaction.reply({
                content: "❌ Không đủ tiền để mua vé.",
                ephemeral: true,
            });
        }

        addMoney(userId, -bet);

        const outcome = pickWeightedOutcome();
        const session = {
            id: createSessionId(),
            userId,
            bet,
            outcome,
            board: createBoard(outcome),
            revealed: Array(config.gridSize).fill(false),
            createdAt: Date.now(),
            settled: false,
            processing: false,
        };

        sessions.set(userId, session);

        return interaction.reply({
            embeds: [buildEmbed(session, interaction.user, false)],
            components: buildComponents(session),
        });
    }

    async handleButton(interaction) {
        if (!interaction.customId?.startsWith("vecao_")) {
            return undefined;
        }

        const parts = interaction.customId.split("_");
        const action = parts[1];
        const userId = parts[2];
        const sessionId = parts[3];
        const index = Number.parseInt(parts[4], 10);

        if (interaction.user.id !== userId) {
            return interaction.reply({
                content: "❌ Đây không phải vé cào của bạn.",
                ephemeral: true,
            });
        }

        const session = sessions.get(userId);

        if (!session || String(session.id) !== String(sessionId)) {
            return interaction.reply({
                content:
                    "❌ Vé cào này đã kết thúc hoặc bot vừa restart. Hãy mua vé mới.",
                ephemeral: true,
            });
        }

        if (
            Date.now() - Number(session.createdAt || 0) >
            config.sessionExpireMs
        ) {
            sessions.delete(userId);

            return interaction.update({
                content: "⏰ Vé cào đã hết hạn, vé bị hủy.",
                embeds: [],
                components: buildComponents(session, true),
            });
        }

        if (session.processing) {
            return interaction.reply({
                content: "⏳ Vé này đang xử lý, đừng spam nút.",
                ephemeral: true,
            });
        }

        if (action === "info") {
            return interaction.reply({
                content:
                    "📜 **Bảng thưởng Vé Cào Thiên Đạo**\n" +
                    buildPayoutText() +
                    "\n\nCào đủ 9 ô để chốt thưởng. Vé thua là không có biểu tượng nào đủ bộ 3.",
                ephemeral: true,
            });
        }

        session.processing = true;

        try {
            if (action === "all") {
                session.revealed = Array(config.gridSize).fill(true);
            }

            if (action === "reveal") {
                if (
                    !Number.isInteger(index) ||
                    index < 0 ||
                    index >= config.gridSize
                ) {
                    return interaction.reply({
                        content: "❌ Ô cào không hợp lệ.",
                        ephemeral: true,
                    });
                }

                session.revealed[index] = true;
            }

            const finished = isFullyRevealed(session);

            if (finished) {
                settleSession(session);
            }

            return interaction.update({
                embeds: [buildEmbed(session, interaction.user, finished)],
                components: buildComponents(session, finished),
            });
        } finally {
            const current = sessions.get(userId);

            if (current && current.id === session.id) {
                current.processing = false;
            }
        }
    }
}

module.exports = new VeCaoManager();
