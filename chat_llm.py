import json
import os

import requests


def chat_llm_ready(override=None):
    return bool(_keys(override)[0] or _keys(override)[1])


def _keys(override=None):
    gemini = os.environ.get('GEMINI_API_KEY') or ''
    openai = os.environ.get('OPENAI_API_KEY') or ''
    extra = str(override or '').strip()
    if extra:
        if extra.startswith('sk-'):
            openai = extra
        else:
            gemini = extra
    return gemini, openai


def answer_chat(question, facts, draft, history=None, api_key=None):
    if not str(question or '').strip():
        return None
    gemini, openai = _keys(api_key)
    if not gemini and not openai:
        return None
    prompt = _build_prompt(question, facts, draft, history)
    if gemini:
        text = _gemini(gemini, prompt)
        if text:
            return text
    if openai:
        return _openai(openai, prompt)
    return None


def polish_chat_answer(question, facts, draft, history=None, api_key=None):
    return answer_chat(question, facts, draft, history, api_key)


def _build_prompt(question, facts, draft, history):
    hist = []
    for item in (history or [])[-8]:
        if not isinstance(item, dict):
            continue
        role = 'İstifadəçi' if item.get('role') == 'user' else 'Analitik'
        text = str(item.get('content') or '').strip()
        if text:
            hist.append(role + ': ' + text[:800])
    hist_block = '\n'.join(hist) if hist else '(yoxdur)'
    return (
        'Sən DGD Rəqəmsal İdarəetmə panelinin analitiksən.\n'
        'Sualın özünə orijinal, dolğun cavab yaz. Hazır şablon, eyni KPI siyahısı və ya '
        '«lövhədə X iş görünür» tipli hazır cümlə istifadə etmə.\n'
        'Əvvəl birbaşa nəticəni de, sonra sübut gətir: ad, tapşırıq açarı, rəqəm, istiqamət.\n'
        'Yalnız JSON faktlardan istifadə et. Yeni rəqəm, ad və ya sprint uydurma.\n'
        'Faktlarda yoxdursa, ehtiyatla de və yaxın kəsiyi şərh et.\n'
        'Heç vaxt «bağlaya bilmədim», «kömək yazın» demə və istifadəçini düzəltmə.\n'
        'Azərbaycan dilində, aydın, peşəkar yaz. 6–12 cümlə. HTML yazma. Lazım olsa qısa siyahı işlət.\n\n'
        'Əvvəlki söhbət:\n' + hist_block + '\n\n'
        'Sual:\n' + str(question)[:2000] + '\n\n'
        'Panel faktları (JSON):\n' + json.dumps(facts or {}, ensure_ascii=False)[:16000]
    )


def _gemini(key, prompt):
    model = os.environ.get('GEMINI_MODEL') or 'gemini-2.0-flash'
    url = (
        'https://generativelanguage.googleapis.com/v1beta/models/'
        + model
        + ':generateContent?key='
        + key
    )
    try:
        res = requests.post(url, json={
            'contents': [{'parts': [{'text': prompt}]}],
            'generationConfig': {'temperature': 0.45, 'maxOutputTokens': 2500}
        }, timeout=30)
        if res.status_code != 200:
            return None
        data = res.json()
        parts = (((data.get('candidates') or [{}])[0].get('content') or {}).get('parts') or [])
        texts = [p.get('text') for p in parts if p.get('text')]
        return '\n'.join(texts).strip() or None
    except Exception:
        return None


def _openai(key, prompt):
    base = (os.environ.get('OPENAI_BASE_URL') or 'https://api.openai.com/v1').rstrip('/')
    model = os.environ.get('OPENAI_MODEL') or 'gpt-4o-mini'
    try:
        res = requests.post(base + '/chat/completions', headers={
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json'
        }, json={
            'model': model,
            'temperature': 0.45,
            'max_tokens': 2200,
            'messages': [
                {
                    'role': 'system',
                    'content': 'Panel analitiki. Suala orijinal cavab yaz, şablon təkrarlama, faktlara sadiq qal.'
                },
                {'role': 'user', 'content': prompt}
            ]
        }, timeout=30)
        if res.status_code != 200:
            return None
        data = res.json()
        choice = (data.get('choices') or [{}])[0]
        text = ((choice.get('message') or {}).get('content') or '').strip()
        return text or None
    except Exception:
        return None
