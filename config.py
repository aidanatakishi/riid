import os

# Jira URL/layihə. Token saytın Token düyməsindən daxil edilir; git-ə yazmayın.


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


_load_dotenv()

# Boş saxlayın — hər kəs öz tokenini brauzerdə yazır.
_JIRA_PAT_FALLBACK = ''

JIRA_BASE_URL = os.environ.get('JIRA_BASE_URL', 'https://jira.idda.az').rstrip('/')
JIRA_PAT = os.environ.get('JIRA_PAT', _JIRA_PAT_FALLBACK)
JIRA_PROJECT_KEY = os.environ.get('JIRA_PROJECT_KEY', 'DGD')

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
