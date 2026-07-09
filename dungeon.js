const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");

const {
    addMoney,
    addShopItem,
    ensureTuTienProfile,
    updateTuTienProfile,
    getDungeonProfile,
    updateDungeonProfile,
    formatMoney,
    getCurrencyEmoji,
    getShop,
} = require("./database");

const dungeonConfig = require("./config/dungeon");
const quest = require("./quest");
const combat = require("./utils/combat");
const bicanh = require("./bicanh");

function formatNumber(number) {
    return Number(number || 0).toLocaleString("vi-VN");
}

function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
}

function randomInt(min, max) {
    return Math.floor(randomBetween(min, max + 1));
}

function getStage(stageId) {
    return dungeonConfig.stages.find((stage) => stage.id === stageId);
}

function buildMonster(stage) {
    const monsterConfig = stage.monster || {};

    const power = Math.max(
        1,
        Number(stage.requiredPower || monsterConfig.power || 1),
    );

    const atk = Math.max(
        1,
        Math.floor(power * Number(monsterConfig.atkMultiplier || 0.45)),
    );

    const defense = Math.max(
        0,
        Math.floor(power * Number(monsterConfig.defenseMultiplier || 0.25)),
    );

    const hp = Math.max(
        1,
        Math.floor(power * Number(monsterConfig.hpMultiplier || 5)),
    );

    const speed = Math.max(
        1,
        Math.floor(Number(monsterConfig.speedBase || 50)),
    );

    return combat.createCombatantFromStats({
        id: `dungeon_monster_${stage.id}`,

        name: monsterConfig.name || `Quái ải ${stage.id}`,

        type: "dungeon_monster",

        combatPower: power,

        atk,
        defense,
        hp,
        speed,

        critChance: Number(monsterConfig.critChance || 0.05),

        dodgeChance: Number(monsterConfig.dodgeChance || 0),

        damageReduction: Number(monsterConfig.damageReduction || 0),

        skills: monsterConfig.skills || [],

        metadata: {
            stageId: stage.id,
            stageName: stage.name,
        },
    });
}

function calculateDungeonWinRate(playerPower, recommendedPower) {
    const player = Math.max(0, Number(playerPower || 0));

    const recommended = Math.max(1, Number(recommendedPower || 1));

    const powerRatio = player / recommended;

    if (powerRatio >= 1.1) {
        return {
            autoWin: true,
            winRate: 1,
            powerRatio,
        };
    }

    if (powerRatio < 0.7) {
        return {
            autoWin: false,
            winRate: 0,
            powerRatio,
        };
    }

    let winRate;

    if (powerRatio < 1) {
        const progress = (powerRatio - 0.7) / 0.3;

        winRate = 0.1 + Math.pow(progress, 1.5) * 0.65;
    } else {
        const progress = (powerRatio - 1) / 0.1;

        winRate = 0.75 + progress * 0.2;
    }

    return {
        autoWin: false,
        winRate: Math.max(0, Math.min(0.95, winRate)),
        powerRatio,
    };
}

function pickWeightedDrop(drops) {
    const totalChance = drops.reduce((total, drop) => {
        return total + Number(drop.chance || 0);
    }, 0);

    let value = Math.random() * totalChance;

    for (const drop of drops) {
        value -= Number(drop.chance || 0);

        if (value <= 0) {
            return drop;
        }
    }

    return drops[drops.length - 1];
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
function giveReward(userId, reward) {
    const shop = getShop();
    const lines = [];
    const money = Number(reward.money || 0);
    const exp = Number(reward.exp || 0);

    if (money > 0) {
        addMoney(userId, money);
        lines.push(`💰 ${formatMoney(money)}`);
    }

    const gainedExp = addTuTienExp(userId, exp);

    if (gainedExp > 0) {
        lines.push(`✨ Tu vi +${formatNumber(gainedExp)} exp`);
    }

    const items = Array.isArray(reward.items) ? reward.items : [];

    items.forEach((entry) => {
        const item = shop[entry.itemId];
        const amount = Number(entry.amount || 1);

        if (!item) {
            lines.push(`❓ ${entry.itemId} x${amount}`);
            return;
        }

        addShopItem(userId, entry.itemId, amount);
        lines.push(`${item.emoji || "🎁"} ${item.name} x${amount}`);
    });

    return lines;
}

function buildSweepReward(stage) {
    const moneyRange = stage.sweepReward.money || [0, 0];
    const money = randomInt(
        Number(moneyRange[0] || 0),
        Number(moneyRange[1] || 0),
    );
    const drop = pickWeightedDrop(stage.sweepReward.drops || []);

    return {
        money,
        exp: Number(stage.sweepReward.exp || 0),
        items: drop
            ? [
                  {
                      itemId: drop.itemId,
                      amount: Number(drop.amount || 1),
                  },
              ]
            : [],
    };
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

function createDungeonButtons(userId, dungeon) {
    const canSweep = Number(dungeon.highestClearedStage || 0) > 0;
    const isSweepCooling = Number(dungeon.sweepCooldownUntil || 0) > Date.now();

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`dungeon_challenge_${userId}`)
            .setLabel("Khiêu chiến ải kế tiếp")
            .setEmoji("⚔️")
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId(`dungeon_sweep_${userId}`)
            .setLabel("Càn quét ải đã clear")
            .setEmoji("🧹")
            .setStyle(ButtonStyle.Success)
            .setDisabled(!canSweep || isSweepCooling),
    );
}

function getRewardPreview(reward) {
    const shop = getShop();
    const lines = [];

    if (reward.money) {
        lines.push(`💰 ${formatMoney(reward.money)}`);
    }

    const items = Array.isArray(reward.items) ? reward.items : [];

    items.forEach((entry) => {
        const item = shop[entry.itemId];
        const amount = Number(entry.amount || 1);

        lines.push(
            `${item?.emoji || "🎁"} ${item?.name || entry.itemId} x${amount}`,
        );
    });

    return lines.length > 0 ? lines.join("\n") : "Không có thưởng.";
}

function getSweepPreview(stage) {
    const shop = getShop();
    const money = stage.sweepReward.money || [0, 0];

    const drops = (stage.sweepReward.drops || []).map((drop) => {
        const item = shop[drop.itemId];

        return (
            `${item?.emoji || "🎁"} ${item?.name || drop.itemId} x${drop.amount || 1} ` +
            `(${Number(drop.chance || 0)}%)`
        );
    });

    return (
        `💰 ${formatMoney(money[0])} - ${formatMoney(money[1])}\n` +
        drops.join("\n")
    );
}

function formatDungeonAction(actorName, action) {
    const lines = [];

    if (!action?.success) {
        lines.push(
            `❌ **${actorName}** không thể hành động: ${action?.reason || "không rõ"}.`,
        );

        return lines;
    }

    if (action.startEffects?.poisonDamage > 0) {
        lines.push(
            `☠️ **${actorName}** chịu **${formatNumber(
                action.startEffects.poisonDamage,
            )}** sát thương độc.`,
        );
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

        const skillLvText =
            result.skillLevel && result.skillLevel > 1
                ? ` Lv.${result.skillLevel} (+${result.skillEffectBonusPercent || 0}% hiệu lực)`
                : "";

        lines.push(
            `✨ **${actorName}** thi triển **${result.skillName}${skillLvText}**, gây **${formatNumber(
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

function simulateFight(profile, stage, forcedResult = null) {
    const player = combat.createCombatant(profile, {
        name: "Bạn",
    });

    const monster = buildMonster(stage);

    const logs = [];

    const maxRounds = Math.max(1, Number(dungeonConfig.maxCombatTurns || 8));

    let rounds = 0;

    for (let round = 1; round <= maxRounds; round += 1) {
        rounds = round;

        const playerSpeed = combat.getEffectiveSpeed(player);

        const monsterSpeed = combat.getEffectiveSpeed(monster);

        const turnOrder =
            playerSpeed >= monsterSpeed
                ? [
                      {
                          actor: player,
                          target: monster,
                          isPlayer: true,
                      },
                      {
                          actor: monster,
                          target: player,
                          isPlayer: false,
                      },
                  ]
                : [
                      {
                          actor: monster,
                          target: player,
                          isPlayer: false,
                      },
                      {
                          actor: player,
                          target: monster,
                          isPlayer: true,
                      },
                  ];

        logs.push(`**— Hiệp ${round} —**`);

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
                    ? Number(dungeonConfig.activeSkillTriggerChance || 0.65)
                    : Number(dungeonConfig.monsterSkillTriggerChance || 0.45),

                allowCounter: true,
                allowRevive: true,
            });

            logs.push(...formatDungeonAction(turn.actor.name, action));

            if (!combat.isCombatantAlive(turn.target)) {
                /*
                 * Nếu kết quả đã được quyết định bằng lực chiến/tỉ lệ,
                 * không cho combat animation đi ngược kết quả đó.
                 */

                if (forcedResult === true && turn.target === player) {
                    player.hp = 1;

                    logs.push(
                        "🔥 Nhờ lực chiến áp đảo, bạn miễn cưỡng trụ lại với **1 HP**.",
                    );

                    continue;
                }

                if (forcedResult === false && turn.target === monster) {
                    monster.hp = 1;

                    logs.push(
                        `👹 **${monster.name}** cuồng hóa và miễn cưỡng trụ lại với **1 HP**.`,
                    );

                    continue;
                }

                break;
            }
        }

        logs.push(
            `> ❤️ Bạn: **${formatNumber(player.hp)}/${formatNumber(
                player.stats.maxHp,
            )}**` +
                (player.shield > 0
                    ? ` | 🛡️ ${formatNumber(player.shield)}`
                    : ""),
        );

        logs.push(
            `> 👹 ${monster.name}: **${formatNumber(monster.hp)}/${formatNumber(
                monster.stats.maxHp,
            )}**` +
                (monster.shield > 0
                    ? ` | 🛡️ ${formatNumber(monster.shield)}`
                    : ""),
        );

        if (
            !combat.isCombatantAlive(player) ||
            !combat.isCombatantAlive(monster)
        ) {
            break;
        }
    }

    let isWin =
        combat.isCombatantAlive(player) && !combat.isCombatantAlive(monster);

    if (forcedResult === true) {
        isWin = true;

        player.hp = Math.max(1, Number(player.hp || 0));

        monster.hp = 0;

        logs.push(
            `🏆 Với thực lực vượt trội, bạn đã trấn áp và hạ gục **${monster.name}**.`,
        );
    } else if (forcedResult === false) {
        isWin = false;

        player.hp = 0;

        monster.hp = Math.max(1, Number(monster.hp || 0));

        logs.push(`💀 **${monster.name}** đã áp đảo và đánh bại bạn.`);
    } else if (isWin) {
        logs.push(`🏆 Bạn đã hạ gục **${monster.name}**.`);
    } else if (!combat.isCombatantAlive(player)) {
        logs.push(`💀 Bạn đã bị **${monster.name}** đánh bại.`);
    } else {
        logs.push(
            `⏳ Hết **${maxRounds} hiệp**, bạn chưa thể hạ gục **${monster.name}**.`,
        );
    }

    return {
        isWin,

        player,
        monster,

        playerStats: player.stats,

        playerHp: player.hp,

        monsterHp: monster.hp,

        rounds,
        logs,
    };
}
function buildDungeonHomeEmbed(interaction, profile, dungeon) {
    const nextStageId = Number(dungeon.highestClearedStage || 0) + 1;
    const nextStage = getStage(nextStageId);
    const currentStage = getStage(Number(dungeon.highestClearedStage || 0));
    const playerPower = profile.rootId
        ? combat.calculateCombatPower(profile)
        : 0;
    const nextMonsterPower = nextStage
        ? Number(nextStage.requiredPower || nextStage.monster?.power || 0)
        : 0;
    const powerDiff = playerPower - nextMonsterPower;
    const winData = nextStage
        ? calculateDungeonWinRate(playerPower, nextMonsterPower)
        : {
              autoWin: false,
              winRate: 0,
          };

    const estimatedWinRate = winData.autoWin
        ? 100
        : Math.floor(winData.winRate * 100);

    const now = Date.now();
    const sweepCooldownLeft = Math.max(
        0,
        Number(dungeon.sweepCooldownUntil || 0) - now,
    );

    const sweepText =
        dungeon.highestClearedStage > 0 && currentStage
            ? sweepCooldownLeft > 0
                ? `⏳ Càn quét còn cooldown: **${formatTimeLeft(sweepCooldownLeft)}**`
                : `✅ Có thể càn quét ải **${currentStage.id} - ${currentStage.name}**`
            : "❌ Chưa clear ải nào để càn quét.";

    const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle("🧭 PHÓ BẢN MAMU")
        .setThumbnail(interaction.user.displayAvatarURL())
        .setDescription(
            `👤 Đạo hữu: **${interaction.member?.displayName || interaction.user.username}**\n` +
                `🏆 Ải cao nhất đã clear: **${formatNumber(dungeon.highestClearedStage || 0)}**\n` +
                `⚔️ Chiến lực hiện tại: **${formatNumber(playerPower)}**\n\n` +
                `${nextStage ? `## ${nextStage.emoji} Ải kế tiếp: ${nextStage.id} - ${nextStage.name}\n` : "## 🎉 Bạn đã clear hết phó bản hiện tại.\n"}` +
                `${nextStage ? `👹 Quái: **${nextStage.monster.name}**\n` : ""}` +
                `${nextStage ? `💪 Lực chiến đề nghị: **${formatNumber(nextStage.requiredPower)}**\n` : ""}` +
                `${
                    nextStage
                        ? `🎲 Tỉ lệ thắng ước tính: **${estimatedWinRate}%**\n\n`
                        : ""
                }` +
                `${nextStage ? `🎁 **Thưởng clear lần đầu:**\n${getRewardPreview(nextStage.firstClearReward)}\n\n` : ""}` +
                `🧹 **Càn quét:**\n${sweepText}\n\n` +
                `${currentStage ? `🎒 **Quà càn quét ải ${currentStage.id}:**\n${getSweepPreview(currentStage)}` : ""}`,
        )
        .setFooter({
            text: "Khiêu chiến ải mới có random thắng/thua. Càn quét auto thắng nhưng có cooldown chung.",
        })
        .setTimestamp();

    return embed;
}

class DungeonManager {
    async show(interaction) {
        const profile = ensureTuTienProfile(interaction.user.id);
        const dungeon = getDungeonProfile(interaction.user.id);

        if (!profile.rootId) {
            return interaction.reply({
                content:
                    "❌ Bạn chưa thức tỉnh linh căn nên chưa thể đi phó bản.",
                ephemeral: true,
            });
        }

        return interaction.reply({
            embeds: [buildDungeonHomeEmbed(interaction, profile, dungeon)],
            components: [createDungeonButtons(interaction.user.id, dungeon)],
        });
    }

    async handleButton(interaction) {
        if (!interaction.customId.startsWith("dungeon_")) {
            return undefined;
        }

        const parts = interaction.customId.split("_");
        const action = parts[1];
        const userId = parts[2];

        if (interaction.user.id !== userId) {
            return interaction.reply({
                content: "❌ Đây không phải phó bản của bạn.",
                ephemeral: true,
            });
        }

        if (action === "challenge") {
            return this.challenge(interaction);
        }

        if (action === "sweep") {
            return this.sweep(interaction);
        }

        return undefined;
    }

    async challenge(interaction) {
        const profile = ensureTuTienProfile(interaction.user.id);
        const dungeon = getDungeonProfile(interaction.user.id);

        if (!profile.rootId) {
            return interaction.reply({
                content:
                    "❌ Bạn chưa thức tỉnh linh căn nên chưa thể đi phó bản.",
                ephemeral: true,
            });
        }

        const nextStageId = Number(dungeon.highestClearedStage || 0) + 1;
        const stage = getStage(nextStageId);

        if (!stage) {
            return interaction.reply({
                content:
                    "🎉 Bạn đã clear hết phó bản hiện tại. Chờ update thêm ải mới.",
                ephemeral: true,
            });
        }

        const playerPower = combat.calculateCombatPower(profile);

        const recommendedPower = Math.max(
            1,
            Number(stage.requiredPower || stage.monster?.power || 1),
        );

        const powerDiff = playerPower - recommendedPower;

        const winData = calculateDungeonWinRate(playerPower, recommendedPower);

        const autoWin = winData.autoWin;

        const winRate = winData.winRate;
        const estimatedWinRate = autoWin ? 100 : Math.floor(winRate * 100);

        /*
         * Trên 110% lực chiến đề nghị:
         * chắc chắn thắng.
         *
         * Dưới 110%:
         * random theo tỉ lệ đã tính.
         */
        const rolledWin = autoWin || Math.random() < winRate;

        /*
         * Truyền kết quả đã roll vào combat
         * để animation và phần thưởng không lệch nhau.
         */
        const fight = simulateFight(profile, stage, rolledWin);

        const isWin = rolledWin;
        const fullFightLog = fight.logs.join("\n");

        const fightLog =
            fullFightLog.length > 2600
                ? `${fullFightLog.slice(0, 2600)}\n... *(diễn biến đã được rút gọn)*`
                : fullFightLog;

        let rewardLines = [];

        if (isWin) {
            rewardLines = giveReward(
                interaction.user.id,
                stage.firstClearReward,
            );

            updateDungeonProfile(interaction.user.id, (data) => {
                data.highestClearedStage = Math.max(
                    Number(data.highestClearedStage || 0),
                    stage.id,
                );
                data.totalChallenges += 1;
                data.totalWins += 1;
                data.stageClears[String(stage.id)] =
                    Number(data.stageClears[String(stage.id)] || 0) + 1;
            });

            quest.trackQuestProgress(interaction.user.id, "dungeon_clear", 1);
        } else {
            updateDungeonProfile(interaction.user.id, (data) => {
                data.totalChallenges += 1;
                data.totalLosses += 1;
            });
        }
        let secretRealm = null;

        if (isWin) {
            try {
                secretRealm = await bicanh.tryTrigger(
                    interaction,
                    "dungeonClear",
                );
            } catch (error) {
                console.error("[BiCanh Trigger - Dungeon Clear]", error);
            }
        }

        const secretRealmText = secretRealm
            ? `\n\n🌌 **CƠ DUYÊN XUẤT HIỆN!**\n` +
              `Bạn phát hiện một Bí Cảnh Hữu Duyên tại <#${secretRealm.channelId}>.`
            : "";
        const embed = new EmbedBuilder()
            .setColor(isWin ? 0x2ecc71 : 0xe74c3c)
            .setTitle(
                isWin
                    ? `✅ CLEAR LẦN ĐẦU ẢI ${stage.id}`
                    : `💀 THẤT BẠI ẢI ${stage.id}`,
            )
            .setDescription(
                `${stage.emoji} **${stage.name}**\n` +
                    `👹 Đối thủ: **${fight.monster.name}**\n\n` +
                    `⚔️ Chiến lực của bạn: **${formatNumber(playerPower)}**\n` +
                    `💪 Lực chiến đề nghị: **${formatNumber(stage.requiredPower)}**\n` +
                    `⚖️ Chênh lệch lực chiến: **${formatNumber(powerDiff)}**\n` +
                    `🎲 Tỉ lệ thắng ước tính: **${estimatedWinRate}%**\n` +
                    `📜 **Diễn biến:**\n${fightLog}\n\n` +
                    (isWin
                        ? `🎁 **Thưởng clear lần đầu:**\n${rewardLines.join("\n")}` +
                          secretRealmText
                        : `🐷 Mamu cười khẩy: **"Mạnh hơn đề nghị chưa chắc đã qua đâu con lợn."**\n\nBạn có thể càn quét ải đã clear để farm tài nguyên.`),
            )
            .setTimestamp();

        const newDungeon = getDungeonProfile(interaction.user.id);

        return interaction.update({
            embeds: [embed],
            components: [createDungeonButtons(interaction.user.id, newDungeon)],
        });
    }

    async sweep(interaction) {
        const profile = ensureTuTienProfile(interaction.user.id);
        const dungeon = getDungeonProfile(interaction.user.id);

        if (!profile.rootId) {
            return interaction.reply({
                content:
                    "❌ Bạn chưa thức tỉnh linh căn nên chưa thể càn quét.",
                ephemeral: true,
            });
        }

        const now = Date.now();
        const cooldownLeft = Number(dungeon.sweepCooldownUntil || 0) - now;

        if (cooldownLeft > 0) {
            return interaction.reply({
                content: `⏳ Càn quét đang cooldown. Quay lại sau **${formatTimeLeft(cooldownLeft)}**.`,
                ephemeral: true,
            });
        }

        const stageId = Number(dungeon.highestClearedStage || 0);

        if (stageId <= 0) {
            return interaction.reply({
                content: "❌ Bạn chưa clear ải nào để càn quét.",
                ephemeral: true,
            });
        }

        const stage = getStage(stageId);

        if (!stage) {
            return interaction.reply({
                content: "❌ Không tìm thấy ải để càn quét.",
                ephemeral: true,
            });
        }

        const reward = buildSweepReward(stage);
        const rewardLines = giveReward(interaction.user.id, reward);
        const cooldownMs =
            Number(dungeonConfig.sweepCooldownMinutes || 30) * 60 * 1000;

        updateDungeonProfile(interaction.user.id, (data) => {
            data.sweepCooldownUntil = Date.now() + cooldownMs;
            data.totalSweeps += 1;
            data.stageClears[String(stage.id)] =
                Number(data.stageClears[String(stage.id)] || 0) + 1;
        });
        quest.trackQuestProgress(interaction.user.id, "dungeon_clear", 1);

        let secretRealm = null;

        try {
            secretRealm = await bicanh.tryTrigger(interaction, "dungeonSweep");
        } catch (error) {
            console.error("[BiCanh Trigger - Dungeon Sweep]", error);
        }

        const newDungeon = getDungeonProfile(interaction.user.id);
        const coin = getCurrencyEmoji();
        const secretRealmText = secretRealm
            ? `\n\n🌌 **CƠ DUYÊN XUẤT HIỆN!**\n` +
              `Bạn phát hiện một Bí Cảnh Hữu Duyên tại <#${secretRealm.channelId}>.`
            : "";

        const embed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle(`🧹 CÀN QUÉT THÀNH CÔNG ẢI ${stage.id}`)
            .setDescription(
                `${stage.emoji} **${stage.name}**\n\n` +
                    `Bạn đã từng clear ải này nên càn quét **auto thắng**.\n` +
                    `Ải càng cao, quà càn quét càng ngon.\n\n` +
                    `🎁 **Nhận được:**\n${rewardLines.join("\n")}\n\n` +
                    `⏳ Cooldown càn quét chung: **${dungeonConfig.sweepCooldownMinutes} phút**\n` +
                    `${coin} Item mở ra nếu không dùng có thể bán lại theo tỉ lệ shop.` +
                    `${secretRealmText}`,
            )
            .setTimestamp();

        return interaction.update({
            embeds: [embed],
            components: [createDungeonButtons(interaction.user.id, newDungeon)],
        });
    }
}

module.exports = new DungeonManager();
