# Jira bağlantısı — PAT-i buraya yazın. Token brauzerə göndərilmir.
JIRA_BASE_URL = 'https://jira.idda.az'
JIRA_PAT = ''
JIRA_PROJECT_KEY = 'DGD'

SEARCH_FIELDS = (
    "summary,status,duedate,customfield_10807,customfield_10808,"
    "customfield_15611,customfield_15612,customfield_15613,customfield_15614,"
    "customfield_15615,customfield_15616,customfield_15617,customfield_15618,"
    "customfield_15619,customfield_15620,components,assignee,reporter,updated,"
    "created,priority,labels,customfield_10101,customfield_10107,customfield_10008,"
    "customfield_10015,customfield_10016,customfield_12703,customfield_13608,"
    "issuetype,subtasks,parent,issuelinks"
)

HIERARCHY_FIELDS = (
    "summary,status,duedate,customfield_10807,customfield_10808,components,"
    "assignee,reporter,updated,created,priority,labels,customfield_10101,"
    "customfield_10107,customfield_10008,customfield_10015,customfield_10016,"
    "customfield_12703,customfield_13608,issuetype,subtasks,parent,issuelinks"
)

DATETIME_FIELDS = ['created', 'updated', 'customfield_10015', 'customfield_10016']

REQUEST_TIMEOUT = 60
COUNT_TIMEOUT = 30
MAX_RESULTS = 500
