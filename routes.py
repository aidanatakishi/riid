import hmac
import json
import os
import uuid
from datetime import datetime, timezone
from functools import wraps

from flask import Blueprint, request, jsonify, session
from werkzeug.utils import secure_filename

from config import SEARCH_FIELDS, HIERARCHY_FIELDS, JIRA_PAT, JIRA_BASE_URL, JIRA_PROJECT_KEY, ADMIN_PASSWORD
from chat_llm import answer_chat, chat_llm_ready
from diag_excel import parse_diag_excel
from report_pptx import parse_report_pptx
from jira_client import fetch_jira_data, fetch_jira_fields, fetch_plan_issues, count_jql
from jql import build_date_filter_jql, generate_recommendations

api = Blueprint('api', __name__)

DONE_STATUSES = ["Done", "Closed", "Resolved"]
IN_PROGRESS_STATUSES = ["In Progress", "Development", "Testing"]


def options_ok():
    return jsonify({"status": "ok"}), 200


def request_json():
    return request.json or {}


def is_admin_session():
    return bool(session.get('diag_admin'))


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if request.method == 'OPTIONS':
            return options_ok()
        if not is_admin_session():
            return jsonify({'error': 'Admin girişi lazımdır'}), 401
        return fn(*args, **kwargs)
    return wrapper


def password_ok(given, expected):
    if given is None or not expected:
        return False
    got = str(given).encode('utf-8')
    want = str(expected).encode('utf-8')
    if len(got) != len(want):
        return False
    return hmac.compare_digest(got, want)


def public_orgs(index):
    rows = []
    for org in flatten_diag_orgs(index):
        row = dict(org)
        row.pop('fileId', None)
        row.pop('fileName', None)
        rows.append(row)
    return rows


@api.route('/api/admin/me', methods=['GET', 'OPTIONS'])
def admin_me():
    if request.method == 'OPTIONS':
        return options_ok()
    return jsonify({'admin': is_admin_session()}), 200


@api.route('/api/admin/login', methods=['POST', 'OPTIONS'])
def admin_login():
    if request.method == 'OPTIONS':
        return options_ok()
    if not ADMIN_PASSWORD:
        return jsonify({'error': 'Admin parolu serverdə təyin edilməyib (.env: ADMIN_PASSWORD)'}), 503
    data = request_json()
    given = '' if not isinstance(data, dict) else data.get('password')
    if not password_ok(given, ADMIN_PASSWORD):
        return jsonify({'error': 'Parol səhvdir'}), 401
    session.clear()
    session['diag_admin'] = True
    session.permanent = True
    return jsonify({'admin': True}), 200


@api.route('/api/admin/logout', methods=['POST', 'OPTIONS'])
def admin_logout():
    if request.method == 'OPTIONS':
        return options_ok()
    session.clear()
    return jsonify({'admin': False}), 200


def resolve_credentials(data):
    base_url = (data.get('baseUrl') or JIRA_BASE_URL or '').rstrip('/')
    pat = data.get('pat') or JIRA_PAT
    return base_url, pat


@api.route('/api/config', methods=['GET'])
def get_client_config():
    return jsonify({
        'baseUrl': (JIRA_BASE_URL or '').rstrip('/'),
        'projectKey': JIRA_PROJECT_KEY or '',
        'hasToken': bool(JIRA_PAT),
        'hasChatLlm': chat_llm_ready()
    })


@api.route('/api/chat', methods=['POST', 'OPTIONS'])
def api_chat():
    if request.method == 'OPTIONS':
        return options_ok()
    data = request_json()
    if not isinstance(data, dict):
        data = {}
    question = str(data.get('question') or '').strip()
    draft = str(data.get('draft') or '')
    facts = data.get('facts') if isinstance(data.get('facts'), dict) else {}
    history = data.get('history') if isinstance(data.get('history'), list) else []
    llm_key = str(data.get('llmKey') or '').strip()
    if not question:
        return jsonify({'error': 'Sual boşdur'}), 400
    if not chat_llm_ready(llm_key):
        return jsonify({'answer': draft, 'source': 'local'})
    text = answer_chat(question, facts, draft, history, llm_key)
    if text:
        return jsonify({'answer': text, 'source': 'llm'})
    return jsonify({'answer': draft, 'source': 'local'})


def build_hierarchy(base_url, pat, parent_key, date_filter, exclude_done=True):
    if not all([base_url, pat, parent_key]):
        return None, {"error": "Əksik məlumat: baseUrl, pat, parentKey lazımdır"}, 400

    jql = f'parent = {parent_key}'
    if exclude_done:
        jql += ' AND statusCategory != Done'
    jql += build_date_filter_jql(date_filter, 'duedate')

    result, error, status = fetch_jira_data(base_url, pat, jql, HIERARCHY_FIELDS)
    if error:
        return None, error, status

    istiqametler = []
    for issue in result.get('issues', []):
        fields_data = issue.get('fields', {})
        subtasks_data = fields_data.get('subtasks', [])
        merheleler = []

        if subtasks_data:
            for st in subtasks_data:
                st_fields = st.get('fields', {})
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
            "merheleler": merheleler
        })

    payload = {
        "parent_key": parent_key,
        "istiqametler": istiqametler,
        "total": len(istiqametler),
        "jql_used": jql
    }
    return payload, None, 200


def compute_hierarchy_stats(istiqametler):
    total = 0
    done = 0
    in_progress = 0
    todo = 0

    for item in istiqametler:
        if not item.get("has_subtasks"):
            total += 1
            status = item.get("status")
            if status in DONE_STATUSES:
                done += 1
            elif status in IN_PROGRESS_STATUSES:
                in_progress += 1
            else:
                todo += 1
        else:
            for phase in item.get("merheleler", []):
                total += 1
                status = phase.get("status")
                if status in DONE_STATUSES:
                    done += 1
                elif status in IN_PROGRESS_STATUSES:
                    in_progress += 1
                else:
                    todo += 1

    return {
        "total": total,
        "done": done,
        "in_progress": in_progress,
        "todo": todo,
        "completion_rate": round((done / total) * 100, 2) if total > 0 else 0
    }


@api.route('/api/jira', methods=['POST', 'OPTIONS'])
def proxy_jira():
    if request.method == 'OPTIONS':
        return options_ok()

    data = request_json()
    base_url, pat = resolve_credentials(data)
    jql = data.get('jql')
    date_filter = data.get('dateFilter')
    date_field = data.get('dateField', 'duedate')

    if not all([base_url, pat, jql]):
        return jsonify({"error": "Əksik məlumat"}), 400

    jql += build_date_filter_jql(date_filter, date_field)
    expand = 'changelog' if data.get('expandChangelog') else None
    fields = data.get('fields') or SEARCH_FIELDS
    result, error, status = fetch_jira_data(base_url, pat, jql, fields, expand=expand)

    if error:
        return jsonify(error), status

    return jsonify(result), 200


@api.route('/api/jira/fields', methods=['POST', 'OPTIONS'])
def proxy_jira_fields():
    if request.method == 'OPTIONS':
        return options_ok()

    data = request_json()
    base_url, pat = resolve_credentials(data)
    if not all([base_url, pat]):
        return jsonify({"error": "Əksik məlumat"}), 400

    result, error, status = fetch_jira_fields(base_url, pat)
    if error:
        return jsonify(error), status
    return jsonify(result), 200


@api.route('/api/jira/plan', methods=['POST', 'OPTIONS'])
def get_plan_issues():
    if request.method == 'OPTIONS':
        return options_ok()

    data = request_json()
    base_url, pat = resolve_credentials(data)
    plan_id = data.get('planId')

    if not all([base_url, pat, plan_id]):
        return jsonify({"error": "Əksik məlumat: baseUrl, pat, planId lazımdır"}), 400

    try:
        res = fetch_plan_issues(base_url, pat, plan_id)

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


@api.route('/api/jira/hierarchy', methods=['POST', 'OPTIONS'])
def get_hierarchy():
    if request.method == 'OPTIONS':
        return options_ok()

    data = request_json()
    base_url, pat = resolve_credentials(data)
    payload, error, status = build_hierarchy(
        base_url,
        pat,
        data.get('parentKey'),
        data.get('dateFilter'),
        data.get('excludeDone', True)
    )
    if error:
        return jsonify(error), status
    return jsonify(payload), 200


@api.route('/api/dashboard', methods=['POST', 'OPTIONS'])
def get_dashboard_data():
    if request.method == 'OPTIONS':
        return options_ok()

    data = request_json()
    base_url, pat = resolve_credentials(data)
    parent_key = data.get('parentKey')
    date_filter = data.get('dateFilter')

    result = {
        "istiqametler": [],
        "statistics": {},
        "errors": []
    }

    try:
        if parent_key:
            payload, error, status = build_hierarchy(
                base_url, pat, parent_key, date_filter, exclude_done=True
            )
            if error:
                result["errors"].append(f"Hierarchy API xətası: {status}")
            else:
                result["istiqametler"] = payload.get("istiqametler", [])

        if result["istiqametler"]:
            result["statistics"] = compute_hierarchy_stats(result["istiqametler"])

        return jsonify(result), 200

    except Exception as e:
        result["errors"].append(str(e))
        return jsonify(result), 500


@api.route('/api/jira/plan/hierarchy', methods=['POST', 'OPTIONS'])
def get_plan_hierarchy():
    if request.method == 'OPTIONS':
        return options_ok()

    data = request_json()
    base_url, pat = resolve_credentials(data)
    plan_id = data.get('planId')
    parent_issue_type = data.get('parentIssueType', 'Epic')

    if not all([base_url, pat, plan_id]):
        return jsonify({"error": "Əksik məlumat"}), 400

    try:
        res = fetch_plan_issues(base_url, pat, plan_id)

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


@api.route('/api/validate/date-filter', methods=['POST', 'OPTIONS'])
def validate_date_filter():
    if request.method == 'OPTIONS':
        return options_ok()

    data = request_json()
    base_url, pat = resolve_credentials(data)
    parent_key = data.get('parentKey')

    jql_open = f'parent = {parent_key} AND statusCategory != Done'
    jql_done = f'parent = {parent_key} AND statusCategory = Done'

    results = {"open": 0, "done": 0, "total": 0}

    try:
        for key, jql in [("open", jql_open), ("done", jql_done)]:
            res = count_jql(base_url, pat, jql)
            if res.status_code == 200:
                results[key] = res.json().get('total', 0)

        results["total"] = results["open"] + results["done"]

        return jsonify({
            "validation": results,
            "recommendations": generate_recommendations(results)
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DIAG_UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads', 'diaqnostika')
DIAG_INDEX_PATH = os.path.join(BASE_DIR, 'data', 'diag_uploads.json')
DIAG_ALLOWED_EXT = {'.xlsx', '.xlsm', '.csv'}


def diag_index():
    if not os.path.isfile(DIAG_INDEX_PATH):
        return {'files': []}
    try:
        with open(DIAG_INDEX_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if isinstance(data, dict) and isinstance(data.get('files'), list):
            return data
    except (OSError, json.JSONDecodeError):
        pass
    return {'files': []}


def save_diag_index(data):
    os.makedirs(os.path.dirname(DIAG_INDEX_PATH), exist_ok=True)
    with open(DIAG_INDEX_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def live_orgs(item):
    stored = item.get('stored')
    path = os.path.join(DIAG_UPLOAD_DIR, stored) if stored else ''
    if path and os.path.isfile(path):
        try:
            parsed = parse_diag_excel(path, item.get('name'))
            orgs = parsed.get('orgs') or []
            if orgs:
                return orgs
        except Exception:
            pass
    return item.get('orgs') or []


def flatten_diag_orgs(index):
    orgs = []
    for item in index.get('files') or []:
        for org in live_orgs(item):
            row = dict(org)
            row['fileId'] = item.get('id')
            row['fileName'] = item.get('name')
            row['uploadedAt'] = item.get('uploadedAt')
            orgs.append(row)
    return orgs


@api.route('/api/diaqnostika/uploads', methods=['GET', 'OPTIONS'])
def list_diag_uploads():
    if request.method == 'OPTIONS':
        return options_ok()
    index = diag_index()
    if not is_admin_session():
        return jsonify({
            'admin': False,
            'files': [],
            'orgs': public_orgs(index)
        }), 200
    return jsonify({
        'admin': True,
        'files': [{
            'id': f.get('id'),
            'name': f.get('name'),
            'uploadedAt': f.get('uploadedAt'),
            'orgCount': len(live_orgs(f))
        } for f in index.get('files') or []],
        'orgs': flatten_diag_orgs(index)
    }), 200


@api.route('/api/diaqnostika/upload', methods=['POST', 'OPTIONS'])
@admin_required
def upload_diag_excel():

    incoming = request.files.getlist('file') or []
    if not incoming:
        one = request.files.get('file')
        if one:
            incoming = [one]
    incoming = [f for f in incoming if f and f.filename]
    if not incoming:
        return jsonify({'error': 'Excel faylı seçin (.xlsx)'}), 400

    os.makedirs(DIAG_UPLOAD_DIR, exist_ok=True)
    index = diag_index()
    saved = []
    errors = []

    for fh in incoming:
        ext = os.path.splitext(fh.filename or '')[1].lower()
        if ext not in DIAG_ALLOWED_EXT:
            errors.append(fh.filename + ': yalnız .xlsx / .xlsm / .csv qəbul olunur')
            continue
        file_id = uuid.uuid4().hex
        safe = secure_filename(fh.filename) or ('diaqnostika' + ext)
        stored = file_id + '_' + safe
        path = os.path.join(DIAG_UPLOAD_DIR, stored)
        fh.save(path)
        try:
            parsed = parse_diag_excel(path, fh.filename)
        except Exception as e:
            try:
                os.remove(path)
            except OSError:
                pass
            errors.append((fh.filename or 'fayl') + ': ' + str(e))
            continue
        orgs = parsed.get('orgs') or []
        if not orgs:
            try:
                os.remove(path)
            except OSError:
                pass
            msg = (parsed.get('warnings') or ['Excel-də diaqnostika cədvəli tapılmadı.'])[0]
            errors.append((fh.filename or 'fayl') + ': ' + msg)
            continue
        rec = {
            'id': file_id,
            'name': fh.filename,
            'stored': stored,
            'uploadedAt': datetime.now(timezone.utc).isoformat(),
            'orgs': orgs,
            'warnings': parsed.get('warnings') or []
        }
        index['files'].insert(0, rec)
        saved.append({
            'id': file_id,
            'name': fh.filename,
            'orgCount': len(orgs),
            'orgs': orgs,
            'warnings': rec['warnings']
        })

    save_diag_index(index)
    if not saved:
        return jsonify({'error': errors[0] if errors else 'Fayl oxunmadı', 'errors': errors}), 400
    return jsonify({
        'files': saved,
        'orgs': flatten_diag_orgs(index),
        'errors': errors
    }), 200


@api.route('/api/diaqnostika/uploads/<file_id>', methods=['DELETE', 'OPTIONS'])
@admin_required
def delete_diag_upload(file_id):
    index = diag_index()
    keep = []
    removed = None
    for item in index.get('files') or []:
        if item.get('id') == file_id:
            removed = item
        else:
            keep.append(item)
    if not removed:
        return jsonify({'error': 'Fayl tapılmadı'}), 404
    index['files'] = keep
    save_diag_index(index)
    stored = removed.get('stored')
    if stored:
        path = os.path.join(DIAG_UPLOAD_DIR, stored)
        try:
            os.remove(path)
        except OSError:
            pass
    return jsonify({'ok': True, 'orgs': flatten_diag_orgs(index)}), 200


REPORT_UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads', 'hesabat')
REPORT_INDEX_PATH = os.path.join(BASE_DIR, 'data', 'report_uploads.json')
REPORT_ALLOWED_EXT = {'.pptx', '.pptm'}


def report_index():
    if not os.path.isfile(REPORT_INDEX_PATH):
        return {'files': []}
    try:
        with open(REPORT_INDEX_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if isinstance(data, dict) and isinstance(data.get('files'), list):
            return data
    except (OSError, json.JSONDecodeError):
        pass
    return {'files': []}


def save_report_index(data):
    os.makedirs(os.path.dirname(REPORT_INDEX_PATH), exist_ok=True)
    with open(REPORT_INDEX_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def live_report(item):
    stored = item.get('stored')
    path = os.path.join(REPORT_UPLOAD_DIR, stored) if stored else ''
    if path and os.path.isfile(path):
        try:
            parsed = parse_report_pptx(path, item.get('name'))
            report = parsed.get('report')
            if report:
                return report
        except Exception:
            pass
    return item.get('report') or None


def public_report_row(item):
    report = live_report(item) or {}
    return {
        'id': item.get('id'),
        'name': item.get('name'),
        'uploadedAt': item.get('uploadedAt'),
        'org': report.get('org') or '',
        'year': report.get('year'),
        'slideCount': report.get('slideCount'),
        'overall': report.get('overall'),
        'inferred': bool(report.get('inferred')),
        'maturity': report.get('maturity'),
        'dirs': report.get('dirs') or {},
        'targets': report.get('targets') or {},
        'summary': report.get('summary') or '',
        'findings': report.get('findings') or [],
        'strengths': report.get('strengths') or [],
        'actions': report.get('actions') or [],
        'themes': report.get('themes') or [],
        'slides': report.get('slides') or [],
    }


def flatten_reports(index):
    return [public_report_row(item) for item in (index.get('files') or [])]


@api.route('/api/hesabat/uploads', methods=['GET', 'OPTIONS'])
def list_report_uploads():
    if request.method == 'OPTIONS':
        return options_ok()
    index = report_index()
    reports = flatten_reports(index)
    if not is_admin_session():
        return jsonify({'admin': False, 'files': [], 'reports': reports}), 200
    return jsonify({
        'admin': True,
        'files': [{
            'id': f.get('id'),
            'name': f.get('name'),
            'uploadedAt': f.get('uploadedAt'),
            'org': (f.get('report') or {}).get('org') or '',
        } for f in index.get('files') or []],
        'reports': reports
    }), 200


@api.route('/api/hesabat/upload', methods=['POST', 'OPTIONS'])
@admin_required
def upload_report_pptx():
    incoming = request.files.getlist('file') or []
    if not incoming:
        one = request.files.get('file')
        if one:
            incoming = [one]
    incoming = [f for f in incoming if f and f.filename]
    if not incoming:
        return jsonify({'error': 'PPTX faylı seçin'}), 400

    os.makedirs(REPORT_UPLOAD_DIR, exist_ok=True)
    index = report_index()
    saved = []
    errors = []

    for fh in incoming:
        ext = os.path.splitext(fh.filename or '')[1].lower()
        if ext not in REPORT_ALLOWED_EXT:
            errors.append((fh.filename or 'fayl') + ': yalnız .pptx / .pptm qəbul olunur')
            continue
        file_id = uuid.uuid4().hex
        safe = secure_filename(fh.filename) or ('hesabat' + ext)
        stored = file_id + '_' + safe
        path = os.path.join(REPORT_UPLOAD_DIR, stored)
        fh.save(path)
        try:
            parsed = parse_report_pptx(path, fh.filename)
        except Exception as e:
            try:
                os.remove(path)
            except OSError:
                pass
            errors.append((fh.filename or 'fayl') + ': ' + str(e))
            continue
        report = parsed.get('report')
        if not report:
            try:
                os.remove(path)
            except OSError:
                pass
            msg = (parsed.get('warnings') or ['Təqdimatda təhlil olunacaq mətn tapılmadı.'])[0]
            errors.append((fh.filename or 'fayl') + ': ' + msg)
            continue
        rec = {
            'id': file_id,
            'name': fh.filename,
            'stored': stored,
            'uploadedAt': datetime.now(timezone.utc).isoformat(),
            'report': report,
            'warnings': parsed.get('warnings') or []
        }
        index['files'].insert(0, rec)
        saved.append({
            'id': file_id,
            'name': fh.filename,
            'org': report.get('org') or '',
            'report': report,
            'warnings': rec['warnings']
        })

    save_report_index(index)
    if not saved:
        return jsonify({'error': errors[0] if errors else 'Fayl oxunmadı', 'errors': errors}), 400
    return jsonify({
        'files': saved,
        'reports': flatten_reports(index),
        'errors': errors
    }), 200


@api.route('/api/hesabat/uploads/<file_id>', methods=['DELETE', 'OPTIONS'])
@admin_required
def delete_report_upload(file_id):
    index = report_index()
    keep = []
    removed = None
    for item in index.get('files') or []:
        if item.get('id') == file_id:
            removed = item
        else:
            keep.append(item)
    if not removed:
        return jsonify({'error': 'Fayl tapılmadı'}), 404
    index['files'] = keep
    save_report_index(index)
    stored = removed.get('stored')
    if stored:
        path = os.path.join(REPORT_UPLOAD_DIR, stored)
        try:
            os.remove(path)
        except OSError:
            pass
    return jsonify({'ok': True, 'reports': flatten_reports(index)}), 200

