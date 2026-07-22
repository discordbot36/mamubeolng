const { GAMBLE_MAX_BET } = require("./gamble");

module.exports = {
    totalTiles: 25,
    boardSize: 5,

    minMines: 1,
    maxMines: 8,
    defaultMines: 5,

    minBet: 10_000,
    maxBet: GAMBLE_MAX_BET,
    maxBalancePercent: 0.05,

    // RTP 96% tương đương lợi thế nhà cái khoảng 4% trước làm tròn/giới hạn.
    rtp: 0.96,

    maxMultiplier: 50,
    maxPayout: 10_000_000,

    sessionTimeoutMs: 90_000,

    sessionKeyPrefix: "molinhthach:session",
    sessionIndexKey: "molinhthach:activeSessions",
    statsKey: "molinhthach:stats",
};
