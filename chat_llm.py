import json
import os
import re
import time
from typing import Any, Dict, Generator, List, Optional, Tuple

import requests
import urllib3

# Ensure .env keys are loaded even if chat_llm is imported first.
import config  # noqa: F401
from chat_gold import examples_for, format_examples
from chat_tools import (
    SOFT_FAIL,
    TOOL_LABELS,
    SnapshotTools,
    fast_score_answer_from_payloads,
    gemini_function_declarations,
    ground_assessment_answer,
    number_check,
    openai_tools,
    run_tool,
    snapshot_hash,
    try_fast_panel_answer,
)

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

LAST_MODEL = ''
LAST_ERROR = ''
LAST_META: Dict[str, Any] = {}
MAX_STEPS = 3
HISTORY_LIMIT = 8

# Ən güclü mövcud model əvvəldə; açar/kvota buraxmasa növbətiyə düşür.
GEMINI_STRONG = 'gemini-3.1-pro-preview'
GEMINI_FALLBACKS = ('gemini-2.5-pro', 'gemini-2.0-flash')
# Chat: əvvəl sürətli flash, sonra pro
GEMINI_CHAT_FALLBACKS = (
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.5-pro',
    'gemini-3.1-pro-preview',
)

_HTTP = None


def _http():
    global _HTTP
    if _HTTP is None:
        session = requests.Session()
        session.verify = False
        _HTTP = session
    return _HTTP


def chat_llm_ready(override=None):
    return bool(_keys(override)[0] or _keys(override)[1])


_OPENAI_KEY_RE = re.compile(r'sk-(?:proj-)?[A-Za-z0-9_-]{20,}')
_GEMINI_KEY_RE = re.compile(r'AIza[0-9A-Za-z_\-]{30,}')


def _clean_key(raw, kind='openai'):
    key = str(raw or '').strip().strip('"').strip("'")
    # .env / copy-paste qalıqları
    key = key.replace('\ufeff', '').replace('\u200b', '').strip()
    if key.lower().startswith('bearer '):
        key = key[7:].strip()
    pattern = _GEMINI_KEY_RE if kind == 'gemini' else _OPENAI_KEY_RE
    match = pattern.search(key)
    if match:
        return match.group(0)
    return key


def _keys(override=None):
    # Client-supplied keys are ignored. Chatbot uses only server env keys.
    # .env hər sorğuda yenidən oxunur — köhnə proses dəyəri açarı üstələməsin.
    config.reload_llm_env()
    gemini = _clean_key(os.environ.get('GEMINI_API_KEY'), 'gemini')
    openai = _clean_key(os.environ.get('OPENAI_API_KEY'), 'openai')
    return gemini, openai


def _openai_http_error(res, model):
    status = res.status_code
    detail = ''
    try:
        data = res.json()
        err = data.get('error') if isinstance(data, dict) else None
        if isinstance(err, dict):
            detail = str(err.get('message') or err.get('code') or '').strip()
        elif err:
            detail = str(err).strip()
    except Exception:
        detail = (res.text or '').strip()[:180]
    if status == 401:
        return (
            'OpenAI açarı rədd edildi (401). .env-də OPENAI_API_KEY-i yeniləyin '
            'və serveri yenidən başladın.'
        )
    if status == 429:
        return 'OpenAI limiti dolub (429). Bir az sonra yenidən yoxlayın və ya açarı/billing yoxlayın.'
    if status == 404:
        return 'OpenAI model tapılmadı (404). OPENAI_MODEL dəyərini yoxlayın (məs. gpt-4o).'
    if detail:
        return model + ' HTTP ' + str(status) + ': ' + detail[:220]
    return model + ' HTTP ' + str(status)


def polish_monthly_report(period, draft, sample_style=None, api_key=None):
    """Rewrite monthly report draft into official department style. No new facts."""
    global LAST_MODEL, LAST_ERROR
    LAST_MODEL = ''
    LAST_ERROR = ''
    gemini, openai = _keys(api_key)
    if not gemini and not openai:
        LAST_ERROR = 'Açar yoxdur'
        return None
    if not isinstance(draft, dict):
        LAST_ERROR = 'draft yoxdur'
        return None
    sample = str(sample_style or '').strip()
    if len(sample) > 3500:
        sample = sample[:3500]
    period_s = str(period or '').strip()
    prompt = (
        'Sən Qiymətləndirmə və komplayens şöbəsinin rəsmi aylıq hesabat redaktorusan.\n'
        'Verilmiş JSON faktları rəsmi aylıq hesabat üslubunda yenidən yaz.\n'
        'Bu axın yanvar–dekabr bütün aylara eyni qaydada şamil olunur; heç bir ayı xüsusi seçmə.\n'
        'Qaydalar:\n'
        '- Yalnız verilmiş faktlardan istifadə et; yeni qurum, tarix, rəqəm uydurma.\n'
        '- Başlıq, icmal və mətnlərdə dövrü məhz verilmiş period ilə saxla'
        + ((' (' + period_s + ')') if period_s else '')
        + '; başqa ay adı yazma.\n'
        '- HTML entity yazma (&quot; və s. olmasın), düzgün dırnaq və tire istifadə et.\n'
        '- title yalnız «{ay} ayı üzrə fəaliyyətinə dair hesabat» olsun; «ilin», «2026-cı», «in {ay}» yazma.\n'
        '- Bölmə başlıqlarını silmə və sıranı dəyişmə: Vahid Reyestr, Məqsədəuyğunluq rəyi, Rəqəmsallaşma səviyyəsinin diaqnostikası, İnformasiya ehtiyat və sistemlərinin qiymətləndirilməsi, Elektron xidmətlərin qiymətləndirilməsi, Məlumat hədlərinin inteqrasiyası, Digər istiqamətlər, Fəaliyyət Planı iş planı, Rəqəmsal İnkişaf Konsepsiyası iş planı.\n'
        '- «Həll oldu» və «ESD-də olanlar» başlığı yazma.\n'
        '- Vahid Reyestr bəndi: qurumun tam adı, boşluq, sistemin adı. Tire, qısaltma və qalın qurum adı olmasın.\n'
        '- Məqsədəuyğunluq rəyi ilə bağlı Reyestr prosesi mətni bölmənin sonunda qalsın.\n'
        '- Məqsədəuyğunluq: əvvəl məktubla göndərilmiş rəylər və sistemə əlavə edilmiş rəylər eyni nömrəli siyahıda. Məktub bəndində tarix «02.09.2026-cı il tarixli» və nömrə «nömrəli» olsun. Sonra bir təhlil cümləsi, sonra metodiki dəstək, sonda Reyestr prosesi abzası.\n'
        '- Diaqnostika, qiymətləndirmə və inteqrasiyada hər qurum bir bənddir, mətn bütöv yazılır. Diaqnostikanın sonunda 44 qurum cümləsi və üç status bəndi qalır.\n'
        '- Diaqnostikada yalnız seçilmiş ayın alt tapşırıq mərhələləri qalsın. «yerində baxışlar tamamlanmış… hesabat hazırlanma mərhələsindədir» və ESD məktub nömrəsi/tarixi olan yekun bəndləri silmə və mənasını dəyişmə.\n'
        '- Digər istiqamətlərdə hər tapşırıq ayrıca abzasdır, əvvəlində qurum adı.\n'
        '- Hesabatın sonunda iki İş Planı başlığını və bəndlərini silmə.\n'
        '- Reyestr siyahısından sonra ümumi say cümləsini və Tədbirlər Planı bəndlərini silmə.\n'
        '- Vahid Reyestr sistem siyahısındakı bütün bəndləri saxla; heç bir sistemi silmə.\n'
        '- Hər bölməni qısa və rəsmi saxla; eyni mənanı təkrarlama.\n'
        '- Siyahı elementlərinin sonunu ; və ya . ilə bitir.\n'
        '- Qurumun tam adı varsa qısaltma və mötərizə yazma.\n'
        '- Cümlələri vergüllə yapışdırma. Hər fikir «…edilmişdir.», «…təqdim edilmişdir.» kimi bitsin.\n'
        '- Tarixləri TAM yaz: «18.09.2026». Qısa «18.09.» və ya kəsilmiş «18.09.5» yazma.\n'
        '- Hər hadisə tarixindən SONRA mütləq «tarixində» yaz; cümləni belə qur: «18.09.2026 tarixində … edilmişdir.»\n'
        '- "cı il / cü il" qalıqlarını sil. «18.09.2026 sorğu daxil olmuş» kimi «tarixində»siz forma YAZMA.\n'
        '- Yalnız aralıq («01.09.2026 – 30.09.2026 tarixləri») və «tarixli məktub» ifadələrində «tarixində» əlavə etmə.\n'
        '- «tarixində»-dən sonra sözü kiçik hərflə başla (xüsusi adlar istisna).\n'
        '- Tapşırıq başlığını ayrı natamam cümlə kimi yazma.\n'
        '- Düzgün nümunə: «Azərbaycan Respublikasının Rəqəmsal İnkişaf və Nəqliyyat Nazirliyi – 09.09.2026 tarixində 248 nömrəli Qərarın icra vəziyyəti ilə bağlı işçi qaydada sorğu daxil olmuş, 10.09.2026 tarixində müvafiq bənd üzrə mövcud vəziyyət təqdim edilmişdir.»\n'
        '- Səhv: «… 16.09.2026 sorğu daxil olmuş»; «16.09. tarixində …».\n'
        '- HESABATIN İCMALI və KPI kartı yazma.\n'
        '- Cavabı YALNIZ JSON ver, markdown və izah yazma.\n'
        'JSON formatı: {"title":"...","icmal":"...","sections":[{"id":"...","title":"...","intro":"...","items":["..."]}]}\n'
        'Dövr: ' + (period_s or '(draft.period)') + '\n'
        'Nümunə üslub (forma üçün; ay/tarix/rəqəmləri kopyalama):\n' + (sample or '(yoxdur)') + '\n'
        'Draft JSON:\n' + json.dumps(draft, ensure_ascii=False)[:14000]
    )
    text = None
    if gemini:
        text = _gemini(gemini, prompt)
    if not text and openai:
        text = _openai(openai, prompt)
    if not text:
        return None
    raw = text.strip()
    if raw.startswith('```'):
        raw = raw.strip('`')
        if raw.lower().startswith('json'):
            raw = raw[4:].strip()
    try:
        start = raw.find('{')
        end = raw.rfind('}')
        if start >= 0 and end > start:
            raw = raw[start:end + 1]
        data = json.loads(raw)
    except Exception:
        LAST_ERROR = 'JSON parse'
        return None
    if not isinstance(data, dict):
        return None
    return data


def _system_prompt(user_name: str, today: str, sprint: str) -> str:
    return (
        'Sən "AI Done"-san — Rəqəmsal İdarəetmə Departamentinin panel köməkçisisən.\n'
        'İstifadəçi: {user_name}. Bu gün: {today}. Aktiv sprint: {sprint}.\n'
        '\n'
        'Rolun: ChatGPT/Claude səviyyəsində ağıllı, səmimi həmsöhbət + platformanın data analitiki.\n'
        '\n'
        'QAYDALAR\n'
        '1. Platforma datası (tapşırıq, say, insan, sprint, risk, KPI, diaqnostika/qiymətləndirmə balı, qurum) — YALNIZ alətlərdən. Rəqəmi təxmin etmə.\n'
        '2. QURUM (Nazirlik, Agentlik, Xidmət, Komitə, TƏBİB, DMX, Gömrük, Miqrasiya və s.) soruşulanda MÜTLƏQ get_qurum_stats çağır. '
        'get_person_workload YALNIZ insan adı üçündür. Əvvəl aləti çağır; suggestions varsa onları göstər.\n'
        '3. Diaqnostika/EXQ/İSQ balı → get_assessment_scores(qurum=…). Nəticədə matched.score / score sahəsini yaz. '
        'Bir qurumun balını digərinə yapışdırma (məs. Vergi 51 ≠ Mədəniyyət 30).\n'
        '3b. Məqsədəuyğunluq müsbət/mənfi rəy SAYI → get_meqsed_stats(year=…, opinion=pos|neg). '
        'Bunu diaqnostika balı ilə qarışdırma.\n'
        '3c. Tapşırıq/field (DGD-…, status, icraçı, blok səbəbi, custom field) → get_task(key=…). '
        'fields obyektindən oxu; tapşırıq siyahısı üçün search_tasks.\n'
        '3d. Panel kartları (iş yükü, status, prioritet, istiqamət, qurum payı) → get_dashboard(section=…). '
        '«Kimdə iş çoxdur / ən yüklü məşğul» → section=workload. Konkret ad üçün get_person_workload.\n'
        '4. Ümumi sual — öz biliyinlə cavab ver.\n'
        '5. Bilmirsənsə açıq de; uydurma. «snapshot/truncated» demə.\n'
        '6. Azərbaycan dilində, təbii yaz. Markdown; rəqəmləri **qalın**. Uzatma.\n'
        '7. Uyğunsa sonda 1 davam sualı.\n'
    ).format(
        user_name=user_name or 'istifadəçi',
        today=today or '',
        sprint=sprint or '—',
    )


def _hint_intent(facts: Optional[dict], question: str) -> str:
    if isinstance(facts, dict):
        hint = str(facts.get('hint') or facts.get('intent') or facts.get('kind') or facts.get('localKind') or '')
        if hint:
            return hint[:60]
    q = str(question or '').lower()
    if re.search(r'gecik', q):
        return 'late'
    if re.search(r'blok|çətinlik|cetinlik', q):
        return 'blocked'
    if re.search(
        r'diaqnostika|qiymətləndir|qiymetlendir|exq|isq|məqsəd|meqsed|'
        r'özünüqiymət|ozunuqiymet|ən yüksək bal|en yuksek bal|bal alan|'
        r'qurum.*bal|bal.*qurum|'
        r'\bbal\b|\bbalı\b|\bbes\b|\bbəs\b',
        q,
    ):
        return 'assess'
    if re.search(
        r'qurum|nazirlik|agentlik|xidmət|xidmet|komitə|komite|'
        r'miqrasiya|gömrük|gomruk|\bdmx\b|\bdgk\b|\brinn?\b|t[eə]bib|tabib',
        q,
    ):
        return 'qurum'
    # Adlı şəxs («Sabina Mammadova…») — people; «mənim» isə mine
    if re.search(
        r'iş yük|is yuk|workload|ən yüklü|en yuklu|ən məşğul|en mesgul|'
        r'istiqamət pay|prioritet pay|status üzrə|status uzre|panel kart',
        q,
    ):
        return 'dashboard'
    if re.search(
        r'(iş yük|is yuk|icraçı|icraci|kimdə|kimde|üstündə|ustunde|'
        r'baxır|baxir|nın iş|nin is|nın tapşırıq|nin tapsiriq)',
        q,
    ):
        return 'people'
    if re.search(r'[a-zəıöğüçş]{3,}\s+[a-zəıöğüçş]{4,}', q, re.I) and re.search(
        r'iş|is\b|task|tapşırıq|tapsiriq|yük|yuk|neçə|nece|hansı|hansi',
        q,
    ):
        return 'people'
    if re.search(
        r'mənim|menim|öz iş|oz is|taskım|taskim|tapsırıqım|tapsiriqim|'
        r'tapsırıqlarım|tapsiriqlarim|işlərim|islerim|işim|isim\b',
        q,
    ):
        return 'mine'
    if re.search(r'risk', q):
        return 'risk'
    if re.search(r'DGD-\d+', question or '', re.I) or re.search(
        r'\bfield\b|sahə|sahe|blok s[eə]b[eə]b|customfield',
        q,
    ):
        return 'issue'
    return 'open'


def _history_blocks(history: Optional[list]) -> Tuple[List[dict], str]:
    """Keep last HISTORY_LIMIT messages; summarize older ones briefly."""
    items = [x for x in list(history or []) if isinstance(x, dict)]
    summary = ''
    if len(items) > HISTORY_LIMIT:
        older = items[:-HISTORY_LIMIT]
        bits = []
        for it in older[-8:]:
            role = 'U' if it.get('role') == 'user' else 'A'
            text = str(it.get('content') or '').strip().replace('\n', ' ')
            if text:
                bits.append(role + ': ' + text[:120])
        if bits:
            summary = 'Əvvəlki söhbət xülasəsi:\n' + '\n'.join(bits)
        items = items[-HISTORY_LIMIT:]
    return items, summary


def _default_suggestions(question: str, tools_used: List[str]) -> List[str]:
    q = str(question or '').lower()
    if 'get_assessment_scores' in tools_used or 'diaqnost' in q or 'qiymət' in q or 'bal' in q:
        return ['Ən aşağı bal alan qurum', 'EXQ üzrə reyting', 'İSQ balları']
    if 'get_qurum_stats' in tools_used or 'qurum' in q or 'miqrasiya' in q or 'nazirlik' in q:
        return ['Bu qurumun gecikənləri', 'Diaqnostika balı', 'Digər qurumlar']
    if 'get_risks' in tools_used or 'gecik' in q or 'risk' in q:
        return ['Mənim gecikənlərim', 'Bloklanan işlər', 'İcraçılar üzrə yük']
    if 'get_person_workload' in tools_used or 'get_my_tasks' in tools_used:
        return ['Onun gecikənləri', 'Cari həftə risklər', 'Ümumi vəziyyət']
    if 'get_overview' in tools_used or 'get_kpi' in tools_used:
        return ['Gecikən tapşırıqlar', 'Mənim işlərim', 'Sprint müqayisəsi']
    return ['Mənim işlərim', 'Cari həftə risklər', 'Gecikən tapşırıqlar']


def answer_chat(question, facts, draft, history=None, api_key=None, snapshot=None):
    """Non-stream entry (replay / stream=0). Returns answer text or None."""
    global LAST_ERROR
    result = None
    tokens: List[str] = []
    for ev in answer_chat_events(question, facts, draft, history, api_key, snapshot):
        if ev.get('type') == 'done':
            result = ev.get('answer') or result
        elif ev.get('type') == 'token':
            tokens.append(str(ev.get('text') or ''))
        elif ev.get('type') == 'error' and not result:
            LAST_ERROR = str(ev.get('error') or LAST_ERROR)
    if not result and tokens:
        result = ''.join(tokens).strip() or None
    return result


def polish_chat_answer(question, facts, draft, history=None, api_key=None, snapshot=None):
    return answer_chat(question, facts, draft, history, api_key, snapshot)


def answer_chat_events(
    question,
    facts=None,
    draft=None,
    history=None,
    api_key=None,
    snapshot=None,
) -> Generator[dict, None, None]:
    """Yield SSE-ready events: status, token, suggestions, done, error."""
    global LAST_MODEL, LAST_ERROR, LAST_META
    LAST_MODEL = ''
    LAST_ERROR = ''
    LAST_META = {}
    started = time.time()
    q = str(question or '').strip()
    if not q:
        yield {'type': 'error', 'error': 'Sual boşdur'}
        return

    facts = facts if isinstance(facts, dict) else {}
    snapshot = snapshot if isinstance(snapshot, dict) else (facts.get('snapshot') if isinstance(facts.get('snapshot'), dict) else {})
    tools_ctx = SnapshotTools(snapshot)
    meta = tools_ctx.meta
    viewer = facts.get('viewer') if isinstance(facts.get('viewer'), dict) else {}
    user_name = (
        meta.get('user')
        or viewer.get('greetingName')
        or viewer.get('firstName')
        or viewer.get('displayName')
        or ''
    )
    # Login üslubu (farid.osmanov) salamlamada istifadə olunmasın
    if user_name and (' ' not in str(user_name)) and ('.' in str(user_name) or '_' in str(user_name)):
        user_name = viewer.get('greetingName') or viewer.get('firstName') or ''
        if user_name and (' ' not in str(user_name)) and ('.' in str(user_name) or '_' in str(user_name)):
            user_name = ''
    system = _system_prompt(user_name, meta.get('today') or '', meta.get('sprint') or '')
    hint = _hint_intent(facts, q)
    gold = format_examples(examples_for(hint, q, limit=2))
    hist_items, hist_summary = _history_blocks(history)

    # Panel balı/qurum — LLM gözləmədən dərhal cavab
    fast = try_fast_panel_answer(hint, q, tools_ctx)
    if fast:
        answer, tools_used, payloads = fast
        print('chat_llm fast_panel', hint, 'q=' + q[:60], flush=True)
        yield {
            'type': 'status',
            'tool': tools_used[0] if tools_used else 'get_assessment_scores',
            'label': TOOL_LABELS.get(tools_used[0] if tools_used else '', 'Paneldən oxuyuram…'),
        }
        yield {
            'type': 'meta',
            'tools_used': tools_used,
            'tool_payloads': payloads,
            'steps': 0,
            'model': 'panel',
        }
        for chunk in _chunk_tokens(answer, size=40):
            yield {'type': 'token', 'text': chunk}
        suggestions = _default_suggestions(q, tools_used)
        yield {'type': 'suggestions', 'items': suggestions[:3]}
        duration_ms = int((time.time() - started) * 1000)
        LAST_MODEL = 'panel'
        LAST_META = {
            'tools_used': tools_used,
            'steps': 0,
            'snapshot_hash': snapshot_hash(snapshot),
            'number_check': 'ok',
            'model': 'panel',
            'duration_ms': duration_ms,
            'suggestions': suggestions[:3],
            'fast': True,
        }
        yield {
            'type': 'done',
            'answer': answer,
            'tools_used': tools_used,
            'steps': 0,
            'model': 'panel',
            'duration_ms': duration_ms,
            'snapshot_hash': LAST_META['snapshot_hash'],
            'number_check': 'ok',
            'grounded': True,
        }
        return

    user_parts = []
    if hist_summary:
        user_parts.append(hist_summary)
    if hint and hint not in ('open', ''):
        user_parts.append('İpucu (məcburi deyil): ' + hint)
    draft_text = str(draft or '').strip()
    if draft_text:
        user_parts.append('Lokal ipucu (məhdudlaşdırmır):\n' + draft_text[:500])
    if gold:
        user_parts.append(gold)
    # Qurum/bal suallarında qısa lüğət; digərlərində göndərmə (sürət)
    if hint in ('qurum', 'assess'):
        try:
            glossary = tools_ctx.qurum_glossary_text(limit=40)
            if glossary:
                user_parts.append(glossary)
        except Exception:
            pass
    if tools_ctx.truncated:
        user_parts.append(
            'Daxili qeyd (istifadəçiyə demə): panel məlumatı qismən göndərilib; '
            'tapılmayan bal üçün «snapshot/kəsilib» demə — sadəcə «panelda görünmür» de.'
        )
    user_parts.append('Sual:\n' + q[:2000])
    user_message = '\n\n'.join(user_parts)

    gemini, openai = _keys(api_key)
    if not gemini and not openai:
        LAST_ERROR = 'Açar yoxdur'
        print('chat_llm: açar yoxdur', flush=True)
        yield {'type': 'error', 'error': LAST_ERROR, 'soft_fail': SOFT_FAIL}
        return

    prefer = (os.environ.get('CHAT_LLM_PROVIDER') or '').strip().lower()
    use_openai_first = prefer == 'openai' or (prefer != 'gemini' and bool(openai) and not gemini)

    providers = []
    if use_openai_first and openai:
        providers.append(('openai', openai))
    if gemini:
        providers.append(('gemini', gemini))
    if (not use_openai_first) and openai:
        providers.append(('openai', openai))

    print(
        'chat_llm start',
        'providers=' + ','.join(p for p, _ in providers),
        'hint=' + str(hint),
        'q=' + q[:80],
        flush=True,
    )
    yield {'type': 'status', 'label': 'Düşünürəm…'}

    last_err = ''
    for pname, key in providers:
        try:
            force_tools = hint in (
                'mine', 'late', 'blocked', 'risk', 'people', 'kpi',
                'overview', 'sprint', 'qurum', 'directions', 'issue', 'assess',
                'dashboard',
            )
            if pname == 'gemini':
                gen = _tool_loop_gemini(
                    key, system, user_message, hist_items, tools_ctx, force_tools=force_tools
                )
            else:
                gen = _tool_loop_openai(
                    key, system, user_message, hist_items, tools_ctx, force_tools=force_tools
                )
            answer_parts: List[str] = []
            tools_used: List[str] = []
            tool_payloads: List[Any] = []
            steps = 0
            suggestions: List[str] = []
            for ev in gen:
                et = ev.get('type')
                if et == 'status':
                    yield ev
                elif et == 'token':
                    answer_parts.append(str(ev.get('text') or ''))
                    yield ev
                elif et == 'meta':
                    tools_used = list(ev.get('tools_used') or tools_used)
                    tool_payloads = list(ev.get('tool_payloads') or tool_payloads)
                    steps = int(ev.get('steps') or steps)
                    if ev.get('model'):
                        LAST_MODEL = str(ev.get('model'))
                elif et == 'suggestions':
                    suggestions = list(ev.get('items') or [])
                    yield ev
                elif et == 'error':
                    last_err = str(ev.get('error') or '')
                    LAST_ERROR = last_err
            answer = ''.join(answer_parts).strip()
            if answer:
                grounded = ground_assessment_answer(answer, tool_payloads)
                if grounded:
                    print('chat_llm ground_assessment_answer', flush=True)
                    answer = grounded
                if not suggestions:
                    suggestions = _default_suggestions(q, tools_used)
                    yield {'type': 'suggestions', 'items': suggestions[:3]}
                ncheck = number_check(answer, tool_payloads)
                if ncheck == 'warn':
                    print('chat_llm number_check warn', flush=True)
                duration_ms = int((time.time() - started) * 1000)
                LAST_META = {
                    'tools_used': tools_used,
                    'steps': steps,
                    'snapshot_hash': snapshot_hash(snapshot),
                    'number_check': ncheck,
                    'model': LAST_MODEL,
                    'duration_ms': duration_ms,
                    'suggestions': suggestions[:3],
                    'grounded': bool(grounded),
                }
                print(
                    'chat_llm ok',
                    pname,
                    'model=' + str(LAST_MODEL),
                    'len=' + str(len(answer)),
                    'tools=' + ','.join(tools_used),
                    'ms=' + str(duration_ms),
                    flush=True,
                )
                yield {
                    'type': 'done',
                    'answer': answer,
                    'tools_used': tools_used,
                    'steps': steps,
                    'model': LAST_MODEL,
                    'duration_ms': duration_ms,
                    'snapshot_hash': LAST_META['snapshot_hash'],
                    'number_check': ncheck,
                    'grounded': bool(grounded),
                }
                return
            print('chat_llm empty answer', pname, 'last_err=' + str(last_err or LAST_ERROR), flush=True)
        except Exception as err:
            last_err = type(err).__name__ + ': ' + str(err)[:180]
            LAST_ERROR = last_err
            print('chat_llm provider fail', pname, LAST_ERROR, flush=True)
            continue

    LAST_ERROR = last_err or LAST_ERROR or 'cavab alınmadı'
    print('chat_llm final fail', LAST_ERROR, flush=True)
    yield {'type': 'error', 'error': LAST_ERROR, 'soft_fail': SOFT_FAIL}


def _chunk_tokens(text: str, size: int = 12) -> List[str]:
    text = str(text or '')
    if not text:
        return []
    chunks = []
    i = 0
    n = len(text)
    while i < n:
        chunks.append(text[i:i + size])
        i += size
    return chunks


def _openai_chat_model() -> str:
    return (
        (os.environ.get('OPENAI_CHAT_MODEL') or '').strip()
        or (os.environ.get('OPENAI_MODEL') or '').strip()
        or 'gpt-4o-mini'
    )


def _emit_fast_from_tools(tools_used, tool_payloads, steps, model):
    """Yield meta+tokens+return-signal if tool payloads already answer the score question."""
    fast_text = fast_score_answer_from_payloads(tool_payloads)
    if not fast_text:
        return None
    print('chat_llm fast_after_tools', model, flush=True)
    return {
        'meta': {
            'type': 'meta',
            'tools_used': tools_used,
            'tool_payloads': tool_payloads,
            'steps': steps,
            'model': model,
        },
        'text': fast_text,
    }


def _tool_loop_openai(key, system, user_message, hist_items, tools_ctx: SnapshotTools, force_tools=False):
    global LAST_MODEL, LAST_ERROR
    base = (os.environ.get('OPENAI_BASE_URL') or 'https://api.openai.com/v1').rstrip('/')
    model = _openai_chat_model()
    messages: List[dict] = [{'role': 'system', 'content': system}]
    for item in hist_items:
        role = 'user' if item.get('role') == 'user' else 'assistant'
        content = str(item.get('content') or '').strip()
        if content:
            messages.append({'role': role, 'content': content[:800]})
    messages.append({'role': 'user', 'content': user_message})

    tools_used: List[str] = []
    tool_payloads: List[Any] = []
    steps = 0

    for step in range(MAX_STEPS):
        steps = step + 1
        # İlk addımda panel sualları üçün alət məcburidir — açar boş şablon cavaba getməsin
        choice = 'required' if (force_tools and step == 0 and not tools_used) else 'auto'
        try:
            res = _http().post(base + '/chat/completions', headers={
                'Authorization': 'Bearer ' + key,
                'Content-Type': 'application/json',
            }, json={
                'model': model,
                'temperature': 0.25,
                'max_tokens': 900,
                'tools': openai_tools(),
                'tool_choice': choice,
                'messages': messages,
            }, timeout=45)
        except requests.exceptions.Timeout:
            LAST_ERROR = model + ' timeout'
            yield {'type': 'error', 'error': LAST_ERROR}
            return
        except Exception as err:
            LAST_ERROR = model + ' ' + type(err).__name__
            yield {'type': 'error', 'error': LAST_ERROR}
            return

        if res.status_code != 200:
            LAST_ERROR = _openai_http_error(res, model)
            yield {'type': 'error', 'error': LAST_ERROR}
            return

        data = res.json()
        choice = (data.get('choices') or [{}])[0]
        msg = choice.get('message') or {}
        tool_calls = msg.get('tool_calls') or []
        if tool_calls:
            messages.append(msg)
            for call in tool_calls:
                fn = (call.get('function') or {})
                name = str(fn.get('name') or '')
                raw_args = fn.get('arguments') or '{}'
                try:
                    args = json.loads(raw_args) if isinstance(raw_args, str) else (raw_args or {})
                except Exception:
                    args = {}
                if name:
                    tools_used.append(name)
                    yield {
                        'type': 'status',
                        'tool': name,
                        'label': TOOL_LABELS.get(name, 'Düşünürəm…'),
                    }
                    result = run_tool(name, args, tools_ctx)
                    tool_payloads.append(result)
                    messages.append({
                        'role': 'tool',
                        'tool_call_id': call.get('id') or name,
                        'content': json.dumps(result, ensure_ascii=False)[:6000],
                    })
            # Konkret bal cavabı artıq hazırdırsa — ikinci LLM çağırışını atla
            bundled = _emit_fast_from_tools(tools_used, tool_payloads, steps, model)
            if bundled:
                LAST_MODEL = model
                yield bundled['meta']
                for chunk in _chunk_tokens(bundled['text'], size=40):
                    yield {'type': 'token', 'text': chunk}
                return
            continue

        text = str(msg.get('content') or '').strip()
        LAST_MODEL = model
        yield {
            'type': 'meta',
            'tools_used': tools_used,
            'tool_payloads': tool_payloads,
            'steps': steps,
            'model': model,
        }
        for chunk in _chunk_tokens(text, size=40):
            yield {'type': 'token', 'text': chunk}
        return

    # Max steps — force a closing answer without tools
    try:
        res = _http().post(base + '/chat/completions', headers={
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json',
        }, json={
            'model': model,
            'temperature': 0.3,
            'max_tokens': 700,
            'messages': messages + [{
                'role': 'user',
                'content': 'Alət çağırışını dayandır və indiyə qədərki məlumatla cavab ver.',
            }],
        }, timeout=40)
        if res.status_code == 200:
            data = res.json()
            text = (((data.get('choices') or [{}])[0].get('message') or {}).get('content') or '').strip()
            LAST_MODEL = model
            yield {
                'type': 'meta',
                'tools_used': tools_used,
                'tool_payloads': tool_payloads,
                'steps': steps,
                'model': model,
            }
            for chunk in _chunk_tokens(text):
                yield {'type': 'token', 'text': chunk}
            return
    except Exception:
        pass
    yield {'type': 'error', 'error': 'max_steps'}


def _tool_loop_gemini(key, system, user_message, hist_items, tools_ctx: SnapshotTools, force_tools=False):
    global LAST_MODEL, LAST_ERROR
    decls = gemini_function_declarations()
    contents: List[dict] = []
    for item in hist_items:
        role = 'user' if item.get('role') == 'user' else 'model'
        content = str(item.get('content') or '').strip()
        if content:
            contents.append({'role': role, 'parts': [{'text': content[:1500]}]})
    contents.append({'role': 'user', 'parts': [{'text': user_message}]})

    tools_used: List[str] = []
    tool_payloads: List[Any] = []
    steps = 0
    last_local_err = ''

    for model in _gemini_chat_models():
        local_contents = [dict(c) for c in contents]
        for step in range(MAX_STEPS):
            steps = step + 1
            url = (
                'https://generativelanguage.googleapis.com/v1beta/models/'
                + model
                + ':generateContent?key='
                + key
            )
            gen: Dict[str, Any] = {'maxOutputTokens': 1024, 'temperature': 0.25}
            # Chat tool-loop: thinking yavaşladır — yalnız pro modellərdə LOW
            if _model_supports_thinking(model) and 'flash' not in model.lower():
                gen['thinkingConfig'] = {'thinkingLevel': 'LOW'}
            body = {
                'systemInstruction': {'parts': [{'text': system}]},
                'contents': local_contents,
                'tools': [{'functionDeclarations': decls}],
                'generationConfig': gen,
            }
            if force_tools and step == 0 and not tools_used:
                body['toolConfig'] = {
                    'functionCallingConfig': {'mode': 'ANY'},
                }
            timeout = 50 if 'pro' in model.lower() else 35
            try:
                res = _http().post(url, json=body, timeout=timeout)
            except requests.exceptions.SSLError:
                LAST_ERROR = model + ' SSLError'
                last_local_err = LAST_ERROR
                break
            except Exception as err:
                LAST_ERROR = model + ' ' + type(err).__name__
                last_local_err = LAST_ERROR
                break

            if res.status_code != 200:
                LAST_ERROR = model + ' HTTP ' + str(res.status_code)
                last_local_err = LAST_ERROR
                print('chat_llm Gemini fail', LAST_ERROR, flush=True)
                break

            data = res.json()
            cand = (data.get('candidates') or [{}])[0]
            parts = ((cand.get('content') or {}).get('parts') or [])
            fn_calls = []
            texts = []
            for part in parts:
                if part.get('thought'):
                    continue
                if part.get('functionCall'):
                    fn_calls.append(part['functionCall'])
                elif part.get('text'):
                    texts.append(part['text'])

            if fn_calls:
                # model turn with function calls
                local_contents.append({'role': 'model', 'parts': parts})
                response_parts = []
                for fc in fn_calls:
                    name = str(fc.get('name') or '')
                    args = fc.get('args') if isinstance(fc.get('args'), dict) else {}
                    if not name:
                        continue
                    tools_used.append(name)
                    yield {
                        'type': 'status',
                        'tool': name,
                        'label': TOOL_LABELS.get(name, 'Düşünürəm…'),
                    }
                    result = run_tool(name, args, tools_ctx)
                    tool_payloads.append(result)
                    response_parts.append({
                        'functionResponse': {
                            'name': name,
                            'response': result if isinstance(result, dict) else {'result': result},
                        }
                    })
                if response_parts:
                    local_contents.append({'role': 'user', 'parts': response_parts})
                bundled = _emit_fast_from_tools(tools_used, tool_payloads, steps, model)
                if bundled:
                    LAST_MODEL = model
                    yield bundled['meta']
                    for chunk in _chunk_tokens(bundled['text'], size=40):
                        yield {'type': 'token', 'text': chunk}
                    return
                continue

            text = '\n'.join(texts).strip()
            if text:
                LAST_MODEL = model
                print('chat_llm Gemini ok', model, flush=True)
                yield {
                    'type': 'meta',
                    'tools_used': tools_used,
                    'tool_payloads': tool_payloads,
                    'steps': steps,
                    'model': model,
                }
                for chunk in _chunk_tokens(text, size=40):
                    yield {'type': 'token', 'text': chunk}
                return
            LAST_ERROR = model + ' boş cavab'
            last_local_err = LAST_ERROR
            break
        if LAST_ERROR.endswith('SSLError'):
            break

    yield {'type': 'error', 'error': last_local_err or LAST_ERROR or 'gemini fail'}


def _gemini_models():
    preferred = (os.environ.get('GEMINI_MODEL') or GEMINI_STRONG).strip()
    models = []
    for name in (preferred, GEMINI_STRONG) + GEMINI_FALLBACKS:
        if name and name not in models:
            models.append(name)
    return models


def _gemini_text(data):
    cand = (data.get('candidates') or [{}])[0]
    parts = ((cand.get('content') or {}).get('parts') or [])
    texts = []
    for part in parts:
        if not part.get('text') or part.get('thought'):
            continue
        texts.append(part.get('text'))
    return '\n'.join(texts).strip() or None


def _gemini_chat_models():
    preferred = (os.environ.get('GEMINI_CHAT_MODEL') or os.environ.get('GEMINI_MODEL') or '').strip()
    models = []
    for name in (preferred,) + GEMINI_CHAT_FALLBACKS:
        if name and name not in models:
            models.append(name)
    return models


def _model_supports_thinking(model):
    name = str(model or '').lower()
    return ('gemini-3' in name) or ('2.5-pro' in name) or ('2.5-flash' in name)


def _gemini_chat(key, prompt):
    global LAST_MODEL
    for model in _gemini_chat_models():
        text = _gemini_once(key, prompt, model, chat=True)
        if text:
            LAST_MODEL = model
            print('chat_llm Gemini ok', model, flush=True)
            return text
        if LAST_ERROR.endswith('SSLError'):
            break
    return None


def _gemini_once(key, prompt, model, chat=False):
    global LAST_ERROR
    url = (
        'https://generativelanguage.googleapis.com/v1beta/models/'
        + model
        + ':generateContent?key='
        + key
    )
    gen = {'maxOutputTokens': 2048 if chat else 8192}
    # Chat: aşağı temperatur — suala bağlı qalsın; hesabatda bir az daha geniş
    if _model_supports_thinking(model):
        gen['thinkingConfig'] = {
            'thinkingLevel': 'MEDIUM' if chat else ('HIGH' if ('pro' in model or 'gemini-3' in model) else 'MEDIUM')
        }
        if chat:
            gen['temperature'] = 0.2
    else:
        gen['temperature'] = 0.2 if chat else 0.45
    if chat and 'flash' in model and 'thinkingConfig' not in gen:
        gen['temperature'] = 0.2
    timeout = 60 if chat else (90 if 'gemini-3' in model or 'pro' in model else 35)
    if chat and _model_supports_thinking(model):
        timeout = 80
    try:
        res = _http().post(url, json={
            'contents': [{'parts': [{'text': prompt}]}],
            'generationConfig': gen
        }, timeout=timeout)
        if res.status_code != 200:
            LAST_ERROR = model + ' HTTP ' + str(res.status_code)
            print('chat_llm Gemini fail', LAST_ERROR, flush=True)
            return None
        text = _gemini_text(res.json())
        if not text:
            LAST_ERROR = model + ' boş cavab'
            print('chat_llm Gemini empty', model, flush=True)
        return text
    except requests.exceptions.SSLError:
        LAST_ERROR = model + ' SSLError'
        print('chat_llm Gemini error', LAST_ERROR, flush=True)
        return None
    except Exception as err:
        LAST_ERROR = model + ' ' + type(err).__name__
        print('chat_llm Gemini error', LAST_ERROR, flush=True)
        return None


def _gemini(key, prompt):
    global LAST_MODEL
    for model in _gemini_models():
        text = _gemini_once(key, prompt, model)
        if text:
            LAST_MODEL = model
            print('chat_llm Gemini ok', model, flush=True)
            return text
        if LAST_ERROR.endswith('SSLError'):
            break
    return None


def _openai(key, prompt, system=None):
    global LAST_MODEL, LAST_ERROR
    base = (os.environ.get('OPENAI_BASE_URL') or 'https://api.openai.com/v1').rstrip('/')
    model = os.environ.get('OPENAI_MODEL') or 'gpt-4o'
    system_msg = (system or (
        'Sən AI Done-san — DGD idarəetmə panelinin analitik köməkçisisən. '
        'Yalnız suala aid, Azərbaycan dilində konkret cavab ver. '
        'Rəqəm və ad uydurma. Ümumi KPI xülasəsi yazma əgər soruşulmayıbsa.'
    )).strip()
    try:
        res = _http().post(base + '/chat/completions', headers={
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json'
        }, json={
            'model': model,
            'temperature': 0.35,
            'max_tokens': 1600,
            'messages': [
                {'role': 'system', 'content': system_msg},
                {'role': 'user', 'content': prompt}
            ]
        }, timeout=90)
        if res.status_code != 200:
            LAST_ERROR = _openai_http_error(res, model)
            print('chat_llm OpenAI fail', LAST_ERROR, flush=True)
            return None
        data = res.json()
        choice = (data.get('choices') or [{}])[0]
        text = ((choice.get('message') or {}).get('content') or '').strip()
        if text:
            LAST_MODEL = model
            print('chat_llm OpenAI ok', model, flush=True)
        return text or None
    except requests.exceptions.Timeout:
        LAST_ERROR = model + ' timeout'
        print('chat_llm OpenAI error', LAST_ERROR, flush=True)
        return None
    except Exception as err:
        LAST_ERROR = model + ' ' + type(err).__name__
        print('chat_llm OpenAI error', LAST_ERROR, flush=True)
        return None
