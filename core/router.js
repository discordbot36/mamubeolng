const commandConfigs = require("../config/commands");
const adminConfig = require("../config/admin");
const economy = require("../handlers/economy");
const race = require("../race");
const work = require("../work");
const noitu = require("../noitu");
const dothach = require("../dothach");
const baucua = require("../baucua");
const taixiu = require("../taixiu");
const admin = require("../admin");
const tutien = require("../tutien");
const kynang = require("../kynang");
const tower = require("../tower");
const worldboss = require("../worldboss");
const leaderboard = require("../leaderboard");
const dungeon = require("../dungeon");
const blackjack = require("../blackjack");
const pigRoad = require("../pigRoad");
const flip = require("../flip");
const vecao = require("../vecao");
const quest = require("../quest");
const bicanh = require("../bicanh");
const sanyeuthu = require("../sanyeuthu");
const dothachTournament = require("../dothachTournament");
const phapbao = require("../phapbao");
const raidserver = require("../raidserver");
const duyen = require("../duyen");
const modules = {
    economy,
    race,
    work,
    noitu,
    dothach,
    dothachTournament,
    baucua,
    taixiu,
    admin,
    tutien,
    duyen,
    tower,
    kynang,
    leaderboard,
    worldboss,
    blackjack,
    dungeon,
    pigRoad,
    flip,
    vecao,
    bicanh,
    sanyeuthu,
    phapbao,
    quest,
    raidserver,
};

function resolve(path) {
    if (!path) {
        return null;
    }

    const [moduleName, methodName] = path.split(".");
    const module = modules[moduleName];

    if (!module || typeof module[methodName] !== "function") {
        throw new Error(`Handler không tồn tại: ${path}`);
    }

    return module[methodName].bind(module);
}

function findCommand(commandName) {
    return commandConfigs.find((command) => {
        return command.enabled !== false && command.name === commandName;
    });
}

function isAdminAllowed(userId) {
    const allowedUserIds = Array.isArray(adminConfig.allowedUserIds)
        ? adminConfig.allowedUserIds.map(String)
        : [];

    return allowedUserIds.includes(String(userId));
}

function isAdminCommand(command) {
    return command?.adminOnly || command?.handler?.startsWith("admin.");
}

async function handleCommand(interaction) {
    const command = findCommand(interaction.commandName);

    if (isAdminCommand(command) && !isAdminAllowed(interaction.user.id)) {
        return interaction.reply({
            content: adminConfig.messages.noPermission,
            ephemeral: true,
        });
    }

    admin.recordCommandActivity(interaction);

    const handler = resolve(command?.handler);

    return handler ? handler(interaction) : undefined;
}

async function handleAutocomplete(interaction) {
    const command = findCommand(interaction.commandName);
    const handler = resolve(command?.autocomplete);

    return handler ? handler(interaction) : undefined;
}
function isIgnoredInteractionError(error) {
    return error?.code === 10062 || error?.code === 40060;
}

async function runInteractionHandler(handler, interaction) {
    try {
        return await handler(interaction);
    } catch (error) {
        if (isIgnoredInteractionError(error)) {
            return undefined;
        }

        throw error;
    }
}
async function handleButton(interaction) {
    const modulesWithButtons = [
        admin,
        economy,
        race,
        work,
        dothachTournament,
        dothach,
        baucua,
        taixiu,
        tutien,
        tower,
        kynang,
        worldboss,
        leaderboard,
        dungeon,
        blackjack,
        pigRoad,
        quest,
        bicanh,
        phapbao,
        duyen,
        sanyeuthu,
        flip,
        vecao,
        raidserver,
    ];

    const handlers = modulesWithButtons
        .filter((module) => typeof module.handleButton === "function")
        .map((module) => module.handleButton.bind(module));

    for (const handler of handlers) {
        const result = await runInteractionHandler(handler, interaction);

        if (result !== undefined) {
            return result;
        }
    }

    return undefined;
}
async function handleModal(interaction) {
    const handlers = [
        race.handleModal.bind(race),
        taixiu.handleModal.bind(taixiu),
        baucua.handleModal.bind(baucua),
    ];

    for (const handler of handlers) {
        const result = await runInteractionHandler(handler, interaction);

        if (result !== undefined) {
            return result;
        }
    }

    return undefined;
}
async function handleMessage(message) {
    await admin.handleMessage(message);

    return noitu.handleMessage(message);
}

function startAutoActiveRain(client) {
    return admin.startAutoActiveRain(client);
}

module.exports = {
    handleCommand,
    handleAutocomplete,
    handleButton,
    handleModal,
    handleMessage,
    startAutoActiveRain,
};
