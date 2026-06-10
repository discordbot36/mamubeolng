const path = require("path");

module.exports = {
    dataFile: path.join(__dirname, "..", "data.json"),

    defaultUser: {
        wins: 0,
        losses: 0,
        dailyStreak: 0,
        lastDaily: 0,
        inventory: {},
        inventoryItems: [],
        weapons: [],
        equippedWeaponUid: null,
    },
};
