#!/usr/bin/env python3
"""Run chat_eval.json against answer_chat (same path as /api/chat/replay)."""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import chat_llm
from chat_llm import answer_chat, chat_llm_ready
from chat_tools import SnapshotTools


FIXTURE_SNAPSHOT = {
    'meta': {
        'user': 'Sabina Mammadova',
        'today': '2026-10-22',
        'sprint': 'Sprint 12',
        'week': 'Sprint 12',
        'prevWeek': 'Sprint 11',
    },
    'overview': {
        'total': 100, 'done': 40, 'open': 60, 'late': 16, 'blocked': 3,
        'progress': 20, 'planned': 5, 'due': 12, 'dueDone': 4, 'rate': 33,
        'completionPct': 40, 'backlog': 8,
    },
    'tasks': [
        'DGD-100|İcradadır|Sabina Mammadova|High|2026-10-01|İnteqrasiya|Sprint 12|0|1',
        'DGD-101|Bloklanıb|Sabina Mammadova|Highest||İnteqrasiya|Sprint 12|1|0',
        'DGD-102|Yekunlaşıb|Ali Vəliyev|Low||EXQ|Sprint 11|0|0',
        'DGD-103|İcradadır|Ali Veliyev|Medium|2026-10-20|EXQ|Sprint 12|0|1',
        'DGD-104|Planlaşdırılıb|Nigar|Low||Diaqnostika|Sprint 12|0|0',
        'DGD-200|İcradadır|Orxan|High||Digər|Sprint 12|0|0',
    ],
}


def load_eval(path: str):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    parser = argparse.ArgumentParser(description='AI Done chat eval')
    parser.add_argument(
        '--file',
        default=os.path.join(ROOT, 'tests', 'chat_eval.json'),
        help='Eval JSON path',
    )
    parser.add_argument('--limit', type=int, default=0, help='Only first N questions (0=all)')
    parser.add_argument('--ids', default='', help='Comma-separated question ids')
    parser.add_argument('--dry', action='store_true', help='Print questions only, no LLM')
    args = parser.parse_args()

    items = load_eval(args.file)
    if args.ids:
        want = {int(x) for x in args.ids.split(',') if x.strip().isdigit()}
        items = [x for x in items if int(x.get('id') or 0) in want]
    if args.limit and args.limit > 0:
        items = items[: args.limit]

    print('questions:', len(items))
    print('llm_ready:', chat_llm_ready())
    # Sanity: fixture tools
    tools = SnapshotTools(FIXTURE_SNAPSHOT)
    print('fixture late:', tools.get_risks().get('lateCount'))

    if args.dry or not chat_llm_ready():
        for row in items:
            print(f"[{row.get('id')}] ({row.get('category')}) {row.get('question')}")
        if not chat_llm_ready():
            print('\nLLM açarı yoxdur — yalnız siyahı çap olundu. .env-ə GEMINI_API_KEY və ya OPENAI_API_KEY yazın.')
        return 0

    ok = 0
    warn = 0
    fail = 0
    for row in items:
        qid = row.get('id')
        q = row.get('question') or ''
        cat = row.get('category') or ''
        t0 = time.time()
        answer = answer_chat(q, {'hint': cat, 'intent': cat}, '', [], snapshot=FIXTURE_SNAPSHOT)
        meta = getattr(chat_llm, 'LAST_META', None) or {}
        ms = int((time.time() - t0) * 1000)
        tools_used = meta.get('tools_used') or []
        ncheck = meta.get('number_check') or ''
        status = 'OK' if answer else 'FAIL'
        if not answer:
            fail += 1
            status = 'FAIL'
        elif ncheck == 'warn':
            warn += 1
            status = 'WARN'
        else:
            ok += 1
        print('-' * 60)
        print(f"#{qid} [{cat}] {status}  {ms}ms  tools={tools_used}  number_check={ncheck}")
        print('Q:', q)
        print('A:', (answer or chat_llm.LAST_ERROR or '')[:500])

    print('=' * 60)
    print(f'done ok={ok} warn={warn} fail={fail}')
    return 0 if fail == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())
