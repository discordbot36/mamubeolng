"use strict";

const $ = id => document.getElementById(id);
const key = location.hash.slice(1) || sessionStorage.getItem("chamber-ui-key");
if (location.hash) { sessionStorage.setItem("chamber-ui-key", key); history.replaceState(null, "", "/"); }
const number = value => Number.isFinite(value) ? new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value) : "—";
const signed = value => Number.isFinite(value) ? (value > 0 ? "+" : "") + number(value) : "—";
const clock = value => value ? new Date(value).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "—";
let status;
let working = false;
let proposalTouched = false;
let preview;
let previewVersion = 0;

async function api(route, body) {
    const response = await fetch("/api/" + route, { method: body ? "POST" : "GET", headers: {
        Authorization: "Bearer " + key, ...(body ? { "Content-Type": "application/json" } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Không nhận được phản hồi.");
    return data;
}

function notice(text, success = false) {
    $("notice").hidden = !text;
    $("notice").textContent = text || "";
    $("notice").classList.toggle("success", success);
}

function tone(element, value) {
    element.classList.toggle("positive", value > 0);
    element.classList.toggle("negative", value < 0);
}

function render() {
    if (!status) return;
    const s = status;
    const session = s.session;
    const busy = s.busy || s.commandPending || working || s.connecting;
    const connected = s.connected;
    $("connection").textContent = "";
    $("connection").append(document.createElement("i"), document.createTextNode(s.connecting ? "Đang kết nối" : connected ? "Đã kết nối Discord" : "Chưa kết nối"));
    $("connection").className = "status-pill" + (connected ? " online" : s.connecting ? " working" : "");
    $("phase").textContent = s.stopping ? "Đang kết thúc" : busy ? "Đang xử lý" : connected && !s.paused ? "Đang chạy" : connected ? "Tạm dừng" : "Sẵn sàng";
    $("balance").textContent = number(session?.balance);
    $("balance-note").textContent = session ? s.pending ? `Số dư trước ván hiện tại · ${s.pending.bet} coin đang cược` : session.estimated ? "Đang tính theo kết quả · chưa xác nhận lại ví" : "Đã xác nhận bằng /taikhoan" : "Bấm Bắt đầu phiên để lấy ví thật bằng /taikhoan.";
    $("verified").textContent = session ? `Ví xác nhận gần nhất: ${number(session.verifiedBalance)} coin · ${clock(session.verifiedAt)}` : "Chưa kiểm tra ví trong phiên này";
    const net = session ? session.balance - session.initialBalance : null;
    $("session-net").textContent = signed(net);
    tone($("session-net"), net);
    $("bj-net").textContent = signed(session?.netBlackjack);
    $("daily-net").textContent = signed(session?.dailyCredits);
    $("net-note").textContent = session?.adjustments ? `Gồm ${signed(session.adjustments)} coin điều chỉnh theo ví thật` : "Tính từ số dư đầu phiên";
    $("next-bet").textContent = number(s.nextBet);
    $("round-state").textContent = s.pending ? `Ván hiện tại: ${s.pending.bet} coin · đang chờ kết quả` : s.paused || !connected ? "Chưa mở ván mới" : "Đợi đến ván tiếp theo";
    $("record").textContent = `${session?.wins || 0} thắng · ${session?.losses || 0} thua · ${session?.pushes || 0} hòa`;
    $("cap").textContent = number(s.maxBet);
    $("settings-summary").textContent = `Gốc ${number(s.baseBet)} coin · Trần ${number(s.maxBet)} coin`;
    const mode = s.betting?.mode;
    $("strategy-name").textContent = mode === "martingale" ? "Martingale" : mode === "flat" ? "Cược đều" : "Tăng sau thắng";
    $("strategy-summary").textContent = mode === "martingale" ? s.betting.resetAt ? `Thua ×2; thua ${number(s.betting.resetAt)} về ${number(s.baseBet)} · Thắng về ${number(s.baseBet)} · Hòa giữ cược` : `Thua ×2 · Thắng về ${number(s.baseBet)} · Hòa giữ cược` : mode === "flat" ? `Mỗi ván ${number(s.baseBet)} coin` : "Thắng tăng bước · Thua về gốc · Hòa giữ cược";
    $("sequence-label").textContent = mode === "martingale" ? "Chuỗi khi thua liên tiếp" : mode === "flat" ? "Mức cược mỗi ván" : "Chuỗi sau mỗi lần thắng";
    $("risk-label").textContent = mode === "martingale" ? "Ngân sách cược gốc / vốn (%)" : "Giới hạn cược lớn nhất / vốn (%)";
    const blocked = s.nextBet > s.maxBet ? `Cược tiếp ${number(s.nextBet)} vượt trần ${number(s.maxBet)} coin. Đã dừng; chưa gửi cược này.` : session && s.nextBet > session.balance ? `Số dư theo phiên không đủ cược tiếp ${number(s.nextBet)} coin. Kiểm tra ví trước khi tiếp tục.` : null;
    const cooldownSeconds = Math.max(0, Math.ceil(((s.interactionCooldownUntil || 0) - Date.now()) / 1000));
    const reason = blocked || (cooldownSeconds ? `Discord giới hạn tốc độ. Chờ thêm ${cooldownSeconds} giây trước khi tiếp tục.` : s.paused && s.lastError?.reason);
    $("stop-reason").hidden = !reason;
    $("stop-reason").textContent = reason || "";
    $("round-count").textContent = `${session?.rounds || 0} ván`;
    $("start").textContent = busy && !connected ? "Đang kết nối…" : session && connected ? "▶ Tiếp tục phiên" : "▶ Bắt đầu phiên";
    $("start").disabled = busy || !!s.pending || !!s.stopping || !!blocked || cooldownSeconds > 0 || connected && !s.paused;
    $("pause").disabled = !connected || s.paused || !!s.stopping;
    $("account").disabled = busy || !!s.pending || !!s.stopping || cooldownSeconds > 0;
    const today = s.daily?.date === s.today;
    $("daily").disabled = busy || !!s.pending || today || !!s.stopping || cooldownSeconds > 0;
    $("daily-note").textContent = today ? s.daily.status === "confirmed" ? `Đã nhận +${number(s.daily.reward)} coin hôm nay` : "Đã gửi hôm nay · kiểm tra ví để xác nhận" : "Nhận thưởng trong ngày";
    $("recover").disabled = busy || !(s.pending?.messageId || s.pending?.commandNonce) || connected && !s.paused || !!s.stopping;
    $("recover").hidden = !s.pending;
    $("disconnect").disabled = !connected || busy || !!s.stopping;
    $("pending-info").hidden = !s.pending;
    $("pending-info").textContent = s.pending ? s.pending.messageId ? `Đang giữ ván cược ${s.pending.bet} coin. ${s.pending.lastDecision ? "Quyết định gần nhất: " + (s.pending.lastDecision.action === "hit" ? "Tiếp" : "Thôi") + ". " : ""}Nếu đã tạm dừng, dùng Đối soát ván để đọc kết quả thật.` : s.pending.commandNonce ? `Lệnh cược ${s.pending.bet} coin chưa nhận được ID ván. Bấm Đối soát ván để tìm phản hồi đúng mã thao tác, không gửi lại cược.` : `Lệnh cược ${s.pending.bet} coin chưa nhận được ID ván. Cần kiểm tra trên Discord xem có tạo ván hoặc trừ coin không trước khi xử lý ván chờ. Bot chưa tính thắng/thua và chưa cược lại.` : "";
    if (!proposalTouched) $("base").value = String(s.baseBet || 1);
    renderHistory(session);
    const activity = $("activity");
    activity.replaceChildren();
    const logs = s.logs?.length ? [...s.logs].reverse().slice(0, 12) : ["Giao diện đã sẵn sàng. Chưa gửi cược."];
    logs.forEach(text => { const li = document.createElement("li"); li.textContent = text; activity.append(li); });
    if (s.connectionError && !working) notice(s.connectionError);
    updatePreview();
}

function renderHistory(session) {
    const history = session?.history || [];
    $("history-empty").hidden = history.length > 0;
    $("initial-balance").textContent = "Đầu phiên: " + number(session?.initialBalance);
    $("history").replaceChildren();
    const names = { win: "Thắng", loss: "Thua", push: "Hòa", void: "Hoàn tiền" };
    history.slice(-12).reverse().forEach(item => {
        const row = document.createElement("tr");
        const first = document.createElement("td");
        const label = document.createElement("span");
        label.className = "outcome " + (Object.hasOwn(names, item.outcome) ? item.outcome : "daily");
        const time = document.createElement("small"); time.textContent = clock(item.at);
        label.append(document.createElement("i"), document.createTextNode(item.kind === "daily" ? "Điểm danh " : (item.natural && item.outcome === "win" ? "Blackjack" : names[item.outcome] || "Chưa rõ") + " "), time);
        first.append(label); row.append(first);
        [item.bet ?? "—", signed(item.delta), number(item.balance)].forEach((value, index) => {
            const td = document.createElement("td"); td.textContent = String(value);
            if (index === 1) tone(td, item.delta);
            row.append(td);
        });
        $("history").append(row);
    });
    const balances = session ? [session.initialBalance, ...history.map(item => item.balance)] : [0, 0];
    if (balances.length === 1) balances.push(balances[0]);
    const min = Math.min(...balances), max = Math.max(...balances);
    const range = Math.max(1, max - min);
    $("chart-line").setAttribute("points", balances.map((value, i) => `${i * 600 / (balances.length - 1)},${100 - (value - min) / range * 80}`).join(" "));
}

async function updatePreview() {
    const version = ++previewVersion;
    try {
        const result = await api("preview", { base: Number($("base").value), percent: Number($("risk-target").value) });
        if (version !== previewVersion) return;
        preview = result;
        $("sequence").replaceChildren();
        result.stakes.forEach((stake, i) => {
            if (i) { const arrow = document.createElement("span"); arrow.className = "seq-arrow"; arrow.textContent = "→"; $("sequence").append(arrow); }
            const node = document.createElement("span"); node.className = "stake" + (i === 0 ? " current" : ""); node.textContent = stake; $("sequence").append(node);
        });
        const reset = document.createElement("span"); reset.className = "reset"; reset.textContent = result.resetTo ? `→ ${number(result.resetTo)}: chuỗi mới` : result.mode === "martingale" ? `→ ${number(result.blockedNext)}: dừng` : "↻ " + result.base; $("sequence").append(reset);
        $("cycle-note").textContent = result.mode === "martingale" ? result.resetTo ? `Thua hết chuỗi mất ${number(result.cycleCapital)} coin. Thua ở mức ${number(result.maximum)} thì về ${number(result.resetTo)} và bắt đầu chuỗi mới; khoản lỗ cũ vẫn được tính đầy đủ.` : `Thua hết chuỗi mất ${number(result.cycleCapital)} coin. Cược tiếp ${number(result.blockedNext)} vượt trần ${number(result.maxBet)}.` : "";
        $("maximum").textContent = `${number(result.maximum)} coin`;
        $("maximum").className = result.allowed ? "" : "negative";
        $("risk").textContent = result.riskPercent === null ? "Chưa có số dư" : number(result.riskPercent) + "%";
        $("risk").className = result.riskPercent > result.targetPercent ? "negative" : "";
        $("calculation-note").textContent = !result.allowed ? `Mức này vượt giới hạn chuỗi ${result.ceiling} coin. Hãy giảm cược gốc.` : status?.session ? result.suggestedBase ? `Theo ngân sách ${number(result.targetPercent)}%, cược gốc tối đa là ${number(result.suggestedBase)} coin.${result.mode === "martingale" ? " Ngân sách này chỉ tính cược gốc, chưa bao gồm chuỗi nhân đôi." : ""}` : "Vốn hiện tại chưa đủ cho mức cược nguyên 1 coin theo ngân sách này." : "Kiểm tra ví để tính theo vốn.";
        const canApply = status && (!status.connected || status.paused) && !status.busy && !status.pending && !status.commandPending && !working && !status.connecting && !status.stopping;
        $("apply").disabled = !canApply || !result.allowed || (result.base === status.baseBet && status.nextBet === status.baseBet);
        $("apply").textContent = `Áp dụng cược gốc ${number(result.base)} coin`;
        $("apply-note").textContent = status?.pending || status?.connected && !status.paused ? "Tạm dừng và chờ ván hiện tại kết thúc để đổi mức cược." : "Áp dụng sẽ đưa chuỗi về bước đầu. Số dư và lịch sử phiên được giữ nguyên.";
        $("calculate").disabled = !result.suggestedBase || working;
    } catch (error) {
        if (version !== previewVersion) return;
        preview = null;
        $("apply").disabled = true;
        $("calculate").disabled = true;
        $("calculation-note").textContent = error.message;
    }
}

async function action(name, extra = {}) {
    if (working && name !== "pause") return;
    working = true;
    notice(name === "start" && !status?.session ? "Đang kết nối và kiểm tra ví thật trước khi mở ván…" : "Đang xử lý…");
    render();
    try {
        status = await api("command", { action: name, ...extra });
        if (name === "base") proposalTouched = false;
        notice(({ start: "Phiên đã bắt đầu. Bot sẽ tự xử lý các ván tiếp theo.", pause: "Đã tạm dừng mở ván mới. Ván hiện tại sẽ được xử lý xong.", account: "Đã cập nhật số dư thật từ /taikhoan.", daily: "Đã xử lý điểm danh và kiểm tra lại ví.", recover: "Đã đối soát kết quả. Bấm Tiếp tục phiên khi muốn chơi tiếp.", base: "Đã áp dụng mức cược mới, chuỗi trở về bước đầu.", disconnect: "Đang kết thúc phiên sau khi hoàn tất thao tác hiện tại." })[name], true);
    } catch (error) { notice(error.message); }
    finally { working = false; await refresh(); }
}

async function refresh() {
    try { status = await api("status"); render(); }
    catch (error) { notice(error.message); }
}

["start", "pause", "account", "daily", "recover", "disconnect"].forEach(id => $(id).addEventListener("click", () => action(id)));
$("apply").addEventListener("click", () => action("base", { base: Number($("base").value) }));
$("base").addEventListener("input", () => { proposalTouched = true; updatePreview(); });
$("risk-target").addEventListener("input", updatePreview);
$("double").addEventListener("click", () => { proposalTouched = true; $("base").value = String(Math.max(1, Number($("base").value) || 1) * 2); updatePreview(); });
$("halve").addEventListener("click", () => { proposalTouched = true; $("base").value = String(Math.max(1, Math.floor(Number($("base").value) / 2))); updatePreview(); });
$("calculate").addEventListener("click", () => { if (preview?.suggestedBase) { proposalTouched = true; $("base").value = String(preview.suggestedBase); updatePreview(); } });
$("refresh-page").addEventListener("click", refresh);
refresh();
setInterval(refresh, 1500);
