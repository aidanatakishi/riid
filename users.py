import json
import os
import re
import threading
import uuid
from datetime import datetime, timezone

from werkzeug.security import check_password_hash, generate_password_hash

from config import is_production

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
USERS_PATH = os.path.join(BASE_DIR, 'data', 'users.json')
SECRETS_PATH = os.path.join(BASE_DIR, 'data', 'secrets.json')

WEAK_PASSWORDS = frozenset(('admin123', 'user123', 'password', '123456', 'admin', 'user'))

_lock = threading.Lock()


def _now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _empty_store():
    return {'users': []}


def _empty_secrets():
    return {}


def _read_json(path, fallback):
    if not os.path.isfile(path):
        return fallback()
    try:
        with open(path, encoding='utf-8') as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return fallback()
    return data if isinstance(data, dict) else fallback()


def _write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def _sanitize_store(store):
    clean = dict(store or {})
    clean.pop('jira_pat', None)
    users = []
    for user in clean.get('users') or []:
        if not isinstance(user, dict):
            continue
        row = dict(user)
        row.pop('jira_pat', None)
        users.append(row)
    clean['users'] = users
    return clean


def load_store():
    data = _read_json(USERS_PATH, _empty_store)
    if not isinstance(data.get('users'), list):
        return _empty_store()
    return data


def save_store(store):
    _write_json(USERS_PATH, _sanitize_store(store))


def load_secrets():
    data = _read_json(SECRETS_PATH, _empty_secrets)
    return data if isinstance(data, dict) else _empty_secrets()


def save_secrets(secrets):
    data = dict(secrets or {})
    if not str(data.get('jira_pat') or '').strip():
        data.pop('jira_pat', None)
    pats = {
        str(uid): str(token).strip()
        for uid, token in (data.get('user_pats') or {}).items()
        if str(uid or '').strip() and str(token or '').strip()
    }
    if pats:
        data['user_pats'] = pats
    else:
        data.pop('user_pats', None)
    if data:
        _write_json(SECRETS_PATH, data)
        return
    try:
        os.remove(SECRETS_PATH)
    except OSError:
        pass


def _set_user_secret_pat(user_id, token):
    uid = str(user_id or '').strip()
    if not uid:
        return
    secrets = load_secrets()
    pats = dict(secrets.get('user_pats') or {})
    value = str(token or '').strip()
    if value:
        pats[uid] = value
    else:
        pats.pop(uid, None)
    secrets['user_pats'] = pats
    save_secrets(secrets)


def migrate_secrets():
    with _lock:
        store = load_store()
        secrets = load_secrets()
        store_changed = False
        secrets_changed = False
        shared = str(store.get('jira_pat') or '').strip()
        if shared and not str(secrets.get('jira_pat') or '').strip():
            secrets['jira_pat'] = shared
            secrets_changed = True
        if 'jira_pat' in store:
            store.pop('jira_pat', None)
            store_changed = True
        pats = dict(secrets.get('user_pats') or {})
        for user in store.get('users') or []:
            if not isinstance(user, dict):
                continue
            uid = str(user.get('id') or '').strip()
            own = str(user.get('jira_pat') or '').strip()
            if uid and own and not str(pats.get(uid) or '').strip():
                pats[uid] = own
                secrets_changed = True
            if 'jira_pat' in user:
                user.pop('jira_pat', None)
                store_changed = True
        if pats != dict(secrets.get('user_pats') or {}):
            secrets['user_pats'] = pats
            secrets_changed = True
        if secrets_changed:
            save_secrets(secrets)
        if store_changed:
            save_store(store)


def list_users():
    return list(load_store().get('users') or [])


def get_shared_jira_pat():
    return str(load_secrets().get('jira_pat') or '').strip()


def set_shared_jira_pat(token):
    with _lock:
        secrets = load_secrets()
        value = str(token or '').strip()
        if value:
            secrets['jira_pat'] = value
        else:
            secrets.pop('jira_pat', None)
        save_secrets(secrets)
        store = load_store()
        if 'jira_pat' in store:
            store.pop('jira_pat', None)
            save_store(store)
        return bool(value)


def user_jira_pat(user):
    if not user:
        return ''
    uid = str(user.get('id') or '').strip()
    pats = load_secrets().get('user_pats') or {}
    if uid and str(pats.get(uid) or '').strip():
        return str(pats.get(uid) or '').strip()
    return str(user.get('jira_pat') or '').strip()


def save_user_jira_pat(user_id, token):
    with _lock:
        _set_user_secret_pat(user_id, token)
    return bool(str(token or '').strip())


def effective_jira_pat(user=None):
    return user_jira_pat(user)


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
PRIVILEGED_ROLES = ('admin', 'superadmin')
ROLE_LABELS = {
    'superadmin': 'Superadmin',
    'admin': 'Admin',
    'user': 'İstifadəçi',
}


def normalize_role(raw, allow_superadmin=False):
    n = str(raw or '').strip().lower()
    if n == 'superadmin' and allow_superadmin:
        return 'superadmin'
    if n == 'admin':
        return 'admin'
    return 'user'


def can_manage_users(user):
    return (user or {}).get('role') in PRIVILEGED_ROLES


def can_manage_tech(user):
    return (user or {}).get('role') == 'superadmin'


def ensure_superadmin():
    with _lock:
        store = load_store()
        users = store.get('users') or []
        if any(str(u.get('role') or '') == 'superadmin' for u in users):
            return
        admins = [u for u in users if str(u.get('role') or '') == 'admin']
        if not admins:
            return
        admins.sort(key=lambda u: str(u.get('created_at') or ''))
        admins[0]['role'] = 'superadmin'
        save_store(store)


def sync_display_names():
    with _lock:
        store = load_store()
        changed = False
        for user in store.get('users') or []:
            jira = str(user.get('jira_display_name') or '').strip()
            display = str(user.get('display_name') or '').strip()
            uname = str(user.get('username') or '').strip()
            if jira and (not display or display == uname):
                user['display_name'] = jira
                changed = True
        if changed:
            save_store(store)


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


def fold_latin(text):
    n = str(text or '').strip().lower().replace('i̇', 'i')
    for src, dst in (
        ('ı', 'i'), ('ə', 'e'), ('ö', 'o'), ('ü', 'u'),
        ('ğ', 'g'), ('ş', 's'), ('ç', 'c'),
    ):
        n = n.replace(src, dst)
    return n


def first_name(name):
    parts = str(name or '').strip().split()
    return parts[0] if parts else ''


def username_from_display_name(name):
    folded = fold_latin(name)
    parts = [chunk for chunk in re.split(r'[^a-z0-9]+', folded) if chunk]
    if not parts:
        return ''
    base = '.'.join(parts)[:32]
    if len(base) < 3:
        base = (base + 'user')[:8]
    return base


def unique_username(desired, users=None, exclude_id=None):
    base = normalize_username(desired) or 'user'
    if len(base) < 3:
        base = (base + 'user')[:8]
    rows = users if users is not None else list_users()
    taken = {
        normalize_username(u.get('username'))
        for u in rows
        if not exclude_id or str(u.get('id')) != str(exclude_id)
    }
    if base not in taken:
        return base
    i = 2
    while True:
        candidate = (base[:28] + str(i))[:32]
        if candidate not in taken:
            return candidate
        i += 1


def fold_login(text):
    return re.sub(r'\s+', ' ', fold_latin(text))


def login_identity_keys(user):
    keys = set()
    uname = normalize_username(user.get('username'))
    if uname:
        keys.add(uname)
        keys.add(fold_login(uname.replace('.', ' ').replace('_', ' ')))
        keys.add(uname.replace('.', '').replace('_', ''))
        head = re.split(r'[._]', uname)[0]
        if len(head) >= 3:
            keys.add(head)
    for raw in (user.get('display_name'), user.get('jira_display_name')):
        folded = fold_login(raw)
        if not folded:
            continue
        keys.add(folded)
        keys.add(folded.replace(' ', ''))
        fn = first_name(folded)
        if len(fn) >= 3:
            keys.add(fn)
    return {key for key in keys if key and len(key) >= 3}


def find_login_candidates(username):
    raw = str(username or '').strip()
    if len(raw) < 3:
        return []
    needles = {
        normalize_username(raw),
        fold_login(raw),
        fold_login(raw).replace(' ', ''),
    }
    needles.discard('')
    hits = []
    seen = set()
    for user in list_users():
        uid = str(user.get('id') or '')
        if needles & login_identity_keys(user) and uid not in seen:
            seen.add(uid)
            hits.append(user)
    return hits


def find_user_by_display_name(name):
    hits = find_login_candidates(name)
    if len(hits) == 1:
        return hits[0]
    return None


def component_matches_team(raw, team_id):
    n = fold_latin(raw).replace(' ', '').replace('-', '').replace('_', '')
    team = normalize_team(team_id)
    if team == 'komplayns':
        return any(token in n for token in ('komplayn', 'komplanys', 'komplain', 'compliance', 'komplan'))
    if team == 'koordinasiya':
        return 'koordinasiya' in n or 'koordinasiy' in n
    if team == 'servis-dizayn':
        return 'servisdizayn' in n
    return False


def jira_id_taken(account_id, users, exclude_id=None):
    key = str(account_id or '').strip()
    if not key:
        return False
    for user in users:
        if exclude_id and str(user.get('id')) == str(exclude_id):
            continue
        if str(user.get('jira_account_id') or '').strip() == key:
            return True
    return False


ACCESS_LABELS = (
    ('panel', 'Panel'),
    ('diag', 'Diaqnostika'),
    ('users', 'İstifadəçilər'),
    ('tech', 'Texniki ayarlar'),
)


def user_accesses(user):
    manage = can_manage_users(user)
    tech = can_manage_tech(user)
    flags = {
        'panel': True,
        'diag': True,
        'users': manage,
        'tech': tech,
    }
    return [
        {'id': key, 'label': label, 'on': bool(flags.get(key))}
        for key, label in ACCESS_LABELS
    ]


def public_user(user):
    if not user:
        return None
    team = normalize_team(user.get('team'))
    display = user.get('display_name') or user.get('username')
    jira_name = (user.get('jira_display_name') or '').strip()
    return {
        'id': user.get('id'),
        'username': user.get('username'),
        'displayName': display,
        'firstName': first_name(jira_name or display),
        'role': user.get('role') or 'user',
        'roleLabel': ROLE_LABELS.get(user.get('role') or 'user') or 'İstifadəçi',
        'projectKey': normalize_project_key(user.get('project_key')) or 'DGD',
        'team': team,
        'teamLabel': TEAM_LABELS.get(team) or TEAM_LABELS['komplayns'],
        'jiraAccountId': (user.get('jira_account_id') or '').strip(),
        'jiraDisplayName': jira_name,
        'hasPat': bool(user_jira_pat(user)),
        'canManageUsers': can_manage_users(user),
        'canManageTech': can_manage_tech(user),
        'accesses': user_accesses(user)
    }


def admin_count(users=None):
    rows = users if users is not None else list_users()
    return sum(1 for user in rows if user.get('role') in PRIVILEGED_ROLES)


def create_user(username, password, display_name='', role='user', project_key='DGD', team='komplayns', jira_account_id='', jira_display_name='', jira_pat='', allow_superadmin=False):
    name = normalize_username(username)
    if not name:
        return None, 'İstifadəçi adı boş ola bilməz'
    if len(name) < 3:
        return None, 'İstifadəçi adı ən azı 3 simvol olmalıdır'
    pwd = str(password or '').strip()
    if len(pwd) < 6:
        return None, 'Parol ən azı 6 simvol olmalıdır'
    role_name = normalize_role(role, allow_superadmin=allow_superadmin)
    project = normalize_project_key(project_key) or 'DGD'
    team_id = normalize_team(team)
    jira_id = str(jira_account_id or '').strip()
    jira_name = str(jira_display_name or '').strip()
    with _lock:
        store = load_store()
        users = store['users']
        if any(normalize_username(u.get('username')) == name for u in users):
            return None, 'Bu istifadəçi adı artıq var'
        if jira_id_taken(jira_id, users):
            return None, 'Bu Jira şəxsi artıq başqa hesaba bağlıdır'
        user = {
            'id': str(uuid.uuid4()),
            'username': name,
            'display_name': (jira_name or display_name or name).strip(),
            'password_hash': generate_password_hash(pwd),
            'role': role_name,
            'project_key': project,
            'team': team_id,
            'created_at': _now()
        }
        if jira_id:
            user['jira_account_id'] = jira_id
            user['jira_display_name'] = jira_name or user['display_name']
        users.append(user)
        save_store(store)
        own_pat = str(jira_pat or '').strip()
        if own_pat:
            _set_user_secret_pat(user.get('id'), own_pat)
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
            if target.get('role') == 'superadmin':
                pass
            else:
                new_role = normalize_role(fields['role'])
                if target.get('role') in PRIVILEGED_ROLES and new_role == 'user' and admin_count(users) <= 1:
                    return None, 'Son admin hesabını adi istifadəçiyə çevirmək olmaz'
                target['role'] = new_role
        if 'project_key' in fields and fields['project_key'] is not None:
            target['project_key'] = normalize_project_key(fields['project_key']) or target.get('project_key') or 'DGD'
        if 'team' in fields and fields['team'] is not None:
            target['team'] = normalize_team(fields['team'])
        if 'jira_account_id' in fields:
            jira_id = str(fields.get('jira_account_id') or '').strip()
            jira_name = str(fields.get('jira_display_name') or '').strip()
            if not jira_id:
                target.pop('jira_account_id', None)
                target.pop('jira_display_name', None)
            elif jira_id_taken(jira_id, users, target.get('id')):
                return None, 'Bu Jira şəxsi artıq başqa hesaba bağlıdır'
            else:
                target['jira_account_id'] = jira_id
                if jira_name:
                    target['jira_display_name'] = jira_name
        if 'jira_pat' in fields and fields['jira_pat'] is not None:
            token = str(fields.get('jira_pat') or '').strip()
            if token:
                _set_user_secret_pat(target.get('id'), token)
            target.pop('jira_pat', None)
        if fields.get('clear_pat'):
            target.pop('jira_pat', None)
            _set_user_secret_pat(target.get('id'), '')
        if fields.get('password'):
            pwd = str(fields.get('password') or '').strip()
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
        if target.get('role') == 'superadmin':
            return False, 'Superadmin hesabını silmək olmaz'
        if target.get('role') in PRIVILEGED_ROLES and admin_count(users) <= 1:
            return False, 'Son admin hesabını silmək olmaz'
        store['users'] = [user for user in users if user is not target]
        save_store(store)
        _set_user_secret_pat(target.get('id'), '')
        return True, None


def _is_strong_password(password):
    pwd = str(password or '').strip()
    return len(pwd) >= 8 and pwd.lower() not in WEAK_PASSWORDS


def verify_login(username, password):
    pwd = str(password or '').strip()
    if not pwd:
        return None
    matched = [
        user for user in find_login_candidates(username)
        if check_password_hash(user.get('password_hash') or '', pwd)
    ]
    if len(matched) == 1:
        return matched[0]
    return None


def _validate_new_password(new_password, confirm_password, current_password=None):
    pwd = str(new_password or '').strip()
    confirm = str(confirm_password or '').strip()
    if len(pwd) < 6:
        return None, 'Parol ən azı 6 simvol olmalıdır'
    if pwd != confirm:
        return None, 'Yeni parollar eyni deyil'
    if current_password is not None and pwd == str(current_password or '').strip():
        return None, 'Yeni parol köhnə paroldan fərqli olmalıdır'
    return pwd, None


def change_password_with_current(username, current_password, new_password, confirm_password, user_id=None):
    current = str(current_password or '').strip()
    if not current:
        return None, 'Cari parol lazımdır'
    pwd, err = _validate_new_password(new_password, confirm_password, current)
    if err:
        return None, err
    if user_id:
        target = find_user_by_id(user_id)
        if not target:
            return None, 'İstifadəçi tapılmadı'
        if not check_password_hash(target.get('password_hash') or '', current):
            return None, 'Cari parol səhvdir'
        return update_user(target.get('id'), password=pwd)
    target = verify_login(username, current)
    if not target:
        hits = find_login_candidates(username)
        if len(hits) > 1:
            return None, 'Bu ad bir neçə hesaba uyğun gəlir. Tam istifadəçi adını yazın.'
        return None, 'İstifadəçi adı və ya cari parol səhvdir'
    return update_user(target.get('id'), password=pwd)


def reset_password_with_admin(target_username, new_password, confirm_password, admin_username, admin_password):
    pwd, err = _validate_new_password(new_password, confirm_password)
    if err:
        return None, err
    admin = verify_login(admin_username, admin_password)
    if not admin or not can_manage_users(admin):
        return None, 'Admin adı və ya parolu səhvdir'
    hits = find_login_candidates(target_username)
    if not hits:
        return None, 'İstifadəçi tapılmadı'
    if len(hits) > 1:
        return None, 'Bu ad bir neçə hesaba uyğun gəlir. Tam istifadəçi adını yazın.'
    target = hits[0]
    if target.get('role') == 'superadmin' and admin.get('role') != 'superadmin':
        return None, 'Superadmin parolunu yalnız superadmin yeniləyə bilər'
    return update_user(target.get('id'), password=pwd)


def bootstrap_users(
    admin_username,
    admin_password,
    dept_username='',
    dept_password='',
    dept_display='',
    home_project='DGD',
    user_username='',
    user_password='',
):
    migrate_secrets()
    if has_users():
        return
    project = normalize_project_key(home_project) or 'DGD'
    admin_name = normalize_username(admin_username) or 'admin'
    admin_pwd = str(admin_password or '').strip()
    user_name = normalize_username(user_username)
    user_pwd = str(user_password or '').strip()
    dept_name = normalize_username(dept_username)
    dept_pwd = str(dept_password or '').strip()

    if is_production():
        if not _is_strong_password(admin_pwd):
            raise SystemExit(
                'Production: hesab yoxdur. .env-də ADMIN_PASSWORD yazın (ən azı 8 simvol, asan parol olmasın) və yenidən başladın.'
            )
        create_user(admin_name, admin_pwd, 'Admin', 'superadmin', project, allow_superadmin=True)
        if user_name and _is_strong_password(user_pwd):
            create_user(user_name, user_pwd, 'İstifadəçi', 'user', project)
        if dept_name and _is_strong_password(dept_pwd):
            create_user(
                dept_name,
                dept_pwd,
                dept_display or 'Qiymətləndirmə və komplayens şöbəsi',
                'user',
                project,
            )
        return

    if not admin_pwd:
        admin_pwd = 'admin123'
    create_user(admin_name, admin_pwd, 'Admin', 'superadmin', project, allow_superadmin=True)
    if user_name:
        create_user(user_name, user_pwd or 'user123', 'İstifadəçi', 'user', project)
    if dept_name and dept_pwd:
        create_user(
            dept_name,
            dept_pwd,
            dept_display or 'Qiymətləndirmə və komplayens şöbəsi',
            'user',
            project,
        )
    print('Lokal ilk hesablar: %s / %s' % (admin_name, admin_pwd))
    if user_name:
        print('Lokal istifadəçi: %s / %s' % (user_name, user_pwd or 'user123'))
