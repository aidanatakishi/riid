@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "PY="
where python >nul 2>&1 && set "PY=python"
if not defined PY (
  where py >nul 2>&1 && set "PY=py -3"
)
if not defined PY (
  echo.
  echo  Python tapilmadi.
  echo  https://www.python.org/downloads/ — qurasdirin ve "Add python.exe to PATH" isareleyin.
  echo.
  pause
  exit /b 1
)

if not exist "app.py" (
  echo.
  echo  app.py tapilmadi. Bu fayli riid qovlugunun ICHINDE run.bat ile ishe salin.
  echo  Hazirki qovluq: %CD%
  echo.
  pause
  exit /b 1
)

if not exist "templates\login.html" (
  echo.
  echo  templates\login.html yoxdur — natamam kopya / sehv qovluq.
  echo  GitHub-dan tam clone edin ve ya ZIP-i tam acin.
  echo.
  pause
  exit /b 1
)

if not exist "data" mkdir "data"

if not exist "data\secrets.json" (
  echo.
  echo  ============================================================
  echo   DIQQET: data\secrets.json YOXDUR
  echo   Jira tokeni bu komputere hele kocurulmeyib.
  echo.
  echo   Variant 1 ^(teklif^): Aydanin kompyuterinde paneli ishe salin,
  echo   digerleri brauzerde http://ONUN-IP:5000 acsin.
  echo.
  echo   Variant 2: Aydanin kompyuterinde pack-for-pc.bat ishledin,
  echo   cixan data fayllarini bu qovlugun data\ altina kocurun.
  echo.
  echo   Variant 3: Girisde admin + Jira PAT yazin ^(bir defe^).
  echo  ============================================================
  echo.
)

set "APP_ENV=development"
set "FLASK_DEBUG=false"
set "SESSION_COOKIE_SECURE=false"

echo.
echo  RIID ishe dushur...
echo  Lokal:  http://127.0.0.1:5000
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=1" %%b in ("%%a") do echo  Shebeke: http://%%b:5000
)
echo  Dayandirmaq ucun bu pencereni baglayin.
echo.

%PY% app.py
if errorlevel 1 (
  echo.
  echo  Server dayandi ^(xeta^). Yuxaridaki mesaja baxin.
  pause
)
