[MAIN R062]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다. **아주 짧은 라운드** — 찬종 토큰 아끼기. 끝나면 멈춘다)
TASK: **로그인 전 화면(AuthScreen · 비밀번호 바꾸기 화면)에서도 🐞 제보** — R061 은 `account && !mustChange` 일 때만 ReportHost 를 그려 로그인 전엔 제보 버튼이 없다(찬종: "제보는 모든 화면에서 받을 수 있어야한다고 했잖아. 로비 이전 단계에서는 왜 안보임?").
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` · 바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (번호 — R061 이 쓴 다음: **D-256** · 13 새 항목 없음(A90 에 한 줄 덧붙임) · 마이그레이션 **0025** · 10 **43절**). 하위 에이전트 0. 검사는 quizweb_test 로만(실 서버가 떠 있으면 빌드하지 않는 빗장 그대로 — **지금 찬종이 플레이 중일 수 있다**). 토큰 절약: 그림 둘(PC 로그인 화면 🐞 창 · m390 같은 것) · ui-check r062 ≤3 · 봇 report 묶음에 케이스 2 추가만.
■ 토큰: 넉넉하지 않다.

■ 먼저 읽기: ai-out/R061.txt · client/src/App.tsx 584(ReportHost 조건) · 145~178(mustChange) · client/src/AppReport.tsx(device() · 화면 이름 · ctx) · server/src/http/reportRoutes.ts(401 · rateOk 가 accountId 로 센다) · migrations/0024_app_reports.sql(account_id NOT NULL) · docs/01 9-1절 · 03 app_reports · DB-ADMIN 제보 절

■ 찬종의 말 (2026-10-23 · 원문)
- "모바일 환경에서 받은 평가인지, web 에서 받은 평가인지는 알아서 분별해서 받고 있는거 맞음? 굳이 모바일/웹을 따로 기재하기보다 현재 화면이 어떠냐에 따라서 알아서 접수하면 좋을듯." → 이미 그렇다(device.mobile · viewport · ua · build 자동 — 손댈 것 없음 · 0절에 한 줄로 확인만).
- "그리고 제보는 모든 화면에서 받을 수 있어야한다고 했잖아. 로비 이전 단계에서는 왜 안보임?"

■ 설계 판단 (되돌리기 쉬움)
- **0025**: `app_reports.account_id` 를 **NULL 허용**으로(ON DELETE CASCADE 그대로) + `login_hint` text null(로그인 화면 입력칸에 아이디가 쳐져 있으면 그 글 — 비밀번호는 절대 아님 · 없으면 null) + `ip_hash` text null(비로그인 때만 · sha256(ip + SESSION_SECRET 앞 8자) 앞 16자 — 원 IP 는 저장하지 않는다).
- **서버**: POST /api/reports 는 **로그인 없이도** 받되 ① screen 이 `auth` · `password-change` 일 때만(그 밖은 401 그대로) ② 속도 제한은 ip_hash 기준 10초 3번 ③ 글 비면 거부 · 길이 자르기 그대로 ④ 판·문항·미니게임 맥락은 당연히 null.
- **클라이언트**: ReportHost 를 `account && !mustChange` 조건 밖으로 — AuthScreen · 비밀번호 바꾸기 화면에서도 PC 떠 있는 🐞 + Alt+B · 모바일은 위 막대가 없으니 **오른쪽 아래 작은 🐞**(로그인 폼 버튼을 가리지 않는 자리). 창은 같은 창(종류 4 · 글 · 맥락 줄 "지금: 로그인 화면"). 로그인 폼의 아이디 칸 값을 login_hint 로(비밀번호 칸은 읽지 않는다 — 테스트로 못 박기). 📝 문항 피드백은 해당 없음.
- **보고**: `reports:report` 에 비로그인 건은 닉네임 자리에 "(비로그인 · 아이디 칸 'abc')" 꼴. `--no-bots` 는 그대로.
- 화면 이름 목록(01 9-1절)에 `auth` · `password-change` 가 이미 있는지 확인 · 없으면 추가.

■ 할 일
A. 0025 · 서버(비로그인 허용 범위 · ip_hash 제한 · 테스트 3: auth 는 받음 · lobby 는 401 · 비밀번호 칸 안 읽힘(클라이언트 테스트)) · 보고 스크립트 한 줄.
B. 클라이언트 — 조건 밖으로 · 모바일 자리 · 그림 둘.
C. 끝 점검(절약) — 게이트 → 봇 report +2 케이스 → ui-check r062 ≤3. 검사 DB 로만.
D. 문서 — 01 9-1절 한 줄 · 03 · 07 D-256 · 13 A90 덧붙임("로그인 전에도 — 써 보기") · 10 43절 · DB-ADMIN · 05 · 06 · README R · `ai-out/R062.txt`(아주 짧게).

■ DB 쓰기: 허용 — 0025(백업 뒤 · 실 DB `npm run db:backup` → `npm run db:migrate`). 봇 행은 quizweb_test 에만.
■ 하지 말 것: 비밀번호 칸 값 저장 · 원 IP 저장 · 비로그인으로 다른 화면 제보 허용 · 👍/👎 · 📝 손대기 · 새 기능 · 15 · pipeline · force push · dev 서버 켜기/끄기.
■ 확인할 것 (원칙 7): R061 마지막 번호(D-255 · A90 · 0024 · 10 42절) · App.tsx 584 조건 · reportRoutes 401 자리 · device() 가 mobile · viewport · ua · build 를 자동으로 담는 것 — 다르면 0절에.
■ 보고 항목: cmd 창 → 0 찬종이 볼 것(그림 둘 · "기기는 자동" 한 줄) → 원칙 메모 → A~C → D → 판단 → 고친 문서.
■ 커밋: 단계마다 · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` · 내 파일만 add · fetch → rebase → push.
■ ★ 이어서: 끝나면 멈춘다. 터미널 마지막 줄에 "R062 끝 — 다음 브리핑 대기".
■ 답변: 한국어 · 터미널 5줄 이내.
