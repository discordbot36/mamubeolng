const { EmbedBuilder } = require("discord.js");

const database = require("./database");
const alchemyConfig = require("./config/luyendan");
const beastConfig = require("./config/sanyeuthu");
const tuTienConfig = require("./config/tutien");
const shopConfig = require("./config/shop");

const processingUsers = new Set();

function formatNumber(value) {
    return Number(value || 0).toLocaleString("vi-VN");
}

function clampInteger(value, min, max) {
    return Math.max(
        min,
        Math.min(
            max,
            Math.floor(Number(value || min)),
        ),
    );
}

function roll(chance) {
    return Math.random() < Math.max(
        0,
        Math.min(1, Number(chance || 0)),
    );
}

function getRecipe(recipeId) {
    return alchemyConfig.recipes[String(recipeId || "")] || null;
}

function getFurnace(level) {
    return (
        alchemyConfig.furnaces[
            clampInteger(
                level,
                1,
                alchemyConfig.maxFurnaceLevel,
            )
        ] || alchemyConfig.furnaces[1]
    );
}

function getQuality(qualityLevel) {
    return (
        alchemyConfig.qualities[
            clampInteger(qualityLevel, 1, 4)
        ] || alchemyConfig.qualities[1]
    );
}

function getAlchemyTitle(level) {
    return (
        alchemyConfig.titles[
            clampInteger(
                level,
                1,
                alchemyConfig.maxAlchemyLevel,
            )
        ] || "Học Đồ Luyện Đan"
    );
}

function getRequiredExpForLevel(level) {
    return Number(
        alchemyConfig.levelExp[
            clampInteger(
                level,
                1,
                alchemyConfig.maxAlchemyLevel,
            )
        ] || 0,
    );
}

function refreshAlchemyLevel(profile) {
    let newLevel = 1;

    for (
        let level = 1;
        level <= alchemyConfig.maxAlchemyLevel;
        level += 1
    ) {
        const requiredExp = getRequiredExpForLevel(level);

        if (Number(profile.exp || 0) >= requiredExp) {
            newLevel = level;
        }
    }

    profile.level = newLevel;

    return newLevel;
}

function getMaterialName(materialId) {
    const material = beastConfig.materials[materialId];

    if (!material) {
        return `📦 ${materialId}`;
    }

    return `${material.emoji || "📦"} ${material.name}`;
}

function formatMaterials(materials = {}, multiplier = 1) {
    const lines = Object.entries(materials).map(
        ([materialId, amount]) => {
            return (
                `${getMaterialName(materialId)} ×` +
                `${formatNumber(Number(amount || 0) * multiplier)}`
            );
        },
    );

    return lines.length > 0
        ? lines.join("\n")
        : "Không cần nguyên liệu";
}

function getOwnedPillAmount(
    profile,
    recipeId,
    qualityLevel = 1,
) {
    const recipe = getRecipe(recipeId);

    if (!recipe) {
        return 0;
    }

    /*
     * Đan shop được lưu thẳng trong user.inventory,
     * không lưu tại alchemyProfile.pills.
     */
    if (recipe.type === "shop_item") {
        return 0;
    }

    return Number(
        profile.pills?.[recipeId]?.[
            String(qualityLevel)
        ] || 0,
    );
}

function addCustomPill(
    profile,
    recipeId,
    qualityLevel,
    amount = 1,
) {
    if (!profile.pills[recipeId]) {
        profile.pills[recipeId] = {};
    }

    const qualityKey = String(qualityLevel);

    profile.pills[recipeId][qualityKey] =
        Number(
            profile.pills[recipeId][qualityKey] || 0,
        ) + Number(amount || 0);
}

function removeCustomPill(
    profile,
    recipeId,
    qualityLevel,
    amount = 1,
) {
    const qualityKey = String(qualityLevel);
    const current = Number(
        profile.pills?.[recipeId]?.[qualityKey] || 0,
    );

    if (current < amount) {
        return false;
    }

    profile.pills[recipeId][qualityKey] =
        current - amount;

    if (
        profile.pills[recipeId][qualityKey] <= 0
    ) {
        delete profile.pills[recipeId][qualityKey];
    }

    if (
        Object.keys(
            profile.pills[recipeId] || {},
        ).length <= 0
    ) {
        delete profile.pills[recipeId];
    }

    return true;
}

function rollQuality(furnaceLevel) {
    const furnace = getFurnace(furnaceLevel);
    const maxQuality = clampInteger(
        furnace.maxQuality,
        1,
        4,
    );

    const candidates = [];

    for (
        let qualityLevel = 1;
        qualityLevel <= maxQuality;
        qualityLevel += 1
    ) {
        candidates.push({
            level: qualityLevel,
            weight: Number(
                alchemyConfig.qualityRates[
                    qualityLevel
                ] || 0,
            ),
        });
    }

    const totalWeight = candidates.reduce(
        (total, entry) =>
            total + entry.weight,
        0,
    );

    let value = Math.random() * totalWeight;

    for (const candidate of candidates) {
        value -= candidate.weight;

        if (value <= 0) {
            return candidate.level;
        }
    }

    return candidates[0]?.level || 1;
}

function getCurrentRealmMaxExp(profile) {
    const realmIndex = clampInteger(
        profile.realmIndex || 0,
        0,
        tuTienConfig.realms.length - 1,
    );

    return Math.max(
        1,
        Number(
            tuTienConfig.realms[realmIndex]?.maxExp ||
                1,
        ),
    );
}

function autoAdvanceCultivationFloors(profile) {
    profile.realmIndex = clampInteger(
        profile.realmIndex || 0,
        0,
        tuTienConfig.realms.length - 1,
    );

    profile.floor = clampInteger(
        profile.floor || 1,
        1,
        10,
    );

    profile.exp = Math.max(
        0,
        Number(profile.exp || 0),
    );

    let maxExp =
        getCurrentRealmMaxExp(profile);

    while (
        profile.floor < 10 &&
        profile.exp >= maxExp
    ) {
        profile.exp -= maxExp;
        profile.floor += 1;
        maxExp =
            getCurrentRealmMaxExp(profile);
    }

    /*
     * Đã tầng 10 thì chỉ giữ tối đa lượng tu vi
     * cần để đột phá, không cho tích vượt vô hạn.
     */
    if (
        profile.floor >= 10 &&
        profile.exp > maxExp
    ) {
        profile.exp = maxExp;
    }
}

function buildProfileEmbed(userId) {
    const profile =
        database.getAlchemyProfile(userId);

    refreshAlchemyLevel(profile);

    const furnace =
        getFurnace(profile.furnaceLevel);

    const currentLevel =
        Number(profile.level || 1);

    const nextLevel =
        Math.min(
            alchemyConfig.maxAlchemyLevel,
            currentLevel + 1,
        );

    const nextExp =
        currentLevel >=
        alchemyConfig.maxAlchemyLevel
            ? "MAX"
            : formatNumber(
                  getRequiredExpForLevel(
                      nextLevel,
                  ),
              );

    const pillLines = [];

    for (
        const [recipeId, qualities]
        of Object.entries(
            profile.pills || {},
        )
    ) {
        const recipe = getRecipe(recipeId);

        if (!recipe) {
            continue;
        }

        for (
            const [qualityLevel, amount]
            of Object.entries(
                qualities || {},
            )
        ) {
            if (Number(amount || 0) <= 0) {
                continue;
            }

            const quality =
                getQuality(qualityLevel);

            pillLines.push(
                `${recipe.emoji} ${quality.emoji} ` +
                    `**${recipe.name} — ${quality.name}** ×` +
                    `${formatNumber(amount)}`,
            );
        }
    }

    return new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle("🔥 HỒ SƠ LUYỆN ĐAN SƯ")
        .setDescription(
            `Danh hiệu: **${getAlchemyTitle(currentLevel)}**\n` +
                `Cấp nghề: **${currentLevel}/${alchemyConfig.maxAlchemyLevel}**\n` +
                `EXP nghề: **${formatNumber(profile.exp)}/${nextExp}**\n\n` +
                `${furnace.emoji} Đan lô: **${furnace.name}**\n` +
                `Độ bền: **${formatNumber(profile.furnaceDurability)}/${formatNumber(furnace.maxDurability)}**\n` +
                `Thưởng thành công: **+${Math.floor(furnace.successBonus * 100)}%**\n` +
                `Phẩm tối đa: **${getQuality(furnace.maxQuality).name}**`,
        )
        .addFields(
            {
                name: "📊 Thành tích",
                value:
                    `Đã luyện: **${formatNumber(profile.totalCrafted)}**\n` +
                    `Thành công: **${formatNumber(profile.totalSucceeded)}**\n` +
                    `Thất bại: **${formatNumber(profile.totalFailed)}**\n` +
                    `Nổ lò: **${formatNumber(profile.totalExploded)}**\n` +
                    `Dược tra: **${formatNumber(profile.medicineResidue)}**`,
                inline: true,
            },
            {
                name: "📆 Giới hạn hôm nay",
                value:
                    `Đan tu vi: **${formatNumber(profile.daily.cultivationPillsUsed)}/${alchemyConfig.dailyCultivationPillLimit}**\n` +
                    `Hồi lượt săn: **${formatNumber(profile.daily.huntRunPillsUsed)}/${alchemyConfig.dailyHuntRunPillLimit}**`,
                inline: true,
            },
            {
                name: "🧪 Kho đan tự luyện",
                value:
                    pillLines.length > 0
                        ? pillLines.slice(0, 20).join("\n")
                        : "Chưa có đan dược.",
            },
        )
        .setTimestamp();
}

function buildRecipesEmbed(userId) {
    const profile =
        database.getAlchemyProfile(userId);

    refreshAlchemyLevel(profile);

    const unlocked = [];
    const locked = [];

    for (
        const recipe
        of Object.values(
            alchemyConfig.recipes,
        )
    ) {
        const available =
            Number(profile.level || 1) >=
                Number(
                    recipe.requiredAlchemyLevel ||
                        1,
                ) &&
            Number(profile.furnaceLevel || 1) >=
                Number(
                    recipe.requiredFurnaceLevel ||
                        1,
                );

        const text =
            `${recipe.emoji} **${recipe.name}** ` +
            `(\`${recipe.id}\`)\n` +
            `Cần nghề Lv.${recipe.requiredAlchemyLevel} • ` +
            `Lò Lv.${recipe.requiredFurnaceLevel} • ` +
            `Tỉ lệ gốc ${Math.floor(recipe.baseSuccessRate * 100)}%\n` +
            `${formatMaterials(recipe.materials)}\n` +
            `💰 Phí: ${formatNumber(recipe.craftMoney)}`;

        if (available) {
            unlocked.push(text);
        } else {
            locked.push(text);
        }
    }

    return new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("📖 ĐAN PHƯƠNG")
        .setDescription(
            unlocked.length > 0
                ? unlocked.join("\n\n").slice(0, 4000)
                : "Bạn chưa mở khóa công thức nào.",
        )
        .addFields({
            name: "🔒 Chưa mở khóa",
            value:
                locked.length > 0
                    ? locked
                          .map((entry) =>
                              entry.split("\n")[0],
                          )
                          .join("\n")
                          .slice(0, 1000)
                    : "Đã mở toàn bộ công thức.",
        })
        .setFooter({
            text:
                "Dùng /luyendan hanhdong:luyen dan:<id> để khai lò",
        })
        .setTimestamp();
}

function craftPills(userId, recipeId, quantity) {
    const recipe = getRecipe(recipeId);

    if (!recipe) {
        return {
            success: false,
            message:
                "Không tìm thấy đan phương này.",
        };
    }

    const safeQuantity =
        clampInteger(quantity, 1, 10);

    return database.updateAlchemyProfile(
        userId,
        (
            profile,
            user,
            beastMaterials,
        ) => {
            refreshAlchemyLevel(profile);

            const furnace =
                getFurnace(
                    profile.furnaceLevel,
                );

            if (
                profile.level <
                recipe.requiredAlchemyLevel
            ) {
                return {
                    success: false,
                    message:
                        `Cần Luyện Đan Sư cấp ` +
                        `${recipe.requiredAlchemyLevel}.`,
                };
            }

            if (
                profile.furnaceLevel <
                recipe.requiredFurnaceLevel
            ) {
                return {
                    success: false,
                    message:
                        `Cần đan lô cấp ` +
                        `${recipe.requiredFurnaceLevel}.`,
                };
            }

            const durabilityCost =
                Number(
                    recipe.furnaceDurabilityCost ||
                        1,
                ) * safeQuantity;

            if (
                Number(
                    profile.furnaceDurability ||
                        0,
                ) < durabilityCost
            ) {
                return {
                    success: false,
                    message:
                        `Đan lô không đủ độ bền. ` +
                        `Cần ${durabilityCost}, hiện có ` +
                        `${profile.furnaceDurability}.`,
                };
            }

            const totalMoney =
                Number(
                    recipe.craftMoney || 0,
                ) * safeQuantity;

            if (
                Number(user.money || 0) <
                totalMoney
            ) {
                return {
                    success: false,
                    message:
                        `Không đủ tiền khai lò. Cần ` +
                        `${formatNumber(totalMoney)}.`,
                };
            }

            for (
                const [materialId, amount]
                of Object.entries(
                    recipe.materials || {},
                )
            ) {
                const required =
                    Number(amount || 0) *
                    safeQuantity;

                if (
                    Number(
                        beastMaterials[
                            materialId
                        ] || 0,
                    ) < required
                ) {
                    return {
                        success: false,
                        message:
                            `Không đủ ${getMaterialName(materialId)}. ` +
                            `Cần ${formatNumber(required)}, ` +
                            `hiện có ${formatNumber(beastMaterials[materialId])}.`,
                    };
                }
            }

            /*
             * Chỉ bắt đầu trừ sau khi đã kiểm tra đủ
             * toàn bộ tiền, nguyên liệu và độ bền.
             */
            user.money =
                Number(user.money || 0) -
                totalMoney;

            profile.furnaceDurability =
                Number(
                    profile.furnaceDurability ||
                        0,
                ) - durabilityCost;

            for (
                const [materialId, amount]
                of Object.entries(
                    recipe.materials || {},
                )
            ) {
                beastMaterials[materialId] =
                    Number(
                        beastMaterials[
                            materialId
                        ] || 0,
                    ) -
                    Number(amount || 0) *
                        safeQuantity;

                if (
                    beastMaterials[
                        materialId
                    ] <= 0
                ) {
                    delete beastMaterials[
                        materialId
                    ];
                }
            }

            const successRate =
                Math.min(
                    0.95,
                    Number(
                        recipe.baseSuccessRate ||
                            0,
                    ) +
                        Number(
                            furnace.successBonus ||
                                0,
                        ),
                );

            const qualityResults = {};
            let succeeded = 0;
            let failed = 0;
            let exploded = 0;
            let gainedExp = 0;

            for (
                let attempt = 0;
                attempt < safeQuantity;
                attempt += 1
            ) {
                profile.totalCrafted =
                    Number(
                        profile.totalCrafted ||
                            0,
                    ) + 1;

                if (roll(successRate)) {
                    succeeded += 1;

                    profile.totalSucceeded =
                        Number(
                            profile.totalSucceeded ||
                                0,
                        ) + 1;

                    gainedExp += Number(
                        recipe.alchemyExp || 0,
                    );

                    if (
                        recipe.type ===
                        "shop_item"
                    ) {
                        if (!user.inventory) {
                            user.inventory = {};
                        }

                        user.inventory[
                            recipe.shopItemId
                        ] =
                            Number(
                                user.inventory[
                                    recipe.shopItemId
                                ] || 0,
                            ) + 1;

                        continue;
                    }

                    const qualityLevel =
                        rollQuality(
                            profile.furnaceLevel,
                        );

                    addCustomPill(
                        profile,
                        recipe.id,
                        qualityLevel,
                        1,
                    );

                    qualityResults[
                        qualityLevel
                    ] =
                        Number(
                            qualityResults[
                                qualityLevel
                            ] || 0,
                        ) + 1;

                    profile.highestQuality =
                        Math.max(
                            Number(
                                profile.highestQuality ||
                                    0,
                            ),
                            qualityLevel,
                        );

                    continue;
                }

                failed += 1;

                profile.totalFailed =
                    Number(
                        profile.totalFailed || 0,
                    ) + 1;

                gainedExp += Math.max(
                    1,
                    Math.floor(
                        Number(
                            recipe.alchemyExp ||
                                0,
                        ) *
                            Number(
                                alchemyConfig.failureExpRate ||
                                    0.25,
                            ),
                    ),
                );

                if (
                    roll(
                        alchemyConfig.explosionChance,
                    )
                ) {
                    exploded += 1;

                    profile.totalExploded =
                        Number(
                            profile.totalExploded ||
                                0,
                        ) + 1;

                    profile.furnaceDurability =
                        Math.max(
                            0,
                            Number(
                                profile.furnaceDurability ||
                                    0,
                            ) - 5,
                        );
                } else {
                    profile.medicineResidue =
                        Number(
                            profile.medicineResidue ||
                                0,
                        ) + 1;
                }
            }

            const oldLevel =
                Number(profile.level || 1);

            profile.exp =
                Number(profile.exp || 0) +
                gainedExp;

            const newLevel =
                refreshAlchemyLevel(profile);

            return {
                success: true,
                recipe,
                quantity: safeQuantity,
                successRate,
                succeeded,
                failed,
                exploded,
                qualityResults,
                gainedExp,
                oldLevel,
                newLevel,
                remainingDurability:
                    profile.furnaceDurability,
            };
        },
    );
}

function buildCraftResultEmbed(result) {
    const recipe = result.recipe;
    const resultLines = [];

    if (
        recipe.type === "shop_item" &&
        result.succeeded > 0
    ) {
        resultLines.push(
            `${recipe.emoji} **${recipe.name}** ×${result.succeeded}`,
        );
    } else {
        for (
            const [qualityLevel, amount]
            of Object.entries(
                result.qualityResults || {},
            )
        ) {
            const quality =
                getQuality(qualityLevel);

            resultLines.push(
                `${quality.emoji} **${quality.name}** ×${amount}`,
            );
        }
    }

    return new EmbedBuilder()
        .setColor(
            result.succeeded > 0
                ? 0x2ecc71
                : 0xe74c3c,
        )
        .setTitle(
            result.succeeded > 0
                ? "🔥 LUYỆN ĐAN HOÀN TẤT"
                : "💨 LUYỆN ĐAN THẤT BẠI",
        )
        .setDescription(
            `${recipe.emoji} Đan phương: **${recipe.name}**\n` +
                `Số lần khai lò: **${result.quantity}**\n` +
                `Tỉ lệ thành công: **${Math.floor(result.successRate * 100)}%**`,
        )
        .addFields(
            {
                name: "📊 Kết quả",
                value:
                    `✅ Thành công: **${result.succeeded}**\n` +
                    `❌ Thất bại: **${result.failed}**\n` +
                    `💥 Nổ lò: **${result.exploded}**`,
                inline: true,
            },
            {
                name: "🧪 Đan nhận được",
                value:
                    resultLines.length > 0
                        ? resultLines.join("\n")
                        : "Không luyện thành viên nào.",
                inline: true,
            },
            {
                name: "📈 Tiến triển",
                value:
                    `EXP nghề: **+${formatNumber(result.gainedExp)}**\n` +
                    `Độ bền lò còn: **${formatNumber(result.remainingDurability)}**` +
                    (
                        result.newLevel >
                        result.oldLevel
                            ? `\n🎉 Thăng cấp: **Lv.${result.oldLevel} → Lv.${result.newLevel}**`
                            : ""
                    ),
            },
        )
        .setTimestamp();
}

function usePill(
    userId,
    recipeId,
    qualityLevel,
    quantity,
) {
    const recipe = getRecipe(recipeId);

    if (!recipe) {
        return {
            success: false,
            message:
                "Không tìm thấy loại đan này.",
        };
    }

    if (recipe.type === "shop_item") {
        return {
            success: false,
            message:
                "Đan đột phá hãy sử dụng bằng hệ thống Túi Đồ hoặc /tutien hiện tại.",
        };
    }

    const safeQuality =
        clampInteger(qualityLevel, 1, 4);

    const safeQuantity =
        clampInteger(quantity, 1, 10);

    /*
     * Đảm bảo profile tu tiên đã tồn tại trước
     * khi vào transaction luyện đan.
     */
    database.ensureTuTienProfile(userId);

    return database.updateAlchemyProfile(
        userId,
        (
            profile,
            user,
        ) => {
            const owned =
                getOwnedPillAmount(
                    profile,
                    recipe.id,
                    safeQuality,
                );

            if (owned < safeQuantity) {
                return {
                    success: false,
                    message:
                        `Bạn chỉ có ${owned} viên ` +
                        `${getQuality(safeQuality).name}.`,
                };
            }

            if (
                recipe.type ===
                "cultivation"
            ) {
                const usedToday =
                    Number(
                        profile.daily
                            .cultivationPillsUsed ||
                            0,
                    );

                if (
                    usedToday +
                        safeQuantity >
                    alchemyConfig
                        .dailyCultivationPillLimit
                ) {
                    return {
                        success: false,
                        message:
                            `Mỗi ngày chỉ hấp thụ tối đa ` +
                            `${alchemyConfig.dailyCultivationPillLimit} viên đan tu vi.`,
                    };
                }

                const cultivation =
                    user.tuTienProfile;

                const maxExp =
                    getCurrentRealmMaxExp(
                        cultivation,
                    );

                if (
                    Number(
                        cultivation.floor || 1,
                    ) >= 10 &&
                    Number(
                        cultivation.exp || 0,
                    ) >= maxExp
                ) {
                    return {
                        success: false,
                        message:
                            "Bạn đã đạt Tầng 10 viên mãn, hãy đột phá trước.",
                    };
                }

                const quality =
                    getQuality(safeQuality);

                const gainedExp =
                    Math.floor(
                        Number(
                            recipe.baseValue || 0,
                        ) *
                            Number(
                                quality.valueMultiplier ||
                                    1,
                            ) *
                            safeQuantity,
                    );

                if (
                    !removeCustomPill(
                        profile,
                        recipe.id,
                        safeQuality,
                        safeQuantity,
                    )
                ) {
                    return {
                        success: false,
                        message:
                            "Không đủ đan dược.",
                    };
                }

                cultivation.exp =
                    Number(
                        cultivation.exp || 0,
                    ) + gainedExp;

                autoAdvanceCultivationFloors(
                    cultivation,
                );

                profile.daily
                    .cultivationPillsUsed =
                    usedToday +
                    safeQuantity;

                return {
                    success: true,
                    type: recipe.type,
                    recipe,
                    quality,
                    quantity: safeQuantity,
                    gainedExp,
                    floor:
                        cultivation.floor,
                    exp: cultivation.exp,
                    maxExp:
                        getCurrentRealmMaxExp(
                            cultivation,
                        ),
                };
            }

            if (
                recipe.type ===
                "hunt_run"
            ) {
                const usedToday =
                    Number(
                        profile.daily
                            .huntRunPillsUsed ||
                            0,
                    );

                if (
                    usedToday +
                        safeQuantity >
                    alchemyConfig
                        .dailyHuntRunPillLimit
                ) {
                    return {
                        success: false,
                        message:
                            `Mỗi ngày chỉ dùng tối đa ` +
                            `${alchemyConfig.dailyHuntRunPillLimit} Hồi Liệp Đan.`,
                    };
                }

                if (!user.beastHuntStats) {
                    return {
                        success: false,
                        message:
                            "Bạn chưa sử dụng lượt săn nào hôm nay.",
                    };
                }

                const currentRuns =
                    Number(
                        user.beastHuntStats
                            .dailyRuns || 0,
                    );

                if (currentRuns <= 0) {
                    return {
                        success: false,
                        message:
                            "Bạn vẫn còn đủ lượt săn, chưa cần dùng Hồi Liệp Đan.",
                    };
                }

                /*
                 * Không cho uống nhiều hơn số lượt
                 * đã sử dụng thực tế.
                 */
                const restoredRuns =
                    Math.min(
                        safeQuantity,
                        currentRuns,
                    );

                if (
                    !removeCustomPill(
                        profile,
                        recipe.id,
                        safeQuality,
                        restoredRuns,
                    )
                ) {
                    return {
                        success: false,
                        message:
                            "Không đủ Hồi Liệp Đan.",
                    };
                }

                user.beastHuntStats.dailyRuns =
                    currentRuns -
                    restoredRuns;

                profile.daily
                    .huntRunPillsUsed =
                    usedToday +
                    restoredRuns;

                return {
                    success: true,
                    type: recipe.type,
                    recipe,
                    quality:
                        getQuality(
                            safeQuality,
                        ),
                    quantity:
                        restoredRuns,
                    remainingUsedRuns:
                        user.beastHuntStats
                            .dailyRuns,
                };
            }

            if (
                recipe.type ===
                "hunt_lure"
            ) {
                if (
                    profile.pendingHuntLure
                ) {
                    return {
                        success: false,
                        message:
                            "Bạn đang có một Dẫn Yêu Đan chờ sử dụng ở lượt săn kế tiếp.",
                    };
                }

                const minimumLevel =
                    Number(
                        recipe
                            .minBeastLevelByQuality?.[
                            safeQuality
                        ] || 1,
                    );

                if (
                    !removeCustomPill(
                        profile,
                        recipe.id,
                        safeQuality,
                        1,
                    )
                ) {
                    return {
                        success: false,
                        message:
                            "Không đủ Dẫn Yêu Đan.",
                    };
                }

                profile.pendingHuntLure = {
                    recipeId:
                        recipe.id,
                    recipeName:
                        recipe.name,
                    qualityLevel:
                        safeQuality,
                    minBeastLevel:
                        minimumLevel,
                    activatedAt:
                        Date.now(),
                };

                return {
                    success: true,
                    type: recipe.type,
                    recipe,
                    quality:
                        getQuality(
                            safeQuality,
                        ),
                    quantity: 1,
                    minBeastLevel:
                        minimumLevel,
                };
            }

            return {
                success: false,
                message:
                    "Loại đan này chưa hỗ trợ sử dụng.",
            };
        },
    );
}

function sellPill(
    userId,
    recipeId,
    qualityLevel,
    quantity,
) {
    const recipe = getRecipe(recipeId);

    if (!recipe) {
        return {
            success: false,
            message:
                "Không tìm thấy loại đan này.",
        };
    }

    const safeQuantity =
        clampInteger(quantity, 1, 50);

    const safeQuality =
        clampInteger(qualityLevel, 1, 4);

    return database.updateAlchemyProfile(
        userId,
        (
            profile,
            user,
        ) => {
            let sellPricePerItem = Number(
                recipe.buybackPrice || 0,
            );

            if (
                recipe.type ===
                "shop_item"
            ) {
                const itemId =
                    recipe.shopItemId;

                const owned =
                    Number(
                        user.inventory?.[
                            itemId
                        ] || 0,
                    );

                if (owned < safeQuantity) {
                    return {
                        success: false,
                        message:
                            `Bạn chỉ có ${owned} viên ${recipe.name}.`,
                    };
                }

                user.inventory[itemId] =
                    owned - safeQuantity;

                if (
                    user.inventory[itemId] <=
                    0
                ) {
                    delete user.inventory[
                        itemId
                    ];
                }
            } else {
                const owned =
                    getOwnedPillAmount(
                        profile,
                        recipe.id,
                        safeQuality,
                    );

                if (owned < safeQuantity) {
                    return {
                        success: false,
                        message:
                            `Bạn chỉ có ${owned} viên ${getQuality(safeQuality).name}.`,
                    };
                }

                const quality =
                    getQuality(
                        safeQuality,
                    );

                sellPricePerItem =
                    Math.floor(
                        sellPricePerItem *
                            Number(
                                quality.sellMultiplier ||
                                    1,
                            ),
                    );

                removeCustomPill(
                    profile,
                    recipe.id,
                    safeQuality,
                    safeQuantity,
                );
            }

            const totalPrice =
                sellPricePerItem *
                safeQuantity;

            user.money =
                Number(user.money || 0) +
                totalPrice;

            return {
                success: true,
                recipe,
                quantity: safeQuantity,
                quality:
                    recipe.type ===
                    "shop_item"
                        ? null
                        : getQuality(
                              safeQuality,
                          ),
                sellPricePerItem,
                totalPrice,
            };
        },
    );
}

function upgradeFurnace(userId) {
    return database.updateAlchemyProfile(
        userId,
        (
            profile,
            user,
            beastMaterials,
        ) => {
            const currentLevel =
                Number(
                    profile.furnaceLevel ||
                        1,
                );

            if (
                currentLevel >=
                alchemyConfig.maxFurnaceLevel
            ) {
                return {
                    success: false,
                    message:
                        "Đan lô đã đạt cấp tối đa.",
                };
            }

            const nextFurnace =
                getFurnace(
                    currentLevel + 1,
                );

            const cost =
                nextFurnace.upgradeCost;

            if (
                Number(user.money || 0) <
                Number(cost.money || 0)
            ) {
                return {
                    success: false,
                    message:
                        `Cần ${formatNumber(cost.money)} tiền để nâng lò.`,
                };
            }

            for (
                const [materialId, amount]
                of Object.entries(
                    cost.materials || {},
                )
            ) {
                if (
                    Number(
                        beastMaterials[
                            materialId
                        ] || 0,
                    ) < amount
                ) {
                    return {
                        success: false,
                        message:
                            `Không đủ ${getMaterialName(materialId)}. ` +
                            `Cần ${formatNumber(amount)}.`,
                    };
                }
            }

            user.money -= Number(
                cost.money || 0,
            );

            for (
                const [materialId, amount]
                of Object.entries(
                    cost.materials || {},
                )
            ) {
                beastMaterials[materialId] -=
                    amount;

                if (
                    beastMaterials[
                        materialId
                    ] <= 0
                ) {
                    delete beastMaterials[
                        materialId
                    ];
                }
            }

            profile.furnaceLevel =
                nextFurnace.level;

            profile.furnaceDurability =
                nextFurnace.maxDurability;

            return {
                success: true,
                furnace: nextFurnace,
                cost,
            };
        },
    );
}

function repairFurnace(userId) {
    return database.updateAlchemyProfile(
        userId,
        (
            profile,
            user,
            beastMaterials,
        ) => {
            const furnace =
                getFurnace(
                    profile.furnaceLevel,
                );

            const missing =
                Math.max(
                    0,
                    furnace.maxDurability -
                        Number(
                            profile.furnaceDurability ||
                                0,
                        ),
                );

            if (missing <= 0) {
                return {
                    success: false,
                    message:
                        "Đan lô chưa bị mất độ bền.",
                };
            }

            const moneyCost =
                missing * 500;

            const boneCost =
                Math.max(
                    1,
                    Math.ceil(missing / 10),
                );

            if (
                Number(user.money || 0) <
                moneyCost
            ) {
                return {
                    success: false,
                    message:
                        `Cần ${formatNumber(moneyCost)} tiền để sửa lò.`,
                };
            }

            if (
                Number(
                    beastMaterials
                        .xuong_yeu_thu || 0,
                ) < boneCost
            ) {
                return {
                    success: false,
                    message:
                        `Cần ${boneCost} Xương Yêu Thú để sửa lò.`,
                };
            }

            user.money -= moneyCost;

            beastMaterials.xuong_yeu_thu -=
                boneCost;

            if (
                beastMaterials.xuong_yeu_thu <=
                0
            ) {
                delete beastMaterials
                    .xuong_yeu_thu;
            }

            profile.furnaceDurability =
                furnace.maxDurability;

            return {
                success: true,
                furnace,
                moneyCost,
                boneCost,
            };
        },
    );
}

async function show(interaction) {
    return interaction.reply({
        embeds: [
            buildProfileEmbed(
                interaction.user.id,
            ),
        ],
        ephemeral: true,
    });
}

async function execute(interaction) {
    const userId = String(
        interaction.user.id,
    );

    const action =
        interaction.options.getString(
            "hanhdong",
        ) || "hoso";

    const recipeId =
        interaction.options.getString(
            "dan",
        );

    const quantity =
        interaction.options.getInteger(
            "soluong",
        ) || 1;

    const qualityLevel =
        interaction.options.getInteger(
            "pham",
        ) || 1;

    if (
        processingUsers.has(userId)
    ) {
        return interaction.reply({
            content:
                "⏳ Lò luyện đan của bạn đang được xử lý.",
            ephemeral: true,
        });
    }

    if (action === "hoso") {
        return show(interaction);
    }

    if (action === "congthuc") {
        return interaction.reply({
            embeds: [
                buildRecipesEmbed(userId),
            ],
            ephemeral: true,
        });
    }

    processingUsers.add(userId);

    try {
        if (action === "luyen") {
            const result = craftPills(
                userId,
                recipeId,
                quantity,
            );

            if (!result.success) {
                return interaction.reply({
                    content:
                        `❌ ${result.message}`,
                    ephemeral: true,
                });
            }

            return interaction.reply({
                embeds: [
                    buildCraftResultEmbed(
                        result,
                    ),
                ],
                ephemeral: true,
            });
        }

        if (action === "dung") {
            const result = usePill(
                userId,
                recipeId,
                qualityLevel,
                quantity,
            );

            if (!result.success) {
                return interaction.reply({
                    content:
                        `❌ ${result.message}`,
                    ephemeral: true,
                });
            }

            if (
                result.type ===
                "cultivation"
            ) {
                return interaction.reply({
                    content:
                        `🧪 Đã dùng **${result.recipe.name} — ${result.quality.name}** ×${result.quantity}\n\n` +
                        `✨ Nhận **+${formatNumber(result.gainedExp)} tu vi**\n` +
                        `📈 Tầng: **${result.floor}/10**\n` +
                        `📊 Tu vi: **${formatNumber(result.exp)}/${formatNumber(result.maxExp)}**`,
                    ephemeral: true,
                });
            }

            if (
                result.type ===
                "hunt_run"
            ) {
                return interaction.reply({
                    content:
                        `🎟️ Đã dùng **${result.recipe.name}** ×${result.quantity}\n\n` +
                        `Đã hồi **${result.quantity} lượt thưởng Săn Yêu Thú**.\n` +
                        `Lượt đã dùng hôm nay còn tính: **${result.remainingUsedRuns}/${beastConfig.cooldown.maxRunsPerDay}**\n\n` +
                        `⏳ Đan không xóa thời gian hồi săn.`,
                    ephemeral: true,
                });
            }

            if (
                result.type ===
                "hunt_lure"
            ) {
                return interaction.reply({
                    content:
                        `🧭 Đã kích hoạt **${result.recipe.name} — ${result.quality.name}**.\n\n` +
                        `Lượt săn tiếp theo bảo đảm yêu thú **cấp ${result.minBeastLevel} trở lên**.\n` +
                        `${
                            result.minBeastLevel >= 5
                                ? "⚠️ Yêu thú cấp 5 trở lên yêu cầu săn tổ đội."
                                : "Đan sẽ được áp dụng khi mở lượt săn tiếp theo."
                        }`,
                    ephemeral: true,
                });
            }
        }

        if (action === "ban") {
            const result = sellPill(
                userId,
                recipeId,
                qualityLevel,
                quantity,
            );

            if (!result.success) {
                return interaction.reply({
                    content:
                        `❌ ${result.message}`,
                    ephemeral: true,
                });
            }

            return interaction.reply({
                content:
                    `🏯 Đan Các đã thu mua **${result.recipe.name}` +
                    `${result.quality ? ` — ${result.quality.name}` : ""}** ×${result.quantity}\n\n` +
                    `Đơn giá: **${formatNumber(result.sellPricePerItem)}**\n` +
                    `Tổng nhận: **${formatNumber(result.totalPrice)}**`,
                ephemeral: true,
            });
        }

        if (action === "nanglo") {
            const result =
                upgradeFurnace(userId);

            if (!result.success) {
                return interaction.reply({
                    content:
                        `❌ ${result.message}`,
                    ephemeral: true,
                });
            }

            return interaction.reply({
                content:
                    `🔥 Nâng cấp thành công!\n\n` +
                    `${result.furnace.emoji} Đan lô mới: **${result.furnace.name}**\n` +
                    `Độ bền: **${result.furnace.maxDurability}**\n` +
                    `Thưởng thành công: **+${Math.floor(result.furnace.successBonus * 100)}%**\n` +
                    `Phẩm tối đa: **${getQuality(result.furnace.maxQuality).name}**`,
                ephemeral: true,
            });
        }

        if (action === "sualo") {
            const result =
                repairFurnace(userId);

            if (!result.success) {
                return interaction.reply({
                    content:
                        `❌ ${result.message}`,
                    ephemeral: true,
                });
            }

            return interaction.reply({
                content:
                    `🛠️ Đã sửa **${result.furnace.name}** về đầy độ bền.\n\n` +
                    `💰 Chi phí: **${formatNumber(result.moneyCost)}**\n` +
                    `🦴 Xương Yêu Thú: **${result.boneCost}**`,
                ephemeral: true,
            });
        }

        return interaction.reply({
            content:
                "❌ Hành động luyện đan không hợp lệ.",
            ephemeral: true,
        });
    } catch (error) {
        console.error(
            "[LuyenDan] Loi:",
            error,
        );

        if (
            interaction.replied ||
            interaction.deferred
        ) {
            return interaction.followUp({
                content:
                    "❌ Có lỗi khi xử lý Luyện Đan.",
                ephemeral: true,
            });
        }

        return interaction.reply({
            content:
                "❌ Có lỗi khi xử lý Luyện Đan.",
            ephemeral: true,
        });
    } finally {
        processingUsers.delete(userId);
    }
}

module.exports = {
    show,
    execute,
};