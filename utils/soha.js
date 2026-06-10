const https = require("https");
const { normalizeText } = require("./dictionary");

function encodeSohaWord(word) {
    return encodeURIComponent(normalizeText(word).replace(/\s+/g, "_"));
}

function fetchText(url) {
    return new Promise((resolve, reject) => {
        const request = https.get(
            url,
            {
                headers: {
                    "User-Agent": "Mozilla/5.0 MamuBot Dictionary Checker",
                },
                timeout: 7000,
            },
            (res) => {
                let data = "";

                res.setEncoding("utf8");
                res.on("data", (chunk) => {
                    data += chunk;
                });
                res.on("end", () => {
                    resolve({ statusCode: res.statusCode, body: data });
                });
            },
        );

        request.on("timeout", () => {
            request.destroy(new Error("Soha timeout"));
        });

        request.on("error", reject);
    });
}

function looksLikeValidPage(html, word) {
    const body = String(html).toLowerCase();
    const normalizedWord = normalizeText(word);

    if (body.includes("there is currently no text in this page")) {
        return false;
    }

    if (body.includes("không tồn tại") || body.includes("chưa có nội dung")) {
        return false;
    }

    return body.includes("mw-content-text") && body.includes(normalizedWord);
}

async function checkWordOnSoha(word) {
    const url = `https://tratu.soha.vn/dict/vn_vn/${encodeSohaWord(word)}`;

    try {
        const result = await fetchText(url);

        if (result.statusCode !== 200) {
            return false;
        }

        return looksLikeValidPage(result.body, word);
    } catch (error) {
        console.error(`[SOHA] ${error.message}`);
        return false;
    }
}

module.exports = { checkWordOnSoha };
