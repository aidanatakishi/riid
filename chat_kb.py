"""Panel + qurum knowledge base for AI Done chat.

Combines static data/chat_kb.json with a live catalog from the panel snapshot
so every org's short and full name can be resolved.
"""
from __future__ import annotations

import json
import os
import re
import threading
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KB_PATH = os.path.join(BASE_DIR, 'data', 'chat_kb.json')
_LOCK = threading.RLock()
_CACHE = None
_MTIME = None

_PAREN_RE = re.compile(
    r'\(\s*([A-Za-zÇçƏəĞğIıİiÖöŞşÜü0-9]{2,14})\s*\)'
)
_STOP = {
    'dovlet', 'azerbaycan', 'respublikasi', 've', 'ile', 'uzre', 'uzrə',
    'nazirlik', 'agentlik', 'xidmet', 'komite', 'idare', 'birlik', 'fondu',
    'palatasi', 'palata', 'asci', 'qsc', 'mmc', 'asc',
}


def _fold(s: Any) -> str:
    text = str(s or '').lower()
    for a, b in (
        ('ı', 'i'), ('ə', 'e'), ('ö', 'o'), ('ü', 'u'),
        ('ğ', 'g'), ('ş', 's'), ('ç', 'c'),
    ):
        text = text.replace(a, b)
    return re.sub(r'[^a-z0-9]+', ' ', text).strip()


def qurum_stem(s: Any) -> str:
    """Normalize org names for matching (mirrors model.js qurumStemKey)."""
    f = _fold(s)
    f = (
        f.replace('respublikasinin', 'respublikasi')
        .replace('respublikasina', 'respublikasi')
        .replace('respublikasinda', 'respublikasi')
        .replace('respublikasindan', 'respublikasi')
    )
    stripped = re.sub(r'^azerbaycan\s+respublikasi\s+', '', f).strip()
    if stripped:
        f = stripped
    f = (
        f.replace('nazirliyi', 'nazirlik')
        .replace('agentliyi', 'agentlik')
        .replace('komitesi', 'komite')
        .replace('idareetmesi', 'idareetme')
        .replace('idarasi', 'idare')
        .replace('xidmeti', 'xidmet')
        .replace('birliyi', 'birlik')
        .replace('fondunun', 'fondu')
        .replace('palatasinin', 'palata')
    )
    f = re.sub(r'\baciq\s+sehmdar\s+cemiyyeti?\b', ' ', f)
    f = re.sub(r'\bqapali\s+sehmdar\s+cemiyyeti?\b', ' ', f)
    f = re.sub(r'\bmehdud\s+mesuliyyetli\s+cemiyyeti?\b', ' ', f)
    f = re.sub(r'\bsehmdar\s+cemiyyeti?\b', ' ', f)
    f = re.sub(r'\b(mmc|qsc|asc|llc|ltd|ojsc)\b', ' ', f)
    return re.sub(r'\s+', ' ', f).strip()


def strip_paren_abbrev(name: str) -> str:
    return re.sub(r'\s+', ' ', _PAREN_RE.sub(' ', str(name or ''))).strip()


def derive_aliases(name: str) -> List[str]:
    """Auto short forms from a display name: (TƏBİB), keywords, initials."""
    raw = str(name or '').strip()
    if not raw:
        return []
    out: List[str] = []
    for m in _PAREN_RE.finditer(raw):
        out.append(m.group(1).strip())
    full = re.sub(r'\s+', ' ', _PAREN_RE.sub(' ', raw)).strip()
    if full and full != raw:
        out.append(full)

    compact = _fold(full or raw).replace(' ', '')
    # name itself is already a short code
    if 2 <= len(compact) <= 10 and ' ' not in _fold(full or raw):
        out.append(full or raw)

    stem = qurum_stem(full or raw)
    words = [w for w in stem.split() if w and w not in _STOP]
    content = [w for w in words if len(w) >= 4]
    for w in content:
        if len(w) >= 5:
            out.append(w)
    if len(content) >= 2:
        out.append(' '.join(content[:2]))
        out.append(' '.join(content))

    # Initials from original tokens (skip tiny words)
    initials = []
    for tok in re.split(r'[\s\-–,;/]+', full or raw):
        t = tok.strip()
        if not t or t.startswith('('):
            continue
        ft = _fold(t)
        if ft in _STOP or len(ft) < 2:
            continue
        # first letter preserving Az letters
        initials.append(t[0])
    if 2 <= len(initials) <= 6:
        out.append(''.join(initials))
        out.append(''.join(initials).upper())

    # unique preserve order
    seen = set()
    uniq = []
    for a in out:
        a = str(a or '').strip()
        if not a:
            continue
        key = _fold(a)
        if not key or key in seen:
            continue
        if _fold(a) == _fold(raw) and a == raw:
            continue
        seen.add(key)
        uniq.append(a)
    return uniq


def _load() -> dict:
    global _CACHE, _MTIME
    try:
        mtime = os.path.getmtime(KB_PATH) if os.path.isfile(KB_PATH) else 0
    except Exception:
        mtime = 0
    if _CACHE is not None and _MTIME == mtime:
        return _CACHE
    data: dict = {'panel': [], 'qurumAliases': []}
    if os.path.isfile(KB_PATH):
        try:
            with open(KB_PATH, 'r', encoding='utf-8') as f:
                raw = json.load(f)
            if isinstance(raw, dict):
                data['panel'] = list(raw.get('panel') or []) if isinstance(raw.get('panel'), list) else []
                data['qurumAliases'] = (
                    list(raw.get('qurumAliases') or [])
                    if isinstance(raw.get('qurumAliases'), list) else []
                )
        except Exception:
            pass
    _CACHE = data
    _MTIME = mtime
    return data


def _save(data: dict) -> dict:
    global _CACHE, _MTIME
    panel = data.get('panel') if isinstance(data.get('panel'), list) else []
    aliases = data.get('qurumAliases') if isinstance(data.get('qurumAliases'), list) else []
    slim_aliases = []
    for row in aliases:
        if not isinstance(row, dict):
            continue
        canon = str(row.get('canonical') or '').strip()[:160]
        if not canon:
            continue
        als = []
        seen = set()
        for a in row.get('aliases') or []:
            t = str(a or '').strip()[:80]
            k = _fold(t)
            if not t or k in seen or k == _fold(canon):
                continue
            seen.add(k)
            als.append(t)
            if len(als) >= 20:
                break
        slim_aliases.append({'canonical': canon, 'aliases': als})
    slim_aliases.sort(key=lambda r: _fold(r.get('canonical') or ''))
    payload = {'panel': panel, 'qurumAliases': slim_aliases}
    os.makedirs(os.path.dirname(KB_PATH), exist_ok=True)
    with _LOCK:
        with open(KB_PATH, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
            f.write('\n')
        _CACHE = payload
        try:
            _MTIME = os.path.getmtime(KB_PATH)
        except Exception:
            _MTIME = None
    return payload


def list_kb() -> dict:
    data = _load()
    aliases = []
    for row in data.get('qurumAliases') or []:
        if not isinstance(row, dict):
            continue
        canon = str(row.get('canonical') or '').strip()
        if not canon:
            continue
        aliases.append({
            'canonical': canon,
            'aliases': [str(a).strip() for a in (row.get('aliases') or []) if str(a).strip()],
        })
    return {
        'qurumAliases': aliases,
        'panel': data.get('panel') or [],
        'count': len(aliases),
        'path': 'data/chat_kb.json',
    }


def upsert_qurum_alias(canonical: str, aliases: Optional[Sequence[str]] = None) -> Tuple[Optional[dict], str]:
    canon = str(canonical or '').strip()[:160]
    if not canon:
        return None, 'Tam ad (canonical) lazımdır'
    als_in = aliases if isinstance(aliases, (list, tuple)) else []
    als = []
    seen = set()
    for a in als_in:
        t = str(a or '').strip()[:80]
        k = _fold(t)
        if not t or k in seen or k == _fold(canon):
            continue
        seen.add(k)
        als.append(t)
    with _LOCK:
        data = dict(_load())
        rows = list(data.get('qurumAliases') or [])
        found = False
        for i, row in enumerate(rows):
            if not isinstance(row, dict):
                continue
            if _fold(row.get('canonical')) == _fold(canon):
                rows[i] = {'canonical': canon, 'aliases': als}
                found = True
                break
        if not found:
            rows.append({'canonical': canon, 'aliases': als})
        data['qurumAliases'] = rows
        _save(data)
    return {'canonical': canon, 'aliases': als}, ''


def delete_qurum_alias(canonical: str) -> Tuple[bool, str]:
    canon = str(canonical or '').strip()
    if not canon:
        return False, 'canonical lazımdır'
    with _LOCK:
        data = dict(_load())
        rows = [
            row for row in (data.get('qurumAliases') or [])
            if isinstance(row, dict) and _fold(row.get('canonical')) != _fold(canon)
        ]
        if len(rows) == len(data.get('qurumAliases') or []):
            return False, 'Qurum tapılmadı'
        data['qurumAliases'] = rows
        _save(data)
    return True, ''


def resolve_qurum_label(query: str, candidates: Optional[Sequence[str]] = None) -> dict:
    match, suggestions = fuzzy_qurum(query, list(candidates or []), live_catalog=list_kb().get('qurumAliases'))
    return {
        'query': str(query or '').strip(),
        'match': match,
        'suggestions': suggestions[:8],
        'aliases': derive_aliases(match) if match else derive_aliases(query),
    }


def _merge_alias_rows(base: List[dict], incoming: Sequence[dict]) -> List[dict]:
    """Merge by folded canonical; union aliases."""
    by: Dict[str, dict] = {}
    order: List[str] = []

    def add(canon: str, aliases: Sequence[str]):
        canon = str(canon or '').strip()[:160]
        if not canon:
            return
        key = _fold(canon)
        if key not in by:
            by[key] = {'canonical': canon, 'aliases': []}
            order.append(key)
        elif len(canon) > len(by[key]['canonical']):
            by[key]['canonical'] = canon
        seen = {_fold(a) for a in by[key]['aliases']}
        seen.add(_fold(canon))
        for a in aliases or []:
            t = str(a or '').strip()[:80]
            k = _fold(t)
            if not t or k in seen:
                continue
            seen.add(k)
            by[key]['aliases'].append(t)

    for row in base or []:
        if isinstance(row, dict):
            add(row.get('canonical') or '', row.get('aliases') or [])
    for row in incoming or []:
        if isinstance(row, dict):
            add(row.get('canonical') or row.get('name') or '', row.get('aliases') or [])
        elif isinstance(row, str):
            add(row, derive_aliases(row))
    return [by[k] for k in order]


def seed_builtin_aliases() -> dict:
    """Merge curated AZ government short names into chat_kb.json."""
    from chat_kb_seed import BUILTIN_QURUM_ALIASES
    with _LOCK:
        data = dict(_load())
        merged = _merge_alias_rows(list(data.get('qurumAliases') or []), BUILTIN_QURUM_ALIASES)
        data['qurumAliases'] = merged
        _save(data)
    out = list_kb()
    out['seeded'] = True
    out['builtinCount'] = len(BUILTIN_QURUM_ALIASES)
    return out


def merge_live_names(names: Sequence[str]) -> dict:
    """Add panel org names (with auto-derived aliases) into the KB."""
    incoming = []
    for n in names or []:
        n = str(n or '').strip()
        if not n:
            continue
        incoming.append({'canonical': n, 'aliases': derive_aliases(n)})
    with _LOCK:
        data = dict(_load())
        data['qurumAliases'] = _merge_alias_rows(list(data.get('qurumAliases') or []), incoming)
        _save(data)
    return list_kb()


def enrich_aliases_with_llm(names: Optional[Sequence[str]] = None) -> Tuple[dict, str]:
    """Ask configured LLM for official short names; merge into KB.

    If names empty — enrich existing KB entries that have few aliases.
    """
    import chat_llm

    if not chat_llm.chat_llm_ready():
        return {}, 'AI açarı yoxdur (.env OPENAI_API_KEY)'

    existing = list_kb().get('qurumAliases') or []
    targets: List[str] = []
    if names:
        targets = [str(n).strip() for n in names if str(n).strip()][:60]
    else:
        for row in existing:
            als = row.get('aliases') or []
            if len(als) < 2:
                targets.append(row.get('canonical') or '')
        if not targets:
            targets = [r.get('canonical') or '' for r in existing[:40]]
    targets = [t for t in targets if t][:40]
    if not targets:
        return list_kb(), 'Zənginləşdiriləcək qurum yoxdur'

    prompt = (
        'Azərbaycan Respublikasının dövlət qurumları üçün rəsmi və ya geniş yayılmış '
        'qısa adları (abbreviaturaları) ver.\n'
        'Yalnız JSON massiv qaytar, markdown yox: '
        '[{"canonical":"tam rəsmi ad","aliases":["QISA","digər"]}]\n'
        'Qaydalar: uydurma qısaltma yazma; bilmirsənsə aliases-i boş burax; '
        'mövcud rəsmi abbreviaturaları (DİN, DMX, TƏBİB, RİNN, DGK və s.) üstün tut.\n'
        'Qurumlar:\n- ' + '\n- '.join(targets)
    )
    gemini, openai = chat_llm._keys()
    text = None
    if openai:
        text = chat_llm._openai(
            openai,
            prompt,
            system='Sən Azərbaycan dövlət idarəetməsi üzrə dəqiq məlumat köməkçisisən. Yalnız JSON.',
        )
    if not text and gemini:
        text = chat_llm._gemini(gemini, prompt)
    if not text:
        return {}, chat_llm.LAST_ERROR or 'AI cavab vermədi'

    raw = text.strip()
    if raw.startswith('```'):
        raw = raw.strip('`')
        if raw.lower().startswith('json'):
            raw = raw[4:].strip()
    try:
        start = raw.find('[')
        end = raw.rfind(']')
        if start >= 0 and end > start:
            raw = raw[start:end + 1]
        parsed = json.loads(raw)
    except Exception:
        return {}, 'AI JSON parse xətası'

    if not isinstance(parsed, list):
        return {}, 'AI cavabı gözlənilən formatda deyil'

    incoming = []
    for row in parsed:
        if not isinstance(row, dict):
            continue
        canon = str(row.get('canonical') or row.get('name') or '').strip()
        als = row.get('aliases') if isinstance(row.get('aliases'), list) else []
        if canon:
            incoming.append({'canonical': canon, 'aliases': als})

    with _LOCK:
        data = dict(_load())
        data['qurumAliases'] = _merge_alias_rows(list(data.get('qurumAliases') or []), incoming)
        _save(data)
    out = list_kb()
    out['enriched'] = len(incoming)
    return out, ''


def _pairs_from_entry(canon: str, aliases: Iterable[str]) -> List[Tuple[str, str]]:
    canon = str(canon or '').strip()
    if not canon:
        return []
    out: List[Tuple[str, str]] = [
        (_fold(canon), canon),
        (qurum_stem(canon), canon),
    ]
    full = re.sub(r'\s+', ' ', _PAREN_RE.sub(' ', canon)).strip()
    if full and full != canon:
        out.append((_fold(full), canon))
        out.append((qurum_stem(full), canon))
    for al in list(aliases or []) + derive_aliases(canon):
        a = str(al or '').strip()
        if not a:
            continue
        out.append((_fold(a), canon))
        out.append((qurum_stem(a), canon))
        # no-space form for DMX / TƏBİB
        ns = _fold(a).replace(' ', '')
        if ns and len(ns) <= 12:
            out.append((ns, canon))
    return out


def alias_pairs(live_catalog: Optional[Sequence[dict]] = None) -> List[Tuple[str, str]]:
    """(folded_key, canonical_display) from static KB + live snapshot catalog."""
    out: List[Tuple[str, str]] = []
    for row in _load().get('qurumAliases') or []:
        if not isinstance(row, dict):
            continue
        out.extend(_pairs_from_entry(row.get('canonical') or '', row.get('aliases') or []))
    for row in live_catalog or []:
        if isinstance(row, str):
            out.extend(_pairs_from_entry(row, []))
            continue
        if not isinstance(row, dict):
            continue
        name = str(row.get('name') or row.get('canonical') or row.get('qurum') or '').strip()
        aliases = row.get('aliases') or []
        if not isinstance(aliases, list):
            aliases = []
        out.extend(_pairs_from_entry(name, aliases))
    return out


def expand_qurum_query(query: str, live_catalog: Optional[Sequence[dict]] = None) -> List[str]:
    """Return query variants including KB + live canonical/aliases."""
    q = str(query or '').strip()
    if not q:
        return []
    variants = [q]
    qf = _fold(q)
    qs = qurum_stem(q)
    qns = qf.replace(' ', '')
    for key, canon in alias_pairs(live_catalog):
        if not key:
            continue
        hit = (
            key == qf or key == qs or key == qns
            or (len(key) >= 3 and (key in qf or qf in key or key in qs or qs in key))
            or (len(key) >= 2 and len(key) <= 10 and key == qns)
        )
        if hit and canon not in variants:
            variants.append(canon)
    # also expand derived aliases of the query itself
    for a in derive_aliases(q):
        if a not in variants:
            variants.append(a)
    return variants


def fuzzy_qurum(
    query: str,
    candidates: List[str],
    limit: int = 6,
    live_catalog: Optional[Sequence[dict]] = None,
) -> Tuple[Optional[str], List[str]]:
    """Best org match from live names + static/live aliases.

    Prefers live panel names and shorter titles when the query does not
    mention extra words (e.g. «mədəniyyət» → Nazirlik, not Turizm Agentliyi).
    """
    q_raw = str(query or '').strip()
    if not q_raw:
        return None, []
    pairs = alias_pairs(live_catalog)
    variants = expand_qurum_query(q_raw, live_catalog)
    q_folds = []
    for v in variants:
        q_folds.append(_fold(v))
        q_folds.append(qurum_stem(v))
        q_folds.append(_fold(v).replace(' ', ''))
    q_folds = [x for x in q_folds if x]

    live_set = {str(c).strip() for c in (candidates or []) if str(c).strip()}
    pool = list(candidates or [])
    # KB adlarını yalnız live boş olanda və ya qısa abbreviatura (DMX) üçün əlavə et
    q_compact = _fold(q_raw).replace(' ', '')
    allow_kb_pool = (not live_set) or (2 <= len(q_compact) <= 8)
    if allow_kb_pool:
        for key, canon in pairs:
            if not canon or canon in pool:
                continue
            if any(
                key == qf
                or (len(key) >= 2 and len(key) <= 12 and key == qf)
                or (len(key) >= 3 and (key in qf or qf in key))
                for qf in q_folds
            ):
                pool.append(canon)

    q_content: set = set()
    for qf in q_folds:
        q_content |= {w for w in qf.split() if len(w) >= 3 and w not in _STOP}

    # Map each candidate to extra alias keys for scoring
    cand_keys: Dict[str, List[str]] = {}
    for cand in pool:
        keys = [_fold(cand), qurum_stem(cand), _fold(cand).replace(' ', '')]
        for a in derive_aliases(cand):
            keys.append(_fold(a))
            keys.append(qurum_stem(a))
            keys.append(_fold(a).replace(' ', ''))
        cf = _fold(cand)
        cs = qurum_stem(cand)
        for key, canon in pairs:
            if _fold(canon) == cf or qurum_stem(canon) == cs:
                keys.append(key)
        cand_keys[cand] = [k for k in keys if k]

    scored = []
    for cand in pool:
        keys = cand_keys.get(cand) or []
        cf = _fold(cand)
        cs = qurum_stem(cand)
        score = 0.0
        for qf in q_folds:
            if not qf:
                continue
            if qf in keys or cf == qf or cs == qf:
                score = max(score, 100 if len(qf) <= 12 else 96)
                continue
            if len(qf) >= 4 and any(qf in k or k in qf for k in keys if len(k) >= 4):
                score = max(score, 88 + min(10, len(qf)))
                continue
            qw = set(qf.split())
            cw = set(cs.split()) | set(cf.split())
            qw2 = {w for w in qw if len(w) >= 3 and w not in _STOP}
            cw2 = {w for w in cw if len(w) >= 3 and w not in _STOP}
            if qw2 and cw2:
                overlap = len(qw2 & cw2)
                if overlap:
                    ratio = overlap / max(len(qw2), 1)
                    score = max(score, 45 + overlap * 18 + ratio * 20)
                for w in qw2:
                    if len(w) >= 5 and w in cw2:
                        score = max(score, 75 + min(15, len(w)))
        if score <= 0:
            continue
        c_content = {w for w in (cs.split() + cf.split()) if len(w) >= 3 and w not in _STOP}
        extra = c_content - q_content
        # «turizm», «vergi», «yaninda» sorğuda yoxdursa — cəzalandır
        if extra:
            score -= min(55.0, 14.0 * len(extra))
        if q_content and q_content <= c_content:
            score += 12.0
        if cand in live_set:
            score += 10.0
        # eyni balda qısa ad üstün (Turizm Agentliyi yox, Nazirlik)
        scored.append((score, len(cf), cand))

    scored.sort(key=lambda x: (-x[0], x[1], x[2]))
    if not scored:
        return None, []
    suggestions = [c for _, __, c in scored[:limit]]
    best_score, _, best = scored[0]
    if best_score < 50:
        return None, suggestions
    return best, suggestions


def format_qurum_glossary(live_catalog: Optional[Sequence[dict]] = None, limit: int = 80) -> str:
    """Compact short=full lines for the model prompt."""
    rows: List[Tuple[str, str]] = []
    seen = set()

    def add(canon: str, aliases: Sequence[str]):
        canon = str(canon or '').strip()
        if not canon:
            return
        key = _fold(canon)
        if key in seen:
            return
        seen.add(key)
        shorts = []
        for a in list(aliases or []) + derive_aliases(canon):
            a = str(a or '').strip()
            if not a or _fold(a) == key:
                continue
            if len(_fold(a).replace(' ', '')) <= 14:
                shorts.append(a)
        # prefer parenthetical / very short
        shorts_u = []
        sseen = set()
        for a in shorts:
            fk = _fold(a)
            if fk in sseen:
                continue
            sseen.add(fk)
            shorts_u.append(a)
            if len(shorts_u) >= 4:
                break
        if shorts_u:
            rows.append((canon, ', '.join(shorts_u)))
        else:
            rows.append((canon, ''))

    for row in live_catalog or []:
        if isinstance(row, str):
            add(row, [])
        elif isinstance(row, dict):
            add(row.get('name') or row.get('canonical') or '', row.get('aliases') or [])
    for row in _load().get('qurumAliases') or []:
        if isinstance(row, dict):
            add(row.get('canonical') or '', row.get('aliases') or [])

    if not rows:
        return ''
    rows = rows[: max(1, min(int(limit or 80), 120))]
    lines = ['Qurum lüğəti (tam ad ↔ qısa ad; uyğunlaşdırmaq üçün):']
    for canon, shorts in rows:
        if shorts:
            lines.append('- ' + canon + ' ↔ ' + shorts)
        else:
            lines.append('- ' + canon)
    return '\n'.join(lines)


def search_knowledge(
    query: str,
    limit: int = 5,
    live_catalog: Optional[Sequence[dict]] = None,
) -> dict:
    qf = _fold(query)
    if not qf:
        return {'items': [], 'qurumHints': []}
    items = []
    for row in _load().get('panel') or []:
        if not isinstance(row, dict):
            continue
        blob = _fold(
            ' '.join([
                str(row.get('id') or ''),
                str(row.get('title') or ''),
                str(row.get('text') or ''),
                ' '.join(str(a) for a in (row.get('aliases') or [])),
            ])
        )
        score = 0
        if qf in blob:
            score = 10
        else:
            overlap = len(set(qf.split()) & set(blob.split()))
            score = overlap
        if score > 0:
            items.append({
                'id': row.get('id'),
                'title': row.get('title'),
                'text': row.get('text'),
                'score': score,
            })
    items.sort(key=lambda x: -int(x.get('score') or 0))
    cands = []
    for row in live_catalog or []:
        if isinstance(row, str):
            cands.append(row)
        elif isinstance(row, dict):
            n = str(row.get('name') or row.get('canonical') or '').strip()
            if n:
                cands.append(n)
    match, suggestions = fuzzy_qurum(query, cands, live_catalog=live_catalog)
    return {
        'items': items[: max(1, min(int(limit or 5), 10))],
        'qurumMatch': match,
        'qurumHints': suggestions[:5],
        'glossaryHit': match,
    }
