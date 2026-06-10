module.exports = {
    rewardPerCorrect: 23,
    winReward: 56,
    forfeitMinCorrect: 10,
    forfeitRewardRate: 0.5,
    phraseLength: 2,
    cooldown: {
        seconds: 3,
    },
    idleEndSeconds: 120,
    endWhenNoLocalNext: true,
    onePlayerCannotPlayTwice: true,
    chatCommands: {
        stop: "!noitu-stop",
        lose: "!thua",
        count: "!dic-count",
        reload: "!dic-reload",
        checkPrefix: "!check ",
        reportPrefix: "!report ",
    },
    messages: {
        alreadyPlaying: "⚠️ Channel này đang có ván nối từ rồi!",
        noGame: "❌ Chưa có ván nối từ nào",
        duplicated: "nối từ bị lặp rồi",
        calmDown: "⏳ Bình tĩnh anh bạn!",
        wordNotFound: "❌ Từ này không có trong từ điển",
    },
};
