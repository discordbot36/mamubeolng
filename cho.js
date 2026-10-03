const { EmbedBuilder } = require("discord.js");
const database = require("./database");

const MAX_WEIGHT_KG = 100;
const FEED_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const FOOD_ID = "thuc_an_cho";
const fmt = database.formatMoney;

function listDogs(userId) {
    return database.getInventory(userId).specialItems
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.type === "dog");
}
function autocomplete(interaction) {
    const query = interaction.options.getFocused().toLowerCase();
    return interaction.respond(listDogs(interaction.user.id)
        .filter(({ item, index }) => `${index} ${item.name}`.toLowerCase().includes(query))
        .slice(0, 25)
        .map(({ item, index }) => ({ name: `${item.name} · ${Number(item.weightKg || 0)}kg · #${index + 1}`.slice(0, 100), value: String(index) })));
}
function getDog(userId, index) {
    const item = database.getInventory(userId).specialItems[Number(index)];
    return item?.type === "dog" ? item : null;
}
function normalizeDog(dog) {
    dog.weightKg = Math.min(MAX_WEIGHT_KG, Math.max(0.1, Number(dog.weightKg || 1)));
    dog.level = Math.max(1, Number(dog.level || 1));
    dog.stage = dog.stage || "Linh Khuyển";
    dog.bond = Number(dog.bond || 0);
    dog.equipmentLevel = Number(dog.equipmentLevel || 0);
    dog.value = Math.round(dog.weightKg * Number(dog.pricePerKg || 1000) * (1 + (dog.level - 1) * 0.08));
    return dog;
}
function power(dog) {
    return Math.floor(dog.weightKg * 10 + dog.level * 25 + dog.equipmentLevel * 120 + Number(dog.evolution || 0) * 250 + dog.bond);
}
function formatCooldown(ms) {
    const hours = Math.floor(ms / 3600000);
    const mins = Math.ceil((ms % 3600000) / 60000);
    return `${hours ? `${hours} giờ ` : ""}${mins} phút`;
}
async function execute(interaction) {
    const action = interaction.options.getString("hanhdong");
    const index = interaction.options.getString("cho");
    const dogs = listDogs(interaction.user.id);
    if (action === "hoso") {
        const lines = dogs.length ? dogs.map(({ item, index: i }) => {
            const d = normalizeDog(item);
            const remaining = Math.max(0, FEED_COOLDOWN_MS - (Date.now() - Number(d.lastFedAt || 0)));
            return `**#${i + 1} ${d.name}** · ${d.weightKg}kg · Lv.${d.level} · ${d.stage}
⚔️ Lực chiến ${power(d)} · 🛡️ ${d.equipment || "Chưa trang bị"}${d.equippedAsPet ? " · 🐾 Đang chiến đấu" : ""}${d.locked ? " · 🔒 Đã khóa" : ""}
🍖 ${remaining ? `Ăn lại sau ${formatCooldown(remaining)}` : "Đã có thể cho ăn"} · 💰 ${fmt(d.value)}`;
        }) : ["Bạn chưa có chó. Hãy bắt chó qua công việc `/work`."];
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x8b5a2b).setTitle("🐕 Chuồng Linh Khuyển").setDescription(lines.join("\n\n"))], ephemeral: true });
    }
    const dog = index === null ? null : getDog(interaction.user.id, index);
    if (!dog) return interaction.reply({ content: "❌ Chọn một con chó trong kho bằng tùy chọn `cho`.", ephemeral: true });
    const d = normalizeDog(dog);
    const newName = interaction.options.getString("tenmoi")?.trim();
    let message = "";
    if (action === "choan") {
        const result = database.updateUser(interaction.user.id, user => {
            const current = user.inventoryItems?.[Number(index)];
            if (!current || current.type !== "dog") return { error: "Không tìm thấy chó." };
            normalizeDog(current);
            if (current.weightKg >= MAX_WEIGHT_KG) return { error: `Chó đã đạt giới hạn ${MAX_WEIGHT_KG}kg.` };
            const wait = FEED_COOLDOWN_MS - (Date.now() - Number(current.lastFedAt || 0));
            if (wait > 0) return { error: `Còn ${formatCooldown(wait)} mới có thể cho chó ăn lại.` };
            if (Number(user.inventory?.[FOOD_ID] || 0) < 1) return { error: "Bạn cần **Thức Ăn Cho Chó**. Hãy mua trong `/shop` rồi thử lại." };
            user.inventory[FOOD_ID] -= 1;
            if (!user.inventory[FOOD_ID]) delete user.inventory[FOOD_ID];
            const grams = Math.min(0.5 + Math.random() * 0.5, MAX_WEIGHT_KG - current.weightKg);
            current.weightKg = Math.round(Math.min(MAX_WEIGHT_KG, current.weightKg + grams) * 10) / 10;
            current.lastFedAt = Date.now();
            current.bond = Math.min(100, Number(current.bond || 0) + 5);
            normalizeDog(current);
            return { grams: Math.max(0, grams), dog: current };
        });
        if (result?.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        message = result.grams <= 0 ? `🍖 ${d.name} đã đạt giới hạn cân nặng **${MAX_WEIGHT_KG}kg**. Đã dùng thức ăn và tăng thân thiết +5.` : `🍖 ${d.name} tăng **${result.grams.toFixed(1)}kg**, hiện nặng **${result.dog.weightKg}kg**. Thân thiết +5.`;
    } else if (action === "datten") {
        if (!newName) return interaction.reply({ content: "❌ Nhập tên mới ở tùy chọn `tenmoi`.", ephemeral: true });
        database.updateUser(interaction.user.id, user => { const target=user.inventoryItems?.[Number(index)]; if (target?.type === "dog") target.name=newName.slice(0,24); });
        message = `🏷️ Đã đặt tên chó thành **${newName.slice(0,24)}**.`;
    } else if (action === "khoa") {
        const locked = database.updateUser(interaction.user.id, user => {
            const target = user.inventoryItems?.[Number(index)];
            if (target?.type !== "dog") return null;
            target.locked = !target.locked;
            return target.locked;
        });
        message = locked ? `🔒 Đã khóa **${d.name}**. Chó bị khóa không thể bán.` : `🔓 Đã mở khóa **${d.name}**.`;
    } else if (action === "dung") {
        if (dog.locked) return interaction.reply({ content: "❌ Hãy mở khóa chó trước khi thay đổi trang bị.", ephemeral: true });
        const equip = !dog.equippedAsPet;
        database.updateUser(interaction.user.id, user => {
            for (const item of user.inventoryItems || []) if (item.type === "dog") item.equippedAsPet = false;
            const target=user.inventoryItems?.[Number(index)]; if (target?.type === "dog") target.equippedAsPet=equip;
        });
        message = equip ? `🐾 Đã trang bị **${d.name}**. Chó cộng sát thương hỗ trợ trong chiến đấu.` : `🐾 Đã tháo **${d.name}** khỏi đội hình.`;
    } else if (action === "huanluyen") {
        const cost = 2500 + d.level * 1800;
        const result = database.updateUser(interaction.user.id, user => { if (user.money < cost) return false; user.money -= cost; dog.level=d.level+1; dog.bond=Math.min(100,d.bond+8); dog.value=Math.round(Number(dog.value||0)*1.12); return true; });
        if (!result) return interaction.reply({ content: `❌ Cần ${fmt(cost)} để huấn luyện.`, ephemeral: true });
        message = `🏃 Huấn luyện thành công! ${d.name} lên **Lv.${dog.level}**, lực chiến **${power(normalizeDog(dog))}**.`;
    } else if (action === "tienhoa") {
        if (d.level < 5 || d.stage !== "Linh Khuyển") return interaction.reply({ content: "❌ Cần Linh Khuyển đạt Lv.5 để tiến hóa.", ephemeral: true });
        const cost=50000;
        const result=database.updateUser(interaction.user.id,user=>{if(user.money<cost||Number(user.inventory?.yeu_dan_thuong||0)<3)return false;user.money-=cost;user.inventory.yeu_dan_thuong-=3;if(!user.inventory.yeu_dan_thuong)delete user.inventory.yeu_dan_thuong;dog.stage="Thiên Khuyển";dog.level=1;dog.evolution=Number(dog.evolution||0)+1;dog.value=Math.round(Number(dog.value||0)*2);return true;});
        if(!result)return interaction.reply({content:`❌ Tiến hóa cần ${fmt(cost)} và 3 Yêu Đan Thường.`,ephemeral:true});
        message=`🌟 ${d.name} tiến hóa thành **Thiên Khuyển**! Lực chiến **${power(normalizeDog(dog))}**.`;
    } else if (action === "trangbi") {
        const cost=12000+d.equipmentLevel*18000;
        const result=database.updateUser(interaction.user.id,user=>{if(user.money<cost)return false;user.money-=cost;dog.equipmentLevel=d.equipmentLevel+1;dog.equipment=["","Giáp Linh Thú","Giáp Huyền Thiết","Giáp Thiên Khuyển"][Math.min(3,dog.equipmentLevel)];return true;});
        if(!result)return interaction.reply({content:`❌ Cần ${fmt(cost)} để rèn trang bị.`,ephemeral:true});
        message=`🛡️ Đã trang bị **${dog.equipment}** cho ${d.name}. Lực chiến **${power(normalizeDog(dog))}**.`;
    } else if (action === "ban") {
        if (dog.locked) return interaction.reply({ content: "❌ Chó đang khóa. Hãy mở khóa trước khi bán.", ephemeral: true });
        if (dog.equippedAsPet) return interaction.reply({ content: "❌ Hãy tháo chó khỏi đội hình trước khi bán.", ephemeral: true });
        const result=database.sellItem(interaction.user.id,`special:${index}`,1);
        if(!result.success)return interaction.reply({content:`❌ ${result.message}`,ephemeral:true});
        message=`💰 Đã bán **${d.name}** với giá **${fmt(result.totalPrice)}**.`;
    } else return interaction.reply({content:"❌ Hành động không hợp lệ.",ephemeral:true});
    return interaction.reply({content:message});
}
module.exports = { execute, autocomplete };
