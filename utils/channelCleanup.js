const database = require("../database");

const SYSTEM_KEY = "channelCleanup:pending";

// timers đang chạy trong bộ nhớ, key = channelId
const activeTimers = new Map();

function getPendingMap() {
    return database.getSystemValue(SYSTEM_KEY) || {};
}

function savePendingMap(map) {
    database.setSystemValue(SYSTEM_KEY, map);
}

function removePending(channelId) {
    const map = getPendingMap();

    if (map[channelId]) {
        delete map[channelId];
        savePendingMap(map);
    }
}

async function deleteChannelNow(client, channelId, reason) {
    removePending(channelId);

    const timer = activeTimers.get(channelId);
    if (timer) {
        clearTimeout(timer);
        activeTimers.delete(channelId);
    }

    let channel = null;

    try {
        channel =
            client.channels.cache.get(channelId) ||
            (await client.channels.fetch(channelId).catch(() => null));
    } catch (error) {
        channel = null;
    }

    if (!channel) {
        return;
    }

    try {
        await channel.delete(reason || "Channel cleanup");
    } catch (error) {
        // Kênh có thể đã bị xóa thủ công từ trước, hoặc bot mất quyền.
        console.error(
            `[ChannelCleanup] Không thể xóa kênh ${channelId}:`,
            error,
        );
    }
}

/**
 * Hẹn giờ xóa một kênh sau `delayMs` mili-giây.
 * Lịch hẹn được lưu vào database để phục hồi nếu bot restart giữa chừng.
 */
function schedule(client, channel, delayMs, reason) {
    if (!channel || !channel.id) {
        return;
    }

    const channelId = channel.id;
    const deleteAt = Date.now() + Math.max(0, Number(delayMs) || 0);

    const map = getPendingMap();
    map[channelId] = {
        channelId,
        deleteAt,
        reason: reason || null,
    };
    savePendingMap(map);

    const existingTimer = activeTimers.get(channelId);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
        deleteChannelNow(client, channelId, reason).catch((error) => {
            console.error(
                `[ChannelCleanup] Lỗi khi xóa kênh ${channelId}:`,
                error,
            );
        });
    }, deleteAt - Date.now());

    // Không giữ tiến trình Node sống chỉ vì timer này.
    if (typeof timer.unref === "function") {
        timer.unref();
    }

    activeTimers.set(channelId, timer);
}

/**
 * Hủy lịch xóa kênh đã hẹn trước đó (nếu có).
 */
function cancel(channelId) {
    if (!channelId) {
        return;
    }

    const timer = activeTimers.get(channelId);
    if (timer) {
        clearTimeout(timer);
        activeTimers.delete(channelId);
    }

    removePending(channelId);
}

/**
 * Được gọi lúc bot khởi động: đọc lại các lịch hẹn xóa kênh còn dang dở.
 * Kênh nào đã quá hạn thì xóa ngay, kênh nào chưa tới hạn thì hẹn giờ tiếp.
 */
async function recover(client) {
    const map = getPendingMap();
    const entries = Object.values(map);

    if (entries.length === 0) {
        return;
    }

    for (const entry of entries) {
        if (!entry || !entry.channelId) {
            continue;
        }

        const remaining = entry.deleteAt - Date.now();

        if (remaining <= 0) {
            await deleteChannelNow(client, entry.channelId, entry.reason);
        } else {
            schedule(client, { id: entry.channelId }, remaining, entry.reason);
        }
    }
}

module.exports = {
    schedule,
    cancel,
    recover,
};
