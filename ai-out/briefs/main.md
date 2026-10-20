[MAIN R056]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다. 밤샘 — 끝나면 `main-next.md`(R057)로 이어서)
TASK: ① **문제 평가(설문)** — 정답 공개 화면과 결과 화면에서 문제마다 👍/👎 + 사유 선택 + 기타 의견 · `migrations/0020` `question_feedback` · 보고 스크립트 ② **작은 수정 넷** — 미니게임 골라 하기 창의 **가로 스크롤**(버그) · 이모티콘 검색 결과 없음 "없어요" **줄바꿈**(버그) · **프사 확대**(아바타 누르면 크게) · **업적 — 다른 사람 업적 보기 + 전체 업적 목록 창**(깬 것 · 안 깬 것)
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` · 바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (번호 — R055 가 쓴 다음: **D-246 · A80** · Q 는 찬종이 없으니 올리지 않고 13 A 에 "결정 필요" 로 · 마이그레이션 **0020** · 10 다음 절). 하위 에이전트 ≤1 · 경량 ui-check(R053 1.5GB 묶음 · 띄우기 전 남는 메모리 1.5GB 미만이면 2분 × 10 대기) · 429 면 같은 모델로 이어서. 찬종은 자고 있다 — 묻지 말고 13 A 에 적는다.
■ ★★ 동시 라운드(밤샘 — 세 창) — GEN(G018 미니게임 데이터 3차 → G019 상 생성 4차 — data/minigame · pipeline/ · docs/15 · generated · audit/g01x · 05 Track D/E · 06 · 07 DG- · 13 C · README G — **DB 쓰기 없음** · server/ client/ 안 건드림) · VERIFY(V021 → V022 — audit/v02x · 13 CV · README V). MAIN 몫: server/ client/ shared/ migrations/ · scripts/feedback-* · 01 · 03 · 10 · DB-ADMIN · PLAY-GUIDE · 13 **A 행** · 07 D- · 05(MAIN 행) · 06(맨 위 새 블록) · README **R 표**. ★ 05 · 06 · 13 · README 는 셋이 같이 쓴다 — 쓰기 직전 `git fetch` · rebase · 내 파일만 add · GEN 의 미추적 파일(tmp/ · data/minigame 새 파일) add 금지 · force 금지. 찬종 PC 의 dev 서버(3000) · 터널 · 브라우저는 건드리지 않는다(검사는 R053 방식 — 별도 포트).
■ 토큰: 넉넉하다.

■ 먼저 읽기
- ai-out/R055.txt 0절(끝 점검 표 · 경량 묶음) · R054.txt(업적 — `shared/src/achievements.ts` · 달성 표 · 프로필 업적 칸 · 토스트) · R048.txt(프로필 · 아바타 · 포인트) · R050.txt(골라 하기 · 설정 체크박스) · R049.txt(이모티콘샵 · 피커 검색)
- docs/01 **7장 정답 공개 화면(289행~ · 8초)** · 9장(채팅 = 답안 · 입력창은 공개 중에도 열림 · 소감 칸) · 15장 결과 화면 · 5장 로비 · 16장 팝업 규칙(D-217 ✕ · 바깥 누르기) · 아이콘 규칙(Lucide 선 아이콘 · 반응용 이모티콘과 구분) · 단축키 규칙(R043 — Alt+S · Alt+1~0 뿐 · 새 단축키 없음) · 복사 막기(R050 — 질문 · 힌트) · 03(표 — game_questions · game_players · answer_events · achievements) · 10(테스트 절 꼴) · DB-ADMIN 3절
- client/src/Question.tsx(reveal 블록 281행~ · reveal-main · reveal-next) · GameResult.tsx · Lobby.tsx · minigame/MinigamePicker.tsx · EmojiPicker.tsx(182행 "없어요") · ProfilePanel.tsx · Avatar.tsx · AchievementToast.tsx · noCopy.ts · popup.ts · server/src/http/meRoutes.ts(라우트 꼴 · 로그인 검사 · 속도 제한) · server/src/db/games.ts · achievements.ts · migrations/0019_achievements.sql(꼴)

■ 찬종의 말 (2026-10-21 밤 · 친구들과 몇 판 뒤)
> "터무니없는 역사 문제를 물어보는게 좀 많대. 난이도가 예상한거보다 많이 높아. … 그래서 말인데 **문제마다 별로인 문제 평가 버튼이 따로 있어서 설문조사를 하게 하면 어때? 선택지를 몇개 지정 + 기타 의견란도 만들어서 문제의 피드백을 여러명한테 받도록 하는거야.** 물론 친구들이 장난으로 기입하는 경우도 가끔 있을거 같긴한데 내가 웬만하면 잘 하도록 독려할게."
> "**프사 확대 기능** 있으면 좋겠고 **다른 사람의 업적을 볼수도, 깰 수 있는 업적을 보는 창**도 있으면 좋겠어." · "**미니게임 골라하기 창에서 가로세로 스크롤이 생겨.** 세로는 어쩔수 없다고 쳐도 가로가 생기는게 이상해." · "이모티콘 검색했을때 해당되는 이모티콘 없을때 '없어요' 라는 문구가 뜨던데 **이거 줄바꿈 돼.**"
> (R057 로 미룬 것: 미니게임만 모드 · 이모티콘 나열 · 복수정답 유연화 · 포인트 사용처)

■ 확정 (설계 판단 2026-10-21 — 상수로 · 되돌리기 쉽다 · D-246~)
1. **문제 평가 — 어디서**: (가) **정답 공개 화면(8초)** — reveal 카드 안(정답 · 해설 아래 · "N초 후 다음" 위) 작은 버튼 둘 **👍 좋아 · 👎 별로**(Lucide thumbs-up/down 선 아이콘 + 글자 · 반응 이모티콘과 구분). 한 번 누르면 **즉시 저장**(토글 — 다시 누르면 취소 · 눌린 표시). 👎 를 누르면 그 자리에 **사유 칩 한 줄**(다중 선택 · 즉시 저장 · 가로 넘치면 가로 스크롤 — 세로로 늘어나 화면을 밀지 않는다) · 기타 입력은 여기서 받지 않는다(8초). 8초가 지나면 사라진다 · 입력창 포커스를 빼앗지 않는다(채팅 = 답안 규칙 그대로) · 모바일 같은 자리 · 새 단축키 없음. (나) **결과 화면** — 순위 아래 접이식 "이번 판 문제 평가"(기본 펼침): 문제 번호 · 질문 앞 60자(복사 막기 유지) · 정답 · 내 👍/👎 · 사유 칩 · **기타 의견**(≤200자 · 칸을 벗어나면 저장) — 행마다 즉시 upsert · 떠나기 전까지 고칠 수 있다. (다) **로비** — "지난 판 문제 평가" 작은 링크(내가 참가한 마지막 판이 있을 때만 · 같은 목록을 팝업으로 · D-217 팝업 규칙) — 결과 화면을 놓친 사람용. 미니게임 문항은 이번에 넣지 않는다(퀴즈 문제만).
2. **사유 상수** `shared/src/feedback.ts`(코드로 저장 · 라벨은 클라 · 순서 그대로): `never_heard` "들어본 적도 없는 답" · `too_easy` "너무 쉬움" · `unclear` "질문이 무슨 말인지 모르겠음" · `answer` "답이 틀렸거나 다른 답도 맞을 듯" · `hint` "힌트가 이상함(너무 쉽거나 도움 안 됨)" · `boring` "알 가치 없음 · 재미없음" · `other` "기타(적기)". 👍 는 사유 없음.
3. **표 `question_feedback`(0020)** — id bigserial · question_id FK · account_id FK · game_id FK(null 허용) · vote smallint CHECK (vote IN (-1, 1)) · reasons text[] NOT NULL DEFAULT '{}' · comment text(≤200 — CHECK) · created_at · updated_at · **UNIQUE (question_id, account_id)**(한 사람 한 문제 한 평가 — 나중 것이 이긴다 · game_id 는 최근 판) · 인덱스 question_id. 지우지 않는다(17 3절 기록 보존).
4. **서버** — `POST /api/feedback/question` {questionId, gameId, vote: 1|-1|null(취소 = 행 삭제가 아니라 vote null 허용? → **삭제**로 — 취소는 DELETE), reasons[], comment} · 로그인 · **그 계정이 그 판(game_players)에 있었고 그 문제가 그 판(game_questions)에 나왔어야** 받는다(안 본 문제 거부 — 장난 방지의 최소선) · reasons ⊂ 상수 · comment trim ≤200 · 속도 제한 10초 20회 · `GET /api/feedback/game/:gameId/mine`(그 판 문제 목록 + 내 평가) · `GET /api/feedback/last-game`(로비 링크용 — 내가 참가한 마지막 판 id). 포인트 보상 없음(장난 유인 — 찬종 "독려할게").
5. **보고** — `scripts/feedback-report.mjs`(`npm run feedback:report [--since YYYY-MM-DD] [--no-bots]`): 문제별 👎 수 · 👍 수 · 사유 분포 · 댓글(닉네임 · 시각) · 상위 👎 문제 50 표 · 사유별 합계 — 콘솔 표 + `tmp/feedback-report.md`. DB-ADMIN 3절에 같은 쿼리. 설문 결과의 문항 반영은 GEN 몫(13 A 에 "설문 결과는 다음 GEN 이 읽는다 — 표 question_feedback" 한 줄 · README 색인).
6. **작은 수정 넷** — (a) `MinigamePicker` 가로 스크롤: 원인을 찾아 레이아웃으로 고친다(카드 min-width · 고정 열 수 · 긴 이름 — `overflow-x: hidden` 으로 덮지 않는다) · PC 1280 · m390 둘 다 가로 스크롤 0 · 세로는 그대로. (b) EmojiPicker "없어요" — 한 줄로(칸 너비 · 격자 셀에 들어가서 좁아진 것이면 격자 밖으로) · 검색 결과 없음 상태 그림. (c) **프사 확대** — 참여자 칸 · 프로필 패널 · 채팅 로그 · 결과 화면의 아바타를 누르면 큰 보기 팝업(원본 그대로 · 최대 화면 폭 · D-217 규칙 · 모바일 전체 폭) — 저장된 아바타 원본 크기를 확인해(R048 저장 규격) 작으면 그대로 확대 · 글자 아바타(사진 없음)는 확대 안 함. (d) **업적** — 다른 사람 프로필(이미 열리는 것)에 **업적 칸**(깬 것만 · 날짜) + **"전체 업적" 창**(내 프로필 · 다른 사람 프로필 둘 다에서 열림): 모든 업적 목록 — 깬 것 ✓ 날짜 · 안 깬 것 흐리게 + 조건 설명 · 숨김 업적 없음(정의 그대로) · 모바일 세로 목록.
7. 공통 — 01(7장 공개 화면 · 15장 결과 · 5장 로비 · 16장 프로필·업적 줄) · 03 표 · 10 새 절 · 13 A(A80~: 찬종이 볼 것 — 👎 버튼 눈에 띄는지 · 8초 안에 누를 만한지 · 결과 화면 목록 · 친구들 평가 결과 `npm run feedback:report` · 프사 확대 · 업적 창) · 07 D-246~ · PLAY-GUIDE 한 줄("👎 별로 버튼 — 친구들에게 안내") · DB-ADMIN · README R 표.

■ 할 일 (항목마다 "다 됐다" · 단계마다 커밋)
A. 0020 + shared 상수 + 서버 라우트 — 단위 테스트(안 본 문제 거부 · 사유 밖 거부 · 200자 · upsert · 취소) · 봇 2 로 판 하나 → 평가 → 표 행 · 다시 누르면 갱신 · 취소하면 삭제. 다 됐다 = 테스트 통과 · 표 행 예.
B. 공개 화면 버튼 + 사유 칩 — 8초 안 동작 · 입력창 포커스 유지 · 모바일 390 세로 안 밀림 · 그림(PC 1280 · m390 · 밤). 
C. 결과 화면 목록 + 로비 링크 — 기타 의견 저장 · 복사 막기 · 그림.
D. 보고 스크립트 — 봇 평가로 표 출력 예.
E. 작은 수정 넷 — 각각 원인 한 줄 · 전/후 그림(골라 하기 PC · m390 가로 스크롤 0 · "없어요" · 프사 확대 · 업적 창).
F. 문서 — 01 · 03 · 10 · 13 A · 07 · 05 · 06 · PLAY-GUIDE · DB-ADMIN · README R · `ai-out/R056.txt`.
G. 끝 점검 5-1 — R053 경량 묶음으로(건수 · 메모리 표) · `npm run build` 통과 · 마이그레이션 0020 적용 로그.

■ DB 쓰기: 허용 — 0020 · 봇 테스트 행(백업 뒤). **questions · minigame_* 금지**.
■ 하지 말 것: 포인트 보상 · 미니게임 문항 평가 · 새 단축키 · 15 · pipeline · 13 C/CV · README G/V · A64 소리 · A57 · 복수정답 판정 변경(R057) · 미니게임만 모드(R057) · 이모티콘 나열(R057) · force push · 찬종 PC dev 서버·터널.
■ 확인할 것 (원칙 7): R055 가 쓴 마지막 번호(D-245 · A79) · 마지막 마이그레이션 0019 · game_questions 에 question_id · game_players 에 account_id · 아바타 저장 규격 · 업적 정의 수 — 다르면 0절에.
■ 보고 항목: cmd 창 → 0 찬종이 볼 것(공개 화면 그림 · 결과 화면 그림 · 보고 표 예 · 작은 수정 전/후) → 원칙 메모 → A~E → F → 끝 점검 → 판단 목록 → 새 결정 필요 → 고친 문서.
■ 커밋: 단계마다 · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` · 내 파일만 add · fetch → rebase → push.
■ ★ 이어서: 이 라운드의 보고서 · 커밋 · push 가 끝나면 **같은 창에서** `ai-out/briefs/main-next.md` 를 읽고 그 라운드(R057)를 바로 시작한다 — 찬종에게 묻지 않는다. 그 파일이 없거나 첫 줄이 "보류" 면 멈춘다. 터미널 마지막 줄에 "R056 끝 — R057 로".
■ 답변: 한국어 · 터미널 5줄 이내.
