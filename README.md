# Rəqəmsal İdarəetmə Paneli (RİİD)

İRİA (Rəqəmsal İdarəetmə Departamenti) üçün Jira paneli. Task, sprint, çətinlik, qurum və qiymətləndirmə analitikasını göstərir.

Repo: https://github.com/aidanatakishi/riid

## Yükləmək

**Tam ZIP (Windows):** [Releases → riid-main.zip](https://github.com/aidanatakishi/riid/releases/latest)

Ölçü təxminən 300+ KB olmalıdır. GitHub-un yaşıl **Code → Download ZIP** bəzən yarımçıq düşür — onu istifadə etməyin.

**Git:**

```
git clone https://github.com/aidanatakishi/riid.git
cd riid
```

## İşə salmaq

Kompüterdə Python 3 lazımdır (`Add python.exe to PATH`).

- Windows: `run.bat`
- və ya: `python app.py`

İlk dəfə əskik paketlər avtomatik quraşır. Sonra brauzerdə:

http://127.0.0.1:5000

### Giriş

- Lokal boş quraşdırma: terminalda `admin / admin123` və `user / user123` yaranır.
- Production: `.env`-də `ADMIN_PASSWORD` yazın (ən azı 8 simvol).
- Yeni hesabları **Tənzimləmələr → İstifadəçilər** səhifəsindən admin yaradır.

Hər istifadəçi öz Jira tokenini (PAT) ilk girişdə yazır. Token `data/secrets.json`-da qalır, Git-ə düşmür.

## Production

Prod server Jira-ya (`jira.idda.az`) çatmalıdır.

1. `.env` yazın (`.env.example` əsasında): `APP_ENV=production`, `FLASK_DEBUG=false`, `TRUST_PROXY=true`, `SECRET_KEY`, `ADMIN_PASSWORD` (yalnız `users.json` boşdursa).
2. Daxili HTTP-dirsə `SESSION_COOKIE_SECURE=false` saxlayın. HTTPS reverse proxy varsa `true`.
3. Windows: `run-prod.bat` (waitress). Linux: `gunicorn --preload --bind 0.0.0.0:5000 --workers 2 --timeout 180 app:app`. Docker: `docker compose up -d --build`.
4. `data/` və `uploads/` qovluqlarını yedəkləyin.
5. `/api/health` `{"ok": true}` qaytarmalıdır.

## Struktur

```
app.py                 Flask giriş nöqtəsi
config.py              Jira URL, layihə, field ID-ləri
routes.py              API
jira_client.py         Jira HTTP
users.py               Hesablar
templates/             HTML
static/js/             Panel və qiymətləndirmə
static/css/
data/users.json        Hesab siyahısı (token yoxdur)
```

## Qeyd

Server `0.0.0.0` ilə açılır — eyni ofis şəbəkəsində `http://SİZİN-IP:5000` işləyir.
