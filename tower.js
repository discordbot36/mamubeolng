const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");

const {
    addMoney,
    addInventoryItem,
    ensureTuTienProfile,
    updateTuTienProfile,
    ensureTowerProfile,
    updateTowerProfile,
    formatMoney,
    getCurrencyEmoji,
} = require("./database");

const towerConfig = require("./config/tower");
const quest = require("./quest");
const combat = require("./utils/combat");
const {
    givePhapBaoFarmReward,
    formatPhapBaoFarmReward,
} = require("./utils/phapbaoFarmDrops");
const activeTowerBattles = new Map();
const TOWER_TURN_DELAY_MS = 500;
const TOWER_LOG_LIMIT = 5;
const TOWER_HP_BAR_LENGTH = 10;
const TOWER_EDIT_EVERY_TURNS = 2;

function formatNumber(number) {
    return Number(number || 0).toLocaleString("vi-VN");
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function formatTimeLeft(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes <= 0) {
        return `${seconds} giây`;
    }

    if (seconds <= 0) {
        return `${minutes} phút`;
    }

    return `${minutes} phút ${seconds} giây`;
}

function getZoneMultiplier(floor) {
    if (floor <= 10) return 1;
    if (floor <= 25) return 1.35;
    if (floor <= 50) return 1.9;
    if (floor <= 75) return 2.6;
    if (floor <= 100) return 3.4;
    if (floor <= 150) return 4.6;
    if (floor <= 200) return 6.2;
    if (floor <= 250) return 8.3;
    if (floor <= 300) return 11;

    return 11 + Math.floor((floor - 300) / 25) * 1.2;
}

function getRecommendedPower(floor) {
    return Math.floor(
        towerConfig.monster.basePower *
            Math.pow(floor, towerConfig.monster.floorPower) *
            getZoneMultiplier(floor),
    );
}

function getMonsterName(floor) {
    const names = Array.isArray(towerConfig.monsterNames)
        ? towerConfig.monsterNames
        : ["Trư Ma Hộ Tháp"];

    const name = names[(floor - 1) % names.length];

    if (floor % 10 === 0) {
        return `Boss ${name}`;
    }

    return name;
}

function buildMonster(floor) {
    const recommendedPower = getRecommendedPower(floor);

    const isBossFloor = floor % Number(towerConfig.chestEveryFloor || 10) === 0;

    const bossMultiplier = isBossFloor ? 1.25 : 1;

    const power = Math.max(1, Math.floor(recommendedPower * bossMultiplier));

    const atk = Math.max(1, Math.floor(power * (isBossFloor ? 0.52 : 0.45)));

    const defenseMultiplier = isBossFloor ? 0.024 : 0.018;

    const defense = Math.max(0, Math.floor(power * defenseMultiplier));

    const hp = Math.max(1, Math.floor(power * (isBossFloor ? 5.8 : 4.8)));

    const speed = Math.max(
        1,
        Math.floor(50 + floor * 4 + Math.sqrt(power) / 3),
    );

    const monster = combat.createCombatantFromStats({
        id: `tower_monster_${floor}`,

        name: getMonsterName(floor),

        type: isBossFloor ? "tower_boss" : "tower_monster",

        combatPower: power,

        atk,
        defense,
        hp,
        speed,

        critChance: isBossFloor ? 0.1 : 0.05,

        dodgeChance: isBossFloor ? 0.04 : 0.02,

        damageReduction: isBossFloor ? 0.08 : 0,

        skills: towerConfig.monsterSkills || [],

        metadata: {
            floor,
            recommendedPower,
            power,
            isBossFloor,

            shieldCapPercent: isBossFloor ? 0.75 : 0.5,
        },
    });

    monster.floor = floor;
    monster.power = power;
    monster.recommendedPower = recommendedPower;

    return monster;
}
function calculateWinRate(playerPower, monsterPower) {
    const player = Math.max(0, Number(playerPower || 0));

    const monster = Math.max(1, Number(monsterPower || 1));

    if (player >= monster * 1.1) {
        return 1;
    }

    const ratio = player / monster;

    return clamp(Math.pow(ratio, 2) * 0.75, 0.05, 0.95);
}
function isChestFloor(floor) {
    return floor % towerConfig.chestEveryFloor === 0;
}

function addTuTienExp(userId, amount) {
    const exp = Math.max(0, Math.floor(Number(amount || 0)));

    if (exp <= 0) {
        return 0;
    }

    updateTuTienProfile(userId, (profile) => {
        profile.exp = Number(profile.exp || 0) + exp;
    });

    return exp;
}

function getTowerExpReward(floor) {
    const baseExp = Math.floor(
        (35 + floor * 10 + Math.pow(floor, 1.05) * 6) * 1.12,
    );

    if (isChestFloor(floor)) {
        return Math.floor(baseExp * 1.35);
    }

    return baseExp;
}

function getMoneyReward(floor) {
    const reward = Math.floor(
        Number(towerConfig.reward.base || 120) *
            Math.pow(floor, Number(towerConfig.reward.power || 1.12)),
    );

    if (isChestFloor(floor)) {
        return Math.floor(
            reward * Number(towerConfig.reward.chestFloorMultiplier || 2),
        );
    }

    return reward;
}

function getChestByFloor(floor) {
    const chests = towerConfig.chests;

    if (floor >= 300) return chests.mamu;
    if (floor >= 200) return chests.kim_cuong;
    if (floor >= 100) return chests.vang;
    if (floor >= 50) return chests.bac;

    return chests.dong;
}

function getRewardText(floor) {
    const coin = getCurrencyEmoji();
    const moneyReward = getMoneyReward(floor);
    const expReward = getTowerExpReward(floor);

    if (isChestFloor(floor)) {
        const chest = getChestByFloor(floor);

        return (
            `${coin} **${formatMoney(moneyReward)}**\n` +
            `✨ Tu vi **+${formatNumber(expReward)} exp**\n` +
            `${chest.emoji} **${chest.name}**\n` +
            `🎁 Boss.`
        );
    }

    return `${coin} **${formatMoney(moneyReward)}**\n✨ Tu vi **+${formatNumber(expReward)} exp**`;
}

function buildFightButton(userId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`tower_fight_${userId}`)
            .setLabel("Đánh tầng tiếp theo")
            .setEmoji("⚔️")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled),
    );
}

function buildTowerEmbed(interaction, tower, profile) {
    const now = Date.now();
    const nextFloor = (tower.floor || 0) + 1;
    const monster = buildMonster(nextFloor);
    const playerPower = combat.calculateCombatPower(profile);
    const powerDiff = playerPower - monster.power;
    const winRate = calculateWinRate(playerPower, monster.power);
    const autoWin = playerPower >= monster.power * 1.1;
    const winStatusText = autoWin
        ? "✅ Vượt 110% lực chiến quái — chắc chắn thắng"
        : "🎲 Chưa đạt mốc chắc thắng — kết quả dựa trên combat thực tế";

    const cooldownLeft = Math.max(0, (tower.loseCooldownUntil || 0) - now);
    const isCoolingDown = cooldownLeft > 0;

    return new EmbedBuilder()
        .setTitle("🗼 LEO THÁP MAMU")
        .setColor(isCoolingDown ? 0xff5555 : 0xf7a8c8)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setDescription(
            `Người chơi chỉ có **1 tiến độ leo tháp**, không reset.\n` +
                `Thắng được đánh tiếp ngay, thua bị khóa **${formatTimeLeft(towerConfig.cooldownOnLoseMs)}**.\n\n` +
                `📍 Tầng đã clear: **${tower.floor || 0}**\n` +
                `🚪 Tầng tiếp theo: **${nextFloor}**\n\n` +
                `👹 Quái: **${monster.name}**\n` +
                `⚔️ Lực chiến quái: **${formatNumber(monster.power)}**\n` +
                `💪 Lực chiến của bạn: **${formatNumber(playerPower)}**\n` +
                `🎲 Tỉ lệ thắng ước tính: **${Math.floor(winRate * 100)}%**\n` +
                `${winStatusText}\n` +
                `📊 Chỉ số quái:\n` +
                `🗡️ ATK: **${formatNumber(monster.stats.atk)}**\n` +
                `🛡️ Thủ: **${formatNumber(monster.stats.defense)}**\n` +
                `❤️ Máu: **${formatNumber(monster.stats.maxHp)}**\n` +
                `💨 Speed: **${formatNumber(monster.stats.speed)}**\n\n` +
                `🎁 Phần thưởng:\n${getRewardText(nextFloor)}\n\n` +
                (isCoolingDown
                    ? `⏳ Bạn vừa thua, còn **${formatTimeLeft(cooldownLeft)}** mới đánh tiếp.`
                    : `✅ Sẵn sàng leo tầng tiếp theo.`),
        )
        .setTimestamp();
}

function makeHpBar(current, max, length = TOWER_HP_BAR_LENGTH) {
    const safeMax = Math.max(1, Number(max || 1));
    const safeCurrent = Math.max(0, Number(current || 0));
    const ratio = Math.max(0, Math.min(1, safeCurrent / safeMax));
    const filled = Math.round(ratio * length);
    const empty = length - filled;

    return "█".repeat(filled) + "░".repeat(empty);
}

function getDaoName(interaction, profile) {
    return (
        profile.daoHieu ||
        profile.daoName ||
        profile.daohieu ||
        profile.name ||
        interaction.member?.displayName ||
        interaction.user.username ||
        "Đạo hữu vô danh"
    );
}

function formatTowerAction(actorName, action) {
    const lines = [];

    if (action?.startEffects?.poisonDamage > 0) {
        lines.push(
            `☠️ **${actorName}** chịu **${formatNumber(
                action.startEffects.poisonDamage,
            )}** sát thương độc.`,
        );
    }

    if (!action?.success) {
        if (action?.reason === "attacker_defeated_by_effect") {
            lines.push(`💀 **${actorName}** gục ngã vì hiệu ứng bất lợi.`);
        } else {
            lines.push(
                `❌ **${actorName}** không thể hành động: ${action?.reason || "không rõ"}.`,
            );
        }

        return lines;
    }

    if (action.type === "stunned") {
        lines.push(`💫 **${actorName}** bị choáng và mất lượt.`);

        return lines;
    }

    if (action.type === "basic_attack") {
        const result = action.result;

        if (result.dodged) {
            lines.push(`💨 Đòn đánh của **${actorName}** bị né.`);

            return lines;
        }

        lines.push(
            `⚔️ **${actorName}** đánh thường, gây **${formatNumber(
                result.hpDamage || 0,
            )}** sát thương HP` +
                (result.absorbedByShield > 0
                    ? ` và phá **${formatNumber(
                          result.absorbedByShield,
                      )}** khiên`
                    : "") +
                (result.isCritical ? " 💥 **CHÍ MẠNG**" : "") +
                ".",
        );
    }

    if (action.type === "skill") {
        const result = action.result;

        if (result.dodged) {
            lines.push(
                `💨 **${actorName}** dùng **${result.skillName}**, nhưng kỹ năng bị né hoàn toàn.`,
            );

            return lines;
        }

        lines.push(
            `✨ **${actorName}** thi triển **${result.skillName}**, gây **${formatNumber(
                result.totalHpDamage || 0,
            )}** sát thương HP` +
                (result.totalShieldDamage > 0
                    ? ` và phá **${formatNumber(
                          result.totalShieldDamage,
                      )}** khiên`
                    : "") +
                (result.criticalHits > 0
                    ? `, **${result.criticalHits}** hit chí mạng`
                    : "") +
                ".",
        );

        if (result.healed > 0) {
            lines.push(`> 🩸 Hút máu **${formatNumber(result.healed)}** HP.`);
        }

        if (result.shieldAdded > 0) {
            lines.push(
                `> 🛡️ Tạo **${formatNumber(result.shieldAdded)}** khiên.`,
            );
        }

        if (result.stunned) {
            lines.push("> 💫 Mục tiêu bị choáng.");
        }

        if (result.poisoned) {
            lines.push("> ☠️ Mục tiêu bị trúng độc.");
        }
    }

    if (action.counterResult?.triggered) {
        lines.push(
            `↩️ Phản công gây **${formatNumber(
                action.counterResult.hpDamage || 0,
            )}** sát thương HP.`,
        );
    }

    return lines;
}

function buildCombatButtons(userId, battleId, ended = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`tower_combat_fast_${userId}_${battleId}`)
            .setLabel("Kết quả nhanh")
            .setEmoji("⏩")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(ended),
    );
}

function buildTowerCombatEmbed(state, resultText = "") {
    const logs =
        state.logs.slice(-TOWER_LOG_LIMIT).join("\n") ||
        "🐷 Trận chiến bắt đầu!";

    const playerMaxHp = Math.max(1, Number(state.player?.stats?.maxHp || 1));

    const enemyMaxHp = Math.max(1, Number(state.enemy?.stats?.maxHp || 1));

    const playerBar = makeHpBar(state.player.hp, playerMaxHp);

    const enemyBar = makeHpBar(state.enemy.hp, enemyMaxHp);

    return new EmbedBuilder()
        .setTitle(`🌍 Tháp Mamu: ${state.player.name} vs ${state.enemy.name}`)
        .setColor(state.ended ? (state.isWin ? 0x77dd77 : 0xff5555) : 0xf7a8c8)
        .setDescription(
            `${logs}\n\n` +
                `━━━━━━━━━━━━━━━━━━\n\n` +
                `🛡️ **ĐẠO HỮU**\n` +
                `Đạo hiệu: **${state.player.name}**\n` +
                `Sinh Mệnh: ❤️ ${playerBar}\n` +
                `(${formatNumber(state.player.hp)} / ${formatNumber(playerMaxHp)})\n` +
                (state.player.shield > 0
                    ? `Khiên: 🛡️ **${formatNumber(state.player.shield)}**\n`
                    : "") +
                `\n👹 **KẺ ĐỊCH**\n` +
                `**${state.enemy.name}**\n` +
                `Sinh Mệnh: 💔 ${enemyBar}\n` +
                `(${formatNumber(state.enemy.hp)} / ${formatNumber(enemyMaxHp)})\n` +
                (state.enemy.shield > 0
                    ? `Khiên: 🛡️ **${formatNumber(state.enemy.shield)}**\n`
                    : "") +
                `\n━━━━━━━━━━━━━━━━━━\n` +
                (resultText ||
                    `💬 Hiệp **${state.turn}/${state.maxTurns}** | Mùi heo chiến đang bốc lên nghi ngút.`),
        )
        .setFooter({
            text: state.ended
                ? "Trận đấu đã kết thúc"
                : "Bấm Kết quả nhanh để bỏ qua diễn biến",
        })
        .setTimestamp();
}

function createTowerBattleState(
    interaction,
    profile,
    monster,
    nextFloor,
    autoWin = false,
) {
    const battleId = `${interaction.user.id}_${Date.now()}`;

    const playerName = getDaoName(interaction, profile);

    const player = combat.createCombatant(profile, {
        userId: interaction.user.id,

        name: playerName,
    });

    player.metadata = {
        ...(player.metadata || {}),

        floor: nextFloor,

        /*
         * Người chơi trong Tower cũng bị giới hạn
         * khiên tối đa 50% HP.
         */
        shieldCapPercent: 0.5,
    };

    return {
        id: battleId,

        userId: interaction.user.id,

        floor: nextFloor,

        turn: 1,

        maxTurns: Math.max(1, Number(towerConfig.maxCombatTurns || 20)),

        ended: false,
        isWin: false,

        autoWin: Boolean(autoWin),

        fastMode: false,

        logs: [
            `🗼 **${playerName}** bước vào tầng **${nextFloor}**, đối đầu với **${monster.name}**!`,
        ],

        player,
        enemy: monster,
    };
}

function applyTowerCombatRound(state) {
    if (state.ended) {
        return state;
    }

    state.logs.push(`**— Hiệp ${state.turn} —**`);

    const playerSpeed = combat.getEffectiveSpeed(state.player);
    const enemySpeed = combat.getEffectiveSpeed(state.enemy);

    const turnOrder =
        playerSpeed >= enemySpeed
            ? [
                  {
                      actor: state.player,
                      target: state.enemy,
                      isPlayer: true,
                  },
                  {
                      actor: state.enemy,
                      target: state.player,
                      isPlayer: false,
                  },
              ]
            : [
                  {
                      actor: state.enemy,
                      target: state.player,
                      isPlayer: false,
                  },
                  {
                      actor: state.player,
                      target: state.enemy,
                      isPlayer: true,
                  },
              ];

    for (const turn of turnOrder) {
        if (
            !combat.isCombatantAlive(turn.actor) ||
            !combat.isCombatantAlive(turn.target)
        ) {
            continue;
        }

        const action = combat.executeCombatTurn({
            attacker: turn.actor,
            defender: turn.target,
            useSkillChance: turn.isPlayer
                ? Number(towerConfig.activeSkillTriggerChance ?? 0.65)
                : Number(towerConfig.monsterSkillTriggerChance ?? 0.45),
            allowCounter: true,
            allowRevive: true,
        });

        state.logs.push(...formatTowerAction(turn.actor.name, action));

        if (!combat.isCombatantAlive(turn.target)) {
            /*
             * Nếu người chơi đạt mốc auto-win, không cho animation
             * kết luận người chơi thua giữa trận.
             */
            if (state.autoWin === true && turn.target === state.player) {
                state.player.hp = 1;

                state.logs.push(
                    `🔥 Nhờ lực chiến vượt trội, **${state.player.name}** cưỡng ép trụ lại với **1 HP**!`,
                );

                continue;
            }

            break;
        }
    }

    let playerAlive = combat.isCombatantAlive(state.player);
    const enemyAlive = combat.isCombatantAlive(state.enemy);

    if (state.autoWin === true && !playerAlive) {
        state.player.hp = 1;
        playerAlive = true;
    }

    if (!enemyAlive && playerAlive) {
        state.ended = true;
        state.isWin = true;

        state.logs.push(
            `🏆 **${state.player.name}** đã đá bay **${state.enemy.name}** khỏi Tháp Mamu!`,
        );

        return state;
    }

    if (!playerAlive && state.autoWin !== true) {
        state.ended = true;
        state.isWin = false;

        state.logs.push(
            `💀 **${state.player.name}** bị **${state.enemy.name}** húc văng khỏi tầng tháp!`,
        );

        return state;
    }

    if (state.turn >= state.maxTurns) {
        if (state.autoWin === true) {
            state.enemy.hp = 0;
            state.ended = true;
            state.isWin = true;

            state.logs.push(
                `🔥 Lực chiến vượt yêu cầu, **${state.player.name}** cưỡng ép phá tan phòng ngự của **${state.enemy.name}**!`,
            );

            state.logs.push(
                `🏆 **${state.player.name}** vượt tầng nhờ thực lực áp đảo!`,
            );

            return state;
        }

        state.ended = true;
        state.isWin = false;

        state.logs.push(
            `⏳ Hết **${state.maxTurns} hiệp**, **${state.player.name}** chưa thể đánh bại **${state.enemy.name}**.`,
        );

        return state;
    }

    state.turn += 1;

    return state;
}

async function runTowerCombatAnimation(message, state) {
    activeTowerBattles.set(state.id, state);

    try {
        while (!state.ended) {
            applyTowerCombatRound(state);

            const shouldEdit =
                state.ended ||
                state.turn === 2 ||
                state.turn % TOWER_EDIT_EVERY_TURNS === 0;

            if (!state.fastMode && shouldEdit) {
                await message.edit({
                    embeds: [buildTowerCombatEmbed(state)],

                    components: [
                        buildCombatButtons(state.userId, state.id, state.ended),
                    ],
                });
            }

            if (!state.ended) {
                if (state.fastMode) {
                    await new Promise((resolve) => setImmediate(resolve));
                } else {
                    await new Promise((resolve) =>
                        setTimeout(resolve, TOWER_TURN_DELAY_MS),
                    );
                }
            }
        }

        return state;
    } finally {
        activeTowerBattles.delete(state.id);
    }
}
async function handleFastCombatButton(interaction) {
    if (!interaction.customId.startsWith("tower_combat_fast_")) {
        return undefined;
    }

    const parts = interaction.customId.split("_");

    const userId = parts[3];

    const battleId = parts.slice(4).join("_");

    if (String(interaction.user.id) !== String(userId)) {
        return interaction.reply({
            content: "❌ Đây không phải trận leo tháp của bạn.",
            ephemeral: true,
        });
    }

    const state = activeTowerBattles.get(battleId);

    if (!state) {
        return interaction.reply({
            content: "❌ Trận đấu đã kết thúc hoặc không tồn tại.",
            ephemeral: true,
        });
    }

    if (state.ended) {
        return interaction.reply({
            content: "❌ Trận đấu đã kết thúc.",
            ephemeral: true,
        });
    }

    if (state.fastMode) {
        return interaction.reply({
            content: "⏩ Trận đấu đang được tua nhanh.",
            ephemeral: true,
        });
    }

    await interaction.deferUpdate();

    state.fastMode = true;

    state.logs.push("⏩ Người chơi đã chọn xem kết quả nhanh.");

    return undefined;
}

async function show(interaction) {
    const tower = ensureTowerProfile(interaction.user.id);
    const profile = ensureTuTienProfile(interaction.user.id);
    const cooldownLeft = Math.max(
        0,
        (tower.loseCooldownUntil || 0) - Date.now(),
    );

    return interaction.reply({
        embeds: [buildTowerEmbed(interaction, tower, profile)],
        components: [buildFightButton(interaction.user.id, cooldownLeft > 0)],
    });
}

function getActiveTowerBattleByUser(userId) {
    for (const battle of activeTowerBattles.values()) {
        if (battle.userId === userId && battle.ended !== true) {
            return battle;
        }
    }

    return null;
}

async function fight(interaction) {
    const parts = interaction.customId.split("_");
    const userId = parts[2];

    if (interaction.user.id !== userId) {
        return interaction.reply({
            content: "❌ Đây không phải tháp của bạn.",
            ephemeral: true,
        });
    }
    const activeBattle = getActiveTowerBattleByUser(userId);

    if (activeBattle) {
        return interaction.reply({
            content: "⚔️ Bạn đang có một trận leo tháp chưa kết thúc.",
            ephemeral: true,
        });
    }

    const tower = ensureTowerProfile(userId);
    const now = Date.now();
    const cooldownLeft = Math.max(0, (tower.loseCooldownUntil || 0) - now);

    if (cooldownLeft > 0) {
        return interaction.reply({
            content: `⏳ Bạn vừa thua, còn **${formatTimeLeft(cooldownLeft)}** mới được leo tiếp.`,
            ephemeral: true,
        });
    }

    await interaction.deferUpdate();

    const profile = ensureTuTienProfile(userId);

    const nextFloor = (tower.floor || 0) + 1;

    const monster = buildMonster(nextFloor);

    const playerPower = combat.calculateCombatPower(profile);

    const monsterPower = Math.max(
        1,
        Number(
            monster.power ||
                monster.recommendedPower ||
                monster.stats?.combatPower ||
                1,
        ),
    );

    const autoWin = playerPower >= monsterPower * 1.1;

    quest.trackQuestProgress(userId, "tower_challenge", 1);

    const state = createTowerBattleState(
        interaction,
        profile,
        monster,
        nextFloor,
        autoWin,
    );
    await interaction.message.edit({
        embeds: [buildTowerCombatEmbed(state)],
        components: [buildCombatButtons(userId, state.id, false)],
    });

    await runTowerCombatAnimation(interaction.message, state);

    const isWin = state.isWin === true;

    if (!isWin) {
        const updatedTower = updateTowerProfile(userId, (data) => {
            data.loseCooldownUntil = Date.now() + towerConfig.cooldownOnLoseMs;
            data.lastLoseAt = Date.now();
        });

        const resultText =
            `💀 **Thất bại tại tầng ${nextFloor}!**\n` +
            `Đạo hữu bị **${monster.name}** húc bay khỏi Tháp Mamu.\n\n` +
            `⏳ Trọng thương, cần **${formatTimeLeft(towerConfig.cooldownOnLoseMs)}** để hồi phục.\n` +
            `Còn lại: **${formatTimeLeft(updatedTower.loseCooldownUntil - Date.now())}**`;

        return interaction.message.edit({
            embeds: [buildTowerCombatEmbed(state, resultText)],
            components: [buildFightButton(userId, true)],
        });
    }

    let rewardText = "";
    let updatedTower;

    if (isChestFloor(nextFloor)) {
        const chest = getChestByFloor(nextFloor);
        const reward = getMoneyReward(nextFloor);
        const expReward = getTowerExpReward(nextFloor);
        const coin = getCurrencyEmoji();

        addMoney(userId, reward);
        addTuTienExp(userId, expReward);

        addInventoryItem(userId, {
            id: chest.id,
            name: chest.name,
            emoji: chest.emoji,
            type: "tower_chest",
            tier: chest.tier,
            value: 0,
            floor: nextFloor,
            description: "Rương nhận được khi leo tháp. Mở bằng /mophapbao.",
        });
        const phapBaoRewards = givePhapBaoFarmReward(userId, "tower", {
            rolls: 2,
            amountMultiplier: 1.25,
        });

        const phapBaoRewardText = phapBaoRewards
            .map(formatPhapBaoFarmReward)
            .filter(Boolean)
            .join("\n");

        updatedTower = updateTowerProfile(userId, (data) => {
            data.floor = nextFloor;
            data.highestFloor = Math.max(data.highestFloor || 0, nextFloor);
            data.totalChests = Number(data.totalChests || 0) + 1;
            data.totalEarned = Number(data.totalEarned || 0) + reward;
            data.loseCooldownUntil = 0;
        });

        rewardText =
            `${coin} Nhận: **${formatMoney(reward)}**\n` +
            `✨ Tu vi: **+${formatNumber(expReward)} exp**\n` +
            `${chest.emoji} **${chest.name}**\n` +
            `📦 Đã cất rương vào kho đồ. Mở bằng \`/mophapbao\`.` +
            `${phapBaoRewardText ? `\n${phapBaoRewardText}` : ""}`;
    } else {
        const reward = getMoneyReward(nextFloor);
        const expReward = getTowerExpReward(nextFloor);
        const coin = getCurrencyEmoji();

        addMoney(userId, reward);
        addTuTienExp(userId, expReward);

        updatedTower = updateTowerProfile(userId, (data) => {
            data.floor = nextFloor;
            data.highestFloor = Math.max(data.highestFloor || 0, nextFloor);
            data.totalEarned = Number(data.totalEarned || 0) + reward;
            data.loseCooldownUntil = 0;
        });

        rewardText = `${coin} Nhận: **${formatMoney(reward)}**\n✨ Tu vi: **+${formatNumber(expReward)} exp**`;
    }
    const nextNextFloor = nextFloor + 1;
    const nextMonster = buildMonster(nextNextFloor);

    const resultText =
        `🏆 **Vượt tầng ${nextFloor} thành công!**\n` +
        `Đạo hữu đã đạp nát mặt heo của **${monster.name}**.\n\n` +
        `🎁 Phần thưởng:\n${rewardText}\n\n` +
        `🚪 Tầng tiếp theo: **${nextNextFloor}**\n` +
        `⚔️ Lực chiến quái tầng sau: **${formatNumber(nextMonster.power)}**\n` +
        `🐷 Thắng thì có thể húc tiếp ngay.`;

    return interaction.message.edit({
        embeds: [buildTowerCombatEmbed(state, resultText)],
        components: [buildFightButton(userId, false)],
    });
}

async function handleButton(interaction) {
    if (interaction.customId.startsWith("tower_combat_fast_")) {
        return handleFastCombatButton(interaction);
    }

    if (!interaction.customId.startsWith("tower_fight_")) {
        return undefined;
    }

    return fight(interaction);
}

module.exports = {
    show,
    handleButton,
};
