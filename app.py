import os
import subprocess
import sys

REQUIRED_PACKAGES = ('flask', 'requests', 'urllib3', 'openpyxl')


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

from flask import Flask, render_template, request

from config import SECRET_KEY
from routes import api

app = Flask(__name__)
app.secret_key = SECRET_KEY or os.urandom(32)
app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)
app.register_blueprint(api)

# Xarici origin (riid.netlify.app və ya cloudflared) /api/jira çağıranda CORS lazımdır.
@app.before_request
def handle_cors_preflight():
    if request.method == 'OPTIONS':
        return app.make_response(('', 204))


@app.after_request
def add_cors_headers(resp):
    origin = request.headers.get('Origin') or '*'
    resp.headers['Access-Control-Allow-Origin'] = origin
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS'
    resp.headers['Access-Control-Allow-Private-Network'] = 'true'
    resp.headers['Access-Control-Max-Age'] = '600'
    resp.headers['Vary'] = 'Origin'
    return resp


@app.route('/')
def serve_dashboard():
    return render_template('index.html')


@app.route('/diaqnostika')
@app.route('/diaqnostika/admin')
def serve_diaqnostika():
    return render_template('index.html')


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'true').lower() in ('1', 'true', 'yes')
    app.run(host='0.0.0.0', port=port, debug=debug)
