const { EmbedBuilder } = require("discord.js");
const database = require("./database");

const ACTIONS = ["hoso", "choan", "huanluyen", "tienhoa", "trangbi", "ban"];
const fmt = database.formatMoney;

function listDogs(userId) {
    return database.getInventory(userId).specialItems
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.type === "dog");
}

function autocomplete(interaction) {
    const query = interaction.options.getFocused().toLowerCase();
    const choices = listDogs(interaction.user.id)
        .filter(({ item, index }) => `${index} ${item.name}`.toLowerCase().includes(query))
        .slice(0, 25)
        .map(({ item, index }) => ({ name: `${item.name} · ${item.weightKg || 0}kg · #${index + 1}`.slice(0, 100), value: String(index) }));
    return interaction.respond(choices);
}

function getDog(userId, index) {
    const items = database.getInventory(userId).specialItems;
    const item = items[Number(index)];
    return item?.type === "dog" ? item : null;
}

async function execute(interaction) {
    const action = interaction.options.getString("hanhdong");
    const index = interaction.options.getString("cho");
    const dog = index === null ? null : getDog(interaction.user.id, index);
    const dogs = listDogs(interaction.user.id);

    if (action === "hoso") {
        const lines = dogs.length ? dogs.map(({ item, index: i }) => {
            const d = normalizeDog(item);
            return `**#${i + 1} ${d.name}** · ${d.weightKg}kg · Lv.${d.level} · ${d.stage}\n⚔️ Lực chiến ${power(d)} · 🛡️ ${d.equipment || "Chưa trang bị"} · 💰 ${fmt(d.value)}`;
        }) : ["Bạn chưa có chó. Hãy bắt chó qua công việc `/work`. "];
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x8b5a2b).setTitle("🐕 Chuồng Linh Khuyển").setDescription(lines.join("\n\n"))], ephemeral: true });
    }
    if (!dog) return interaction.reply({ content: "❌ Chọn một con chó trong kho bằng tùy chọn `cho`.", ephemeral: true });

    const d = normalizeDog(dog);
    let message = "";
    if (action === "choan") {
        const cost = 1500 + d.level * 500;
        const result = database.updateUser(interaction.user.id, user => {
            if (user.money < cost) return false;
            user.money -= cost;
            const grams = 0.4 + Math.random() * 0.6;
            dog.weightKg = Math.round((d.weightKg + grams) * 10) / 10;
            dog.value = Math.round(dog.weightKg * Number(dog.pricePerKg || 1000) * (1 + (d.level - 1) * 0.08));
            dog.bond = Math.min(100, d.bond + 5);
            return { grams, balance: user.money };
        });
        if (!result) return interaction.reply({ content: `❌ Cần ${fmt(cost)} để mua thức ăn bổ dưỡng.`, ephemeral: true });
        message = `🍖 ${d.name} tăng **${result.grams.toFixed(1)}kg**, hiện nặng **${dog.weightKg}kg**. Thân thiết +5.`;
    } else if (action === "huanluyen") {
        const cost = 2500 + d.level * 1800;
        const result = database.updateUser(interaction.user.id, user => {
            if (user.money < cost) return false;
            user.money -= cost;
            dog.level = d.level + 1;
            dog.bond = Math.min(100, d.bond + 8);
            dog.value = Math.round(Number(dog.value || 0) * 1.12);
            return true;
        });
        if (!result) return interaction.reply({ content: `❌ Cần ${fmt(cost)} để huấn luyện.`, ephemeral: true });
        message = `🏃 Huấn luyện thành công! ${d.name} lên **Lv.${dog.level}**, lực chiến **${power(normalizeDog(dog))}**.`;
    } else if (action === "tienhoa") {
        if (d.level < 5 || d.stage !== "Linh Khuyển") return interaction.reply({ content: "❌ Cần Linh Khuyển đạt Lv.5 để tiến hóa.", ephemeral: true });
        const cost = 50000;
        const result = database.updateUser(interaction.user.id, user => {
            if (user.money < cost || Number(user.inventory?.yeu_dan_thuong || 0) < 3) return false;
            user.money -= cost;
            user.inventory.yeu_dan_thuong -= 3;
            if (!user.inventory.yeu_dan_thuong) delete user.inventory.yeu_dan_thuong;
            dog.stage = "Thiên Khuyển";
            dog.level = 1;
            dog.evolution = Number(dog.evolution || 0) + 1;
            dog.value = Math.round(Number(dog.value || 0) * 2);
            return true;
        });
        if (!result) return interaction.reply({ content: `❌ Tiến hóa cần ${fmt(cost)} và 3 Yêu Đan Thường.`, ephemeral: true });
        message = `🌟 ${d.name} tiến hóa thành **Thiên Khuyển**! Lực chiến **${power(normalizeDog(dog))}**.`;
    } else if (action === "trangbi") {
        const cost = 12000 + d.equipmentLevel * 18000;
        const result = database.updateUser(interaction.user.id, user => {
            if (user.money < cost) return false;
            user.money -= cost;
            dog.equipmentLevel = d.equipmentLevel + 1;
            dog.equipment = ["", "Giáp Linh Thú", "Giáp Huyền Thiết", "Giáp Thiên Khuyển"][Math.min(3, dog.equipmentLevel)];
            return true;
        });
        if (!result) return interaction.reply({ content: `❌ Cần ${fmt(cost)} để rèn trang bị.`, ephemeral: true });
        message = `🛡️ Đã trang bị **${dog.equipment}** cho ${d.name}. Lực chiến **${power(normalizeDog(dog))}**.`;
    } else if (action === "ban") {
        if (dog.equippedAsPet) return interaction.reply({ content: "❌ Hãy tháo chó khỏi đội hình trước khi bán.", ephemeral: true });
        const result = database.sellItem(interaction.user.id, `special:${index}`, 1);
        if (!result.success) return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
        message = `💰 Đã bán **${d.name}** với giá **${fmt(result.totalPrice)}**.`;
    } else {
        return interaction.reply({ content: "❌ Hành động không hợp lệ.", ephemeral: true });
    }
    return interaction.reply({ content: message });
}

function normalizeDog(dog) {
    dog.weightKg = Number(dog.weightKg || 1);
    dog.level = Math.max(1, Number(dog.level || 1));
    dog.stage = dog.stage || "Linh Khuyển";
    dog.bond = Number(dog.bond || 0);
    dog.equipmentLevel = Number(dog.equipmentLevel || 0);
    return dog;
}

function power(dog) {
    return Math.floor(dog.weightKg * 10 + dog.level * 25 + dog.equipmentLevel * 120 + Number(dog.evolution || 0) * 250 + dog.bond);
}

module.exports = { execute, autocomplete };
