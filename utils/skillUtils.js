const skillConfig = require("../config/kynang");

const LEVEL_CAP_BY_TIER = {
    F: 5,
    E: 6,
    D: 7,
    C: 8,
    B: 9,
    A: 10,
    S: 10,
};

const DUPLICATE_SHARDS_BY_TIER = {
    F: 5,
    E: 8,
    D: 12,
    C: 18,
    B: 25,
    A: 40,
    S: 80,
};

const LEVEL_GROWTH_PER_LEVEL = 0.03;

const SCALABLE_SKILL_FIELDS = new Set([
    "damageMultiplier",
    "atkDown",
    "speedDown",
    "defenseDown",
    "poisonPercent",
    "shieldPercent",
    "speedUp",
    "dodgeChance",
    "defenseIgnore",
    "critChanceBonus",
    "atkUp",
    "defenseUp",
    "lifeSteal",
    "executeBonusDamage",
    "stunChance",

    "hpBonus",
    "atkBonus",
    "defenseBonus",
    "speedBonus",
    "counterChance",
    "counterDamageMultiplier",
    "damageReduction",
    "reviveChance",
    "reviveHpPercent",
    "lowHpAtkBonus",
]);

function toSafeLevel(level) {
    const number = Math.floor(Number(level || 1));

    if (!Number.isFinite(number) || number < 1) {
        return 1;
    }

    return number;
}

function getAllSkillDefs() {
    const activeSkills = Array.isArray(skillConfig.activeSkills)
        ? skillConfig.activeSkills
        : [];

    const passiveSkills = Array.isArray(skillConfig.passiveSkills)
        ? skillConfig.passiveSkills
        : [];

    return [...activeSkills, ...passiveSkills];
}

function getSkillDef(skillId) {
    return getAllSkillDefs().find((skill) => skill.id === skillId);
}

function getDuplicateShards(tier) {
    return DUPLICATE_SHARDS_BY_TIER[tier] || DUPLICATE_SHARDS_BY_TIER.F;
}

function getSkillLevelCap(tier) {
    return LEVEL_CAP_BY_TIER[tier] || LEVEL_CAP_BY_TIER.F;
}

function getSkillUpgradeCost(tier, currentLevel) {
    const level = toSafeLevel(currentLevel);
    const cap = getSkillLevelCap(tier);

    if (level >= cap) {
        return null;
    }

    return getDuplicateShards(tier) * level;
}

function getSkillGrowthMultiplier(level) {
    return 1 + (toSafeLevel(level) - 1) * LEVEL_GROWTH_PER_LEVEL;
}

function roundSkillNumber(value) {
    return Math.round(Number(value || 0) * 10000) / 10000;
}

function ensureSkillData(profile) {
    if (!profile.skills) {
        profile.skills = {
            active: [],
            passive: [],
        };
    }

    if (!Array.isArray(profile.skills.active)) {
        profile.skills.active = [];
    }

    if (!Array.isArray(profile.skills.passive)) {
        profile.skills.passive = [];
    }

    return profile.skills;
}

function findOwnedSkill(profile, skillId, type = null) {
    if (!profile) {
        return null;
    }

    const skills = ensureSkillData(profile);

    const lists = type
        ? [type === "passive" ? skills.passive : skills.active]
        : [skills.active, skills.passive];

    for (const list of lists) {
        const owned = list.find((item) => item.id === skillId);

        if (owned) {
            return owned;
        }
    }

    return null;
}

function getOwnedSkillLevel(profile, skillId, type = null) {
    const owned = findOwnedSkill(profile, skillId, type);

    return toSafeLevel(owned?.level || 1);
}

function scaleSkillDef(skill, level = 1) {
    if (!skill) {
        return null;
    }

    const safeLevel = toSafeLevel(level);
    const multiplier = getSkillGrowthMultiplier(safeLevel);

    const scaled = {
        ...skill,
        level: safeLevel,
        powerMultiplier: multiplier,
    };

    for (const field of SCALABLE_SKILL_FIELDS) {
        if (typeof scaled[field] === "number" && scaled[field] > 0) {
            scaled[field] = roundSkillNumber(scaled[field] * multiplier);
        }
    }

    return scaled;
}

function getScaledSkillDef(skillId, profile) {
    const skill = getSkillDef(skillId);

    if (!skill) {
        return null;
    }

    const level = getOwnedSkillLevel(profile, skillId, skill.type);

    return scaleSkillDef(skill, level);
}

module.exports = {
    LEVEL_CAP_BY_TIER,
    DUPLICATE_SHARDS_BY_TIER,
    LEVEL_GROWTH_PER_LEVEL,

    getAllSkillDefs,
    getSkillDef,
    getDuplicateShards,
    getSkillLevelCap,
    getSkillUpgradeCost,
    getSkillGrowthMultiplier,

    ensureSkillData,
    findOwnedSkill,
    getOwnedSkillLevel,
    scaleSkillDef,
    getScaledSkillDef,
};