# V015 진행 상태 (2026-10-18, Sonnet 5.5)
브리핑 verify-next(V015): ① g009b 없음 ② items-2.json 없음(조각마다 fetch 로 재확인) → ③ 활성 난이도 4·5 = 505 **끝**(c01~c11 · ok 379 · fix 126 = 25.0% → audit/v015-active4.json) → ④ 활성 난이도 2 = 1,465 (원칙 7 ✔) 조각 d01~d30 (`v015-raw/d/`).
- 기준 RUBRIC.md(V014 + 난이도 재채점 안 함) · `_work/`(c) · `d/_work/`(setup · mkprompt · chk · prompt) · build.mjs(c 용 — d 용은 d/_work 로 복사해 경로 손질)
- 조각마다 git fetch → g009b / items-2.json 확인(나타나면 끼어들기).
- 진행: [ ] d01 …
- 막히면(429) 여기부터: d 의 어느 조각까지 out.json 이 있는지 보고 이어서.
