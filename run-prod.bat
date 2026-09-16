@echo off
cd /d "%~dp0"
set "PY="
where python >nul 2>&1 && set "PY=python"
if not defined PY (
  where py >nul 2>&1 && set "PY=py -3"
)
if not defined PY (
  echo Python tapilmadi. python.org-dan Python 3 qurasdirin ve "Add python.exe to PATH" isareleyin.
  pause
  exit /b 1
)
if not exist ".env" (
  echo Production uchun .env yaradin. .env.example-a baxin.
  pause
  exit /b 1
)
set "APP_ENV=production"
set "FLASK_DEBUG=false"
set "TRUST_PROXY=true"
if "%PORT%"=="" set "PORT=5000"
echo Production: http://0.0.0.0:%PORT%  (HTTPS reverse proxy arxasinda saxlayin)
%PY% -m waitress --listen=0.0.0.0:%PORT% --threads=8 app:app
if errorlevel 1 pause
