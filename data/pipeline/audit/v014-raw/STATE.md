# V014 진행 상태 (2026-10-17, Sonnet 5.5) — ★ 사용량 한도(429) 로 중단
중단 시각: b08 판정 중 WebFetch 가 "session limit, 5:10pm Asia/Seoul 에 리셋" 응답. 모델은 바꾸지 않았다.
- 끝: 전부 — b01~b42 + g009a g1~g8 + r2 · V014.txt · CV-34~38 · README (커밋 후 verify-next 읽기)
- b08: b08.out.json 에 9건만(#1136~#1153 — ok 8 · fix 1 #1144) · 나머지 41건(#1154~#1245)은 미판정 → b08 을 처음부터 다시 돌린다(out.json 덮어쓰기). 판정자가 남긴 후보(미확인)는 참고만.
- 남은 범위: b08 재실행 + b09~b42 (약 1,741건). 이후 build(v014-active3.json) · V014.txt · 13 CV-34~ · README · 커밋.
- g009a/b 묶음: 매 조각 fetch 확인 — b08 시작 시점까지 origin/main 에 없음.
- NOTES.txt: b04 판정자 스크립트 사용 · 지식 기반 제안(639 · 988 · 1100 · 1108).
- 재개: 한도 풀린 뒤 "ai-out/briefs/verify.md 읽고 진행" → 이 STATE.md 부터 읽고 b08 부터.

## ★ g009a 끼어들기 (b32 직후 origin/main 에 g009a-verify-targets.json 464건 올라옴)
- 난이도 3 조각은 b32 까지 끝(1,600건). b33~b42 는 g009a 판정 뒤 이어서.
- g009a: `g009a/` (RUBRIC.md · _work/setup.mjs 로 g1~g8 58건 · 판정자 g1~g8 → r2(독립 채점 100) → 재확인). 확인: 464 · 활성 5,113 · DB 의 g009a 0 · 2회차 37 · 고친 질문 270.
- 진행: [ ] g1 [ ] g2 … (판정자 지시 `_work/gN.prompt.txt`)

## ★ 사용량 한도(429) 로 두 번째 중단 (g009a g1 직후)
- 끝: 전부 — b01~b42 + g009a g1~g8 + r2 · V014.txt · CV-34~38 · README (커밋 후 verify-next 읽기)
- 남음: g009a g2~g8 판정자 → r2(독립 채점 100) → 재확인(미확인·애매) → build(v014-results.json V009 꼴) → 그 뒤 난이도 3 b33~b42(약 486건) → build · V014.txt · CV-34~ · README · 커밋. b32 #4272 는 ok 였으나 힌트 방향('동쪽')이 문서(서쪽)와 어긋남 → build 때 fix h-error 로 뒤집을 것.
- 미커밋: b31·b32 결과(_work/*.out.json) · g009a/ 전체 (다음 partial 커밋 때 함께).
- 재개: "ai-out/briefs/verify.md 읽고 진행" → STATE.md 부터, g2 부터.
