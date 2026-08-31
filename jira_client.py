import requests
import urllib3

from config import MAX_RESULTS, REQUEST_TIMEOUT, COUNT_TIMEOUT

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
            try:
                error_data = res.json()
            except Exception:
                error_data = {"error": f"HTTP {res.status_code}: {res.text[:300]}"}
            return None, error_data, res.status_code

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
        try:
            error_data = res.json()
        except Exception:
            error_data = {"error": f"HTTP {res.status_code}: {res.text[:300]}"}
        return None, error_data, res.status_code

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
