from flask import Flask, render_template

from routes import api

app = Flask(__name__)
app.register_blueprint(api)


@app.after_request
def add_cors_headers(resp):
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    return resp


@app.route('/')
def serve_dashboard():
    return render_template('index.html')


if __name__ == '__main__':
    app.run(port=5000, debug=True)
