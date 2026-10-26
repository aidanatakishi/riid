"""Gold Q&A examples injected into chat prompts by intent.

Corrections (kind=correction) rank higher and are marked as mandatory
so the model follows user-taught answers for similar questions.
"""
import json
import os
import re
import threading
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
GOLD_PATH = os.path.join(BASE_DIR, 'data', 'chat_gold.json')
MAX_ITEMS = 200
_LOCK = threading.Lock()

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


def _now():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


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
                    kind = str(row.get('kind') or 'tone').strip().lower()
                    if kind not in ('tone', 'correction'):
                        kind = 'tone'
                    items.append({
                        'intent': str(row.get('intent') or 'open')[:60],
                        'question': q[:300],
                        'answer': a[:1200],
                        'kind': kind,
                        'wrong': str(row.get('wrong') or '')[:800],
                        'chatId': str(row.get('chatId') or '')[:80],
                        'ts': str(row.get('ts') or '')[:40],
                    })
        except Exception:
            items = []
    _CACHE = items
    _MTIME = mtime
    return items


def _save(items):
    global _CACHE, _MTIME
    os.makedirs(os.path.dirname(GOLD_PATH), exist_ok=True)
    slim = []
    for row in items[-MAX_ITEMS:]:
        entry = {
            'intent': str(row.get('intent') or 'open')[:60],
            'question': str(row.get('question') or '')[:300],
            'answer': str(row.get('answer') or '')[:1200],
            'kind': str(row.get('kind') or 'tone')[:20],
        }
        if row.get('wrong'):
            entry['wrong'] = str(row.get('wrong'))[:800]
        if row.get('chatId'):
            entry['chatId'] = str(row.get('chatId'))[:80]
        if row.get('ts'):
            entry['ts'] = str(row.get('ts'))[:40]
        slim.append(entry)
    with open(GOLD_PATH, 'w', encoding='utf-8') as f:
        json.dump(slim, f, ensure_ascii=False, indent=2)
        f.write('\n')
    _CACHE = slim
    try:
        _MTIME = os.path.getmtime(GOLD_PATH)
    except Exception:
        _MTIME = None
    return slim


def add_correction(question, answer, intent='open', wrong='', chat_id=''):
    """Persist a user correction; upsert by folded question. Returns saved row or None."""
    q = str(question or '').strip()[:300]
    a = str(answer or '').strip()[:1200]
    if not q or not a:
        return None, 'Sual və düzgün cavab lazımdır'
    intent = str(intent or 'open').strip()[:60] or 'open'
    wrong = str(wrong or '').strip()[:800]
    chat_id = str(chat_id or '').strip()[:80]
    qf = _fold(q)
    with _LOCK:
        items = list(_load())
        updated = None
        for i, row in enumerate(items):
            if _fold(row.get('question')) == qf and str(row.get('kind') or '') == 'correction':
                items[i] = {
                    'intent': intent,
                    'question': q,
                    'answer': a,
                    'kind': 'correction',
                    'wrong': wrong,
                    'chatId': chat_id,
                    'ts': _now(),
                }
                updated = items[i]
                break
        if not updated:
            updated = {
                'intent': intent,
                'question': q,
                'answer': a,
                'kind': 'correction',
                'wrong': wrong,
                'chatId': chat_id,
                'ts': _now(),
            }
            items.append(updated)
        _save(items)
    return updated, ''


def examples_for(intent, question, limit=3):
    """Return up to `limit` gold examples matching intent / question words.

    Corrections outrank tone tips.
    """
    items = _load()
    if not items:
        return []
    intent = str(intent or 'open').strip().lower() or 'open'
    qf = _fold(question)
    scored = []
    for row in items:
        score = 0
        kind = str(row.get('kind') or 'tone').lower()
        if kind == 'correction':
            score += 8
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
                score += min(6, overlap * (2 if kind == 'correction' else 1))
            if rq in qf or qf in rq:
                score += 4 if kind == 'correction' else 2
            if rq == qf:
                score += 10
        if score > 0:
            scored.append((score, row))
    scored.sort(key=lambda x: (-x[0], x[1].get('question') or ''))
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
        for row in items:
            if str(row.get('intent') or '').lower() == intent:
                out.append(row)
                break
    return out


def format_examples(rows):
    if not rows:
        return ''
    corrections = [r for r in rows if str(r.get('kind') or '') == 'correction']
    tips = [r for r in rows if str(r.get('kind') or '') != 'correction']
    parts = []
    if corrections:
        parts.append(
            'ÖYRƏDİLMİŞ DÜZƏLİŞ (məcburi — oxşar sualda səhv cavab vermə; '
            'aşağıdakı düzgün cavabı əsas götür):'
        )
        for i, row in enumerate(corrections, 1):
            block = (
                str(i) + ') Sual: ' + row['question']
                + '\n   Düzgün cavab: ' + row['answer']
            )
            wrong = str(row.get('wrong') or '').strip()
            if wrong:
                block += '\n   Səhv cavab (təkrarlama): ' + wrong[:400]
            parts.append(block)
    if tips:
        parts.append(
            'Nümunə (yalnız TON və FORMAT; cavabı məhdudlaşdırmır, məzmunu kopyalama):'
        )
        for i, row in enumerate(tips, 1):
            parts.append(
                str(i) + ') Sual: ' + row['question']
                + '\n   Yaxşı yanaşma: ' + row['answer']
            )
    return '\n'.join(parts)
