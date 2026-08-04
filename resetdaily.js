const fs = require("fs");
const path = require("path");

const databaseConfig = require("./config/database");
const economyConfig = require("./config/economy");

const DATA_FILE = databaseConfig.dataFile;

function getVietnamDateKey(timestamp = Date.now()) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(timestamp));
}

if (!fs.existsSync(DATA_FILE)) {
    console.error("❌ Không tìm thấy data.json");
    process.exit(1);
}

const data = JSON.parse(
    fs.readFileSync(DATA_FILE, "utf8"),
);

const now = Date.now();
const todayKey = getVietnamDateKey(now);

const yesterdayTimestamp =
    now - 24 * 60 * 60 * 1000;

const yesterdayKey = getVietnamDateKey(
    yesterdayTimestamp,
);

const unlockStreak = Math.max(
    1,
    Math.floor(
        Number(
            economyConfig.daily
                ?.wheel
                ?.unlockStreak || 5,
        ),
    ),
);

let resetCount = 0;

for (
    const [userId, user]
    of Object.entries(data.users || {})
) {
    const lastDaily = Number(
        user.lastDaily || 0,
    );

    const lastDailyDate =
        user.lastDailyDate ||
        (
            lastDaily > 0
                ? getVietnamDateKey(lastDaily)
                : ""
        );

    const streak = Number(
        user.dailyStreak || 0,
    );

    /*
     * Chỉ reset người:
     *
     * 1. Đã điểm danh hôm nay.
     * 2. Đủ streak nhận vòng quay.
     * 3. Chưa được tạo dữ liệu vòng quay.
     */
    if (
        lastDailyDate !== todayKey ||
        streak < unlockStreak ||
        user.dailyWheel
    ) {
        continue;
    }

    /*
     * Lùi lượt điểm danh về hôm qua.
     */
    user.lastDaily =
        yesterdayTimestamp;

    user.lastDailyDate =
        yesterdayKey;

    /*
     * Trừ một streak để khi họ điểm danh lại,
     * claimDaily cộng lên đúng streak ban đầu.
     *
     * Ví dụ:
     * streak 5 -> tạm về 4 -> điểm danh lại thành 5.
     */
    user.dailyStreak = Math.max(
        0,
        streak - 1,
    );

    resetCount += 1;

    console.log(
        `✅ Đã reset: ${userId} | streak ${streak}`,
    );
}

/*
 * Tự động tạo backup trước khi ghi đè.
 */
const backupFile = path.join(
    path.dirname(DATA_FILE),
    `data.backup-reset-${todayKey}-${Date.now()}.json`,
);

fs.copyFileSync(
    DATA_FILE,
    backupFile,
);

const tempFile = `${DATA_FILE}.reset.tmp`;

fs.writeFileSync(
    tempFile,
    JSON.stringify(data, null, 2),
    "utf8",
);

fs.renameSync(
    tempFile,
    DATA_FILE,
);

console.log("");
console.log(
    `🎉 Hoàn tất: đã reset ${resetCount} người.`,
);

console.log(
    `💾 Backup: ${backupFile}`,
);