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
set "APP_ENV=development"
set "FLASK_DEBUG=true"
set "SESSION_COOKIE_SECURE=false"
%PY% app.py
if errorlevel 1 pause
