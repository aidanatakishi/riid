import os
import subprocess
import sys

REQUIRED_PACKAGES = ('flask', 'requests', 'urllib3', 'openpyxl', 'pptx', 'pypdf', 'waitress')


def _configure_stdio():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass


_configure_stdio()


def _can_import(name):
    try:
        __import__(name)
        return True
    except ImportError:
        return False


def ensure_requirements():
    missing = [name for name in REQUIRED_PACKAGES if not _can_import(name)]
    if not missing:
        return
    here = os.path.dirname(os.path.abspath(__file__))
    req = os.path.join(here, 'requirements.txt')
    print('Əskik paketlər: ' + ', '.join(missing))
    print('Quraşdırılır (bir dəfəlik, internet lazımdır)...')
    cmd = [sys.executable, '-m', 'pip', 'install', '-r', req]
    try:
        subprocess.check_call(cmd)
    except subprocess.CalledProcessError:
        try:
            subprocess.check_call(cmd + ['--user'])
        except subprocess.CalledProcessError:
            print('Paketlər quraşdırılmadı. Terminalda bunu işlədin:')
            print('  ' + sys.executable + ' -m pip install -r requirements.txt')
            raise SystemExit(1)
    still = [name for name in REQUIRED_PACKAGES if not _can_import(name)]
    if still:
        print('Hələ də tapılmayan paketlər: ' + ', '.join(still))
        print('  ' + sys.executable + ' -m pip install -r requirements.txt')
        raise SystemExit(1)


ensure_requirements()

from datetime import timedelta
from urllib.parse import urlparse

from flask import Flask, render_template, request, redirect, session, jsonify
from werkzeug.middleware.proxy_fix import ProxyFix

from config import (
    SECRET_KEY,
    ADMIN_USERNAME,
    ADMIN_PASSWORD,
    DEPT_USERNAME,
    DEPT_PASSWORD,
    DEPT_DISPLAY_NAME,
    JIRA_PROJECT_KEY,
    USER_PASSWORD,
    USER_USERNAME,
    CORS_ORIGINS,
    FLASK_DEBUG,
    SESSION_COOKIE_SECURE,
    TRUST_PROXY,
    is_production,
)
from routes import api, can_see_diagnostics, is_app_admin
from users import bootstrap_users, ensure_superadmin, sync_display_names

app = Flask(__name__)


def _persist_secret_key():
    if SECRET_KEY:
        return SECRET_KEY
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'secret.key')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.isfile(path):
        with open(path, encoding='utf-8') as handle:
            stored = handle.read().strip()
            if stored:
                return stored
    generated = os.urandom(32).hex()
    with open(path, 'w', encoding='utf-8') as handle:
        handle.write(generated)
    return generated


app.secret_key = _persist_secret_key()
app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024
app.config['TEMPLATES_AUTO_RELOAD'] = not is_production()
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = SESSION_COOKIE_SECURE
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)
if TRUST_PROXY:
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
app.register_blueprint(api)

bootstrap_users(
    ADMIN_USERNAME,
    ADMIN_PASSWORD,
    DEPT_USERNAME,
    DEPT_PASSWORD,
    DEPT_DISPLAY_NAME,
    JIRA_PROJECT_KEY or 'DGD',
    USER_USERNAME,
    USER_PASSWORD,
)
ensure_superadmin()
sync_display_names()

OPEN_PATHS = {
    '/login',
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/status',
    '/api/auth/me',
    '/api/auth/change-password',
    '/api/health',
}


def cors_origin_ok(origin):
    if not origin:
        return False
    cleaned = origin.strip().rstrip('/')
    if cleaned in CORS_ORIGINS:
        return True
    if is_production():
        return False
    host = (urlparse(origin).hostname or '').lower()
    return host in ('127.0.0.1', 'localhost')


# Xarici origin (riid.netlify.app və ya cloudflared) /api/jira çağıranda CORS lazımdır.
@app.before_request
def handle_cors_preflight():
    if request.method == 'OPTIONS':
        return app.make_response(('', 204))


@app.before_request
def require_login():
    if request.method == 'OPTIONS':
        return None
    path = request.path or '/'
    if path.startswith('/static/'):
        return None
    if path in OPEN_PATHS:
        return None
    if session.get('user_id'):
        return None
    if path.startswith('/api/'):
        return jsonify({'error': 'Giriş lazımdır'}), 401
    return redirect('/login')


@app.after_request
def add_cors_headers(resp):
    origin = request.headers.get('Origin')
    if cors_origin_ok(origin):
        resp.headers['Access-Control-Allow-Origin'] = origin
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, DELETE, OPTIONS'
        resp.headers['Access-Control-Allow-Credentials'] = 'true'
        resp.headers['Access-Control-Allow-Private-Network'] = 'true'
        resp.headers['Access-Control-Max-Age'] = '600'
        resp.headers['Vary'] = 'Origin'
    resp.headers['X-Content-Type-Options'] = 'nosniff'
    resp.headers['X-Frame-Options'] = 'SAMEORIGIN'
    resp.headers['Referrer-Policy'] = 'same-origin'
    if request.is_secure:
        resp.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    ctype = str(resp.content_type or '')
    if 'text/html' in ctype:
        resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        resp.headers['Pragma'] = 'no-cache'
        resp.headers['Expires'] = '0'
    return resp


@app.route('/')
def serve_dashboard():
    return render_template('index.html')


@app.route('/login')
def serve_login():
    if session.get('user_id'):
        return redirect('/')
    return render_template('login.html')


@app.route('/settings')
def serve_settings():
    return render_template('settings.html')


@app.route('/admin')
def serve_admin_users():
    if not is_app_admin():
        return redirect('/settings')
    return redirect('/settings#users')


@app.route('/diaqnostika')
@app.route('/diaqnostika/admin')
def serve_diaqnostika():
    if not can_see_diagnostics():
        return redirect('/')
    return render_template('index.html')


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    if is_production():
        print('Production rejimi: debug söndürülüb. Windows-da run-prod.bat, Linux-da gunicorn istifadə edin.')
    app.run(host='0.0.0.0', port=port, debug=FLASK_DEBUG)
