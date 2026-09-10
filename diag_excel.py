# -*- coding: utf-8 -*-
"""Qurum diaqnostikası Excel faylını oxuyur: istiqamət, meyar, cari vəziyyət, çatışmazlıq, bal."""
from __future__ import annotations

import csv
import io
import os
import re
from collections import OrderedDict


def require_openpyxl():
    try:
        from openpyxl import load_workbook
    except ImportError:
        raise RuntimeError(
            'Excel oxumaq üçün openpyxl lazımdır. Terminalda: pip install -r requirements.txt'
        ) from None
    return load_workbook

DIR_NEEDLES = (
    ('strategiya', ('strategiya', 'strategy', 'strategic')),
    ('xidmetler', ('xidmet', 'service')),
    ('texniki', ('texniki', 'infrastruktur', 'texnoloj', 'technical', 'technolog')),
    ('emeliyyat', ('emeliyyat', 'meliyyat', 'operation', 'operating')),
)

DIR_TITLES = {
    'strategiya': 'Strategiya',
    'xidmetler': 'Xidmətlər',
    'texniki': 'Texniki-texnoloji infrastruktur',
    'emeliyyat': 'Əməliyyat modelləri',
}

HEADER_MAP = {
    'org': ('qurum', 'teskilat', 'muessise', 'institution', 'teskilatin adi', 'qurumun adi'),
    'dir': ('istiqamet', 'direction', 'pillar', 'pillars'),
    'crit': ('meyar', 'criterion', 'criteria', 'domain', 'domains'),
    'sub': ('altmeyar', 'alt meyar', 'subcriterion', 'sub criterion', 'capability', 'capabilities'),
    'current': (
        'cari veziyyet', 'cari veziyyət', 'hazirki veziyyet', 'hazirki veziyyət',
        'movcud veziyyet', 'current', 'veziyyet'
    ),
    'gap': (
        'catismaz', 'bosluq', 'deficiency', 'gap', 'uygunsuz',
        'tapilan problem', 'musahide'
    ),
    'score': ('bal', 'qiymet', 'qiymetlendirme', 'netice', 'score', 'qrsg', 'yekun'),
    'year': ('il', 'year', 'dovr', 'tarix'),
}

KV_LABELS = {
    'org': ('qurum', 'teskilat', 'muessise', 'diaqnostika aparilan'),
    'year': ('il', 'dovr', 'tarix'),
    'score': ('qrsg', 'umumi netice', 'yekun netice', 'reqemsallasma seviyyesi', 'umumi bal'),
    'current': ('cari veziyyet', 'hazirki veziyyet'),
    'gap': ('catismaz', 'bosluq'),
}

SKIP_HEADER = (
    'movcud veziyyet ve qiymet',
    'ballarla hesablanir',
    'sira no',
    'sira n',
)

_TR = str.maketrans({
    'ı': 'i', 'İ': 'i', 'I': 'i', 'ə': 'e', 'Ə': 'e',
    'ö': 'o', 'Ö': 'o', 'ü': 'u', 'Ü': 'u',
    'ğ': 'g', 'Ğ': 'g', 'ş': 's', 'Ş': 's', 'ç': 'c', 'Ç': 'c',
})


def fold(value):
    s = '' if value is None else str(value)
    s = s.replace('\xa0', ' ').translate(_TR).lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def cell_text(value):
    if value is None:
        return ''
    if isinstance(value, bool):
        return ''
    if isinstance(value, (int, float)):
        if isinstance(value, float) and value != int(value):
            return str(value)
        return str(int(value)) if float(value).is_integer() else str(value)
    s = str(value).replace('\xa0', ' ').strip()
    if s.lower() in ('none', 'null', '-', '—', 'n/a'):
        return ''
    return s


def parse_num(value):
    if value is None or value == '':
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        n = float(value)
        return n if n == n and abs(n) <= 1000 else None
    s = str(value).strip().replace(',', '.')
    m = re.search(r'-?\d+(?:\.\d+)?', s)
    if not m:
        return None
    n = float(m.group(0))
    return n if abs(n) <= 1000 else None


def dir_id_from_title(title):
    f = fold(title)
    if not f:
        return ''
    if 'xidmet' in f and 'say' in f:
        return ''
    for did, needles in DIR_NEEDLES:
        for n in needles:
            if n in f:
                return did
    return ''


def header_hit(folded, needle):
    if not folded or not needle:
        return False
    if len(needle) <= 3:
        return folded == needle or bool(re.search(r'(^|\s)' + re.escape(needle) + r'($|\s)', folded))
    return needle in folded


def header_role(text):
    f = fold(text)
    if not f or any(tok in f for tok in SKIP_HEADER):
        return ''
    if f in ('0', '50', '75', '100') or re.fullmatch(r'\d+', f):
        return ''
    if len(f) > 48:
        return ''
    best = ''
    best_len = 0
    for role, needles in HEADER_MAP.items():
        for n in needles:
            if header_hit(f, n) and len(n) > best_len:
                best = role
                best_len = len(n)
    if best == 'current' and 'qiymet' in f and 'veziyyet' in f:
        return ''
    if best == 'score' and ('cari' in f or 'catismaz' in f) and 'bal' not in f and 'qiymet' not in f:
        return ''
    if best in ('sub', 'crit', 'dir') and any(header_hit(f, n) for n in HEADER_MAP['score']):
        return 'score'
    return best


def fill_merged(ws):
    merged = list(ws.merged_cells.ranges)
    for rng in merged:
        val = ws.cell(rng.min_row, rng.min_col).value
        if val is None:
            continue
        for row in range(rng.min_row, rng.max_row + 1):
            for col in range(rng.min_col, rng.max_col + 1):
                if ws.cell(row, col).value is None:
                    ws.cell(row, col).value = val


def sheet_matrix(ws):
    fill_merged(ws)
    rows = []
    for row in ws.iter_rows(values_only=True):
        vals = [cell_text(c) for c in row]
        while vals and not vals[-1]:
            vals.pop()
        rows.append(vals)
    while rows and not any(rows[-1]):
        rows.pop()
    return rows


def look_kv(rows, max_rows=30):
    meta = {}
    for row in rows[:max_rows]:
        if len(row) < 2:
            continue
        left = fold(row[0])
        right = row[1]
        if not left or not right:
            continue
        for role, needles in KV_LABELS.items():
            if any(n in left for n in needles) and role not in meta:
                meta[role] = right
                break
    return meta


def find_header(rows):
    best_i = -1
    best_map = {}
    best_score = 0
    for i, row in enumerate(rows[:40]):
        colmap = {}
        mark = {}
        for c, cell in enumerate(row):
            f = fold(cell)
            if f in ('0', '50', '75', '100'):
                n = int(f)
                if n in (0, 50, 75, 100):
                    mark[n] = c
                continue
            role = header_role(cell)
            if role and role not in colmap:
                colmap[role] = c
        score = len(colmap)
        if mark:
            score += 1
        useful = {'dir', 'crit', 'sub', 'current', 'gap', 'score', 'org'}
        if len(useful.intersection(colmap)) >= 2 and score > best_score:
            best_score = score
            best_i = i
            best_map = {'cols': colmap, 'marks': mark}
    if best_i < 0:
        return -1, {}, {}
    return best_i, best_map['cols'], best_map['marks']


def marked_score(row, marks):
    tokens = {'x', 'v', '1', 'yes', 'beli', 'ok', '+'}
    found = []
    for score, idx in marks.items():
        if idx >= len(row):
            continue
        raw = row[idx]
        f = fold(raw)
        if not f:
            continue
        if f in tokens or f == str(int(score)) or '✓' in raw or '✔' in raw:
            found.append(score)
            continue
        n = parse_num(raw)
        if n is not None and abs(n - score) < 0.01:
            found.append(score)
    if len(found) == 1:
        return float(found[0])
    return None


def take(row, cols, role):
    idx = cols.get(role)
    if idx is None or idx >= len(row):
        return ''
    return row[idx].strip()


def empty_org(name, year=None):
    return {
        'name': name or '',
        'year': year,
        'qrsg': None,
        'dirs': {d: None for d in DIR_TITLES},
        'dirTexts': {d: '' for d in DIR_TITLES},
        'dirGaps': {d: '' for d in DIR_TITLES},
        'extras': [],
        'overallText': '',
        'overallCurrent': '',
        'overallGaps': '',
    }


def ensure_org(bucket, name, year):
    key = name.strip() or '__default__'
    if key not in bucket:
        bucket[key] = empty_org(name.strip(), year)
    org = bucket[key]
    if year and org['year'] is None:
        org['year'] = year
    return org


def append_unique(parts, text):
    t = (text or '').strip()
    if not t:
        return
    if t not in parts:
        parts.append(t)


def add_extra(org, dir_id, title, score, current, gap, criterion='', sub=''):
    title = (title or '').strip()
    current = (current or '').strip()
    gap = (gap or '').strip()
    criterion = (criterion or '').strip()
    sub = (sub or '').strip()
    if not title and not criterion and not sub and score is None and not current and not gap:
        return
    if not title:
        title = sub or criterion or DIR_TITLES.get(dir_id) or 'Meyar'
    blob = current or gap
    for prev in org['extras']:
        same = (
            (prev.get('dirId') or '') == (dir_id or '')
            and fold(prev.get('criterion') or '') == fold(criterion)
            and fold(prev.get('sub') or prev.get('title') or '') == fold(sub or title)
        )
        if same:
            if score is not None and prev.get('score') is None:
                prev['score'] = score
            if current and not prev.get('current'):
                prev['current'] = current
            if gap and not prev.get('deficiency'):
                prev['deficiency'] = gap
            if blob and not prev.get('text'):
                prev['text'] = blob
            if criterion and not prev.get('criterion'):
                prev['criterion'] = criterion
            if sub and not prev.get('sub'):
                prev['sub'] = sub
            return
    org['extras'].append({
        'title': title,
        'criterion': criterion,
        'sub': sub,
        'score': score,
        'text': blob,
        'current': current,
        'deficiency': gap,
        'dirId': dir_id or '',
    })


def apply_dir_level(org, dir_id, score, current, gap):
    if not dir_id:
        return
    if score is not None and org['dirs'].get(dir_id) is None:
        org['dirs'][dir_id] = score
    if current:
        prev = org['dirTexts'].get(dir_id) or ''
        org['dirTexts'][dir_id] = (prev + '\n' + current).strip() if prev and current not in prev else (prev or current)
    if gap:
        prev = org['dirGaps'].get(dir_id) or ''
        org['dirGaps'][dir_id] = (prev + '\n' + gap).strip() if prev and gap not in prev else (prev or gap)


def parse_table(rows, header_i, cols, marks, sheet_dir, meta, bucket):
    default_name = cell_text(meta.get('org'))
    default_year = parse_year(meta.get('year'))
    for row in rows[header_i + 1:]:
        if not any(row):
            continue
        joined = fold(' '.join(row[:8]))
        if header_role(row[0] if row else '') and sum(1 for c in row if header_role(c)) >= 2:
            if not any(len(c or '') > 40 for c in row):
                continue
        if 'istiqamet' in joined and 'meyar' in joined:
            continue
        if 'pillar' in joined and 'domain' in joined:
            continue
        org_name = take(row, cols, 'org') or default_name
        year = parse_year(take(row, cols, 'year')) or default_year
        org = ensure_org(bucket, org_name, year)
        dir_raw = take(row, cols, 'dir')
        crit = take(row, cols, 'crit')
        sub = take(row, cols, 'sub')
        did = dir_id_from_title(dir_raw) or sheet_dir
        if not did and not dir_raw:
            did = dir_id_from_title(crit)
        title = sub or crit or dir_raw
        current = take(row, cols, 'current')
        gap = take(row, cols, 'gap')
        score = marked_score(row, marks)
        if score is None:
            score = parse_num(take(row, cols, 'score'))
        if score is not None and score > 100:
            score = None
        if not did and not title and score is None and not current and not gap:
            continue
        if (sub or crit) and did:
            add_extra(org, did, title, score, current, gap, crit, sub)
        elif did and not sub and not crit:
            apply_dir_level(org, did, score, current, gap)
        else:
            add_extra(org, did, title or 'Meyar', score, current, gap, crit, sub)


def parse_pairs(rows, sheet_dir, meta, bucket):
    org = ensure_org(bucket, cell_text(meta.get('org')), parse_year(meta.get('year')))
    did = sheet_dir
    title = ''
    criterion = ''
    sub = ''
    current_parts = []
    gap_parts = []
    score = None

    def flush():
        nonlocal title, current_parts, gap_parts, score, sub
        cur = '\n'.join(current_parts).strip()
        gp = '\n'.join(gap_parts).strip()
        if title or criterion or sub or cur or gp or score is not None:
            if title or criterion or sub:
                add_extra(org, did, title or sub or criterion, score, cur, gp, criterion, sub)
            elif did:
                apply_dir_level(org, did, score, cur, gp)
            else:
                if cur:
                    org['overallCurrent'] = (org['overallCurrent'] + '\n' + cur).strip() if org['overallCurrent'] else cur
                if gp:
                    org['overallGaps'] = (org['overallGaps'] + '\n' + gp).strip() if org['overallGaps'] else gp
        title = ''
        sub = ''
        current_parts = []
        gap_parts = []
        score = None

    for row in rows:
        if not any(row):
            continue
        left = fold(row[0] if row else '')
        right = row[1] if len(row) > 1 else ''
        if not left:
            continue
        nd = dir_id_from_title(row[0])
        if nd and (left.startswith('istiqamet') or nd and len(left) < 40):
            if 'istiqamet' in left or dir_id_from_title(row[0]):
                if not right:
                    flush()
                    did = nd or did
                    continue
        role = header_role(row[0])
        if role == 'dir' or 'istiqamet' in left or left.startswith('pillar'):
            flush()
            did = dir_id_from_title(right) or nd or did
            continue
        if role == 'crit' or 'domain' in left or left.startswith('meyar'):
            flush()
            criterion = right or cell_text(row[0])
            title = criterion
            continue
        if role == 'sub' or 'capabilit' in left or left.startswith('altmeyar'):
            flush()
            sub = right or cell_text(row[0])
            title = sub
            continue
        if role == 'current' or left.startswith('cari') or 'veziyyet' in left:
            append_unique(current_parts, right or ' '.join(row[1:]))
            continue
        if role == 'gap' or 'catismaz' in left or left.startswith('bosluq'):
            append_unique(gap_parts, right or ' '.join(row[1:]))
            continue
        if role == 'score' or 'bal' in left or 'qiymet' in left:
            n = parse_num(right)
            if n is not None:
                score = n
            continue
        if nd and not title:
            flush()
            did = nd
    flush()


def parse_year(value):
    if value is None or value == '':
        return None
    n = parse_num(value)
    if n is not None and 1990 <= n <= 2100:
        return int(n)
    m = re.search(r'(20\d{2})', str(value))
    return int(m.group(1)) if m else None


def mean(vals):
    nums = [v for v in vals if v is not None]
    if not nums:
        return None
    return round(sum(nums) / len(nums), 1)


def domain_score(items):
    domain_rows = [e for e in items if not (e.get('sub') or '').strip() and e.get('score') is not None]
    if domain_rows and not any((e.get('sub') or '').strip() for e in items if e.get('score') is not None):
        return mean([e.get('score') for e in domain_rows])
    cap_rows = [e for e in items if (e.get('sub') or '').strip() and e.get('score') is not None]
    if cap_rows:
        return mean([e.get('score') for e in cap_rows])
    return mean([e.get('score') for e in items])


def pillar_score_from_extras(org, did):
    groups = OrderedDict()
    for e in org['extras']:
        if e.get('dirId') != did:
            continue
        name = (e.get('criterion') or e.get('title') or '').strip() or '_'
        groups.setdefault(name, []).append(e)
    if not groups:
        return None
    return mean([domain_score(items) for items in groups.values()])


def year_from_name(name):
    m = re.search(r'(20\d{2})', name or '')
    return int(m.group(1)) if m else None


def name_from_file(filename):
    stem = os.path.splitext(os.path.basename(filename or ''))[0]
    cleaned = re.sub(r'(?i)diaqnostika|reqemsallasma|rəqəmsallaşma|excel|qerar\s*303', ' ', stem)
    cleaned = re.sub(r'[_-]+', ' ', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip(' ._-')
    return cleaned or stem or 'Qurum'


def finalize_orgs(bucket, filename, meta):
    out = []
    fallback = name_from_file(filename)
    meta_score = parse_num(meta.get('score'))
    meta_current = cell_text(meta.get('current'))
    meta_gap = cell_text(meta.get('gap'))
    meta_year = parse_year(meta.get('year')) or year_from_name(filename)
    for key, org in bucket.items():
        if key == '__default__':
            org['name'] = org['name'] or fallback
        if not org['name']:
            org['name'] = fallback
        if org['year'] is None:
            org['year'] = meta_year
        if org['qrsg'] is None and meta_score is not None and (key == '__default__' or len(bucket) == 1):
            org['qrsg'] = meta_score
        if meta_current and not org['overallCurrent'] and len(bucket) == 1:
            org['overallCurrent'] = meta_current
        if meta_gap and not org['overallGaps'] and len(bucket) == 1:
            org['overallGaps'] = meta_gap
        for did in DIR_TITLES:
            if org['dirs'].get(did) is None:
                org['dirs'][did] = pillar_score_from_extras(org, did)
        dir_vals = [v for v in org['dirs'].values() if v is not None]
        if org['qrsg'] is None and len(dir_vals) >= 3:
            org['qrsg'] = round(sum(dir_vals) / len(dir_vals), 1)
        has = (
            org['qrsg'] is not None
            or any(v is not None for v in org['dirs'].values())
            or org['extras']
            or org['overallCurrent']
            or org['overallGaps']
            or any(org['dirTexts'].values())
            or any(org['dirGaps'].values())
        )
        if has:
            out.append(org)
    return out


def parse_csv_bytes(data, filename):
    text = None
    for enc in ('utf-8-sig', 'utf-8', 'cp1254', 'utf-16'):
        try:
            text = data.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        text = data.decode('utf-8', errors='replace')
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=',;\t')
    except csv.Error:
        dialect = csv.excel
    reader = csv.reader(io.StringIO(text), dialect)
    rows = [[cell_text(c) for c in row] for row in reader]
    return parse_rows_as_book(rows, filename, '')


def parse_rows_as_book(rows, filename, sheet_dir, meta_extra=None):
    bucket = OrderedDict()
    meta = look_kv(rows)
    if meta_extra:
        for k, v in meta_extra.items():
            meta.setdefault(k, v)
    header_i, cols, marks = find_header(rows)
    if header_i >= 0:
        parse_table(rows, header_i, cols, marks, sheet_dir, meta, bucket)
    else:
        parse_pairs(rows, sheet_dir, meta, bucket)
    return bucket, meta


def parse_diag_excel(path, filename=None):
    filename = filename or os.path.basename(path)
    ext = os.path.splitext(filename)[1].lower()
    if ext == '.csv':
        with open(path, 'rb') as f:
            data = f.read()
        bucket, meta = parse_csv_bytes(data, filename)
        orgs = finalize_orgs(bucket, filename, meta)
        return {'orgs': orgs, 'warnings': [] if orgs else ['Cədvəldə diaqnostika sətiri tapılmadı.']}

    wb = require_openpyxl()(path, data_only=True)
    bucket = OrderedDict()
    meta_all = {}
    for ws in wb.worksheets:
        rows = sheet_matrix(ws)
        if not rows:
            continue
        sheet_dir = dir_id_from_title(ws.title)
        part, meta = parse_rows_as_book(rows, filename, sheet_dir)
        for k, v in meta.items():
            meta_all.setdefault(k, v)
        for key, org in part.items():
            if key not in bucket:
                bucket[key] = org
                continue
            dst = bucket[key]
            if org['qrsg'] is not None and dst['qrsg'] is None:
                dst['qrsg'] = org['qrsg']
            if org['year'] and not dst['year']:
                dst['year'] = org['year']
            for did in DIR_TITLES:
                if dst['dirs'].get(did) is None:
                    dst['dirs'][did] = org['dirs'].get(did)
                if org['dirTexts'].get(did):
                    prev = dst['dirTexts'].get(did) or ''
                    dst['dirTexts'][did] = (prev + '\n' + org['dirTexts'][did]).strip() if prev else org['dirTexts'][did]
                if org['dirGaps'].get(did):
                    prev = dst['dirGaps'].get(did) or ''
                    dst['dirGaps'][did] = (prev + '\n' + org['dirGaps'][did]).strip() if prev else org['dirGaps'][did]
            dst['extras'].extend(org['extras'])
            if org['overallCurrent']:
                dst['overallCurrent'] = (dst['overallCurrent'] + '\n' + org['overallCurrent']).strip() if dst['overallCurrent'] else org['overallCurrent']
            if org['overallGaps']:
                dst['overallGaps'] = (dst['overallGaps'] + '\n' + org['overallGaps']).strip() if dst['overallGaps'] else org['overallGaps']
    orgs = finalize_orgs(bucket, filename, meta_all)
    warnings = []
    if not orgs:
        warnings.append('Excel-də qurum, meyar və ya nəticə cədvəli tapılmadı.')
    return {'orgs': orgs, 'warnings': warnings}
