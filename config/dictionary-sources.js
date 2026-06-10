module.exports = {
    sources: {
        base: {
            name: "underthesea",
            url: "https://raw.githubusercontent.com/undertheseanlp/dictionary/master/dictionary/words.txt",
            type: "json-lines-text",
            outputFile: "./data/words.txt",
        },
        contribute: {
            name: "phobo-contribute",
            url: "https://raw.githubusercontent.com/lvdat/phobo-contribute-words/main/accepted-words.txt",
            type: "plain-lines",
            outputFile: "./data/contribute-words.txt",
        },
        minhqndNoiTu: {
            name: "minhqnd-noi-tu-discord",
            url: "https://raw.githubusercontent.com/minhqnd/Noi-Tu-Discord/main/src/assets/wordPairs.json",
            type: "word-pairs-json",
            outputFile: "./data/minhqnd-words.txt",
        },
    },
    outputFile: "./data/official-words.txt",
    filter: {
        phraseLength: 2,
        vietnameseOnly: true,
        removeRepeatedPair: true,
        rejectHyphen: true,
        rejectParentheses: true,
    },
};
