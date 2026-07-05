module.exports = {
    autoOpen: {
        enabled: true,

        channelId: "1523228367904702534",

        minDelayMs: 3 * 60 * 60 * 1000,
        maxDelayMs: 6 * 60 * 60 * 1000,

        timezone: "Asia/Ho_Chi_Minh",

        notifyRoleId: null,
        notifyRoleName: "Lợn Tu Tiên",

        avoidWindows: [
            {
                startHour: 20,
                startMinute: 30,
                endHour: 22,
                endMinute: 45,
            },
        ],
    },
};