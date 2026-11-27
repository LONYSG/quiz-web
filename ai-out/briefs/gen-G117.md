[GEN — ★ **G117 · 새 카드 7차 62장 싣기** : DB 쓰기(dev + 실) · 카드 글은 한 글자도 고치지 않는다 · 하위 에이전트 없이 · 어림 30분]  (이 파일이 지시 전체 · 방법은 `gen-G116.md` 와 같다 · 앞 보고 `ai-out/G116.txt` · 스크립트 `scripts/g116-apply.mjs` 를 본떠 `g117-apply.mjs`) (설계 2026-11-27)

실행 모델: Opus 5.5.

1. 싣기(멱등 · `--undo` · 꼬리표 '#g117-' · 실 백업 먼저)
   1-1 V115 A ok 47장 — 판정 `data/pipeline/audit/v115-newcards.json`(done true) 에서 chunk 81~90 · verdict ok 인 key 만. 카드 = `web-desk/tone/받은것/새카드-81~90.json` 의 같은 key(ready) · 재료 = `web-desk/tone/보낼것/새재료-81~90.json`.
   1-2 V115 B ok 15장 — 같은 판정의 chunk "고침-7" · verdict ok. 카드 = `web-desk/tone/받은것/새카드-고침-7.json` 의 같은 key(고친 판 · ready) · 재료 = `web-desk/tone/보낼것/새카드-고침-7.json` 의 `material`. 이 가운데 n6382 · n6384(V114 fix 였던 두 장)도 이번에 싣는다.
   1-3 판정의 `alsoAdd` 는 인정어에 더한다 · `second` 가 있으면 출처에 함께.
   1-4 fix 3장(n6484 · n6590 · n6182)은 싣지 않는다(gpt 고침-8 → 설계가 대조 뒤 다음 GEN). n6543(need)도 싣지 않는다.
   1-5 게이트는 그대로 건다 — 걸리면 싣지 말고 보고.
2. 끝 점검: 활성 수(실 8,257 + 실은 수 · dev 7,780 + 실은 수) · hint-check-active 막힘 0.
3. 보고 `ai-out/G117.txt`(짧게 · G116 꼴): 실은 수 · 못 실은 것과 까닭 · 소분류 '?' 표 · 되돌리기 명령.
■ 끝: 내 산출물만 `git add` · 커밋 전 `git fetch` → `git rebase --autostash` · push · 멈춘다.
