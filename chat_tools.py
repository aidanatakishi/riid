"""Snapshot-based chat tools for AI Done (server-side)."""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Callable, Dict, List, Optional, Tuple

from chat_kb import fuzzy_qurum, search_knowledge, qurum_stem, format_qurum_glossary, derive_aliases

SOFT_FAIL = 'Cavab alına bilmədi, yenidən cəhd edin'

TOOL_LABELS = {
    'get_overview': 'Ümumi mənzərəyə baxıram…',
    'get_my_tasks': 'Sizin işlərinizə baxıram…',
    'get_person_workload': 'İş yükünü hesablayıram…',
    'get_qurum_stats': 'Qurum üzrə məlumata baxıram…',
    'search_tasks': 'Tapşırıqlara baxıram…',
    'compare_sprints': 'Sprintləri müqayisə edirəm…',
    'get_risks': 'Risklər hesablanır…',
    'get_kpi': 'KPI göstəricilərinə baxıram…',
    'get_dashboard': 'Panel kartlarına baxıram…',
    'get_task': 'Tapşırığa baxıram…',
    'get_assessment_scores': 'Qiymətləndirmə ballarına baxıram…',
    'get_meqsed_stats': 'Məqsədəuyğunluq rəylərinə baxıram…',
    'lookup_knowledge': 'Bilik bazasına baxıram…',
}

_DASH_SECTIONS = {
    'workload': 'İş yükü',
    'status': 'İcra statusu',
    'priority': 'Prioritetlər',
    'directions': 'İstiqamətlər',
    'qurum': 'Qurumlar',
    'risks': 'Risklər',
    'overview': 'Ümumi',
    'all': 'Bütün panellər',
}

_MEQSED_OPINIONS = {
    'pos': 'müsbət',
    'neg': 'mənfi',
    'partial': 'qismən',
    'revision': 'düzəlişə göndərildi',
}

ASSESS_LABELS = {
    'diag': 'Rəqəmsallaşma diaqnostikası',
    'exq': 'Elektron xidmətlərin qiymətləndirilməsi',
    'isq': 'İnformasiya ehtiyat və sistemlərinin qiymətləndirilməsi',
    'self': 'Özünüqiymətləndirmə',
    'meqsed': 'Məqsədəuyğunluq rəyi',
}


def fold(s: Any) -> str:
    text = str(s or '').lower()
    for a, b in (
        ('ı', 'i'), ('ə', 'e'), ('ö', 'o'), ('ü', 'u'),
        ('ğ', 'g'), ('ş', 's'), ('ç', 'c'),
    ):
        text = text.replace(a, b)
    return re.sub(r'[^a-z0-9]+', ' ', text).strip()


def fold_loose(s: Any) -> str:
    """Az/latın əlavə yumşaq qatlama: a↔e (Mammadova ≈ Məmmədova)."""
    return fold(s).replace('a', 'e')


def snapshot_hash(snapshot: Optional[dict]) -> str:
    if not isinstance(snapshot, dict):
        return ''
    try:
        blob = json.dumps(snapshot, ensure_ascii=False, sort_keys=True)
    except Exception:
        return ''
    return hashlib.sha256(blob.encode('utf-8')).hexdigest()[:16]


def _truthy(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    s = str(v or '').strip().lower()
    return s in ('1', 'true', 'yes', 'y', 'blocked', 'overdue', 'late')


def _parse_task_row(row: Any) -> Optional[dict]:
    if isinstance(row, dict):
        key = str(row.get('key') or '').strip()
        if not key:
            return None
        return {
            'key': key,
            'status': str(row.get('status') or ''),
            'assignee': str(row.get('assignee') or ''),
            'priority': str(row.get('priority') or ''),
            'due': str(row.get('due') or ''),
            'direction': str(row.get('direction') or ''),
            'sprint': str(row.get('sprint') or ''),
            'blocked': _truthy(row.get('blocked')),
            'overdue': _truthy(row.get('overdue') or row.get('late')),
            'summary': str(row.get('summary') or row.get('title') or ''),
            'qurum': str(row.get('qurum') or row.get('org') or ''),
        }
    text = str(row or '').strip()
    if not text:
        return None
    parts = text.split('|')
    while len(parts) < 11:
        parts.append('')
    return {
        'key': parts[0].strip(),
        'status': parts[1].strip(),
        'assignee': parts[2].strip(),
        'priority': parts[3].strip(),
        'due': parts[4].strip(),
        'direction': parts[5].strip(),
        'sprint': parts[6].strip(),
        'blocked': _truthy(parts[7]),
        'overdue': _truthy(parts[8]),
        'summary': parts[9].strip(),
        'qurum': parts[10].strip(),
    }


def _normalize_opinion(raw: Any) -> str:
    f = fold(raw)
    if f in ('pos', 'musbet', 'müsbət', 'musbet rey', 'positive'):
        return 'pos'
    if f in ('neg', 'menfi', 'mənfi', 'negative'):
        return 'neg'
    if f in ('partial', 'qismen', 'qismən'):
        return 'partial'
    if f in ('revision', 'duzelis', 'düzəliş', 'duzelise'):
        return 'revision'
    return ''


def _parse_assess_row(row: Any) -> Optional[dict]:
    """cat|qurum|score|year|key  və ya meqsed|qurum|opinion|year|key / dict."""
    if isinstance(row, dict):
        cat = fold(row.get('cat') or row.get('category') or '')
        if cat in ('diaqnostika', 'diagnosis'):
            cat = 'diag'
        opinion = _normalize_opinion(row.get('opinion') or row.get('result') or '')
        score_raw = row.get('score')
        score = None
        if not opinion and score_raw not in (None, ''):
            op_try = _normalize_opinion(score_raw)
            if op_try:
                opinion = op_try
            else:
                try:
                    score = float(score_raw)
                except (TypeError, ValueError):
                    score = None
        year_raw = row.get('year')
        try:
            year = int(year_raw) if year_raw not in (None, '') else None
        except (TypeError, ValueError):
            year = None
        return {
            'cat': cat or str(row.get('cat') or row.get('category') or ''),
            'qurum': str(row.get('qurum') or row.get('org') or '').strip(),
            'score': score,
            'opinion': opinion,
            'year': year,
            'key': str(row.get('key') or '').strip(),
        }
    text = str(row or '').strip()
    if not text:
        return None
    parts = text.split('|')
    while len(parts) < 5:
        parts.append('')
    cat = fold(parts[0])
    if cat in ('diaqnostika', 'diagnosis'):
        cat = 'diag'
    mid = parts[2].strip()
    opinion = _normalize_opinion(mid)
    score = None
    if mid and not opinion:
        try:
            score = float(mid.replace(',', '.'))
        except ValueError:
            score = None
    year = None
    if parts[3].strip():
        try:
            year = int(float(parts[3]))
        except ValueError:
            year = None
    return {
        'cat': cat or parts[0].strip(),
        'qurum': parts[1].strip(),
        'score': score,
        'opinion': opinion,
        'year': year,
        'key': parts[4].strip(),
    }


def normalize_snapshot(raw: Any) -> dict:
    if not isinstance(raw, dict):
        raw = {}
    meta = raw.get('meta') if isinstance(raw.get('meta'), dict) else {}
    overview = raw.get('overview') if isinstance(raw.get('overview'), dict) else {}
    tasks_raw = raw.get('tasks') if isinstance(raw.get('tasks'), list) else []
    tasks = []
    for row in tasks_raw:
        parsed = _parse_task_row(row)
        if parsed and parsed.get('key'):
            tasks.append(parsed)
    assess_raw = raw.get('assessments') if isinstance(raw.get('assessments'), list) else []
    assessments = []
    for row in assess_raw:
        parsed_a = _parse_assess_row(row)
        if parsed_a and (parsed_a.get('qurum') or parsed_a.get('key')):
            assessments.append(parsed_a)
    qurums: List[dict] = []
    seen_q = set()
    qurum_raw = raw.get('qurums') if isinstance(raw.get('qurums'), list) else []
    for row in qurum_raw:
        if isinstance(row, str):
            name = row.strip()
            aliases: List[str] = derive_aliases(name)
        elif isinstance(row, dict):
            name = str(row.get('name') or row.get('canonical') or row.get('qurum') or '').strip()
            al = row.get('aliases') if isinstance(row.get('aliases'), list) else []
            aliases = [str(a).strip() for a in al if str(a).strip()]
            for extra in derive_aliases(name):
                if extra not in aliases:
                    aliases.append(extra)
        else:
            continue
        if not name:
            continue
        key = fold(name)
        if key in seen_q:
            continue
        seen_q.add(key)
        qurums.append({'name': name[:120], 'aliases': aliases[:12]})
    # fill from tasks/assessments if catalog empty/incomplete
    for t in tasks:
        name = str(t.get('qurum') or '').strip()
        if not name:
            continue
        for part in re.split(r'\s*,\s*', name):
            p = part.strip()
            if not p or fold(p) in seen_q:
                continue
            seen_q.add(fold(p))
            qurums.append({'name': p[:120], 'aliases': derive_aliases(p)[:12]})
    for a in assessments:
        name = str(a.get('qurum') or '').strip()
        if not name or fold(name) in seen_q:
            continue
        seen_q.add(fold(name))
        qurums.append({'name': name[:120], 'aliases': derive_aliases(name)[:12]})
    task_details: Dict[str, dict] = {}
    details_raw = raw.get('taskDetails') if isinstance(raw.get('taskDetails'), dict) else {}
    for key, val in details_raw.items():
        k = str(key or '').strip().upper()
        if not k or not isinstance(val, dict):
            continue
        fields_in = val.get('fields') if isinstance(val.get('fields'), dict) else {}
        fields_out: Dict[str, str] = {}
        for fk, fv in list(fields_in.items())[:50]:
            fs = str(fv or '').strip()
            if fs:
                fields_out[str(fk)[:80]] = fs[:400]
        task_details[k] = {
            'key': k,
            'summary': str(val.get('summary') or '')[:200],
            'status': str(val.get('status') or '')[:80],
            'assignee': str(val.get('assignee') or '')[:80],
            'qurum': str(val.get('qurum') or '')[:120],
            'fields': fields_out,
        }
    return {
        'meta': {
            'user': str(meta.get('user') or ''),
            'today': str(meta.get('today') or ''),
            'sprint': str(meta.get('sprint') or ''),
            'week': str(meta.get('week') or ''),
            'prevWeek': str(meta.get('prevWeek') or meta.get('prev_week') or ''),
        },
        'overview': overview,
        'tasks': tasks,
        'assessments': assessments,
        'qurums': qurums,
        'taskDetails': task_details,
        'dashboards': raw.get('dashboards') if isinstance(raw.get('dashboards'), dict) else {},
        'truncated': bool(raw.get('truncated')),
    }


def _task_brief(t: dict) -> dict:
    return {
        'key': t.get('key'),
        'status': t.get('status'),
        'assignee': t.get('assignee'),
        'priority': t.get('priority'),
        'due': t.get('due'),
        'direction': t.get('direction'),
        'sprint': t.get('sprint'),
        'blocked': bool(t.get('blocked')),
        'overdue': bool(t.get('overdue')),
        'summary': t.get('summary') or '',
        'qurum': t.get('qurum') or '',
    }


def _unique_qurums(tasks: List[dict], assessments: Optional[List[dict]] = None) -> List[str]:
    seen = []
    for t in tasks or []:
        name = str(t.get('qurum') or '').strip()
        if not name:
            continue
        # multi-qurum "A, B"
        for part in re.split(r'\s*,\s*', name):
            p = part.strip()
            if p and p not in seen:
                seen.append(p)
    for a in assessments or []:
        name = str(a.get('qurum') or '').strip()
        if name and name not in seen:
            seen.append(name)
    return seen


def _qurum_matches(task_qurum: str, needle_name: str) -> bool:
    """True if task org equals / contains resolved qurum (stem-aware)."""
    if not needle_name:
        return True
    tq = str(task_qurum or '')
    if not tq:
        return False
    ns = qurum_stem(needle_name)
    nf = fold(needle_name)
    n_compact = nf.replace(' ', '')
    if not ns and not nf:
        return True
    needle_keys = {ns, nf, n_compact}
    for a in derive_aliases(needle_name):
        needle_keys.add(fold(a))
        needle_keys.add(qurum_stem(a))
        needle_keys.add(fold(a).replace(' ', ''))
    needle_keys = {k for k in needle_keys if k}
    for part in re.split(r'\s*,\s*', tq):
        ps = qurum_stem(part)
        pf = fold(part)
        p_compact = pf.replace(' ', '')
        part_keys = {ps, pf, p_compact}
        for a in derive_aliases(part):
            part_keys.add(fold(a))
            part_keys.add(qurum_stem(a))
            part_keys.add(fold(a).replace(' ', ''))
        part_keys = {k for k in part_keys if k}
        if needle_keys & part_keys:
            return True
        if ns and (ns in ps or ps in ns):
            return True
        if nf and len(nf) >= 4 and (nf in pf or pf in nf):
            return True
        # qısa abbreviatura: TƏBİB / DMX
        if n_compact and 2 <= len(n_compact) <= 10 and n_compact in part_keys:
            return True
    return False


def _status_fold(t: dict) -> str:
    return fold(t.get('status'))


def _is_done(t: dict) -> bool:
    s = _status_fold(t)
    return any(x in s for x in ('done', 'yekun', 'tamam', 'closed', 'resolved', 'bitib'))


def _status_matches(t: dict, status: str) -> bool:
    """Match status filter; map common EN aliases to panel statuses."""
    needle = fold(status)
    if not needle:
        return True
    sf = _status_fold(t)
    if needle in sf or sf in needle:
        return True
    # LLM tez-tez status=\"open\" / \"in progress\" göndərir
    if needle in ('open', 'active', 'todo', 'to do', 'backlog', 'yeni'):
        return not _is_done(t)
    if needle in ('progress', 'in progress', 'inprogress', 'doing', 'icra', 'icrada'):
        return (not _is_done(t)) and (not bool(t.get('blocked')))
    if needle in ('done', 'closed', 'resolved', 'complete', 'completed', 'tamam', 'yekun'):
        return _is_done(t)
    if needle in ('block', 'blocked', 'blok', 'bloklan'):
        return bool(t.get('blocked')) or any(x in sf for x in ('blok', 'block'))
    if needle in ('late', 'overdue', 'gecik'):
        return bool(t.get('overdue'))
    return False


def _match_text(t: dict, needle: str) -> bool:
    nf = fold(needle)
    if not nf:
        return True
    blob = fold(' '.join([
        str(t.get('key') or ''),
        str(t.get('summary') or ''),
        str(t.get('assignee') or ''),
        str(t.get('direction') or ''),
        str(t.get('status') or ''),
        str(t.get('qurum') or ''),
    ]))
    return nf in blob or all(w in blob for w in nf.split() if len(w) >= 3)


def _unique_names(tasks: List[dict]) -> List[str]:
    seen = []
    for t in tasks:
        name = str(t.get('assignee') or '').strip()
        if name and name not in seen:
            seen.append(name)
    return seen


def fuzzy_person(name: str, candidates: List[str], limit: int = 5) -> Tuple[Optional[str], List[str]]:
    """Return best match and suggestions. Az/Latin fold + partial overlap."""
    q = fold(name)
    ql = fold_loose(name)
    if not q:
        return None, []
    scored = []
    for cand in candidates:
        cf = fold(cand)
        cl = fold_loose(cand)
        if not cf:
            continue
        score = 0.0
        q_words = q.split()
        c_words = cf.split()
        if cf == q or cl == ql:
            # Exact / loose-exact; short name slightly below fuller first+last
            score = 95 if len(q_words) == 1 and cf != q else 100
            if len(q_words) == 1 and cf == q:
                score = 95
        elif len(q_words) == 1 and c_words and (
            c_words[0] == q_words[0] or fold_loose(c_words[0]) == fold_loose(q_words[0])
        ):
            score = 98 + min(10, len(c_words))
        elif q in cf or cf in q or ql in cl or cl in ql:
            score = 85 + min(20, len(cf))
        else:
            qw = set(q_words) | set(ql.split())
            cw = set(c_words) | set(cl.split())
            if not qw:
                continue
            overlap = len(qw & cw)
            if overlap:
                score = 40 + overlap * 15
            q0 = q_words[0] if q_words else ''
            c0 = c_words[0] if c_words else ''
            if q0 and c0 and (
                q0 == c0 or fold_loose(q0) == fold_loose(c0) or q0 in c0 or c0 in q0
            ):
                score = max(score, 70 + min(15, len(cf)))
        if score > 0:
            scored.append((score, len(cf), cand))
    scored.sort(key=lambda x: (-x[0], -x[1], x[2]))
    if not scored:
        return None, []
    best_score, _, best = scored[0]
    suggestions = [c for _, __, c in scored[:limit]]
    if best_score < 40:
        return None, suggestions
    return best, suggestions


def _normalize_assess_cat(raw: str) -> str:
    f = fold(raw)
    if not f or f in ('all', 'hamisi', 'umumi'):
        return ''
    if 'diag' in f or 'diaqnost' in f or 'yetkin' in f or 'reqemsallas' in f:
        return 'diag'
    if f == 'exq' or 'elektron xidmet' in f:
        return 'exq'
    if f == 'isq' or 'informasiya ehtiyat' in f or 'sistemlerin qiymet' in f:
        return 'isq'
    if 'self' in f or 'ozunuqiymet' in f:
        return 'self'
    if 'meqsed' in f:
        return 'meqsed'
    if f in ASSESS_LABELS:
        return f
    return f


class SnapshotTools:
    def __init__(self, snapshot: Any):
        self.snap = normalize_snapshot(snapshot)
        self.tasks = self.snap['tasks']
        self.assessments = self.snap.get('assessments') or []
        self.qurum_catalog = self.snap.get('qurums') or []
        self.task_details = self.snap.get('taskDetails') or {}
        self.dashboards = self.snap.get('dashboards') if isinstance(self.snap.get('dashboards'), dict) else {}
        self.overview = self.snap['overview']
        self.meta = self.snap['meta']
        self.truncated = self.snap['truncated']

    def _dashboards_from_tasks(self) -> dict:
        """Client dashboards yoxdursa — task siyahısından eyni reytinqləri qur."""
        people: Dict[str, Dict[str, Any]] = {}
        by_pri: Dict[str, int] = {}
        by_status: Dict[str, int] = {}
        by_dir: Dict[str, int] = {}
        by_qurum: Dict[str, int] = {}
        late_n = 0
        blocked_n = 0
        open_n = 0
        done_n = 0
        for t in self.tasks:
            name = str(t.get('assignee') or '').strip()
            pri = str(t.get('priority') or '—') or '—'
            st = str(t.get('status') or '—') or '—'
            direction = str(t.get('direction') or 'İstiqamətsiz') or 'İstiqamətsiz'
            qurum = str(t.get('qurum') or '').strip()
            done = _is_done(t)
            if name:
                row = people.setdefault(
                    name,
                    {'total': 0, 'open': 0, 'done': 0, 'late': 0, 'blocked': 0, 'byPriority': {}},
                )
                row['total'] += 1
                row['byPriority'][pri] = int(row['byPriority'].get(pri) or 0) + 1
                if done:
                    row['done'] += 1
                else:
                    row['open'] += 1
                if t.get('overdue'):
                    row['late'] += 1
                if t.get('blocked'):
                    row['blocked'] += 1
            by_pri[pri] = by_pri.get(pri, 0) + 1
            by_status[st] = by_status.get(st, 0) + 1
            by_dir[direction] = by_dir.get(direction, 0) + 1
            if qurum:
                by_qurum[qurum] = by_qurum.get(qurum, 0) + 1
            if done:
                done_n += 1
            else:
                open_n += 1
            if t.get('overdue'):
                late_n += 1
            if t.get('blocked'):
                blocked_n += 1

        def ranked(m: Dict[str, int], lim: int = 15) -> List[dict]:
            rows = [{'name': k, 'total': v} for k, v in m.items()]
            rows.sort(key=lambda x: (-x['total'], x['name']))
            return rows[:lim]

        people_rows = [
            {'name': k, **v} for k, v in people.items()
        ]
        people_rows.sort(key=lambda x: (-int(x.get('total') or 0), str(x.get('name') or '')))
        return {
            'totalUnits': len(self.tasks),
            'open': open_n,
            'done': done_n,
            'late': late_n,
            'blocked': blocked_n,
            'workload': {
                'people': people_rows[:25],
                'heaviest': people_rows[0] if people_rows else None,
                'lightest': people_rows[-1] if people_rows else None,
            },
            'status': ranked(by_status, 12),
            'priority': ranked(by_pri, 10),
            'directions': ranked(by_dir, 15),
            'qurums': ranked(by_qurum, 15),
        }

    def _qurum_candidates(self) -> List[str]:
        return _unique_qurums(self.tasks, self.assessments) or [
            str(r.get('name') or '') for r in self.qurum_catalog if r.get('name')
        ]

    def _resolve_qurum(self, query: str):
        return fuzzy_qurum(
            query,
            self._qurum_candidates(),
            live_catalog=self.qurum_catalog,
        )

    def qurum_glossary_text(self, limit: int = 80) -> str:
        return format_qurum_glossary(self.qurum_catalog, limit=limit)

    def get_overview(self) -> dict:
        ov = dict(self.overview or {})
        if not ov and self.tasks:
            total = len(self.tasks)
            done = sum(1 for t in self.tasks if _is_done(t))
            late = sum(1 for t in self.tasks if t.get('overdue'))
            blocked = sum(1 for t in self.tasks if t.get('blocked'))
            ov = {
                'total': total,
                'done': done,
                'open': max(0, total - done),
                'late': late,
                'blocked': blocked,
                'completionPct': round((done / total) * 100) if total else 0,
            }
        return {
            'overview': ov,
            'meta': self.meta,
            'taskCount': len(self.tasks),
        }

    def get_my_tasks(self, status: str = '', priority: str = '') -> dict:
        user = self.meta.get('user') or ''
        if not user:
            return {'error': 'not_found', 'reason': 'viewer_unknown', 'suggestions': []}
        return self.search_tasks(status=status, assignee=user, priority=priority, limit=30)

    def _workload_row_for(self, person: str) -> Optional[dict]:
        """İş yükü panelindəki rəqəm (kəsilmiş task siyahısından yox)."""
        dash = self.dashboards if isinstance(self.dashboards, dict) else {}
        wl = dash.get('workload') if isinstance(dash.get('workload'), dict) else {}
        people = wl.get('people') if isinstance(wl.get('people'), list) else []
        if not people:
            return None
        pf = fold(person)
        best = None
        for row in people:
            if not isinstance(row, dict):
                continue
            name = str(row.get('name') or '')
            if fold(name) == pf:
                return row
            if pf and (pf in fold(name) or fold(name) in pf):
                best = row
        return best

    def get_person_workload(self, name: str = '') -> dict:
        names = _unique_names(self.tasks)
        # Panel iş yükü siyahısındakı adlar da namizəd olsun
        dash = self.dashboards if isinstance(self.dashboards, dict) else {}
        wl = dash.get('workload') if isinstance(dash.get('workload'), dict) else {}
        for row in (wl.get('people') or []):
            if isinstance(row, dict) and row.get('name'):
                n = str(row.get('name'))
                if n not in names:
                    names.append(n)
        q_match, _ = self._resolve_qurum(name)
        p_match, suggestions = fuzzy_person(name, names)
        stem = qurum_stem(name)
        looks_like_org = bool(re.search(
            r'nazirlik|xidmet|agentlik|komite|idare|fondu|palata|miqrasiya|gomruk',
            stem,
        ))
        if q_match and (not p_match or looks_like_org):
            return {
                'error': 'is_qurum',
                'hint': 'Bu ad qurumdur — get_qurum_stats çağır',
                'qurum': q_match,
                'redirect': 'get_qurum_stats',
            }
        if not p_match:
            return {'error': 'not_found', 'suggestions': suggestions[:5]}
        # ƏSAS: panel iş yükü rəqəmi (14) — truncated tasks (4) yox
        panel_row = self._workload_row_for(p_match)
        mine = [t for t in self.tasks if fold(t.get('assignee')) == fold(p_match)]
        by_pri: Dict[str, int] = {}
        by_status: Dict[str, int] = {}
        overdue = []
        blocked = []
        for t in mine:
            p = str(t.get('priority') or '—') or '—'
            s = str(t.get('status') or '—') or '—'
            by_pri[p] = by_pri.get(p, 0) + 1
            by_status[s] = by_status.get(s, 0) + 1
            if t.get('overdue'):
                overdue.append(_task_brief(t))
            if t.get('blocked'):
                blocked.append(_task_brief(t))
        if panel_row:
            panel_pri = panel_row.get('byPriority') if isinstance(panel_row.get('byPriority'), dict) else {}
            if panel_pri:
                by_pri = {str(k): int(v) for k, v in panel_pri.items()}
            total = int(panel_row.get('total') or 0)
            done = int(panel_row.get('done') or 0)
            overdue_n = int(panel_row.get('late') or len(overdue))
            blocked_n = int(panel_row.get('blocked') or len(blocked))
            return {
                'name': str(panel_row.get('name') or p_match),
                'total': total,
                'done': done,
                'open': int(panel_row.get('open') or max(0, total - done)),
                'overdue': overdue_n,
                'blocked': blocked_n,
                'byPriority': by_pri,
                'byStatus': by_status,
                'overdueTasks': overdue[:10],
                'blockedTasks': blocked[:10],
                'sample': [_task_brief(t) for t in mine[:12]],
                'source': 'workload_panel',
                'hint': (
                    f'CAVAB: {panel_row.get("name") or p_match} iş yükü = {total} '
                    '(İş yükü panelindəki rəqəm). Kəsilmiş task siyahısından sayma.'
                ),
            }
        return {
            'name': p_match,
            'total': len(mine),
            'done': sum(1 for t in mine if _is_done(t)),
            'overdue': len(overdue),
            'blocked': len(blocked),
            'byPriority': by_pri,
            'byStatus': by_status,
            'overdueTasks': overdue[:10],
            'blockedTasks': blocked[:10],
            'sample': [_task_brief(t) for t in mine[:12]],
            'source': 'tasks_snapshot',
            'hint': 'İş yükü panel rəqəmi yoxdur — siyahı natamam ola bilər.',
        }

    def get_qurum_stats(self, qurum: str = '', limit: Any = 12) -> dict:
        """Qurum üzrə tapşırıq yükü, gecikən/blok + qiymətləndirmə balları."""
        try:
            lim = max(1, min(int(limit or 12), 30))
        except Exception:
            lim = 12
        match, suggestions = self._resolve_qurum(qurum)
        if not match:
            return {
                'error': 'not_found',
                'field': 'qurum',
                'query': qurum,
                'suggestions': suggestions[:8] or self._qurum_candidates()[:8],
                'hint': 'Qurumun qısa və ya tam adını yazın (məs. TƏBİB, Miqrasiya, DMX).',
            }
        mine = [t for t in self.tasks if _qurum_matches(t.get('qurum') or '', match)]
        overdue = [_task_brief(t) for t in mine if t.get('overdue')]
        blocked = [_task_brief(t) for t in mine if t.get('blocked')]
        by_status: Dict[str, int] = {}
        by_dir: Dict[str, int] = {}
        for t in mine:
            s = str(t.get('status') or '—') or '—'
            d = str(t.get('direction') or '—') or '—'
            by_status[s] = by_status.get(s, 0) + 1
            by_dir[d] = by_dir.get(d, 0) + 1
        # assessment scores for this org
        scores = []
        for a in self.assessments:
            if not _qurum_matches(a.get('qurum') or '', match):
                continue
            if a.get('score') is None:
                continue
            scores.append({
                'cat': a.get('cat'),
                'label': ASSESS_LABELS.get(fold(a.get('cat')), a.get('cat')),
                'score': a.get('score'),
                'year': a.get('year'),
                'key': a.get('key') or '',
            })
        return {
            'qurum': match,
            'total': len(mine),
            'done': sum(1 for t in mine if _is_done(t)),
            'open': sum(1 for t in mine if not _is_done(t)),
            'overdue': len(overdue),
            'blocked': len(blocked),
            'byStatus': by_status,
            'byDirection': dict(sorted(by_dir.items(), key=lambda x: -x[1])[:8]),
            'overdueTasks': overdue[:10],
            'blockedTasks': blocked[:10],
            'sample': [_task_brief(t) for t in mine[:lim]],
            'assessments': scores[:12],
            'diagScore': next((s.get('score') for s in scores if fold(s.get('cat')) == 'diag'), None),
            'emptyTasks': len(mine) == 0,
            'hint': (
                (
                    f'CAVAB: «{match}» diaqnostika balı = '
                    f'{next((s.get("score") for s in scores if fold(s.get("cat")) == "diag"), scores[0].get("score"))}. '
                    'Yalnız bu rəqəmi yaz; digər qurumun balını qarışdırma.'
                )
                if scores else
                (
                    'Bu quruma bağlı açıq tapşırıq panelda görünmür; qiymətləndirmə balı da yoxdur.'
                    if len(mine) == 0 else ''
                )
            ),
        }

    def search_tasks(
        self,
        status: str = '',
        assignee: str = '',
        priority: str = '',
        direction: str = '',
        sprint: str = '',
        qurum: str = '',
        overdue: Any = None,
        blocked: Any = None,
        text: str = '',
        limit: int = 20,
    ) -> dict:
        try:
            lim = max(1, min(int(limit or 20), 50))
        except Exception:
            lim = 20
        names = _unique_names(self.tasks)
        assignee_match = None
        if assignee:
            assignee_match, suggestions = fuzzy_person(assignee, names)
            if not assignee_match:
                return {'error': 'not_found', 'suggestions': suggestions[:5], 'field': 'assignee'}

        qurum_match = None
        if qurum:
            qurum_match, q_sugg = self._resolve_qurum(qurum)
            if not qurum_match:
                return {
                    'error': 'not_found',
                    'suggestions': q_sugg[:8],
                    'field': 'qurum',
                    'query': qurum,
                }

        out = []
        for t in self.tasks:
            if status and not _status_matches(t, status):
                continue
            if assignee_match and fold(t.get('assignee')) != fold(assignee_match):
                continue
            if priority and fold(priority) not in fold(t.get('priority')):
                continue
            if direction and fold(direction) not in fold(t.get('direction')):
                continue
            if sprint and fold(sprint) not in fold(t.get('sprint')):
                continue
            if qurum_match and not _qurum_matches(t.get('qurum') or '', qurum_match):
                continue
            if overdue is not None and overdue != '' and bool(t.get('overdue')) != _truthy(overdue):
                continue
            if blocked is not None and blocked != '' and bool(t.get('blocked')) != _truthy(blocked):
                continue
            if text and not _match_text(t, text):
                continue
            out.append(_task_brief(t))
        return {
            'count': len(out),
            'limit': lim,
            'items': out[:lim],
            'assignee': assignee_match or '',
            'qurum': qurum_match or '',
            'truncated': len(out) > lim,
        }

    def compare_sprints(self, a: str = '', b: str = '') -> dict:
        sprints = []
        seen = set()
        for t in self.tasks:
            s = str(t.get('sprint') or '').strip()
            if s and s not in seen:
                seen.add(s)
                sprints.append(s)
        meta_sprint = self.meta.get('sprint') or ''
        if not a:
            a = meta_sprint or (sprints[0] if sprints else '')
        if not b:
            # previous distinct sprint if possible
            others = [s for s in sprints if fold(s) != fold(a)]
            b = others[0] if others else ''
        if not a:
            return {'error': 'not_found', 'suggestions': sprints[:8], 'field': 'sprint'}
        if not b:
            return {'error': 'not_found', 'suggestions': sprints[:8], 'field': 'sprint_b', 'a': a}

        def pack(name: str) -> dict:
            rows = [t for t in self.tasks if fold(t.get('sprint')) == fold(name) or fold(name) in fold(t.get('sprint'))]
            # fuzzy name resolve
            if not rows:
                match, _ = fuzzy_person(name, sprints)
                if match:
                    name = match
                    rows = [t for t in self.tasks if fold(t.get('sprint')) == fold(name)]
            total = len(rows)
            done = sum(1 for t in rows if _is_done(t))
            return {
                'name': name,
                'total': total,
                'done': done,
                'open': max(0, total - done),
                'overdue': sum(1 for t in rows if t.get('overdue')),
                'blocked': sum(1 for t in rows if t.get('blocked')),
            }

        left = pack(a)
        right = pack(b)
        if left['total'] == 0 and fold(a) not in {fold(s) for s in sprints}:
            return {'error': 'not_found', 'suggestions': sprints[:8], 'field': 'sprint_a'}
        if right['total'] == 0 and fold(b) not in {fold(s) for s in sprints}:
            return {'error': 'not_found', 'suggestions': sprints[:8], 'field': 'sprint_b', 'a': left}
        return {
            'a': left,
            'b': right,
            'delta': {
                'total': left['total'] - right['total'],
                'done': left['done'] - right['done'],
                'overdue': left['overdue'] - right['overdue'],
                'blocked': left['blocked'] - right['blocked'],
            },
        }

    def get_risks(self) -> dict:
        overdue = [_task_brief(t) for t in self.tasks if t.get('overdue')]
        blocked = [_task_brief(t) for t in self.tasks if t.get('blocked')]
        due_soon = []
        for t in self.tasks:
            if t.get('overdue') or t.get('blocked') or _is_done(t):
                continue
            if t.get('due'):
                due_soon.append(_task_brief(t))
        ov = self.overview or {}
        return {
            'lateCount': ov.get('late', len(overdue)),
            'blockedCount': ov.get('blocked', len(blocked)),
            'dueThisWeek': ov.get('due'),
            'dueDone': ov.get('dueDone'),
            'progress': ov.get('progress'),
            'planned': ov.get('planned'),
            'overdueTasks': overdue[:15],
            'blockedTasks': blocked[:15],
            'dueSoonSample': due_soon[:10],
        }

    def get_kpi(self, direction: str = '') -> dict:
        ov = dict(self.overview or {})
        if direction:
            rows = [t for t in self.tasks if fold(direction) in fold(t.get('direction'))]
            total = len(rows)
            done = sum(1 for t in rows if _is_done(t))
            return {
                'direction': direction,
                'total': total,
                'done': done,
                'open': max(0, total - done),
                'overdue': sum(1 for t in rows if t.get('overdue')),
                'blocked': sum(1 for t in rows if t.get('blocked')),
                'completionPct': round((done / total) * 100) if total else 0,
                'sample': [_task_brief(t) for t in rows[:10]],
            }
        # Direction breakdown
        dirs: Dict[str, Dict[str, int]] = {}
        for t in self.tasks:
            d = str(t.get('direction') or '—') or '—'
            bucket = dirs.setdefault(d, {'total': 0, 'done': 0, 'overdue': 0, 'blocked': 0})
            bucket['total'] += 1
            if _is_done(t):
                bucket['done'] += 1
            if t.get('overdue'):
                bucket['overdue'] += 1
            if t.get('blocked'):
                bucket['blocked'] += 1
        ranked = sorted(
            ({'name': k, **v, 'completionPct': round((v['done'] / v['total']) * 100) if v['total'] else 0}
             for k, v in dirs.items()),
            key=lambda x: -x['total'],
        )[:12]
        return {
            'overview': ov,
            'directions': ranked,
            'completionPct': ov.get('completionPct', ov.get('rate')),
        }

    def get_dashboard(
        self,
        section: str = 'workload',
        sort: str = 'top',
        limit: Any = 10,
    ) -> dict:
        """Panel kartları: iş yükü, status, prioritet, istiqamət, qurum, risk."""
        sec_raw = fold(section or 'workload')
        if sec_raw in ('is yuk', 'is yuku', 'workload', 'assignee', 'people', 'icraci', 'icraçı'):
            sec = 'workload'
        elif sec_raw in ('status', 'icra', 'veziyyet'):
            sec = 'status'
        elif sec_raw in ('priority', 'prioritet', 'pri'):
            sec = 'priority'
        elif sec_raw in ('direction', 'directions', 'istiqamet', 'epic'):
            sec = 'directions'
        elif sec_raw in ('qurum', 'qurums', 'org'):
            sec = 'qurum'
        elif sec_raw in ('risk', 'risks', 'gecik', 'blok'):
            sec = 'risks'
        elif sec_raw in ('all', 'hamisi', 'panel', 'dashboard'):
            sec = 'all'
        elif sec_raw in ('overview', 'umumi', 'kpi'):
            sec = 'overview'
        else:
            sec = 'workload'
        try:
            lim = max(1, min(30, int(limit if limit not in (None, '') else 10)))
        except (TypeError, ValueError):
            lim = 10
        ascending = fold(sort) in ('bottom', 'lowest', 'min', 'asagi', 'az', 'least')

        dash = self.dashboards if isinstance(self.dashboards, dict) else {}
        wl = dash.get('workload') if isinstance(dash.get('workload'), dict) else {}
        # Panelden gələn workload varsa — truncated tasks-dən yenidən sayma (14≠4)
        if not (wl.get('people') or dash.get('status') or dash.get('priority')):
            dash = self._dashboards_from_tasks()
            wl = dash.get('workload') if isinstance(dash.get('workload'), dict) else {}

        def people_list() -> List[dict]:
            wl = dash.get('workload') if isinstance(dash.get('workload'), dict) else {}
            rows = list(wl.get('people') or [])
            rows.sort(key=lambda x: int(x.get('total') or 0), reverse=not ascending)
            return rows[:lim]

        ov = dict(self.overview or {})
        scope = dash.get('scope') if isinstance(dash.get('scope'), dict) else {}
        label = _DASH_SECTIONS.get(sec, sec)
        out: Dict[str, Any] = {
            'section': sec,
            'sectionLabel': label,
            'scope': scope or {
                'sprint': self.meta.get('sprint') or ov.get('sprint') or '',
            },
            'totalUnits': dash.get('totalUnits', len(self.tasks)),
            'open': dash.get('open', ov.get('open')),
            'done': dash.get('done', ov.get('done')),
            'late': dash.get('late', ov.get('late')),
            'blocked': dash.get('blocked', ov.get('blocked')),
        }

        if sec in ('workload', 'all'):
            people = people_list()
            out['workload'] = people
            out['heaviest'] = people[0] if people and not ascending else (people[-1] if people else None)
            out['lightest'] = people[-1] if people and not ascending else (people[0] if people else None)
        if sec in ('status', 'all'):
            rows = list(dash.get('status') or [])
            rows.sort(key=lambda x: int(x.get('total') or 0), reverse=not ascending)
            out['status'] = rows[:lim]
        if sec in ('priority', 'all'):
            rows = list(dash.get('priority') or [])
            rows.sort(key=lambda x: int(x.get('total') or 0), reverse=not ascending)
            out['priority'] = rows[:lim]
        if sec in ('directions', 'all'):
            rows = list(dash.get('directions') or [])
            rows.sort(key=lambda x: int(x.get('total') or 0), reverse=not ascending)
            out['directions'] = rows[:lim]
        if sec in ('qurum', 'all'):
            rows = list(dash.get('qurums') or dash.get('qurum') or [])
            rows.sort(key=lambda x: int(x.get('total') or 0), reverse=not ascending)
            out['qurums'] = rows[:lim]
        if sec in ('risks', 'all', 'overview'):
            out['risks'] = {
                'late': out.get('late'),
                'blocked': out.get('blocked'),
                'open': out.get('open'),
                'done': out.get('done'),
            }
        if sec == 'overview':
            out['overview'] = ov

        # Qısa cavab ipucu
        if sec == 'workload' and out.get('heaviest'):
            h = out['heaviest']
            out['hint'] = (
                f'CAVAB: Ən çox iş yükü — {h.get("name")} ({h.get("total")} tapşırıq). '
                'İş yükü panelindən; digər adları workload siyahısından yaz.'
            )
        elif sec == 'directions' and out.get('directions'):
            d0 = out['directions'][0]
            out['hint'] = f'CAVAB: Ən böyük istiqamət — {d0.get("name")} ({d0.get("total")}).'
        elif sec == 'qurum' and out.get('qurums'):
            q0 = out['qurums'][0]
            out['hint'] = f'CAVAB: Ən çox tapşırıqlı qurum — {q0.get("name")} ({q0.get("total")}).'
        elif sec == 'priority' and out.get('priority'):
            p0 = out['priority'][0]
            out['hint'] = f'CAVAB: Ən çox — prioritet {p0.get("name")} ({p0.get("total")}).'
        elif sec == 'status' and out.get('status'):
            s0 = out['status'][0]
            out['hint'] = f'CAVAB: Ən böyük status qrupu — {s0.get("name")} ({s0.get("total")}).'
        else:
            out['hint'] = f'{label} paneli məlumatı hazırdır — rəqəmləri buradan yaz.'
        out['empty'] = not (
            out.get('workload') or out.get('status') or out.get('priority')
            or out.get('directions') or out.get('qurums') or out.get('overview')
        )
        return out

    def get_assessment_scores(
        self,
        category: str = 'diag',
        sort: str = 'top',
        limit: Any = 10,
        qurum: str = '',
        year: Any = None,
    ) -> dict:
        """Qiymətləndirmə balları (diaqnostika, EXQ, İSQ, özünüqiymətləndirmə) qurum üzrə."""
        cat = _normalize_assess_cat(category or 'diag') or 'diag'
        sort_f = fold(sort)
        ascending = sort_f in ('bottom', 'lowest', 'min', 'asagi', 'az', 'worst')
        try:
            lim = max(1, min(30, int(limit if limit not in (None, '') else 10)))
        except (TypeError, ValueError):
            lim = 10
        year_n = None
        if year not in (None, ''):
            try:
                year_n = int(float(year))
            except (TypeError, ValueError):
                year_n = None
        qurum_match = None
        if qurum:
            qurum_match, q_sugg = self._resolve_qurum(qurum)
            if not qurum_match:
                return {
                    'error': 'not_found',
                    'field': 'qurum',
                    'query': qurum,
                    'suggestions': q_sugg[:8],
                    'category': cat,
                    'categoryLabel': ASSESS_LABELS.get(cat, cat),
                    'empty': True,
                }

        rows = []
        for a in self.assessments:
            if cat and fold(a.get('cat')) != fold(cat):
                continue
            if year_n is not None and a.get('year') != year_n:
                continue
            if qurum_match and not _qurum_matches(a.get('qurum') or '', qurum_match):
                continue
            score = a.get('score')
            if score is None:
                continue
            try:
                score_f = float(score)
            except (TypeError, ValueError):
                continue
            rows.append({
                'qurum': a.get('qurum') or '—',
                'score': score_f,
                'year': a.get('year'),
                'key': a.get('key') or '',
            })

        # Eyni qurumdan bir neçə nəticə varsa — ən son il / ən yüksək bal
        by_q: Dict[str, dict] = {}
        for r in rows:
            qk = fold(r['qurum']) or r['qurum']
            prev = by_q.get(qk)
            if not prev:
                by_q[qk] = r
                continue
            py = prev.get('year') or 0
            ry = r.get('year') or 0
            if ry > py or (ry == py and r['score'] > prev['score']):
                by_q[qk] = r
        uniq = list(by_q.values())
        uniq.sort(key=lambda x: (x['score'], x.get('year') or 0), reverse=not ascending)

        scored_n = len(uniq)
        total_cat = sum(1 for a in self.assessments if fold(a.get('cat')) == fold(cat))
        avg = round(sum(r['score'] for r in uniq) / scored_n, 1) if scored_n else None
        # Qurum filter varsa — yalnız həmin qurum; başqa balları qarışdırma
        if qurum_match:
            top = uniq[:1]
            lim = 1
        else:
            top = uniq[:lim]
        alt = []
        if scored_n == 0 and qurum_match:
            alt_rows = []
            for a in self.assessments:
                if fold(a.get('cat')) != fold(cat) or a.get('score') is None:
                    continue
                try:
                    alt_rows.append({
                        'qurum': a.get('qurum') or '—',
                        'score': float(a.get('score')),
                        'year': a.get('year'),
                    })
                except (TypeError, ValueError):
                    continue
            alt_rows.sort(key=lambda x: -x['score'])
            seen_a = set()
            for r in alt_rows:
                k = fold(r['qurum'])
                if k in seen_a:
                    continue
                seen_a.add(k)
                alt.append(r)
                if len(alt) >= 5:
                    break
        matched = top[0] if top else None
        hint = ''
        if scored_n == 0:
            if qurum_match:
                hint = (
                    f'«{qurum_match}» üçün {ASSESS_LABELS.get(cat, cat)} balı panelda yoxdur. '
                    'Başqa qurumun balını bu quruma yazma. othersWithScore yalnız alternativ təklifdir.'
                )
            else:
                hint = (
                    f'Bu kateqoriya üzrə bal panelda yoxdur. İstifadəçiyə snapshot demə; '
                    'Diaqnostika bölməsini yoxlamağı təklif et.'
                )
        elif matched and qurum_match:
            hint = (
                f'CAVAB: «{matched.get("qurum")}» balı = {matched.get("score")}. '
                'Yalnız bu rəqəmi yaz; digər qurumların balını qarışdırma.'
            )
        return {
            'category': cat,
            'categoryLabel': ASSESS_LABELS.get(cat, cat),
            'qurum': qurum_match or '',
            'matched': matched,
            'score': matched.get('score') if matched else None,
            'sort': 'lowest' if ascending else 'highest',
            'count': total_cat,
            'withScore': scored_n,
            'avgScore': avg if not qurum_match else None,
            'top': top,
            'highest': top[0] if (top and not ascending and not qurum_match) else (matched if not ascending else None),
            'lowest': top[0] if (top and ascending and not qurum_match) else (matched if ascending else None),
            'othersWithScore': alt if scored_n == 0 else [],
            'empty': scored_n == 0,
            'hint': hint,
        }

    def get_meqsed_stats(
        self,
        year: Any = None,
        opinion: str = '',
        qurum: str = '',
    ) -> dict:
        """Məqsədəuyğunluq rəyi sayları (müsbət/mənfi/qismən)."""
        year_n = None
        if year not in (None, ''):
            try:
                year_n = int(float(year))
            except (TypeError, ValueError):
                year_n = None
        op_filter = _normalize_opinion(opinion)
        qurum_match = None
        if qurum:
            qurum_match, q_sugg = self._resolve_qurum(qurum)
            if not qurum_match:
                return {
                    'error': 'not_found',
                    'field': 'qurum',
                    'query': qurum,
                    'suggestions': q_sugg[:8],
                    'empty': True,
                }

        rows = []
        for a in self.assessments:
            if fold(a.get('cat')) != 'meqsed':
                continue
            if year_n is not None and a.get('year') != year_n:
                continue
            if qurum_match and not _qurum_matches(a.get('qurum') or '', qurum_match):
                continue
            op = _normalize_opinion(a.get('opinion') or '')
            if not op:
                continue
            rows.append({
                'qurum': a.get('qurum') or '—',
                'opinion': op,
                'year': a.get('year'),
                'key': a.get('key') or '',
            })

        counts = {'pos': 0, 'neg': 0, 'partial': 0, 'revision': 0}
        for r in rows:
            k = r['opinion']
            if k in counts:
                counts[k] += 1
        total = len(rows)
        filtered = counts.get(op_filter, 0) if op_filter else total
        label = ASSESS_LABELS.get('meqsed', 'Məqsədəuyğunluq rəyi')
        op_az = _MEQSED_OPINIONS.get(op_filter, '')
        year_txt = f'{year_n}-cı ildə ' if year_n else ''
        if op_filter:
            hint = (
                f'CAVAB: {year_txt}{label} üzrə {op_az} rəy sayı = {filtered}. '
                'Bu diaqnostika balı deyil — yalnız rəy sayını yaz.'
            )
        else:
            hint = (
                f'CAVAB: {year_txt}{label}: müsbət {counts["pos"]}, mənfi {counts["neg"]}, '
                f'qismən {counts["partial"]}, düzəliş {counts["revision"]} (cəmi {total}).'
            )
        return {
            'category': 'meqsed',
            'categoryLabel': label,
            'year': year_n,
            'qurum': qurum_match or '',
            'opinion': op_filter or 'all',
            'opinionLabel': op_az or 'hamısı',
            'count': filtered,
            'pos': counts['pos'],
            'neg': counts['neg'],
            'partial': counts['partial'],
            'revision': counts['revision'],
            'total': total,
            'empty': total == 0,
            'hint': hint,
        }

    def lookup_knowledge(self, query: str = '') -> dict:
        kb = search_knowledge(query, live_catalog=self.qurum_catalog)
        match, suggestions = self._resolve_qurum(query)
        entry = None
        if match:
            for row in self.qurum_catalog:
                if fold(row.get('name')) == fold(match):
                    entry = row
                    break
        return {
            'panel': kb.get('items') or [],
            'qurumMatch': match or kb.get('qurumMatch'),
            'qurumAliases': (entry or {}).get('aliases') or derive_aliases(match or ''),
            'qurumHints': (suggestions or kb.get('qurumHints') or [])[:8],
            'liveQurumCount': len(self.qurum_catalog) or len(self._qurum_candidates()),
            'hint': (
                'Qurum tapıldı — get_qurum_stats və ya get_assessment_scores çağır.'
                if match else
                'Panel termini və ya qurum adı dəqiqləşdirin.'
            ),
        }

    def get_task(self, key: str = '') -> dict:
        k = str(key or '').strip().upper()
        if not k:
            return {'error': 'not_found', 'suggestions': []}
        detail = self.task_details.get(k)
        if isinstance(detail, dict) and detail.get('fields'):
            return {
                'task': detail,
                'fields': detail.get('fields') or {},
                'hint': (
                    f'CAVAB: {k} field-ləri fields obyektindədir. '
                    'İstənilən field adını tapıb dəyərini yaz; uydurma.'
                ),
            }
        for t in self.tasks:
            if str(t.get('key') or '').upper() == k:
                brief = _task_brief(t)
                return {
                    'task': brief,
                    'fields': {
                        'Status': brief.get('status') or '',
                        'İcraçı': brief.get('assignee') or '',
                        'Prioritet': brief.get('priority') or '',
                        'Bitmə tarixi': brief.get('due') or '',
                        'İstiqamət': brief.get('direction') or '',
                        'Sprint': brief.get('sprint') or '',
                        'Qurum': brief.get('qurum') or '',
                        'Başlıq': brief.get('summary') or '',
                    },
                    'hint': 'Əsas field-lər; sualda DGD açarı yazılsa əlavə custom field də gəlir.',
                }
        suggestions = []
        for t in self.tasks:
            tk = str(t.get('key') or '').upper()
            if k in tk or tk in k:
                suggestions.append(tk)
            if len(suggestions) >= 5:
                break
        for tk in self.task_details:
            if k in tk and tk not in suggestions:
                suggestions.append(tk)
            if len(suggestions) >= 8:
                break
        return {'error': 'not_found', 'suggestions': suggestions, 'key': k}


def run_tool(name: str, args: Optional[dict], tools: SnapshotTools) -> dict:
    args = args if isinstance(args, dict) else {}
    dispatch: Dict[str, Callable[..., dict]] = {
        'get_overview': lambda: tools.get_overview(),
        'get_my_tasks': lambda: tools.get_my_tasks(
            status=str(args.get('status') or ''),
            priority=str(args.get('priority') or ''),
        ),
        'get_person_workload': lambda: tools.get_person_workload(str(args.get('name') or '')),
        'get_qurum_stats': lambda: tools.get_qurum_stats(
            qurum=str(args.get('qurum') or args.get('name') or ''),
            limit=args.get('limit', 12),
        ),
        'search_tasks': lambda: tools.search_tasks(
            status=str(args.get('status') or ''),
            assignee=str(args.get('assignee') or ''),
            priority=str(args.get('priority') or ''),
            direction=str(args.get('direction') or ''),
            sprint=str(args.get('sprint') or ''),
            qurum=str(args.get('qurum') or ''),
            overdue=args.get('overdue'),
            blocked=args.get('blocked'),
            text=str(args.get('text') or ''),
            limit=args.get('limit', 20),
        ),
        'compare_sprints': lambda: tools.compare_sprints(
            a=str(args.get('a') or ''),
            b=str(args.get('b') or ''),
        ),
        'get_risks': lambda: tools.get_risks(),
        'get_kpi': lambda: tools.get_kpi(direction=str(args.get('direction') or '')),
        'get_dashboard': lambda: tools.get_dashboard(
            section=str(args.get('section') or args.get('panel') or 'workload'),
            sort=str(args.get('sort') or 'top'),
            limit=args.get('limit', 10),
        ),
        'get_assessment_scores': lambda: tools.get_assessment_scores(
            category=str(args.get('category') or args.get('cat') or 'diag'),
            sort=str(args.get('sort') or 'top'),
            limit=args.get('limit', 10),
            qurum=str(args.get('qurum') or ''),
            year=args.get('year'),
        ),
        'get_meqsed_stats': lambda: tools.get_meqsed_stats(
            year=args.get('year'),
            opinion=str(args.get('opinion') or args.get('result') or ''),
            qurum=str(args.get('qurum') or ''),
        ),
        'get_task': lambda: tools.get_task(str(args.get('key') or '')),
        'lookup_knowledge': lambda: tools.lookup_knowledge(
            str(args.get('query') or args.get('q') or args.get('text') or ''),
        ),
    }
    fn = dispatch.get(name)
    if not fn:
        return {'error': 'unknown_tool', 'name': name}
    try:
        result = fn()
    except Exception as err:
        return {'error': 'tool_failed', 'name': name, 'detail': type(err).__name__}
    # Şəxs tool-una qurum adı düşübsə — avtomatik düzəlt
    if (
        name == 'get_person_workload'
        and isinstance(result, dict)
        and result.get('error') == 'is_qurum'
        and result.get('qurum')
    ):
        fixed = tools.get_qurum_stats(qurum=str(result.get('qurum') or ''), limit=12)
        if isinstance(fixed, dict):
            fixed = dict(fixed)
            fixed['redirectedFrom'] = 'get_person_workload'
        return fixed
    return result

def tool_declarations() -> List[dict]:
    """Provider-agnostic tool schemas (OpenAI-style properties)."""
    empty = {'type': 'object', 'properties': {}}
    return [
        {
            'name': 'get_overview',
            'description': 'Panel ümumi göstəriciləri: say, tamamlanma %, gecikən, bloklanmış, icrada, növbəti həftə.',
            'parameters': empty,
        },
        {
            'name': 'get_my_tasks',
            'description': (
                'Yalnız cari istifadəçinin ÖZ işləri («mənim işlərim», «tasklarım»). '
                'Başqa şəxsin adı çəkilirsə get_person_workload istifadə et.'
            ),
            'parameters': {
                'type': 'object',
                'properties': {
                    'status': {
                        'type': 'string',
                        'description': 'İstəyə bağlı. Boş buraxmaq daha yaxşıdır. open=bitməmiş, done=tamam, blocked=blok.',
                    },
                    'priority': {'type': 'string'},
                },
            },
        },
        {
            'name': 'get_person_workload',
            'description': (
                'YALNIZ konkret insan/icraçı adı üçün (məs. Sabina, Ali Vəliyev). '
                '«İş yükü çox olan», «ən məşğul», reytinq — get_dashboard(section=workload). '
                'Qurum adı üçün get_qurum_stats.'
            ),
            'parameters': {
                'type': 'object',
                'properties': {'name': {'type': 'string'}},
                'required': ['name'],
            },
        },
        {
            'name': 'get_dashboard',
            'description': (
                'Panel kartları (dashboard). section: workload (iş yükü/icraçılar), status, '
                'priority, directions (istiqamətlər), qurum, risks, overview, all. '
                '«Kimdə iş çoxdur», «ən yüklü məşğul», «istiqamət payı», «prioritetlər» — bunu çağır.'
            ),
            'parameters': {
                'type': 'object',
                'properties': {
                    'section': {
                        'type': 'string',
                        'description': 'workload|status|priority|directions|qurum|risks|overview|all',
                    },
                    'sort': {'type': 'string', 'description': 'top və ya bottom'},
                    'limit': {'type': 'integer'},
                },
            },
        },
        {
            'name': 'get_qurum_stats',
            'description': (
                'Qurum (Nazirlik, Agentlik, Xidmət) üzrə iş sayı, gecikən, blok, nümunə tapşırıqlar '
                'və qiymətləndirmə balları. «Dövlət Miqrasiya Xidməti», «DMX», «Miqrasiya», '
                '«Gömrük», «RİN» kimi adlar üçün bunu çağır. Şəxs adı üçün deyil.'
            ),
            'parameters': {
                'type': 'object',
                'properties': {
                    'qurum': {'type': 'string', 'description': 'Qurum adı və ya qısaltma'},
                    'limit': {'type': 'integer'},
                },
                'required': ['qurum'],
            },
        },
        {
            'name': 'search_tasks',
            'description': 'Tapşırıq axtarışı/filtr (başlıq, qurum, icraçı, status).',
            'parameters': {
                'type': 'object',
                'properties': {
                    'status': {'type': 'string'},
                    'assignee': {'type': 'string'},
                    'priority': {'type': 'string'},
                    'direction': {'type': 'string'},
                    'sprint': {'type': 'string'},
                    'qurum': {'type': 'string', 'description': 'Qurum adı / qısaltma'},
                    'overdue': {'type': 'boolean'},
                    'blocked': {'type': 'boolean'},
                    'text': {'type': 'string', 'description': 'Başlıq və ya açar söz'},
                    'limit': {'type': 'integer'},
                },
            },
        },
        {
            'name': 'compare_sprints',
            'description': 'İki sprint və ya həftə müqayisəsi.',
            'parameters': {
                'type': 'object',
                'properties': {
                    'a': {'type': 'string'},
                    'b': {'type': 'string'},
                },
            },
        },
        {
            'name': 'get_risks',
            'description': 'Gecikən, bloklanan və yaxın deadline riskləri.',
            'parameters': empty,
        },
        {
            'name': 'get_kpi',
            'description': 'KPI və istiqamət göstəriciləri.',
            'parameters': {
                'type': 'object',
                'properties': {'direction': {'type': 'string'}},
            },
        },
        {
            'name': 'get_assessment_scores',
            'description': (
                'Diaqnostika/EXQ/İSQ/özünüqiymətləndirmə BALLARI. '
                'Məqsədəuyğunluq müsbət/mənfi rəy SAYI üçün get_meqsed_stats istifadə et — bunu yox. '
                'Konkret qurum soruşulanda qurum parametrini ver. category: diag|exq|isq|self.'
            ),
            'parameters': {
                'type': 'object',
                'properties': {
                    'category': {
                        'type': 'string',
                        'description': 'diag (default), exq, isq, self',
                    },
                    'sort': {
                        'type': 'string',
                        'description': 'top/highest (ən yüksək) və ya bottom/lowest (ən aşağı)',
                    },
                    'limit': {'type': 'integer'},
                    'qurum': {
                        'type': 'string',
                        'description': 'Konkret qurum adı/qısaltma (məs. mədəniyyət, TƏBİB, DMX)',
                    },
                    'year': {'type': 'integer'},
                },
            },
        },
        {
            'name': 'get_meqsed_stats',
            'description': (
                'Məqsədəuyğunluq rəyi statistikası: müsbət/mənfi/qismən rəy sayı. '
                '«neçə müsbət rəy», «məqsədəuyğunluqda mənfi» — bunu çağır. '
                'opinion: pos|neg|partial|revision; year: 2026.'
            ),
            'parameters': {
                'type': 'object',
                'properties': {
                    'year': {'type': 'integer', 'description': 'İl (məs. 2026)'},
                    'opinion': {
                        'type': 'string',
                        'description': 'pos (müsbət), neg (mənfi), partial, revision',
                    },
                    'qurum': {'type': 'string'},
                },
            },
        },
        {
            'name': 'get_task',
            'description': (
                'Tək tapşırıq + Jira field-ləri (DGD-1234). '
                'Status, icraçı, qurum, bitmə, blok səbəbi və custom field dəyərləri fields-də. '
                '«DGD-… statusu/fieldi nədir?» suallarında bunu çağır.'
            ),
            'parameters': {
                'type': 'object',
                'properties': {'key': {'type': 'string'}},
                'required': ['key'],
            },
        },
        {
            'name': 'lookup_knowledge',
            'description': (
                'Panel terminləri və qurum ad/qısaltma uyğunlaşması (KB). '
                'Qurum adı tanınmayanda əvvəl bunu, sonra get_qurum_stats çağır.'
            ),
            'parameters': {
                'type': 'object',
                'properties': {'query': {'type': 'string'}},
                'required': ['query'],
            },
        },
    ]


def openai_tools() -> List[dict]:
    return [
        {
            'type': 'function',
            'function': {
                'name': t['name'],
                'description': t['description'],
                'parameters': t['parameters'],
            },
        }
        for t in tool_declarations()
    ]


def gemini_function_declarations() -> List[dict]:
    out = []
    for t in tool_declarations():
        props = (t.get('parameters') or {}).get('properties') or {}
        required = (t.get('parameters') or {}).get('required') or []
        params: Dict[str, Any] = {'type': 'OBJECT', 'properties': {}}
        for key, schema in props.items():
            typ = str((schema or {}).get('type') or 'string').upper()
            if typ == 'INTEGER':
                typ = 'INTEGER'
            elif typ == 'BOOLEAN':
                typ = 'BOOLEAN'
            elif typ == 'NUMBER':
                typ = 'NUMBER'
            else:
                typ = 'STRING'
            params['properties'][key] = {'type': typ}
        if required:
            params['required'] = list(required)
        out.append({
            'name': t['name'],
            'description': t['description'],
            'parameters': params,
        })
    return out


_NUM_RE = re.compile(r'(?<![A-Za-z0-9_/.-])(\d{1,6})(?![A-Za-z0-9_/.-])')


def number_check(answer: str, tool_payloads: List[Any]) -> str:
    """ok | warn — cavabdakı rəqəmlər tool nəticələrində varmı."""
    nums = set(_NUM_RE.findall(str(answer or '')))
    # ignore trivial
    nums = {n for n in nums if n not in ('0', '1', '2')}
    if not nums:
        return 'ok'
    blob = ''
    for payload in tool_payloads:
        try:
            blob += json.dumps(payload, ensure_ascii=False)
        except Exception:
            blob += str(payload)
    missing = [n for n in sorted(nums) if n not in blob]
    return 'warn' if missing else 'ok'


_YEAR_NUMS = {2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030}


def _extract_payload_score(payload: dict) -> Tuple[Optional[float], Optional[int], str]:
    """Return (score, year, label) from assessment/qurum tool payload."""
    label = str(payload.get('categoryLabel') or 'Diaqnostika')
    score = payload.get('score')
    if score is None:
        score = payload.get('diagScore')
    matched = payload.get('matched') if isinstance(payload.get('matched'), dict) else None
    year = matched.get('year') if matched else None
    if score is None and matched:
        score = matched.get('score')
    assessments = payload.get('assessments') if isinstance(payload.get('assessments'), list) else []
    if score is None and assessments:
        for row in assessments:
            if fold(row.get('cat')) == 'diag' and row.get('score') is not None:
                score = row.get('score')
                year = row.get('year') or year
                label = ASSESS_LABELS.get('diag', label)
                break
        if score is None and assessments[0].get('score') is not None:
            score = assessments[0].get('score')
            year = assessments[0].get('year') or year
    try:
        score_f = float(score) if score is not None else None
    except (TypeError, ValueError):
        score_f = None
    try:
        year_n = int(year) if year is not None else None
    except (TypeError, ValueError):
        year_n = None
    return score_f, year_n, label


def format_qurum_score_answer(payload: dict, *, force: bool = False) -> Optional[str]:
    """Konkret qurum balı üçün qısa panel cavabı (LLM olmadan)."""
    if not isinstance(payload, dict):
        return None
    qurum = str(payload.get('qurum') or '').strip()
    if not qurum:
        return None
    is_assess = (
        'matched' in payload
        or 'withScore' in payload
        or 'diagScore' in payload
        or (isinstance(payload.get('assessments'), list) and payload.get('assessments'))
    )
    if not is_assess:
        return None
    score_f, year, label = _extract_payload_score(payload)
    if score_f is None or payload.get('empty'):
        if force or payload.get('empty') or payload.get('withScore') == 0:
            return f'«{qurum}» üçün {label} balı paneldə mövcud deyil.'
        return None
    score_disp = int(score_f) if score_f == int(score_f) else score_f
    year_txt = f'{year}-cı il üzrə ' if year else ''
    return f'{qurum} üçün {year_txt}{label} balı **{score_disp}**-dır.'


def fast_score_answer_from_payloads(tool_payloads: List[Any]) -> Optional[str]:
    """Tool nəticəsindən dərhal cavab — ikinci LLM çağırışını atlayır."""
    for payload in reversed(list(tool_payloads or [])):
        if not isinstance(payload, dict):
            continue
        meq = format_meqsed_answer(payload)
        if meq:
            return meq
        if payload.get('section') and (
            payload.get('workload') is not None
            or payload.get('directions') is not None
            or payload.get('sectionLabel')
        ):
            dash = format_dashboard_answer(payload)
            if dash:
                return dash
        # Yalnız konkret qurum filterli bal nəticəsi
        if not str(payload.get('qurum') or '').strip():
            continue
        if payload.get('category') == 'meqsed':
            continue
        text = format_qurum_score_answer(payload, force=True)
        if text:
            return text
    return None


def ground_assessment_answer(answer: str, tool_payloads: List[Any]) -> Optional[str]:
    """Alət konkret qurum balı qaytarıbsa və cavab səhvdirsə — düzgün qısa cavab yaz.

    Returns None if no correction needed.
    """
    for payload in reversed(list(tool_payloads or [])):
        if not isinstance(payload, dict):
            continue
        qurum = str(payload.get('qurum') or '').strip()
        if not qurum:
            continue
        is_assess = 'matched' in payload or 'withScore' in payload or 'diagScore' in payload
        if not is_assess:
            continue
        score_f, year, label = _extract_payload_score(payload)
        text = str(answer or '')
        nums = []
        for m in re.findall(r'\d+(?:[.,]\d+)?', text):
            try:
                nums.append(float(m.replace(',', '.')))
            except ValueError:
                continue

        if score_f is None or payload.get('empty'):
            invented = [n for n in nums if int(n) not in _YEAR_NUMS and n not in (0, 1, 2)]
            if invented or re.search(r'\b\d+(?:[.,]\d+)?\b.*bal|balı\s*=\s*\d', text, re.I):
                return (
                    f'«{qurum}» üçün {label} balı paneldə mövcud deyil. '
                    'Başqa qurumun balını buna yazmaq olmaz.'
                )
            if not text.strip():
                return format_qurum_score_answer(payload, force=True)
            return None

        correct = format_qurum_score_answer(payload, force=True)
        foreign = [
            n for n in nums
            if abs(n - score_f) > 0.05 and int(n) not in _YEAR_NUMS and n not in (0, 1, 2)
        ]
        has_correct = any(abs(n - score_f) <= 0.05 for n in nums)
        if foreign or not has_correct:
            return correct
        return None
    return None


_RANK_RE = re.compile(
    r'ən yüksək|en yuksek|ən aşağı|en asagi|reyting|orta bal|neçə qurum|nece qurum|siyahı|siyahi',
    re.I,
)
_ORG_SCORE_RE = re.compile(
    r'\bbal\b|\bbalı\b|diaqnost|\bbes\b|\bbəs\b|'
    r'tabib|t[eə]bib|\bdmx\b|\bdgx\b|nazirlik|agentlik|miqrasiya|vergi|mədəniyyət|medeniyyet',
    re.I,
)
_MEQSED_Q_RE = re.compile(
    r'məqsəd|meqsed|uyğunluq|uygunluq|müsbət\s*rəy|musbet\s*rey|mənfi\s*rəy|menfi\s*rey|'
    r'rəy\s*veril|rey\s*veril',
    re.I,
)


def _extract_year(question: str) -> Optional[int]:
    m = re.search(r'\b(20[2-3]\d)\b', str(question or ''))
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def format_meqsed_answer(payload: dict) -> Optional[str]:
    if not isinstance(payload, dict) or payload.get('category') != 'meqsed':
        return None
    if payload.get('error'):
        return None
    year = payload.get('year')
    year_txt = f'{year}-cı ildə ' if year else ''
    label = payload.get('categoryLabel') or 'Məqsədəuyğunluq'
    op = payload.get('opinion') or 'all'
    if op == 'pos':
        return f'{year_txt}{label} üzrə ümumi **{payload.get("count", 0)}** müsbət rəy verilib.'
    if op == 'neg':
        return f'{year_txt}{label} üzrə ümumi **{payload.get("count", 0)}** mənfi rəy verilib.'
    if op in ('partial', 'revision'):
        az = _MEQSED_OPINIONS.get(op, op)
        return f'{year_txt}{label} üzrə **{payload.get("count", 0)}** {az} rəy var.'
    return (
        f'{year_txt}{label}: müsbət **{payload.get("pos", 0)}**, '
        f'mənfi **{payload.get("neg", 0)}**, qismən **{payload.get("partial", 0)}** '
        f'(cəmi {payload.get("total", 0)}).'
    )


def try_fast_task_answer(question: str, tools: 'SnapshotTools') -> Optional[Tuple[str, List[str], List[Any]]]:
    """DGD açarı + field sualını paneldən birbaşa cavabla."""
    m = re.search(r'(DGD-\d+)', str(question or ''), re.I)
    if not m:
        return None
    key = m.group(1).upper()
    result = tools.get_task(key)
    if result.get('error'):
        return None
    fields = result.get('fields') if isinstance(result.get('fields'), dict) else {}
    task = result.get('task') if isinstance(result.get('task'), dict) else {}
    qf = fold(question)
    # Konkret field adı sualda varsa
    best_name = ''
    best_val = ''
    best_len = 0
    for fname, fval in fields.items():
        ff = fold(fname)
        if len(ff) < 3 or ff not in qf:
            continue
        if len(ff) > best_len:
            best_len = len(ff)
            best_name = str(fname)
            best_val = str(fval)
    if best_name:
        text = f'**{key}** — **{best_name}**: {best_val}.'
        return text, ['get_task'], [result]
    if not re.search(
        r'field|sah[eə]|status|icra[cç]ı|icraci|assignee|qurum|bitm[eə]|due|blok|prioritet|'
        r'n[eə]dir|nedir|haqqında|haqqinda|bax|g[oö]st[eə]r|melumat|məlumat',
        qf,
    ):
        return None
    lines = [f'**{key}** — {task.get("summary") or "tapşırıq"}']
    for fname, fval in list(fields.items())[:14]:
        if fval:
            lines.append(f'- **{fname}**: {fval}')
    return '\n'.join(lines), ['get_task'], [result]


def format_dashboard_answer(payload: dict, section: str = '') -> Optional[str]:
    if not isinstance(payload, dict) or payload.get('error'):
        return None
    sec = payload.get('section') or section or 'workload'
    scope = payload.get('scope') if isinstance(payload.get('scope'), dict) else {}
    sprint = scope.get('sprint') or ''
    scope_bit = f' ({sprint})' if sprint else ''

    if sec == 'workload':
        people = payload.get('workload') or []
        if not people:
            return f'İş yükü panelində{scope_bit} icraçı məlumatı yoxdur.'
        top = people[:8]
        lines = [f'**İş yükü**{scope_bit} — ən çox tapşırığı olanlar:']
        for i, row in enumerate(top, 1):
            lines.append(f'{i}. **{row.get("name")}** — **{row.get("total")}** tapşırıq')
        h = payload.get('heaviest') or top[0]
        lines.append(f'\nƏn yüklü: **{h.get("name")}** (**{h.get("total")}**).')
        return '\n'.join(lines)
    if sec == 'directions':
        rows = payload.get('directions') or []
        if not rows:
            return 'İstiqamət panelində məlumat yoxdur.'
        lines = [f'**İstiqamətlər**{scope_bit}:']
        for i, row in enumerate(rows[:8], 1):
            lines.append(f'{i}. **{row.get("name")}** — **{row.get("total")}**')
        return '\n'.join(lines)
    if sec == 'priority':
        rows = payload.get('priority') or []
        if not rows:
            return 'Prioritet panelində məlumat yoxdur.'
        lines = [f'**Prioritetlər**{scope_bit}:']
        for i, row in enumerate(rows[:8], 1):
            lines.append(f'{i}. **{row.get("name")}** — **{row.get("total")}**')
        return '\n'.join(lines)
    if sec == 'status':
        rows = payload.get('status') or []
        if not rows:
            return 'Status panelində məlumat yoxdur.'
        lines = [f'**İcra statusu**{scope_bit}:']
        for i, row in enumerate(rows[:8], 1):
            lines.append(f'{i}. **{row.get("name")}** — **{row.get("total")}**')
        return '\n'.join(lines)
    if sec == 'qurum':
        rows = payload.get('qurums') or []
        if not rows:
            return 'Qurum panelində məlumat yoxdur.'
        lines = [f'**Qurumlar**{scope_bit}:']
        for i, row in enumerate(rows[:8], 1):
            lines.append(f'{i}. **{row.get("name")}** — **{row.get("total")}**')
        return '\n'.join(lines)
    if sec in ('risks', 'overview'):
        return (
            f'Panel{scope_bit}: açıq **{payload.get("open", 0)}**, '
            f'tamam **{payload.get("done", 0)}**, gecikən **{payload.get("late", 0)}**, '
            f'blok **{payload.get("blocked", 0)}**.'
        )
    return None


def try_fast_panel_answer(hint: str, question: str, tools: 'SnapshotTools') -> Optional[Tuple[str, List[str], List[Any]]]:
    """Bal/qurum və ya məqsədəuyğunluq sualını LLM olmadan paneldən cavabla."""
    q = str(question or '').strip()
    if not q:
        return None
    qf = fold(q)

    task_fast = try_fast_task_answer(q, tools)
    if task_fast:
        return task_fast

    # Dashboard panelləri (iş yükü, istiqamət, prioritet…)
    dash_sec = ''
    if re.search(
        r'is yuk|iş yük|workload|ən çox iş|en cox is|en mesgul|ən məşğul|'
        r'yuklu|yüklü|kimde cox|kimdə çox|hansı əməkdaş|hansi emekdas|'
        r'icrac[iı].*cox|cox.*icrac',
        qf,
    ):
        dash_sec = 'workload'
    elif re.search(r'istiqamet|direction|epic pay', qf):
        dash_sec = 'directions'
    elif re.search(r'prioritet|priority pay', qf) and not re.search(r'\bbal\b|diaqnost', qf):
        dash_sec = 'priority'
    elif re.search(r'status pay|icra status|status uzre|status üzrə', qf):
        dash_sec = 'status'
    elif re.search(r'qurum.*(cox|çox|reyting|pay)|ən çox qurum|en cox qurum', qf):
        dash_sec = 'qurum'
    if dash_sec:
        sort = 'bottom' if re.search(r'az|asagi|least|light', qf) else 'top'
        result = tools.get_dashboard(section=dash_sec, sort=sort, limit=8)
        text = format_dashboard_answer(result, dash_sec)
        if text:
            return text, ['get_dashboard'], [result]

    # Məqsədəuyğunluq rəyi — diaqnostika balına düşməsin
    if _MEQSED_Q_RE.search(q) or _MEQSED_Q_RE.search(qf):
        year_n = _extract_year(q)
        op = ''
        if re.search(r'müsbət|musbet|pos', qf):
            op = 'pos'
        elif re.search(r'mənfi|menfi|neg', qf):
            op = 'neg'
        elif re.search(r'qismən|qismen|partial', qf):
            op = 'partial'
        result = tools.get_meqsed_stats(year=year_n, opinion=op)
        text = format_meqsed_answer(result)
        if text:
            return text, ['get_meqsed_stats'], [result]
        return None

    if _RANK_RE.search(qf):
        return None
    # Yalnız aydın qurum+bal sualları — bütün cümləni qurum kimi fuzzy-ləmə
    if not _ORG_SCORE_RE.search(qf):
        return None
    if hint not in ('assess', 'qurum', 'open', ''):
        return None
    result = tools.get_assessment_scores(category='diag', qurum=q, limit=1)
    if result.get('error') == 'not_found':
        return None
    if result.get('qurum'):
        text = format_qurum_score_answer(result, force=True)
        if text:
            return text, ['get_assessment_scores'], [result]
    return None


def extract_suggestion_hints(answer: str) -> List[str]:
    """Optional follow-ups if model didn't emit structured ones — keep empty; LLM/suggestions event preferred."""
    return []
