const { SlashCommandBuilder } = require("discord.js");

const optionBuilders = {
    string: "addStringOption",
    integer: "addIntegerOption",
    number: "addNumberOption",
    boolean: "addBooleanOption",
    user: "addUserOption",
    channel: "addChannelOption",
    role: "addRoleOption",
};

function readMinValue(optionConfig) {
    return optionConfig.minValue ?? optionConfig.min_value;
}

function readMaxValue(optionConfig) {
    return optionConfig.maxValue ?? optionConfig.max_value;
}

function applyChoices(option, optionConfig) {
    if (
        !Array.isArray(optionConfig.choices) ||
        optionConfig.choices.length <= 0
    ) {
        return option;
    }

    option.addChoices(
        ...optionConfig.choices.map((choice) => {
            return {
                name: choice.name,
                value: choice.value,
            };
        }),
    );

    return option;
}

function applyMinMax(option, optionConfig) {
    const minValue = readMinValue(optionConfig);
    const maxValue = readMaxValue(optionConfig);

    if (minValue !== undefined && typeof option.setMinValue === "function") {
        option.setMinValue(minValue);
    }

    if (maxValue !== undefined && typeof option.setMaxValue === "function") {
        option.setMaxValue(maxValue);
    }

    return option;
}

function applyChannelTypes(option, optionConfig) {
    if (
        optionConfig.type === "channel" &&
        Array.isArray(optionConfig.channelTypes) &&
        optionConfig.channelTypes.length > 0 &&
        typeof option.addChannelTypes === "function"
    ) {
        option.addChannelTypes(...optionConfig.channelTypes);
    }

    return option;
}

function applyOption(builder, optionConfig) {
    const method = optionBuilders[optionConfig.type];

    if (!method) {
        throw new Error(`Unknown option type: ${optionConfig.type}`);
    }

    return builder[method]((option) => {
        option
            .setName(optionConfig.name)
            .setDescription(optionConfig.description || "Không có mô tả")
            .setRequired(Boolean(optionConfig.required));

        if (
            optionConfig.autocomplete &&
            typeof option.setAutocomplete === "function"
        ) {
            option.setAutocomplete(true);
        }

        applyMinMax(option, optionConfig);
        applyChoices(option, optionConfig);
        applyChannelTypes(option, optionConfig);

        return option;
    });
}

function buildCommand(commandConfig) {
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

module.exports = {
    buildCommand,
    buildCommands,
};
