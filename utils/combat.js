const tuTienConfig = require("../config/tutien");
const skillConfig = require("../config/kynang");

const activeSkills = Array.isArray(skillConfig.activeSkills)
    ? skillConfig.activeSkills
    : [];

const passiveSkills = Array.isArray(skillConfig.passiveSkills)
    ? skillConfig.passiveSkills
    : [];

const allSkills = [...activeSkills, ...passiveSkills];

const MAX_REALM_FLOOR = 10;

const DEFAULT_CRIT_DAMAGE_MULTIPLIER = 1.5;

function clamp(value, min, max) {
    const safeValue = Number(value);

    if (!Number.isFinite(safeValue)) {
        return min;
    }

    return Math.max(min, Math.min(max, safeValue));
}

function toSafeNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number) ? number : fallback;
}

function toSafeInteger(value, fallback = 0) {
    return Math.floor(toSafeNumber(value, fallback));
}

function roll(chance) {
    return Math.random() < clamp(chance, 0, 1);
}

function randomBetween(min, max) {
    const safeMin = toSafeNumber(min, 0);
    const safeMax = toSafeNumber(max, safeMin);

    if (safeMax <= safeMin) {
        return safeMin;
    }

    return Math.random() * (safeMax - safeMin) + safeMin;
}

function getRootById(rootId) {
    const roots = Array.isArray(tuTienConfig.spiritualRoots)
        ? tuTienConfig.spiritualRoots
        : [];

    return roots.find((root) => {
        return root.id === rootId;
    });
}

function getSkillDef(skillId) {
    return allSkills.find((skill) => {
        return skill.id === skillId;
    });
}

function ensureEquippedSkillData(profile) {
    if (!profile.equippedSkills) {
        profile.equippedSkills = {
            active: [],
            passive: [],
        };
    }

    if (!Array.isArray(profile.equippedSkills.active)) {
        profile.equippedSkills.active = [];
    }

    if (!Array.isArray(profile.equippedSkills.passive)) {
        profile.equippedSkills.passive = [];
    }

    return profile.equippedSkills;
}

function getEquippedPassiveSkillBonuses(profile) {
    const equipped = ensureEquippedSkillData(profile);

    const bonus = {
        atkBonus: 0,
        defenseBonus: 0,
        hpBonus: 0,
        speedBonus: 0,

        critChanceBonus: 0,
        dodgeChance: 0,
        counterChance: 0,
        counterDamageMultiplier: 0,
        damageReduction: 0,

        reviveChance: 0,
        reviveHpPercent: 0,

        lowHpAtkBonus: 0,
        triggerHpBelow: 0,
    };

    for (const skillId of equipped.passive) {
        const skill = getSkillDef(skillId);

        if (!skill || skill.type !== "passive") {
            continue;
        }

        bonus.atkBonus += Number(skill.atkBonus || 0);
        bonus.defenseBonus += Number(skill.defenseBonus || 0);
        bonus.hpBonus += Number(skill.hpBonus || 0);
        bonus.speedBonus += Number(skill.speedBonus || 0);

        bonus.critChanceBonus += Number(skill.critChanceBonus || 0);

        bonus.dodgeChance += Number(skill.dodgeChance || 0);

        bonus.counterChance += Number(skill.counterChance || 0);

        bonus.damageReduction += Number(skill.damageReduction || 0);

        bonus.lowHpAtkBonus += Number(skill.lowHpAtkBonus || 0);

        bonus.counterDamageMultiplier = Math.max(
            bonus.counterDamageMultiplier,
            Number(skill.counterDamageMultiplier || 0),
        );

        bonus.reviveChance = Math.max(
            bonus.reviveChance,
            Number(skill.reviveChance || 0),
        );

        bonus.reviveHpPercent = Math.max(
            bonus.reviveHpPercent,
            Number(skill.reviveHpPercent || 0),
        );

        bonus.triggerHpBelow = Math.max(
            bonus.triggerHpBelow,
            Number(skill.triggerHpBelow || 0),
        );
    }

    bonus.critChanceBonus = Math.min(0.45, bonus.critChanceBonus);

    bonus.dodgeChance = Math.min(0.45, bonus.dodgeChance);

    bonus.counterChance = Math.min(0.4, bonus.counterChance);

    bonus.damageReduction = Math.min(0.35, bonus.damageReduction);

    return bonus;
}

function getEquippedActiveSkills(profile) {
    const equipped = ensureEquippedSkillData(profile);

    return equipped.active
        .map((skillId) => getSkillDef(skillId))
        .filter((skill) => {
            return skill && skill.type === "active";
        });
}

function calculateActiveSkillPowerBonus(profile) {
    const skills = getEquippedActiveSkills(profile);

    const score = skills.reduce((total, skill) => {
        const hits = Math.max(1, Number(skill.hits || 1));

        const multiplier = Number(skill.damageMultiplier || 0);

        const damageScore = multiplier > 1 ? (multiplier - 1) * 0.08 : 0;

        const multiHitScore = hits > 1 ? (hits - 1) * multiplier * 0.025 : 0;

        const utilityScore =
            Number(skill.defenseIgnore || 0) * 0.12 +
            Number(skill.stunChance || 0) * 0.12 +
            Number(skill.defenseDown || 0) * 0.08 +
            Number(skill.atkDown || 0) * 0.08 +
            Number(skill.speedDown || 0) * 0.03 +
            Number(skill.poisonPercent || 0) *
                Math.max(1, Number(skill.duration || 1)) *
                0.06 +
            Number(skill.shieldPercent || 0) * 0.08 +
            Number(skill.atkUp || 0) * 0.08 +
            Number(skill.defenseUp || 0) * 0.06 +
            Number(skill.dodgeChance || 0) * 0.06 +
            Number(skill.lifeSteal || 0) * 0.07 +
            Number(skill.executeBonusDamage || 0) * 0.05 +
            Number(skill.critChanceBonus || 0) * 0.06;

        return total + damageScore + multiHitScore + utilityScore;
    }, 0);

    return Math.min(0.35, Math.max(0, score));
}

function calculateRealmPower(realmIndex) {
    const safeRealmIndex = Math.max(0, Number(realmIndex || 0));

    return Math.floor(1000 * Math.pow(safeRealmIndex + 1, 2.45));
}

function calculateFloorPower(realmPower, floor) {
    const safeFloor = Math.max(
        1,
        Math.min(MAX_REALM_FLOOR, Number(floor || 1)),
    );

    return Math.floor(realmPower * ((safeFloor - 1) * 0.04));
}

function calculateExpPower(profile, realmPower, floorPower) {
    const realmIndex = Number(profile.realmIndex || 0);

    const realms = Array.isArray(tuTienConfig.realms)
        ? tuTienConfig.realms
        : [];

    const realm = realms[realmIndex] || realms[0] || {};

    const maxExp = Math.max(1, Number(realm.maxExp || 1));

    const expRate = Math.max(0, Math.min(1, Number(profile.exp || 0) / maxExp));

    const expPowerCap = Math.floor((realmPower + floorPower) * 0.1);

    return Math.floor(expPowerCap * expRate);
}

function calculateBaseCombatPower(profile) {
    const root = getRootById(profile.rootId);

    const roots = Array.isArray(tuTienConfig.spiritualRoots)
        ? tuTienConfig.spiritualRoots
        : [];

    const realmPower = calculateRealmPower(profile.realmIndex);

    const floorPower = calculateFloorPower(realmPower, profile.floor);

    const expPower = calculateExpPower(profile, realmPower, floorPower);

    const basePower = realmPower + floorPower + expPower;

    if (!root) {
        return basePower;
    }

    const rootIndex = roots.findIndex((item) => {
        return item.id === root.id;
    });

    const rootRank = rootIndex >= 0 ? rootIndex + 1 : 1;

    const rootMultiplier =
        1 +
        Number(root.expBonus || 0) * 0.22 +
        Number(root.breakthroughBonus || 0) * 0.55;

    return Math.floor((basePower + rootRank * 180) * rootMultiplier);
}

function calculateCombatStats(profile) {
    const baseCombatPower = calculateBaseCombatPower(profile);

    const root = getRootById(profile.rootId);

    const roots = Array.isArray(tuTienConfig.spiritualRoots)
        ? tuTienConfig.spiritualRoots
        : [];

    const realmIndex = Number(profile.realmIndex || 0);

    const floor = Number(profile.floor || 1);

    const rootIndex = root
        ? roots.findIndex((item) => {
              return item.id === root.id;
          })
        : -1;

    const rootRank = rootIndex >= 0 ? rootIndex + 1 : 1;

    const rootAtkBonus = root ? Number(root.expBonus || 0) : 0;

    const rootDefBonus = root ? Number(root.breakthroughBonus || 0) : 0;

    const baseAtk = Math.floor(baseCombatPower * (0.45 + rootAtkBonus * 0.18));

    const baseDefense = Math.floor(
        baseCombatPower * (0.25 + rootDefBonus * 0.22),
    );

    const baseHp = Math.floor(baseCombatPower * (5 + rootRank * 0.02));

    const baseSpeed = Math.floor(
        50 + realmIndex * 20 + floor * 5 + rootRank * 1.5,
    );

    const passiveBonus = getEquippedPassiveSkillBonuses(profile);

    const activePowerBonus = calculateActiveSkillPowerBonus(profile);

    const atk = Math.floor(baseAtk * (1 + passiveBonus.atkBonus));

    const defense = Math.floor(baseDefense * (1 + passiveBonus.defenseBonus));

    const hp = Math.floor(baseHp * (1 + passiveBonus.hpBonus));

    const speed = Math.floor(baseSpeed * (1 + passiveBonus.speedBonus));

    const critChance = Math.min(0.65, 0.05 + passiveBonus.critChanceBonus);

    const dodgeChance = Math.min(0.5, passiveBonus.dodgeChance);

    const counterChance = Math.min(0.45, passiveBonus.counterChance);

    const damageReduction = Math.min(0.35, passiveBonus.damageReduction);

    const rawCombatPower = atk * 1.2 + defense + hp * 0.18 + speed * 8;

    const combatPower = Math.floor(
        rawCombatPower * (1 + activePowerBonus) +
            atk * critChance * 0.45 +
            hp * dodgeChance * 0.035 +
            hp * damageReduction * 0.045 +
            atk * counterChance * 0.25,
    );

    return {
        combatPower,

        atk: Math.max(1, atk),
        defense: Math.max(0, defense),
        hp: Math.max(1, hp),
        speed: Math.max(1, speed),

        baseAtk,
        baseDefense,
        baseHp,
        baseSpeed,

        passiveBonus,
        activePowerBonus,

        critChance,
        dodgeChance,
        counterChance,

        counterDamageMultiplier: passiveBonus.counterDamageMultiplier,

        damageReduction,

        reviveChance: passiveBonus.reviveChance,

        reviveHpPercent: passiveBonus.reviveHpPercent,

        lowHpAtkBonus: passiveBonus.lowHpAtkBonus,

        triggerHpBelow: passiveBonus.triggerHpBelow,

        activeSkills: getEquippedActiveSkills(profile),
    };
}

function calculateCombatPower(profile) {
    return calculateCombatStats(profile).combatPower;
}

function createCombatant(profile, options = {}) {
    const stats = calculateCombatStats(profile || {});

    const userId = options.userId !== undefined ? String(options.userId) : null;

    const name = options.name || options.displayName || "Người chơi";

    return {
        id: userId,
        name,

        profile,

        stats: {
            combatPower: Math.max(1, toSafeInteger(stats.combatPower, 1)),

            atk: Math.max(1, toSafeInteger(stats.atk, 1)),

            defense: Math.max(0, toSafeInteger(stats.defense, 0)),

            maxHp: Math.max(1, toSafeInteger(stats.hp, 1)),

            speed: Math.max(1, toSafeInteger(stats.speed, 1)),

            critChance: clamp(stats.critChance, 0, 0.65),

            dodgeChance: clamp(stats.dodgeChance, 0, 0.5),

            counterChance: clamp(stats.counterChance, 0, 0.45),

            counterDamageMultiplier: Math.max(
                0,
                toSafeNumber(stats.counterDamageMultiplier, 0),
            ),

            damageReduction: clamp(stats.damageReduction, 0, 0.35),

            reviveChance: clamp(stats.reviveChance, 0, 1),

            reviveHpPercent: clamp(stats.reviveHpPercent, 0, 1),

            lowHpAtkBonus: Math.max(0, toSafeNumber(stats.lowHpAtkBonus, 0)),

            triggerHpBelow: clamp(stats.triggerHpBelow, 0, 1),
        },

        hp: Math.max(1, toSafeInteger(stats.hp, 1)),

        shield: 0,

        activeSkills: Array.isArray(stats.activeSkills)
            ? stats.activeSkills.map((skill) => ({
                  ...skill,
              }))
            : [],

        cooldowns: {},

        buffs: [],
        debuffs: [],

        status: {
            stunned: false,
            revived: false,
            reviveAttempted: false,
            defending: false,
        },

        statistics: {
            turns: 0,
            basicAttacks: 0,
            skillsUsed: 0,

            damageDealt: 0,
            damageTaken: 0,

            healingDone: 0,
            shieldCreated: 0,

            criticalHits: 0,
            dodges: 0,
            counters: 0,
        },
    };
}

function createEmptyCombatStatistics(source = {}) {
    return {
        turns: Math.max(0, toSafeInteger(source.turns, 0)),

        basicAttacks: Math.max(0, toSafeInteger(source.basicAttacks, 0)),

        skillsUsed: Math.max(0, toSafeInteger(source.skillsUsed, 0)),

        damageDealt: Math.max(0, toSafeInteger(source.damageDealt, 0)),

        damageTaken: Math.max(0, toSafeInteger(source.damageTaken, 0)),

        healingDone: Math.max(0, toSafeInteger(source.healingDone, 0)),

        shieldCreated: Math.max(0, toSafeInteger(source.shieldCreated, 0)),

        criticalHits: Math.max(0, toSafeInteger(source.criticalHits, 0)),

        dodges: Math.max(0, toSafeInteger(source.dodges, 0)),

        counters: Math.max(0, toSafeInteger(source.counters, 0)),
    };
}

function normalizeNpcSkills(skills) {
    if (!Array.isArray(skills)) {
        return [];
    }

    return skills
        .map((skill, index) => {
            if (!skill) {
                return null;
            }

            if (typeof skill === "string") {
                const configuredSkill = getSkillDef(skill);

                return configuredSkill
                    ? {
                          ...configuredSkill,
                      }
                    : null;
            }

            if (typeof skill !== "object") {
                return null;
            }

            return {
                ...skill,

                id: skill.id || `npc_skill_${index + 1}`,

                name: skill.name || `Kỹ năng ${index + 1}`,

                type: "active",
            };
        })
        .filter(Boolean);
}

function createCombatantFromStats(source = {}, options = {}) {
    const maxHp = Math.max(1, toSafeInteger(source.maxHp ?? source.hp, 1));

    const currentHp = Math.floor(
        clamp(source.currentHp ?? source.hp ?? maxHp, 0, maxHp),
    );
    const atk = Math.max(1, toSafeInteger(source.atk ?? source.attack, 1));

    const defense = Math.max(0, toSafeInteger(source.defense ?? source.def, 0));

    const speed = Math.max(1, toSafeInteger(source.speed, 1));

    const combatPower = Math.max(
        1,
        toSafeInteger(
            source.combatPower,
            Math.floor(atk * 1.2 + defense + maxHp * 0.18 + speed * 8),
        ),
    );

    const id =
        source.id !== undefined
            ? String(source.id)
            : options.id !== undefined
              ? String(options.id)
              : null;

    const name = source.name || options.name || "Quái vật";

    return {
        id,
        name,

        type: source.type || options.type || "npc",

        profile: null,

        metadata: {
            ...(source.metadata || {}),
            ...(options.metadata || {}),
        },

        stats: {
            combatPower,

            atk,
            defense,
            maxHp,
            speed,

            critChance: clamp(source.critChance, 0, 0.65),

            dodgeChance: clamp(source.dodgeChance, 0, 0.5),

            counterChance: clamp(source.counterChance, 0, 0.45),

            counterDamageMultiplier: Math.max(
                0,
                toSafeNumber(source.counterDamageMultiplier, 0),
            ),

            damageReduction: clamp(source.damageReduction, 0, 0.8),

            reviveChance: clamp(source.reviveChance, 0, 1),

            reviveHpPercent: clamp(source.reviveHpPercent, 0, 1),

            lowHpAtkBonus: Math.max(0, toSafeNumber(source.lowHpAtkBonus, 0)),

            triggerHpBelow: clamp(source.triggerHpBelow, 0, 1),
        },

        hp: currentHp,

        shield: Math.max(0, toSafeInteger(source.shield, 0)),

        activeSkills: normalizeNpcSkills(source.activeSkills ?? source.skills),

        cooldowns:
            source.cooldowns && typeof source.cooldowns === "object"
                ? {
                      ...source.cooldowns,
                  }
                : {},

        buffs: Array.isArray(source.buffs)
            ? source.buffs.map((effect) => ({
                  ...effect,

                  metadata: {
                      ...(effect.metadata || {}),
                  },
              }))
            : [],

        debuffs: Array.isArray(source.debuffs)
            ? source.debuffs.map((effect) => ({
                  ...effect,

                  metadata: {
                      ...(effect.metadata || {}),
                  },
              }))
            : [],

        status: {
            stunned: source.status?.stunned === true,

            revived: source.status?.revived === true,

            reviveAttempted: source.status?.reviveAttempted === true,

            defending: source.status?.defending === true,
        },

        statistics: createEmptyCombatStatistics(source.statistics),
    };
}

function syncCombatantToSource(combatant, target = {}) {
    if (!combatant) {
        return target;
    }

    target.currentHp = Math.max(0, toSafeInteger(combatant.hp, 0));

    target.hp = target.currentHp;

    target.maxHp = Math.max(1, toSafeInteger(combatant.stats?.maxHp, 1));

    target.shield = Math.max(0, toSafeInteger(combatant.shield, 0));

    target.cooldowns = {
        ...(combatant.cooldowns || {}),
    };

    target.buffs = Array.isArray(combatant.buffs)
        ? combatant.buffs.map((effect) => ({
              ...effect,

              metadata: {
                  ...(effect.metadata || {}),
              },
          }))
        : [];

    target.debuffs = Array.isArray(combatant.debuffs)
        ? combatant.debuffs.map((effect) => ({
              ...effect,

              metadata: {
                  ...(effect.metadata || {}),
              },
          }))
        : [];

    target.status = {
        ...(combatant.status || {}),
    };

    target.statistics = {
        ...(combatant.statistics || {}),
    };

    return target;
}

function isCombatantAlive(combatant) {
    return Boolean(combatant && toSafeNumber(combatant.hp, 0) > 0);
}

function getHpPercent(combatant) {
    if (!combatant?.stats) {
        return 0;
    }

    const maxHp = Math.max(1, toSafeNumber(combatant.stats.maxHp, 1));

    return clamp(toSafeNumber(combatant.hp, 0) / maxHp, 0, 1);
}

function getEffectiveAttack(combatant) {
    if (!combatant?.stats) {
        return 1;
    }

    let attack = Math.max(1, toSafeNumber(combatant.stats.atk, 1));

    const hpPercent = getHpPercent(combatant);

    const triggerHpBelow = clamp(combatant.stats.triggerHpBelow, 0, 1);

    const lowHpAtkBonus = Math.max(
        0,
        toSafeNumber(combatant.stats.lowHpAtkBonus, 0),
    );

    if (triggerHpBelow > 0 && hpPercent <= triggerHpBelow) {
        attack *= 1 + lowHpAtkBonus;
    }

    const modifiers = getCombatModifiers(combatant);

    attack *= modifiers.atkMultiplier;

    return Math.max(1, Math.floor(attack));
}

function calculateDamage(atk, defense, multiplier = 1) {
    const defenseMultiplier = 100 / (100 + Math.max(0, defense));

    const randomMultiplier = randomBetween(0.92, 1.08);

    return Math.max(
        1,
        Math.floor(
            Math.max(1, atk) *
                Math.max(0.1, multiplier) *
                defenseMultiplier *
                randomMultiplier,
        ),
    );
}

function calculateDetailedDamage({
    attacker,
    defender,

    multiplier = 1,
    defenseIgnore = 0,

    critChanceBonus = 0,
    canCrit = true,

    randomMin = 0.92,
    randomMax = 1.08,
} = {}) {
    if (!attacker?.stats) {
        throw new Error("calculateDetailedDamage: attacker không hợp lệ.");
    }

    if (!defender?.stats) {
        throw new Error("calculateDetailedDamage: defender không hợp lệ.");
    }

    const attack = getEffectiveAttack(attacker);

    const safeMultiplier = Math.max(0.1, toSafeNumber(multiplier, 1));

    const safeDefenseIgnore = clamp(defenseIgnore, 0, 0.9);

    const originalDefense = getEffectiveDefense(defender);

    const effectiveDefense = Math.max(
        0,
        originalDefense * (1 - safeDefenseIgnore),
    );

    const defenseMultiplier = 100 / (100 + effectiveDefense);

    const randomMultiplier = randomBetween(randomMin, randomMax);

    const critChance = clamp(
        toSafeNumber(attacker.stats.critChance, 0) +
            toSafeNumber(critChanceBonus, 0),
        0,
        0.85,
    );

    const isCritical = canCrit && roll(critChance);

    const criticalMultiplier = isCritical ? DEFAULT_CRIT_DAMAGE_MULTIPLIER : 1;

    const rawDamage =
        attack *
        safeMultiplier *
        defenseMultiplier *
        randomMultiplier *
        criticalMultiplier;

    const damageReduction = clamp(defender.stats.damageReduction, 0, 0.8);

    const finalDamage = Math.max(
        1,
        Math.floor(rawDamage * (1 - damageReduction)),
    );

    return {
        damage: finalDamage,

        isCritical,

        attack,
        originalDefense,
        effectiveDefense,

        defenseIgnore: safeDefenseIgnore,

        damageReduction,

        multiplier: safeMultiplier,

        criticalMultiplier,

        randomMultiplier,
    };
}

function addShield(combatant, amount, options = {}) {
    if (!combatant?.stats) {
        return {
            added: 0,
            totalShield: 0,
            shieldCap: 0,
        };
    }

    const shieldAmount = Math.max(0, toSafeInteger(amount, 0));

    const maxHp = Math.max(1, toSafeInteger(combatant.stats.maxHp, 1));

    const shieldCapPercent = clamp(
        options.capPercent ?? combatant.metadata?.shieldCapPercent ?? 0.5,
        0,
        3,
    );

    const shieldCap = Math.max(0, Math.floor(maxHp * shieldCapPercent));

    const currentShield = Math.max(0, toSafeInteger(combatant.shield, 0));

    const finalShield = Math.min(shieldCap, currentShield + shieldAmount);

    const actualAdded = Math.max(0, finalShield - currentShield);

    combatant.shield = finalShield;

    if (combatant.statistics) {
        combatant.statistics.shieldCreated =
            toSafeInteger(combatant.statistics.shieldCreated, 0) + actualAdded;
    }

    return {
        added: actualAdded,
        totalShield: finalShield,
        shieldCap,
    };
}

function healCombatant(combatant, amount, options = {}) {
    if (!combatant?.stats) {
        return {
            healed: 0,
            hp: 0,
            maxHp: 0,
        };
    }

    if (!isCombatantAlive(combatant)) {
        return {
            healed: 0,
            hp: combatant.hp,
            maxHp: combatant.stats.maxHp,
        };
    }

    const maxHp = Math.max(1, toSafeInteger(combatant.stats.maxHp, 1));

    const currentHp = clamp(combatant.hp, 0, maxHp);

    let healAmount = Math.max(0, toSafeInteger(amount, 0));

    if (options.percent !== undefined && options.percent !== null) {
        const percent = clamp(options.percent, 0, 1);

        healAmount += Math.floor(maxHp * percent);
    }

    const finalHp = Math.min(maxHp, currentHp + healAmount);

    const actualHealed = finalHp - currentHp;

    combatant.hp = finalHp;

    if (combatant.statistics) {
        combatant.statistics.healingDone =
            toSafeInteger(combatant.statistics.healingDone, 0) + actualHealed;
    }

    return {
        healed: actualHealed,
        hp: combatant.hp,
        maxHp,
    };
}

function tryReviveCombatant(combatant) {
    if (!combatant?.stats) {
        return {
            revived: false,
            hp: 0,
        };
    }

    if (isCombatantAlive(combatant)) {
        return {
            revived: false,
            hp: combatant.hp,
        };
    }

    if (combatant.status?.revived || combatant.status?.reviveAttempted) {
        return {
            revived: false,
            hp: combatant.hp,
        };
    }

    combatant.status = {
        ...(combatant.status || {}),
        reviveAttempted: true,
    };

    const reviveChance = clamp(combatant.stats.reviveChance, 0, 1);

    if (reviveChance <= 0 || !roll(reviveChance)) {
        return {
            revived: false,
            hp: combatant.hp,
        };
    }

    const maxHp = Math.max(1, toSafeInteger(combatant.stats.maxHp, 1));

    const reviveHpPercent = clamp(combatant.stats.reviveHpPercent, 0.01, 1);

    combatant.hp = Math.max(1, Math.floor(maxHp * reviveHpPercent));

    combatant.status = {
        ...(combatant.status || {}),
        revived: true,
        stunned: false,
    };

    return {
        revived: true,
        hp: combatant.hp,
        maxHp,
        reviveHpPercent,
    };
}

function applyDamage(combatant, amount, options = {}) {
    if (!combatant?.stats) {
        return {
            damage: 0,
            absorbedByShield: 0,
            hpDamage: 0,
            remainingHp: 0,
            remainingShield: 0,
            defeated: false,
            revived: false,
        };
    }

    const incomingDamage = Math.max(0, toSafeInteger(amount, 0));

    const ignoreShield = options.ignoreShield === true;

    let remainingDamage = incomingDamage;

    let absorbedByShield = 0;

    combatant.shield = Math.max(0, toSafeInteger(combatant.shield, 0));

    if (!ignoreShield && combatant.shield > 0 && remainingDamage > 0) {
        absorbedByShield = Math.min(combatant.shield, remainingDamage);

        combatant.shield -= absorbedByShield;

        remainingDamage -= absorbedByShield;
    }

    const currentHp = Math.max(0, toSafeInteger(combatant.hp, 0));

    const hpDamage = Math.min(currentHp, remainingDamage);

    combatant.hp = Math.max(0, currentHp - hpDamage);

    if (combatant.statistics) {
        combatant.statistics.damageTaken =
            toSafeInteger(combatant.statistics.damageTaken, 0) + hpDamage;
    }

    let revived = false;

    if (combatant.hp <= 0 && options.allowRevive !== false) {
        const reviveResult = tryReviveCombatant(combatant);

        revived = reviveResult.revived;
    }

    return {
        damage: incomingDamage,
        absorbedByShield,
        hpDamage,

        remainingHp: combatant.hp,
        remainingShield: combatant.shield,

        defeated: combatant.hp <= 0,

        revived,
    };
}

function performAttack({
    attacker,
    defender,

    multiplier = 1,
    defenseIgnore = 0,
    critChanceBonus = 0,

    canCrit = true,
    canDodge = true,
    allowRevive = true,

    countTurn = true,
    countBasicAttack = true,

    randomMin = 0.92,
    randomMax = 1.08,
} = {}) {
    if (!isCombatantAlive(attacker)) {
        return {
            success: false,
            reason: "attacker_defeated",
            damage: 0,
        };
    }

    if (!isCombatantAlive(defender)) {
        return {
            success: false,
            reason: "defender_defeated",
            damage: 0,
        };
    }

    if (countTurn) {
        attacker.statistics.turns =
            toSafeInteger(attacker.statistics.turns, 0) + 1;
    }

    const defenderModifiers = getCombatModifiers(defender);

    const dodgeChance = clamp(
        toSafeNumber(defender.stats.dodgeChance, 0) +
            defenderModifiers.dodgeChanceBonus,
        0,
        0.75,
    );
    if (canDodge && roll(dodgeChance)) {
        defender.statistics.dodges =
            toSafeInteger(defender.statistics.dodges, 0) + 1;

        return {
            success: true,
            dodged: true,
            damage: 0,

            defenderHp: defender.hp,
            defenderShield: defender.shield,
        };
    }

    const damageResult = calculateDetailedDamage({
        attacker,
        defender,

        multiplier,
        defenseIgnore,
        critChanceBonus,

        canCrit,

        randomMin,
        randomMax,
    });

    const applyResult = applyDamage(defender, damageResult.damage, {
        allowRevive,
    });

    attacker.statistics.damageDealt =
        toSafeInteger(attacker.statistics.damageDealt, 0) +
        applyResult.hpDamage;

    if (countBasicAttack) {
        attacker.statistics.basicAttacks =
            toSafeInteger(attacker.statistics.basicAttacks, 0) + 1;
    }

    if (damageResult.isCritical) {
        attacker.statistics.criticalHits =
            toSafeInteger(attacker.statistics.criticalHits, 0) + 1;
    }

    return {
        success: true,
        dodged: false,

        ...damageResult,
        ...applyResult,

        defenderHp: defender.hp,
        defenderShield: defender.shield,
    };
}

function tryCounterAttack({ defender, attacker, allowRevive = true } = {}) {
    if (!isCombatantAlive(defender) || !isCombatantAlive(attacker)) {
        return {
            triggered: false,
            damage: 0,
        };
    }

    const counterChance = clamp(defender.stats.counterChance, 0, 0.75);

    const counterMultiplier = Math.max(
        0,
        toSafeNumber(defender.stats.counterDamageMultiplier, 0),
    );

    if (counterChance <= 0 || counterMultiplier <= 0 || !roll(counterChance)) {
        return {
            triggered: false,
            damage: 0,
        };
    }

    const attackResult = performAttack({
        attacker: defender,
        defender: attacker,

        multiplier: counterMultiplier,

        canDodge: false,
        allowRevive,

        countTurn: false,
        countBasicAttack: false,
    });

    defender.statistics.counters =
        toSafeInteger(defender.statistics.counters, 0) + 1;

    return {
        triggered: true,
        ...attackResult,
    };
}

function getSkillCooldownRemaining(combatant, skillId) {
    if (!combatant || !skillId) {
        return 0;
    }

    const remaining = toSafeInteger(combatant.cooldowns?.[skillId], 0);

    return Math.max(0, remaining);
}

function isSkillReady(combatant, skillId) {
    return getSkillCooldownRemaining(combatant, skillId) <= 0;
}

function setSkillCooldown(combatant, skill) {
    if (!combatant || !skill?.id) {
        return 0;
    }

    if (!combatant.cooldowns || typeof combatant.cooldowns !== "object") {
        combatant.cooldowns = {};
    }

    const cooldown = Math.max(0, toSafeInteger(skill.cooldown, 0));

    if (cooldown <= 0) {
        delete combatant.cooldowns[skill.id];
        return 0;
    }

    combatant.cooldowns[skill.id] = cooldown;

    return cooldown;
}

function tickSkillCooldowns(combatant) {
    if (!combatant?.cooldowns || typeof combatant.cooldowns !== "object") {
        return {};
    }

    for (const skillId of Object.keys(combatant.cooldowns)) {
        const remaining = Math.max(
            0,
            toSafeInteger(combatant.cooldowns[skillId], 0),
        );

        const nextRemaining = Math.max(0, remaining - 1);

        if (nextRemaining <= 0) {
            delete combatant.cooldowns[skillId];
        } else {
            combatant.cooldowns[skillId] = nextRemaining;
        }
    }

    return {
        ...combatant.cooldowns,
    };
}

function getReadyActiveSkills(combatant) {
    if (!combatant || !Array.isArray(combatant.activeSkills)) {
        return [];
    }

    return combatant.activeSkills.filter((skill) => {
        return (
            skill &&
            skill.type === "active" &&
            skill.id &&
            isSkillReady(combatant, skill.id)
        );
    });
}

function calculateSkillPriority(skill, attacker, defender) {
    if (!skill) {
        return -Infinity;
    }

    const hits = Math.max(1, toSafeInteger(skill.hits, 1));

    const damageMultiplier = Math.max(
        0,
        toSafeNumber(skill.damageMultiplier, 0),
    );

    let score = damageMultiplier * hits;

    score += clamp(skill.defenseIgnore, 0, 0.9) * 1.5;

    score += clamp(skill.critChanceBonus, 0, 1) * 0.8;

    score += clamp(skill.lifeSteal, 0, 1) * 0.7;

    score += clamp(skill.stunChance, 0, 1) * 0.9;

    score += clamp(skill.defenseDown, 0, 1) * 0.7;

    score += clamp(skill.atkDown, 0, 1) * 0.6;

    score += clamp(skill.speedDown, 0, 1) * 0.3;

    score +=
        clamp(skill.poisonPercent, 0, 1) *
        Math.max(1, toSafeInteger(skill.duration, 1));

    score += clamp(skill.shieldPercent, 0, 1) * 1.2;

    score += clamp(skill.atkUp, 0, 1) * 0.8;

    score += clamp(skill.defenseUp, 0, 1) * 0.7;

    score += clamp(skill.speedUp, 0, 1) * 0.4;

    const defenderHpPercent = getHpPercent(defender);

    if (
        skill.executeBonusBelowHp &&
        defenderHpPercent <= clamp(skill.executeBonusBelowHp, 0, 1)
    ) {
        score += Math.max(0, toSafeNumber(skill.executeBonusDamage, 0)) * 1.5;
    }

    const attackerHpPercent = getHpPercent(attacker);

    if (skill.shieldPercent && attackerHpPercent <= 0.5) {
        score += 0.5;
    }

    return score;
}

function chooseActiveSkill(combatant, defender, options = {}) {
    const readySkills = getReadyActiveSkills(combatant);

    if (readySkills.length <= 0) {
        return null;
    }

    if (options.skillId) {
        const requestedSkill = readySkills.find((skill) => {
            return skill.id === options.skillId;
        });

        return requestedSkill || null;
    }

    const useSkillChance = clamp(options.useSkillChance, 0, 1);

    const finalUseSkillChance =
        options.useSkillChance === undefined ? 0.65 : useSkillChance;

    if (!roll(finalUseSkillChance)) {
        return null;
    }

    const rankedSkills = readySkills
        .map((skill) => {
            return {
                skill,
                score: calculateSkillPriority(skill, combatant, defender),
            };
        })
        .sort((a, b) => {
            return b.score - a.score;
        });

    if (rankedSkills.length === 1 || roll(0.7)) {
        return rankedSkills[0].skill;
    }

    const topSkills = rankedSkills.slice(0, Math.min(3, rankedSkills.length));

    const randomIndex = Math.floor(Math.random() * topSkills.length);

    return topSkills[randomIndex].skill;
}

function ensureCombatEffects(combatant) {
    if (!combatant) {
        return {
            buffs: [],
            debuffs: [],
        };
    }

    if (!Array.isArray(combatant.buffs)) {
        combatant.buffs = [];
    }

    if (!Array.isArray(combatant.debuffs)) {
        combatant.debuffs = [];
    }

    return {
        buffs: combatant.buffs,
        debuffs: combatant.debuffs,
    };
}

function addTimedEffect(combatant, effect, type = "buff") {
    if (!combatant || !effect?.key) {
        return null;
    }

    const effects = ensureCombatEffects(combatant);

    const targetList = type === "debuff" ? effects.debuffs : effects.buffs;

    const duration = Math.max(1, toSafeInteger(effect.duration, 1));

    const normalizedEffect = {
        key: String(effect.key),

        name: effect.name || String(effect.key),

        sourceSkillId: effect.sourceSkillId || null,

        sourceId: effect.sourceId || null,

        value: toSafeNumber(effect.value, 0),

        duration,

        remainingTurns: duration,

        stackable: effect.stackable === true,

        maxStacks: Math.max(1, toSafeInteger(effect.maxStacks, 1)),

        stacks: Math.max(1, toSafeInteger(effect.stacks, 1)),

        metadata: {
            ...(effect.metadata || {}),
        },
    };

    const existingIndex = targetList.findIndex((currentEffect) => {
        return (
            currentEffect.key === normalizedEffect.key &&
            currentEffect.sourceSkillId === normalizedEffect.sourceSkillId &&
            currentEffect.sourceId === normalizedEffect.sourceId
        );
    });

    if (existingIndex >= 0) {
        const existing = targetList[existingIndex];

        if (normalizedEffect.stackable) {
            existing.stacks = Math.min(
                normalizedEffect.maxStacks,
                Math.max(1, toSafeInteger(existing.stacks, 1)) +
                    normalizedEffect.stacks,
            );

            existing.value = normalizedEffect.value;
        } else {
            existing.value = normalizedEffect.value;

            existing.stacks = 1;
        }

        existing.remainingTurns = Math.max(
            toSafeInteger(existing.remainingTurns, 0),
            normalizedEffect.remainingTurns,
        );

        existing.duration = normalizedEffect.duration;

        existing.metadata = {
            ...(existing.metadata || {}),
            ...normalizedEffect.metadata,
        };

        return existing;
    }

    targetList.push(normalizedEffect);

    return normalizedEffect;
}

function getEffectValue(combatant, key, options = {}) {
    if (!combatant || !key) {
        return 0;
    }

    const { buffs, debuffs } = ensureCombatEffects(combatant);

    let sourceList;

    if (options.type === "buff") {
        sourceList = buffs;
    } else if (options.type === "debuff") {
        sourceList = debuffs;
    } else {
        sourceList = [...buffs, ...debuffs];
    }

    return sourceList.reduce((total, effect) => {
        if (
            effect?.key !== key ||
            toSafeInteger(effect.remainingTurns, 0) <= 0
        ) {
            return total;
        }

        const stacks = Math.max(1, toSafeInteger(effect.stacks, 1));

        return total + toSafeNumber(effect.value, 0) * stacks;
    }, 0);
}

function getCombatModifiers(combatant) {
    if (!combatant?.stats) {
        return {
            atkMultiplier: 1,
            defenseMultiplier: 1,
            speedMultiplier: 1,
            dodgeChanceBonus: 0,
        };
    }

    const atkUp = clamp(
        getEffectValue(combatant, "atk_up", {
            type: "buff",
        }),
        0,
        1,
    );

    const atkDown = clamp(
        getEffectValue(combatant, "atk_down", {
            type: "debuff",
        }),
        0,
        0.8,
    );

    const defenseUp = clamp(
        getEffectValue(combatant, "defense_up", {
            type: "buff",
        }),
        0,
        1,
    );

    const defenseDown = clamp(
        getEffectValue(combatant, "defense_down", {
            type: "debuff",
        }),
        0,
        0.8,
    );

    const speedUp = clamp(
        getEffectValue(combatant, "speed_up", {
            type: "buff",
        }),
        0,
        1,
    );

    const speedDown = clamp(
        getEffectValue(combatant, "speed_down", {
            type: "debuff",
        }),
        0,
        0.8,
    );

    const dodgeChanceBonus = clamp(
        getEffectValue(combatant, "dodge_up", {
            type: "buff",
        }),
        0,
        0.5,
    );

    return {
        atkMultiplier: Math.max(0.2, 1 + atkUp - atkDown),

        defenseMultiplier: Math.max(0.2, 1 + defenseUp - defenseDown),

        speedMultiplier: Math.max(0.2, 1 + speedUp - speedDown),

        dodgeChanceBonus,
    };
}

function getEffectiveDefense(combatant) {
    if (!combatant?.stats) {
        return 0;
    }

    const modifiers = getCombatModifiers(combatant);

    return Math.max(
        0,
        Math.floor(
            toSafeNumber(combatant.stats.defense, 0) *
                modifiers.defenseMultiplier,
        ),
    );
}

function getEffectiveSpeed(combatant) {
    if (!combatant?.stats) {
        return 1;
    }

    const modifiers = getCombatModifiers(combatant);

    return Math.max(
        1,
        Math.floor(
            toSafeNumber(combatant.stats.speed, 1) * modifiers.speedMultiplier,
        ),
    );
}

function processStartOfTurnEffects(combatant) {
    if (!combatant?.stats) {
        return {
            poisonDamage: 0,
            defeated: false,
            stunned: false,
            logs: [],
        };
    }

    const { debuffs } = ensureCombatEffects(combatant);

    const logs = [];

    let poisonDamage = 0;

    const poisonEffects = debuffs.filter((effect) => {
        return (
            effect?.key === "poison" &&
            toSafeInteger(effect.remainingTurns, 0) > 0
        );
    });

    for (const poison of poisonEffects) {
        const damagePerTurn = Math.max(
            1,
            toSafeInteger(poison.metadata?.damagePerTurn, 1),
        );

        const damageResult = applyDamage(combatant, damagePerTurn, {
            ignoreShield: true,
            allowRevive: true,
        });

        poisonDamage += damageResult.hpDamage;

        logs.push({
            type: "poison",
            name: poison.name,
            damage: damageResult.hpDamage,
            defeated: damageResult.defeated,
            revived: damageResult.revived,
        });
    }

    const stunned =
        getEffectValue(combatant, "stun", {
            type: "debuff",
        }) > 0;

    combatant.status = {
        ...(combatant.status || {}),
        stunned,
    };

    return {
        poisonDamage,

        defeated: !isCombatantAlive(combatant),

        stunned,

        logs,
    };
}

function tickCombatEffects(combatant) {
    if (!combatant) {
        return {
            expiredBuffs: [],
            expiredDebuffs: [],
        };
    }

    const { buffs, debuffs } = ensureCombatEffects(combatant);

    const expiredBuffs = [];
    const expiredDebuffs = [];

    function tickList(list, expiredList) {
        for (let index = list.length - 1; index >= 0; index -= 1) {
            const effect = list[index];

            if (effect.metadata?.skipNextTick === true) {
                effect.metadata = {
                    ...(effect.metadata || {}),
                    skipNextTick: false,
                };

                continue;
            }

            effect.remainingTurns = Math.max(
                0,
                toSafeInteger(effect.remainingTurns, 0) - 1,
            );

            if (effect.remainingTurns <= 0) {
                expiredList.push(effect);

                list.splice(index, 1);
            }
        }
    }

    tickList(buffs, expiredBuffs);

    tickList(debuffs, expiredDebuffs);

    combatant.status = {
        ...(combatant.status || {}),
        stunned: false,
    };

    return {
        expiredBuffs,
        expiredDebuffs,
    };
}

function buildSkillEffect(attacker, skill, key, value, duration, extra = {}) {
    return {
        key,

        name: extra.name || skill.name || key,

        sourceSkillId: skill.id || null,

        sourceId: attacker?.id || null,

        value,

        duration: Math.max(1, toSafeInteger(duration, 1)),

        stackable: extra.stackable === true,

        maxStacks: Math.max(1, toSafeInteger(extra.maxStacks, 1)),

        stacks: Math.max(1, toSafeInteger(extra.stacks, 1)),

        metadata: {
            ...(extra.metadata || {}),
        },
    };
}
function applySkillBuffs(attacker, skill) {
    const appliedBuffs = [];

    const duration = Math.max(1, toSafeInteger(skill.duration, 1));

    const buffDefinitions = [
        {
            field: "atkUp",
            key: "atk_up",
            name: "Tăng công",
        },
        {
            field: "defenseUp",
            key: "defense_up",
            name: "Tăng thủ",
        },
        {
            field: "speedUp",
            key: "speed_up",
            name: "Tăng tốc",
        },
        {
            field: "dodgeChance",
            key: "dodge_up",
            name: "Tăng né tránh",
        },
    ];

    for (const definition of buffDefinitions) {
        const value = clamp(skill[definition.field], 0, 1);

        if (value <= 0) {
            continue;
        }

        const effect = addTimedEffect(
            attacker,
            buildSkillEffect(attacker, skill, definition.key, value, duration, {
                name: definition.name,

                metadata: {
                    skipNextTick: true,
                },
            }),
            "buff",
        );

        if (effect) {
            appliedBuffs.push(effect);
        }
    }

    return appliedBuffs;
}
function applySkillDebuffs(attacker, defender, skill) {
    const appliedDebuffs = [];

    const duration = Math.max(1, toSafeInteger(skill.duration, 1));

    const debuffDefinitions = [
        {
            field: "atkDown",
            key: "atk_down",
            name: "Giảm công",
        },
        {
            field: "defenseDown",
            key: "defense_down",
            name: "Giảm thủ",
        },
        {
            field: "speedDown",
            key: "speed_down",
            name: "Giảm tốc",
        },
    ];

    for (const definition of debuffDefinitions) {
        const value = clamp(skill[definition.field], 0, 1);

        if (value <= 0) {
            continue;
        }

        const effect = addTimedEffect(
            defender,
            buildSkillEffect(attacker, skill, definition.key, value, duration, {
                name: definition.name,
            }),
            "debuff",
        );

        if (effect) {
            appliedDebuffs.push(effect);
        }
    }

    return appliedDebuffs;
}
function tryApplySkillStun(attacker, defender, skill) {
    const stunChance = clamp(skill.stunChance, 0, 1);

    if (stunChance <= 0 || !roll(stunChance)) {
        return null;
    }

    return addTimedEffect(
        defender,
        buildSkillEffect(
            attacker,
            skill,
            "stun",
            1,
            Math.max(1, toSafeInteger(skill.stunDuration || skill.duration, 1)),
            {
                name: "Choáng",
            },
        ),
        "debuff",
    );
}

function tryApplySkillPoison(attacker, defender, skill) {
    const poisonPercent = clamp(skill.poisonPercent, 0, 1);

    if (poisonPercent <= 0) {
        return null;
    }

    const duration = Math.max(1, toSafeInteger(skill.duration, 1));

    const damagePerTurn = Math.max(
        1,
        Math.floor(getEffectiveAttack(attacker) * poisonPercent),
    );

    return addTimedEffect(
        defender,
        buildSkillEffect(attacker, skill, "poison", poisonPercent, duration, {
            name: "Trúng độc",

            metadata: {
                damagePerTurn,
            },
        }),
        "debuff",
    );
}

function performSkill({
    attacker,
    defender,
    skill,

    canDodge = true,
    allowRevive = true,
} = {}) {
    if (!isCombatantAlive(attacker)) {
        return {
            success: false,
            reason: "attacker_defeated",
        };
    }

    if (!isCombatantAlive(defender)) {
        return {
            success: false,
            reason: "defender_defeated",
        };
    }

    if (!skill || skill.type !== "active" || !skill.id) {
        return {
            success: false,
            reason: "invalid_skill",
        };
    }

    if (!isSkillReady(attacker, skill.id)) {
        return {
            success: false,
            reason: "skill_on_cooldown",

            cooldown: getSkillCooldownRemaining(attacker, skill.id),
        };
    }

    attacker.statistics.turns = toSafeInteger(attacker.statistics.turns, 0) + 1;

    attacker.statistics.skillsUsed =
        toSafeInteger(attacker.statistics.skillsUsed, 0) + 1;

    const hits = Math.max(1, toSafeInteger(skill.hits, 1));

    const baseMultiplier = Math.max(0, toSafeNumber(skill.damageMultiplier, 0));

    const multiplierPerHit = hits > 1 ? baseMultiplier / hits : baseMultiplier;

    const defenseIgnore = clamp(skill.defenseIgnore, 0, 0.9);

    const critChanceBonus = clamp(skill.critChanceBonus, 0, 1);

    const lifeSteal = clamp(skill.lifeSteal, 0, 1);

    const isDamagingSkill = baseMultiplier > 0;

    const hitResults = [];

    let totalDamage = 0;
    let totalHpDamage = 0;
    let totalShieldDamage = 0;
    let criticalHits = 0;
    let dodgedHits = 0;

    let executeActivated = false;

    if (isDamagingSkill) {
        for (let hitIndex = 0; hitIndex < hits; hitIndex += 1) {
            if (!isCombatantAlive(defender)) {
                break;
            }

            let currentMultiplier = multiplierPerHit;

            const executeThreshold = clamp(skill.executeBonusBelowHp, 0, 1);

            const executeBonusDamage = Math.max(
                0,
                toSafeNumber(skill.executeBonusDamage, 0),
            );

            if (
                executeThreshold > 0 &&
                getHpPercent(defender) <= executeThreshold
            ) {
                currentMultiplier *= 1 + executeBonusDamage;

                executeActivated = true;
            }

            const attackResult = performAttack({
                attacker,
                defender,

                multiplier: Math.max(0.1, currentMultiplier),

                defenseIgnore,
                critChanceBonus,

                canDodge: canDodge && hitIndex === 0,

                allowRevive,

                countTurn: false,
                countBasicAttack: false,
            });

            hitResults.push({
                hit: hitIndex + 1,
                ...attackResult,
            });

            if (attackResult.dodged) {
                dodgedHits += 1;
                break;
            }

            totalDamage += toSafeInteger(attackResult.damage, 0);

            totalHpDamage += toSafeInteger(attackResult.hpDamage, 0);

            totalShieldDamage += toSafeInteger(
                attackResult.absorbedByShield,
                0,
            );

            if (attackResult.isCritical) {
                criticalHits += 1;
            }
        }
    }

    let healingResult = {
        healed: 0,
        hp: attacker.hp,
        maxHp: attacker.stats.maxHp,
    };

    if (lifeSteal > 0 && totalHpDamage > 0 && isCombatantAlive(attacker)) {
        healingResult = healCombatant(
            attacker,
            Math.floor(totalHpDamage * lifeSteal),
        );
    }

    let shieldResult = {
        added: 0,
        totalShield: attacker.shield,
    };

    const shieldPercent = clamp(skill.shieldPercent, 0, 1);

    if (shieldPercent > 0) {
        shieldResult = addShield(
            attacker,
            Math.floor(attacker.stats.maxHp * shieldPercent),
        );
    }

    const buffs = applySkillBuffs(attacker, skill);

    let debuffs = [];
    let stunEffect = null;
    let poisonEffect = null;

    const hitConnected =
        !isDamagingSkill || (dodgedHits <= 0 && hitResults.length > 0);
    if (hitConnected && isCombatantAlive(defender)) {
        debuffs = applySkillDebuffs(attacker, defender, skill);

        stunEffect = tryApplySkillStun(attacker, defender, skill);

        poisonEffect = tryApplySkillPoison(attacker, defender, skill);
    }

    const cooldown = setSkillCooldown(attacker, skill);

    return {
        success: true,

        skillId: skill.id,
        skillName: skill.name || skill.id,

        hitsPlanned: hits,
        hitsPerformed: hitResults.length,

        hitResults,

        totalDamage,
        totalHpDamage,
        totalShieldDamage,

        criticalHits,
        dodgedHits,

        dodged:
            isDamagingSkill &&
            dodgedHits > 0 &&
            totalHpDamage <= 0 &&
            totalShieldDamage <= 0,

        executeActivated,

        healed: healingResult.healed,

        shieldAdded: shieldResult.added,

        buffs,
        debuffs,

        stunned: Boolean(stunEffect),

        poisoned: Boolean(poisonEffect),

        stunEffect,
        poisonEffect,

        cooldown,

        defenderHp: defender.hp,

        defenderShield: defender.shield,

        attackerHp: attacker.hp,

        attackerShield: attacker.shield,

        defenderDefeated: !isCombatantAlive(defender),
    };
}
function performCombatAction({
    attacker,
    defender,

    skillId = null,
    useSkillChance = 0.65,

    allowCounter = true,
    allowRevive = true,
} = {}) {
    if (!isCombatantAlive(attacker)) {
        return {
            success: false,
            reason: "attacker_defeated",
        };
    }

    if (!isCombatantAlive(defender)) {
        return {
            success: false,
            reason: "defender_defeated",
        };
    }

    const startEffects = processStartOfTurnEffects(attacker);

    if (startEffects.defeated || !isCombatantAlive(attacker)) {
        return {
            success: false,
            reason: "attacker_defeated_by_effect",

            startEffects,
        };
    }

    if (startEffects.stunned) {
        attacker.statistics.turns =
            toSafeInteger(attacker.statistics.turns, 0) + 1;

        return {
            success: true,
            type: "stunned",

            skipped: true,
            startEffects,
        };
    }

    if (skillId) {
        const requestedSkill = attacker.activeSkills?.find((skill) => {
            return skill?.id === skillId && skill.type === "active";
        });

        if (!requestedSkill) {
            return {
                success: false,
                reason: "skill_not_equipped",
                skillId,
                startEffects,
            };
        }

        if (!isSkillReady(attacker, requestedSkill.id)) {
            return {
                success: false,
                reason: "skill_on_cooldown",
                skillId,

                cooldown: getSkillCooldownRemaining(
                    attacker,
                    requestedSkill.id,
                ),

                startEffects,
            };
        }
    }

    const selectedSkill = chooseActiveSkill(attacker, defender, {
        skillId,
        useSkillChance,
    });

    let actionResult;

    if (selectedSkill) {
        actionResult = {
            type: "skill",

            result: performSkill({
                attacker,
                defender,
                skill: selectedSkill,
                allowRevive,
            }),
        };
    } else {
        actionResult = {
            type: "basic_attack",

            result: performAttack({
                attacker,
                defender,
                allowRevive,
            }),
        };
    }

    let counterResult = {
        triggered: false,
        damage: 0,
    };

    const actionDealtDamage =
        actionResult.type === "basic_attack"
            ? toSafeInteger(actionResult.result?.damage, 0) > 0
            : toSafeInteger(actionResult.result?.totalDamage, 0) > 0;

    if (
        allowCounter &&
        actionDealtDamage &&
        isCombatantAlive(defender) &&
        isCombatantAlive(attacker) &&
        actionResult.result?.dodged !== true
    ) {
        counterResult = tryCounterAttack({
            defender,
            attacker,
            allowRevive,
        });
    }

    return {
        success: true,

        startEffects,

        ...actionResult,

        counterResult,
    };
}

function finishCombatantTurn(combatant, options = {}) {
    if (!combatant) {
        return {
            cooldowns: {},
            expiredBuffs: [],
            expiredDebuffs: [],
        };
    }

    const shouldTickCooldowns = options.tickCooldowns !== false;

    const shouldTickEffects = options.tickEffects !== false;

    let cooldowns = {
        ...(combatant.cooldowns || {}),
    };

    let effectResult = {
        expiredBuffs: [],
        expiredDebuffs: [],
    };

    if (shouldTickCooldowns) {
        cooldowns = tickSkillCooldowns(combatant);
    }

    if (shouldTickEffects) {
        effectResult = tickCombatEffects(combatant);
    }

    return {
        cooldowns,

        expiredBuffs: effectResult.expiredBuffs,

        expiredDebuffs: effectResult.expiredDebuffs,

        hp: toSafeInteger(combatant.hp, 0),

        shield: toSafeInteger(combatant.shield, 0),

        alive: isCombatantAlive(combatant),
    };
}

function executeCombatTurn({
    attacker,
    defender,

    skillId = null,
    useSkillChance = 0.65,

    allowCounter = true,
    allowRevive = true,

    autoFinishTurn = true,
} = {}) {
    const actionResult = performCombatAction({
        attacker,
        defender,

        skillId,
        useSkillChance,

        allowCounter,
        allowRevive,
    });

    let finishResult = null;

    const turnWasConsumed =
        actionResult.success === true ||
        actionResult.reason === "attacker_defeated_by_effect";

    if (autoFinishTurn && turnWasConsumed) {
        finishResult = finishCombatantTurn(attacker);
    }

    return {
        ...actionResult,

        finishResult,

        attackerState: {
            hp: toSafeInteger(attacker?.hp, 0),

            maxHp: toSafeInteger(attacker?.stats?.maxHp, 0),

            shield: toSafeInteger(attacker?.shield, 0),

            alive: isCombatantAlive(attacker),

            cooldowns: {
                ...(attacker?.cooldowns || {}),
            },

            buffs: Array.isArray(attacker?.buffs) ? attacker.buffs : [],

            debuffs: Array.isArray(attacker?.debuffs) ? attacker.debuffs : [],
        },

        defenderState: {
            hp: toSafeInteger(defender?.hp, 0),

            maxHp: toSafeInteger(defender?.stats?.maxHp, 0),

            shield: toSafeInteger(defender?.shield, 0),

            alive: isCombatantAlive(defender),

            buffs: Array.isArray(defender?.buffs) ? defender.buffs : [],

            debuffs: Array.isArray(defender?.debuffs) ? defender.debuffs : [],
        },
    };
}

module.exports = {
    clamp,
    toSafeNumber,
    toSafeInteger,

    roll,
    randomBetween,

    getRootById,
    getSkillDef,

    ensureEquippedSkillData,
    getEquippedPassiveSkillBonuses,
    getEquippedActiveSkills,

    calculateActiveSkillPowerBonus,

    calculateRealmPower,
    calculateFloorPower,
    calculateExpPower,
    calculateBaseCombatPower,

    calculateCombatStats,
    calculateCombatPower,

    createCombatant,
    createEmptyCombatStatistics,
    normalizeNpcSkills,
    createCombatantFromStats,
    syncCombatantToSource,
    isCombatantAlive,
    getHpPercent,
    getEffectiveAttack,

    calculateDamage,
    calculateDetailedDamage,

    addShield,
    healCombatant,
    tryReviveCombatant,
    applyDamage,

    performAttack,
    tryCounterAttack,

    getSkillCooldownRemaining,
    isSkillReady,
    setSkillCooldown,
    tickSkillCooldowns,

    getReadyActiveSkills,
    calculateSkillPriority,
    chooseActiveSkill,

    ensureCombatEffects,
    addTimedEffect,
    getEffectValue,

    getCombatModifiers,
    getEffectiveDefense,
    getEffectiveSpeed,

    processStartOfTurnEffects,
    tickCombatEffects,

    buildSkillEffect,

    applySkillBuffs,
    applySkillDebuffs,

    tryApplySkillStun,
    tryApplySkillPoison,

    performSkill,
    performCombatAction,

    finishCombatantTurn,
    executeCombatTurn,
};
