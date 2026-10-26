"""Deploy serverində chatbot açarının olub-olmadığını yoxla (sirri çap etmir)."""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import config  # noqa: F401
from chat_llm import chat_llm_ready, _keys

g, o = _keys()
print('cwd:', os.getcwd())
print('.env path:', os.path.join(ROOT, '.env'))
print('.env exists:', os.path.isfile(os.path.join(ROOT, '.env')))
print('GEMINI_API_KEY set:', bool(g), 'len=', len(g or ''))
print('OPENAI_API_KEY set:', bool(o), 'len=', len(o or ''))
print('CHAT_LLM_PROVIDER:', os.environ.get('CHAT_LLM_PROVIDER') or '(empty)')
print('OPENAI_MODEL:', os.environ.get('OPENAI_MODEL') or '(empty)')
print('chat_llm_ready:', chat_llm_ready())
if not chat_llm_ready():
    print('FAIL: Server .env-yə OPENAI_API_KEY=... əlavə edib prosesi restart edin.')
    raise SystemExit(1)
print('OK: chatbot açarı tapıldı.')
