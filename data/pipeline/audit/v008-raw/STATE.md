# V008 진행 상태 (2026-10-15, Sonnet 5.5)

브리핑: `ai-out/briefs/verify.md` (V008). 기준: `RUBRIC.md` — 이 폴더. 작업 사본: `_work/` (setup.mjs · prep.mjs · mkprompt.mjs · chk.mjs · jN.prompt.txt). 스크래치 입력(ga.json · na.json · da-all.json · qrows.json)은 세션 scratchpad `v8/` — 새 세션이면 `V8SC=<dir> node _work/setup.mjs` 를 다시 돌리면 만들어진다(DB 읽기만).

## 원칙 7 (브리핑 사실 확인) — `_work/summary.json`
- 활성 4,630 맞음 · G002 general_hint 486행 = 중 힌트 484 + #3930 + #741 · V007 표본 50 전부 484 안 → 나머지 **434**, 그중 DB 힌트가 G002 after 그대로인 것 **433** (#3942 만 G004 가 다시 바꿈 → (나) 로).
- (나) rows.db by=gen 31 맞음(꼴 빼기 19 · 꼴만 2 · H12 1 · 힌트↔힌트 3 · V007 쌍 5 + 표본 1) · rows.g003 by=gen 10 = 힌트 7 · 질문 1 · 해설 1 · discarded 1(A2-01 — 문구 아님) → 판정 40.
- 15 에 H12 있음. (다) 후보 246 (활성 힌트 2,447 중 같은 정답 다른 활성 문항이 있는 것 753; 구절·숫자 겹침 246; 이미 고친 쌍 제외) — 400 미만이라 전부 판정.

## 조각
g1 145 · g2 144 · g3 144 ((가) 433) · n1 40 · d1~d3 82 ((다) 246). 판정자는 한 번에 2개.
(브리핑 "조각 150 안팎" 준수 — (다) 만 쌍을 읽느라 82.)

## 진행
- [x] setup · prep · RUBRIC(보정 표본 10 직접 읽기)
- [x] 판정자 g1 g2 g3 n1 d1 d2 d3
- [x] VERIFY 재독 · 사실 무작위 40 · 의심 97 · 제안 22 · C66 목록
- [x] build · V008.txt · 13 · README — 커밋 c 참조
