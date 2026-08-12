const { GAMBLE_MAX_BET } = require("./gamble");

module.exports = [
    {
        name: "limbo",

        description: "Đặt cược Limbo với hệ số mục tiêu tối đa 999999x",

        handler: "limbo.play",

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
                type: "number",
                name: "heso",

                description: "Hệ số mục tiêu từ 1.01x đến 999999x",

                required: true,

                minValue: 1.01,
                maxValue: 999999,
            },
        ],
    },
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
        description: "Xem shop theo danh mục",
        handler: "economy.shop",
        options: [
            {
                type: "string",
                name: "danhmuc",
                description: "Chọn danh mục shop muốn xem",
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
                        name: "Đổ thạch",
                        value: "dothach",
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
        description: "Mua vật phẩm trong shop",
        handler: "economy.buy",
        autocomplete: "economy.autocompleteShop",
        options: [
            {
                type: "string",
                name: "danhmuc",
                description: "Chọn danh mục vật phẩm",
                required: true,
                choices: [
                    {
                        name: "Pháp bảo",
                        value: "phapbao",
                    },
                    {
                        name: "Tu tiên",
                        value: "tutien",
                    },
                    {
                        name: "Đổ thạch",
                        value: "dothach",
                    },
                    {
                        name: "Vật phẩm thường",
                        value: "normal",
                    },
                ],
            },
            {
                type: "string",
                name: "vatpham",
                description: "Gõ tên hoặc ID vật phẩm muốn mua",
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
                    {
                        name: "Từ S trở xuống",
                        value: "S",
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
        name: "chucphuc",
        description: "Lời Chúc Phúc Của Thiên Đạo buff đổ thạch cho kênh",
        handler: "dothach.activateBlessing",
        dmPermission: false,
        options: [
            {
                type: "channel",
                name: "kenh",
                description: "Kênh muốn buff, bỏ trống là kênh hiện tại",
                required: false,
                channelTypes: [0],
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
        name: "tangitem",
        description: "Admin tặng vật phẩm bất kỳ trong shop cho user",
        handler: "admin.giveItem",
        autocomplete: "admin.autocompleteGiftItem",
        adminOnly: true,
        defaultMemberPermissions: "8",
        dmPermission: false,
        options: [
            {
                type: "user",
                name: "user",
                description: "Người nhận vật phẩm",
                required: true,
            },
            {
                type: "string",
                name: "vatpham",
                description: "ID vật phẩm muốn tặng, ví dụ ruong_tan_tich_ex",
                required: true,
                autocomplete: true,
            },
            {
                type: "integer",
                name: "soluong",
                description: "Số lượng muốn tặng",
                required: false,
                minValue: 1,
                maxValue: 9999,
            },
        ],
    },
    {
        name: "denbu",
        description: "Admin tạo nút nhận quà đền bù",
        handler: "admin.createCompensation",
        autocomplete: "admin.autocompleteGiftItem",
        adminOnly: true,
        defaultMemberPermissions: "8",
        dmPermission: false,
        options: [
            {
                type: "string",
                name: "loai",
                description: "Loại đền bù",
                required: true,
                choices: [
                    {
                        name: "Cố định",
                        value: "fixed",
                    },
                    {
                        name: "Leo tháp cũ",
                        value: "tower",
                    },
                ],
            },
            {
                type: "string",
                name: "lydo",
                description: "Lý do đền bù hiển thị cho người chơi",
                required: true,
            },
            {
                type: "integer",
                name: "sotien",
                description: "Quà tiền cố định, chỉ dùng cho loại Cố định",
                required: false,
                minValue: 0,
                maxValue: 1000000,
            },
            {
                type: "integer",
                name: "tuvi",
                description: "Quà tu vi cố định, chỉ dùng cho loại Cố định",
                required: false,
                minValue: 0,
                maxValue: 1000000,
            },
            {
                type: "string",
                name: "vatpham",
                description: "Vật phẩm cố định, ví dụ tu_luyen_chest",
                required: false,
                autocomplete: true,
            },
            {
                type: "integer",
                name: "soluong",
                description: "Số lượng vật phẩm cố định",
                required: false,
                minValue: 1,
                maxValue: 100,
            },
            {
                type: "integer",
                name: "ngay",
                description: "Số ngày nút còn hiệu lực, mặc định 7, tối đa 30",
                required: false,
                minValue: 1,
                maxValue: 30,
            },
            {
                type: "channel",
                name: "kenh",
                description: "Kênh gửi nút đền bù, bỏ trống là kênh hiện tại",
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
        name: "duyen",
        description: "Admin mở Bí Cảnh Truyền Thừa tổ đội",
        handler: "duyen.start",
        adminOnly: true,
        defaultMemberPermissions: "8",
        dmPermission: false,
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
        options: [
            {
                type: "integer",
                name: "soluong",
                description: "Số lượng bí tịch muốn mua mỗi lần bấm nút",
                required: false,
                minValue: 1,
                maxValue: 100,
            },
        ],
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
            {
                type: "integer",
                name: "soluong",
                description: "Số lượng bí tịch muốn mở",
                required: false,
                minValue: 1,
                maxValue: 100,
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
        name: "luyendan",
        description: "Luyện đan, dùng đan và phát triển nghề Luyện Đan Sư",
        handler: "luyendan.execute",
        options: [
            {
                type: "string",
                name: "hanhdong",
                description: "Chọn việc muốn thực hiện",
                required: true,
                choices: [
                    {
                        name: "Xem hồ sơ Luyện Đan Sư",
                        value: "hoso",
                    },
                    {
                        name: "Xem đan phương",
                        value: "congthuc",
                    },
                    {
                        name: "Khai lò luyện đan",
                        value: "luyen",
                    },
                    {
                        name: "Dùng đan dược",
                        value: "dung",
                    },
                    {
                        name: "Bán cho Đan Các",
                        value: "ban",
                    },
                    {
                        name: "Nâng cấp đan lô",
                        value: "nanglo",
                    },
                    {
                        name: "Sửa chữa đan lô",
                        value: "sualo",
                    },
                ],
            },
            {
                type: "string",
                name: "dan",
                description: "Chọn đan phương hoặc loại đan",
                required: false,
                choices: [
                    {
                        name: "Tụ Khí Đan",
                        value: "tu_khi_dan",
                    },
                    {
                        name: "Ngưng Nguyên Đan",
                        value: "ngung_nguyen_dan",
                    },
                    {
                        name: "Hóa Linh Đan",
                        value: "hoa_linh_dan",
                    },
                    {
                        name: "Hồi Liệp Đan",
                        value: "hoi_liep_dan",
                    },
                    {
                        name: "Tầm Yêu Đan",
                        value: "tam_yeu_dan",
                    },
                    {
                        name: "Thượng Cổ Dẫn Yêu Đan",
                        value: "thuong_co_dan_yeu_dan",
                    },
                    {
                        name: "Linh Trư Trúc Cơ Đan",
                        value: "linh_tru_truc_co_dan",
                    },
                    {
                        name: "Kim Nha Ngưng Đan",
                        value: "kim_nha_ngung_dan",
                    },
                    {
                        name: "Trư Anh Hóa Sinh Đan",
                        value: "tru_anh_hoa_sinh_dan",
                    },
                    {
                        name: "Thiên Bồng Hóa Thần Đan",
                        value: "thien_bong_hoa_than_dan",
                    },
                    {
                        name: "Thôn Thiên Phá Hư Đan",
                        value: "thon_thien_pha_hu_dan",
                    },
                    {
                        name: "Vạn Trư Hợp Đạo Đan",
                        value: "van_tru_hop_dao_dan",
                    },
                    {
                        name: "Trư Hoàng Thừa Thiên Đan",
                        value: "tru_hoang_thua_thien_dan",
                    },
                    {
                        name: "Cửu Lôi Dẫn Kiếp Đan",
                        value: "cuu_loi_dan_kiep_dan",
                    },
                    {
                        name: "Thiên Bồng Phi Tiên Đan",
                        value: "thien_bong_phi_tien_dan",
                    },
                ],
            },
            {
                type: "integer",
                name: "soluong",
                description: "Số lượng muốn luyện, dùng hoặc bán",
                required: false,
                minValue: 1,
                maxValue: 50,
            },
            {
                type: "integer",
                name: "pham",
                description: "Phẩm chất đan muốn dùng hoặc bán",
                required: false,
                choices: [
                    {
                        name: "Hạ phẩm",
                        value: 1,
                    },
                    {
                        name: "Trung phẩm",
                        value: 2,
                    },
                    {
                        name: "Thượng phẩm",
                        value: 3,
                    },
                    {
                        name: "Cực phẩm",
                        value: 4,
                    },
                ],
            },
        ],
    },
    {
        name: "chet",
        description: "Ép Boss Thế Giới chết và chia thưởng",
        handler: "worldboss.chet",
    },
    {
        name: "molinhthach",
        description: "Đào ô an toàn, né yêu thú và thu hoạch tiền thưởng",
        handler: "molinhthach.start",
        options: [
            {
                type: "integer",
                name: "sotien",
                description: "Tiền cược 1000-5000000",
                required: true,
                minValue: 1000,
                maxValue: GAMBLE_MAX_BET,
            },
            {
                type: "integer",
                name: "yeuthu",
                description: "Số yêu thú ẩn trong 25 ô, mặc định 5",
                required: false,
                minValue: 1,
                maxValue: 8,
            },
        ],
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
        name: "keno",
        description: "Chọn 1-10 số từ 1-40 và chơi Keno một người",
        handler: "keno.play",

        options: [
            {
                type: "integer",
                name: "cuoc",
                description: "Số tiền muốn cược",
                required: true,

                minValue: 1000,
                maxValue: GAMBLE_MAX_BET,
            },

            {
                type: "string",
                name: "chedo",
                description: "Mức rủi ro và bảng thưởng",
                required: true,

                choices: [
                    {
                        name: "Thấp - dễ nhận tiền hơn",
                        value: "low",
                    },

                    {
                        name: "Trung bình - cân bằng",
                        value: "medium",
                    },

                    {
                        name: "Cao - ít trúng, hệ số lớn",
                        value: "high",
                    },
                ],
            },

            {
                type: "string",
                name: "so",
                description: "Các số cách nhau bằng dấu phẩy, ví dụ 3,7,12,25",
                required: false,
            },

            {
                type: "integer",
                name: "soluong",
                description:
                    "Nếu không nhập số, bot tự chọn bao nhiêu số; mặc định 5",
                required: false,

                minValue: 1,
                maxValue: 10,
            },
        ],
    },
    {
        name: "kenonote",
        description: "Xem luật, ghi chú và bảng thưởng Keno",
        handler: "keno.note",

        options: [
            {
                type: "integer",
                name: "soluong",
                description:
                    "Xem bảng thưởng khi chọn bao nhiêu số; mặc định 5",
                required: false,

                minValue: 1,
                maxValue: 10,
            },
        ],
    },
    {
        name: "flip",
        description: "50-50 cược tiền, thắng gấp đôi",
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
        name: "vecao",
        description: "Mua Vé Cào Thiên Đạo 3x3, cào từng ô để nhận thưởng",
        handler: "vecao.start",
        options: [
            {
                type: "integer",
                name: "cuoc",
                description: "Giá vé muốn mua, tối đa 500,000",
                required: true,
                minValue: 10000,
                maxValue: 500000,
            },
        ],
    },
    {
        name: "raid_mo",
        description: "Mở đăng ký Raid Server thủ công",
        handler: "raidserver.openRegistration",
        adminOnly: true,
    },
    {
        name: "raid_batdau",
        description: "Ép Raid Server bắt đầu ngay",
        handler: "raidserver.forceStart",
        adminOnly: true,
    },
    {
        name: "raid_huy",
        description: "Hủy Raid Server hiện tại",
        handler: "raidserver.cancel",
        adminOnly: true,
    },
    {
        name: "raid_status",
        description: "Xem trạng thái Raid Server",
        handler: "raidserver.status",
        adminOnly: true,
    },
    {
        name: "quest",
        description: "Xem nhiệm vụ ngày / tuần / thử thách",
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
                    {
                        name: "Challenge",
                        value: "challenge",
                    },
                ],
            },
        ],
    },
    {
        name: "muagiai",
        description: "Xem bảng xếp hạng Quán Quân Mùa",
        handler: "season.show",
    },
    {
        name: "muagiai_mo",
        description: "Admin mở mùa giải thủ công",
        handler: "season.start",
        adminOnly: true,
        defaultMemberPermissions: "8",
        dmPermission: false,
        options: [
            {
                type: "integer",
                name: "mua",
                description: "Số thứ tự của mùa giải",
                required: true,
                minValue: 1,
                maxValue: 999,
            },
        ],
    },
    {
        name: "muagiai_chot",
        description: "Admin chốt mùa và phát thưởng Top 10",
        handler: "season.finish",
        adminOnly: true,
        defaultMemberPermissions: "8",
        dmPermission: false,
        options: [
            {
                type: "string",
                name: "xacnhan",
                description: "Xác nhận chốt và phát thưởng",
                required: true,
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
        name: "muagiai_status",
        description: "Admin xem trạng thái mùa giải",
        handler: "season.status",
        adminOnly: true,
        defaultMemberPermissions: "8",
        dmPermission: false,
    },
];
