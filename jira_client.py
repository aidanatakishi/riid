import time
from urllib.parse import quote, urlsplit, urlunsplit

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
    token = str(pat or '')
    # HTTP header-ləri latin-1 olmalıdır — tokenə təsadüfi unicode düşməsin.
    token = token.encode('ascii', 'ignore').decode('ascii')
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0"
    }


def _latin1_safe(value):
    text = str(value or '')
    try:
        text.encode('latin-1')
        return text
    except UnicodeEncodeError:
        return text.encode('latin-1', 'replace').decode('latin-1')


def safe_request_url(url):
    """URL path/query-də unicode qalmasın (http.client latin-1 tələb edir)."""
    raw = str(url or '').strip()
    if not raw:
        return raw
    try:
        return requests.utils.requote_uri(raw)
    except Exception:
        parts = urlsplit(raw)
        path = quote(parts.path or '', safe='/%')
        query = quote(parts.query or '', safe='=&%')
        return urlunsplit((parts.scheme, parts.netloc, path, query, parts.fragment))


def session_request(session, method, url, **kwargs):
    """requests wrapper: ASCII URL/header + latin-1 cookie təmizliyi."""
    url = safe_request_url(url)
    headers = dict(kwargs.pop('headers', None) or {})
    kwargs['headers'] = {str(k): _latin1_safe(v) for k, v in headers.items()}
    # Cookie jar-da latin-1-ə sığmayan dəyər varsa növbəti sorğunu öldürür
    try:
        for cookie in list(session.cookies):
            val = str(getattr(cookie, 'value', '') or '')
            try:
                val.encode('latin-1')
            except UnicodeEncodeError:
                session.cookies.clear(cookie.domain, cookie.path, cookie.name)
    except Exception:
        pass
    try:
        return session.request(method, url, **kwargs)
    except UnicodeEncodeError:
        session.cookies.clear()
        return session.request(method, url, **kwargs)


def _clarify_jira_msg(msg, status=0):
    text = str(msg or '').strip()
    low = text.lower()
    # Auth olmadan / icazəsiz Jira tez-tez «project does not exist» yazır.
    if "does not exist for the field 'project'" in low or 'does not exist for the field "project"' in low:
        return (
            "Jira layihəni görmür (məs. DGD). Ən çox səbəb: token səhvdir/bitib, "
            "və ya hesabın bu layihəyə Browse icazəsi yoxdur. "
            "Tənzimləmələrdə yeni PAT yazın; KEY jira.idda.az URL-indəki ilə eyni olsun."
        )
    if status in (401, 403) or 'unauthorized' in low or 'authentication' in low:
        return (
            "Jira tokeni səhvdir, müddəti bitib və ya icazə yoxdur. "
            "jira.idda.az-da yeni Personal Access Token yaradıb Tənzimləmələrdə yazın."
        )
    return text


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
            clarified = _clarify_jira_msg(msg or '', res.status_code)
            return {'error': clarified or f'Jira HTTP {res.status_code} qaytardı.'}
    except Exception:
        pass
    if res.status_code in (401, 403):
        return {
            "error": "Jira tokeni səhvdir, müddəti bitib və ya icazə yoxdur. "
                     "jira.idda.az-da yeni Personal Access Token yaradıb girişdə yazın."
        }
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


def verify_jira_pat(base_url, pat):
    """Quick PAT check via /myself. Returns (ok, error_message)."""
    base = (base_url or '').rstrip('/')
    token = str(pat or '').strip()
    if not base or not token:
        return False, 'Jira tokeni lazımdır'
    session = make_session()
    try:
        res = session_request(
            session, 'GET', f'{base}/rest/api/2/myself',
            headers=auth_headers(token),
            verify=False,
            timeout=min(REQUEST_TIMEOUT, 20),
        )
    except requests.exceptions.Timeout:
        return False, 'Jira cavab vermir (timeout). Ofis şəbəkəsi və ya VPN yoxlayın.'
    except requests.exceptions.ConnectionError:
        return False, 'Jira-ya qoşulmaq mümkün olmadı. Ofis şəbəkəsi və ya VPN yoxlayın.'
    except Exception as exc:
        return False, 'Jira yoxlaması alınmadı: %s' % exc
    if res.status_code == 200:
        return True, ''
    err = http_error_payload(res)
    return False, (err or {}).get('error') or ('Jira HTTP %s' % res.status_code)


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
            res = session_request(
                session, 'GET', url,
                headers=headers, params=params, verify=False, timeout=REQUEST_TIMEOUT,
            )
        except requests.exceptions.Timeout:
            return None, {"error": "Jira serveri cavab vermir (timeout)"}, 504
        except requests.exceptions.ConnectionError:
            return None, {"error": "Jira serverinə qoşulmaq mümkün olmadı"}, 503
        except UnicodeEncodeError:
            return None, {
                "error": (
                    "Jira sorğusu göndərilmədi (unicode/header). "
                    "Fayl və ya axtarış mətnində xüsusi hərflər problemi yarada bilər — yenidən yoxlayın."
                )
            }, 500
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


def fetch_issue_comments_batch(base_url, pat, keys):
    """Fetch comments for issue keys via /issue/{key}/comment."""
    session = make_session()
    headers = auth_headers(pat)
    out = {}
    for key in keys or []:
        key = str(key or '').strip()
        if not key:
            continue
        url = f"{base_url}/rest/api/2/issue/{key}/comment"
        try:
            res = session.get(url, headers=headers, params={"maxResults": 100}, verify=False, timeout=REQUEST_TIMEOUT)
        except requests.exceptions.Timeout:
            continue
        except Exception:
            continue
        if res.status_code != 200:
            continue
        try:
            data = res.json()
        except Exception:
            continue
        out[key] = data.get('comments') or []
    return {"comments": out}, None, 200


def _normalize_attachment_rows(raw):
    attachments = []
    for item in raw or []:
        if not isinstance(item, dict):
            continue
        att_id = str(item.get('id') or '').strip()
        filename = str(item.get('filename') or '').strip()
        if not att_id or not filename:
            continue
        attachments.append({
            "id": att_id,
            "filename": filename,
            "mimeType": str(item.get('mimeType') or ''),
            "size": item.get('size') or 0,
            "created": item.get('created') or '',
            "content": str(item.get('content') or ''),
        })
    return attachments


def fetch_issue_attachments(base_url, pat, key):
    """Fetch attachment metadata for one issue key.

    Prefer /search (same path as the dashboard proxy) — some Jira setups
    return 404 for /issue/{key} even when search finds the issue.
    """
    key = str(key or '').strip()
    if not key:
        return None, {"error": "Tapşırıq açarı lazımdır"}, 400

    # 1) Dashboard ilə eyni yol: JQL search
    safe_key = key.replace('"', '')
    result, error, status = fetch_jira_data(
        base_url,
        pat,
        f'key = "{safe_key}"',
        'attachment,summary',
    )
    if not error:
        issues = (result or {}).get('issues') or []
        if issues:
            raw = ((issues[0].get('fields') or {}).get('attachment')) or []
            return {"key": key, "attachments": _normalize_attachment_rows(raw)}, None, 200

    # 2) Birbaşa issue GET
    base = base_url.rstrip('/')
    session = make_session()
    headers = auth_headers(pat)
    try:
        res = session_request(
            session, 'GET', f"{base}/rest/api/2/issue/{safe_key}",
            headers=headers,
            params={"fields": "attachment,summary"},
            verify=False,
            timeout=REQUEST_TIMEOUT,
        )
    except requests.exceptions.Timeout:
        return None, {"error": "Jira serveri cavab vermir (timeout)"}, 504
    except requests.exceptions.ConnectionError:
        return None, {"error": "Jira serverinə qoşulmaq mümkün olmadı"}, 503
    except Exception as e:
        return None, {"error": f"Sorğu xətası: {str(e)}"}, 500

    if res.status_code == 200:
        try:
            data = res.json()
        except Exception:
            return None, {"error": "Jira cavabı JSON formatında deyil"}, 502
        raw = ((data.get('fields') or {}).get('attachment')) or []
        return {"key": key, "attachments": _normalize_attachment_rows(raw)}, None, 200

    if error:
        return None, error, status
    err = http_error_payload(res)
    if res.status_code == 404:
        err = {
            "error": (
                f"{key} tapşırığı Jira-da tapılmadı və ya token bu layihəyə baxa bilmir. "
                "Jira tokenini Tənzimləmələrdə yeniləyin."
            )
        }
    return None, err, res.status_code


def _is_probably_login_html(res):
    ctype = (res.headers.get('Content-Type') or '').lower()
    if 'text/html' in ctype:
        return True
    text = (res.text or '')[:400].lower()
    return 'login.jsp' in text or 'permissionviolation' in text or '<html' in text


def _download_content_bytes(session, headers, content_url, base):
    """Download attachment bytes; PAT + /secure/attachment often needs session cookies."""
    content_url = safe_request_url(content_url)
    try:
        # First call seeds cookies (Atlassian PAT workaround)
        session_request(
            session, 'GET', f"{base}/rest/api/2/myself",
            headers=headers,
            verify=False,
            timeout=REQUEST_TIMEOUT,
        )
    except Exception:
        pass
    try:
        file_res = session_request(
            session, 'GET', content_url,
            headers=headers,
            verify=False,
            timeout=max(REQUEST_TIMEOUT, 90),
            allow_redirects=True,
        )
    except requests.exceptions.Timeout:
        return None, {"error": "Fayl yüklənmədi (timeout)"}, 504
    except UnicodeEncodeError:
        return None, {
            "error": "Fayl ünvanında uyğunsuz simvol var (unicode/header). Jira-da faylı birbaşa açın."
        }, 500
    except Exception as e:
        return None, {"error": f"Fayl xətası: {str(e)}"}, 500
    if file_res.status_code != 200 or _is_probably_login_html(file_res):
        # Cookie-jar retry: Bearer first, then content with cookies only + Bearer
        try:
            jar_res = session_request(
                session, 'GET', content_url,
                headers={
                    "Accept": "*/*",
                    "User-Agent": "Mozilla/5.0",
                    "Authorization": headers.get("Authorization", ""),
                },
                verify=False,
                timeout=max(REQUEST_TIMEOUT, 90),
                allow_redirects=True,
            )
        except Exception as e:
            return None, {"error": f"Fayl xətası: {str(e)}"}, 500
        if jar_res.status_code == 200 and not _is_probably_login_html(jar_res):
            return jar_res.content, None, 200
        if file_res.status_code != 200:
            return None, http_error_payload(file_res), file_res.status_code
        return None, {
            "error": (
                "Jira əlavə faylını token ilə yükləmək mümkün olmadı "
                "(Server/Data Center PAT məhdudiyyəti). Jira-da faylı birbaşa açın."
            )
        }, 502
    return file_res.content, None, 200


def _attachment_content_candidates(base, att_id, content_url='', filename=''):
    """Ordered list of URLs that may yield attachment bytes on Jira Server/DC."""
    base = (base or '').rstrip('/')
    att_id = str(att_id or '').strip()
    content_url = str(content_url or '').strip()
    filename = str(filename or '').strip()
    out = []

    def add(url):
        url = str(url or '').strip()
        if not url:
            return
        # Relative → absolute on same Jira host
        if url.startswith('/'):
            url = base + url
        if not url.startswith(base):
            return
        if url not in out:
            out.append(url)

    add(content_url)
    # REST content endpoint — Bearer PAT ilə /secure/attachment-dan etibarlıdır
    add(f"{base}/rest/api/2/attachment/content/{att_id}")
    add(f"{base}/secure/attachment/{att_id}/")
    if filename:
        add(f"{base}/secure/attachment/{att_id}/{quote(filename)}")
    return out


def download_jira_attachment(base_url, pat, attachment_id, issue_key=None, content_url=None):
    """Download attachment bytes by Jira attachment id (optionally scoped to issue key)."""
    att_id = str(attachment_id or '').strip()
    if not att_id or not att_id.isdigit():
        return None, {"error": "Əlavə id yanlışdır"}, 400
    base = base_url.rstrip('/')
    session = make_session()
    headers = auth_headers(pat)
    known_content = str(content_url or '').strip()
    filename = 'attachment-' + att_id
    mime = 'application/octet-stream'

    issue_key = str(issue_key or '').strip()
    if issue_key:
        listed, err, status = fetch_issue_attachments(base_url, pat, issue_key)
        if not err and listed:
            for row in listed.get('attachments') or []:
                if str(row.get('id') or '') == att_id:
                    if not known_content:
                        known_content = str(row.get('content') or '').strip()
                    filename = str(row.get('filename') or filename)
                    mime = str(row.get('mimeType') or mime)
                    break

    if not known_content or filename.startswith('attachment-'):
        meta_url = f"{base}/rest/api/2/attachment/{att_id}"
        try:
            meta_res = session_request(
                session, 'GET', meta_url,
                headers=headers, verify=False, timeout=REQUEST_TIMEOUT,
            )
        except requests.exceptions.Timeout:
            return None, {"error": "Jira serveri cavab vermir (timeout)"}, 504
        except Exception as e:
            return None, {"error": f"Sorğu xətası: {str(e)}"}, 500
        if meta_res.status_code == 200:
            try:
                meta = meta_res.json()
            except Exception:
                meta = None
            if isinstance(meta, dict):
                if not known_content:
                    known_content = str(meta.get('content') or '').strip()
                filename = str(meta.get('filename') or filename)
                mime = str(meta.get('mimeType') or mime)

    candidates = _attachment_content_candidates(base, att_id, known_content, filename)
    if not candidates:
        return None, {"error": "Əlavə faylı tapılmadı"}, 404

    last_err = {"error": "Əlavə faylı yüklənmədi"}
    last_status = 502
    for url in candidates:
        payload, err, status = _download_content_bytes(session, headers, url, base)
        if not err and payload is not None:
            return {
                "filename": filename,
                "mimeType": mime,
                "content": payload,
            }, None, 200
        last_err = err or last_err
        last_status = status or last_status
        # 401/403/login HTML — digər URL-ləri də yoxla; 404 üçün də növbəti namizəd
        continue

    # İstifadəçiyə daha aydın mesaj
    if last_status == 404:
        return None, {
            "error": (
                "Jira əlavə faylını tapmadı (404). Token layihəyə baxa bilir, "
                "amma fayl silinib və ya ünvan dəyişib ola bilər."
            )
        }, 404
    return None, last_err, last_status


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
