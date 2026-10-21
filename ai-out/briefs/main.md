[MAIN R059]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다. 짧은 라운드 — 끝나면 멈춘다)
TASK: ⓪ **R058 마무리 확인** — 2026-10-21 22시 기준 origin 에 `ai-out/R058.txt` · 10 39절 · README R 표 · 13 A86 체감 줄이 없다(마지막 push 51b576a = R058 D). 안 끝난 것(끝 점검 C · 문서 E · 보고 F · push)을 **먼저** 끝낸다. 끝 점검을 메모리로 못 돌렸으면 못 돌린 목록을 R058.txt 에 적고 넘어간다. ① **제보 채택 · 보너스 포인트**(찬종 2026-10-21 밤 결정) — `0023 point_grants` · 채택 표시 · 채택/지급 스크립트 · 화면 안내 문구 · 받은 사람 알림
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` · 바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (번호 — R058 이 쓴 다음: **D-253 · A87** · 마이그레이션 **0023** · 10 **40절**(R058 이 39 를 안 썼으면 R058 몫이 39 · 이 라운드가 40)). 하위 에이전트 ≤1 · 경량 ui-check(R053 묶음). ★ **메모리**: GEN(G019 상 생성) · VERIFY(V023 판정자 1개)가 같이 돈다 — 띄우기 전 남는 메모리 1.5GB 미만이면 2분 × 10 대기 · ui-check · 봇 전부는 **3GB 이상**일 때만(아니면 10분 × 6 대기 뒤 못 돌린 목록). 셸이 회수되면 같은 명령을 다시 걸지 않는다.
■ ★★ 동시 라운드 — GEN(G019 — data/ · pipeline · 15 · 05 Track D/E · 06 · 07 DG- · 13 C · README G · tmp/) · VERIFY(V023 — audit · 13 CV · README V). MAIN 몫: server/ client/ shared/ scripts/(feedback-* · points-*) migrations · 01 · 03 · 10 · 13 A · 07 D- · DB-ADMIN · PLAY-GUIDE · 05 · 06 · README R. 쓰기 직전 fetch · rebase · 내 파일만 add · force 금지 · 찬종 PC dev 서버(3000)·터널·브라우저 안 건드림.
■ 토큰: 넉넉하다.

■ 먼저 읽기
- ai-out/R056.txt(설문 구조 — 0020 question_feedback · 사유 코드 7 · `scripts/feedback-report.mjs` · 결과 화면 목록 · 로비 링크) · R058.txt(있으면 — A80 접힘) · docs/16 **§7**(제보 반영 흐름 — 이번에 새로 씀) · 13 A80 · A86
- server/src/db/points.ts(`POINTS_SQL` 세 항 — correct · rewards · spent) · server/src/db/stats.ts · server/src/http/shopRoutes.ts(잔액을 어디서 읽는지) · shared/src/feedback.ts · shared/src/achievements.ts(업적 꼴) · client GameResult(목록 머리 — R058 접힘) · Lobby(지난 판 평가 링크) · docs/03(question_feedback · minigame_rewards · point_spends) · DB-ADMIN(관리자 포인트 지급 절)
- ★ 지금 관리자 지급은 **가짜 미니게임 판**으로 넣었다(2026-10-21 새벽 · 설계 에이전트): minigame_runs #274(minigame_key 'admin-grant' · room_id 'admin' · end_reason 'admin_grant') + minigame_rewards #219(account 3556 = 123qwe · 70 · rank 0). 이 라운드에서 point_grants 로 옮긴다(아래 A).

■ 찬종의 말 (2026-10-21 밤 · 원문)
- "가장 도움이 된 제보를 한 유저에게 보너스 포인트를 주도록 하자. (평가 버튼에도 그러한 내용을 기재하면 좋을듯)"
- "피드백들을 모아서 나한테 브리핑 하고 나랑 상의 후에 적용할 수 있도록 하는거야." → 채택은 **사람(찬종)이 정한다**. 자동 채택 없음. 흐름은 16 §7.

■ 설계 판단 (찬종 확인 전 — 권장안 · 수치는 스크립트 기본값이라 되돌리기 쉽다)
- **0023 `point_grants`**: id · account_id FK(계정 지우면 같이) · amount int > 0 · reason text('feedback_adopted' | 'feedback_monthly_top' | 'admin') · ref_type text null('question_feedback') · ref_id bigint null · note text null(≤200) · created_at · **seen_at** null(알림 한 번). 인덱스 (account_id, created_at). `POINTS_SQL` 에 넷째 항 `grants` = sum(point_grants.amount) · `pointsFromRow` · 잔액 = correct + rewards + grants − spent. stats · 업적이 minigame_rewards 를 읽는 자리는 그대로(grants 는 전적이 아니다).
- **이관**: 0023 안에서 minigame_rewards #219 → point_grants(account 3556 · 70 · reason 'admin' · note '2026-10-21 수동 지급(이관)' · seen_at = now()) 넣고 rewards #219 · runs #274 지움. 123qwe 잔액 **97 그대로**인지 마이그레이션 앞뒤로 확인(바뀌면 멈추고 0절).
- **채택 표시**: question_feedback 에 `adopted_at` null · `adopted_grant_id` FK point_grants null(0023 같은 파일). UNIQUE(question_id, account_id) 는 그대로.
- **스크립트 둘**(scripts/ · package.json): ① `npm run feedback:adopt -- --id <question_feedback.id> [--points 5] [--note "..."]` — 백업 안내 한 줄(`db:backup` 을 먼저 하라고 찍고 `--yes` 없으면 묻지 말고 멈춤 — 세션은 사람에게 묻지 않는다 · 찬종이 직접 돌리는 명령) · 한 트랜잭션(adopted_at + grant) · 이미 채택이면 거부 · 봇 계정이면 거부 · 끝에 "닉네임 +5P (문제 #id 앞 40자)". ② `npm run points:grant -- --login <login_id> --points N --reason feedback_monthly_top|admin [--note]` — 월 최다 채택 · 수동 지급(가짜 판 방식 폐기 · DB-ADMIN 절 갈아 끼움). `feedback:report` 에 채택 표시(✔ +5P · 누가 · 언제)와 **"채택된 제보 사람별 합계"** 절(월별) 추가.
- **금액 기본값**(코드 고정 아님): 채택 1건 **5P**(정답 1개 = 1P · 미니게임 1등 보상 수준과 비교해 체감되되 과하지 않게) · 월 최다 채택 **+30P**. 찬종이 `--points` 로 바꾼다.
- **화면 문구(넷)**: ① 결과 화면 "이번 판 문제 평가" 머리 아래 작은 한 줄 "👎 사유·의견이 채택되면 보너스 포인트를 드려요(채택 1건 5P)" — 접혀 있어도 보이게(머리 줄에) ② 로비 "지난 판 문제 평가" 링크 옆 같은 뜻 짧게("채택되면 포인트") ③ 공개 화면 👎 버튼은 **글자 추가 없음**(카드 높이 고정 — R056 ±1px) · title/툴팁만 ④ **알림**: 로그인 뒤 로비에서 seen_at null 인 grant 가 있으면 토스트 한 번 "제보가 채택됐어요 +5P · '문제 앞 30자'" → seen_at 기록(여러 건이면 합쳐서 한 번). 접속 중 소켓 알림은 **있으면 좋고 없어도 됨**(로비 토스트가 기본 · 20줄 넘게 번지면 뺌).
- **업적(있으면)**: achievements.ts 꼴로 "문제 감별사" 채택 1회 · 5회. 업적 체계가 grants 를 읽기 어렵거나 30줄 넘게 번지면 **뺌**(13 A87 에 "다음에" 한 줄).
- 상점(shopRoutes)·프로필 잔액이 grants 를 포함하는지 확인 · 포인트 내역 화면이 **있다면** "제보 채택" 줄 — 없으면 만들지 않는다.

■ 할 일 (항목마다 "다 됐다" · 단계마다 커밋)
⓪. R058 마무리 — 위 TASK ⓪ (있는 그대로 · 없으면 "이미 끝남" 한 줄).
A. 0023(point_grants · question_feedback 두 칸 · #219/#274 이관) · POINTS_SQL · pointsFromRow · 테스트(잔액 넷 합 · 이관 뒤 123qwe 97) — 다 됐다 = migrate OK · 잔액 테스트 통과.
B. 스크립트 둘 · feedback:report 보강 · 테스트(채택 두 번 거부 · 봇 거부 · --yes 없으면 멈춤 · 합계) · 봇 `grant` 10 안팎(채택 → 잔액 → 토스트 한 번 → seen_at).
C. 화면 넷 · 그림(PC 결과 머리 줄 · 로비 · 토스트 · m390) · ui-check r056 묶음 + 토스트 묶음.
D. 끝 점검 — 메모리 규칙대로: 게이트 → 봇(grant + R058 에서 못 돌린 것이 있으면 같이) → ui-check. 다 됐다 = 10 40절 표 · 못 돌린 것은 사유.
E. 문서 — 01(15장 결과 목록 문구 · 5장 로비 · 포인트 장에 "제보 채택" 원천) · 03(point_grants · question_feedback 두 칸) · 07 D-253(point_grants 신설 · 가짜 판 폐기 · 기본 5P/30P) · 13 A87(찬종: 채택 토스트 · 문구 체감) · DB-ADMIN(관리자 지급 = points:grant · 채택 = feedback:adopt · 잔액 쿼리에 grants) · PLAY-GUIDE 한 줄 · 05 · 06 · README R · `ai-out/R059.txt`.

■ DB 쓰기: 허용 — 0023 · 이관 · 봇 테스트 행(백업 뒤). **questions · minigame_items 금지.** 실제 사람 계정에 grant 를 넣지 않는다(테스트는 봇 계정만).
■ 하지 말 것: 평가 UI 재설계 · 공개 카드 높이 변경 · 자동 채택 · 사람 계정 지급 · A82 · 새 상점 품목 · 15 · pipeline · 13 C/CV · README G/V · force push.
■ 확인할 것 (원칙 7): R058 마지막 번호(D-252 · A86 · 0022 · 10 39절 유무) · minigame_runs #274 · minigame_rewards #219 · 123qwe(account 3556) 잔액 97 · POINTS_SQL 세 항 · question_feedback UNIQUE(question_id, account_id) · 사람 설문 0건(2026-10-21 22시) — 다르면 0절에.
■ 보고 항목: cmd 창 → 0 찬종이 볼 것(채택 명령 예 · 토스트 그림 · 문구 그림 · 끝 점검 표) → 원칙 메모 → ⓪ → A~D → E → 판단 목록(뺀 것 포함) → 새 결정 필요 → 고친 문서.
■ 커밋: 단계마다 · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` · 내 파일만 add · fetch → rebase → push.
■ ★ 이어서: 끝나면 멈춘다. 터미널 마지막 줄에 "R059 끝 — 다음 브리핑 대기".
■ 답변: 한국어 · 터미널 5줄 이내.
