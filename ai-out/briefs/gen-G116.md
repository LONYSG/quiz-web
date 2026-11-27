[GEN — ★ **G116 · 새 카드 6차 10장 싣기** : DB 쓰기(dev + 실) · 카드 글은 한 글자도 고치지 않는다 · 하위 에이전트 없이 · 어림 20분]  (이 파일이 지시 전체 · 방법은 `gen-G115.md` 와 같다 · 앞 보고 `ai-out/G115.txt` · 스크립트 `scripts/g115-apply.mjs` 를 본떠 `g116-apply.mjs`) (설계 2026-11-27)

실행 모델: Opus 5.5.

1. 싣기(멱등 · `--undo` · 꼬리표 '#g116-' · 실 백업 먼저)
   1-1 V114 ok 10장 — 판정 `data/pipeline/audit/v114-newcards.json`(done true) 에서 verdict ok 인 key 만. 카드 = `web-desk/tone/받은것/새카드-77~79.json` 의 같은 key(ready) · 재료 = `web-desk/tone/보낼것/새재료-77~79.json`. 판정의 `alsoAdd`(기계 터크 표기 다섯 등)는 인정어에 더한다 · `second` 가 있으면 출처에 함께.
   1-2 fix 2장(n6382 · n6384) · 새카드-80 은 싣지 않는다(고침 판이 VERIFY V115 로 간다).
   1-3 게이트는 그대로 건다 — 걸리면 싣지 말고 보고.
2. 끝 점검: 활성 수(실 8,247 + 실은 수 · dev 7,770 + 실은 수) · hint-check-active 막힘 0.
2-1 덤(MAIN R123 이 찾음): `pipeline/src/select.test.ts:236` 소분류 수 기대값 307 → 실제 318(G113 이 11-26 에 소분류를 더한 뒤) — 실제 수를 확인해 기대값만 맞추고 주석에 '★ G113 +11' · 그 테스트 파일만 돌려 통과 확인.
3. 보고 `ai-out/G116.txt`(짧게): 실은 수 · 못 실은 것과 까닭 · 소분류 '?' 표 · 되돌리기 명령.
■ 끝: 내 산출물만 `git add` · 커밋 전 `git fetch` → `git rebase --autostash` · push · 멈춘다.
