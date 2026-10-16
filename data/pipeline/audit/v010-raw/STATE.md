# V010 진행 상태 (2026-10-17, Sonnet 5.5)

브리핑: `ai-out/briefs/verify.md` (V010). 기준: `RUBRIC.md` — 이 폴더(V009 난이도 읽기 이어받음 + 오래된 짧은 질문 보정 12). 작업 사본: `_work/` (setup.mjs · mkprompt.mjs · mkh.mjs · chk.mjs · pN.prompt.txt · pN.txt). 대상 id 고정: `targets-ids.json`(DB 에서 한 번 떠 고정 — G007 이 g005 행을 넣어도 대상은 이 목록). 스크래치 입력(targets.json · hint14.json)은 세션 scratchpad `v10/` — 새 세션이면 `V10SC=<dir> node _work/setup.mjs` 를 다시 돌리면 만들어진다(DB 읽기만; 단 g005 가 들어간 뒤라도 source_ref 필터로 같은 608 이 나온다).

## 원칙 7 (브리핑 사실 확인) — `_work/summary.json`
- 활성 4,630 · 활성 상(4~5) 718 · g003 상 110 · 대상 608 (4 = 582 · 5 = 26 · 전부 score-v1) · g005 행 0 · G006 GEN 힌트 14 = 브리핑 id 목록과 같고 DB 힌트 = g006-fixes after — 전부 일치. 다른 점 없음.
- 묶음: media 100 · arts 107 · science 122 · history 134 · life 80 · sports 39 · korea 26 (수작업 6 은 소분류로 근사 매핑). 소분류 217.

## 조각
p1~p8 (76건씩, id 해시로 섞음) · r2 120 (조각당 15, 두 번째 채점자) · h1 (나) 14. 판정자 한 번에 2개.

## 진행
- [x] setup · RUBRIC(보정 12)
- [x] 판정자 p1~p8 · r2 · h1
- [x] 재독(내림 무작위 20% 77 + 갈림 28) · build · V010.txt · 13 CV-18~20 · README — 커밋 참조
