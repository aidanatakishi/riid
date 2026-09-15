"""Netlify publish qovluğunu yığır: statik dashboard (Flask-sız)."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
STATIC_SRC = ROOT / "static"
HTML_SRC = ROOT / "templates" / "index.html"
LOGIN_SRC = ROOT / "templates" / "login.html"


def main() -> None:
    if SITE.exists():
        shutil.rmtree(SITE)
    dest_static = SITE / "static"
    dest_static.mkdir(parents=True)

    html = HTML_SRC.read_text(encoding="utf-8")
    html = html.replace("{{ (static_base|default('/static/')) }}", "/static/")
    SITE.joinpath("index.html").write_text(html, encoding="utf-8")
    if LOGIN_SRC.is_file():
        SITE.joinpath("login.html").write_text(LOGIN_SRC.read_text(encoding="utf-8"), encoding="utf-8")
    shutil.copytree(STATIC_SRC, dest_static, dirs_exist_ok=True)
    print("Netlify site ready: site/index.html + site/login.html + site/static/")


if __name__ == "__main__":
    main()
