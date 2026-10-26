# Nghiên cứu và cấu hình chiến thuật Chamber

## Phần đã áp dụng

Bot tính kỳ vọng lãi/lỗ của **Tiếp** và **Thôi**, tính cả các quyết định tiếp theo nếu rút thêm. Nó chọn hành động có kỳ vọng cao hơn trong mô hình đã cấu hình. Chỉ có hai nút nên không giả lập thao tác double, split hoặc surrender không được server cung cấp.

Bộ tính dùng xác suất hạng bài độc lập: Át đến 9 mỗi hạng 1/13, các lá trị giá 10 gộp thành 4/13. Đây là mô hình infinite-deck, **chưa phải phân phối RNG hoặc bộ bài thực của Chamber đã được xác minh**. Khi chỉ thấy một lá nhà cái, bộ tính lấy trung bình các lá còn ẩn; nếu toàn bộ bài nhà cái được hiển thị và điểm khớp, nó dùng các lá đã biết đó. Không suy đoán lá úp.

EV trong log là lãi/lỗ kỳ vọng trên một đơn vị cược theo mô hình trả thưởng thường 1:1. Nó không phải xác suất thắng, không dự báo kết quả kế tiếp và không tính thưởng đặc biệt chưa rõ của Chamber. Tiền cược đã được đặt trước khi xem bài; EV ở bước chọn bài không được dùng để tăng lại cược của ván đó.

## Luật Át: khác biệt quan sát được

Các dòng dưới được đối chiếu từ phản hồi của chính tài khoản đã cấu hình, không phải mã nguồn server:

| Bài theo thứ tự hiển thị | Điểm Chamber | Át linh hoạt chuẩn | Chọn 11/1 ở mọi lần rút | Chỉ chọn 11/1 ở hai lá đầu |
| --- | ---: | ---: | ---: | ---: |
| Át, 6, 6 | 23 | 13 | 23 | 23 |
| Át, 7, Át | 19 | 19 | 19 | 19 |
| J, Át | 21 | 21 | 21 | 21 |
| 6, 2, Át | 9 | 19 | 19 | 9 |
| 6, 3, Át, 6 | 16 | 16 | 26 | 16 |

Hai dòng cuối bác bỏ mô hình cũ chọn 11/1 ở mọi lần rút. Mô hình mới `initial_two` chọn Át là 11 nếu còn chỗ trong hai lá đầu, nếu không thì là 1; Át rút từ lá thứ ba luôn là 1, không giảm giá trị Át cũ. Trong mẫu 75 tin nhắn gần nhất của chính tài khoản đọc ngày 24/10/2026, mô hình này khớp 148 tay có bài và điểm đầy đủ, gồm 30 tay có Át. Cộng thêm ảnh chẩn đoán ván gây pause `6, 2, Át = 9`, dữ liệu hiện ủng hộ mô hình này; chưa chứng minh toàn bộ thuật toán server.

`ACE_RULE=initial_two` áp dụng mô hình mới. `draw_time` giữ mô hình cũ để tương thích; `standard` dùng cách tính lại Át của blackjack chuẩn. Trước mỗi quyết định, parser đối chiếu tổng bài với điểm server hiển thị; không khớp thì dừng, ghi điểm hai bên và mô hình trong lỗi. Không tự đổi mô hình giữa một ván để hợp thức hóa dữ liệu sai.

Ví dụ Át + 6 gặp nhà cái ngửa 9: mô hình chuẩn cho phép rút rồi giảm Át nếu cần; mô hình chốt Át coi đây là 17 cố định và chọn dừng. Phần này ảnh hưởng trực tiếp đến chọn bài, khác với việc đổi kích thước cược.

## Các tham số vẫn là giả định

```dotenv
ACE_RULE=initial_two
DEALER_HITS_SOFT_17=false
DEALER_PEEK=false
```

Hai cờ dealer và giả định hạng bài độc lập chưa được xác minh từ mã server. Nếu server kiểm tra blackjack trước lượt người chơi, có thể bật `DEALER_PEEK=true` để EV loại trừ trường hợp đó. Với Át chốt giá trị, tay không còn soft nên cờ soft-17 không tác động. EV phân biệt lá ẩn thứ hai của dealer với các lá rút thêm: Át ở lá thứ hai có thể là 11, Át sau đó là 1. Không dùng đếm bài giữa các ván vì chưa biết server có giữ nguyên bộ bài hay chia lại.

## Cược và xác suất thắng

Theo yêu cầu mới, dùng Martingale gốc 1 với ngưỡng đặt lại 32: thua nhân đôi tới 32, thua tại 32 về 1 và tiếp tục chuỗi mới; thắng về 1, hòa/hoàn tiền giữ mức. Sáu ván thua liên tiếp vẫn mất 63 coin và được ghi đủ vào số dư. Đây là quy tắc phân bổ cược, không thay đổi xác suất thắng và chưa có bằng chứng tạo kỳ vọng lợi nhuận dương. Không áp dụng Kelly khi chưa đo được lợi thế đáng tin cậy.

## Độ ổn định

- Kiểm tra tin trả về thuộc đúng bot, kênh và chủ tương tác; nếu số cược trong header không khớp với cược đã lưu thì dừng đối soát.
- Chỉ bấm lại sau khi bài thực sự đổi, không vì riêng footer thay đổi.
- Chờ phản hồi theo `RESPONSE_TIMEOUT_SECONDS`, khớp đúng nonce. Một acknowledgement của nút không bị coi là kết quả ván; engine tiếp tục đợi bài cập nhật. Không gửi lại một lệnh cược đã hết thời gian chờ.
- Lưu nguyên cược tiếp và ván chưa rõ kết quả qua restart. Log quyết định trong `state.json` có mô hình, bài đã thấy, EV hai lựa chọn và nguy cơ quá 21 nếu rút ngay.
- Nhận diện thông báo hủy có xác nhận hoàn trả khớp tiền cược là `void`. `--recover` chỉ đọc tin nhắn pending, đối soát kết quả đã rõ và giữ pause; không mở ván hoặc bấm nút. Thiếu tiền hoàn trả, lệch số tiền, sai tin nhắn hoặc kết quả chưa rõ đều giữ pending.

## Đối chiếu độc lập và giới hạn kiểm thử

Ở mô hình chuẩn, infinite-deck, S17 và đã loại blackjack nhà cái, bộ tính tái hiện các giá trị công bố sau trong sai số 0,000001:

| Bài / lá ngửa | EV Thôi | EV Tiếp | Chọn |
| --- | ---: | ---: | --- |
| Hard 16 / 10 | -0,540430 | -0,539826 | Tiếp |
| Hard 12 / 4 | -0,211063 | -0,213537 | Thôi |
| Soft 18 / 9 | -0,183163 | -0,100744 | Tiếp |

Các phép so sánh này xác nhận bộ tính ở mô hình chuẩn, không chứng minh tỷ lệ thắng thực của Chamber. Kiểm thử còn đối chiếu bảng Hit/Stand trên toàn bộ tổng hard/soft hợp lệ, xác suất cộng bằng 1, mô hình Át theo ván đã quan sát, bài nhà cái lộ toàn bộ, kết quả lệch cược, phản hồi chậm và nonce không khớp. Không đặt cược mới để đo lợi nhuận trong quá trình nâng cấp này.

## Nguồn tham khảo

- Michael Shackleford, [Expected Returns in Infinite-Deck Blackjack](https://wizardofodds.com/games/blackjack/expected-return-infinite-deck/): so sánh kỳ vọng giữa các hành động và các giá trị dùng đối chiếu độc lập.
- [4–8 Deck Basic Strategy](https://wizardofodds.com/games/blackjack/strategy/4-decks/): bảng tham chiếu Hit/Stand trong mô hình chuẩn.
- [The Truth about Betting Systems](https://wizardofodds.com/gambling/betting-systems/): giới hạn của các quy tắc đổi tiền cược trong game có lợi thế nhà cái.

## Đối chiếu luật ngày 24/10/2026

Log phiên 91 ván cho thấy nhà cái có thể dừng tại 16 trong các ván tương tác. Mẫu 84 ván đầu có 9 kết quả nhà cái 16 và 7 kết quả hai bên cùng quá 21 được xử hòa. Cấu hình chọn bài mới dùng `DEALER_STAND_ON=16` và `BOTH_BUST_PUSH=true`; quá 21 chỉ thua khi nhà cái không quá 21. Có ngoại lệ trong một ván blackjack tự kết thúc: nhà cái tiếp tục rút từ 16 lên 22, nên chưa khẳng định mọi nhánh xử lý server đều dùng cùng ngưỡng. Ngưỡng 16 dùng cho quyết định Tiếp/Thôi đang được cung cấp.

Năm ván thắng blackjack hai lá có tổng cược 7 coin, khớp chính xác 7 coin chênh lệch trong các khoảng đối soát ví. `NATURAL_WIN_MULTIPLIER=2` vì vậy tạm tính lãi gấp đôi cược cho thắng hai lá 21; ván thắng thường vẫn lãi một lần cược. Đây là suy luận từ dữ liệu, không phải mã nguồn server. Ví thật tiếp tục là căn cứ đối soát. Không sửa ngược lịch sử cũ; khoản điều chỉnh của phiên cũ vẫn được giữ.
