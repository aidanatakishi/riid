import os

# Jira URL/layihə. Token hər istifadəçinin öz hesabındadır (girişdə bir dəfə).


def _load_dotenv():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    if not os.path.isfile(path):
        return
    with open(path, encoding='utf-8') as handle:
        for raw in handle:
            line = raw.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def env_flag(name, default=False):
    raw = os.environ.get(name)
    if raw is None:
        return bool(default)
    return raw.strip().lower() in ('1', 'true', 'yes', 'on')


_load_dotenv()

# Köçürmə üçün qalıq. Canlı sorğular istifadəçinin öz tokeni ilə gedir.
_JIRA_PAT_FALLBACK = ''

APP_ENV = (os.environ.get('APP_ENV') or os.environ.get('FLASK_ENV') or '').strip().lower()
FLASK_DEBUG = env_flag('FLASK_DEBUG', False)


def is_production():
    if APP_ENV in ('development', 'dev', 'local'):
        return False
    return APP_ENV in ('production', 'prod')


if is_production():
    FLASK_DEBUG = False
    os.environ['FLASK_DEBUG'] = 'false'


JIRA_BASE_URL = os.environ.get('JIRA_BASE_URL', 'https://jira.idda.az').rstrip('/')
JIRA_PAT = os.environ.get('JIRA_PAT', _JIRA_PAT_FALLBACK)
JIRA_PROJECT_KEY = os.environ.get('JIRA_PROJECT_KEY', 'DGD')
SECRET_KEY = os.environ.get('SECRET_KEY') or ''
ADMIN_USERNAME = os.environ.get('ADMIN_USERNAME') or 'admin'
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD') or ''
DEPT_USERNAME = os.environ.get('DEPT_USERNAME') or ''
DEPT_PASSWORD = os.environ.get('DEPT_PASSWORD') or ''
DEPT_DISPLAY_NAME = os.environ.get('DEPT_DISPLAY_NAME') or 'Qiymətləndirmə və komplayens şöbəsi'
USER_USERNAME = os.environ.get('USER_USERNAME') or 'user'
USER_PASSWORD = os.environ.get('USER_PASSWORD') or ''
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY') or ''
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY') or ''
SESSION_COOKIE_SECURE = env_flag('SESSION_COOKIE_SECURE', False)
TRUST_PROXY = env_flag('TRUST_PROXY', is_production())
CORS_ORIGINS = tuple(
    origin.strip().rstrip('/')
    for origin in (os.environ.get('CORS_ORIGINS') or '').split(',')
    if origin.strip()
)

SEARCH_FIELDS = (
    "summary,status,duedate,description,customfield_10807,customfield_10808,"
    "customfield_15611,customfield_15612,customfield_15613,customfield_15614,"
    "customfield_15615,customfield_15616,customfield_15617,customfield_15618,"
    "customfield_15619,customfield_15620,components,assignee,reporter,updated,"
    "created,resolutiondate,priority,labels,customfield_10101,customfield_10107,customfield_10008,"
    "customfield_10015,customfield_10016,customfield_12703,customfield_13608,customfield_12424,"
    "customfield_17315,customfield_17316,customfield_17317,customfield_17318,"
    "customfield_17319,customfield_17320,customfield_17435,"
    "issuetype,subtasks,parent,issuelinks"
)

HIERARCHY_FIELDS = (
    "summary,status,duedate,description,customfield_10807,customfield_10808,components,"
    "assignee,reporter,updated,created,priority,labels,customfield_10101,"
    "customfield_10107,customfield_10008,customfield_10015,customfield_10016,"
    "customfield_12703,customfield_13608,customfield_12424,"
    "customfield_17315,customfield_17316,customfield_17317,customfield_17318,"
    "customfield_17319,customfield_17320,customfield_17435,"
    "issuetype,subtasks,parent,issuelinks"
)

DATETIME_FIELDS = ['created', 'updated', 'customfield_10015', 'customfield_10016']

REQUEST_TIMEOUT = 60
COUNT_TIMEOUT = 30
MAX_RESULTS = 500
