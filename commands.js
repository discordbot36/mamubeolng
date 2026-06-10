const commandConfigs = require("./config/commands");
const { buildCommands } = require("./utils/buildCommands");

module.exports = buildCommands(commandConfigs);
