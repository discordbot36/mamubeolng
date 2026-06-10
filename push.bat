@echo off
chcp 65001 >nul
title PUSH CODE LEN GITHUB

echo ================================
echo   PUSH CODE LEN GITHUB
echo ================================
echo.

echo Dang kiem tra file nguy hiem...
echo.

git ls-files --error-unmatch .env >nul 2>&1
if not errorlevel 1 (
    echo [NGUY HIEM] .env dang bi Git theo doi.
    echo Dung lai de tranh lo token.
    echo Chay lenh:
    echo git rm --cached .env
    pause
    exit /b
)

git ls-files --error-unmatch data.json >nul 2>&1
if not errorlevel 1 (
    echo [NGUY HIEM] data.json dang bi Git theo doi.
    echo Dung lai de tranh lo data.
    echo Chay lenh:
    echo git rm --cached data.json
    pause
    exit /b
)

git ls-files --error-unmatch node_modules >nul 2>&1
if not errorlevel 1 (
    echo [NGUY HIEM] node_modules dang bi Git theo doi.
    echo Chay lenh:
    echo git rm -r --cached node_modules
    pause
    exit /b
)

echo OK: .env, data.json, node_modules khong bi Git theo doi.
echo.

git status --short

echo.
echo LUU Y:
echo - .env KHONG duoc push
echo - data.json KHONG duoc push
echo - node_modules KHONG duoc push
echo.

set /p msg=Nhap noi dung update roi bam Enter: 

if "%msg%"=="" (
    set msg=update
)

echo.
echo Dang add file...
git add .

echo.
echo Dang commit...
git commit -m "%msg%"

echo.
echo Dang pull code moi nhat...
git pull --rebase origin main

if errorlevel 1 (
    echo.
    echo [LOI] Pull bi loi hoac conflict.
    echo Sua conflict xong chay:
    echo git add .
    echo git rebase --continue
    pause
    exit /b
)

echo.
echo Dang push len GitHub...
git push origin main

if errorlevel 1 (
    echo.
    echo [LOI] Push that bai.
    pause
    exit /b
)

echo.
echo ================================
echo   PUSH THANH CONG
echo ================================
pause