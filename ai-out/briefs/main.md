[MAIN R097 — ★ **검사 정리 라운드**(R096 끝 점검에서 드러난 `npm run verify` 낡은 기대 · 기존 결함 4 묶음 7건 — R096 과 무관하지만 "통과 아님" 으로 남았다) + **노래 평가 보고 명령**(R096 2절 ⑤) — 작은 라운드 · D-354 · 10 77절 · 코드 = 검사 스크립트 위주 · 게임 규칙 변경 0 · 1.5~2시간 · 찬종이 플레이하는 동안 돌려도 됨(실 3000 은 worktree · 이 트리는 dev)]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: R096 보고서 3절 — `npm run verify` 단계별에서 social 59/61 · leave 27/28 · spam 18/19 · minigame 18/21 이 남았고, MAIN 은 "R096 이 건드리지 않은 곳 · 낡은 기대로 추정 · 언제부터인지 모름" 이라 적었다. 이 라운드는 **그 7건을 하나씩 재현 → 낡은 기대면 기대를 지금 규칙에 맞게 고치고(어느 라운드 · D 번호가 규칙을 바꿨는지 한 줄) · 진짜 결함이면 고친다** → verify 전체가 통과하는 상태로 되돌린다. 더해서 R096 ④ "모르는 노래 👎 가 minigame_results.input.rate 에 쌓인다 — 보고 스크립트 없음" → **`npm run song:feedback`**(곡별 👍 👎 사유 집계 · 실 quizweb 읽기만 · reports:report 꼴 출력 · 노래 id · 제목 · 가수 · 👎 수 · 사유별) 를 만든다.
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5`)

■ 고정 규칙: docs/16 그대로 — **작은 라운드 끝 점검**(§F) 이지만 이 라운드의 산출물이 verify 라 **`npm run verify` 전체 단계별 통과**가 끝 점검이다. 번호: **D-354** · 10 **77절** · 13 에 A 는 없음(체감 없음) · 05 · 06 · README R. 하위 에이전트 0 · 실 DB 쓰기 0(song:feedback 은 읽기만) · 실 3000 · 터널 건드리지 않음 · 게임 규칙 · 화면 변경 0(결함이 진짜라 고쳐야 하면 고치되 보고서 "판단" 에 — 화면이 바뀌면 전·후 그림).
■ 먼저 읽기: `ai-out/R096.txt` 3절(실패 7 · 봇 1회차 고침 7) · docs/10 76절 · `scripts/ui-check*.mjs` 의 social · leave · spam · minigame 묶음 · 07 D-314(이모티콘 도배 제한 기본 끔) · D-325(공개 때 키보드) · `server/src/db/*`(minigame_results.input.rate 꼴 — R096 D-353) · `scripts/reports-report.mjs`(출력 꼴).
■ 할 일
A. **낡은 기대 넷**: spam A "6번째 이모티콘 도배 안내"(R071 D-314 — 제한 기본 끔 → 기대 = 설정 켰을 때만 검사 · 또는 켜고 검사) · minigame E "그림 모음 물건 넷"(지금 12 → 기대 ≥ 4 가 아니라 목록 실제 수) · social B 확인 팝업 [취소] 없이 ✕(어느 라운드가 [취소] 를 뺐는지 찾아 기대 고침 — 못 찾으면 결함으로) · leave E 밤 테마 첫 글자 색 rgb(18,18,18)(밤 테마 토큰이 바뀐 라운드 찾기 → 기대 = 토큰 값).
B. **진짜 결함 후보 셋 재현**: minigame E 케이크 입력 오차(−0.42 · −0.84 · −1.23초 · 한 명 미제출 — 봇 타이밍인지 서버 판정인지 · R094 메모와 같은 꼴인지) · M2-lab "회원가입 탭 못 찾음"(실험실 뒤 홈 이동 — R094 메모) · social third 페이지 예외(null.closest — 어느 화면 · 어느 요소). 재현되면 고치고(코드 ≤3 파일) · 재현 안 되면 잰 값과 함께 "재현 안 됨".
C. **`npm run song:feedback`**: `scripts/song-feedback.mjs` — minigame_results 에서 game='song'(방식 판 · 미니게임 판 둘 다) 의 input.rate 를 곡별로 모아 👍 n · 👎 n(사유별: 모르는 노래 · 너무 쉬움 · 표기 이상 · 미리듣기 이상) · 제목 · 가수 · 연도 · 분류 · 👎 많은 순 · `--since 7d` · `--db dev` 옵션 · 출력 tmp/song-feedback.md 도. 봇 song 시나리오가 평가를 남기니 quizweb_test 로 검사.
D. 10 77절(낡은 기대가 왜 남았나 — verify 전체를 라운드마다 안 돌린 탓 · 앞으로 큰 라운드 끝 점검은 verify 전체 단계별) · 07 D-354 · 05 · 06 · README · `ai-out/R097.txt`(0 ★ 찬종이 볼 것: 7건 결과 표(낡은 기대/결함/재현 안 됨) · song:feedback 출력 예 · 1 한 것 · 끝 점검 표 = verify 전체 단계별 · 2 결정 필요).
■ 하지 말 것: 게임 규칙 · 화면 디자인 · 노래 데이터 · 실 DB 쓰기 · 마이그레이션 · R096 2절 ①~④(찬종 체감 뒤).
■ 커밋: 단계마다(A · B · C · D) · fetch → rebase --autostash → push(503 = VPN) · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
■ 터미널 마지막 줄: "R097 끝 — /clear 해도 됨".
■ 답변: 한국어 · 터미널 5줄 이내.
