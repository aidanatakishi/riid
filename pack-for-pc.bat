@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "OUT=%USERPROFILE%\Desktop\riid-data-pack"
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%\data" 2>nul

echo.
echo  Bashqa PC ucun data paketi hazirlanir...
echo.

if not exist "data\users.json" (
  echo  XETA: data\users.json yoxdur — hesablar kocurule bilmez.
  pause
  exit /b 1
)
if not exist "data\secrets.json" (
  echo  XETA: data\secrets.json yoxdur — Jira tokeni yoxdur.
  echo  Evvelce admin ile daxil olub PAT yazin.
  pause
  exit /b 1
)

copy /Y "data\users.json" "%OUT%\data\users.json" >nul
copy /Y "data\secrets.json" "%OUT%\data\secrets.json" >nul
if exist "data\users.json.bak" copy /Y "data\users.json.bak" "%OUT%\data\users.json.bak" >nul
if exist "data\accounts.state.json" copy /Y "data\accounts.state.json" "%OUT%\data\accounts.state.json" >nul
if exist "data\secret.key" copy /Y "data\secret.key" "%OUT%\data\secret.key" >nul

(
  echo RIID — bashqa kompuytere kocurme
  echo.
  echo 1^) O kompuyterde:
  echo    git clone https://github.com/aidanatakishi/riid.git
  echo    cd riid
  echo    git pull
  echo.
  echo 2^) Bu paketdeki data\ icindeki BUTUN fayllari
  echo    o kompuyterde riid\data\ qovluguna yapishdirin
  echo    ^(uzerinden yazsin — OK^).
  echo.
  echo 3^) run.bat-a iki defe klik.
  echo.
  echo 4^) Brauzer: http://127.0.0.1:5000
  echo    huseyn.mammadov / huseyn2026  ^(ve s.^)
  echo.
  echo VACIB: secrets.json icinde Jira tokeni var — email/git-e qoymayin.
  echo USB / Teams / shexsi drive ile kocurun.
) > "%OUT%\OXU.txt"

echo  Hazir: %OUT%
echo  Icinde: data\users.json + data\secrets.json + OXU.txt
echo.
echo  Bu qovlugu USB ile diger PC-ye aparin ve OXU.txt-e baxin.
echo.
explorer "%OUT%"
pause
