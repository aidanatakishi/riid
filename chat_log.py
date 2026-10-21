"""Server-side chat audit — monitor, feedback, quality flags."""
import json
import os
import threading
import uuid
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_PATH = os.path.join(BASE_DIR, 'data', 'chat_log.jsonl')
MAX_ENTRIES = 500
_LOCK = threading.Lock()


def _now():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def _flags_for(entry):
    flags = []
    source = str(entry.get('source') or '')
    error = str(entry.get('error') or '')
    answer = str(entry.get('answer') or '')
    err_l = error.lower()
    if source == 'error' or error:
        flags.append('error')
    if source == 'local':
        flags.append('local_fallback')
    if 'timeout' in err_l:
        flags.append('timeout')
    if '429' in err_l or 'limit' in err_l:
        flags.append('rate_limit')
    if '401' in err_l or 'açar' in err_l or 'unauthorized' in err_l:
        flags.append('auth')
    if source == 'llm' and answer and len(answer) < 40:
        flags.append('too_short')
    if answer and len(answer) > 2200:
        flags.append('too_long')
    duration = entry.get('durationMs')
    try:
        if duration is not None and int(duration) > 20000:
            flags.append('slow')
    except Exception:
        pass
    # keep unique order
    seen = set()
    out = []
    for f in flags:
        if f not in seen:
            seen.add(f)
            out.append(f)
    return out


def append_chat(entry):
    """Append one chat exchange. Returns id or ''."""
    if not isinstance(entry, dict):
        return ''
    chat_id = str(entry.get('id') or uuid.uuid4())
    row = {
        'id': chat_id,
        'ts': entry.get('ts') or _now(),
        'userId': str(entry.get('userId') or '')[:80],
        'username': str(entry.get('username') or '')[:120],
        'displayName': str(entry.get('displayName') or '')[:160],
        'question': str(entry.get('question') or '')[:2000],
        'answer': str(entry.get('answer') or '')[:4000],
        'source': str(entry.get('source') or '')[:40],
        'model': str(entry.get('model') or '')[:80],
        'error': str(entry.get('error') or '')[:400],
        'kind': str(entry.get('kind') or '')[:60],
        'intent': str(entry.get('intent') or '')[:60],
        'durationMs': entry.get('durationMs'),
        'feedback': entry.get('feedback') if isinstance(entry.get('feedback'), dict) else None,
        'facts': entry.get('facts') if isinstance(entry.get('facts'), dict) else None,
        'draft': str(entry.get('draft') or '')[:1200],
    }
    try:
        if row['durationMs'] is not None:
            row['durationMs'] = int(row['durationMs'])
    except Exception:
        row['durationMs'] = None
    row['flags'] = _flags_for(row)
    # Cap stored facts size
    if row['facts']:
        try:
            blob = json.dumps(row['facts'], ensure_ascii=False)
            if len(blob) > 8000:
                row['facts'] = {'kind': row['kind'], 'intent': row['intent'], 'truncated': True}
        except Exception:
            row['facts'] = None
    try:
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        line = json.dumps(row, ensure_ascii=False) + '\n'
        with _LOCK:
            with open(LOG_PATH, 'a', encoding='utf-8') as f:
                f.write(line)
            _trim_locked()
        return chat_id
    except Exception:
        return ''


def _read_all_locked():
    if not os.path.isfile(LOG_PATH):
        return []
    items = []
    with open(LOG_PATH, 'r', encoding='utf-8') as f:
        for raw in f:
            raw = raw.strip()
            if not raw:
                continue
            try:
                item = json.loads(raw)
            except Exception:
                continue
            if isinstance(item, dict):
                if not item.get('id'):
                    item['id'] = str(uuid.uuid4())
                if 'flags' not in item:
                    item['flags'] = _flags_for(item)
                items.append(item)
    return items


def _write_all_locked(items):
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    with open(LOG_PATH, 'w', encoding='utf-8') as f:
        for item in items[-MAX_ENTRIES:]:
            f.write(json.dumps(item, ensure_ascii=False) + '\n')


def _trim_locked():
    try:
        items = _read_all_locked()
        if len(items) > MAX_ENTRIES:
            _write_all_locked(items)
    except Exception:
        pass


def get_chat(chat_id):
    chat_id = str(chat_id or '').strip()
    if not chat_id:
        return None
    with _LOCK:
        for item in _read_all_locked():
            if str(item.get('id')) == chat_id:
                return item
    return None


def set_feedback(chat_id, vote, reason='', user_id=''):
    chat_id = str(chat_id or '').strip()
    vote = str(vote or '').strip().lower()
    if vote not in ('up', 'down', 'clear'):
        return None, 'vote up|down|clear olmalıdır'
    with _LOCK:
        items = _read_all_locked()
        found = None
        for item in items:
            if str(item.get('id')) == chat_id:
                found = item
                break
        if not found:
            return None, 'Qeyd tapılmadı'
        if vote == 'clear':
            found['feedback'] = None
        else:
            found['feedback'] = {
                'vote': vote,
                'reason': str(reason or '')[:200],
                'userId': str(user_id or '')[:80],
                'ts': _now(),
            }
        flags = list(found.get('flags') or [])
        flags = [f for f in flags if f not in ('thumbs_down', 'thumbs_up')]
        if vote == 'down':
            flags.append('thumbs_down')
        elif vote == 'up':
            flags.append('thumbs_up')
        found['flags'] = flags
        _write_all_locked(items)
        return found, ''


def list_chat(limit=80, source='', flag='', intent='', q=''):
    limit = max(1, min(int(limit or 80), 200))
    source = str(source or '').strip().lower()
    flag = str(flag or '').strip().lower()
    intent = str(intent or '').strip().lower()
    q = str(q or '').strip().lower()
    with _LOCK:
        items = _read_all_locked()
    items.reverse()
    out = []
    for item in items:
        if source and str(item.get('source') or '').lower() != source:
            continue
        if flag:
            flags = [str(f).lower() for f in (item.get('flags') or [])]
            fb = item.get('feedback') if isinstance(item.get('feedback'), dict) else {}
            if flag == 'down' and not (fb.get('vote') == 'down' or 'thumbs_down' in flags):
                continue
            if flag == 'up' and not (fb.get('vote') == 'up' or 'thumbs_up' in flags):
                continue
            if flag not in ('up', 'down') and flag not in flags:
                continue
        if intent and str(item.get('intent') or item.get('kind') or '').lower() != intent:
            continue
        if q:
            blob = (
                str(item.get('question') or '') + ' ' +
                str(item.get('answer') or '') + ' ' +
                str(item.get('displayName') or '') + ' ' +
                str(item.get('username') or '')
            ).lower()
            if q not in blob:
                continue
        # Don't ship huge facts to list UI
        slim = dict(item)
        if slim.get('facts'):
            slim['hasFacts'] = True
            slim.pop('facts', None)
        if slim.get('draft'):
            slim.pop('draft', None)
        out.append(slim)
        if len(out) >= limit:
            break
    return out


def chat_stats(limit=200):
    items = list_chat(limit=limit)
    total = len(items)
    llm = sum(1 for i in items if i.get('source') == 'llm')
    err = sum(1 for i in items if i.get('source') == 'error' or 'error' in (i.get('flags') or []))
    local = sum(1 for i in items if i.get('source') == 'local')
    down = sum(1 for i in items if (i.get('feedback') or {}).get('vote') == 'down')
    up = sum(1 for i in items if (i.get('feedback') or {}).get('vote') == 'up')
    durations = []
    for i in items:
        try:
            if i.get('durationMs') is not None:
                durations.append(int(i['durationMs']))
        except Exception:
            pass
    avg_ms = int(sum(durations) / len(durations)) if durations else None
    # top questions (normalized lightly)
    counts = {}
    for i in items:
        q = ' '.join(str(i.get('question') or '').lower().split())[:80]
        if not q:
            continue
        counts[q] = counts.get(q, 0) + 1
    top = sorted(counts.items(), key=lambda x: (-x[1], x[0]))[:8]
    return {
        'total': total,
        'llm': llm,
        'error': err,
        'local': local,
        'thumbsUp': up,
        'thumbsDown': down,
        'llmRate': round((llm / total) * 100, 1) if total else 0,
        'errorRate': round((err / total) * 100, 1) if total else 0,
        'avgDurationMs': avg_ms,
        'topQuestions': [{'q': q, 'n': n} for q, n in top],
    }
