module.exports = {
    autoOpen: {
        enabled: true,

        channelId: "1523228367904702534",

        minDelayMs: 3 * 60 * 60 * 1000,
        maxDelayMs: 6 * 60 * 60 * 1000,

        timezone: "Asia/Ho_Chi_Minh",

        notifyRoleId: null,
        notifyRoleName: "Lợn Tu Tiên",
        clearChannelBeforeOpen: false,
        clearChannelMaxBatches: 20,
        clearChannelReason: "Dọn kênh trước khi mở cơ duyên",
        deleteTeamChannelsAfterFinish: false,
        teamChannelRetentionMs: 24 * 60 * 60 * 1000,
        avoidWindows: [
            {
                startHour: 20,
                startMinute: 50,
                endHour: 21,
                endMinute: 50,
            },
            {
                startHour: 1,
                startMinute: 0,
                endHour: 6,
                endMinute: 0,
            },
        ],
    },
};
