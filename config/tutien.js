module.exports = {
    cultivateCooldownMs: 30 * 60 * 1000,

    cultivate: {
        minExp: 80,
        maxExp: 180,
    },

    breakthrough: {
        successChance: 0.6,
        failExpKeepRate: 0,
    },

    spiritualRoots: [
        {
            id: "tap_linh_can",
            name: "Tạp Linh Căn",
            emoji: "🌫️",
            chance: 45,
            expBonus: 0,
            breakthroughBonus: 0,
            description: "Lợn phàm tục, tu chậm như rùa bò.",
        },
        {
            id: "tam_linh_can",
            name: "Tam Linh Căn",
            emoji: "🍃",
            chance: 25,
            expBonus: 0.05,
            breakthroughBonus: 0.01,
            description: "Cũng có tí linh khí, nhưng vẫn còn mùi cám.",
        },
        {
            id: "song_linh_can",
            name: "Song Linh Căn",
            emoji: "🌊",
            chance: 15,
            expBonus: 0.1,
            breakthroughBonus: 0.02,
            description: "Lợn bắt đầu có dáng dấp tu tiên.",
        },
        {
            id: "don_linh_can",
            name: "Đơn Linh Căn",
            emoji: "🔥",
            chance: 8,
            expBonus: 0.18,
            breakthroughBonus: 0.04,
            description: "Thiên phú khá, đáng để nuôi.",
        },
        {
            id: "thien_linh_can",
            name: "Thiên Linh Căn",
            emoji: "✨",
            chance: 4,
            expBonus: 0.3,
            breakthroughBonus: 0.07,
            description: "Lợn trời sinh, hấp linh khí như húp nước cám.",
        },
        {
            id: "bien_di_linh_can",
            name: "Biến Dị Linh Căn",
            emoji: "🧬",
            chance: 2,
            expBonus: 0.35,
            breakthroughBonus: 0.1,
            description: "Dị chủng trong chuồng heo, càng nhìn càng sợ.",
        },
        {
            id: "hon_don_linh_can",
            name: "Hỗn Độn Linh Căn",
            emoji: "🌌",
            chance: 0.8,
            expBonus: 0.5,
            breakthroughBonus: 0.15,
            description: "Lợn hấp thụ cả thiên địa, mõm có mùi đại đạo.",
        },
        {
            id: "mamu_thanh_can",
            name: "Mamu Thánh Căn",
            emoji: "🐷",
            chance: 0.2,
            expBonus: 0.8,
            breakthroughBonus: 0.2,
            description:
                "Căn cốt cấm kỵ, nghe đồn Mamu từng để lại trong chuồng.",
        },
    ],

    realms: [
        {
            name: "Phàm Lợn",
            maxExp: 500,
            breakthroughChance: 0.9,
        },
        {
            name: "Luyện Khí",
            maxExp: 1500,
            breakthroughChance: 0.8,
        },
        {
            name: "Trúc Cơ",
            maxExp: 5000,
            breakthroughChance: 0.68,
        },
        {
            name: "Kim Đan",
            maxExp: 15000,
            breakthroughChance: 0.55,
        },
        {
            name: "Nguyên Anh",
            maxExp: 50000,
            breakthroughChance: 0.42,
        },
        {
            name: "Hóa Thần",
            maxExp: 150000,
            breakthroughChance: 0.32,
        },
        {
            name: "Luyện Hư",
            maxExp: 500000,
            breakthroughChance: 0.24,
        },
        {
            name: "Hợp Thể",
            maxExp: 1500000,
            breakthroughChance: 0.18,
        },
        {
            name: "Đại Thừa",
            maxExp: 5000000,
            breakthroughChance: 0.12,
        },
        {
            name: "Độ Kiếp",
            maxExp: 15000000,
            breakthroughChance: 0.08,
        },
        {
            name: "Chân Tiên Lợn",
            maxExp: 50000000,
            breakthroughChance: 0.05,
        },
    ],

    defaultProfile: {
        title: "Hệ Thống Tu Tiên",
        danhHieu: "Phàm Trần Tục Tử",
        daoHieu: "Lợn Vô Danh",

        realmIndex: 0,
        floor: 1,
        exp: 0,
        lastCultivate: 0,

        rootId: null,
        linhCan: "Chưa thức tỉnh",
        rootDescription: "Chưa có linh căn",
        rootGachaPillUses: 0,

        theLuc: {
            current: 300,
            max: 300,
        },

        theChat: "Phàm Nhân Chi Khu",
        tongMon: "Chưa có",
        tienLuc: 1245,
        hoaCanh: "Chưa có",
        toaKy: "Chưa có",

        sinhMenh: {
            current: 375,
            max: 375,
        },

        linhLuc: {
            current: 25,
            max: 200,
        },

        tocDo: 24,
        congKich: 35,
        phongNgu: 20,
        baoKich: 50,
        neTranh: 70,
    },

    thumbnail: "https://media.tenor.com/4M5Nqjv8KJAAAAAd/chihuahua-dog.gif",

    footerText: "Chúc đạo hữu sớm ngày đắc đạo thành tiên !",

    messages: {
        cooldown: "⏳ Lợn của bạn vừa tu luyện xong, để nó thở tí đã.",
        needRoot:
            "❌ Lợn của bạn chưa thức tỉnh linh căn. Dùng /tutien rồi bấm nút gacha linh căn trước.",
        alreadyRoot: "⚠️ Lợn của bạn đã có linh căn rồi, đừng tham.",
    },
};
