"""Gold Q&A examples injected into chat prompts by intent."""
import json
import os
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
GOLD_PATH = os.path.join(BASE_DIR, 'data', 'chat_gold.json')

_CACHE = None
_MTIME = None


def _fold(s):
    s = str(s or '').lower()
    for a, b in (
        ('ı', 'i'), ('ə', 'e'), ('ö', 'o'), ('ü', 'u'),
        ('ğ', 'g'), ('ş', 's'), ('ç', 'c'),
    ):
        s = s.replace(a, b)
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def _load():
    global _CACHE, _MTIME
    try:
        mtime = os.path.getmtime(GOLD_PATH) if os.path.isfile(GOLD_PATH) else 0
    except Exception:
        mtime = 0
    if _CACHE is not None and _MTIME == mtime:
        return _CACHE
    items = []
    if os.path.isfile(GOLD_PATH):
        try:
            with open(GOLD_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if isinstance(data, list):
                for row in data:
                    if not isinstance(row, dict):
                        continue
                    q = str(row.get('question') or '').strip()
                    a = str(row.get('answer') or '').strip()
                    if not q or not a:
                        continue
                    items.append({
                        'intent': str(row.get('intent') or 'open')[:60],
                        'question': q[:300],
                        'answer': a[:500],
                    })
        except Exception:
            items = []
    _CACHE = items
    _MTIME = mtime
    return items


def examples_for(intent, question, limit=2):
    """Return up to `limit` gold examples matching intent / question words."""
    items = _load()
    if not items:
        return []
    intent = str(intent or 'open').strip().lower() or 'open'
    qf = _fold(question)
    scored = []
    for row in items:
        score = 0
        ri = str(row.get('intent') or '').lower()
        if ri and ri == intent:
            score += 5
        elif ri in ('open', '') and intent == 'open':
            score += 1
        rq = _fold(row.get('question'))
        if qf and rq:
            qw = set(qf.split())
            rw = set(rq.split())
            overlap = len(qw & rw)
            if overlap:
                score += min(4, overlap)
            if rq in qf or qf in rq:
                score += 2
        if score > 0:
            scored.append((score, row))
    scored.sort(key=lambda x: (-x[0], x[1].get('question') or ''))
    # Prefer distinct intents/questions
    out = []
    seen = set()
    for _, row in scored:
        key = row['question']
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
        if len(out) >= limit:
            break
    if not out and intent != 'open':
        # fallback: any same-intent style tip
        for row in items:
            if str(row.get('intent') or '').lower() == intent:
                out.append(row)
                break
    return out


def format_examples(rows):
    if not rows:
        return ''
    parts = ['Nümunə (yalnız TON və FORMAT; cavabı məhdudlaşdırmır, məzmunu kopyalama):']
    for i, row in enumerate(rows, 1):
        parts.append(
            str(i) + ') Sual: ' + row['question']
            + '\n   Yaxşı yanaşma: ' + row['answer']
        )
    return '\n'.join(parts)
