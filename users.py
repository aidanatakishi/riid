import json
import os
import threading
import uuid
from datetime import datetime, timezone

from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
USERS_PATH = os.path.join(BASE_DIR, 'data', 'users.json')

_lock = threading.Lock()


def _now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _empty_store():
    return {'users': []}


def load_store():
    if not os.path.isfile(USERS_PATH):
        return _empty_store()
    try:
        with open(USERS_PATH, encoding='utf-8') as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return _empty_store()
    if not isinstance(data, dict) or not isinstance(data.get('users'), list):
        return _empty_store()
    return data


def save_store(store):
    os.makedirs(os.path.dirname(USERS_PATH), exist_ok=True)
    tmp = USERS_PATH + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as handle:
        json.dump(store, handle, ensure_ascii=False, indent=2)
    os.replace(tmp, USERS_PATH)


def list_users():
    return list(load_store().get('users') or [])


def has_users():
    return len(list_users()) > 0


def find_user_by_id(user_id):
    uid = str(user_id or '')
    for user in list_users():
        if str(user.get('id') or '') == uid:
            return user
    return None


def find_user_by_username(username):
    key = normalize_username(username)
    if not key:
        return None
    for user in list_users():
        if normalize_username(user.get('username')) == key:
            return user
    return None


def normalize_username(username):
    return str(username or '').strip().lower()


def normalize_project_key(key):
    return str(key or '').strip().upper()


TEAM_IDS = ('komplayns', 'koordinasiya', 'servis-dizayn')
TEAM_LABELS = {
    'komplayns': 'Komplayns',
    'koordinasiya': 'Koordinasiya',
    'servis-dizayn': 'Servis dizayn',
}


def normalize_team(raw):
    n = str(raw or '').strip().lower().replace('i̇', 'i')
    for src, dst in (
        ('ı', 'i'), ('ə', 'e'), ('ö', 'o'), ('ü', 'u'),
        ('ğ', 'g'), ('ş', 's'), ('ç', 'c'), ('_', '-'), (' ', '-'),
    ):
        n = n.replace(src, dst)
    compact = n.replace('-', '')
    if n in TEAM_IDS:
        return n
    if 'servis' in compact and 'dizayn' in compact:
        return 'servis-dizayn'
    if 'koordin' in compact:
        return 'koordinasiya'
    if 'komplayn' in compact or 'komplan' in compact or 'complain' in compact or 'compliance' in compact:
        return 'komplayns'
    return 'komplayns'


def public_user(user):
    if not user:
        return None
    team = normalize_team(user.get('team'))
    return {
        'id': user.get('id'),
        'username': user.get('username'),
        'displayName': user.get('display_name') or user.get('username'),
        'role': user.get('role') or 'user',
        'projectKey': normalize_project_key(user.get('project_key')) or 'DGD',
        'team': team,
        'teamLabel': TEAM_LABELS.get(team) or TEAM_LABELS['komplayns'],
        'hasPat': bool(str(user.get('jira_pat') or '').strip())
    }


def admin_count(users=None):
    rows = users if users is not None else list_users()
    return sum(1 for user in rows if user.get('role') == 'admin')


def create_user(username, password, display_name='', role='user', project_key='DGD', team='komplayns'):
    name = normalize_username(username)
    if not name:
        return None, 'İstifadəçi adı boş ola bilməz'
    if len(name) < 3:
        return None, 'İstifadəçi adı ən azı 3 simvol olmalıdır'
    pwd = str(password or '')
    if len(pwd) < 6:
        return None, 'Parol ən azı 6 simvol olmalıdır'
    role_name = 'admin' if str(role or '').strip().lower() == 'admin' else 'user'
    project = normalize_project_key(project_key) or 'DGD'
    team_id = normalize_team(team)
    with _lock:
        store = load_store()
        users = store['users']
        if any(normalize_username(u.get('username')) == name for u in users):
            return None, 'Bu istifadəçi adı artıq var'
        user = {
            'id': str(uuid.uuid4()),
            'username': name,
            'display_name': (display_name or name).strip(),
            'password_hash': generate_password_hash(pwd),
            'role': role_name,
            'project_key': project,
            'team': team_id,
            'created_at': _now()
        }
        users.append(user)
        save_store(store)
        return user, None


def update_user(user_id, **fields):
    with _lock:
        store = load_store()
        users = store['users']
        target = None
        for user in users:
            if str(user.get('id') or '') == str(user_id or ''):
                target = user
                break
        if not target:
            return None, 'İstifadəçi tapılmadı'
        if 'username' in fields and fields['username'] is not None:
            name = normalize_username(fields['username'])
            if not name or len(name) < 3:
                return None, 'İstifadəçi adı ən azı 3 simvol olmalıdır'
            for user in users:
                if user is not target and normalize_username(user.get('username')) == name:
                    return None, 'Bu istifadəçi adı artıq var'
            target['username'] = name
        if 'display_name' in fields and fields['display_name'] is not None:
            target['display_name'] = str(fields['display_name'] or target.get('username')).strip()
        if 'role' in fields and fields['role'] is not None:
            new_role = 'admin' if str(fields['role']).strip().lower() == 'admin' else 'user'
            if target.get('role') == 'admin' and new_role != 'admin' and admin_count(users) <= 1:
                return None, 'Son admin hesabını adi istifadəçiyə çevirmək olmaz'
            target['role'] = new_role
        if 'project_key' in fields and fields['project_key'] is not None:
            target['project_key'] = normalize_project_key(fields['project_key']) or target.get('project_key') or 'DGD'
        if 'team' in fields and fields['team'] is not None:
            target['team'] = normalize_team(fields['team'])
        if 'jira_pat' in fields and fields['jira_pat'] is not None:
            token = str(fields.get('jira_pat') or '').strip()
            if token:
                target['jira_pat'] = token
        if fields.get('clear_pat'):
            target.pop('jira_pat', None)
        if fields.get('password'):
            pwd = str(fields.get('password') or '')
            if len(pwd) < 6:
                return None, 'Parol ən azı 6 simvol olmalıdır'
            target['password_hash'] = generate_password_hash(pwd)
        target['updated_at'] = _now()
        save_store(store)
        return target, None


def delete_user(user_id, actor_id=None):
    with _lock:
        store = load_store()
        users = store['users']
        target = None
        for user in users:
            if str(user.get('id') or '') == str(user_id or ''):
                target = user
                break
        if not target:
            return False, 'İstifadəçi tapılmadı'
        if actor_id and str(target.get('id')) == str(actor_id):
            return False, 'Öz hesabınızı silmək olmaz'
        if target.get('role') == 'admin' and admin_count(users) <= 1:
            return False, 'Son admin hesabını silmək olmaz'
        store['users'] = [user for user in users if user is not target]
        save_store(store)
        return True, None


def verify_login(username, password):
    user = find_user_by_username(username)
    if not user:
        return None
    if not check_password_hash(user.get('password_hash') or '', str(password or '')):
        return None
    return user


def bootstrap_users(admin_username, admin_password, dept_username='', dept_password='', dept_display='', home_project='DGD'):
    if has_users():
        return
    admin_name = normalize_username(admin_username) or 'admin'
    admin_pwd = str(admin_password or '')
    if admin_pwd:
        create_user(admin_name, admin_pwd, 'Admin', 'admin', home_project)
    dept_name = normalize_username(dept_username)
    dept_pwd = str(dept_password or '')
    if dept_name and dept_pwd:
        create_user(
            dept_name,
            dept_pwd,
            dept_display or 'Qiymətləndirmə və komplayens şöbəsi',
            'user',
            home_project
        )
