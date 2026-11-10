[MAIN R090 마무리 — **못 돌린 끝 점검만 다시**(코드 변경 없음이 기본) · 20~30분 · ★ GEN · VERIFY 창이 쉬고 있을 때(메모리)]  (이 파일이 지시 전체)
TASK: R090(df737ca0)은 끝 점검 도중 PC 메모리가 모자라 **봇 mgonly · ui-check r088 · r087 · main-behavior** 를 못 돌렸다(ai-out/R090.txt 끝 점검 표 "★ 못 돌린 것"). 정규화(특수문자 무시)와 주제 추첨(group)을 건드린 라운드라 이 넷은 꼭 봐야 한다.
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5`)
■ 할 일
1. 남는 메모리 확인(3GB 미만이면 멈추고 한 줄) · quizweb_test · 메뉴 15 규칙 그대로 · 실 DB 쓰기 0.
2. `node scripts/bot.mjs mgonly --url http://localhost:3400`(기본 포트 3200 이 윈도 예약 범위에 막히면) → `node scripts/ui-check-bundles.mjs r088 r087 main-behavior` — 한 번에 하나씩(묶어서 돌리지 않는다).
3. 실패가 있으면: R090 변경 때문인지 낡은 기대인지 가려서 — 진짜 결함이면 고치고(작게) · 낡은 기대면 기대를 고치고 사유를 적는다. 봇 기본 포트가 계속 막히면 기본값을 예약 범위 밖으로 옮긴다.
4. `ai-out/R090.txt` 끝 점검 표의 "★ 못 돌린 것" 줄을 결과로 바꾸고(통과 수) · 05 · 06 한 줄 · 커밋 1 · push.
■ 하지 말 것: 새 기능 · 다른 수정 · data/ · web-desk.
■ 터미널 마지막 줄: "R090 마무리 끝 — mgonly n · r088 n · r087 n · main-behavior n · /clear 해도 됨".
■ 답변: 한국어 · 터미널 5줄 이내.
■ ★ 이어서: 커밋 · push 뒤 **`ai-out/briefs/main-next.md`(R091 라이어 이의제기)를 읽고 같은 창에서 바로 시작**(없거나 첫 줄 "보류" 면 멈춤).
