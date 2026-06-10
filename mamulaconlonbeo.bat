@echo off
chcp 65001 >nul
title Auto Update Va Chay Bot

echo ================================
echo   AUTO UPDATE VA CHAY BOT
echo ================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [LOI] May chua cai Node.js.
    echo Hay cai Node.js LTS truoc.
    pause
    exit /b
)

where git >nul 2>nul
if errorlevel 1 (
    echo [LOI] May chua cai Git.
    echo Hay cai Git for Windows truoc.
    pause
    exit /b
)

if not exist ".git" (
    echo [LOI] Thu muc nay chua phai la project Git.
    echo Ban cua ban can clone project tu GitHub truoc.
    pause
    exit /b
)

if not exist ".env" (
    echo [LOI] Khong thay file .env.
    echo KHONG tu tao moi de tranh chay sai token.
    echo Hay copy file .env cu cua may host vao thu muc nay.
    pause
    exit /b
)

if not exist "data.json" (
    echo [CANH BAO] Khong thay data.json.
    echo Neu day la bot dang chay lau roi thi BAT BUOC copy data.json cu vao day.
    echo File nay chua tien, item, inventory cua nguoi choi.
    pause
    exit /b
)

if not exist "backups" (
    mkdir backups
)

for /f "tokens=1-4 delims=/ " %%a in ("%date%") do (
    set TODAY=%%a-%%b-%%c
)

for /f "tokens=1-3 delims=:." %%a in ("%time%") do (
    set NOW=%%a-%%b-%%c
)

set BACKUP_NAME=%TODAY%_%NOW%
set BACKUP_NAME=%BACKUP_NAME: =0%

echo.
echo Dang backup .env va data.json...
copy ".env" "backups\.env-%BACKUP_NAME%.backup" >nul
copy "data.json" "backups\data-%BACKUP_NAME%.json" >nul

echo.
echo Dang lay code moi tu GitHub...
git pull

if errorlevel 1 (
    echo.
    echo [LOI] git pull bi loi.
    echo .env va data.json da duoc backup trong thu muc backups.
    echo Thu dong bot dang chay roi bam lai.
    pause
    exit /b
)

if not exist ".env" (
    echo.
    echo [LOI NGUY HIEM] Sau khi pull bi mat .env.
    echo Hay lay lai trong thu muc backups.
    pause
    exit /b
)

if not exist "data.json" (
    echo.
    echo [LOI NGUY HIEM] Sau khi pull bi mat data.json.
    echo Hay lay lai trong thu muc backups.
    pause
    exit /b
)

echo.
echo Dang cai/cap nhat thu vien...
npm install

if errorlevel 1 (
    echo.
    echo [LOI] npm install bi loi.
    pause
    exit /b
)

echo.
echo Dang deploy slash commands...
npm run deploy

if errorlevel 1 (
    echo.
    echo [LOI] deploy commands bi loi.
    pause
    exit /b
)

echo.
echo ================================
echo   BAT DAU CHAY BOT
echo ================================
echo.

npm start

echo.
echo Bot da dung hoac bi loi.
pause