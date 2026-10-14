# V007 진행 상태 (2026-10-14, Sonnet 5.5)

브리핑: `ai-out/briefs/verify.md` (V007). 기준: `RUBRIC.md`(가) · `RUBRIC-N.md`(나·다) — 이 폴더. 작업 사본: `_work/` (setup.mjs · prep.mjs · chk.mjs · PROMPT.md · jN.txt/jN.refs.json). 스크래치 입력(items.json · sample50.json · pairs29.json)은 세션 scratchpad `v7/` — 새 세션이면 `_work/setup.mjs` 를 다시 돌리면 만들어진다(DB 읽기만).

## 끝난 것
- 원칙 7 건수 확인: `_work/summary.json` — 490 · 묶음 · 난이도 8/77/252/149/4 · 알 가치 2 = 23(전부 미디어) · 힌트 405 · 경계 98(+나쁜 어려움 의심 1) · 2회차 9 · 쌍 ok 쪽 29 · 활성 4,143 · 같은 정답 활성 1건 16 (+별칭 일치 1: 골동반↔#162). 다른 점: ① 단정어 경고 98 은 항목 88 의 문장 히트 98 ② g002-fixes 의 필드 이름은 `general_hint`(브리핑의 hint) 이고 486행 중 중 힌트 484 + #3930 + #741.
- 보정 표본 10건(상 4 · 중 4 · 미디어 2) 읽기 → RUBRIC.md 맨 아래.
- 조각: j1 korea 82 · j2 korea+sports 82 · j3 arts+life 69 · j4 life+arts 69 · j5 media 65 · j6 science 65 · j7 history 58 · j8 (나)50+(다)29 — 한 번에 3개.

## 남은 것
1. 판정자 j1~j8 (결과 `jN.pNN.json` 15건씩 → `jN.out.json`) 2. VERIFY 재독(fix·drop·unsure 전부 + 경계 98 + ok 10%) 3. 사실 표본 60 (webOpen 아닌 것) 4. 누적·중복 5. build → `data/pipeline/audit/v007-results.json` 6. `ai-out/V007.txt` 7. 13-PENDING(C64·C63(2)·C65·CV-07~) · README V 표 8. 커밋(허용 다섯 곳만) · push

## 완료 (2026-10-14)
V007 보고서·결과·13-PENDING·README 모두 끝. 판정자 j1~j8 · 확인자 t1~t3 · override(`_work/ov-j*.json`) · build(`_work/build.mjs`) · report(`_work/report.mjs`) · docs(`_work/docs7.mjs`). 스크래치 입력 items.json(2.6MB)은 커밋하지 않았다 — `_work/setup.mjs` 가 DB 읽기로 다시 만든다. 커밋·push 는 아래 커밋 참조. 이 STATE 는 기록용이다.
