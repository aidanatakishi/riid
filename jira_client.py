import time

import requests
import urllib3

from config import MAX_RESULTS, REQUEST_TIMEOUT, COUNT_TIMEOUT
from users import TEAM_IDS, component_matches_team, normalize_team

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def make_session():
    session = requests.Session()
    session.trust_env = False
    return session


def auth_headers(pat):
    return {
        "Authorization": f"Bearer {pat}",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0"
    }


def http_error_payload(res):
    try:
        error_data = res.json()
        if isinstance(error_data, dict) and (error_data.get('error') or error_data.get('errorMessages')):
            msg = error_data.get('error')
            if not msg:
                msgs = error_data.get('errorMessages')
                if isinstance(msgs, list):
                    msg = ' '.join(str(item) for item in msgs if item)
                else:
                    msg = str(msgs or '')
            return {'error': msg or f'Jira HTTP {res.status_code} qaytardı.'}
    except Exception:
        pass
    if res.status_code == 503:
        return {
            "error": "Jira müvəqqəti əlçatan deyil (503). Brauzerdə jira.idda.az açın — "
                     "«Jira access problem» görünsə, server bərpa olunana qədər gözləyin."
        }
    if res.status_code == 502:
        return {"error": "Jira şlüzü cavab vermir (502). Bir az sonra yenidən yoxlayın."}
    body = (res.text or '').strip()
    if not body:
        return {"error": f"Jira HTTP {res.status_code} qaytardı."}
    return {"error": f"HTTP {res.status_code}: {body[:300]}"}


def fetch_jira_data(base_url, pat, jql, fields, expand=None):
    url = f"{base_url}/rest/api/2/search"
    all_issues = []
    start_at = 0
    total = 0
    data = {}
    names = {}

    headers = auth_headers(pat)
    session = make_session()

    while True:
        params = {
            "jql": jql,
            "startAt": start_at,
            "maxResults": MAX_RESULTS,
            "fields": fields
        }
        expand_parts = ['names']
        if expand:
            for part in str(expand).split(','):
                part = part.strip()
                if part and part not in expand_parts:
                    expand_parts.append(part)
        params["expand"] = ','.join(expand_parts)

        try:
            res = session.get(url, headers=headers, params=params, verify=False, timeout=REQUEST_TIMEOUT)
        except requests.exceptions.Timeout:
            return None, {"error": "Jira serveri cavab vermir (timeout)"}, 504
        except requests.exceptions.ConnectionError:
            return None, {"error": "Jira serverinə qoşulmaq mümkün olmadı"}, 503
        except Exception as e:
            return None, {"error": f"Sorğu xətası: {str(e)}"}, 500

        if res.status_code != 200:
            return None, http_error_payload(res), res.status_code

        try:
            data = res.json()
        except Exception:
            return None, {"error": "Jira cavabı JSON formatında deyil"}, 502

        all_issues.extend(data.get('issues', []))
        if data.get('names'):
            names.update(data.get('names'))
        total = data.get('total', 0)
        start_at += MAX_RESULTS

        if start_at >= total:
            break

    return {
        "issues": all_issues,
        "total": len(all_issues),
        "names": names
    }, None, 200


def fetch_jira_fields(base_url, pat):
    url = f"{base_url}/rest/api/2/field"
    session = make_session()
    try:
        res = session.get(url, headers=auth_headers(pat), verify=False, timeout=REQUEST_TIMEOUT)
    except requests.exceptions.Timeout:
        return None, {"error": "Jira serveri cavab vermir (timeout)"}, 504
    except requests.exceptions.ConnectionError:
        return None, {"error": "Jira serverinə qoşulmaq mümkün olmadı"}, 503
    except Exception as e:
        return None, {"error": f"Sorğu xətası: {str(e)}"}, 500

    if res.status_code != 200:
        return None, http_error_payload(res), res.status_code

    try:
        fields = res.json()
    except Exception:
        return None, {"error": "Jira cavabı JSON formatında deyil"}, 502

    names = {}
    if isinstance(fields, list):
        for item in fields:
            if not isinstance(item, dict):
                continue
            fid = item.get('id')
            name = item.get('name')
            if fid and name:
                names[fid] = name
    return {"fields": fields if isinstance(fields, list) else [], "names": names}, None, 200


def fetch_plan_issues(base_url, pat, plan_id):
    url = f"{base_url}/rest/jpo/1.0/plans/{plan_id}/issues"
    session = make_session()
    res = session.get(url, headers=auth_headers(pat), verify=False, timeout=REQUEST_TIMEOUT)
    return res


def _norm_jira_person(raw):
    if not isinstance(raw, dict):
        return None
    display = str(raw.get('displayName') or raw.get('display_name') or '').strip()
    account = str(raw.get('accountId') or raw.get('key') or raw.get('name') or '').strip()
    if not display and not account:
        return None
    return {
        'accountId': account,
        'displayName': display or account,
        'name': str(raw.get('name') or '').strip(),
        'email': str(raw.get('emailAddress') or raw.get('email') or '').strip(),
        'active': raw.get('active', True) is not False
    }


def search_jira_users(base_url, pat, query, limit=20):
    query = str(query or '').strip()
    if len(query) < 2:
        return [], None, 200
    if not base_url or not pat:
        return None, {'error': 'Jira bağlantısı yoxdur'}, 503
    session = make_session()
    headers = auth_headers(pat)
    people = []
    seen = set()
    last_err = None
    last_status = 200

    def add_rows(rows):
        for raw in rows or []:
            person = _norm_jira_person(raw)
            if not person:
                continue
            key = person['accountId'] or person['displayName']
            if key in seen:
                continue
            seen.add(key)
            people.append(person)

    try:
        res = session.get(
            f'{base_url}/rest/api/2/user/picker',
            headers=headers,
            params={'query': query, 'maxResults': limit, 'showAvatar': 'false'},
            verify=False,
            timeout=REQUEST_TIMEOUT
        )
        if res.status_code == 200:
            data = res.json()
            add_rows(data.get('users') if isinstance(data, dict) else data)
        else:
            last_err = http_error_payload(res)
            last_status = res.status_code
    except requests.exceptions.Timeout:
        return None, {'error': 'Jira serveri cavab vermir (timeout)'}, 504
    except requests.exceptions.ConnectionError:
        return None, {'error': 'Jira serverinə qoşulmaq mümkün olmadı'}, 503
    except Exception as err:
        last_err = {'error': str(err)}
        last_status = 500

    if len(people) < 3:
        try:
            res = session.get(
                f'{base_url}/rest/api/2/user/search',
                headers=headers,
                params={'username': query, 'maxResults': limit},
                verify=False,
                timeout=REQUEST_TIMEOUT
            )
            if res.status_code == 200:
                data = res.json()
                add_rows(data if isinstance(data, list) else (data.get('users') if isinstance(data, dict) else []))
            elif not people:
                last_err = http_error_payload(res)
                last_status = res.status_code
        except Exception:
            pass

    if people:
        return people[:limit], None, 200
    if last_err:
        return None, last_err, last_status
    return [], None, 200


def fetch_project_components(base_url, pat, project_key):
    key = str(project_key or '').strip().upper()
    if not base_url or not pat or not key:
        return None, {'error': 'Jira bağlantısı yoxdur'}, 503
    session = make_session()
    try:
        res = session.get(
            f'{base_url}/rest/api/2/project/{key}/components',
            headers=auth_headers(pat),
            verify=False,
            timeout=REQUEST_TIMEOUT
        )
    except requests.exceptions.Timeout:
        return None, {'error': 'Jira serveri cavab vermir (timeout)'}, 504
    except requests.exceptions.ConnectionError:
        return None, {'error': 'Jira serverinə qoşulmaq mümkün olmadı'}, 503
    except Exception as err:
        return None, {'error': str(err)}, 500
    if res.status_code != 200:
        return None, http_error_payload(res), res.status_code
    try:
        data = res.json()
    except Exception:
        return None, {'error': 'Jira cavabı JSON formatında deyil'}, 502
    if not isinstance(data, list):
        return [], None, 200
    rows = []
    for item in data:
        if not isinstance(item, dict):
            continue
        name = str(item.get('name') or '').strip()
        if name:
            rows.append({'id': str(item.get('id') or ''), 'name': name})
    return rows, None, 200


def _team_for_component_name(name):
    hits = [tid for tid in TEAM_IDS if component_matches_team(name, tid)]
    if len(hits) == 1:
        return hits[0]
    return ''


def _issue_team_ids(fields):
    comps = (fields or {}).get('components') or []
    if not isinstance(comps, list):
        comps = [comps]
    teams = set()
    for item in comps:
        if isinstance(item, dict):
            raw = item.get('name') or item.get('value') or ''
        else:
            raw = item
        tid = _team_for_component_name(raw)
        if tid:
            teams.add(tid)
    return teams


def _bucket_people_by_team(issues):
    scores = {}
    for issue in issues or []:
        fields = issue.get('fields') if isinstance(issue, dict) else None
        person = _norm_jira_person((fields or {}).get('assignee'))
        if not person or not person.get('displayName'):
            continue
        teams = _issue_team_ids(fields)
        if not teams:
            continue
        ident = person['accountId'] or person['displayName']
        slot = scores.setdefault(ident, {'person': person, 'counts': {}})
        for tid in teams:
            slot['counts'][tid] = slot['counts'].get(tid, 0) + 1
    buckets = {tid: [] for tid in TEAM_IDS}
    for slot in scores.values():
        counts = slot.get('counts') or {}
        if not counts:
            continue
        best = max(counts.values())
        winners = [tid for tid, n in counts.items() if n == best]
        if len(winners) != 1:
            continue
        buckets[winners[0]].append(slot['person'])
    for tid in buckets:
        buckets[tid].sort(key=lambda row: str(row.get('displayName') or '').lower())
    return buckets


_team_people_cache = {}
_TEAM_PEOPLE_TTL = 180


def collect_component_people(base_url, pat, project_key, components, team=None, limit_issues=1500):
    key = str(project_key or '').strip().upper()
    team_id = normalize_team(team) if team else ''
    rows = []
    for item in components or []:
        if isinstance(item, dict):
            rows.append(item)
        elif str(item).strip():
            rows.append({'name': str(item).strip()})
    ids = []
    names = []
    for row in rows:
        cid = str(row.get('id') or '').strip()
        if cid.isdigit() and cid not in ids:
            ids.append(cid)
        name = str(row.get('name') or '').strip()
        if name and name not in names:
            names.append(name)
    if not base_url or not pat or not key or (not ids and not names):
        return [], None, 200
    cache_key = (str(base_url), key, tuple(ids or names))
    now = time.time()
    cached = _team_people_cache.get(cache_key)
    if cached and now - cached[0] < _TEAM_PEOPLE_TTL:
        buckets = cached[1]
        if team_id:
            return list(buckets.get(team_id) or []), None, 200
        people = []
        seen = set()
        for tid in TEAM_IDS:
            for person in buckets.get(tid) or []:
                ident = person.get('accountId') or person.get('displayName')
                if ident in seen:
                    continue
                seen.add(ident)
                people.append(person)
        return people, None, 200
    if ids:
        jql = 'project = %s AND component in (%s) AND assignee is not EMPTY ORDER BY updated DESC' % (
            key, ', '.join(ids)
        )
    else:
        quoted = ', '.join('"%s"' % n.replace('\\', '\\\\').replace('"', '\\"') for n in names)
        jql = 'project = %s AND component in (%s) AND assignee is not EMPTY ORDER BY updated DESC' % (key, quoted)
    session = make_session()
    headers = auth_headers(pat)
    issues = []
    start_at = 0
    page = min(MAX_RESULTS, 500)
    scanned = 0
    while scanned < limit_issues:
        try:
            res = session.get(
                f'{base_url}/rest/api/2/search',
                headers=headers,
                params={
                    'jql': jql,
                    'startAt': start_at,
                    'maxResults': page,
                    'fields': 'assignee,components'
                },
                verify=False,
                timeout=REQUEST_TIMEOUT
            )
        except requests.exceptions.Timeout:
            return None, {'error': 'Jira serveri cavab vermir (timeout)'}, 504
        except requests.exceptions.ConnectionError:
            return None, {'error': 'Jira serverinə qoşulmaq mümkün olmadı'}, 503
        except Exception as err:
            return None, {'error': str(err)}, 500
        if res.status_code != 200:
            return None, http_error_payload(res), res.status_code
        try:
            data = res.json()
        except Exception:
            return None, {'error': 'Jira cavabı JSON formatında deyil'}, 502
        batch = data.get('issues') or []
        issues.extend(batch)
        scanned += len(batch)
        total = int(data.get('total') or 0)
        start_at += page
        if start_at >= total or not batch:
            break
    buckets = _bucket_people_by_team(issues)
    _team_people_cache[cache_key] = (now, buckets)
    if team_id:
        return list(buckets.get(team_id) or []), None, 200
    people = []
    seen = set()
    for tid in TEAM_IDS:
        for person in buckets.get(tid) or []:
            ident = person.get('accountId') or person.get('displayName')
            if ident in seen:
                continue
            seen.add(ident)
            people.append(person)
    return people, None, 200


def count_jql(base_url, pat, jql):
    url = f"{base_url}/rest/api/2/search"
    params = {"jql": jql, "maxResults": 0}
    session = make_session()
    res = session.get(
        url,
        headers=auth_headers(pat),
        params=params,
        verify=False,
        timeout=COUNT_TIMEOUT
    )
    return res
