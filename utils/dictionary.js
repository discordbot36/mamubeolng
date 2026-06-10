const fs = require("fs");
const path = require("path");

const officialWordsPath = path.resolve(__dirname, "../data/official-words.txt");
const customWordsPath = path.resolve(__dirname, "../data/custom-words.txt");
const reportWordsPath = path.resolve(__dirname, "../data/report-words.txt");

let dictionary = new Set();
let reportDictionary = new Set();
let wordList = [];
let wordMap = new Map();

function normalizeText(text) {
    return String(text)
        .toLowerCase()
        .trim()
        .normalize("NFC")
        .replace(/\s+/g, " ");
}

function ensureFile(filePath) {
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, "", "utf8");
    }
}

function readWordsFromFile(filePath) {
    ensureFile(filePath);

    return fs
        .readFileSync(filePath, "utf8")
        .split(/\r?\n/)
        .map(normalizeText)
        .filter(Boolean);
}

function getFirstWord(text) {
    return normalizeText(text).split(" ")[0];
}

function getLastWord(text) {
    const parts = normalizeText(text).split(" ");

    return parts[parts.length - 1];
}

function buildWordMap(words) {
    const map = new Map();

    for (const word of words) {
        const firstWord = getFirstWord(word);

        if (!map.has(firstWord)) {
            map.set(firstWord, []);
        }

        map.get(firstWord).push(word);
    }

    return map;
}

function loadDictionary() {
    const officialWords = readWordsFromFile(officialWordsPath);
    const customWords = readWordsFromFile(customWordsPath);
    const reportWords = readWordsFromFile(reportWordsPath);

    reportDictionary = new Set(reportWords);

    dictionary = new Set(
        [...officialWords, ...customWords]
            .map(normalizeText)
            .filter(Boolean)
            .filter((word) => !reportDictionary.has(word)),
    );

    wordList = Array.from(dictionary);
    wordMap = buildWordMap(wordList);

    console.log(`[DICTIONARY] Loaded ${dictionary.size} words`);
}

function isValidVietnameseWord(word) {
    return dictionary.has(normalizeText(word));
}

function countWords() {
    return dictionary.size;
}

function getOfficialWords() {
    return wordList;
}

function getWordsStartingWith(firstWord) {
    return wordMap.get(normalizeText(firstWord)) || [];
}

function getRandomWord() {
    if (wordList.length <= 0) {
        return null;
    }

    return wordList[Math.floor(Math.random() * wordList.length)];
}

function getRandomPlayableWord(maxTries = 500) {
    if (wordList.length <= 0) {
        return null;
    }

    for (let i = 0; i < maxTries; i++) {
        const word = getRandomWord();
        const lastWord = getLastWord(word);
        const answers = getWordsStartingWith(lastWord).filter((item) => item !== word);

        if (answers.length > 0) {
            return word;
        }
    }

    return getRandomWord();
}

function reloadDictionary() {
    loadDictionary();

    return dictionary.size;
}

function addWordToCustomList(word) {
    const normalizedWord = normalizeText(word);

    if (!normalizedWord || dictionary.has(normalizedWord)) {
        return false;
    }

    fs.appendFileSync(customWordsPath, `${normalizedWord}\n`, "utf8");
    loadDictionary();

    return true;
}

function addWordToReportList(word) {
    const normalizedWord = normalizeText(word);

    if (!normalizedWord || reportDictionary.has(normalizedWord)) {
        return false;
    }

    reportDictionary.add(normalizedWord);

    fs.writeFileSync(
        reportWordsPath,
        Array.from(reportDictionary).join("\n"),
        "utf8",
    );

    loadDictionary();

    return true;
}

loadDictionary();

module.exports = {
    normalizeText,
    getFirstWord,
    getLastWord,
    isValidVietnameseWord,
    countWords,
    getOfficialWords,
    getWordsStartingWith,
    getRandomWord,
    getRandomPlayableWord,
    reloadDictionary,
    addWordToCustomList,
    addWordToReportList,
};
