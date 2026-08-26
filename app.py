from flask import Flask, request, jsonify, send_from_directory
import requests
import urllib3
import os
from datetime import datetime

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)

# CORS headers
@app.after_request
def add_cors_headers(resp):
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    return resp

# Dashboard serve
@app.route('/')
def serve_dashboard():
    if os.path.exists('index.html'):
        return send_from_directory('.', 'index.html')
    return "HTML faylı tapılmadı!", 404

# Helper funksiyası: HTTP sorğusu üçün
def fetch_jira_data(base_url, pat, jql, fields):
    url = f"{base_url}/rest/api/2/search"
    all_issues = []
    start_at = 0
    max_results = 500
    total = 0

    headers = {
        "Authorization": f"Bearer {pat}",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0"
    }

    session = requests.Session()
    session.trust_env = False

    while True:
        params = {
            "jql": jql,
            "startAt": start_at,
            "maxResults": max_results,
            "fields": fields,
            "expand": "changelog"
        }

        try:
            res = session.get(url, headers=headers, params=params, verify=False, timeout=60)
        except requests.exceptions.Timeout:
            return None, {"error": "Jira serveri cavab vermir (timeout)"}, 504
        except requests.exceptions.ConnectionError:
            return None, {"error": "Jira serverinə qoşulmaq mümkün olmadı"}, 503
        except Exception as e:
            return None, {"error": f"Sorğu xətası: {str(e)}"}, 500

        if res.status_code != 200:
            try:
                error_data = res.json()
            except:
                error_data = {"error": f"HTTP {res.status_code}: {res.text[:300]}"}
            return None, error_data, res.status_code

        try:
            data = res.json()
        except:
            return None, {"error": "Jira cavabı JSON formatında deyil"}, 502

        all_issues.extend(data.get('issues', []))
        total = data.get('total', 0)
        start_at += max_results

        if start_at >= total:
            break

    return {
        "issues": all_issues,
        "total": len(all_issues),
        "names": data.get('names', {})
    }, None, 200

# =====================================================
# TARIX FILTER HELPER FUNKSIYASI
# =====================================================
def build_date_filter_jql(date_filter, date_field='duedate'):
    """Tarix filterini JQL şərtinə çevirir və formatı normalizə edir"""
    if not date_filter or not isinstance(date_filter, dict):
        return ""

    start_date = date_filter.get('start') or date_filter.get('startDate') or date_filter.get('from') or date_filter.get('begin')
    end_date = date_filter.get('end') or date_filter.get('endDate') or date_filter.get('to') or date_filter.get('until')

    def normalize_date(d):
        if not d:
            return None
        if isinstance(d, dict):
            y = d.get('year')
            m = d.get('month')
            day = d.get('day')
            if y and m and day:
                return f"{int(y):04d}-{int(m):02d}-{int(day):02d}"
            return None
        if not isinstance(d, str):
            d = str(d)
        d = d.strip()
        if not d:
            return None
        if 'T' in d:
            d = d.split('T')[0]
        elif ' ' in d:
            d = d.split(' ')[0]
        if '/' in d:
            parts = d.split('/')
            if len(parts) == 3:
                if len(parts[2]) == 4:
                    d = f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"
                elif len(parts[0]) == 4:
                    d = f"{parts[0]}-{parts[1].zfill(2)}-{parts[2].zfill(2)}"
        if '.' in d:
            parts = d.split('.')
            if len(parts) == 3 and len(parts[2]) == 4:
                d = f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
        return d

    start_date = normalize_date(start_date)
    end_date = normalize_date(end_date)

    if not start_date and not end_date:
        return ""

    datetime_fields = ['created', 'updated', 'customfield_10015', 'customfield_10016']
    is_datetime = date_field in datetime_fields

    conditions = []
    if start_date:
        if is_datetime:
            conditions.append(f'{date_field} >= "{start_date} 00:00"')
        else:
            conditions.append(f'{date_field} >= "{start_date}"')

    if end_date:
        if is_datetime:
            conditions.append(f'{date_field} <= "{end_date} 23:59"')
        else:
            conditions.append(f'{date_field} <= "{end_date}"')

    if not conditions:
        return ""

    return " AND " + " AND ".join(conditions)

# =====================================================
# 1. JIRA ISSUE SEARCH
# =====================================================
@app.route('/api/jira', methods=['POST', 'OPTIONS'])
def proxy_jira():
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    data = request.json
    base_url = data.get('baseUrl', '').rstrip('/')
    pat = data.get('pat')
    jql = data.get('jql')
    date_filter = data.get('dateFilter')
    date_field = data.get('dateField', 'duedate')

    if not all([base_url, pat, jql]):
        return jsonify({"error": "Əksik məlumat"}), 400

    # Tarix filterini helper funksiya ilə qur
    jql += build_date_filter_jql(date_filter, date_field)

    fields = "summary,status,duedate,customfield_10807,customfield_10808,customfield_15611,customfield_15612,customfield_15613,customfield_15614,customfield_15615,customfield_15616,customfield_15617,customfield_15618,customfield_15619,customfield_15620,components,assignee,reporter,updated,created,priority,labels,customfield_10101,customfield_10107,customfield_10008,customfield_10015,customfield_10016,customfield_12703,customfield_13608,issuetype,subtasks,parent,issuelinks"

    result, error, status = fetch_jira_data(base_url, pat, jql, fields)

    if error:
        return jsonify(error), status

    return jsonify(result), 200

# =====================================================
# 2. ADVANCED ROADMAPS PLAN ISSUES
# =====================================================
@app.route('/api/jira/plan', methods=['POST', 'OPTIONS'])
def get_plan_issues():
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    data = request.json
    base_url = data.get('baseUrl', '').rstrip('/')
    pat = data.get('pat')
    plan_id = data.get('planId')

    if not all([base_url, pat, plan_id]):
        return jsonify({"error": "Əksik məlumat: baseUrl, pat, planId lazımdır"}), 400

    try:
        url = f"{base_url}/rest/jpo/1.0/plans/{plan_id}/issues"
        headers = {
            "Authorization": f"Bearer {pat}",
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0"
        }

        session = requests.Session()
        session.trust_env = False
        res = session.get(url, headers=headers, verify=False, timeout=60)

        if res.status_code != 200:
            return jsonify({
                "error": f"Plan API xətası: {res.status_code}",
                "details": res.text[:500]
            }), res.status_code

        plan_data = res.json()

        return jsonify({
            "plan_issues": plan_data,
            "count": len(plan_data.get('issues', []))
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# =====================================================
# 3. HIERARCHY EXTRACTION
# =====================================================
@app.route('/api/jira/hierarchy', methods=['POST', 'OPTIONS'])
def get_hierarchy():
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    data = request.json
    base_url = data.get('baseUrl', '').rstrip('/')
    pat = data.get('pat')
    parent_key = data.get('parentKey')
    date_filter = data.get('dateFilter')
    exclude_done = data.get('excludeDone', True)

    if not all([base_url, pat, parent_key]):
        return jsonify({"error": "Əksik məlumat: baseUrl, pat, parentKey lazımdır"}), 400

    jql = f'parent = {parent_key}'

    if exclude_done:
        jql += ' AND statusCategory != Done'

    # Tarix filteri - hər zaman duedate üzərindən
    hierarchy_date_field = 'duedate'
    jql += build_date_filter_jql(date_filter, hierarchy_date_field)

    fields = "summary,status,duedate,customfield_10807,customfield_10808,components,assignee,reporter,updated,created,priority,labels,customfield_10101,customfield_10107,customfield_10008,customfield_10015,customfield_10016,customfield_12703,customfield_13608,issuetype,subtasks,parent,issuelinks"

    result, error, status = fetch_jira_data(base_url, pat, jql, fields)
    if error:
        return jsonify(error), status

    istiqametler = []
    for issue in result.get('issues', []):
        fields_data = issue.get('fields', {})
        
        # Alt tapşırıqları (subtasks) və onların mərhələlərini yoxlayırıq
        subtasks_data = fields_data.get('subtasks', [])
        merheleler = []
        
        if subtasks_data:
            for st in subtasks_data:
                st_fields = st.get('fields', {})
                # Alt tapşırığın özünü deyil, yalnız mərhələsini (adı və statusunu) götürürük
                merheleler.append({
                    "phase": st_fields.get('summary'),
                    "status": st_fields.get('status', {}).get('name')
                })
        
        istiqametler.append({
            "key": issue.get('key'),
            "summary": fields_data.get('summary'),
            "status": fields_data.get('status', {}).get('name'),
            "issuetype": fields_data.get('issuetype', {}).get('name'),
            "priority": fields_data.get('priority', {}).get('name'),
            "duedate": fields_data.get('duedate'),
            "target_start": fields_data.get('customfield_10015'),
            "target_end": fields_data.get('customfield_10016'),
            "assignee": fields_data.get('assignee', {}).get('displayName') if fields_data.get('assignee') else None,
            "components": [c.get('name') for c in fields_data.get('components', [])],
            "labels": fields_data.get('labels', []),
            "has_subtasks": len(subtasks_data) > 0,
            "merheleler": merheleler  # Alt tapşırığın özünü yazmadan yalnız mərhələləri qeyd edirik
        })

    return jsonify({
        "parent_key": parent_key,
        "istiqametler": istiqametler,
        "total": len(istiqametler),
        "jql_used": jql
    }), 200

# =====================================================
# 4. DASHBOARD DATA
# =====================================================
@app.route('/api/dashboard', methods=['POST', 'OPTIONS'])
def get_dashboard_data():
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    data = request.json
    base_url = data.get('baseUrl', '').rstrip('/')
    pat = data.get('pat')
    parent_key = data.get('parentKey')
    date_filter = data.get('dateFilter')

    result = {
        "istiqametler": [],
        "statistics": {},
        "errors": []
    }

    try:
        if parent_key:
            hierarchy_url = f"http://127.0.0.1:5000/api/jira/hierarchy"
            hierarchy_data = {
                "baseUrl": base_url,
                "pat": pat,
                "parentKey": parent_key,
                "dateFilter": date_filter,
                "excludeDone": True
            }

            res = requests.post(hierarchy_url, json=hierarchy_data, timeout=60)
            if res.status_code == 200:
                result["istiqametler"] = res.json().get("istiqametler", [])
            else:
                result["errors"].append(f"Hierarchy API xətası: {res.status_code}")

        if result["istiqametler"]:
            total = 0
            done = 0
            in_progress = 0
            todo = 0

            for item in result["istiqametler"]:
                # Əgər tapşırığın alt tapşırığı yoxdursa, tapşırığın özünü say
                if not item.get("has_subtasks"):
                    total += 1
                    status = item.get("status")
                    if status in ["Done", "Closed", "Resolved"]:
                        done += 1
                    elif status in ["In Progress", "Development", "Testing"]:
                        in_progress += 1
                    else:
                        todo += 1
                else:
                    # Əgər alt tapşırıqları varsa, tapşırığın özünü sayma, yalnız mərhələləri say
                    for phase in item.get("merheleler", []):
                        total += 1
                        status = phase.get("status")
                        if status in ["Done", "Closed", "Resolved"]:
                            done += 1
                        elif status in ["In Progress", "Development", "Testing"]:
                            in_progress += 1
                        else:
                            todo += 1

            result["statistics"] = {
                "total": total,
                "done": done,
                "in_progress": in_progress,
                "todo": todo,
                "completion_rate": round((done / total) * 100, 2) if total > 0 else 0
            }

        return jsonify(result), 200

    except Exception as e:
        result["errors"].append(str(e))
        return jsonify(result), 500

# =====================================================
# 5. PLAN HIERARCHY
# =====================================================
@app.route('/api/jira/plan/hierarchy', methods=['POST', 'OPTIONS'])
def get_plan_hierarchy():
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    data = request.json
    base_url = data.get('baseUrl', '').rstrip('/')
    pat = data.get('pat')
    plan_id = data.get('planId')
    parent_issue_type = data.get('parentIssueType', 'Epic')

    if not all([base_url, pat, plan_id]):
        return jsonify({"error": "Əksik məlumat"}), 400

    try:
        url = f"{base_url}/rest/jpo/1.0/plans/{plan_id}/issues"
        headers = {
            "Authorization": f"Bearer {pat}",
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0"
        }

        session = requests.Session()
        session.trust_env = False
        res = session.get(url, headers=headers, verify=False, timeout=60)

        if res.status_code != 200:
            return jsonify({
                "error": f"Plan API xətası: {res.status_code}",
                "fallback": True,
                "message": "JQL ilə yoxlayın"
            }), 200

        plan_data = res.json()
        issues = plan_data.get('issues', [])

        hierarchy = {}
        for issue in issues:
            parent_id = issue.get('parentId')
            issue_id = issue.get('id')
            if parent_id:
                if parent_id not in hierarchy:
                    hierarchy[parent_id] = []
                hierarchy[parent_id].append(issue)

        parents = []
        for issue in issues:
            if issue.get('issuetype', {}).get('name') == parent_issue_type:
                parents.append({
                    "id": issue.get('id'),
                    "key": issue.get('key'),
                    "summary": issue.get('summary'),
                    "children": hierarchy.get(issue.get('id'), [])
                })

        return jsonify({
            "plan_id": plan_id,
            "parents": parents,
            "total_issues": len(issues),
            "hierarchy": hierarchy
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# =====================================================
# 6. DATE FILTER VALIDATION
# =====================================================
@app.route('/api/validate/date-filter', methods=['POST', 'OPTIONS'])
def validate_date_filter():
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    data = request.json
    base_url = data.get('baseUrl', '').rstrip('/')
    pat = data.get('pat')
    parent_key = data.get('parentKey')

    jql_open = f'parent = {parent_key} AND statusCategory != Done'
    jql_done = f'parent = {parent_key} AND statusCategory = Done'

    results = {"open": 0, "done": 0, "total": 0}

    try:
        for key, jql in [("open", jql_open), ("done", jql_done)]:
            url = f"{base_url}/rest/api/2/search"
            params = {"jql": jql, "maxResults": 0}
            headers = {"Authorization": f"Bearer {pat}", "Accept": "application/json"}

            session = requests.Session()
            session.trust_env = False
            res = session.get(url, headers=headers, params=params, verify=False, timeout=30)

            if res.status_code == 200:
                results[key] = res.json().get('total', 0)

        results["total"] = results["open"] + results["done"]

        return jsonify({
            "validation": results,
            "recommendations": generate_recommendations(results)
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

def generate_recommendations(results):
    recs = []
    if results["open"] > 0:
        recs.append(f"Açıq issue-lər: {results['open']} - bunlar tarix filterindən asılı olmayaraq görünür")
    if results["done"] > 0:
        recs.append(f"Bağlı issue-lər: {results['done']} - Resolution field-i yoxlayın")
    if results["total"] == 0:
        recs.append("Heç bir issue tapılmadı - Parent key və JQL yoxlayın")
    return recs

if __name__ == '__main__':
    app.run(port=5000, debug=True)