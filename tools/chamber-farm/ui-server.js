"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { randomBytes, timingSafeEqual } = require("node:crypto");
const { acquireLock } = require("./state");
const { UiController } = require("./ui-controller");
const { bettingPreview } = require("./betting-controls");

async function createUiServer(controller, options = {}) {
    const token = options.token || randomBytes(32).toString("hex");
    const root = path.join(__dirname, "ui");
    let origin;
    const equal = value => {
        const input = Buffer.from(value || "");
        const expected = Buffer.from("Bearer " + token);
        return input.length === expected.length && timingSafeEqual(input, expected);
    };
    const server = http.createServer(async (req, res) => {
        const reply = (code, value) => {
            res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
            res.end(JSON.stringify(value));
        };
        const host = new URL(origin).host;
        if (req.headers.host !== host) return reply(403, { error: "Địa chỉ truy cập không hợp lệ." });
        const route = new URL(req.url, origin).pathname;
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Referrer-Policy", "no-referrer");
        res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
        if (route.startsWith("/api/")) {
            if (!equal(req.headers.authorization)) return reply(401, { error: "Mở giao diện bằng ChamberFarm.exe để kết nối." });
            if (req.headers.origin && req.headers.origin !== origin) return reply(403, { error: "Yêu cầu đến từ trang khác bị từ chối." });
            if (req.method === "GET" && route === "/api/status") return reply(200, controller.status());
            if (req.method !== "POST" || req.headers["content-type"] !== "application/json") return reply(405, { error: "Yêu cầu không hợp lệ." });
            try {
                let text = "";
                for await (const chunk of req) {
                    text += chunk;
                    if (Buffer.byteLength(text) > 8192) return reply(413, { error: "Dữ liệu quá lớn." });
                }
                const body = JSON.parse(text || "{}");
                if (route === "/api/preview") {
                    const status = controller.status();
                    return reply(200, bettingPreview(body.base, status.betting?.sequence || [1, 2, 3, 5],
                        status.session?.balance, status.maxBet, body.percent ?? 1, status.betting?.mode || "win_progression", status.betting?.resetAt || 0));
                }
                if (route === "/api/command") {
                    const result = await controller.command(body.action, body.action === "base" ? { base: body.base } : {});
                    return reply(200, result);
                }
                return reply(404, { error: "Không có chức năng này." });
            } catch (error) { return reply(400, { error: String(error.message || "Thao tác chưa hoàn tất.") }); }
        }
        const files = { "/": ["index.html", "text/html"], "/app.js": ["app.js", "text/javascript"], "/style.css": ["style.css", "text/css"] };
        if (req.method !== "GET" || !Object.hasOwn(files, route)) return reply(404, { error: "Không tìm thấy trang." });
        const [file, mime] = files[route];
        res.writeHead(200, { "Content-Type": mime + "; charset=utf-8", "Cache-Control": "no-store" });
        fs.createReadStream(path.join(root, file)).pipe(res);
    });
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(options.port || 0, "127.0.0.1", resolve); });
    origin = `http://127.0.0.1:${server.address().port}`;
    return { server, token, origin, url: origin + "/#" + token,
        close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

async function main() {
    const directory = process.env.CHAMBER_DATA_DIR ? path.resolve(process.env.CHAMBER_DATA_DIR) : __dirname;
    const uiDirectory = path.join(directory, ".ui");
    fs.mkdirSync(uiDirectory, { recursive: true });
    const instanceFile = path.join(uiDirectory, "instance.json");
    if (fs.existsSync(instanceFile)) {
        try {
            const instance = JSON.parse(fs.readFileSync(instanceFile, "utf8"));
            const url = new URL(instance.url);
            if (url.hostname === "127.0.0.1" && url.protocol === "http:") {
                const response = await fetch(url.origin + "/api/status", { headers: { Authorization: "Bearer " + url.hash.slice(1) }, signal: AbortSignal.timeout(1500) });
                if (response.ok) { console.log("CHAMBER_UI_URL=" + instance.url); return; }
            }
        } catch { /* Reclaim only a dead UI process through the OS lock below. */ }
    }
    const release = await acquireLock(uiDirectory);
    let app;
    const controller = new UiController(directory);
    try {
        app = await createUiServer(controller);
        fs.writeFileSync(instanceFile, JSON.stringify({ pid: process.pid, url: app.url }), { mode: 0o600 });
        console.log("CHAMBER_UI_URL=" + app.url);
        let closing = false;
        const close = async () => {
            if (closing) return;
            closing = true;
            await controller.close();
            await app.close();
            fs.unlinkSync(instanceFile);
            await release();
        };
        process.once("SIGINT", () => close().then(() => process.exit(0)));
        process.once("SIGTERM", () => close().then(() => process.exit(0)));
    } catch (error) { if (app) await app.close(); await release(); throw error; }
}

if (require.main === module) main().catch(error => {
    const token = process.env.DISCORD_USER_TOKEN;
    const message = String(error.message || "Không mở được giao diện.");
    console.error(token ? message.split(token).join("[REDACTED]") : message);
    process.exit(1);
});

module.exports = { createUiServer };
