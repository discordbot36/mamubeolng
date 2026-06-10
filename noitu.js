const { addMoney, addWin, formatMoney } = require("./database");

const noituConfig = require("./config/noitu");

const {
    normalizeText,
    getFirstWord,
    getLastWord,
    isValidVietnameseWord,
    countWords,
    getOfficialWords,
    getRandomPlayableWord,
    reloadDictionary,
} = require("./utils/dictionary");

const games = new Map();

function getGameKey(guildId, channelId) {
    return `${guildId}_${channelId}`;
}

function countWordParts(word) {
    return normalizeText(word).split(" ").filter(Boolean).length;
}

function isTwoWordPhrase(word) {
    return countWordParts(word) === 2;
}

function getValidWords() {
    return getOfficialWords().filter((word) => {
        return isTwoWordPhrase(word);
    });
}

function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function findNextValidWord(currentWord, usedWords) {
    const requiredWord = getLastWord(currentWord);

    const choices = getValidWords().filter((word) => {
        const normalizedWord = normalizeText(word);

        return (
            getFirstWord(normalizedWord) === requiredWord &&
            !usedWords.has(normalizedWord)
        );
    });

    if (choices.length <= 0) {
        return null;
    }

    return pickRandom(choices);
}

function getRewardPerCorrect() {
    return Number(noituConfig.rewardPerCorrect || 0);
}

function getBotStuckReward() {
    return Number(
        noituConfig.botStuckReward ||
            noituConfig.winReward ||
            noituConfig.rewardPerCorrect ||
            0,
    );
}

function getForfeitWinReward() {
    return Number(
        noituConfig.forfeitWinReward ||
            noituConfig.winReward ||
            noituConfig.rewardPerCorrect ||
            0,
    );
}

function createNewGameState(startedBy = null) {
    const words = getValidWords();

    if (words.length <= 0) {
        return null;
    }

    const firstWord =
        getRandomPlayableWord() ||
        words[Math.floor(Math.random() * words.length)];

    return {
        firstWord,
        state: {
            currentWord: normalizeText(firstWord),
            usedWords: new Set([normalizeText(firstWord)]),
            score: 0,
            startedBy,
            lastPlayerId: null,
            lastWinnerId: null,
            lastWinnerWord: null,
            playerScores: {},
        },
    };
}

function getForfeitRewardPlayers(game) {
    const minCorrect = Number(noituConfig.forfeitMinCorrect || 10);
    const rewardRate = Number(noituConfig.forfeitRewardRate ?? 0.5);
    const baseReward = getForfeitWinReward();
    const reward = Math.floor(baseReward * rewardRate);

    if (!game.playerScores || reward <= 0) {
        return [];
    }

    return Object.entries(game.playerScores)
        .filter(([, correctCount]) => Number(correctCount || 0) >= minCorrect)
        .map(([userId, correctCount]) => ({
            userId,
            correctCount: Number(correctCount || 0),
            reward,
        }));
}

async function safeReact(message, emoji) {
    try {
        await message.react(emoji);
    } catch (error) {
        console.error(error);
    }
}

async function autoStartNextGame(message, oldGame = null) {
    const key = getGameKey(message.guildId, message.channelId);
    const newGame = createNewGameState(oldGame?.startedBy || null);

    if (!newGame) {
        return message.channel.send(
            `❌ Không thể tự mở ván mới vì chưa có data nối từ.\n` +
                `Hãy chạy: \`node tools/sync-noitu-dictionary.js\``,
        );
    }

    games.set(key, newGame.state);

    return message.channel.send(
        `🔄 Tự động mở ván nối từ mới!\n\n` +
            `🤖 Bot ra đề: **${newGame.firstWord}**\n\n` +
            `👉 Tất cả có thể chat cụm **2 từ** bắt đầu bằng: **${getLastWord(newGame.firstWord)}**\n` +
            `💰 Nối đúng nhận: **${formatMoney(getRewardPerCorrect())}**\n` +
            `🏆 Làm bot bí từ nhận thêm: **${formatMoney(getBotStuckReward())}**`,
    );
}

class NoiTuManager {
    async start(interaction) {
        const words = getValidWords();

        if (words.length <= 0) {
            return interaction.reply({
                content:
                    `❌ Chưa có data nối từ\n` +
                    `Hãy chạy: node tools/sync-noitu-dictionary.js`,
                ephemeral: true,
            });
        }

        const key = getGameKey(interaction.guildId, interaction.channelId);

        if (games.has(key)) {
            const game = games.get(key);

            return interaction.reply({
                content:
                    `⚠️ Channel này đang có ván nối từ rồi!\n\n` +
                    `Từ hiện tại: **${game.currentWord}**\n` +
                    `👉 Chat cụm **2 từ** bắt đầu bằng: **${getLastWord(game.currentWord)}**`,
                ephemeral: true,
            });
        }

        const newGame = createNewGameState(interaction.user.id);

        if (!newGame) {
            return interaction.reply({
                content:
                    `❌ Chưa có data nối từ\n` +
                    `Hãy chạy: node tools/sync-noitu-dictionary.js`,
                ephemeral: true,
            });
        }

        const firstWord = newGame.firstWord;

        games.set(key, newGame.state);

        return interaction.reply({
            content:
                `${interaction.user} bắt đầu game nối từ cho cả channel\n\n` +
                `🤖 Bot ra đề: **${firstWord}**\n\n` +
                `👉 Tất cả có thể chat cụm **2 từ** bắt đầu bằng: **${getLastWord(firstWord)}**\n` +
                `💰 Nối đúng nhận: **${formatMoney(getRewardPerCorrect())}**\n` +
                `🏆 Làm bot bí từ nhận thêm: **${formatMoney(getBotStuckReward())}**`,
        });
    }

    async handleMessage(message) {
        if (message.author.bot) {
            return undefined;
        }

        if (!message.guildId) {
            return undefined;
        }

        if (message.content.startsWith("/")) {
            return undefined;
        }

        const content = normalizeText(message.content);

        if (content === "!dic-count") {
            return message.reply(`📚 Từ điển đang có ${countWords()} từ`);
        }

        if (content === "!dic-reload") {
            const total = reloadDictionary();

            return message.reply(`🔄 Đã reload từ điển: ${total} từ`);
        }

        if (content === "!noitu-stop") {
            return this.stopByMessage(message);
        }

        if (content.startsWith("!check ")) {
            const word = normalizeText(content.replace("!check ", ""));

            if (!word) {
                return message.reply("❌ Nhập từ cần check đi anh bạn");
            }

            if (!isTwoWordPhrase(word)) {
                return message.reply(
                    `❌ **${word}** không hợp lệ\n` +
                        `Chỉ được dùng cụm **2 từ**`,
                );
            }

            if (isValidVietnameseWord(word)) {
                return message.reply(`✅ **${word}** hợp lệ`);
            }

            return message.reply(`❌ **${word}** không có trong từ điển`);
        }

        const key = getGameKey(message.guildId, message.channelId);
        const game = games.get(key);

        if (!game) {
            return undefined;
        }

        if (content === "!thua") {
            const nextWord = findNextValidWord(
                game.currentWord,
                game.usedWords,
            );

            const winnerId = game.lastWinnerId;
            const winnerWord = game.lastWinnerWord || game.currentWord;
            const forfeitWinReward = getForfeitWinReward();
            const rewardPlayers = getForfeitRewardPlayers(game);

            games.delete(key);

            let winnerText =
                "Không có người thắng vì chưa ai nối đúng câu nào.";

            if (winnerId && forfeitWinReward > 0) {
                addMoney(winnerId, forfeitWinReward);
                addWin(winnerId);

                winnerText =
                    `🏆 Người thắng: <@${winnerId}>\n` +
                    `Từ thắng: **${winnerWord}**\n` +
                    `💰 Thưởng thắng: **${formatMoney(forfeitWinReward)}**`;
            }

            for (const player of rewardPlayers) {
                if (player.userId !== winnerId) {
                    addMoney(player.userId, player.reward);
                }
            }

            const rewardText =
                rewardPlayers.filter((player) => player.userId !== winnerId)
                    .length > 0
                    ? rewardPlayers
                          .filter((player) => player.userId !== winnerId)
                          .map((player) => {
                              return (
                                  `<@${player.userId}> nối đúng **${player.correctCount}** câu ` +
                                  `→ nhận **${formatMoney(player.reward)}**`
                              );
                          })
                          .join("\n")
                    : "Không ai đủ điều kiện nhận thưởng an ủi.";

            if (!nextWord) {
                await message.reply(
                    `${message.author} chịu thua\n\n` +
                        `Từ hiện tại: **${game.currentWord}**\n` +
                        `Bot cũng không tìm thấy từ hợp lệ tiếp theo.\n\n` +
                        `${winnerText}\n\n` +
                        `🎁 Thưởng an ủi:\n${rewardText}\n\n` +
                        `🏁 Ván nối từ kết thúc.`,
                );

                return autoStartNextGame(message, game);
            }

            await message.reply(
                `${message.author} chịu thua\n\n` +
                    `Từ hiện tại: **${game.currentWord}**\n` +
                    `Từ hợp lệ tiếp theo là: **${nextWord}**\n\n` +
                    `${winnerText}\n\n` +
                    `🎁 Thưởng an ủi:\n${rewardText}\n\n` +
                    `🏁 Ván nối từ kết thúc.`,
            );

            return autoStartNextGame(message, game);
        }

        const rawPlayerWord = message.content;
        const playerWord = normalizeText(rawPlayerWord);

        if (!isTwoWordPhrase(playerWord)) {
            return undefined;
        }

        const requiredWord = getLastWord(game.currentWord);
        const playerFirstWord = getFirstWord(playerWord);

        if (playerFirstWord !== requiredWord) {
            return undefined;
        }

        if (game.lastPlayerId === message.author.id) {
            return message.reply(
                `${message.author} vừa nối rồi, chờ người khác chơi đã`,
            );
        }

        if (!isValidVietnameseWord(playerWord)) {
            return safeReact(message, "❌");
        }

        if (game.usedWords.has(playerWord)) {
            return safeReact(message, "❌");
        }

        game.usedWords.add(playerWord);
        game.currentWord = playerWord;
        game.score += 1;
        game.lastPlayerId = message.author.id;
        game.lastWinnerId = message.author.id;
        game.lastWinnerWord = rawPlayerWord;

        if (!game.playerScores) {
            game.playerScores = {};
        }

        game.playerScores[message.author.id] =
            Number(game.playerScores[message.author.id] || 0) + 1;

        const correctReward = getRewardPerCorrect();

        if (correctReward > 0) {
            addMoney(message.author.id, correctReward);
        }

        await safeReact(message, "✅");

        const nextWord = findNextValidWord(playerWord, game.usedWords);

        if (!nextWord) {
            games.delete(key);

            const botStuckReward = getBotStuckReward();

            if (botStuckReward > 0) {
                addMoney(message.author.id, botStuckReward);
            }

            addWin(message.author.id);

            await message.channel.send(
                `🏆 ${message.author} làm bot bí từ và thắng nối từ!\n\n` +
                    `Từ cuối cùng: **${rawPlayerWord}**\n` +
                    `Bot bí từ ở chữ: **${getLastWord(playerWord)}**\n\n` +
                    `💰 Thưởng nối đúng: **${formatMoney(correctReward)}**\n` +
                    `🎁 Thưởng làm bot bí từ: **${formatMoney(botStuckReward)}**\n` +
                    `🏁 Ván nối từ kết thúc.`,
            );

            return autoStartNextGame(message, game);
        }

        return undefined;
    }

    async stop(interaction) {
        const key = getGameKey(interaction.guildId, interaction.channelId);

        if (!games.has(key)) {
            return interaction.reply({
                content: noituConfig.messages.noGame,
                ephemeral: true,
            });
        }

        games.delete(key);

        return interaction.reply({
            content: `${interaction.user} đã dừng game nối từ`,
        });
    }

    async stopByMessage(message) {
        const key = getGameKey(message.guildId, message.channelId);

        if (!games.has(key)) {
            return message.reply(noituConfig.messages.noGame);
        }

        games.delete(key);

        return message.reply(`${message.author} đã dừng game nối từ`);
    }
}

module.exports = new NoiTuManager();
