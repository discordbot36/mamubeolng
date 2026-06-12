const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
} = require("discord.js");

const {
    getBalance,
    removeMoney,
    addMoney,
    formatMoney,
    getCurrencyEmoji,
    getSystemValue,
    setSystemValue,
    deleteSystemValue,
} = require("./database");

const dothach = require("./dothach");
const dothachConfig = require("./config/dothach");
const config = require("./config/dothachTournament");

const STATE_KEY = "dothachTournament";

function now() {
    return Date.now();
}

function createTournamentId() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function loadState() {
    return getSystemValue(STATE_KEY) || null;
}

function saveState(state) {
    return setSystemValue(STATE_KEY, state);
}

function clearState() {
    return deleteSystemValue(STATE_KEY);
}

function getPlayerCount(state) {
    return Object.keys(state.players || {}).length;
}

function getPrizePool(state) {
    return getPlayerCount(state) * Number(state.fee || 0);
}

function countAvailableStones(state) {
    return (state.stonePool || []).filter((stone) => !stone.takenBy).length;
}

function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes <= 0) {
        return `${seconds} giây`;
    }

    return `${minutes} phút ${seconds} giây`;
}

function getTimeLeftText(state) {
    if (!state.deadlineAt) {
        return "chưa bắt đầu tính giờ";
    }

    return formatDuration(Number(state.deadlineAt) - now());
}

function isDeadlinePassed(state) {
    return Boolean(state.deadlineAt && now() > Number(state.deadlineAt));
}

function mention(userId) {
    return `<@${userId}>`;
}

function getRankEmoji(rank) {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
}

function createRegisterRow(state) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`gdt_join_${state.id}`)
            .setLabel("Đăng ký tham gia")
            .setEmoji("🏆")
            .setStyle(ButtonStyle.Success)
            .setDisabled(state.status !== "signup"),
    );
}

function createArenaRow(state) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`gdt_pick_${state.id}`)
            .setLabel("Chọn đá")
            .setEmoji("🪨")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(state.status !== "running"),
        new ButtonBuilder()
            .setCustomId(`gdt_cut_${state.id}`)
            .setLabel("Đổ thạch")
            .setEmoji("🔪")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(state.status !== "running"),
    );
}

function createMachineRow(state, disabled = false) {
    const row = new ActionRowBuilder();

    dothachConfig.machines.forEach((machine, index) => {
        const button = new ButtonBuilder()
            .setCustomId(`gdt_machine_${state.id}_${index}`)
            .setLabel(machine.name)
            .setStyle(machine.style || ButtonStyle.Primary)
            .setDisabled(disabled);

        if (machine.emoji) {
            button.setEmoji(machine.emoji);
        }

        row.addComponents(button);
    });

    return row;
}

function getSignupContent(state) {
    const coin = getCurrencyEmoji();

    return (
        `🏆 **GIẢI ĐỔ THẠCH MAMU**\n\n` +
        `${coin} Phí tham gia: **${formatMoney(state.fee)}**\n` +
        `🐷 Rate ngọc: **Đá Mamu**\n` +
        `👥 Đã đăng ký: **${getPlayerCount(state)}** người\n\n` +
        `Bấm nút bên dưới để đăng ký. Tiền sẽ bị trừ ngay khi đăng ký.`
    );
}

function getArenaContent(state) {
    const coin = getCurrencyEmoji();

    return (
        `🏆 **SÀN ĐẤU ĐỔ THẠCH MAMU**\n\n` +
        `👥 Người chơi: **${getPlayerCount(state)}**\n` +
        `${coin} Tổng phí đăng ký: **${formatMoney(getPrizePool(state))}**\n` +
        `🪨 Đá giải còn lại: **${countAvailableStones(state)}**\n` +
        `🐷 Rate roll: **Đá Mamu**\n` +
        `⏳ Thời gian còn lại: **${getTimeLeftText(state)}**\n\n` +
        `Luật: chọn đá tạm → chọn máy cắt → ngọc chỉ tính BXH, không vào kho.\n` +
        `Top 1-2-3 chỉ là kết quả, admin tự cộng thưởng bằng tay.`
    );
}

function getSortedResults(state) {
    return Object.values(state.players || {})
        .filter((player) => player.status === "done" && player.result)
        .sort((a, b) => {
            const valueDiff = Number(b.value || 0) - Number(a.value || 0);

            if (valueDiff !== 0) {
                return valueDiff;
            }

            const purityDiff =
                Number(b.result?.purity || 0) - Number(a.result?.purity || 0);

            if (purityDiff !== 0) {
                return purityDiff;
            }

            return Number(a.cutAt || 0) - Number(b.cutAt || 0);
        });
}

function markTimeoutPlayers(state) {
    for (const player of Object.values(state.players || {})) {
        if (["done", "exploded"].includes(player.status)) {
            continue;
        }

        player.status = "timeout";
        player.value = 0;
        player.timedOutAt = now();
    }
}

function calculateSuggestedPayouts(state, rankings) {
    const topPlayers = rankings.slice(0, config.prizeRates.length);

    if (topPlayers.length <= 0) {
        return [];
    }

    const activeRates = config.prizeRates.slice(0, topPlayers.length);
    const totalRate = activeRates.reduce(
        (total, prize) => total + prize.rate,
        0,
    );
    const prizePool = getPrizePool(state);
    let paid = 0;

    return topPlayers.map((player, index) => {
        let amount = Math.floor(
            (prizePool * activeRates[index].rate) / totalRate,
        );

        if (index === topPlayers.length - 1) {
            amount = prizePool - paid;
        }

        paid += amount;

        return {
            userId: player.userId,
            rank: index + 1,
            amount,
        };
    });
}

function buildResultContent(state) {
    const coin = getCurrencyEmoji();
    const rankings = getSortedResults(state);
    const suggestedPayouts = calculateSuggestedPayouts(state, rankings);
    const payoutByUser = new Map(
        suggestedPayouts.map((payout) => [payout.userId, payout]),
    );

    const exploded = Object.values(state.players || {}).filter(
        (player) => player.status === "exploded",
    );

    const timeout = Object.values(state.players || {}).filter(
        (player) => player.status === "timeout",
    );

    const lines = [
        "🏆 **KẾT QUẢ GIẢI ĐỔ THẠCH MAMU**",
        "",
        `${coin} Tổng phí đăng ký: **${formatMoney(getPrizePool(state))}**`,
        `👥 Người tham gia: **${getPlayerCount(state)}**`,
        "⚠️ Bot **không tự cộng thưởng**. Admin tự dùng `/addmoney` nếu muốn trả giải.",
        "",
    ];

    if (rankings.length <= 0) {
        lines.push("Không ai cắt ra ngọc hợp lệ. Toàn bộ người chơi 0 đồng.");
    } else {
        rankings.slice(0, 10).forEach((player, index) => {
            const rank = index + 1;
            const result = player.result;
            const payout = payoutByUser.get(player.userId);
            const payoutText = payout
                ? `\n${coin} Gợi ý thưởng: **${formatMoney(payout.amount)}**`
                : "";

            lines.push(
                `${getRankEmoji(rank)} ${mention(player.userId)}\n` +
                    `${result.emoji || "💎"} Thành phẩm: **${result.finalName}**\n` +
                    `✨ Tinh khiết: **${result.purity}%**\n` +
                    `💰 Giá trị ngọc: **${formatMoney(result.value)}**${payoutText}`,
            );
        });
    }

    if (exploded.length > 0) {
        lines.push(
            "",
            `💥 Nổ máy: ${exploded.map((p) => mention(p.userId)).join(", ")}`,
        );
    }

    if (timeout.length > 0) {
        lines.push(
            "",
            `⏰ Không đổ kịp: ${timeout.map((p) => mention(p.userId)).join(", ")}`,
        );
    }

    if (suggestedPayouts.length > 0) {
        lines.push("", "📌 **Lệnh admin có thể tự cộng tay:**");

        for (const payout of suggestedPayouts) {
            lines.push(
                `/addmoney user:${mention(payout.userId)} amount:${payout.amount}`,
            );
        }
    }

    return lines.join("\n");
}

function ensureStateIdMatches(state, id) {
    return state && String(state.id) === String(id);
}

async function sendToTournamentChannel(
    client,
    state,
    content,
    components = [],
) {
    if (!state?.tournamentChannelId) {
        return null;
    }

    const channel = await client.channels
        .fetch(state.tournamentChannelId)
        .catch(() => null);

    if (!channel || !channel.isTextBased()) {
        return null;
    }

    return channel.send({ content, components });
}

async function updateSignupMessage(interaction, state) {
    if (!interaction.message || !interaction.message.edit) {
        return;
    }

    await interaction.message
        .edit({
            content: getSignupContent(state),
            components: [createRegisterRow(state)],
        })
        .catch(() => null);
}

function buildPlayerPermissionOverwrites(interaction, state) {
    const overwrites = [
        {
            id: interaction.guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
        },
        {
            id: interaction.client.user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageChannels,
            ],
        },
        {
            id: interaction.user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
            ],
        },
    ];

    for (const userId of Object.keys(state.players || {})) {
        overwrites.push({
            id: userId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
            ],
        });
    }

    return overwrites;
}

function normalizeName(text, fallback) {
    const value = String(text || "").trim();

    if (!value) {
        return fallback;
    }

    return value.slice(0, 80);
}

class DoThachTournamentManager {
    async open(interaction) {
        const current = loadState();

        if (current && current.status !== "finished") {
            return interaction.reply({
                content: config.messages.alreadyOpen,
                ephemeral: true,
            });
        }

        const fee = interaction.options.getInteger("phi") || config.fee;

        const state = {
            id: createTournamentId(),
            status: "signup",
            fee,
            rollStoneId: config.rollStoneId,
            guildId: interaction.guildId,
            signupChannelId: interaction.channelId,
            signupMessageId: null,
            tournamentChannelId: null,
            createdBy: interaction.user.id,
            createdAt: now(),
            startedAt: null,
            deadlineAt: null,
            finishedAt: null,
            stonePool: [],
            players: {},
        };

        saveState(state);

        await interaction.reply({
            content: getSignupContent(state),
            components: [createRegisterRow(state)],
        });

        const message = await interaction.fetchReply().catch(() => null);

        if (message) {
            state.signupMessageId = message.id;
            saveState(state);
        }

        return undefined;
    }

    async start(interaction) {
        const state = loadState();

        if (!state || state.status === "finished") {
            return interaction.reply({
                content: config.messages.noTournament,
                ephemeral: true,
            });
        }

        if (state.status !== "signup") {
            return interaction.reply({
                content: "❌ Giải đã bắt đầu rồi.",
                ephemeral: true,
            });
        }

        const playerCount = getPlayerCount(state);

        if (playerCount < config.minPlayers) {
            return interaction.reply({
                content: `❌ Cần ít nhất ${config.minPlayers} người đăng ký để bắt đầu.`,
                ephemeral: true,
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const channelName =
            `${config.channelPrefix}-${state.id.slice(-4)}`.toLowerCase();
        const parent = interaction.channel?.parentId || undefined;

        const channel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent,
            reason: "Tạo channel tạm cho giải đổ thạch Mamu",
            permissionOverwrites: buildPlayerPermissionOverwrites(
                interaction,
                state,
            ),
        });

        state.status = "running";
        state.startedAt = now();
        state.tournamentChannelId = channel.id;

        saveState(state);

        await channel.send({
            content: getArenaContent(state),
            components: [createArenaRow(state)],
        });

        return interaction.editReply({
            content:
                `✅ Đã bắt đầu giải và tạo channel ${channel}.\n` +
                `Admin dùng \`/giaidothach_addda\` để thêm đá tạm.`,
        });
    }

    async addStone(interaction) {
        const state = loadState();

        if (!state || state.status === "finished") {
            return interaction.reply({
                content: config.messages.noTournament,
                ephemeral: true,
            });
        }

        if (state.status !== "running") {
            return interaction.reply({
                content:
                    "❌ Giải chưa bắt đầu. Hãy dùng /giaidothach_batdau trước.",
                ephemeral: true,
            });
        }

        const amount = interaction.options.getInteger("soluong");

        const stoneName = normalizeName(
            interaction.options.getString("ten"),
            "Đá giải Mamu",
        );

        const startIndex = state.stonePool.length + 1;

        for (let index = 0; index < amount; index += 1) {
            state.stonePool.push({
                id: `${state.id}_${startIndex + index}`,
                name: `${stoneName} #${startIndex + index}`,
                takenBy: null,
                createdAt: now(),
            });
        }

        if (!state.deadlineAt) {
            state.deadlineAt = now() + config.durationMs;
        }

        saveState(state);

        await interaction.reply({
            content:
                `✅ Đã thêm **${amount}** viên đá tạm vào giải.\n` +
                `🪨 Đá còn lại: **${countAvailableStones(state)}**\n` +
                `⏳ Thời gian còn lại: **${getTimeLeftText(state)}**`,
            ephemeral: true,
        });

        return sendToTournamentChannel(
            interaction.client,
            state,
            getArenaContent(state),
            [createArenaRow(state)],
        );
    }

    async finish(interaction) {
        const state = loadState();

        if (!state || state.status === "finished") {
            return interaction.reply({
                content: config.messages.noTournament,
                ephemeral: true,
            });
        }

        markTimeoutPlayers(state);

        state.status = "finished";
        state.finishedAt = now();

        saveState(state);

        const content = buildResultContent(state);

        await interaction.reply({
            content: "✅ Đã chốt giải. Bot chỉ xuất BXH, không tự cộng thưởng.",
            ephemeral: true,
        });

        return sendToTournamentChannel(interaction.client, state, content);
    }

    async cancel(interaction) {
        const state = loadState();

        if (!state || state.status === "finished") {
            return interaction.reply({
                content: config.messages.noTournament,
                ephemeral: true,
            });
        }

        for (const player of Object.values(state.players || {})) {
            addMoney(player.userId, Number(state.fee || 0));
        }

        clearState();

        return interaction.reply({
            content: `✅ Đã hủy giải và hoàn phí cho **${getPlayerCount(state)}** người chơi.`,
            ephemeral: true,
        });
    }

    async handleButton(interaction) {
        if (!interaction.customId.startsWith("gdt_")) {
            return undefined;
        }

        const parts = interaction.customId.split("_");
        const action = parts[1];
        const tournamentId = parts[2];
        const state = loadState();

        if (!ensureStateIdMatches(state, tournamentId)) {
            return interaction.reply({
                content: "❌ Button này không còn thuộc giải hiện tại.",
                ephemeral: true,
            });
        }

        if (action === "join") {
            return this.join(interaction, state);
        }

        if (action === "pick") {
            return this.pickStone(interaction, state);
        }

        if (action === "cut") {
            return this.openMachinePicker(interaction, state);
        }

        if (action === "machine") {
            const machineIndex = Number.parseInt(parts[3], 10);
            return this.chooseMachine(interaction, state, machineIndex);
        }

        return undefined;
    }

    async join(interaction, state) {
        state = loadState();

        if (!ensureStateIdMatches(state, interaction.customId.split("_")[2])) {
            return interaction.reply({
                content: "❌ Button này không còn thuộc giải hiện tại.",
                ephemeral: true,
            });
        }

        if (state.status !== "signup") {
            return interaction.reply({
                content: config.messages.signupClosed,
                ephemeral: true,
            });
        }

        const userId = interaction.user.id;

        if (state.players[userId]) {
            return interaction.reply({
                content: config.messages.alreadyRegistered,
                ephemeral: true,
            });
        }

        if (getPlayerCount(state) >= config.maxPlayers) {
            return interaction.reply({
                content: "❌ Giải đã đủ người.",
                ephemeral: true,
            });
        }

        if (getBalance(userId) < state.fee) {
            return interaction.reply({
                content: config.messages.notEnoughMoney,
                ephemeral: true,
            });
        }

        const payResult = removeMoney(userId, state.fee);

        if (!payResult.success) {
            return interaction.reply({
                content: `❌ ${payResult.message}`,
                ephemeral: true,
            });
        }

        state.players[userId] = {
            userId,
            username: interaction.user.username,
            displayName:
                interaction.member?.displayName || interaction.user.username,
            joinedAt: now(),
            status: "registered",
            stoneId: null,
            stoneName: null,
            pickedAt: null,
            blackMachineIndex: null,
            cutAt: null,
            value: 0,
            result: null,
        };

        saveState(state);
        await updateSignupMessage(interaction, state);

        return interaction.reply({
            content: `✅ Đăng ký thành công. Đã trừ **${formatMoney(state.fee)}** ${getCurrencyEmoji()}.`,
            ephemeral: true,
        });
    }

    async pickStone(interaction, state) {
        state = loadState();

        if (!ensureStateIdMatches(state, interaction.customId.split("_")[2])) {
            return interaction.reply({
                content: "❌ Button này không còn thuộc giải hiện tại.",
                ephemeral: true,
            });
        }

        if (state.status !== "running") {
            return interaction.reply({
                content: "❌ Giải chưa ở trạng thái thi đấu.",
                ephemeral: true,
            });
        }

        if (isDeadlinePassed(state)) {
            return interaction.reply({
                content:
                    "⏰ Đã hết thời gian đổ thạch. Chờ admin chốt kết quả.",
                ephemeral: true,
            });
        }

        const player = state.players[interaction.user.id];

        if (!player) {
            return interaction.reply({
                content: config.messages.notRegistered,
                ephemeral: true,
            });
        }

        if (["picked", "cutting", "done", "exploded"].includes(player.status)) {
            return interaction.reply({
                content: config.messages.alreadyPicked,
                ephemeral: true,
            });
        }

        const available = (state.stonePool || []).filter(
            (stone) => !stone.takenBy,
        );

        if (available.length <= 0) {
            return interaction.reply({
                content: config.messages.noStones,
                ephemeral: true,
            });
        }

        const selected =
            available[Math.floor(Math.random() * available.length)];

        selected.takenBy = player.userId;
        selected.takenAt = now();

        player.status = "picked";
        player.stoneId = selected.id;
        player.stoneName = selected.name;
        player.pickedAt = now();

        saveState(state);

        return interaction.reply({
            content:
                `🪨 ${interaction.user} đã chọn **${selected.name}**.\n` +
                `Bấm **Đổ thạch** rồi chọn máy cắt để tính kết quả.`,
        });
    }

    async openMachinePicker(interaction, state) {
        state = loadState();

        if (!ensureStateIdMatches(state, interaction.customId.split("_")[2])) {
            return interaction.reply({
                content: "❌ Button này không còn thuộc giải hiện tại.",
                ephemeral: true,
            });
        }

        if (state.status !== "running") {
            return interaction.reply({
                content: "❌ Giải chưa ở trạng thái thi đấu.",
                ephemeral: true,
            });
        }

        if (isDeadlinePassed(state)) {
            return interaction.reply({
                content:
                    "⏰ Đã hết thời gian đổ thạch. Chờ admin chốt kết quả.",
                ephemeral: true,
            });
        }

        const player = state.players[interaction.user.id];

        if (!player) {
            return interaction.reply({
                content: config.messages.notRegistered,
                ephemeral: true,
            });
        }

        if (player.status === "registered") {
            return interaction.reply({
                content: "❌ Bạn cần bấm **Chọn đá** trước.",
                ephemeral: true,
            });
        }

        if (["done", "exploded"].includes(player.status)) {
            return interaction.reply({
                content: config.messages.alreadyFinished,
                ephemeral: true,
            });
        }

        if (player.status !== "picked") {
            return interaction.reply({
                content: "❌ Trạng thái của bạn không hợp lệ để đổ thạch.",
                ephemeral: true,
            });
        }

        player.status = "cutting";
        player.blackMachineIndex = Math.floor(
            Math.random() * dothachConfig.machines.length,
        );

        saveState(state);

        return interaction.reply({
            content:
                `🔪 Bạn đang đổ **${player.stoneName || "Đá giải"}**.\n` +
                `Chọn 1 trong ${dothachConfig.machines.length} máy. Có 1 máy đen sẽ nổ.`,
            components: [createMachineRow(state)],
            ephemeral: true,
        });
    }

    async chooseMachine(interaction, state, machineIndex) {
        state = loadState();

        if (!ensureStateIdMatches(state, interaction.customId.split("_")[2])) {
            return interaction.reply({
                content: "❌ Button này không còn thuộc giải hiện tại.",
                ephemeral: true,
            });
        }

        if (isDeadlinePassed(state)) {
            return interaction.reply({
                content:
                    "⏰ Đã hết thời gian đổ thạch. Chờ admin chốt kết quả.",
                ephemeral: true,
            });
        }

        const player = state.players[interaction.user.id];

        if (!player) {
            return interaction.reply({
                content: config.messages.notRegistered,
                ephemeral: true,
            });
        }

        if (player.status !== "cutting") {
            return interaction.reply({
                content: "❌ Lượt chọn máy này không còn hợp lệ.",
                ephemeral: true,
            });
        }

        const machine = dothachConfig.machines[machineIndex];

        if (!machine) {
            return interaction.reply({
                content: "❌ Máy cắt không hợp lệ.",
                ephemeral: true,
            });
        }

        if (machineIndex === Number(player.blackMachineIndex)) {
            player.status = "exploded";
            player.value = 0;
            player.cutAt = now();

            saveState(state);

            await interaction.update({
                content:
                    `Bạn chọn **${machine.name}**.\n\n` +
                    config.messages.exploded,
                components: [createMachineRow(state, true)],
            });

            return interaction.channel.send(
                `💥 ${interaction.user} chọn **${machine.name}** và nổ máy. Giá trị: **0**.`,
            );
        }

        const result = dothach.rollTemporaryResult(config.rollStoneId);

        if (!result) {
            return interaction.update({
                content:
                    "❌ Không roll được kết quả Đá Mamu. Kiểm tra config/dothach.js.",
                components: [createMachineRow(state, true)],
            });
        }

        const gemResult = {
            gemId: result.gem.id,
            gemName: result.gem.name,
            emoji: result.gem.emoji || "💎",
            gradeName: result.grade.name,
            purity: result.purity,
            value: result.value,
            finalName: result.finalName,
        };

        player.status = "done";
        player.value = result.value;
        player.cutAt = now();
        player.result = gemResult;

        saveState(state);

        await interaction.update({
            content:
                `Bạn chọn **${machine.name}**.\n\n` +
                `${gemResult.emoji} Thành phẩm: **${gemResult.finalName}**\n` +
                `✨ Tinh khiết: **${gemResult.purity}%**\n` +
                `💰 Giá trị tính giải: **${formatMoney(gemResult.value)}**\n\n` +
                `Ngọc này chỉ tính vào BXH giải, không vào kho đồ.`,
            components: [createMachineRow(state, true)],
        });

        return interaction.channel.send(
            `${interaction.user} đã đổ thạch xong: ${gemResult.emoji} **${gemResult.finalName}** - ` +
                `giá trị **${formatMoney(gemResult.value)}**.`,
        );
    }
}

module.exports = new DoThachTournamentManager();
