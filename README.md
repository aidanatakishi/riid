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

**Başqa kompüter / həmkar:** GitHub-da yalnız kod var — hesab və Jira tokeni (`data/`) git-ə düşmür.

1. **Ən asan:** paneli bir kompüterdə `run.bat` ilə işə salın; digərləri eyni Wi‑Fi/ofis şəbəkəsində brauzerdə `http://O_KOMPUTERIN_IP:5000` açsın.
2. **Lokal quraşdırma:** işlək kompüterdə `pack-for-pc.bat` işlədin → Desktop-da `riid-data-pack` yaranır → USB ilə digər PC-yə aparın → `OXU.txt` addımları.

Sign in with an existing account. On the ops panel, paste your Jira token once if asked. Do not put tokens or passwords in Git.

### Production server

Copy `.env.example` to `.env` on the server (never commit `.env`). Set production flags there.

Windows:

```
run-prod.bat
```

Linux:

```
gunicorn --preload --bind 0.0.0.0:5000 --workers 2 --timeout 180 app:app
```

Open `http://SERVER_IP:5000`. Check `http://127.0.0.1:5000/api/health` — it should return `{"ok": true}`.

The server must reach Jira on the network. Keep `data/` and `uploads/` backed up.

**Hesablar:** istifadəçi siyahısı `data/users.json`-dadır və git-ə daxil edilmir. Paneldə və ya `.env` ilə bir dəfə admin yaradılandan sonra kod yeniləməsi və ya `git pull` həmin hesabları silməməlidir; ehtiyat nüsxə `data/users.json.bak`, say `data/accounts.state.json`-dadır. `data/`-nı müntəzəm backup edin.
