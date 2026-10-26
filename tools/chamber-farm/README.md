# Chamber: điểm danh và blackjack

Công cụ chạy riêng bằng tài khoản cá nhân. Không dùng token bot MAMU. Cần Node.js **22.16 trở lên**; thư mục này có package và dependency riêng.

## Giao diện dễ sử dụng

Nhấp đúp `ChamberFarm.exe` trên Desktop để mở bảng điều khiển trong trình duyệt mặc định. Giao diện chạy trên `127.0.0.1` của máy, không đưa token vào trang hoặc gửi token đến dịch vụ web khác. Mở giao diện chưa đặt cược; bấm **Bắt đầu phiên** để kết nối Discord, lấy số dư thật bằng `/taikhoan` rồi bắt đầu chơi.

- **Tạm dừng**: không mở ván mới, hoàn tất ván hiện tại trước khi cho đổi cược.
- **Kiểm tra ví**: lấy mục Ví Tiền của `/taikhoan`; chờ embed hoàn chỉnh, không coi phản hồi trống là số dư 0.
- **Điểm danh**: gửi đúng kênh, cộng thưởng chỉ khi Chamber xác nhận; sau đó kiểm tra lại ví. Đã gửi trong ngày thì không gửi lặp, kể cả lần trước chưa xác nhận.
- **Cài đặt cược**: mở khi muốn đổi cược gốc bằng ×2 / ÷2, xem chuỗi và bấm **Áp dụng** khi đã tạm dừng, không có ván chờ. Gốc 1 là `1–2–4–8–16–32`; thua ở 32 sẽ về 1 và tiếp tục chuỗi mới, hòa giữ 32. Áp dụng đưa cược về gốc và giữ lịch sử, số dư phiên.
- **Tính cược theo vốn**: ở Martingale, tính ngân sách cho cược gốc; không phải ngân sách đủ bảo đảm cho toàn chuỗi nhân đôi. Giao diện hiện tổng tiền có thể mất nếu thua hết chuỗi. Không tự áp dụng mức tính được.
- **Đối soát ván**: chỉ đọc kết quả/hoàn tiền của ván đang chờ, giữ tạm dừng sau đối soát.
- **Kết thúc phiên / ngắt kết nối**: đóng phiên bot sau thao tác hiện tại. Đóng riêng tab trình duyệt không dừng bot; mở lại EXE sẽ quay lại bảng điều khiển đang có.

Màn hình chính chỉ hiện số dư, lời/lỗ, cược tiếp và điều khiển. Cài đặt, lịch sử, nhật ký mặc định thu gọn; ván chờ và lý do dừng luôn hiện khi cần.

Số dư đầu phiên lấy từ `/taikhoan`. Thắng thường tạm tính lãi 1 lần cược, blackjack hai lá tạm tính lãi 2 lần cược theo các khoảng ví đã quan sát; đây là suy luận dữ liệu, chưa phải luật nguồn đã xác minh. Bot kiểm tra lại ví mỗi 50 ván và sau điểm danh. Chênh lệch vẫn được hiển thị riêng, số dư thật là căn cứ đối soát. Bắt đầu tiến trình bot mới tạo phiên mới từ ví thật; lịch sử cũ vẫn có trong `rounds.jsonl`.

Mức cược đổi trên giao diện được lưu nguyên tử trong `state.json` (`uiBettingOverride`), ưu tiên hơn `BASE_BET` trong `.env` ở các lần chạy sau. Không cần sửa token hoặc đổi `.env`. Có thể chạy giao diện bằng `npm.cmd run ui`; các lệnh `--check`, `--verify`, `--recover` của EXE vẫn dùng chế độ dòng lệnh.

## Cách chơi

- Chế độ hiện tại **Martingale có đặt lại tại 32**: thua nhân đôi, thắng về gốc, hòa/hoàn tiền giữ mức. Gốc 1 chạy `1 → 2 → 4 → 8 → 16 → 32 → 1` khi thua liên tiếp. Sáu ván thua mất 63 coin; trở về 1 không xóa lỗ, số ván hoặc lịch sử. Không cược 64. Thiếu vốn, ván chưa rõ kết quả hoặc vượt trần server vẫn dừng.
- Tự gửi `/blackjack money:<số cược>` rồi bấm nút **Tiếp** hoặc **Thôi** theo bài thực tế.
- Bộ chọn bài so sánh EV của **Tiếp/Thôi** trong mô hình hạng bài độc lập. Có mô hình Át chuẩn và Át chốt giá trị lúc rút; cấu hình mới dùng mô hình khớp các ván Chamber đã quan sát. Hỗ trợ bài nhà cái lộ toàn bộ nếu tổng điểm khớp. Không tự double/split/surrender khi chỉ có hai nút. Xem [nghiên cứu và giới hạn mô hình](STRATEGY.md).
- Đây là chiến thuật tăng giá trị kỳ vọng so với chọn bài tùy ý, **không bảo đảm tăng xác suất thắng mọi ván hoặc có lãi**. Chưa biết số bộ bài, cách chia bài và luật riêng của Chamber nên không khẳng định chiến thuật tối ưu cho server. Không đếm bài hoặc dự đoán RNG.
- Điểm danh lúc **00:05 giờ Việt Nam** mỗi ngày. Khởi động muộn sẽ gửi bù trong ngày nếu chưa gửi. Chương trình phải đang chạy và máy có mạng; không cài tác vụ chạy nền/khởi động Windows.

## Cài đặt và chạy trên PowerShell

Mở terminal ngay trong thư mục `tools/chamber-farm`, rồi chạy:

```powershell
npm.cmd ci --ignore-scripts
Copy-Item .env.example .env
notepad .env
```

Điền token và ID bot trong `.env`; hai ID kênh đã được cấu hình theo server bạn cung cấp:

```dotenv
DISCORD_USER_TOKEN=<thông tin xác thực tài khoản cá nhân, chỉ lưu trên máy>
CHAMBER_BOT_ID=<ID tài khoản bot Chamber>
CHANNEL_ID=1135209450144272504
DAILY_CHANNEL_ID=1135209424538062858
```

Bật **Discord → User Settings → Advanced → Developer Mode** để chuột phải bot/kênh và chọn Copy User ID / Copy Channel ID. `CHAMBER_BOT_ID` là ID bot Chamber trong ảnh. Mỗi tài khoản/kênh dùng một thư mục state riêng.

`CHANNEL_ID` chỉ dùng cho blackjack; `/diemdanh` gửi vào `DAILY_CHANNEL_ID`. Nếu không khai báo `DAILY_CHANNEL_ID`, cấu hình cũ vẫn dùng chung kênh blackjack. Hai kênh phải thuộc cùng server. Các kênh hiện tại thuộc server `653508294962315285`.

Không gửi token vào chat, ảnh, diagnostic hoặc Git. Công cụ không lấy token từ trình duyệt và không cần mật khẩu/2FA. `.env` đã được bỏ qua trong Git.

```powershell
npm.cmd run check
npm.cmd run verify
npm.cmd test
npm.cmd start
```

`check` chỉ kiểm tra cấu hình cục bộ, không đăng nhập/gửi lệnh. `verify` đăng nhập, kiểm tra hai kênh và cấu trúc lệnh thật, rồi thoát; không gửi slash command/đặt cược. `start` đăng nhập và **tự bắt đầu chơi** nếu trạng thái không pause, đồng thời điểm danh nếu đến giờ. Tránh tự chơi blackjack trên cùng tài khoản trong lúc công cụ chạy để không làm lệch chuỗi cược.

Trong terminal:

| Lệnh | Tác dụng |
| --- | --- |
| `status` | Xem cược tiếp, chuỗi thua, ván đang chờ và lần điểm danh |
| `pause` | Dừng mở ván mới; hoàn tất ván đang xử lý; điểm danh vẫn chạy |
| `resume` | Chơi tiếp khi không còn ván chưa rõ kết quả |
| `recover` | Khi đã pause: đọc ván chờ và đối soát kết quả đã rõ, giữ pause; không bấm nút/cược |
| `account` | Kiểm tra số dư thật bằng `/taikhoan`, mở phiên nếu chưa có |
| `daily` | Điểm danh có xác nhận và kiểm tra lại ví, không gửi lặp trong ngày |
| `reconcile win` | Ghi thủ công ván chờ là thắng và chuyển bước theo chế độ đang lưu |
| `reconcile loss` | Ghi thủ công ván chờ là thua; Martingale nhân đôi cược |
| `reconcile push` | Ghi thủ công ván chờ là hòa, giữ cược |
| `reconcile void` | Chỉ dùng khi đã xác nhận lệnh bị từ chối/không có ván và không mất tiền; giữ cược |
| `quit` / Ctrl+C | Không mở ván mới, chờ thao tác hiện tại kết thúc rồi thoát |

## Lỗi hoặc khởi động lại

`state.json` lưu cược tiếp, chuỗi thua, danh tính tài khoản/kênh/bot và ván đang chờ. Trạng thái được ghi **trước khi gửi cược**, nên mất mạng/tắt máy không làm tự gửi lại lệnh cược chưa rõ kết quả. Khi lỗi, chương trình pause và chờ bạn xem ván trên Discord, `reconcile ...`, sau đó `resume`.

Trạng thái cũng lưu chế độ và bước trong chuỗi thắng. Nếu đổi chế độ khi còn ván chưa rõ kết quả, bản mới giữ nguyên cược của ván cũ và chỉ áp dụng chế độ mới sau đối soát. Lệnh bị từ chối rõ ràng do thiếu tiền hoặc vì một ván khác đang chơi không được tính là thua; trường hợp còn ván trên server thì hoàn thành ván đó trước khi gõ `resume`.

`diagnostic.json` chứa embed và nút gần nhất của chính ván đang chơi, không chứa token. Parser hỗ trợ bài dạng `A♠`, `1♠`, `10♥`, các field Chamber/người chơi hoặc hai phần trong description. Cần một lá ngửa của Chamber (hoặc toàn bộ bài đã lộ theo điều kiện dưới), đầy đủ bài người chơi và điểm khớp nhau. Bài dạng ảnh/custom emoji, cách ghi khác hoặc ván không có lá ngửa sẽ làm pause để bổ sung parser, không đoán bài.

Bản mới cũng nhận nhiều lá nhà cái nếu tất cả đã lộ, không có dấu lá úp và tổng khớp điểm hiển thị. Log EV và quyết định cuối của ván được lưu cùng trạng thái để đối soát. EV là kỳ vọng theo mô hình, không phải tỷ lệ thắng đo được của Chamber.

Chỉ bấm nút của tin nhắn trả về cho lệnh vừa gửi; đợi nội dung/nút thay đổi trước khi quyết định tiếp. Không tự thử lại slash command hoặc nút nếu không chắc thao tác trước đã được xử lý. Phản hồi lỗi thiếu tiền, giới hạn cược, cooldown hoặc xác minh sẽ dừng chuỗi; kết quả không rõ không bị coi mặc định là thua. Điểm danh gửi tối đa một lần/ngày theo trạng thái cục bộ; có phản hồi không đồng nghĩa chắc chắn đã nhận thưởng, hãy xem phản hồi của Chamber.

Danh sách lệnh của server được đọc một lần khi khởi động, dùng chung cho hai kênh và các lần gửi lệnh trong phiên. Cách này tránh giới hạn API khi thư viện đọc lại cùng danh sách liên tục. Nếu quản trị viên sửa slash command trong lúc chạy, khởi động lại để lấy schema mới. Lỗi giới hạn lượt đọc sẽ được báo trực tiếp, không bị hiểu nhầm là thiếu `/diemdanh`.

Khi tiến trình bị kill hoặc máy tắt đột ngột, bản mới tự thu hồi `runner.lock` nếu PID trong file đã kết thúc. Khóa của phiên còn chạy sẽ được giữ và thông báo rõ PID. Khóa tiến trình trên Windows do hệ điều hành giữ, nên hai lần nhấp mở đồng thời không thể cùng chạy. `state.json` và mọi ván chưa rõ kết quả được giữ nguyên để đối soát. File khóa không hợp lệ hoặc không xác minh được tiến trình sẽ không bị tự xóa.

## Tùy chỉnh

`BETTING_MODE=win_progression` và `WIN_BET_SEQUENCE=1,2,3,5` là chế độ tùy chọn trước đây. Thắng tiến một bước; thắng bước 5 về 1; thua về 1; hòa/lệnh bị từ chối giữ nguyên bước. Ví dụ bốn ván thắng thường trả lãi 1:1 sẽ lãi 11 coin; chuỗi thắng 1, 2, 3 rồi thua 5 lãi 1 coin. Đây là các ví dụ theo kết quả giả định, không phải dự báo tỷ lệ thắng hay lợi nhuận của Chamber.

`BETTING_MODE=flat` luôn cược gốc. `BETTING_MODE=martingale` là chế độ hiện tại: thua x2, thắng về cược gốc. Cấu hình cũ thiếu BETTING_MODE được hiểu là Martingale để không âm thầm đổi chính sách của ván đang chờ. Chế độ tăng sau thắng không tăng xác suất thắng của ván tiếp theo; có thể thua nhiều chu kỳ liên tiếp. [Giới hạn của các hệ thống cược](https://wizardofodds.com/gambling/betting-systems/).

Các tùy chọn nằm trong `.env.example`. `BASE_BET=1` là mặc định. `MAX_BET=0` và `MAX_LOSS_STREAK=0` nghĩa là không đặt giới hạn riêng; có thể đặt số dương để dừng khi chạm giới hạn. Chương trình cũng đọc min/max của option `money` từ schema server, nhưng không biết trước số dư thực tế. Không ước tính lợi nhuận vì chưa biết tỷ lệ trả thưởng và cách làm tròn của Chamber. Khi thua 10 ván bắt đầu từ 1, tổng cược mất là 1023 và ván tiếp theo cần 1024.

Theo giới hạn server, `MAX_BET=50` vẫn giữ. `MARTINGALE_RESET_AT=32` đưa cược về gốc khi thua ở mức 32; cũng về gốc nếu bước nhân đôi tiếp theo sẽ vượt 32. Với cược gốc khác 1, ví dụ gốc 3 là 3–6–12–24–3. Gốc không được vượt ngưỡng này. Đặt 0 để dùng Martingale cũ không tự đặt lại; khi đó 64 bị trần 50 chặn. Khi còn ván chờ, thay đổi chính sách chỉ áp dụng sau đối soát.

`ROUND_DELAY_SECONDS=15` đợi sau mỗi kết quả; tăng nếu server có cooldown. Đổi `DAILY_TIME` theo giờ reset thực tế của server; lịch hiện tại giả định reset theo ngày ở Việt Nam. Đổi `DAILY_ENABLED=false` nếu chỉ muốn chơi.

`ACE_RULE=initial_two` chọn Át là 11/1 trong hai lá đầu, chốt giá trị đó, và tính Át rút thêm là 1. Mô hình này khớp 148 tay bài trong mẫu đọc ngày 24/10/2026 và phản hồi gây pause `6 + 2 + Át = 9`; vẫn chưa xác minh bằng mã server. `draw_time` giữ mô hình cũ chọn 11/1 ở mọi lần rút (không khớp ván trên), `standard` cho phép tính lại Át cũ. `DEALER_HITS_SOFT_17` và `DEALER_PEEK` là các giả định có thể đổi trong cấu hình. Bộ chờ tương tác dùng `RESPONSE_TIMEOUT_SECONDS` thay cho mốc 5 giây cố định của thư viện; chỉ nhận phản hồi đúng nonce và không gửi lại lệnh cược khi hết hạn.

Thông báo rõ ràng `Blackjack Đã Hủy` kèm `Đã hoàn trả N💵` và các nút đã tắt được tính là `void` nếu N khớp tiền cược; không tính thắng/thua hoặc chuyển bước cược. Nếu ván cũ còn pending sau restart, chạy `ChamberFarm.exe --recover` hoặc `node --env-file=.env index.js --recover` khi đã đóng phiên trước. Lệnh này chỉ đọc đúng tin nhắn đã lưu và đối soát kết quả/hoàn trả, không gửi slash command, không bấm nút, không mở ván mới. Trạng thái vẫn pause sau đối soát. Không có xác nhận rõ thì giữ nguyên ván chờ. Lý do pause mới nhất được lưu trong `state.json` ở `lastError`.

## Phạm vi xác minh

Bản xử lý chậm cập nhật tách `RESPONSE_TIMEOUT_SECONDS=30` (xác nhận tương tác) khỏi `BOARD_UPDATE_TIMEOUT_SECONDS=75` (bài thực sự thay đổi). Sau 30 giây chưa thấy bài đổi, console báo đang chờ và tiếp tục đọc lịch sử; không bấm lại nút hay gửi cược. Lượt đọc dùng truy vấn lịch sử `around=<messageId>&limit=1`, chỉ lấy đúng ID đã lưu. Mỗi lần chờ đọc có hạn tối đa 10 giây; các lượt đọc cùng ID chia sẻ yêu cầu đang chờ để tránh xếp chồng request. Lỗi quyền truy cập không bị che giấu thành kết quả ván.

`rounds.jsonl` lưu nối tiếp từ bản này: cược định gửi, từng bảng bài đọc được, quyết định EV, xác nhận nút, các lượt đọc lịch sử/thay đổi từ gateway, lỗi và kết quả. Log không chứa token hoặc request/header; được bỏ qua bởi Git và không đóng gói vào EXE. Không có lịch sử đầy đủ trước khi nâng cấp và không thể đo số dư ví từ log này. Một thao tác được Discord xác nhận không chứng minh Chamber đã xử lý thành công; log phân biệt xác nhận với bảng bài cập nhật.

Đã có test offline cho basic strategy, Át, chuỗi Martingale, các layout embed mô phỏng ảnh, mất kết nối, state sau restart, giới hạn cược, lịch UTC+7, cách chọn đúng nút/tin nhắn và dùng chung danh sách lệnh để tránh rate limit. Đã đăng nhập và xác minh cấu trúc thật của `/blackjack money` và `/diemdanh` trong hai kênh đã cấu hình bằng `npm run verify`; bước này không gửi slash command. Đã đối chiếu lịch sử thật và phản hồi hủy/hoàn tiền của chính tài khoản cấu hình; kiểm thử hồi quy bao gồm điểm Át gây pause và đối soát đúng số tiền. Không đặt cược mới trong quá trình chẩn đoán, chưa đo lợi nhuận hoặc tỷ lệ thắng của bản sửa.

Adapter dùng [`discord.js-selfbot-v13` 3.7.1](https://github.com/aiko-chan-ai/discord.js-selfbot-v13), đã được upstream lưu trữ và ngừng hỗ trợ. Discord thay API có thể cần sửa adapter. Tự động hóa tài khoản cá nhân trái [quy định self-bot của Discord](https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots) và có thể khiến tài khoản bị khóa.



Kiểm tra ví tự động dùng `WALLET_EVERY_ROUNDS=50` (đặt 0 để tắt kiểm tra định kỳ). Vẫn lấy ví khi bắt đầu phiên và sau điểm danh. `WALLET_TIMEOUT_SECONDS=20` giới hạn tổng thời gian chờ /taikhoan, kể cả chờ embed; phản hồi quá hạn không ghi đè số dư. Lần kiểm tra định kỳ thất bại chỉ giữ nhãn ước tính và chờ đủ 50 ván nữa, không gửi lại ở vòng lặp kế tiếp hoặc khi ván hoàn tiền không tăng số ván. Kiểm tra ví đầu phiên thất bại vẫn chặn bắt đầu cược. Nút Kiểm tra ví dùng khi bạn cần đối soát sớm hơn.

Nếu Discord báo `INTERACTION_FAILURE`, công cụ vẫn giữ bộ chờ phản hồi đúng mã lệnh cho tới hạn `RESPONSE_TIMEOUT_SECONDS` (30 giây), không gửi lại lệnh. Thông báo thất bại chưa chứng minh ứng dụng không tạo ván. Nếu phản hồi đến trong hạn, công cụ xử lý bình thường. Nếu vẫn thiếu ID, mã lệnh (`commandNonce`) được lưu cùng ván chờ; nút Đối soát chỉ tìm tin có đúng mã đó trong cache/lịch sử, kiểm tra bot/kênh/chủ tương tác và tiền cược, không đoán theo thời gian hoặc mức cược. Lịch sử không có mã hoặc không tìm được phản hồi thì tiếp tục giữ ván chờ. Ván cũ trước bản 1.2.2 thiếu cả ID lẫn mã lệnh vẫn cần xác minh thủ công.

Khi nút Tiếp/Thôi bị báo thất bại, công cụ chỉ đọc lại đúng tin nhắn ván đang giữ. Nếu bài đã đổi thì xử lý phần cập nhật; không bấm lại cùng nút để thử may.

## Sửa giới hạn tốc độ tương tác (1.2.3)

Bản cũ của thư viện gửi POST /interactions nhưng bỏ qua Promise trả về. Khi Discord giới hạn tốc độ, POST bị từ chối bên ngoài bộ chờ nonce, làm tiến trình thoát và để lại ván chờ giả. Bản 1.2.3 bắt lỗi POST cho đúng mã nonce ngay, không gọi lại POST. Chỉ RateLimitError của thư viện đã ghim (trước gửi hoặc HTTP 429 rõ ràng) được xem là lệnh chưa được chấp nhận; không tính là thua/hoàn tiền, không đổi cược, số dư hoặc số ván. Lỗi mạng hoặc hết hạn chưa rõ kết quả vẫn giữ nguyên pending.

INTERACTION_GAP_SECONDS=5 giãn cả slash và nút trên cùng tài khoản. Delay giữa ván vẫn 15 giây. Nếu có Retry-After, công cụ tôn trọng thời gian chờ và hiển thị đếm ngược; khoảng chờ quá dài sẽ dừng trước khi gửi, không để lệnh nằm chờ rồi tự cược sau khi giao diện đã hết hạn. Không tự khởi động lại ván sau rate limit: bấm Tiếp tục khi hết đếm ngược. Điểm danh đã nhận từ trước không gọi lại /taikhoan ngay sau đó; kiểm tra định kỳ vẫn mỗi 50 ván.
