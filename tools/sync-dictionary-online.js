const fs = require("fs");
const path = require("path");
const https = require("https");
const dictionarySources = require("../config/dictionary-sources");

function normalizeText(text) {
    return String(text)
        .toLowerCase()
        .trim()
        .normalize("NFC")
        .replace(/\s+/g, " ");
}

function ensureDir(filePath) {
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function resolveProjectPath(relativePath) {
    return path.resolve(__dirname, "..", relativePath);
}

function countParts(text) {
    return normalizeText(text).split(" ").filter(Boolean).length;
}

function hasRepeatedPair(text) {
    const parts = normalizeText(text).split(" ").filter(Boolean);

    return parts.length === 2 && parts[0] === parts[1];
}

function isVietnameseLike(text) {
    return /^[a-zàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ\s]+$/i.test(
        text,
    );
}

function isValidWord(word) {
    const normalized = normalizeText(word);
    const filter = dictionarySources.filter;

    if (!normalized) {
        return false;
    }

    if (countParts(normalized) !== filter.phraseLength) {
        return false;
    }

    if (filter.rejectHyphen && normalized.includes("-")) {
        return false;
    }

    if (filter.rejectParentheses && /[()]/.test(normalized)) {
        return false;
    }

    if (filter.vietnameseOnly && !isVietnameseLike(normalized)) {
        return false;
    }

    if (filter.removeRepeatedPair && hasRepeatedPair(normalized)) {
        return false;
    }

    return true;
}

function parseWords(raw, source) {
    if (source.type === "json-lines-text") {
        return raw
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                try {
                    const item = JSON.parse(line);

                    return item.text || "";
                } catch {
                    return line;
                }
            })
            .map(normalizeText)
            .filter(isValidWord);
    }

    if (source.type === "word-pairs-json") {
        const words = [];

        let data;

        try {
            data = JSON.parse(raw);
        } catch (error) {
            throw new Error(
                `Không parse được wordPairs JSON: ${error.message}`,
            );
        }

        if (Array.isArray(data)) {
            for (const item of data) {
                const word = normalizeText(item);

                if (isValidWord(word)) {
                    words.push(word);
                }
            }

            return words;
        }

        for (const [firstPart, secondParts] of Object.entries(data)) {
            if (!Array.isArray(secondParts)) {
                continue;
            }

            for (const secondPart of secondParts) {
                const word = normalizeText(`${firstPart} ${secondPart}`);

                if (isValidWord(word)) {
                    words.push(word);
                }
            }
        }

        return words;
    }

    return raw.split(/\r?\n/).map(normalizeText).filter(isValidWord);
}

function downloadText(url) {
    return new Promise((resolve, reject) => {
        https
            .get(url, (res) => {
                if (
                    res.statusCode >= 300 &&
                    res.statusCode < 400 &&
                    res.headers.location
                ) {
                    resolve(downloadText(res.headers.location));
                    return;
                }

                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}: ${url}`));
                    return;
                }

                let data = "";

                res.setEncoding("utf8");
                res.on("data", (chunk) => {
                    data += chunk;
                });
                res.on("end", () => {
                    resolve(data);
                });
            })
            .on("error", reject);
    });
}

async function syncSource(source) {
    console.log(`[SYNC] Downloading ${source.name}`);
    const raw = await downloadText(source.url);
    const words = parseWords(raw, source);
    const outputPath = resolveProjectPath(source.outputFile);

    ensureDir(outputPath);
    fs.writeFileSync(outputPath, words.join("\n"), "utf8");
    console.log(`[SYNC] ${source.name}: ${words.length} words`);

    return words;
}

async function main() {
    const allWords = new Set();

    for (const source of Object.values(dictionarySources.sources)) {
        try {
            const words = await syncSource(source);

            for (const word of words) {
                allWords.add(word);
            }
        } catch (error) {
            console.error(`[SYNC] Failed ${source.name}`);
            console.error(error.message);
        }
    }

    const outputPath = resolveProjectPath(dictionarySources.outputFile);
    const sortedWords = Array.from(allWords).sort((a, b) =>
        a.localeCompare(b, "vi"),
    );

    ensureDir(outputPath);
    fs.writeFileSync(outputPath, sortedWords.join("\n"), "utf8");
    console.log(
        `[SYNC] Done. Saved ${sortedWords.length} words to ${outputPath}`,
    );
}

main();
