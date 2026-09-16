import os
import subprocess
import sys

REQUIRED_PACKAGES = ('flask', 'requests', 'urllib3', 'openpyxl', 'pptx', 'pypdf')


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

from flask import Flask, render_template, request, redirect, session, jsonify

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
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('SESSION_COOKIE_SECURE', '').lower() in ('1', 'true', 'yes')
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)
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
}


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
    origin = request.headers.get('Origin') or '*'
    resp.headers['Access-Control-Allow-Origin'] = origin
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, DELETE, OPTIONS'
    if origin and origin != '*':
        resp.headers['Access-Control-Allow-Credentials'] = 'true'
    resp.headers['Access-Control-Allow-Private-Network'] = 'true'
    resp.headers['Access-Control-Max-Age'] = '600'
    resp.headers['Vary'] = 'Origin'
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


@app.route('/admin')
def serve_admin_users():
    if not is_app_admin():
        return redirect('/')
    return render_template('admin.html')


@app.route('/diaqnostika')
@app.route('/diaqnostika/admin')
def serve_diaqnostika():
    if not can_see_diagnostics():
        return redirect('/')
    return render_template('index.html')


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'true').lower() in ('1', 'true', 'yes')
    app.run(host='0.0.0.0', port=port, debug=debug)
