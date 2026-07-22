const crypto = require("crypto");

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder,
} = require("discord.js");

const db = require("./database");
const config = require("./config/molinhthach");

const activeSessions = new Map();
const sessionTimers = new Map();

const ROW_LABELS = ["A", "B", "C", "D", "E"];
const NUMBER_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];

function fmt(value) {
    return db.formatMoney(Math.max(0, Math.floor(Number(value || 0))));
}

function coin() {
    return db.getCurrencyEmoji();
}

function createSessionId() {
    return crypto.randomBytes(8).toString("hex");
}

function sessionKey(userId) {
    return `${config.sessionKeyPrefix}:${userId}`;
}

function normalizeSession(raw) {
    if (!raw || typeof raw !== "object") {
        return null;
    }

    const session = {
        ...raw,
        userId: String(raw.userId || ""),
        guildId: raw.guildId ? String(raw.guildId) : null,
        channelId: raw.channelId ? String(raw.channelId) : null,
        messageId: raw.messageId ? String(raw.messageId) : null,
        bet: Math.max(0, Math.floor(Number(raw.bet || 0))),
        minesCount: Math.max(0, Math.floor(Number(raw.minesCount || 0))),
        mineIndexes: Array.isArray(raw.mineIndexes)
            ? raw.mineIndexes.map(Number).filter(Number.isInteger)
            : [],
        opened: Array.isArray(raw.opened)
            ? raw.opened.map(Number).filter(Number.isInteger)
            : [],
        createdAt: Number(raw.createdAt || Date.now()),
        updatedAt: Number(raw.updatedAt || Date.now()),
        expiresAt: Number(raw.expiresAt || Date.now()),
        status: String(raw.status || "active"),
        processing: false,
    };

    if (!session.id || !session.userId || session.bet <= 0) {
        return null;
    }

    return session;
}

function getSessionIndex() {
    const raw = db.getSystemValue(config.sessionIndexKey);

    return Array.isArray(raw) ? [...new Set(raw.map(String))] : [];
}

function setSessionIndex(userIds) {
    db.setSystemValue(config.sessionIndexKey, [
        ...new Set((userIds || []).map(String).filter(Boolean)),
    ]);
}

function addSessionToIndex(userId) {
    const index = getSessionIndex();

    if (!index.includes(String(userId))) {
        index.push(String(userId));
        setSessionIndex(index);
    }
}

function removeSessionFromIndex(userId) {
    setSessionIndex(
        getSessionIndex().filter((id) => String(id) !== String(userId)),
    );
}

function persistSession(session) {
    if (!session) {
        return;
    }

    session.updatedAt = Date.now();

    const serializable = {
        ...session,
        processing: false,
    };

    db.setSystemValue(sessionKey(session.userId), serializable);
    addSessionToIndex(session.userId);
}

function deletePersistedSession(userId) {
    db.deleteSystemValue(sessionKey(userId));
    removeSessionFromIndex(userId);
}

function loadSession(userId) {
    const key = String(userId);
    const current = activeSessions.get(key);

    if (current) {
        return current;
    }

    const persisted = normalizeSession(db.getSystemValue(sessionKey(key)));

    if (!persisted || persisted.status !== "active") {
        return null;
    }

    activeSessions.set(key, persisted);
    return persisted;
}

function clearTimer(userId) {
    const key = String(userId);
    const timer = sessionTimers.get(key);

    if (timer) {
        clearTimeout(timer);
        sessionTimers.delete(key);
    }
}

function clearSession(session) {
    if (!session) {
        return;
    }

    clearTimer(session.userId);
    activeSessions.delete(String(session.userId));
    deletePersistedSession(session.userId);
}

function updateStats({ wagered = 0, payout = 0, result = null } = {}) {
    const current = db.getSystemValue(config.statsKey) || {};

    const next = {
        gamesStarted: Number(current.gamesStarted || 0),
        gamesFinished: Number(current.gamesFinished || 0),
        totalWagered: Number(current.totalWagered || 0),
        totalPaid: Number(current.totalPaid || 0),
        mineLosses: Number(current.mineLosses || 0),
        cashouts: Number(current.cashouts || 0),
        refunds: Number(current.refunds || 0),
        abandons: Number(current.abandons || 0),
        updatedAt: Date.now(),
    };

    if (wagered > 0) {
        next.gamesStarted += 1;
        next.totalWagered += Math.floor(wagered);
    }

    if (result) {
        next.gamesFinished += 1;
        next.totalPaid += Math.max(0, Math.floor(payout));

        if (result === "mine") {
            next.mineLosses += 1;
        }

        if (result === "cashout" || result === "auto_cashout") {
            next.cashouts += 1;
        }

        if (result === "refund") {
            next.refunds += 1;
        }

        if (result === "abandon") {
            next.abandons += 1;
        }
    }

    next.netSink = next.totalWagered - next.totalPaid;
    db.setSystemValue(config.statsKey, next);
}

function getDynamicMaxBet(balance) {
    const safeBalance = Math.max(0, Math.floor(Number(balance || 0)));

    // Được cược tối đa 500.000,
    // nhưng không thể cược nhiều hơn số tiền đang có.
    return Math.max(0, Math.min(config.maxBet, safeBalance));
}

function generateMineIndexes(totalTiles, minesCount) {
    const mines = new Set();

    while (mines.size < minesCount) {
        mines.add(crypto.randomInt(0, totalTiles));
    }

    return [...mines].sort((a, b) => a - b);
}

function tileCoordinate(index) {
    const row = Math.floor(index / config.boardSize);
    const column = index % config.boardSize;

    return `${ROW_LABELS[row] || "?"}${column + 1}`;
}

function calculateRawMultiplier(minesCount, safeOpened) {
    if (safeOpened <= 0) {
        return 1;
    }

    const total = config.totalTiles;
    const safeTiles = total - minesCount;
    let fairMultiplier = 1;

    for (let i = 0; i < safeOpened; i += 1) {
        fairMultiplier *= (total - i) / (safeTiles - i);
    }

    const withEdge = fairMultiplier * config.rtp;

    return Math.floor(withEdge * 10_000) / 10_000;
}

function getPayoutDetails(session) {
    const safeOpened = session.opened.length;
    const rawMultiplier = calculateRawMultiplier(
        session.minesCount,
        safeOpened,
    );

    const payoutCapMultiplier = config.maxPayout / session.bet;
    const multiplier = Math.max(
        1,
        Math.min(rawMultiplier, config.maxMultiplier, payoutCapMultiplier),
    );

    const payout = Math.min(
        config.maxPayout,
        Math.floor(session.bet * multiplier),
    );

    return {
        rawMultiplier,
        multiplier,
        payout,
        profit: payout - session.bet,
        capped:
            rawMultiplier > multiplier || payout >= Number(config.maxPayout),
    };
}

function formatMultiplier(value) {
    return Number(value || 1)
        .toFixed(4)
        .replace(/0+$/, "")
        .replace(/\.$/, "");
}

function buildBoard(session, revealAll = false, hitIndex = null) {
    const mines = new Set(session.mineIndexes);
    const opened = new Set(session.opened);
    const lines = [`　${NUMBER_EMOJIS.join("")}`];

    for (let row = 0; row < config.boardSize; row += 1) {
        const tiles = [];

        for (let column = 0; column < config.boardSize; column += 1) {
            const index = row * config.boardSize + column;

            if (index === hitIndex) {
                tiles.push("💥");
            } else if (opened.has(index)) {
                tiles.push("💎");
            } else if (revealAll && mines.has(index)) {
                tiles.push("👹");
            } else if (revealAll) {
                tiles.push("▫️");
            } else {
                tiles.push("⬜");
            }
        }

        lines.push(`${ROW_LABELS[row]}　${tiles.join("")}`);
    }

    return lines.join("\n");
}

function getRemainingSafeTiles(session) {
    return config.totalTiles - session.minesCount - session.opened.length;
}

function getResultColor(result) {
    if (result === "mine" || result === "abandon") {
        return 0xe74c3c;
    }

    if (result === "cashout" || result === "auto_cashout") {
        return 0x2ecc71;
    }

    if (result === "refund") {
        return 0x3498db;
    }

    return 0xf1c40f;
}

function buildEmbed(session, options = {}) {
    const {
        result = null,
        resultText = null,
        revealAll = false,
        hitIndex = null,
    } = options;

    const payout = getPayoutDetails(session);
    const safeTiles = config.totalTiles - session.minesCount;
    const remainingSafe = getRemainingSafeTiles(session);

    const statusText = resultText
        ? `\n\n${resultText}`
        : session.opened.length <= 0
          ? "\n\nChọn một ô để bắt đầu đào."
          : "\n\nTiếp tục đào hoặc **Thu hoạch** trước khi gặp yêu thú.";

    let payoutLine =
        `🏆 Có thể nhận: **${coin()} ${fmt(payout.payout)}**` +
        (payout.capped ? " *(đã chạm giới hạn)*" : "");

    if (result === "mine" || result === "abandon") {
        payoutLine = `💸 Tiền nhận lại: **${coin()} 0**`;
    } else if (result === "refund") {
        payoutLine = `↩️ Tiền hoàn lại: **${coin()} ${fmt(session.bet)}**`;
    } else if (result === "cashout" || result === "auto_cashout") {
        payoutLine =
            `🏆 Tiền thu hoạch: **${coin()} ${fmt(payout.payout)}**` +
            (payout.capped ? " *(đã chạm giới hạn)*" : "");
    }

    return new EmbedBuilder()
        .setColor(getResultColor(result))
        .setTitle("⛏️ MỎ LINH THẠCH")
        .setDescription(
            `<@${session.userId}>\n\n` +
                `${buildBoard(session, revealAll, hitIndex)}\n\n` +
                `💰 Cược: **${coin()} ${fmt(session.bet)}**\n` +
                `👹 Yêu thú: **${session.minesCount}**\n` +
                `💎 Đã đào an toàn: **${session.opened.length}/${safeTiles}**\n` +
                `🧱 Ô an toàn còn lại: **${Math.max(0, remainingSafe)}**\n` +
                `📈 Hệ số hiện tại: **x${formatMultiplier(payout.multiplier)}**\n` +
                payoutLine +
                statusText,
        )
        .setFooter({
            text:
                `RTP mục tiêu ${Math.round(config.rtp * 100)}% • ` +
                `Hết ${Math.floor(config.sessionTimeoutMs / 1000)} giây sẽ tự xử lý • ` +
                "Chỉ dùng tiền ảo trong bot",
        })
        .setTimestamp();
}

function buildComponents(session, disabled = false) {
    const opened = new Set(session.opened);
    const options = [];

    for (let index = 0; index < config.totalTiles; index += 1) {
        if (opened.has(index)) {
            continue;
        }

        options.push({
            label: `Ô ${tileCoordinate(index)}`,
            description: "Đào ô này",
            value: String(index),
            emoji: "⛏️",
        });
    }

    const rows = [];

    if (options.length > 0) {
        rows.push(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`mines_pick_${session.userId}_${session.id}`)
                    .setPlaceholder("Chọn một ô để đào")
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setDisabled(disabled)
                    .addOptions(options.slice(0, 25)),
            ),
        );
    }

    rows.push(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`mines_cashout_${session.userId}_${session.id}`)
                .setLabel("Thu hoạch")
                .setEmoji("💰")
                .setStyle(ButtonStyle.Success)
                .setDisabled(disabled || session.opened.length <= 0),

            new ButtonBuilder()
                .setCustomId(`mines_abandon_${session.userId}_${session.id}`)
                .setLabel("Bỏ ván (mất cược)")
                .setEmoji("🛑")
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disabled),
        ),
    );

    return rows;
}

async function editSessionMessage(client, session, payload) {
    if (!client || !session.channelId || !session.messageId) {
        return false;
    }

    const channel = await client.channels
        .fetch(session.channelId)
        .catch(() => null);

    const message = await channel?.messages
        ?.fetch(session.messageId)
        .catch(() => null);

    if (!message) {
        return false;
    }

    await message.edit(payload).catch(() => undefined);
    return true;
}

function settleSession(session, result) {
    if (!session || session.status !== "active") {
        return {
            payout: 0,
            profit: 0,
        };
    }

    session.status = result;

    let payout = 0;
    let profit = -session.bet;

    if (result === "cashout" || result === "auto_cashout") {
        const details = getPayoutDetails(session);
        payout = details.payout;
        profit = details.profit;
        db.addMoney(session.userId, payout);

        if (profit > 0) {
            db.addWin(session.userId);
        }
    } else if (result === "refund") {
        payout = session.bet;
        profit = 0;
        db.addMoney(session.userId, payout);
    } else {
        db.addLoss(session.userId);
    }

    updateStats({ payout, result });
    clearSession(session);

    return {
        payout,
        profit,
    };
}

function buildSettlementText(session, result, settlement, hitIndex = null) {
    if (result === "mine") {
        return (
            `💥 **Bạn đào trúng yêu thú tại ô ${tileCoordinate(hitIndex)}!**\n` +
            `Mất toàn bộ **${coin()} ${fmt(session.bet)}** tiền cược.`
        );
    }

    if (result === "abandon") {
        return (
            "🛑 **Bạn đã bỏ ván.**\n" +
            `Mất **${coin()} ${fmt(session.bet)}** tiền cược.`
        );
    }

    if (result === "refund") {
        return (
            "⏰ **Ván hết hạn trước khi bạn đào ô nào.**\n" +
            `Đã hoàn lại **${coin()} ${fmt(settlement.payout)}**.`
        );
    }

    const autoText =
        result === "auto_cashout"
            ? "⏰ **Tự động thu hoạch.**"
            : "💰 **Thu hoạch thành công!**";

    return (
        `${autoText}\n` +
        `Nhận **${coin()} ${fmt(settlement.payout)}** • ` +
        `Lãi **${coin()} ${fmt(Math.max(0, settlement.profit))}**.`
    );
}

async function expireSession(client, session) {
    const current = loadSession(session.userId);

    if (!current || current.id !== session.id || current.status !== "active") {
        return;
    }

    if (current.processing) {
        scheduleTimeout(current, client, 5_000);
        return;
    }

    current.processing = true;

    try {
        const result = current.opened.length > 0 ? "auto_cashout" : "refund";
        const settlement = settleSession(current, result);

        await editSessionMessage(client, current, {
            embeds: [
                buildEmbed(current, {
                    result,
                    revealAll: true,
                    resultText: buildSettlementText(
                        current,
                        result,
                        settlement,
                    ),
                }),
            ],
            components: [],
        });
    } catch (error) {
        console.error("[MO LINH THACH TIMEOUT]", error);
    }
}

function scheduleTimeout(session, client, overrideDelay = null) {
    clearTimer(session.userId);

    const remaining = Math.max(
        500,
        overrideDelay === null
            ? Number(session.expiresAt || 0) - Date.now()
            : overrideDelay,
    );

    const timer = setTimeout(() => {
        sessionTimers.delete(String(session.userId));
        expireSession(client, session).catch((error) => {
            console.error("[MO LINH THACH EXPIRE]", error);
        });
    }, remaining);

    sessionTimers.set(String(session.userId), timer);
}

async function settleExpiredBeforeStart(client, session) {
    if (!session || session.status !== "active") {
        return;
    }

    if (Number(session.expiresAt || 0) > Date.now()) {
        return;
    }

    await expireSession(client, session);
}

async function start(interaction) {
    const userId = String(interaction.user.id);
    const bet = interaction.options.getInteger("sotien");
    const minesCount =
        interaction.options.getInteger("yeuthu") || config.defaultMines;

    let existing = loadSession(userId);

    if (existing) {
        await settleExpiredBeforeStart(interaction.client, existing);
        existing = loadSession(userId);
    }

    if (existing) {
        const location =
            existing.channelId && existing.messageId
                ? `\nVán hiện tại: https://discord.com/channels/${existing.guildId}/${existing.channelId}/${existing.messageId}`
                : "";

        return interaction.reply({
            content:
                "❌ Bạn đang có một ván Mỏ Linh Thạch chưa kết thúc." +
                location,
            ephemeral: true,
        });
    }

    const balance = db.getBalance(userId);
    const dynamicMaxBet = getDynamicMaxBet(balance);

    if (balance < config.minBet) {
        return interaction.reply({
            content: `❌ Bạn cần ít nhất **${coin()} ${fmt(config.minBet)}** để mở Mỏ Linh Thạch.`,
            ephemeral: true,
        });
    }

    if (!Number.isInteger(bet) || bet < config.minBet || bet > dynamicMaxBet) {
        return interaction.reply({
            content:
                `❌ Tiền cược hợp lệ của bạn hiện là từ **${coin()} ${fmt(config.minBet)}** ` +
                `đến **${coin()} ${fmt(dynamicMaxBet)}**.\n` +
                `Giới hạn bằng ${Math.round(config.maxBalancePercent * 100)}% số dư ` +
                `và tối đa ${coin()} ${fmt(config.maxBet)}.`,
            ephemeral: true,
        });
    }

    if (
        !Number.isInteger(minesCount) ||
        minesCount < config.minMines ||
        minesCount > config.maxMines
    ) {
        return interaction.reply({
            content: `❌ Số yêu thú phải từ **${config.minMines}** đến **${config.maxMines}**.`,
            ephemeral: true,
        });
    }

    const payment = db.removeMoney(userId, bet);

    if (!payment.success) {
        return interaction.reply({
            content: "❌ Bạn không đủ tiền để mở Mỏ Linh Thạch.",
            ephemeral: true,
        });
    }

    const now = Date.now();
    const session = {
        id: createSessionId(),
        userId,
        guildId: String(interaction.guildId || ""),
        channelId: String(interaction.channelId || ""),
        messageId: null,
        bet,
        minesCount,
        mineIndexes: generateMineIndexes(config.totalTiles, minesCount),
        opened: [],
        createdAt: now,
        updatedAt: now,
        expiresAt: now + config.sessionTimeoutMs,
        status: "active",
        processing: false,
    };

    activeSessions.set(userId, session);
    persistSession(session);
    updateStats({ wagered: bet });

    try {
        await interaction.reply({
            embeds: [buildEmbed(session)],
            components: buildComponents(session),
        });

        const message = await interaction.fetchReply();
        session.messageId = message.id;
        persistSession(session);
        scheduleTimeout(session, interaction.client);

        return true;
    } catch (error) {
        console.error("[MO LINH THACH START]", error);

        if (session.status === "active") {
            db.addMoney(userId, bet);
            updateStats({ payout: bet, result: "refund" });
            clearSession(session);
        }

        if (!interaction.replied && !interaction.deferred) {
            return interaction
                .reply({
                    content:
                        "❌ Không thể tạo ván Mỏ Linh Thạch. Tiền cược đã được hoàn lại.",
                    ephemeral: true,
                })
                .catch(() => undefined);
        }

        return interaction
            .followUp({
                content:
                    "❌ Không thể tạo ván Mỏ Linh Thạch. Tiền cược đã được hoàn lại.",
                ephemeral: true,
            })
            .catch(() => undefined);
    }
}

async function handleButton(interaction) {
    const customId = String(interaction.customId || "");

    if (!customId.startsWith("mines_")) {
        return undefined;
    }

    const parts = customId.split("_");
    const action = parts[1];
    const userId = parts[2];
    const gameId = parts.slice(3).join("_");

    if (String(interaction.user.id) !== String(userId)) {
        return interaction.reply({
            content: "❌ Đây không phải Mỏ Linh Thạch của bạn.",
            ephemeral: true,
        });
    }

    const session = loadSession(userId);

    if (!session || session.id !== gameId || session.status !== "active") {
        return interaction.reply({
            content:
                "❌ Ván Mỏ Linh Thạch đã kết thúc, hết hạn hoặc bot không tìm thấy dữ liệu.",
            ephemeral: true,
        });
    }

    if (Number(session.expiresAt || 0) <= Date.now()) {
        await interaction.deferUpdate().catch(() => undefined);

        const result = session.opened.length > 0 ? "auto_cashout" : "refund";
        const settlement = settleSession(session, result);

        return interaction.editReply({
            embeds: [
                buildEmbed(session, {
                    result,
                    revealAll: true,
                    resultText: buildSettlementText(
                        session,
                        result,
                        settlement,
                    ),
                }),
            ],
            components: [],
        });
    }

    if (session.processing) {
        return interaction.reply({
            content: "⏳ Ván đang xử lý, đừng bấm liên tục.",
            ephemeral: true,
        });
    }

    if (action === "cashout" && session.opened.length <= 0) {
        return interaction.reply({
            content:
                "❌ Bạn phải đào an toàn ít nhất một ô mới được thu hoạch.",
            ephemeral: true,
        });
    }

    let selectedIndex = null;

    if (action === "pick") {
        selectedIndex = Number(interaction.values?.[0]);

        if (
            !Number.isInteger(selectedIndex) ||
            selectedIndex < 0 ||
            selectedIndex >= config.totalTiles ||
            session.opened.includes(selectedIndex)
        ) {
            return interaction.reply({
                content: "❌ Ô đã chọn không hợp lệ hoặc đã được đào.",
                ephemeral: true,
            });
        }
    }

    session.processing = true;
    clearTimer(session.userId);

    await interaction.deferUpdate();

    try {
        if (action === "abandon") {
            const settlement = settleSession(session, "abandon");

            return interaction.editReply({
                embeds: [
                    buildEmbed(session, {
                        result: "abandon",
                        revealAll: true,
                        resultText: buildSettlementText(
                            session,
                            "abandon",
                            settlement,
                        ),
                    }),
                ],
                components: [],
            });
        }

        if (action === "cashout") {
            const settlement = settleSession(session, "cashout");

            return interaction.editReply({
                embeds: [
                    buildEmbed(session, {
                        result: "cashout",
                        revealAll: true,
                        resultText: buildSettlementText(
                            session,
                            "cashout",
                            settlement,
                        ),
                    }),
                ],
                components: [],
            });
        }

        if (action !== "pick") {
            session.processing = false;
            persistSession(session);
            scheduleTimeout(session, interaction.client);

            return interaction.editReply({
                embeds: [buildEmbed(session)],
                components: buildComponents(session),
            });
        }

        if (session.mineIndexes.includes(selectedIndex)) {
            const settlement = settleSession(session, "mine");

            return interaction.editReply({
                embeds: [
                    buildEmbed(session, {
                        result: "mine",
                        revealAll: true,
                        hitIndex: selectedIndex,
                        resultText: buildSettlementText(
                            session,
                            "mine",
                            settlement,
                            selectedIndex,
                        ),
                    }),
                ],
                components: [],
            });
        }

        const allSafeOpened = getRemainingSafeTiles(session) <= 0;

        // Chỉ tự thu hoạch khi người chơi đã mở hết
        // toàn bộ ô an toàn trên bàn.
        if (allSafeOpened) {
            const settlement = settleSession(session, "auto_cashout");

            return interaction.editReply({
                embeds: [
                    buildEmbed(session, {
                        result: "auto_cashout",
                        revealAll: true,
                        resultText:
                            "🏆 **Bạn đã đào hết toàn bộ ô an toàn!**\n" +
                            buildSettlementText(
                                session,
                                "auto_cashout",
                                settlement,
                            ),
                    }),
                ],
                components: [],
            });
        }

        session.processing = false;
        persistSession(session);
        scheduleTimeout(session, interaction.client);

        return interaction.editReply({
            embeds: [buildEmbed(session)],
            components: buildComponents(session),
        });
    } catch (error) {
        console.error("[MO LINH THACH INTERACTION]", error);

        const current = loadSession(userId);

        if (current && current.id === gameId && current.status === "active") {
            current.processing = false;
            persistSession(current);
            scheduleTimeout(current, interaction.client);
        }

        return interaction
            .followUp({
                content:
                    "❌ Mỏ Linh Thạch gặp lỗi khi xử lý. Ván vẫn được giữ, hãy thử lại.",
                ephemeral: true,
            })
            .catch(() => undefined);
    }
}

async function recover(client) {
    const userIds = getSessionIndex();

    if (userIds.length <= 0) {
        return 0;
    }

    let recovered = 0;

    for (const userId of userIds) {
        const session = normalizeSession(db.getSystemValue(sessionKey(userId)));

        if (!session || session.status !== "active") {
            deletePersistedSession(userId);
            continue;
        }

        activeSessions.set(String(userId), session);

        if (session.expiresAt <= Date.now()) {
            await expireSession(client, session);
            recovered += 1;
            continue;
        }

        scheduleTimeout(session, client);
        recovered += 1;
    }

    console.log(`[MỎ LINH THẠCH] Khôi phục ${recovered} ván.`);
    return recovered;
}

module.exports = {
    start,
    handleButton,
    recover,
    calculateRawMultiplier,
    getPayoutDetails,
};
