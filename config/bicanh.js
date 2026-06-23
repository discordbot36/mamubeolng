module.exports = {
    enabled: true,

    triggerChance: {
        cultivate: 0.025,

        dungeonClear: 0.04,
        dungeonSweep: 0.04,
    },

    party: {
        minMembers: 2,
        maxMembers: 6,

        lobbyDurationMs: 5 * 60 * 1000,

        actionDurationMs: 45 * 1000,
    },

    difficultyTiers: [
        {
            id: "on_dinh",
            name: "Ổn Định",
            weight: 30,
            level: 1,
            recommendedMembers: 2,
            requiredProgressMultiplier: 1.0,
            hpMultiplier: 1.08,
            damageMultiplier: 0.85,
            maxTurns: 8,
            wrongActionMultiplier: 0.18,
            failProgressMultiplier: 0.42,
            missingMemberDifficulty: 0.16,
            rewardMultiplier: 1.15,
        },
        {
            id: "nhieu_dong",
            name: "Nhiễu Động",
            weight: 36,
            level: 2,
            recommendedMembers: 3,
            requiredProgressMultiplier: 1.22,
            hpMultiplier: 1.0,
            damageMultiplier: 1.05,
            maxTurns: 8,
            wrongActionMultiplier: 0.12,
            failProgressMultiplier: 0.35,
            missingMemberDifficulty: 0.2,
            rewardMultiplier: 1.45,
        },
        {
            id: "hung_hiem",
            name: "Hung Hiểm",
            weight: 22,
            level: 3,
            recommendedMembers: 4,
            requiredProgressMultiplier: 1.52,
            hpMultiplier: 0.92,
            damageMultiplier: 1.28,
            maxTurns: 9,
            wrongActionMultiplier: 0.08,
            failProgressMultiplier: 0.28,
            missingMemberDifficulty: 0.24,
            rewardMultiplier: 1.9,
        },
        {
            id: "ac_mong",
            name: "Ác Mộng",
            weight: 9,
            level: 4,
            recommendedMembers: 5,
            requiredProgressMultiplier: 1.65,
            hpMultiplier: 0.86,
            damageMultiplier: 1.38,
            maxTurns: 10,
            wrongActionMultiplier: 0.05,
            failProgressMultiplier: 0.2,
            missingMemberDifficulty: 0.3,
            rewardMultiplier: 2.65,
        },
        {
            id: "thien_phat",
            name: "Thiên Phạt",
            weight: 3,
            level: 5,
            recommendedMembers: 6,
            requiredProgressMultiplier: 2.05,
            hpMultiplier: 0.78,
            damageMultiplier: 1.65,
            maxTurns: 11,
            wrongActionMultiplier: 0.02,
            failProgressMultiplier: 0.12,
            missingMemberDifficulty: 0.36,
            rewardMultiplier: 4.0,
        },
    ],

    powerLimits: {
        minGuestRatio: 0.12,
        recommendedGuestRatio: 0.4,
        maxEffectiveRatio: 1.5,

        weakGuestRewardMultiplier: 0.55,
        veryWeakGuestRewardMultiplier: 0.3,
    },

    fatigue: {
        resetAfterMs: 24 * 60 * 60 * 1000,

        maxGuestRuns: 5,
        maxHostRuns: 2,

        levels: [
            {
                runs: 0,
                powerMultiplier: 1,
                rewardMultiplier: 1,
            },
            {
                runs: 1,
                powerMultiplier: 1,
                rewardMultiplier: 0.9,
            },
            {
                runs: 2,
                powerMultiplier: 0.9,
                rewardMultiplier: 0.7,
            },
            {
                runs: 3,
                powerMultiplier: 0.75,
                rewardMultiplier: 0.45,
            },
            {
                runs: 4,
                powerMultiplier: 0.6,
                rewardMultiplier: 0.25,
            },
        ],
    },

    scaling: {
        difficulty: {
            2: 0.48,
            3: 0.62,
            4: 0.76,
            5: 0.88,
            6: 1,
        },

        contributionCap: {
            2: 0.75,
            3: 0.55,
            4: 0.42,
            5: 0.34,
            6: 0.3,
        },
    },

    channel: {
        categoryId: "1342861817105481819",
        deleteDelayMs: 10 * 60 * 1000,

        namePrefix: "bi-canh",
    },

    rewards: {
        economy: {
            hostMin: 3000,
            hostMax: 8000,

            guestMin: 2000,
            guestMax: 5000,
        },

        tuVi: {
            hostMin: 120,
            hostMax: 240,

            guestMin: 70,
            guestMax: 160,
        },
        guaranteedFeed: {
            itemId: "cam_lon_nam_dinh",

            hostMin: 3,
            hostMax: 5,

            guestMin: 2,
            guestMax: 3,
        },

        hostRolls: 4,
        guestRolls: 2,

        rewardPool: [
            {
                itemId: "cam_lon_nam_dinh",
                weight: 34,
                minAmount: 1,
                maxAmount: 4,
            },
            {
                itemId: "cam_lon_tang_trong",
                weight: 21,
                minAmount: 1,
                maxAmount: 3,
            },
            {
                itemId: "cam_lon_xin_vl",
                weight: 11,
                minAmount: 1,
                maxAmount: 1,
            },

            {
                itemId: "da_lo",
                weight: 15,
                minAmount: 1,
                maxAmount: 4,
            },
            {
                itemId: "da_cho_Tau",
                weight: 9,
                minAmount: 1,
                maxAmount: 2,
            },
            {
                itemId: "da_thach_anh",
                weight: 6,
                minAmount: 1,
                maxAmount: 1,
            },

            {
                itemId: "bi_tich_rach_chu_dong",
                weight: 3.3,
                minAmount: 1,
                maxAmount: 1,
            },
            {
                itemId: "bi_tich_rach_bi_dong",
                weight: 3.3,
                minAmount: 1,
                maxAmount: 1,
            },

            {
                itemId: "bi_tich_thuong_chu_dong",
                weight: 1.35,
                minAmount: 1,
                maxAmount: 1,
            },
            {
                itemId: "bi_tich_thuong_bi_dong",
                weight: 1.35,
                minAmount: 1,
                maxAmount: 1,
            },

            {
                itemId: "bi_tich_cao_cap_chu_dong",
                weight: 0.35,
                minAmount: 1,
                maxAmount: 1,
            },
            {
                itemId: "bi_tich_cao_cap_bi_dong",
                weight: 0.35,
                minAmount: 1,
                maxAmount: 1,
            },
        ],
    },
};
