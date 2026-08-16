const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { announceRareDrop, isRareDog } = require("./utils/rareDrop");
const {
    addMoney,
    addInventoryItem,
    formatMoney,
    claimWorkCooldown,
} = require("./database");

const workConfig = require("./config/work");
const quest = require("./quest");
const { runLuckyWheel } = require("./utils/luckywheel");
function roll(chance) {
    return Math.random() < chance;
}

function getJobs() {
    return workConfig.jobs;
}

function getJob(jobId) {
    return getJobs()[jobId];
}

function getWorkCooldownMs() {
    return (workConfig.cooldown?.minutes ?? 15) * 60 * 1000;
}

function formatTimeLeft(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes <= 0) {
        return `${seconds} giây`;
    }

    if (seconds <= 0) {
        return `${minutes} phút`;
    }

    return `${minutes} phút ${seconds} giây`;
}

function randomBetween(min, max, decimalPlaces = 0) {
    const value = Math.random() * (max - min) + min;
    const multiplier = 10 ** decimalPlaces;

    return Math.round(value * multiplier) / multiplier;
}

function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function pickWeightedDog(dogs) {
    const totalChance = dogs.reduce((total, dog) => {
        return total + (dog.chance || 0);
    }, 0);

    let roll = Math.random() * totalChance;

    for (const dog of dogs) {
        roll -= dog.chance || 0;

        if (roll <= 0) {
            return dog;
        }
    }

    return dogs[dogs.length - 1];
}

function createShipperButtons(userId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`work_shipper_steal_${userId}`)
            .setLabel("Bú")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`work_shipper_honest_${userId}`)
            .setLabel("Lương thiện")
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
    );
}
function finishWork(interaction, basePayload, responseType = "editReply") {
    return runLuckyWheel(interaction, {
        userId: interaction.user.id,
        source: "work",
        responseType,
        basePayload,
    });
}
class WorkManager {
    autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();

        const choices = Object.entries(getJobs())
            .filter(
                ([jobId, job]) =>
                    jobId.toLowerCase().includes(focusedValue) ||
                    job.name.toLowerCase().includes(focusedValue),
            )
            .slice(0, 25)
            .map(([jobId, job]) => ({ name: job.name, value: jobId }));

        return interaction.respond(choices);
    }

    async start(interaction) {
        await interaction.deferReply();

        const jobId = interaction.options.getString("job");
        const job = getJob(jobId);

        if (!job) {
            return interaction.editReply({
                content: "❌ Có lỗi xảy ra",
                ephemeral: true,
            });
        }

        const cooldownResult = claimWorkCooldown(
            interaction.user.id,
            getWorkCooldownMs(),
        );

        if (!cooldownResult.success) {
            return interaction.editReply({
                content:
                    `⏳ Bạn vừa đi làm rồi!
` + `Quay lại sau ${formatTimeLeft(cooldownResult.timeLeft)}`,
                ephemeral: true,
            });
        }

        const handlers = {
            simple: this.handleSimpleJob.bind(this),
            jailRisk: this.handleJailRiskJob.bind(this),
            shipper: this.handleShipperJob.bind(this),
            dogSteal: this.handleDogStealJob.bind(this),
        };

        const handler = handlers[job.type];

        if (!handler) {
            return interaction.editReply({
                content: "❌ Có lỗi xảy ra",
                ephemeral: true,
            });
        }

        return handler(interaction, job);
    }

    async handleSimpleJob(interaction, job) {
        addMoney(interaction.user.id, job.reward);
        quest.trackQuestProgress(interaction.user.id, "work", 1);

        return finishWork(interaction, {
            content:
                `${interaction.user} đi làm ${job.name}

` + `💰 Nhận: ${formatMoney(job.reward)}`,
        });
    }

    async handleJailRiskJob(interaction, job) {
        if (roll(job.jailChance)) {
            return interaction.editReply({
                content:
                    `${interaction.user} đi làm ${job.name}\n\n` + `🚓 Tù ngay`,
            });
        }

        if (job.iphoneChance && job.stolenItem && roll(job.iphoneChance)) {
            addInventoryItem(interaction.user.id, {
                id: job.stolenItem.id,
                name: job.stolenItem.name,
                type: "stolen",
                value: job.stolenItem.price,
            });

            quest.trackQuestProgress(interaction.user.id, "work", 1);

            return finishWork(interaction, {
                content:
                    `${interaction.user} đi làm ${job.name}\n\n` +
                    `📱 Móc được **${job.stolenItem.name}**!\n` +
                    `💰 Giá trị: ${formatMoney(job.stolenItem.price)}\n\n` +
                    `Đã bỏ vào kho đồ`,
            });
        }

        addMoney(interaction.user.id, job.reward);
        quest.trackQuestProgress(interaction.user.id, "work", 1);

        return finishWork(interaction, {
            content:
                `${interaction.user} đi làm ${job.name}\n\n` +
                `💰 Nhận: ${formatMoney(job.reward)}`,
        });
    }

    async handleShipperJob(interaction, job) {
        if (!roll(job.iphoneOrderChance)) {
            addMoney(interaction.user.id, job.reward);
            quest.trackQuestProgress(interaction.user.id, "work", 1);

            return finishWork(interaction, {
                content:
                    `${interaction.user} đi làm ${job.name}\n\n` +
                    `💰 Nhận: ${formatMoney(job.reward)}`,
            });
        }

        return interaction.editReply({
            content:
                `${interaction.user} giao trúng đơn hàng iPhone 17 Promax

` + `Chọn đi anh bạn:`,
            components: [createShipperButtons(interaction.user.id)],
        });
    }

    async handleDogStealJob(interaction, job) {
        if (roll(job.jailChance)) {
            return interaction.editReply({
                content:
                    `${interaction.user} đi ${job.name}

` + `🚓 Tù ngay`,
            });
        }

        const dog = pickWeightedDog(workConfig.dogs);
        const weightKg = randomBetween(
            workConfig.dogWeight.minKg,
            workConfig.dogWeight.maxKg,
            workConfig.dogWeight.decimalPlaces,
        );
        const value = Math.round(weightKg * dog.pricePerKg);

        const dogItem = {
            id: dog.id,
            name: dog.name,
            type: "dog",
            weightKg,
            pricePerKg: dog.pricePerKg,
            value,
        };

        addInventoryItem(interaction.user.id, dogItem);

        if (isRareDog(dogItem)) {
            await announceRareDrop(interaction.client, {
                user: interaction.user,
                emoji: "🐕",
                name: dogItem.name,
                detail:
                    `⚖️ Cân nặng: **${dogItem.weightKg}kg**\n` +
                    `💰 Giá trị: **${formatMoney(dogItem.value)}**`,
            });
        }

        quest.trackQuestProgress(interaction.user.id, "work", 1);

        return finishWork(interaction, {
            content:
                `${interaction.user} đi ${job.name}\n\n` +
                `${dog.name}\n` +
                `⚖️ ${weightKg}kg\n` +
                `💰 Giá trị: ${formatMoney(value)}\n\n` +
                `Đã bỏ vào kho đồ`,
        });
    }

    async handleButton(interaction) {
        if (!interaction.customId.startsWith("work_shipper_")) {
            return undefined;
        }

        const parts = interaction.customId.split("_");
        const action = parts[2];
        const userId = parts.slice(3).join("_");

        if (interaction.user.id !== userId) {
            return interaction.editReply({
                content: "❌ Không phải đơn của bạn",
                ephemeral: true,
            });
        }

        const job = getJob("shipper");
        const disabledRow = createShipperButtons(userId, true);

        if (action === "honest") {
            const honestReward =
                Number(job.reward || 0) + Number(job.honestBonus || 0);

            addMoney(userId, honestReward);
            quest.trackQuestProgress(userId, "work", 1);

            return finishWork(
                interaction,
                {
                    content:
                        `${interaction.user} chọn Lương thiện\n\n` +
                        `🙏 Giao hàng tử tế, được khổ chủ bo thêm **${formatMoney(job.honestBonus || 0)}**\n` +
                        `💰 Tổng nhận: ${formatMoney(honestReward)}`,
                    components: [disabledRow],
                },
                "update",
            );
        }

        if (action === "steal") {
            if (roll(job.stealJailChance)) {
                return interaction.editReply({
                    content: `${interaction.user} chọn Bú\n\n` + `🚓 Tù Ngay\n`,
                    components: [disabledRow],
                });
            }

            addInventoryItem(userId, {
                id: job.stolenItem.id,
                name: job.stolenItem.name,
                type: "stolen",
                value: job.stolenItem.price,
            });
            quest.trackQuestProgress(userId, "work", 1);

            return finishWork(
                interaction,
                {
                    content:
                        `${interaction.user} chọn Bú\n\n` +
                        `📱 Trộm thành công **${job.stolenItem.name}**\n` +
                        `💰 Giá trị: ${formatMoney(job.stolenItem.price)}\n\n` +
                        `Đã bỏ vào kho đồ`,
                    components: [disabledRow],
                },
                "update",
            );
        }

        return interaction.editReply({
            content: "❌ Có lỗi xảy ra",
            ephemeral: true,
        });
    }
}

module.exports = new WorkManager();
