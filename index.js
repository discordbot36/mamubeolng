require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const botConfig = require("./config/bot");
const router = require("./core/router");
const leaderboard = require("./leaderboard");
const bicanh =
    require("./bicanh");

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
    console.error("[Client Error]", error);
});

process.on("unhandledRejection", (error) => {
    console.error("[Unhandled Rejection]", error);
});

process.on("uncaughtException", (error) => {
    console.error("[Uncaught Exception]", error);
});

client.once("clientReady", () => {
    console.log(`Logged in as ${client.user.tag}`);

    bicanh.recover(client)
    .catch((error) => {
        console.error(
            "[BiCanh Recover]",
            error,
        );
    });

    leaderboard.startAutoUpdate(client);
});

client.on("interactionCreate", async (interaction) => {
    try {
        if (interaction.isAutocomplete()) {
            return router.handleAutocomplete(interaction);
        }

        if (interaction.isChatInputCommand()) {
            return router.handleCommand(interaction);
        }

        if (interaction.isModalSubmit()) {
            return router.handleModal(interaction);
        }

        if (interaction.isButton() || interaction.isStringSelectMenu()) {
            return router.handleButton(interaction);
        }

        return undefined;
    } catch (error) {
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
