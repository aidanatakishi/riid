"""Snapshot-based chat tools for AI Done (server-side)."""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Callable, Dict, List, Optional, Tuple

SOFT_FAIL = 'Cavab alına bilmədi, yenidən cəhd edin'

TOOL_LABELS = {
    'get_overview': 'Ümumi mənzərəyə baxıram…',
    'get_my_tasks': 'Sizin işlərinizə baxıram…',
    'get_person_workload': 'İş yükünü hesablayıram…',
    'search_tasks': 'Tapşırıqlara baxıram…',
    'compare_sprints': 'Sprintləri müqayisə edirəm…',
    'get_risks': 'Risklər hesablanır…',
    'get_kpi': 'KPI göstəricilərinə baxıram…',
    'get_task': 'Tapşırığa baxıram…',
    'get_assessment_scores': 'Qiymətləndirmə ballarına baxıram…',
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
        }
    text = str(row or '').strip()
    if not text:
        return None
    parts = text.split('|')
    while len(parts) < 9:
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
        'summary': '',
    }


def _parse_assess_row(row: Any) -> Optional[dict]:
    """cat|qurum|score|year|key  və ya dict."""
    if isinstance(row, dict):
        cat = fold(row.get('cat') or row.get('category') or '')
        if cat in ('diaqnostika', 'diagnosis'):
            cat = 'diag'
        score_raw = row.get('score')
        try:
            score = float(score_raw) if score_raw not in (None, '') else None
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
    score = None
    if parts[2].strip():
        try:
            score = float(parts[2].replace(',', '.'))
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
    }


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
        self.overview = self.snap['overview']
        self.meta = self.snap['meta']
        self.truncated = self.snap['truncated']

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
            'truncated': self.truncated,
            'taskCount': len(self.tasks),
        }

    def get_my_tasks(self, status: str = '', priority: str = '') -> dict:
        user = self.meta.get('user') or ''
        if not user:
            return {'error': 'not_found', 'reason': 'viewer_unknown', 'suggestions': []}
        return self.search_tasks(status=status, assignee=user, priority=priority, limit=30)

    def get_person_workload(self, name: str = '') -> dict:
        names = _unique_names(self.tasks)
        match, suggestions = fuzzy_person(name, names)
        if not match:
            return {'error': 'not_found', 'suggestions': suggestions[:5]}
        mine = [t for t in self.tasks if fold(t.get('assignee')) == fold(match)]
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
        return {
            'name': match,
            'total': len(mine),
            'done': sum(1 for t in mine if _is_done(t)),
            'overdue': len(overdue),
            'blocked': len(blocked),
            'byPriority': by_pri,
            'byStatus': by_status,
            'overdueTasks': overdue[:10],
            'blockedTasks': blocked[:10],
            'sample': [_task_brief(t) for t in mine[:12]],
        }

    def search_tasks(
        self,
        status: str = '',
        assignee: str = '',
        priority: str = '',
        direction: str = '',
        sprint: str = '',
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
        q_needle = fold(qurum)

        rows = []
        for a in self.assessments:
            if cat and fold(a.get('cat')) != fold(cat):
                continue
            if year_n is not None and a.get('year') != year_n:
                continue
            if q_needle and q_needle not in fold(a.get('qurum')):
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
        top = uniq[:lim]
        return {
            'category': cat,
            'categoryLabel': ASSESS_LABELS.get(cat, cat),
            'sort': 'lowest' if ascending else 'highest',
            'count': total_cat,
            'withScore': scored_n,
            'avgScore': avg,
            'top': top,
            'highest': top[0] if (top and not ascending) else (uniq[-1] if uniq and ascending else None),
            'lowest': top[0] if (top and ascending) else (uniq[-1] if uniq and not ascending else None),
            'truncated': bool(self.truncated),
            'empty': scored_n == 0,
            'hint': (
                'Snapshot-da bu kateqoriya üzrə bal yoxdur. Panelda Diaqnostika bölməsini açıb məlumatın yükləndiyini yoxlayın.'
                if scored_n == 0 else ''
            ),
        }

    def get_task(self, key: str = '') -> dict:
        k = str(key or '').strip().upper()
        if not k:
            return {'error': 'not_found', 'suggestions': []}
        for t in self.tasks:
            if str(t.get('key') or '').upper() == k:
                return {'task': _task_brief(t)}
        # partial
        suggestions = []
        for t in self.tasks:
            tk = str(t.get('key') or '').upper()
            if k in tk or tk in k:
                suggestions.append(tk)
            if len(suggestions) >= 5:
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
        'search_tasks': lambda: tools.search_tasks(
            status=str(args.get('status') or ''),
            assignee=str(args.get('assignee') or ''),
            priority=str(args.get('priority') or ''),
            direction=str(args.get('direction') or ''),
            sprint=str(args.get('sprint') or ''),
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
        'get_assessment_scores': lambda: tools.get_assessment_scores(
            category=str(args.get('category') or args.get('cat') or 'diag'),
            sort=str(args.get('sort') or 'top'),
            limit=args.get('limit', 10),
            qurum=str(args.get('qurum') or ''),
            year=args.get('year'),
        ),
        'get_task': lambda: tools.get_task(str(args.get('key') or '')),
    }
    fn = dispatch.get(name)
    if not fn:
        return {'error': 'unknown_tool', 'name': name}
    try:
        return fn()
    except Exception as err:
        return {'error': 'tool_failed', 'name': name, 'detail': type(err).__name__}


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
                'Adı çəkilən icraçının iş yükü (məs. Sabina, sabina mammadova). '
                'Fuzzy Az/Latin uyğunlaşma. Başqa şəxs soruşulanda bunu çağır.'
            ),
            'parameters': {
                'type': 'object',
                'properties': {'name': {'type': 'string'}},
                'required': ['name'],
            },
        },
        {
            'name': 'search_tasks',
            'description': 'Tapşırıq axtarışı/filtr.',
            'parameters': {
                'type': 'object',
                'properties': {
                    'status': {'type': 'string'},
                    'assignee': {'type': 'string'},
                    'priority': {'type': 'string'},
                    'direction': {'type': 'string'},
                    'sprint': {'type': 'string'},
                    'overdue': {'type': 'boolean'},
                    'blocked': {'type': 'boolean'},
                    'text': {'type': 'string'},
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
                'Qiymətləndirmə / diaqnostika balları qurum üzrə. '
                '«Ən yüksək bal alan qurum», «diaqnostika balları», EXQ/İSQ/özünüqiymətləndirmə '
                'reytingi üçün bunu çağır. category: diag|exq|isq|self|meqsed.'
            ),
            'parameters': {
                'type': 'object',
                'properties': {
                    'category': {
                        'type': 'string',
                        'description': 'diag (default), exq, isq, self, meqsed',
                    },
                    'sort': {
                        'type': 'string',
                        'description': 'top/highest (ən yüksək) və ya bottom/lowest (ən aşağı)',
                    },
                    'limit': {'type': 'integer'},
                    'qurum': {'type': 'string'},
                    'year': {'type': 'integer'},
                },
            },
        },
        {
            'name': 'get_task',
            'description': 'Tək tapşırıq (DGD-1234 kimi açar).',
            'parameters': {
                'type': 'object',
                'properties': {'key': {'type': 'string'}},
                'required': ['key'],
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


def extract_suggestion_hints(answer: str) -> List[str]:
    """Optional follow-ups if model didn't emit structured ones — keep empty; LLM/suggestions event preferred."""
    return []
