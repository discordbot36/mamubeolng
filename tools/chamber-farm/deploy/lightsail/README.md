# Chamber Farm trên AWS Lightsail

Máy đang triển khai: Ubuntu 24.04 LTS, Singapore, 1 GB RAM; IP `18.143.175.236`.

Bot chạy bằng Node.js Linux và dịch vụ `chamber-farm`, độc lập với PC và cửa sổ SSH. Dịch vụ được bật cùng hệ điều hành, tự khởi động lại sau 30 giây nếu tiến trình thoát. Trạng thái, token và lịch sử nằm tại `/var/lib/chamber-farm`; tài khoản dịch vụ riêng đọc cấu hình quyền 600. Không có cổng web quản trị mở ra Internet.

Trên PC hiện tại, mở `ChamberCloud.cmd` trên Desktop. Chọn 1 xem trạng thái, 2 tiếp tục, 3 tạm dừng, 4 điểm danh, 5 xem log, 6 kiểm tra ví. Chọn 0 hoặc đóng cửa sổ SSH không dừng bot. Giữ thư mục dự án chứa khóa SSH riêng để shortcut này tiếp tục hoạt động.

Từ AWS Console có thể bấm **Connect using SSH**, sau đó chạy:

```bash
sudo chamberctl menu
```

Các lệnh riêng:

```bash
sudo chamberctl status
sudo chamberctl logs
sudo chamberctl pause
sudo chamberctl resume
sudo chamberctl account
sudo chamberctl daily
sudo chamberctl recover
```

Dừng cả dịch vụ: `sudo systemctl stop chamber-farm`. Khởi động lại: `sudo systemctl start chamber-farm`. Khi bật lại, bot giữ cờ tạm dừng đã lưu; ván chưa rõ kết quả vẫn cần đối soát. `sudo chamberctl verify` chỉ dùng khi dịch vụ đã dừng vì dùng cùng khóa một tiến trình.

Giữ nguyên Martingale gốc 1, thua x2 tới 32; thua 32 về gốc, thắng về gốc, hòa giữ cược. Giữa hai ván nghỉ 15 giây, mọi tương tác giãn ít nhất 5 giây. Bot xác nhận ví mỗi 50 ván và sau điểm danh có thưởng. Điểm danh theo 00:05 UTC+7. Đặt lại cược không xóa lỗ của chuỗi cũ.

Bản Windows trên PC đã được tạm dừng/ngắt kết nối lúc chuyển máy. Không bấm chạy bản Windows đồng thời với bản cloud trên cùng tài khoản.

Gói `ChamberFarm-Lightsail-1.2.4.tar.gz` chỉ có mã và cấu hình mẫu, không có token, khóa SSH hoặc lịch sử thật. Token hiện tại chỉ được chuyển riêng qua SSH sau khi chủ tài khoản xác nhận đích. Cài lại gói nguồn bằng `sudo bash deploy/lightsail/install.sh`; bộ cài không tự bắt đầu chơi và không ghi đè cấu hình/trạng thái đã có.
