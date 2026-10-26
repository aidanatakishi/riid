# RIID — Digital Management Panel

Internal Jira dashboard for IRIA (Digital Management Department).

## Why it exists

The team needs one place to see Jira work instead of opening tickets one by one:

- operational dashboard: tasks, sprints, workload, status, assessments
- leadership page (`/rehber`): evaluation from Jira; other sections update from Excel uploads

Login has two choices: current panel (`/`) or leadership panel (`/rehber`).

## How to run

You need Python 3 on PATH.

```
git clone https://github.com/aidanatakishi/riid.git
cd riid
```

Windows: double-click `run.bat`  
or:

```
python app.py
```

Missing packages install on first start. Then open:

http://127.0.0.1:5000

Sign in with an existing account. On the ops panel, paste your Jira token once if asked. Do not put tokens or passwords in Git.

### Production server

Copy `.env.example` to `.env` on the server (never commit `.env`). Set production flags there.

**AI Done (chatbot)** — server `.env`-də mütləq açar olsun (UI-də göstərilmir):

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
CHAT_LLM_PROVIDER=openai
```

və ya `GEMINI_API_KEY=...`. Deploy/git pull-dan sonra prosesi **yenidən başladın** ki, yeni `chat.js` / `chat_tools` yüklənsin. Brauzerdə hard refresh (`Ctrl+Shift+R`).

Reverse proxy (nginx) arxasında SSE üçün: `proxy_buffering off;` (tətbiq artıq `X-Accel-Buffering: no` göndərir). Gunicorn timeout ən azı **180** saniyə olmalıdır (LLM cavabı).

Windows:

```
run-prod.bat
```

Linux:

```
gunicorn --preload --bind 0.0.0.0:5000 --workers 2 --timeout 180 --keep-alive 5 app:app
```

Docker:

```
docker compose up -d --build
```

Open `http://SERVER_IP:5000`. Check `http://127.0.0.1:5000/api/health` — it should return `{"ok": true}`.

The server must reach Jira **and** the LLM API (OpenAI/Gemini) on the network. Keep `data/` and `uploads/` backed up.

**Hesablar:** istifadəçi siyahısı `data/users.json`-dadır və git-ə daxil edilmir. Paneldə və ya `.env` ilə bir dəfə admin yaradılandan sonra kod yeniləməsi və ya `git pull` həmin hesabları silməməlidir; ehtiyat nüsxə `data/users.json.bak`, say `data/accounts.state.json`-dadır. `data/`-nı müntəzəm backup edin.
