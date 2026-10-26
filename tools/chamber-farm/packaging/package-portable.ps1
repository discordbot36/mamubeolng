param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$projectDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$distributionDirectory = Join-Path $projectDirectory 'dist'
if (-not $SkipBuild) {
    & (Join-Path $PSScriptRoot 'build.ps1') -Portable
}
$portableExecutable = Join-Path $distributionDirectory 'portable\ChamberFarm.exe'
if (-not (Test-Path -LiteralPath $portableExecutable)) { throw 'Build the portable executable first.' }
$stagingDirectory = Join-Path $distributionDirectory ('bundle-' + [Guid]::NewGuid().ToString('N'))
$bundleDirectory = Join-Path $stagingDirectory 'ChamberFarm'
$dataDirectory = Join-Path $bundleDirectory 'ChamberFarm-data'
New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
Copy-Item -LiteralPath $portableExecutable -Destination (Join-Path $bundleDirectory 'ChamberFarm.exe')
$utf8 = New-Object Text.UTF8Encoding($false)
# Public server settings only. Never load the live .env or copy session files.
$template = [IO.File]::ReadAllText((Join-Path $projectDirectory '.env.example'))
if ($template -notmatch '(?m)^DISCORD_USER_TOKEN=\s*$') { throw 'Template must have a blank credential.' }
$template = $template.Replace('CHAMBER_BOT_ID=', 'CHAMBER_BOT_ID=1117099742921502850')
[IO.File]::WriteAllText((Join-Path $dataDirectory '.env'), $template, $utf8)
[IO.File]::WriteAllText((Join-Path $dataDirectory '.env.example'), $template, $utf8)
$instructions = @"
CHAMBER FARM 1.2.4 - WINDOWS 10/11 64-BIT

1. Giải nén TOÀN BỘ file ZIP ra một thư mục trên máy mới.
   Không chạy EXE ngay bên trong cửa sổ ZIP.
2. Chạy file Cau-hinh.cmd để mở cấu hình bằng Notepad.
   Điền token của bạn vào dòng DISCORD_USER_TOKEN=, lưu rồi đóng Notepad.
   ID bot và hai kênh đã được điền. Không gửi token cho người khác.
3. Mở ChamberFarm.exe. Giao diện sẽ mở trong trình duyệt mặc định.
   Mở giao diện chưa đặt cược. Bấm Bắt đầu phiên khi bạn muốn chạy.

Không cần cài Node.js, npm, Python hay sao chép thư mục mã nguồn.
Giữ nguyên thư mục ChamberFarm-data nằm cạnh file EXE.
Vẫn cần Internet để kết nối Discord. Windows cần có .NET Framework 4.x
(thường đã có sẵn trên Windows 10/11).

CẤU HÌNH TRONG GÓI
- Martingale, cược gốc 1 coin; thua x2, thắng về 1, hòa giữ cược.
- Chuỗi 1 - 2 - 4 - 8 - 16 - 32; thua 32 trở về 1 và chơi chuỗi mới.
- Hòa ở 32 giữ 32. Thua hết chuỗi mất 63 coin; đặt lại cược không xóa khoản lỗ đó.
- MARTINGALE_RESET_AT=32 là ngưỡng đặt lại; trần server vẫn 50 coin.
- Nghỉ 15 giây giữa hai ván; 1,5 giây trước bấm Tiếp/Thôi.
- Các lệnh/nút còn được giãn tối thiểu 5 giây để tránh gửi dồn lúc mở phiên.
- Kiểm tra ví đầu phiên, sau điểm danh và mỗi 50 ván; chờ tối đa 20 giây.
- Điểm danh 00:05 theo múi giờ Việt Nam (UTC+7), khi chương trình đang chạy.

CHUYỂN MÁY
Dừng và ngắt kết nối bot trên máy cũ trước khi chạy cùng tài khoản ở máy mới.
Nếu máy cũ còn ván chờ, đối soát ván đó trước khi chuyển.
Gói này KHÔNG chứa token thật, state.json, lịch sử chơi hoặc ván chờ từ máy cũ.
Trên máy mới, dữ liệu phiên mới được tạo; số dư thật lấy bằng /taikhoan.
Không có hệ thống cược nào bảo đảm lợi nhuận.

Khi chạy, state.json, rounds.jsonl và .ui sẽ nằm trong ChamberFarm-data.
Bộ chạy tự giải nén vào %LOCALAPPDATA%\ChamberFarm.
Đóng tab trình duyệt KHÔNG dừng bot. Dùng nút Tạm dừng / Ngắt kết nối.
Để mở lại, nhấp đúp ChamberFarm.exe.
"@
[IO.File]::WriteAllText((Join-Path $bundleDirectory 'HUONG-DAN.txt'), $instructions, $utf8)
# ASCII batch text avoids console code-page issues on another Windows machine.
$configurationShortcut = "@echo off`r`nnotepad.exe `"%~dp0ChamberFarm-data\.env`"`r`n"
[IO.File]::WriteAllText((Join-Path $bundleDirectory 'Cau-hinh.cmd'), $configurationShortcut, [Text.Encoding]::ASCII)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$temporaryArchive = Join-Path $distributionDirectory ('bundle-' + [Guid]::NewGuid().ToString('N') + '.zip')
$archivePath = Join-Path $distributionDirectory 'ChamberFarm-1.2.4-Windows-x64.zip'
[IO.Compression.ZipFile]::CreateFromDirectory($stagingDirectory, $temporaryArchive, [IO.Compression.CompressionLevel]::Optimal, $false)
$archive = [IO.Compression.ZipFile]::OpenRead($temporaryArchive)
try {
    $expectedFiles = @('ChamberFarm/ChamberFarm.exe', 'ChamberFarm/Cau-hinh.cmd', 'ChamberFarm/HUONG-DAN.txt', 'ChamberFarm/ChamberFarm-data/.env', 'ChamberFarm/ChamberFarm-data/.env.example')
    $actualFiles = @($archive.Entries | Where-Object { $_.Name } | ForEach-Object { $_.FullName.Replace('\', '/') })
    if (@(Compare-Object ($expectedFiles | Sort-Object) ($actualFiles | Sort-Object)).Count) { throw 'Unexpected files in portable archive.' }
    $entry = $archive.Entries | Where-Object { $_.FullName.Replace('\', '/') -eq 'ChamberFarm/ChamberFarm-data/.env' }
    $reader = New-Object IO.StreamReader($entry.Open())
    try { $packedConfig = $reader.ReadToEnd() } finally { $reader.Dispose() }
    if ($packedConfig -notmatch '(?m)^DISCORD_USER_TOKEN=\s*$') { throw 'Credential detected in portable config.' }
} finally { $archive.Dispose() }
Move-Item -LiteralPath $temporaryArchive -Destination $archivePath -Force
$verifiedStaging = [IO.Path]::GetFullPath($stagingDirectory)
$verifiedDistribution = [IO.Path]::GetFullPath($distributionDirectory) + [IO.Path]::DirectorySeparatorChar
if (-not $verifiedStaging.StartsWith($verifiedDistribution, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe staging path.' }
Remove-Item -LiteralPath $verifiedStaging -Recurse -Force
Write-Output ('ZIP: ' + $archivePath)
Write-Output ('Size: ' + [Math]::Round((Get-Item -LiteralPath $archivePath).Length / 1MB, 1) + ' MB')
Write-Output 'Verified: exactly five files; blank token, no session files.'
