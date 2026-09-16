import json
import os

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

LAST_MODEL = ''
LAST_ERROR = ''

# Ən güclü mövcud model əvvəldə; açar/kvota buraxmasa növbətiyə düşür.
GEMINI_STRONG = 'gemini-3.1-pro-preview'
GEMINI_FALLBACKS = ('gemini-2.5-pro', 'gemini-2.0-flash')

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


def _keys(override=None):
    # Client-supplied keys are ignored. Chatbot uses only server env keys.
    gemini = os.environ.get('GEMINI_API_KEY') or ''
    openai = os.environ.get('OPENAI_API_KEY') or ''
    return gemini, openai


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
    prompt = _build_prompt(question, facts, draft, history)
    if gemini:
        text = _gemini(gemini, prompt)
        if text:
            return text
    if openai:
        text = _openai(openai, prompt)
        if text:
            return text
    return None


def polish_chat_answer(question, facts, draft, history=None, api_key=None):
    return answer_chat(question, facts, draft, history, api_key)


def _build_prompt(question, facts, draft, history):
    hist = []
    for item in list(history or [])[-8:]:
        if not isinstance(item, dict):
            continue
        role = 'İstifadəçi' if item.get('role') == 'user' else 'AI Done'
        text = str(item.get('content') or '').strip()
        if text:
            hist.append(role + ': ' + text[:800])
    hist_block = '\n'.join(hist) if hist else '(yoxdur)'
    kind = ''
    viewer = None
    if isinstance(facts, dict):
        kind = str(facts.get('kind') or facts.get('localKind') or '')
        viewer = facts.get('viewer') if isinstance(facts.get('viewer'), dict) else None
    viewer_name = ''
    jira_name = ''
    if viewer:
        viewer_name = str(viewer.get('firstName') or viewer.get('displayName') or '').strip()
        jira_name = str(viewer.get('jiraDisplayName') or viewer.get('displayName') or '').strip()
    tone = (
        'Sən AI Done-san — DGD Rəqəmsal İdarəetmə Panelinin köməkçisi.\n'
        'Bir insanla danışdığın kimi yaz: səmimi, sakit, peşəkar. Robot və ya şablon kimi səslənmə.\n'
        'Yalnız rəsmi Azərbaycan dilində danış. «Dashboard» yazma, əvəzinə «idarəetmə paneli» de.\n'
        'Özünü AI Done kimi tanı.\n'
        'Salam və ya qısa nəzakət varsa, eyni cümləni hər dəfə təkrarlama. '
        'Günün vaxtına uyğun, təbii salamla.\n'
        'Təşəkkürə qısa və isti cavab ver, KPI tökme.\n'
        'Sualı oxu, nə istədiyini başa düş, sonra düşünüb cavab ver.\n'
        'Analizdə əvvəl birbaşa nəticəni de, sonra sübut gətir: ad, tapşırıq açarı, rəqəm, istiqamət.\n'
        'Yalnız JSON faktlardan istifadə et. Yeni rəqəm, ad və ya sprint uydurma.\n'
        'Faktlarda yoxdursa, ehtiyatla de və yaxın kəsiyi şərh et.\n'
        'Heç vaxt «bağlaya bilmədim», «kömək yazın» demə.\n'
        'HTML yazma. Lazım olsa qısa siyahı işlət.\n'
    )
    if viewer_name:
        tone += (
            'Söhbət edən şəxs: ' + viewer_name
            + ((' (Jira-da «' + jira_name + '»)') if jira_name else '')
            + '.\n'
            'Ona ikinci şəxsdə müraciət et: adını işlət, «sizin işləriniz», «sizin tapşırıqlarınız».\n'
            '«Mənim işlərim», «mənim tapşırıqlarım», «mənim vəziyyətim» deyəndə yalnız bu icraçını nəzərdə tut.\n'
            'Onun tapşırıqları facts.mine içindədir (late, blocked, dueOpen, stats). Oradan konkret açar və ad gətir.\n'
            'Başqa icraçı haqqında soruşmayıbsa, onu üçüncü şəxsdə təsvir etmə.\n'
        )
    if kind in ('greet', 'thanks', 'identity'):
        if viewer_name:
            tone += 'Bu qısa söhbətdir. 1–3 cümlə kifayətdir. Salamlamaq üçün adını işlət, panel rəqəmlərini tökme.\n'
        else:
            tone += 'Bu qısa söhbətdir. 1–3 cümlə kifayətdir, panel rəqəmlərini tökme.\n'
    else:
        tone += (
            'Bu analizdir: əvvəl birbaşa nəticə, sonra sübut (ad, açar, rəqəm). '
            'Nəyin risk, nəyin yaxşı getdiyini ayır. 6–12 cümlə, konkret olsun.\n'
        )
    draft_text = str(draft or '').strip()
    draft_block = ('\nYerli qeyd (rəqəmləri saxla, daha ağıllı yaz):\n' + draft_text[:3500] + '\n') if draft_text else ''
    return (
        tone + '\n'
        'Əvvəlki söhbət:\n' + hist_block + '\n\n'
        'Sual:\n' + str(question)[:2000] + '\n'
        + draft_block + '\n'
        'Panel faktları (JSON):\n' + json.dumps(facts or {}, ensure_ascii=False)[:16000]
    )


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


def _gemini_once(key, prompt, model):
    global LAST_ERROR
    url = (
        'https://generativelanguage.googleapis.com/v1beta/models/'
        + model
        + ':generateContent?key='
        + key
    )
    gen = {'maxOutputTokens': 8192}
    if 'gemini-3' in model:
        gen['thinkingConfig'] = {'thinkingLevel': 'HIGH'}
    else:
        gen['temperature'] = 0.45
    timeout = 90 if 'gemini-3' in model or 'pro' in model else 35
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


def _openai(key, prompt):
    global LAST_MODEL, LAST_ERROR
    base = (os.environ.get('OPENAI_BASE_URL') or 'https://api.openai.com/v1').rstrip('/')
    model = os.environ.get('OPENAI_MODEL') or 'gpt-4o-mini'
    try:
        res = _http().post(base + '/chat/completions', headers={
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json'
        }, json={
            'model': model,
            'temperature': 0.55,
            'max_tokens': 2200,
            'messages': [
                {
                    'role': 'system',
                    'content': 'Sən AI Done-san. Rəsmi Azərbaycan dilində danış, dashboard demə, idarəetmə paneli de.'
                },
                {'role': 'user', 'content': prompt}
            ]
        }, timeout=30)
        if res.status_code != 200:
            LAST_ERROR = model + ' HTTP ' + str(res.status_code)
            print('chat_llm OpenAI fail', LAST_ERROR, flush=True)
            return None
        data = res.json()
        choice = (data.get('choices') or [{}])[0]
        text = ((choice.get('message') or {}).get('content') or '').strip()
        if text:
            LAST_MODEL = model
            print('chat_llm OpenAI ok', model, flush=True)
        return text or None
    except Exception as err:
        LAST_ERROR = model + ' ' + type(err).__name__
        print('chat_llm OpenAI error', LAST_ERROR, flush=True)
        return None
