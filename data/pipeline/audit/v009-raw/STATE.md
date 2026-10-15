# V009 진행 상태 (2026-10-15, Sonnet 5.5)

브리핑: `ai-out/briefs/verify.md` (V009). 기준: `RUBRIC.md` — 이 폴더(blind 재채점 · rewrite 확인 · CV-11/12). 작업 사본: `_work/` (setup.mjs · mkprompt.mjs · chk.mjs · pN.prompt.txt · pN.txt). 스크래치 입력(items.json)은 세션 scratchpad `v9/` — 새 세션이면 `V9SC=<dir> node _work/setup.mjs` 를 다시 돌리면 만들어진다(DB 읽기만).

## 원칙 7 (브리핑 사실 확인) — `_work/summary.json`
- targets 493 · 묶음 korea 110 · sports 84 · life 89 · media 60 · arts 50 · science 50 · history 50 · GEN 최종 상 307 · rewrite.changed 227 · false 65 · 없음 201 · 힌트 464 (web 454 · knowledge 10) · 2회차 34 · 같은 정답 활성 50 · 미디어 알 가치 2 = 24 · 변형 181 문항 · 227 · 활성 4,630 · DB 의 g005 source_ref 0 — 전부 일치.
- G005 5절의 "출처가 약한 것" · 단정어 경고: assertive 문장 히트 124(힌트 포함 153) — 139 는 보고서 값(게이트 경고). 다른 점 없음.

## 조각
p1~p8 (61~62건, id 해시로 섞음 — 묶음 편중 없음). 브리핑은 125 안팎 4조각이었으나 입력이 조각당 280KB 라 8조각으로 줄였다(웹을 여는 판정자의 문맥). 판정자는 한 번에 3개.

## 진행
- [x] setup · RUBRIC(보정 표본 10 직접 읽기)
- [x] 판정자 p1~p8 · 확인자 x1~x4 y1 y2 · 2차 채점자 r2
- [x] 재독(fix·drop 192 + ok 32) · build · V009.txt · 13 CV-14~17 · README — 커밋 참조
