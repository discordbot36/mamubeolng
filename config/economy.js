module.exports = {
    startingMoney: 1000,
    sellRate: 0.67,
    
    daily: {
        baseReward: 100,
        growthRate: 1.1,
        maxReward: 1000,
        cooldownMs: 24 * 60 * 60 * 1000,
        resetAfterMs: 48 * 60 * 60 * 1000,
    },
};
