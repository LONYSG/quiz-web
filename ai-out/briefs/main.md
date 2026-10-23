[MAIN R061]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다. **짧고 빠른 라운드** — 찬종 토큰이 얼마 안 남았다. 끝나면 멈춘다)
TASK: **어느 화면에서든 문제점 제보** — 찬종이 플레이하다 바로 적는 제보 창(PC · 모바일) + 자동 맥락(화면 · 방 · 판 · 문항 · 미니게임 · 기기) + 표 `0024 app_reports` + 읽기 스크립트 `npm run reports:report` + **문항 번호를 화면에 표기**(문제 · 공개 · 결과 목록 · 지난 판 평가 — 제보 글에 "#번호" 를 적으면 그 문항에 붙음). 모아 둔 제보는 설계 에이전트/MAIN 이 읽고 반영한다(16 §7).
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` · 바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (번호 — R059 가 쓴 다음: **D-255 · A90** · 마이그레이션 **0024** · 10 **42절**). 하위 에이전트 0(직접 한다 — 토큰 아끼기) · 검사는 **quizweb_test** 로만(R060 규칙 · `npm run db:test-init --refresh` 뒤) · 실 서버가 떠 있으면 빌드하지 않는 빗장 그대로. 메모리: GEN 은 멈춰 있고 VERIFY 도 쉰다 — 지금은 MAIN 혼자.
■ ★ 토큰 절약: 그림은 PC 1 · m390 1 · 열린 창 1 — 셋만. ui-check 는 새 묶음 r061 하나(6 이내) + r056 묶음(접힘 목록이 안 깨졌는지)만. 봇은 report 1 묶음(보내기 · 맥락 채움 · 속도 제한)만. R057 · r060 묶음은 돌리지 않는다. 보고서는 R060 꼴에서 절반 길이.
■ 토큰: 넉넉하지 않다 — 위 절약 규칙.

■ 먼저 읽기
- ai-out/R056.txt(문제 평가 창 — 공개 화면 입력 포커스 안 뺏기 · 속도 제한 10초 20번 · 보고 스크립트 꼴) · R059.txt(토스트 · feedback:adopt 꼴) · client/src/QuestionFeedback.tsx · Toast.tsx · GrantToast.tsx · MobileMenu.tsx · ShortcutBar.tsx · shortcuts.ts(안전한 F키 넷은 다 쓰였다 — **Alt+B** 로 · 충돌 확인) · popup.ts(usePopup — 다른 팝업과 겹치지 않게) · server/src/http/*(feedback 경로 꼴) · server/src/game/ 의 "지금 문항 · 미니게임 판" 을 서버가 아는 자리 · docs/03(question_feedback · near_misses) · DB-ADMIN(설문 절)

■ 찬종의 말 (2026-10-23 · 원문)
- "내가 게임 하면서 생긴 문제점을 따로 기록했다가 다시 전달하는게 힘들어. 자꾸 까먹기도 하고. 피드백을 수용할 수 있는 버튼? 기능을 만들어서 어떤 화면이라도 문제점을 제보할 수 있는 창을 만들어줘. 모바일/웹 둘다. 내가 플레이하면서 실시간으로 제보를 할테니까 그 제보는 따로 모아놨다가 나중에 agent 나 main이 보고 반영할 수 있도록 하자. 그게 빠짐없이 될 거 같아."
- "지금 토큰이 얼마 안남아서 이 기능을 우선적으로 만들면 토큰 초기화 때 까지 내가 테스트를 해서 기록을 남겨놓을게."
- "문제마다 고유 번호나 식별 번호를 같이 표기해줘. 제보할 때 해당 번호를 같이 적어서 문제에 대한 피드백도 쉽게 할 수 있게."

■ 설계 판단 (되돌리기 쉬움)
- **표 `app_reports`(0024)**: id · account_id FK(계정 지우면 같이) · created_at · **kind** text('bug' | 'awkward' | 'idea' | 'question' | 'other') · **text** ≤500(찬종이 친 글 — 그대로) · **screen** text(아래 화면 이름) · room_id null · game_id FK null(판 지우면 null) · question_id FK null · question_index int null · minigame_key text null · minigame_run_id FK null · **device** jsonb(mobile · viewport w×h · ua 앞 120자 · build 커밋 짧은 해시 · prefs.emojiInsert) · **recent** jsonb null(클라이언트가 기억한 **마지막 소켓 이벤트 이름 20개**(글 내용 없이 이름 · 시각만) — 있으면 좋고 20줄 넘게 번지면 뺌) · handled_at null · note null(나중에 설계 에이전트/MAIN 이 "반영 R0xx" 적는 칸). 인덱스 (created_at) · (handled_at). **채팅 원문 · 다른 사람 글은 담지 않는다**(01 9장 원칙 — 찬종이 친 제보 글만).
- **화면 이름(screen)**: `auth` · `lobby` · `room` · `game:question` · `game:reveal` · `game:result` · `minigame:<key>:<phase>`(intro/play/final/outro) · `shop` · `profile` · `settings` · `stats` · `achievements` — 클라이언트가 지금 보이는 화면에서 정한다(라우팅 상태 하나로 — 새 전역 상태 말고 App 이 이미 아는 것으로).
- **문항·판은 서버가 채운다**: 클라이언트는 screen · question_index · minigame_key 만 보내고, 서버가 그 계정이 있는 방의 지금 판(game_id) · 지금 문항(question_id — 공개 전이어도 **id 만** · 정답은 안 담김) · 미니게임 판 id 를 붙인다. 방 밖이면 null.
- **열기**: PC — 모든 화면 오른쪽 아래 작은 떠 있는 버튼 "🐞 제보" + **Alt+B**(shortcuts 충돌 확인 · ShortcutBar 에 한 줄) · 모바일 — 위 막대 메뉴(MobileMenu)에 "🐞 제보" + 오른쪽 위 작은 반투명 🐞(28px — 게임 조작(연타 · 풍선 · 그리기)을 가리지 않는 자리 · 미니게임 play 단계에서는 숨기고 메뉴로만). 입력 포커스 규칙은 문제 평가와 같다(창을 열기 전엔 답 입력창 포커스 안 뺏음 · 닫으면 돌려줌).
- **창(작게)**: 종류 칩 5(버그 · 어색함 · 제안 · 이 문제(문항 — 번호 자동) · 기타 — 기본 "버그") · 글 한 칸(≤500 · 여러 줄 · 모바일 키보드 올라와도 보내기 버튼 보이게) · 맥락 한 줄 회색("지금: 미니게임 각도 맞추기 · 판 #2151 · 문항 7")  · [보내기] [닫기]. 보내면 토스트 "제보 접수 #n — 고마워요" 1.5초 · 창 닫힘 · 글 비움. 실패(끊김)면 글을 **localStorage 에 임시 보관**해 다음 열기 때 복구(한 건만). Enter 는 줄바꿈(글이 여러 줄) · Ctrl+Enter 보내기.
- **서버**: POST /api/reports(로그인 필수 · 속도 제한 10초 5번 · 글 비면 거부 · 길이 자르기) · 소켓 말고 HTTP(문제 평가와 같이). 봇(login_id bot* · uic* · r10_*)도 저장은 되지만 보고에서 `--no-bots` 로 뺀다.
- **읽기**: `npm run reports:report [-- --since 2026-10-23 --no-bots --all]` → 콘솔 + `tmp/app-reports.md`(최신순 · 번호 · 시각(한국) · 닉네임 · 종류 · 화면 · 판/문항/미니게임 · 글 · handled). 기본은 **handled_at 이 비어 있는 것만** · `--all` 이면 전부. `npm run reports:handle -- --id N --note "R062 반영"`(handled_at + note · --yes). DB-ADMIN 에 같은 쿼리. **13 에 새 항목은 만들지 않는다** — 제보는 표에 있고 설계 에이전트가 16 §7 흐름으로 읽는다.
- **문항 번호 표기**: questions.id 를 그대로 쓴다(새 번호 체계 없음 — 보고서 · 설문 · 13 이 이미 #id 로 부른다). 자리 — 문제 카드 구석 작은 회색 `#2271`(질문 글과 떨어져 · 복사 막기 바깥 · 폴드 m390 에서도 보이되 카드 높이 안 늘림 ±1px) · 정답 공개 카드 같은 자리 · 결과 화면 "이번 판 문제 평가" 목록 각 줄 앞 · 로비 "지난 판 문제 평가" 목록 · 미니게임 퀴즈류(얼마게요 · 사진 · 어느 쪽 …)는 **minigame_items.item_id**(예 `photo-0303`)를 공개 화면에 같은 꼴로. 답 입력 판정에는 영향 없음(번호는 질문 글 밖). 봇 · 마스킹 · 복사 막기 영향 없음 확인.
- **제보 글의 "#번호"**: 서버가 글에서 `#\d{1,6}` 첫 것을 찾아 question_id 가 비어 있으면 그 문항으로 채운다(존재하는 id 일 때만) · 종류 칩 "이 문제" 를 고르면 맥락 줄에 지금 문항 번호가 들어가고 글 앞에 `#번호 ` 가 자동으로 붙는다(지우면 안 붙음). 미니게임 문항은 `photo-0303` 꼴을 같은 규칙으로 minigame_item 칸(text null)에.
- **업적·포인트 연동 없음**(R059 채택은 question_feedback 만). 나중에 app_reports 채택 보너스를 넣을지는 찬종 결정(13 A90 에 한 줄).

■ 할 일 (항목마다 "다 됐다" · 단계마다 커밋)
A. 0024(+ minigame_item text null) · POST /api/reports(서버가 판·문항·미니게임 채움 · "#번호" 파싱 · 속도 제한 · 테스트 4: 방 밖 null · 문항 id 만 · "#번호" 로 채움 · 봇 표시) · 스크립트 둘(reports:report · reports:handle).
B0. 문항 번호 표기 — 문제 · 공개 · 결과 목록 · 로비 목록 · 미니게임 퀴즈류 · 카드 높이 측정 · 그림은 아래 B 의 셋에 번호가 같이 보이게(따로 찍지 않음).
B. 창 — PC 떠 있는 버튼 + Alt+B · 모바일 메뉴 + 🐞 · 창(칩 · 글 · 맥락 줄 · Ctrl+Enter · localStorage 복구) · 토스트 · 포커스 규칙. 그림 셋(PC 창 열림 · m390 창 열림(키보드 올라온 상태) · 보낸 뒤 토스트 PC).
C. 끝 점검(절약) — 게이트(typecheck · vitest · build · smoke) → 봇 report 1 묶음(퀴즈 중 · 미니게임 중 · 로비 — 맥락 채워짐 · 속도 제한) → ui-check r061(≤6) + r056. 검사 DB 로만.
D. 문서 — 01(제보 창 한 절 — 9장 예외: 찬종이 친 제보 글만 저장) · 03(app_reports) · 07 D-255 · 13 A90(찬종: 플레이하며 써 보기 · 채택 보너스 넣을지) · 10 42절 · DB-ADMIN · PLAY-GUIDE 한 줄 · 05 · 06 · README R · `ai-out/R061.txt`(짧게 — 0절: 쓰는 법 3줄 · 그림 셋 · 끝 점검 표).

■ DB 쓰기: 허용 — 0024(백업 뒤 · 실 DB `npm run db:backup` → `npm run db:migrate`). 봇 테스트 행은 quizweb_test 에만. questions · minigame_* · question_feedback 금지.
■ 하지 말 것: 스크린샷 캡처(외부 라이브러리 금지 · 토큰) · 채팅 원문 저장 · 13 에 제보 내용 옮겨 적기 · 문제 평가(👍/👎) 창 손대기 · 새 업적 · A82 · 15 · pipeline · force push · dev 서버 켜기/끄기.
■ 확인할 것 (원칙 7): R059 마지막 번호(D-254 · A89 · 0023 · 10 41절) · 안전한 F키 넷 다 쓰임(F2 · F4 · F8 · F9 — Lobby) · Alt+B 가 비어 있는지 · 문제 평가 속도 제한이 서버 메모리 방식인 것 · quizweb_test 가 있는지(없으면 db:test-init) — 다르면 0절에.
■ 보고 항목: cmd 창 → 0 찬종이 볼 것(쓰는 법 · 그림 셋 · 읽는 명령) → 원칙 메모 → A~C → D → 판단 목록 → 새 결정 필요 → 고친 문서.
■ 커밋: 단계마다 · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` · 내 파일만 add · fetch → rebase → push.
■ ★ 이어서: 끝나면 멈춘다(main-next 없음). 터미널 마지막 줄에 "R061 끝 — 다음 브리핑 대기".
■ 답변: 한국어 · 터미널 5줄 이내.
