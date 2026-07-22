const fs = require("fs");
const path = require("path");

const root = process.cwd();
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

function read(relativePath) {
    const fullPath = path.join(root, relativePath);

    if (!fs.existsSync(fullPath)) {
        throw new Error(`Không tìm thấy ${relativePath}. Hãy chạy installer ở thư mục gốc bot.`);
    }

    return fs.readFileSync(fullPath, "utf8").replace(/\r\n/g, "\n");
}

function backupAndWrite(relativePath, content) {
    const fullPath = path.join(root, relativePath);
    const backupPath = `${fullPath}.bak-${timestamp}`;

    fs.copyFileSync(fullPath, backupPath);
    fs.writeFileSync(fullPath, content, "utf8");

    console.log(`✓ Đã sửa ${relativePath}`);
    console.log(`  Backup: ${path.basename(backupPath)}`);
}

function ensureGameFiles() {
    const required = ["molinhthach.js", "config/molinhthach.js"];

    for (const relativePath of required) {
        if (!fs.existsSync(path.join(root, relativePath))) {
            throw new Error(
                `Thiếu ${relativePath}. Hãy giải nén toàn bộ gói vào thư mục gốc bot trước.`,
            );
        }
    }
}

function patchRouter() {
    const relativePath = "core/router.js";
    let content = read(relativePath);
    let changed = false;

    if (!content.includes('const molinhthach = require("../molinhthach");')) {
        const marker = 'const duyen = require("../duyen");';

        if (!content.includes(marker)) {
            throw new Error("Không tìm thấy vị trí import duyen trong core/router.js.");
        }

        content = content.replace(
            marker,
            `${marker}\nconst molinhthach = require("../molinhthach");`,
        );
        changed = true;
    }

    const modulesStart = content.indexOf("const modules = {");
    const resolveStart = content.indexOf("\nfunction resolve(", modulesStart);

    if (modulesStart < 0 || resolveStart < 0) {
        throw new Error("Không nhận dạng được object modules trong core/router.js.");
    }

    const modulesBlock = content.slice(modulesStart, resolveStart);

    if (!/\n\s*molinhthach,/.test(modulesBlock)) {
        const marker = "    duyen,\n";

        if (!modulesBlock.includes(marker)) {
            throw new Error("Không tìm thấy duyen trong object modules.");
        }

        const patchedBlock = modulesBlock.replace(
            marker,
            `${marker}    molinhthach,\n`,
        );

        content =
            content.slice(0, modulesStart) +
            patchedBlock +
            content.slice(resolveStart);
        changed = true;
    }

    const buttonsStart = content.indexOf("const modulesWithButtons = [");
    const handlersStart = content.indexOf("\n    const handlers", buttonsStart);

    if (buttonsStart < 0 || handlersStart < 0) {
        throw new Error("Không nhận dạng được modulesWithButtons trong core/router.js.");
    }

    const buttonsBlock = content.slice(buttonsStart, handlersStart);

    if (!/\n\s*molinhthach,/.test(buttonsBlock)) {
        const marker = "        duyen,\n";

        if (!buttonsBlock.includes(marker)) {
            throw new Error("Không tìm thấy duyen trong modulesWithButtons.");
        }

        const patchedBlock = buttonsBlock.replace(
            marker,
            `${marker}        molinhthach,\n`,
        );

        content =
            content.slice(0, buttonsStart) +
            patchedBlock +
            content.slice(handlersStart);
        changed = true;
    }

    if (changed) {
        backupAndWrite(relativePath, content);
    } else {
        console.log("• core/router.js đã được tích hợp từ trước.");
    }
}

function patchCommands() {
    const relativePath = "config/commands.js";
    let content = read(relativePath);

    if (content.includes('handler: "molinhthach.start"')) {
        console.log("• config/commands.js đã có lệnh /molinhthach.");
        return;
    }

    const marker = '    {\n        name: "blackjack",';

    if (!content.includes(marker)) {
        throw new Error("Không tìm thấy lệnh blackjack để chèn /molinhthach.");
    }

    const commandBlock = `    {\n        name: "molinhthach",\n        description: "Đào ô an toàn, né yêu thú và thu hoạch tiền thưởng",\n        handler: "molinhthach.start",\n        options: [\n            {\n                type: "integer",\n                name: "sotien",\n                description: "Tiền cược, tối đa 5% số dư và 500.000",\n                required: true,\n                minValue: 10000,\n                maxValue: GAMBLE_MAX_BET,\n            },\n            {\n                type: "integer",\n                name: "yeuthu",\n                description: "Số yêu thú ẩn trong 25 ô, mặc định 5",\n                required: false,\n                minValue: 1,\n                maxValue: 8,\n            },\n        ],\n    },\n`;

    content = content.replace(marker, commandBlock + marker);
    backupAndWrite(relativePath, content);
}

function patchIndex() {
    const relativePath = "index.js";
    let content = read(relativePath);
    let changed = false;

    if (!content.includes('const molinhthach = require("./molinhthach");')) {
        const marker = 'const raidserver = require("./raidserver");';

        if (!content.includes(marker)) {
            throw new Error("Không tìm thấy import raidserver trong index.js.");
        }

        content = content.replace(
            marker,
            `${marker}\nconst molinhthach = require("./molinhthach");`,
        );
        changed = true;
    }

    if (!content.includes("molinhthach.recover(client)")) {
        const marker = `    raidserver.recover(client).catch((error) => {\n        console.error("[RaidServer Recover]", error);\n    });\n`;

        if (!content.includes(marker)) {
            throw new Error("Không tìm thấy khối raidserver.recover trong index.js.");
        }

        const recoverBlock = `${marker}    molinhthach.recover(client).catch((error) => {\n        console.error("[MoLinhThach Recover]", error);\n    });\n`;

        content = content.replace(marker, recoverBlock);
        changed = true;
    }

    if (changed) {
        backupAndWrite(relativePath, content);
    } else {
        console.log("• index.js đã được tích hợp từ trước.");
    }
}

try {
    ensureGameFiles();
    patchRouter();
    patchCommands();
    patchIndex();

    console.log("\n✅ Cài Mỏ Linh Thạch hoàn tất.");
    console.log("Tiếp theo chạy:");
    console.log("  node --check molinhthach.js");
    console.log("  npm run deploy");
    console.log("  pm2 restart mamubeolng");
} catch (error) {
    console.error("\n❌ Cài đặt thất bại:");
    console.error(error.message || error);
    process.exitCode = 1;
}
