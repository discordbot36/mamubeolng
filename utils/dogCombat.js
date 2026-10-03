const database = require("../database");

function withDogCombatBonus(profile, userId) {
    const dog = database.getInventory(userId).specialItems.find(item => item.type === "dog" && item.equippedAsPet);
    if (!dog) return profile;
    const weight = Math.min(100, Math.max(0, Number(dog.weightKg || 0)));
    const level = Math.max(1, Number(dog.level || 1));
    const equipment = Math.max(0, Number(dog.equipmentLevel || 0));
    const evolution = Math.max(0, Number(dog.evolution || 0));
    const bond = Math.max(0, Number(dog.bond || 0));
    const dogPower = Math.floor(weight * 10 + level * 25 + equipment * 120 + evolution * 250 + bond);
    return { ...profile, companionAttack: Math.floor(dogPower * 0.35), companionName: dog.name };
}

module.exports = { withDogCombatBonus };
