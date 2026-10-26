"""Unit tests for snapshot chat tools."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from chat_tools import SnapshotTools, fold, fuzzy_person, number_check, normalize_snapshot, run_tool
from chat_kb import fuzzy_qurum, derive_aliases

SAMPLE = {
    'meta': {'user': 'Sabina Mammadova', 'today': '2026-10-22', 'sprint': 'Sprint 12', 'week': 'Sprint 12'},
    'overview': {
        'total': 100, 'done': 40, 'open': 60, 'late': 16, 'blocked': 3,
        'progress': 20, 'planned': 5, 'due': 12, 'dueDone': 4, 'rate': 33,
        'completionPct': 40,
    },
    'tasks': [
        # key|status|assignee|pri|due|dir|sprint|blocked|overdue|summary|qurum
        'DGD-100|İcradadır|Sabina Mammadova|High|2026-10-01|İnteqrasiya|Sprint 12|0|1|Miqrasiya inteqrasiya|Dövlət Miqrasiya Xidməti',
        'DGD-101|Bloklanıb|Sabina Mammadova|Highest||İnteqrasiya|Sprint 12|1|0|Blok iş|Dövlət Miqrasiya Xidməti',
        'DGD-102|Yekunlaşıb|Ali Vəliyev|Low||EXQ|Sprint 11|0|0|EXQ yekun|Dövlət Gömrük Komitəsi',
        'DGD-103|İcradadır|Ali Veliyev|Medium|2026-10-20|EXQ|Sprint 12|0|1|EXQ icra|Dövlət Gömrük Komitəsi',
        'DGD-104|Planlaşdırılıb|Nigar|Low||Diaqnostika|Sprint 12|0|0|Diaq plan|Əmək və Əhalinin Sosial Müdafiəsi Nazirliyi',
        'DGD-999|İcradadır|Orxan|High||Digər|Sprint 12|0|0|Digər|',
    ],
    'assessments': [
        'diag|Dövlət Miqrasiya Xidməti|77|2025|DGD-100',
        'diag|Dövlət Gömrük Komitəsi|88|2025|DGD-102',
    ],
}


def test_fold_az_latin():
    assert fold('Şəbnəm') == 'sebnem'
    assert fold('Sebnem') == 'sebnem'
    # ə → e (Az qatlama); latın «a» eyni deyil — fuzzy overlap ilə tutulur
    assert fold('Məmmədova') == 'memmedova'
    a, _ = fuzzy_person('mammadova', ['Sabina Məmmədova', 'Ali'])
    assert a == 'Sabina Məmmədova'


def test_fuzzy_sabina_variants():
    names = ['Sabina Mammadova', 'Ali Vəliyev', 'Nigar']
    a, _ = fuzzy_person('Sabina', names)
    b, _ = fuzzy_person('sabina mammadova', names)
    assert a == b == 'Sabina Mammadova'


def test_fuzzy_not_found():
    match, suggestions = fuzzy_person('XYZ Unknown', ['Ali', 'Nigar'])
    assert match is None
    assert isinstance(suggestions, list)


def test_get_overview_uses_panel_numbers():
    tools = SnapshotTools(SAMPLE)
    ov = tools.get_overview()['overview']
    assert ov['late'] == 16
    assert ov['blocked'] == 3
    assert ov['total'] == 100


def test_get_risks():
    tools = SnapshotTools(SAMPLE)
    risks = tools.get_risks()
    assert risks['lateCount'] == 16
    assert risks['blockedCount'] == 3
    assert len(risks['overdueTasks']) >= 1


def test_person_workload():
    tools = SnapshotTools(SAMPLE)
    a = tools.get_person_workload('Sabina')
    b = tools.get_person_workload('sabina mammadova')
    assert a.get('error') is None
    assert a['name'] == b['name']
    assert a['total'] == b['total'] == 2
    assert a['overdue'] >= 1


def test_person_not_found():
    tools = SnapshotTools(SAMPLE)
    r = tools.get_person_workload('Qeyri-mövcud Şəxs')
    assert r.get('error') == 'not_found'
    assert 'suggestions' in r


def test_search_limit_and_filters():
    tools = SnapshotTools(SAMPLE)
    r = tools.search_tasks(overdue=True, limit=1)
    assert r['limit'] == 1
    assert len(r['items']) <= 1
    assert r['count'] >= 1
    blocked = tools.search_tasks(blocked=True)
    assert blocked['count'] >= 1
    empty = tools.search_tasks(text='zzzz-no-match-zzzz')
    assert empty['count'] == 0
    assert empty['items'] == []


def test_get_task_found_and_missing():
    tools = SnapshotTools(SAMPLE)
    ok = tools.get_task('DGD-100')
    assert ok.get('task', {}).get('key') == 'DGD-100'
    miss = tools.get_task('DGD-0000')
    assert miss.get('error') == 'not_found'


def test_compare_sprints():
    tools = SnapshotTools(SAMPLE)
    cmp_ = tools.compare_sprints('Sprint 12', 'Sprint 11')
    assert cmp_['a']['name']
    assert cmp_['b']['total'] >= 1


def test_get_my_tasks():
    tools = SnapshotTools(SAMPLE)
    mine = tools.get_my_tasks()
    assert mine.get('count', 0) >= 1


def test_status_open_alias():
    """LLM tez-tez status=open göndərir — Az status adları ilə uyğunlaşmalıdır."""
    tools = SnapshotTools(SAMPLE)
    empty_strict = tools.search_tasks(assignee='Sabina Mammadova', status='zzzz-no')
    assert empty_strict['count'] == 0
    opened = tools.get_my_tasks(status='open')
    assert opened.get('count', 0) >= 2
    assert all(not (i.get('status') or '').lower().startswith('yekun') for i in opened.get('items') or [])


def test_normalize_dict_tasks():
    snap = normalize_snapshot({
        'tasks': [{'key': 'DGD-1', 'status': 'Open', 'assignee': 'A', 'blocked': True, 'overdue': False}],
        'overview': {},
        'meta': {},
    })
    assert snap['tasks'][0]['blocked'] is True


def test_number_check():
    assert number_check('Gecikən **16** iş var', [{'lateCount': 16}]) == 'ok'
    assert number_check('Gecikən **99** iş var', [{'lateCount': 16}]) == 'warn'
    assert number_check('Salam', []) == 'ok'


def test_kpi_direction():
    tools = SnapshotTools(SAMPLE)
    kpi = tools.get_kpi('İnteqrasiya')
    assert kpi['total'] == 2


def test_assessment_scores_top_qurum():
    snap = {
        'meta': {},
        'overview': {},
        'tasks': [],
        'assessments': [
            'diag|Qurum A|72.5|2025|DGD-1',
            'diag|Qurum B|91|2025|DGD-2',
            'diag|Qurum C|88|2024|DGD-3',
            'diag|Qurum B|85|2024|DGD-4',  # eyni qurum, köhnə — 91 qalmalıdır
            'exq|Qurum A|60|2025|DGD-5',
            'diag|Qurum D||2025|DGD-6',  # balsız — ignore
        ],
    }
    tools = SnapshotTools(snap)
    r = tools.get_assessment_scores(category='diag', sort='top', limit=3)
    assert r['withScore'] == 3
    assert r['highest']['qurum'] == 'Qurum B'
    assert r['highest']['score'] == 91
    assert r['top'][0]['qurum'] == 'Qurum B'
    assert r['avgScore'] is not None
    low = tools.get_assessment_scores(category='diag', sort='lowest', limit=1)
    assert low['top'][0]['qurum'] == 'Qurum A'


def test_fuzzy_qurum_miqrasiya_aliases():
    cands = ['Dövlət Miqrasiya Xidməti', 'Dövlət Gömrük Komitəsi']
    for q in ('Dövlət Miqrasiya Xidməti', 'Miqrasiya', 'dmx', 'miqrasiya xidmeti'):
        match, _ = fuzzy_qurum(q, cands)
        assert match == 'Dövlət Miqrasiya Xidməti', q


def test_derive_aliases_paren_and_short():
    als = derive_aliases('Tibbi Ərazi Bölmələrini İdarəetmə Birliyi (TƏBİB)')
    folded = {a.lower().replace('ə', 'e').replace('ı', 'i') for a in als}
    assert any('tabib' in a.replace('ə', 'e') or a.upper() == 'TƏBİB' for a in als)
    catalog = [{
        'name': 'Tibbi Ərazi Bölmələrini İdarəetmə Birliyi (TƏBİB)',
        'aliases': als,
    }]
    match, _ = fuzzy_qurum('TƏBİB', [], live_catalog=catalog)
    assert match and 'TƏBİB' in match.upper() or 'Birliyi' in (match or '')
    match2, _ = fuzzy_qurum('tabib', [catalog[0]['name']], live_catalog=catalog)
    assert match2 == catalog[0]['name']


def test_get_qurum_stats_and_person_redirect():
    tools = SnapshotTools(SAMPLE)
    r = tools.get_qurum_stats('Miqrasiya')
    assert r.get('error') is None
    assert r['qurum'] == 'Dövlət Miqrasiya Xidməti'
    assert r['total'] == 2
    assert r['overdue'] >= 1
    assert any(a.get('score') == 77 for a in (r.get('assessments') or []))
    # LLM şəxs tool-una qurum yazsa — run_tool avtomatik yönləndirir
    redirected = run_tool('get_person_workload', {'name': 'Dövlət Miqrasiya Xidməti'}, tools)
    assert redirected.get('redirectedFrom') == 'get_person_workload'
    assert redirected.get('qurum') == 'Dövlət Miqrasiya Xidməti'
    assert redirected.get('total') == 2


def test_search_by_qurum_and_summary():
    tools = SnapshotTools(SAMPLE)
    by_q = tools.search_tasks(qurum='DMX')
    assert by_q['count'] == 2
    assert by_q['qurum'] == 'Dövlət Miqrasiya Xidməti'
    by_text = tools.search_tasks(text='inteqrasiya')
    assert by_text['count'] >= 1
    assert any('Miqrasiya' in (i.get('summary') or '') for i in by_text['items'])
