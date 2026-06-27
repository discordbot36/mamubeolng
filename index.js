require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const botConfig = require("./config/bot");
const router = require("./core/router");
const leaderboard = require("./leaderboard");
const bicanh = require("./bicanh");
const worldboss = require("./worldboss");
const sanyeuthu = require("./sanyeuthu");
const raidserver = require("./raidserver");

function requireEnv(name) {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Missing env: ${name}`);
    }

    return value;
}

function buildIntents() {
    const intents = [];

    if (botConfig.intents.guilds) {
        intents.push(GatewayIntentBits.Guilds);
    }

    if (botConfig.intents.guildMessages) {
        intents.push(GatewayIntentBits.GuildMessages);
    }

    if (botConfig.intents.messageContent) {
        intents.push(GatewayIntentBits.MessageContent);
    }

    return intents;
}

const client = new Client({ intents: buildIntents() });

client.on("error", (error) => {
    if (isIgnoredInteractionError(error)) {
        return;
    }

    console.error("[Client Error]", error);
});

process.on("unhandledRejection", (error) => {
    if (isIgnoredInteractionError(error)) {
        return;
    }

    console.error("[Unhandled Rejection]", error);
});

process.on("uncaughtException", (error) => {
    console.error("[Uncaught Exception]", error);
});

function isIgnoredInteractionError(error) {
    return (
        error?.code === 10062 ||
        error?.code === 40060 ||
        error?.rawError?.code === 10062 ||
        error?.rawError?.code === 40060
    );
}

client.once("clientReady", () => {
    console.log(`Logged in as ${client.user.tag}`);

    bicanh.recover(client).catch((error) => {
        console.error("[BiCanh Recover]", error);
    });

    sanyeuthu.recover(client).catch((error) => {
        console.error("[SanYeuThu Recover]", error);
    });
    raidserver.recover(client).catch((error) => {
        console.error("[RaidServer Recover]", error);
    });

    raidserver.startAutoSchedule(client);
    router.startAutoActiveRain?.(client);

    leaderboard.startAutoUpdate(client);
    worldboss.startAutoSpawn(client);
});

client.on("interactionCreate", async (interaction) => {
    try {
        if (interaction.isAutocomplete()) {
            await router.handleAutocomplete(interaction);
            return;
        }

        if (interaction.isChatInputCommand()) {
            await router.handleCommand(interaction);
            return;
        }

        if (interaction.isModalSubmit()) {
            await router.handleModal(interaction);
            return;
        }

        if (interaction.isButton() || interaction.isStringSelectMenu()) {
            await router.handleButton(interaction);
            return;
        }

        return undefined;
    } catch (error) {
        if (isIgnoredInteractionError(error)) {
            return undefined;
        }

        console.error(error);

        if (!interaction.isRepliable()) {
            return undefined;
        }

        const payload = {
            content: "❌ Bot lỗi rồi, xem console để sửa.",
            ephemeral: true,
        };

        if (interaction.replied || interaction.deferred) {
            return interaction.followUp(payload).catch(() => undefined);
        }

        return interaction.reply(payload).catch(() => undefined);
    }
});

client.on("messageCreate", async (message) => {
    try {
        return router.handleMessage(message);
    } catch (error) {
        console.error(error);
        return undefined;
    }
});

client.login(requireEnv("TOKEN"));
