module.exports = {
    fee: 2000,
    rollStoneId: "da_mamu",
    durationMs: 15 * 60 * 1000,
    maxPlayers: 80,
    minPlayers: 1,
    channelPrefix: "do-thach",

    prizeRates: [
        { rank: 1, label: "Top 1", rate: 50 },
        { rank: 2, label: "Top 2", rate: 30 },
        { rank: 3, label: "Top 3", rate: 20 },
    ],

    messages: {
        noTournament: "❌ Hiện chưa có giải đổ thạch nào.",
        alreadyOpen: "❌ Đang có giải đổ thạch chưa kết thúc.",
        notRegistered: "❌ Bạn chưa đăng ký giải này.",
        alreadyRegistered: "❌ Bạn đã đăng ký giải này rồi.",
        signupClosed: "❌ Giải này đã đóng đăng ký.",
        notEnoughMoney: "❌ Bạn không đủ tiền để đăng ký.",
        noStones: "❌ Hiện chưa còn đá giải để chọn.",
        alreadyPicked: "❌ Bạn đã chọn đá rồi.",
        alreadyFinished: "❌ Bạn đã đổ thạch xong rồi.",
        exploded: "💥 Máy nổ cái đùng, bạn bị loại với giá trị 0.",
        timeout: "⏰ Hết giờ, người chưa đổ thạch bị loại với giá trị 0.",
    },
};