import os

from flask import Flask, render_template, request

from routes import api

app = Flask(__name__)
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
    resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    resp.headers['Access-Control-Allow-Private-Network'] = 'true'
    resp.headers['Access-Control-Max-Age'] = '600'
    resp.headers['Vary'] = 'Origin'
    return resp


@app.route('/')
def serve_dashboard():
    return render_template('index.html')


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'true').lower() in ('1', 'true', 'yes')
    app.run(host='0.0.0.0', port=port, debug=debug)
