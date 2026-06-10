@echo off
chcp 65001 >nul
title Push code len GitHub

echo ================================
echo   PUSH CODE LEN GITHUB
echo ================================
echo.

where git >nul 2>nul
if errorlevel 1 (
    echo [LOI] May ban chua cai Git.
    echo Hay cai Git for Windows truoc.
    pause
    exit /b
)

echo Dang kiem tra file nguy hiem...
echo.

git status --short

echo.
echo LUU Y:
echo - .env KHONG duoc push
echo - data.json KHONG duoc push
echo - node_modules KHONG duoc push
echo.

set /p MSG=Nhap noi dung update roi bam Enter: 

if "%MSG%"=="" (
    set MSG=update code
)

git add .

git status --short | findstr /R "^A  .env ^M  .env ^A  data.json ^M  data.json" >nul
if not errorlevel 1 (
    echo.
    echo [NGUY HIEM] .env hoac data.json dang bi Git theo doi.
    echo Dung lai de tranh lo token hoac de data.
    echo Chay cac lenh sau:
    echo git rm --cached .env
    echo git rm --cached data.json
    pause
    exit /b
)

git commit -m "%MSG%"

if errorlevel 1 (
    echo.
    echo Khong co thay doi moi de commit hoac commit bi loi.
    pause
    exit /b
)

git push

if errorlevel 1 (
    echo.
    echo [LOI] Push len GitHub that bai.
    pause
    exit /b
)

echo.
echo ================================
echo   DA PUSH XONG LEN GITHUB
echo ================================
pause