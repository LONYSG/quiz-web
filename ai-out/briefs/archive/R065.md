[MAIN R065 — 제보 창 둘로 나누기 · 작은 라운드]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다. 끝나면 멈춘다. ★ 토큰 절약 라운드 — 아래 것만 · 다른 손질 금지)
TASK: 찬종이 **지금 제보를 더 올리려는데 제보 창이 걸림돌**이라 이것만 먼저 빠르게 고친다(찬종 2026-10-24 아침: "미니게임은 템포가 워낙 빠르다보니 '이 미니게임 제보' 버튼을 사실상 쓸 수가 없어 · 제보 중에 미니게임 실행되면 제보 글 못 쓰게 막던데(커서가 이동) 제보하는 경우에는 글 좀 쓰게 내비둬 · 제보하기를 문제 컴포넌트 안에다 넣지 말고 제보 메뉴를 누르면 두 가지 — 하나는 최근 문제/미니게임 중에서 골라서 제보, 하나는 일반 제보"). ★ 먼저 `npm run reports:report -- --no-bots`(처리 안 된 것 0 이어야 함 — 있으면 손대지 말고 0절에 적기만).
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` · 바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (번호 — R064 가 쓴 다음: **D-270 부터 · A93** · 마이그레이션 없음(app_reports 칸 그대로) · 10 **45절**). 하위 에이전트 0. 검사는 quizweb_test 로만 · 실 서버(3000)가 떠 있으면 빌드하지 않는 빗장 그대로 — ★ 찬종이 지금 플레이·제보 중일 수 있다. 확인은 16 §5-1 크기 전부(PC 1280 · 1536×864 · 2560×1313 · m390 최소) · 테마 둘. UX 원칙(16 §5-1 "모으고 뺀다") 그대로.
■ 먼저 읽기: client/src/AppReport.tsx(전부 — ReportHost · ReportWindow · QReportWindow · QReportButton · useReturnFocus · Alt+B) · App.tsx 313~345(reportCtx) · useRoom.ts 130~150 · 490~570 · 760~810(question.resolved 가 questionId 를 받는 자리) · Question.tsx 215~222(QNo · QReportButton) · minigame/MinigameStage.tsx 470~478 · minigame/QuizParts.tsx 150~195 · PhotoGuess.tsx 90~100 · 170~180 · TypingRace.tsx 60~70 · 170~180(자동 포커스 · onKeyDown) · minigame/*.tsx 의 `window.addEventListener('keydown', …, true)`(AngleMatch 118 · BalanceGuard 124 · CakeWait 104 · MinigameCatalog 62 · R053Games 58 198 · R054Games 111 201 · ReactionTap 84 · WhichPick 52) · EmojiPicker.tsx 76 · server/src/http/reportRoutes.ts(reportContext 62~90 — questionId · minigameItem 은 이미 클라이언트 값을 받고 exists 검사함 · minigameRunId 는 지금 방의 판만) · ai-out/R061.txt · R063.txt §A · docs/01 9-1절(제보 위치) · 03(app_reports) · scripts/bot.mjs report 묶음 · scripts/ui-check r061 묶음(📝 data-qreport 기대값이 있으면 고친다)

■ 설계 판단
§A **제보 메뉴 = 두 갈래**(PC 위 막대 "제보" · 모바일 ☰ "제보" · Alt+B · 로그인 전 링크는 그대로 일반 제보만). 누르면 작은 메뉴 창 하나:
   ① **"문제 · 미니게임 제보"** → 최근 목록(새것 위 · 20개까지)에서 하나를 누르면 지금의 QReportWindow(칩 7 + 글 · 번호 고정)가 그 대상으로 열린다. 줄 꼴: `문제 3 · #2411 · 질문 앞 24자…` / `각도 맞히기 · photo-0012 · 00:40` (QNo 꼴 번호 · 누르면 그대로 대상 선택 — 복사 버튼은 따로 두지 않음). 목록이 비면 "아직 본 문제가 없어요".
   ② **"일반 제보"** → 지금의 ReportWindow(버그 · 어색 · 개선 · 질문 · 기타).
   문제 카드의 📝(Question.tsx 220) · 미니게임 머리의 📝(MinigameStage.tsx 476)는 **뺀다**(찬종: "문제 컴포넌트 안에다 넣지 말고"). **QNo 번호 표시 · 👍/👎(QuestionFeedback) 는 그대로.**
§B **최근 목록(클라이언트)**: AppReport 안 모듈 변수 + sessionStorage(`report.recent` · 30개 · 새로고침 살아남음 · 로그아웃 때 비움 · 방을 나가도 남는다 — 찬종은 결과 화면이 깨져 방을 나갔다 다시 만든 뒤 제보하려 했다). 넣는 때: ⓐ 문제 — `question.resolved`(useRoom.ts 766 — questionId · index · gameId · 질문 앞 24자 · 정답은 안 담음) ⓑ 미니게임 — 판 시작(play 단계 진입 · key · itemId(있으면) · 시각) · 같은 판 한 번만. 서버에는 지금 칸 그대로 보낸다: questionId · questionIndex · minigameKey · minigameItem(+ 새로 `at`(그 판 시각 ISO)). **서버(reportRoutes reportContext)**: 클라이언트가 보낸 questionId · minigameItem 은 이미 받고 있다 → 그대로. `minigame_run_id` 는 지금 방의 진행 중 판만 붙이는데, 과거 판 제보면 **같은 계정이 참가한 판 중 그 key · 그 시각(±10분)에 가장 가까운 run 하나**를 붙인다(없으면 null — 거부하지 않음). `game_id` 도 그 문제/판의 것으로(지금은 방의 현재 판) — 계정이 그 판에 참가했을 때만(남의 판 번호 못 붙임 · 아니면 null). 03 에 "제보가 가리키는 판 = 제보자가 참가한 판만" 한 줄.
§C **제보 창이 열려 있으면 게임이 방해하지 않는다**(찬종 "커서가 이동"): AppReport 가 `isReportOpen()`(모듈 함수) 를 내보내고 ① 자동 포커스(QuizParts 157 · PhotoGuess 94 · TypingRace 67 · 그 밖에 `.focus(` 전부 — Question.tsx 442 449 채팅 포함)는 **열려 있으면 건너뜀** ② 전역 keydown(위 목록 11곳 + EmojiPicker 76 + ShortcutBar/shortcuts.ts)은 **e.target 이 textarea/input 이거나 isReportOpen() 이면 return** — 공용 헬퍼 하나(`typingTarget(e)`) 로 ③ 창은 방 상태가 바뀌어도(문제 → 미니게임 → 결과 → 로비) 안 닫히고 글이 남는다(ReportHost 는 App 층이라 이미 그렇다 — 확인만 · 깨지면 고침) ④ 보내는 순간의 맥락(screen · 최근 이벤트)은 **창을 연 때 것**으로 고정(열고 나서 화면이 바뀌어도 "제보 당시 화면" 이 맞게) — ReportWindow 가 열릴 때 ctx 를 복사해 둔다. 글칸 위 Esc 는 그대로 닫기(글이 있으면 draft 보관 — 지금 writeDraft 그대로).
§D 모바일: ☰ 메뉴의 "제보" 도 같은 두 갈래 · 목록은 창 안 스크롤 · 한 줄에 번호 + 앞글. 제보 창이 열린 동안 미니게임 큰 버튼(펌프 등)이 뒤에서 눌리지 않게(.report-back 이 이미 덮음 — 확인).

■ 할 일 (묶음 둘 · 커밋 둘 · D- 둘)
A. §A + §B + §D — 메뉴 · 최근 목록 · 서버 run/game 붙이기 · 📝 제거 · bot report · ui-check r061 기대값 · 그림: 메뉴 PC(1536) · 목록 PC · m390.
B. §C — isReportOpen · typingTarget · 자동 포커스 건너뜀 · 맥락 고정 · 봇: 제보 창 연 채 미니게임 시작 → 글칸에 글이 그대로 · Space 가 펌프를 안 누름.
끝 점검(검사 DB): typecheck · vitest · build · smoke → bot report · emoji · mgquiz → ui-check r061 · r065(새 — 메뉴 · 목록 · 창 열린 채 미니게임) · **r064 다시**(R064 끝 그림 157 이 띄어쓰기 고치기 전 것 — 메모리 부족으로 못 찍음 → 이번에 찍어 바꾼다). 10 45절 표.
문서 — 01 9-1절(제보 위치: 메뉴 두 갈래 · 📝 없앰 · 열려 있으면 게임이 방해 안 함) · 03(app_reports 가리키는 판 규칙) · 07 D-270~ · 10 45절 · 13 A93(찬종 체감 — 제보 흐름) · PLAY-GUIDE 제보 절 · 05 · 06 · README · `ai-out/R065.txt`(짧게 — 0절: 메뉴 그림 · 목록 꼴 · 방해 안 함 확인).

■ DB 쓰기: 실 DB 없음. 봇 행은 quizweb_test.
■ 하지 말 것: 이 밖의 고침 전부(결과 화면 · 도배 값 · 줄바꿈 · A91 — 다음 R066 에 몰아서) · 새 마이그레이션 · 문항 · dev 서버 켜기/끄기 · force push.
■ 확인할 것 (원칙 7): R064 마지막 번호(D-269 · A92) · 처리 안 된 제보 0 · question.resolved 가 questionId 를 주는지(useRoom 766) · 미니게임 play 진입을 클라이언트가 한 번만 잡을 자리 · reportRoutes 가 minigameItem 을 받는 조건(83행 — `!out.minigameItem` 일 때만) — 다르면 0절에.
■ 보고 항목: cmd 창 → 0 찬종이 볼 것(메뉴 그림 · 목록 줄 꼴 · "열린 채 미니게임" 확인 한 줄) → 원칙 메모 → A · B → 끝 점검 표 → 고친 문서.
■ 커밋: 묶음마다 · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` · 내 파일만 add · fetch → rebase → push.
■ ★ 이어서: 끝나면 멈춘다. 터미널 마지막 줄에 "R065 끝 — 다음 브리핑 대기".
■ 답변: 한국어 · 터미널 5줄 이내.
