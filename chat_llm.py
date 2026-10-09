import json
import os
import re

import requests
import urllib3

# Ensure .env keys are loaded even if chat_llm is imported first.
import config  # noqa: F401

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

LAST_MODEL = ''
LAST_ERROR = ''

# Ən güclü mövcud model əvvəldə; açar/kvota buraxmasa növbətiyə düşür.
GEMINI_STRONG = 'gemini-3.1-pro-preview'
GEMINI_FALLBACKS = ('gemini-2.5-pro', 'gemini-2.0-flash')
# Chat: əvvəl düşünən/pro modellər, sonra flash
GEMINI_CHAT_FALLBACKS = (
    'gemini-3.1-pro-preview',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
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


def answer_chat(question, facts, draft, history=None, api_key=None):
    global LAST_MODEL, LAST_ERROR
    LAST_MODEL = ''
    LAST_ERROR = ''
    if not str(question or '').strip():
        return None
    gemini, openai = _keys(api_key)
    if not gemini and not openai:
        LAST_ERROR = 'Açar yoxdur'
        return None
    system, user = _build_messages(question, facts, draft, history)
    prefer = (os.environ.get('CHAT_LLM_PROVIDER') or '').strip().lower()
    use_openai_first = prefer == 'openai' or (prefer != 'gemini' and bool(openai))
    if use_openai_first and openai:
        text = _openai(openai, user, system=system)
        if text:
            return text
    if gemini:
        text = _gemini_chat(gemini, system + '\n\n' + user)
        if text:
            return text
    if (not use_openai_first) and openai:
        text = _openai(openai, user, system=system)
        if text:
            return text
    return None


def polish_chat_answer(question, facts, draft, history=None, api_key=None):
    return answer_chat(question, facts, draft, history, api_key)


def _compact_facts(facts):
    """Drop noise so the model stays on the question."""
    if not isinstance(facts, dict):
        return {}
    keep = {
        'kind', 'localKind', 'intent', 'question', 'scope', 'board', 'viewer',
        'mine', 'numbers', 'people', 'directions', 'qurums', 'late', 'blocked',
        'dueOpen', 'dueDone', 'matchedTasks', 'compare', 'sprints', 'focus',
        'person', 'qurum', 'key', 'guidance',
    }
    out = {k: facts[k] for k in keep if k in facts and facts[k] not in (None, '', [], {})}
    # Cap list sizes again server-side
    for key, lim in (
        ('people', 12), ('directions', 10), ('qurums', 10),
        ('late', 8), ('blocked', 8), ('dueOpen', 8), ('dueDone', 6),
        ('matchedTasks', 10), ('sprints', 8),
    ):
        if isinstance(out.get(key), list):
            out[key] = out[key][:lim]
    # Viewer: alone names matter
    viewer = out.get('viewer')
    if isinstance(viewer, dict):
        out['viewer'] = {
            k: viewer.get(k)
            for k in ('firstName', 'displayName', 'jiraDisplayName')
            if viewer.get(k)
        }
    return out


def _build_messages(question, facts, draft, history):
    hist = []
    for item in list(history or [])[-6:]:
        if not isinstance(item, dict):
            continue
        role = 'İstifadəçi' if item.get('role') == 'user' else 'AI Done'
        text = str(item.get('content') or '').strip()
        if text:
            hist.append(role + ': ' + text[:500])
    hist_block = '\n'.join(hist) if hist else '(yoxdur)'

    kind = ''
    viewer = None
    board = None
    intent = ''
    if isinstance(facts, dict):
        kind = str(facts.get('kind') or facts.get('localKind') or '')
        intent = str(facts.get('intent') or '')
        viewer = facts.get('viewer') if isinstance(facts.get('viewer'), dict) else None
        board = facts.get('board') if isinstance(facts.get('board'), dict) else None

    viewer_name = ''
    jira_name = ''
    if viewer:
        viewer_name = str(viewer.get('firstName') or viewer.get('displayName') or '').strip()
        jira_name = str(viewer.get('jiraDisplayName') or viewer.get('displayName') or '').strip()

    system = (
        'Sən AI Done-san — DGD Rəqəmsal İdarəetmə Panelinin analitik köməkçisisən.\n'
        'Yalnız Azərbaycan dilində yaz. «Dashboard» demə — «idarəetmə paneli» / «board» de.\n'
        '\n'
        'ƏSAS QAYDA — SUALA CAVAB VER:\n'
        '1) Əvvəl istifadəçinin sualını oxu. Cavab birbaşa həmin suala aid olmalıdır.\n'
        '2) Sualın soruşmadığı KPI, istiqamət, qurum, sprint xülasəsini yazma.\n'
        '3) Ümumi «panel vəziyyəti» yazma, əgər sual açıqca icmal/vəziyyət istəmirsə.\n'
        '4) Yalnız verilmiş JSON faktlardan rəqəm/ad/açar götür. Uydurma.\n'
        '5) Fakt suala cavab vermirsə: bir cümlə ilə de, sonra yaxın mövcud faktı göstər.\n'
        '6) HTML yazma. Qısa tireli siyahı olar.\n'
        '7) Şablon/robot dili yox; konkret və qısa.\n'
        '\n'
        'FORMA:\n'
        '- Birbaşa cavab (1–2 cümlə)\n'
        '- Lazımdırsa 2–5 sübut (ad / DGD-açar / rəqəm)\n'
        '- Əlavə ümumiləşdirmə yazma\n'
        '\n'
        'MƏNİM İŞLƏRİM: facts.mine. Başqa icraçı üçün üçüncü şəxs.\n'
    )
    if viewer_name:
        system += (
            'Söhbət edən: ' + viewer_name
            + ((' (Jira: «' + jira_name + '»)') if jira_name else '')
            + '. İkinci şəxsdə müraciət et.\n'
        )
    if kind in ('greet', 'thanks', 'identity'):
        system += 'Qısa söhbət: 1–2 cümlə, rəqəm tökme.\n'
    elif kind in ('help', 'about'):
        system += 'Qısa izah: panel funksiyası; uzun KPI siyahısı yazma.\n'
    else:
        system += 'Analiz: maksimum 6–10 cümlə və ya qısa siyahı. Sualı tam ört, artıq yazma.\n'

    compact = _compact_facts(facts)
    user_parts = [
        'Sual:\n' + str(question)[:2000],
        'Əvvəlki söhbət:\n' + hist_block,
    ]
    if intent:
        user_parts.append('Aşkarlanan niyyət: ' + intent)
    if kind:
        user_parts.append('Lokal təsnifat: ' + kind)
    if board:
        user_parts.append('Aktiv filterlər: ' + json.dumps(board, ensure_ascii=False)[:600])
    # Draft yalnız konkret təsnifatda — open şablonu cavabı çirkləndirir
    draft_text = str(draft or '').strip()
    if draft_text and kind and kind not in ('open', 'greet', 'thanks', 'identity', ''):
        user_parts.append(
            'Lokal hesablama (rəqəm istinadı; mətni kopyalama):\n' + draft_text[:1200]
        )
    user_parts.append('Faktlar (JSON):\n' + json.dumps(compact, ensure_ascii=False)[:12000])
    user_parts.append(
        'Xatırlatma: yalnız suala aid cavab yaz. Sualda olmayan ümumi KPI xülasəsi yazma.'
    )
    return system, '\n\n'.join(user_parts)


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
            'temperature': 0.2,
            'max_tokens': 1800,
            'messages': [
                {'role': 'system', 'content': system_msg},
                {'role': 'user', 'content': prompt}
            ]
        }, timeout=75)
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
