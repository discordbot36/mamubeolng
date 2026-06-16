const { GAMBLE_MAX_BET } = require("./gamble");

module.exports = [
    {
        name: "race",
        description: "Bắt đầu cuộc đua",
        handler: "race.start",
    },
    {
        name: "sodu",
        description: "Xem số dư",
        handler: "economy.balance",
    },
    {
        name: "diemdanh",
        description: "Điểm danh nhận thưởng",
        handler: "economy.daily",
    },
    {
        name: "shop",
        description: "Xem shop",
        handler: "economy.shop",
        options: [
            {
                type: "string",
                name: "muc",
                description: "Chọn mục shop muốn xem",
                required: false,
                choices: [
                    {
                        name: "Tất cả",
                        value: "all",
                    },
                    {
                        name: "Pháp bảo",
                        value: "phapbao",
                    },
                    {
                        name: "Tu tiên",
                        value: "tutien",
                    },
                    {
                        name: "Vật phẩm thường",
                        value: "normal",
                    },
                ],
            },
        ],
    },
    {
        name: "mua",
        description: "Mua vật phẩm",
        handler: "economy.buy",
        autocomplete: "economy.autocompleteShop",
        options: [
            {
                type: "string",
                name: "vatpham",
                description: "Chọn vật phẩm",
                required: true,
                autocomplete: true,
            },
            {
                type: "integer",
                name: "soluong",
                description: "Số lượng muốn mua",
                required: false,
                minValue: 1,
            },
        ],
    },
    {
        name: "ban",
        description: "Bán vật phẩm trong kho",
        handler: "economy.sell",
        autocomplete: "economy.autocompleteInventory",
        options: [
            {
                type: "string",
                name: "vatpham",
                description: "Chọn vật phẩm muốn bán",
                required: true,
                autocomplete: true,
            },
            {
                type: "integer",
                name: "soluong",
                description: "Số lượng muốn bán",
                required: false,
                minValue: 1,
            },
        ],
    },
    {
        name: "khodo",
        description: "Xem kho đồ",
        handler: "economy.inventory",
    },
    {
        name: "mophapbao",
        description: "Mở rương pháp bảo",
        handler: "phapbao.openChest",
        autocomplete: "phapbao.autocompleteChest",
        options: [
            {
                type: "string",
                name: "ruong",
                description: "Chọn rương pháp bảo muốn mở",
                required: true,
                autocomplete: true,
            },
            {
                type: "integer",
                name: "soluong",
                description: "Số lượng muốn mở, tối đa 10",
                required: false,
                minValue: 1,
                maxValue: 10,
            },
        ],
    },
    {
        name: "phapbao",
        description: "Xem kho pháp bảo của bạn",
        handler: "phapbao.listWeapons",
        options: [
            {
                type: "integer",
                name: "trang",
                description: "Trang muốn xem",
                required: false,
                minValue: 1,
            },
        ],
    },
    {
        name: "giamdinh",
        description:
            "Giám định pháp bảo chưa mở để roll rarity thật, phẩm định và dòng phụ",
        handler: "phapbao.appraiseWeapon",
        autocomplete: "phapbao.autocompleteUnidentifiedWeapon",
        options: [
            {
                type: "string",
                name: "phapbao",
                description: "Chọn pháp bảo chưa giám định",
                required: true,
                autocomplete: true,
            },
        ],
    },
    {
        name: "trangbi",
        description: "Trang bị pháp bảo đã giám định",
        handler: "phapbao.equipWeapon",
        autocomplete: "phapbao.autocompleteIdentifiedWeapon",
        options: [
            {
                type: "string",
                name: "phapbao",
                description: "Chọn pháp bảo đã giám định",
                required: true,
                autocomplete: true,
            },
        ],
    },
    {
        name: "phangiai",
        description: "Phân giải pháp bảo để nhận mảnh pháp bảo",
        handler: "phapbao.dismantleWeapon",
        autocomplete: "phapbao.autocompleteAnyWeapon",
        options: [
            {
                type: "string",
                name: "phapbao",
                description: "Chọn 1 pháp bảo muốn phân giải",
                required: false,
                autocomplete: true,
            },
            {
                type: "string",
                name: "phamvi",
                description: "Phân giải hàng loạt theo rarity",
                required: false,
                choices: [
                    {
                        name: "Từ C trở xuống",
                        value: "C",
                    },
                    {
                        name: "Từ A trở xuống",
                        value: "A",
                    },
                ],
            },
            {
                type: "integer",
                name: "soluong",
                description:
                    "Số lượng tối đa muốn phân giải, mặc định 10, tối đa 50",
                required: false,
                minValue: 1,
                maxValue: 50,
            },
            {
                type: "string",
                name: "xacnhan",
                description: "Xác nhận phân giải hàng loạt",
                required: false,
                choices: [
                    {
                        name: "Đồng ý",
                        value: "dongy",
                    },
                ],
            },
        ],
    },
    {
        name: "nangsao",
        description: "Nâng sao pháp bảo bằng các bản trùng đã giám định",
        handler: "phapbao.upgradeWeaponStars",
        autocomplete: "phapbao.autocompleteUpgradeableWeapon",
        options: [
            {
                type: "string",
                name: "phapbao",
                description: "Chọn pháp bảo chính muốn nâng sao",
                required: true,
                autocomplete: true,
            },
        ],
    },
    {
        name: "rollphapbao",
        description:
            "Roll lại dòng phụ pháp bảo, có thể khóa dòng bằng số thứ tự",
        handler: "phapbao.rerollWeaponSubStats",
        autocomplete: "phapbao.autocompleteIdentifiedWeapon",
        options: [
            {
                type: "string",
                name: "phapbao",
                description: "Chọn pháp bảo đã giám định",
                required: true,
                autocomplete: true,
            },
            {
                type: "string",
                name: "khoa",
                description:
                    "Dòng muốn khóa, ví dụ: 1,3 hoặc 1 3. Bỏ trống nếu không khóa",
                required: false,
            },
        ],
    },
    {
        name: "phapbao_info",
        description: "Xem hướng dẫn hệ thống pháp bảo",
        handler: "phapbao.phapBaoInfo",
        options: [
            {
                type: "string",
                name: "muc",
                description: "Chọn mục hướng dẫn",
                required: false,
                choices: [
                    {
                        name: "Tổng quan",
                        value: "tongquan",
                    },
                    {
                        name: "Rương",
                        value: "ruong",
                    },
                    {
                        name: "Giám định",
                        value: "giamdinh",
                    },
                    {
                        name: "Nâng cấp",
                        value: "nangcap",
                    },
                    {
                        name: "EX",
                        value: "ex",
                    },
                ],
            },
        ],
    },
    {
        name: "ghep",
        description: "Dùng Mảnh Pháp Bảo để ghép phôi pháp bảo chưa giám định",
        handler: "phapbao.mergeWeapon",
        options: [
            {
                type: "string",
                name: "rarity",
                description: "Chọn cấp phôi muốn ghép",
                required: true,
                choices: [
                    {
                        name: "F - 30 mảnh",
                        value: "F",
                    },
                    {
                        name: "E - 80 mảnh",
                        value: "E",
                    },
                    {
                        name: "D - 200 mảnh",
                        value: "D",
                    },
                    {
                        name: "C - 600 mảnh",
                        value: "C",
                    },
                    {
                        name: "B - 1,800 mảnh",
                        value: "B",
                    },
                    {
                        name: "A - 6,000 mảnh",
                        value: "A",
                    },
                    {
                        name: "S - 22,000 mảnh",
                        value: "S",
                    },
                    {
                        name: "SS - 90,000 mảnh",
                        value: "SS",
                    },
                    {
                        name: "SSS - 400,000 mảnh",
                        value: "SSS",
                    },
                ],
            },
        ],
    },
    {
        name: "khoaphapbao",
        description: "Khóa hoặc mở khóa pháp bảo để tránh phân giải nhầm",
        handler: "phapbao.lockWeapon",
        autocomplete: "phapbao.autocompleteAnyWeapon",
        options: [
            {
                type: "string",
                name: "phapbao",
                description: "Chọn pháp bảo",
                required: true,
                autocomplete: true,
            },
            {
                type: "string",
                name: "hanhdong",
                description: "Khóa hoặc mở khóa pháp bảo",
                required: true,
                choices: [
                    {
                        name: "Khóa",
                        value: "khoa",
                    },
                    {
                        name: "Mở khóa",
                        value: "mokhoa",
                    },
                ],
            },
        ],
    },
    {
        name: "thaophapbao",
        description: "Tháo pháp bảo đang trang bị",
        handler: "phapbao.unequipWeapon",
    },
    {
        name: "tuthien",
        description: "Đời là thế thôi",
        handler: "economy.transfer",
        options: [
            {
                type: "user",
                name: "anhemxahoi",
                description: "Người nhận tiền",
                required: true,
            },
            {
                type: "integer",
                name: "sotienbothi",
                description: "Số tiền",
                required: true,
                minValue: 1,
            },
        ],
    },
    {
        name: "work",
        description: "Đi làm kiếm tiền",
        handler: "work.start",
        autocomplete: "work.autocomplete",
        options: [
            {
                type: "string",
                name: "job",
                description: "Chọn việc để làm",
                required: true,
                autocomplete: true,
            },
        ],
    },
    {
        name: "noitu",
        description: "Chơi nối từ farm tiền",
        handler: "noitu.start",
    },
    {
        name: "dothach",
        description: "Đổ thạch cắt đá",
        handler: "dothach.start",
        autocomplete: "dothach.autocomplete",
        options: [
            {
                type: "string",
                name: "da",
                description: "Chọn loại đá muốn cắt",
                required: true,
                autocomplete: true,
            },
        ],
    },
    {
        name: "giaidothach_mo",
        description: "Admin mở đăng ký giải đổ thạch",
        handler: "dothachTournament.open",
        adminOnly: true,
        defaultMemberPermissions: "8",
        dmPermission: false,
        options: [
            {
                type: "integer",
                name: "phi",
                description: "Phí tham gia, mặc định 2000",
                required: false,
                minValue: 1,
            },
        ],
    },
    {
        name: "giaidothach_batdau",
        description: "Admin bắt đầu giải và tạo channel tạm",
        handler: "dothachTournament.start",
        adminOnly: true,
        defaultMemberPermissions: "8",
        dmPermission: false,
    },
    {
        name: "giaidothach_addda",
        description: "Admin thêm đá tạm vào giải đổ thạch",
        handler: "dothachTournament.addStone",
        adminOnly: true,
        defaultMemberPermissions: "8",
        dmPermission: false,
        options: [
            {
                type: "integer",
                name: "soluong",
                description: "Số viên đá tạm muốn thêm",
                required: true,
                minValue: 1,
                maxValue: 100,
            },
            {
                type: "string",
                name: "ten",
                description: "Tên đá hiển thị, bỏ trống là Đá giải Mamu",
                required: false,
            },
        ],
    },
    {
        name: "giaidothach_ketqua",
        description: "Admin chốt giải và xuất BXH, không tự trả thưởng",
        handler: "dothachTournament.finish",
        adminOnly: true,
        defaultMemberPermissions: "8",
        dmPermission: false,
    },
    {
        name: "giaidothach_huy",
        description: "Admin hủy giải và hoàn phí người chơi",
        handler: "dothachTournament.cancel",
        adminOnly: true,
        defaultMemberPermissions: "8",
        dmPermission: false,
    },
    {
        name: "baucua",
        description: "Chơi bầu cua",
        handler: "baucua.start",
    },
    {
        name: "taixiu",
        description: "Mở sòng tài xỉu 8386",
        handler: "taixiu.start",
    },
    {
        name: "adminchat",
        description: "Admin chat ẩn danh bằng bot",
        handler: "admin.anonSay",
        adminOnly: true,
        defaultMemberPermissions: "8",
        dmPermission: false,
        options: [
            {
                type: "channel",
                name: "kenh",
                description: "Kênh muốn gửi tin nhắn",
                required: true,
                channelTypes: [0],
            },
            {
                type: "string",
                name: "noidung",
                description: "Nội dung muốn bot gửi",
                required: true,
            },
        ],
    },
    {
        name: "activerain",
        description:
            "Admin rain cho người tương tác tốt, ngẫu nhiên hoặc chỉ định",
        handler: "admin.activeRain",
        adminOnly: true,
        dmPermission: false,
        options: [
            {
                type: "integer",
                name: "sotien",
                description: "Tổng số tiền muốn rain",
                required: true,
                minValue: 1000,
            },
            {
                type: "integer",
                name: "songuoi",
                description: "Tổng số người được tag nhận quà",
                required: true,
                minValue: 1,
                maxValue: 20,
            },
            {
                type: "integer",
                name: "ngaunhien",
                description:
                    "Số suất ngẫu nhiên, phần còn lại sẽ lấy theo tương tác tốt",
                required: false,
                minValue: 0,
                maxValue: 20,
            },
            {
                type: "string",
                name: "chon",
                description:
                    "Tag hoặc ID người muốn chọn sẵn, ví dụ: @A @B 123456",
                required: false,
            },
            {
                type: "channel",
                name: "kenh",
                description:
                    "Kênh cần lọc tương tác, bỏ trống là kênh hiện tại",
                required: false,
                channelTypes: [0],
            },
        ],
    },
    {
        name: "addmoney",
        description: "Admin cộng tiền cho user",
        handler: "admin.addMoney",
        adminOnly: true,
        defaultMemberPermissions: "8",
        dmPermission: false,
        options: [
            {
                type: "user",
                name: "user",
                description: "Người nhận tiền",
                required: true,
            },
            {
                type: "integer",
                name: "amount",
                description: "Số tiền muốn cộng",
                required: true,
                minValue: 1,
            },
        ],
    },
    {
        name: "removemoney",
        description: "Admin trừ tiền của user",
        handler: "admin.removeMoney",
        adminOnly: true,
        defaultMemberPermissions: "0",
        options: [
            {
                type: "user",
                name: "user",
                description: "Người bị trừ tiền",
                required: true,
            },
            {
                type: "integer",
                name: "amount",
                description: "Số tiền muốn trừ",
                required: true,
                minValue: 1,
            },
        ],
    },

    {
        name: "tutien",
        description: "Xem profile tu tiên",
        handler: "tutien.profile",
    },
    {
        name: "daohieu",
        description: "Đặt đạo hiệu tu tiên",
        handler: "tutien.setDaoHieu",
        options: [
            {
                type: "string",
                name: "ten",
                description: "Đạo hiệu mới, bắt buộc có chữ lợn",
                required: true,
            },
        ],
    },

    {
        name: "tuluyen",
        description: "Tu luyện nhận tu vi",
        handler: "tutien.cultivate",
    },
    {
        name: "dotpha",
        description: "Đột phá cảnh giới tu tiên",
        handler: "tutien.breakthrough",
    },
    {
        name: "dung",
        description: "Dùng vật phẩm tu tiên",
        handler: "tutien.useItem",
        autocomplete: "tutien.autocompleteUseItem",
        options: [
            {
                type: "string",
                name: "vatpham",
                description: "Chọn vật phẩm muốn dùng",
                required: true,
                autocomplete: true,
            },
            {
                type: "integer",
                name: "soluong",
                description: "Số lượng muốn dùng",
                required: false,
                minValue: 1,
            },
        ],
    },
    {
        name: "shopkynang",
        description: "Xem shop kỹ năng",
        handler: "kynang.shop",
    },
    {
        name: "dungkynang",
        description: "Dùng bí tịch kỹ năng",
        handler: "kynang.useSkillScroll",
        autocomplete: "kynang.autocompleteSkillScroll",
        options: [
            {
                type: "string",
                name: "bitich",
                description: "Chọn bí tịch muốn dùng",
                required: true,
                autocomplete: true,
            },
        ],
    },
    {
        name: "kynang",
        description: "Xem và trang bị kỹ năng",
        handler: "kynang.listSkills",
    },
    {
        name: "leothap",
        description: "Leo tháp Vô Tận",
        handler: "tower.show",
    },
    {
        name: "songtu",
        description: "Mời một đạo hữu song tu để cùng nhận tu vi",
        handler: "tutien.songTu",
        options: [
            {
                name: "user",
                description: "Đạo hữu muốn song tu cùng",
                type: "user",
                required: true,
            },
        ],
    },
    {
        name: "phoban",
        description: "Khiêu chiến và càn quét phó bản Mamu",
        handler: "dungeon.show",
    },
    {
        name: "sanyeuthu",
        description: "Săn yêu thú solo hoặc lập tổ đội săn chung",
        handler: "sanyeuthu.start",
        options: [
            {
                type: "string",
                name: "chedo",
                description: "Chọn cách đi săn",
                required: false,
                choices: [
                    {
                        name: "Solo",
                        value: "solo",
                    },
                    {
                        name: "Tổ đội",
                        value: "todoi",
                    },
                ],
            },
        ],
    },
    {
        name: "nguyenlieu",
        description: "Xem kho nguyên liệu yêu thú tách riêng khỏi kho đồ",
        handler: "sanyeuthu.materials",
    },
    {
        name: "spawn",
        description: "Spawn Boss Thế Giới",
        handler: "worldboss.spawn",
        options: [
            {
                name: "ten",
                description: "Tên boss",
                type: "string",
                required: false,
            },
            {
                name: "hp",
                description: "Máu boss",
                type: "integer",
                required: false,
            },
            {
                name: "anh",
                description: "Link ảnh meme boss",
                type: "string",
                required: false,
            },
        ],
    },
    {
        name: "chet",
        description: "Ép Boss Thế Giới chết và chia thưởng",
        handler: "worldboss.chet",
    },
    {
        name: "blackjack",
        description: "Chơi Blackjack với Dealer",
        handler: "blackjack.start",
        options: [
            {
                type: "integer",
                name: "sotien",
                description: "Số tiền cược",
                required: true,
                minValue: 100,
                maxValue: GAMBLE_MAX_BET,
            },
        ],
    },
    {
        name: "heoquaduong",
        description: "Game heo qua đường nhân tiền theo từng làn",
        handler: "pigRoad.start",
        options: [
            {
                type: "integer",
                name: "cuoc",
                description: "Số tiền muốn cược",
                required: true,
                minValue: 100,
                maxValue: GAMBLE_MAX_BET,
            },
            {
                type: "string",
                name: "chedo",
                description: "Chọn độ khó",
                required: false,
                choices: [
                    {
                        name: "Dễ",
                        value: "easy",
                    },
                    {
                        name: "Thường",
                        value: "normal",
                    },
                    {
                        name: "Khó",
                        value: "hard",
                    },
                    {
                        name: "Địa ngục",
                        value: "hell",
                    },
                ],
            },
        ],
    },
    {
        name: "flip",
        description: "Lật coin 40% thắng, payout x1.96",
        handler: "flip.play",
        options: [
            {
                type: "integer",
                name: "cuoc",
                description: "Số tiền muốn cược",
                required: true,
                minValue: 100,
                maxValue: GAMBLE_MAX_BET,
            },
        ],
    },
    {
        name: "quest",
        description: "Xem nhiệm vụ ngày / tuần",
        handler: "quest.show",
        options: [
            {
                type: "string",
                name: "ky",
                description: "Chọn loại nhiệm vụ",
                required: false,
                choices: [
                    {
                        name: "Daily",
                        value: "daily",
                    },
                    {
                        name: "Weekly",
                        value: "weekly",
                    },
                ],
            },
        ],
    },
];
