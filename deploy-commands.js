require("dotenv").config();

const { REST, Routes } = require("discord.js");

const commandConfigs = require("./config/commands");
const { buildCommands } = require("./utils/buildCommands");

function requireEnv(name) {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Missing env: ${name}`);
    }

    return value;
}

function validateEnvId(name, value) {
    if (!/^\d{17,20}$/.test(value)) {
        throw new Error(`${name} không hợp lệ: ${value}`);
    }
}

const token = requireEnv("TOKEN");
const clientId = requireEnv("CLIENT_ID");
const guildId = requireEnv("GUILD_ID");

validateEnvId("CLIENT_ID", clientId);
validateEnvId("GUILD_ID", guildId);

const rest = new REST({
    version: "10",
    timeout: 15_000,
}).setToken(token);

async function deploy() {
    console.log("Checking config...");
    console.log(`CLIENT_ID: ${clientId}`);
    console.log(`GUILD_ID: ${guildId}`);
    console.log(`Commands: ${commandConfigs.length}`);
    console.log("Deploying commands...");

    const commands = buildCommands(commandConfigs);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
    });

    console.log("Done.");
}

deploy().catch((error) => {
    console.error("Deploy failed:");
    console.error(error);
});
