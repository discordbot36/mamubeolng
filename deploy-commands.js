require("dotenv").config();

const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commandConfigs = require("./config/commands");

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

function applyChoices(optionBuilder, option) {
    if (Array.isArray(option.choices) && option.choices.length > 0) {
        optionBuilder.addChoices(
            ...option.choices.map((choice) => ({
                name: choice.name,
                value: choice.value,
            })),
        );
    }

    return optionBuilder;
}

function applyMinMax(optionBuilder, option) {
    if (Number.isInteger(option.minValue)) {
        optionBuilder.setMinValue(option.minValue);
    }

    if (Number.isInteger(option.maxValue)) {
        optionBuilder.setMaxValue(option.maxValue);
    }

    return optionBuilder;
}

function buildSlashCommand(commandConfig) {
    const builder = new SlashCommandBuilder()
        .setName(commandConfig.name)
        .setDescription(commandConfig.description || "Không có mô tả");

    if (commandConfig.defaultMemberPermissions !== undefined) {
        builder.setDefaultMemberPermissions(
            commandConfig.defaultMemberPermissions,
        );
    }

    if (commandConfig.dmPermission !== undefined) {
        builder.setDMPermission(Boolean(commandConfig.dmPermission));
    }

    const options = Array.isArray(commandConfig.options)
        ? commandConfig.options
        : [];

    function applyCommonOption(slashOption, option) {
        slashOption
            .setName(option.name)
            .setDescription(option.description || "Không có mô tả")
            .setRequired(Boolean(option.required));

        if (
            option.autocomplete &&
            typeof slashOption.setAutocomplete === "function"
        ) {
            slashOption.setAutocomplete(true);
        }

        applyMinMax(slashOption, option);
        applyChoices(slashOption, option);

        return slashOption;
    }

    for (const option of options) {
        if (option.type === "string") {
            builder.addStringOption((slashOption) => {
                return applyCommonOption(slashOption, option);
            });
        }

        if (option.type === "integer") {
            builder.addIntegerOption((slashOption) => {
                return applyCommonOption(slashOption, option);
            });
        }

        if (option.type === "number") {
            builder.addNumberOption((slashOption) => {
                return applyCommonOption(slashOption, option);
            });
        }

        if (option.type === "boolean") {
            builder.addBooleanOption((slashOption) => {
                return applyCommonOption(slashOption, option);
            });
        }

        if (option.type === "user") {
            builder.addUserOption((slashOption) => {
                return applyCommonOption(slashOption, option);
            });
        }

        if (option.type === "channel") {
            builder.addChannelOption((slashOption) => {
                applyCommonOption(slashOption, option);

                if (
                    Array.isArray(option.channelTypes) &&
                    option.channelTypes.length > 0
                ) {
                    slashOption.addChannelTypes(...option.channelTypes);
                }

                return slashOption;
            });
        }

        if (option.type === "role") {
            builder.addRoleOption((slashOption) => {
                return applyCommonOption(slashOption, option);
            });
        }
    }

    return builder.toJSON();
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

    const commands = commandConfigs.map(buildSlashCommand);

    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
    });

    console.log("Done.");
}

deploy().catch((error) => {
    console.error("Deploy failed:");
    console.error(error);
});
