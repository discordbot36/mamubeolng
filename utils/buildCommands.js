const { SlashCommandBuilder } = require("discord.js");

const optionBuilders = {
    string: "addStringOption",
    integer: "addIntegerOption",
    user: "addUserOption",
    boolean: "addBooleanOption",
    number: "addNumberOption",
    channel: "addChannelOption",
    role: "addRoleOption",
};

function readMinValue(optionConfig) {
    if (optionConfig.minValue !== undefined) {
        return optionConfig.minValue;
    }

    return optionConfig.min_value;
}

function readMaxValue(optionConfig) {
    if (optionConfig.maxValue !== undefined) {
        return optionConfig.maxValue;
    }

    return optionConfig.max_value;
}

function applyOption(builder, optionConfig) {
    const method = optionBuilders[optionConfig.type];

    if (!method) {
        throw new Error(`Unknown option type: ${optionConfig.type}`);
    }

    return builder[method]((option) => {
        option
            .setName(optionConfig.name)
            .setDescription(optionConfig.description)
            .setRequired(Boolean(optionConfig.required));

        if (optionConfig.autocomplete && option.setAutocomplete) {
            option.setAutocomplete(true);
        }

        const minValue = readMinValue(optionConfig);
        const maxValue = readMaxValue(optionConfig);

        if (minValue !== undefined && option.setMinValue) {
            option.setMinValue(minValue);
        }

        if (maxValue !== undefined && option.setMaxValue) {
            option.setMaxValue(maxValue);
        }

        if (Array.isArray(optionConfig.choices) && optionConfig.choices.length > 0) {
            option.addChoices(...optionConfig.choices);
        }

        return option;
    });
}

function buildCommand(commandConfig) {
    const builder = new SlashCommandBuilder()
        .setName(commandConfig.name)
        .setDescription(commandConfig.description);

    if (commandConfig.defaultMemberPermissions !== undefined) {
        builder.setDefaultMemberPermissions(commandConfig.defaultMemberPermissions);
    }

    for (const option of commandConfig.options || []) {
        applyOption(builder, option);
    }

    return builder.toJSON();
}

function buildCommands(commandConfigs) {
    return commandConfigs
        .filter((command) => command.enabled !== false)
        .map(buildCommand);
}

module.exports = { buildCommands };