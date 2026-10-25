[MAIN R067 — 고기 굽기 새로 · 타자 연습 입력칸 · 연습 BGM · 미니게임 기준 날짜 · 위 막대 모으기(A91)]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다. 끝나면 멈춘다)
TASK: 찬종이 R066 빌드로 플레이한 뒤 준 것 넷(2026-10-25 · 캡처 docs/design/r067/cake-unpressed-2560-report.png) + R066 이 미룬 A91. ★ 먼저 `npm run reports:report -- --no-bots`(처리 안 된 것 0 이어야 — 있으면 0절에 적고 그대로).
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` · 바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (번호 — R066 가 쓴 다음: **D-294 부터 · A95** · 마이그레이션 없음 · 10 **47절**). 하위 에이전트 0. 검사는 quizweb_test · 실 서버(3000) 떠 있으면 빌드 빗장 그대로. 크기 전부 · 테마 둘. UX 원칙 "모으고 뺀다".
■ ★ 동시 라운드: **GEN G021(data/minigame · assets · minigame_items 적재 — DB 쓰기 허용)** · **VERIFY V026(audit/v026-* · 13)** 이 돈다. MAIN 몫: client/server/shared · scripts/ui-check* · scripts/bot.mjs · docs 01 03 04 07 10 13(A95 줄) 16 PLAY-GUIDE 05 06 README · R067.txt. 05 · 06 · 13 · README 는 쓰기 직전 fetch · rebase · 내 파일만 add. 남는 메모리 1.5GB 규칙 · ui-check 끝 점검은 3GB 될 때.
■ 먼저 읽기: 캡처(고기 굽기 안 눌렀을 때 — 고기는 오른쪽 · "새까맣게 탐" 은 왼쪽 아래) · client/src/minigame/CakeWait.tsx 전부 · styles.css 5008~5130(.cake-stage 2열 격자 · .cake-count 투명 · .cake-beats) · 7468~7480(.meat-label) · sound.ts(setMusicMode 600~700 · 트랙 로딩 · 메트로놈 tick) · MinigameStage.tsx 90~140(setMusicMode 자리) · 216~230(ready) · TypingRace.tsx 전부(60~70 포커스 · 138 언어 감지) · QuizParts.tsx · QuizReveal.tsx(기준일 표시 69) · server/src/minigame/defs.ts quizSpec 380~470(클라로 가는 round spec — asOf 를 담을 자리) · shared/src/minigame.ts(RoundSpec) · scripts/minigame-load.mjs 117(asOfOf) · App.tsx 위 막대(초대 · 친구 · 포인트샵 · 제보 · 설정 · 안내 · 나가기) · AppReport.tsx(Alt+B) · 13 A91 · A94 · R066.txt 0절(고기 문구 재현 못 함 · §E 안 함).

■ 설계 판단
§A ★ **고기 굽기 — 찬종 요구대로 새로**(찬종: "기존 거 필요 없고 내 요구사항에 맞춰서 새로 만들어")
   ① **레이아웃**: 세로 한 줄 — [초 카운트] / [고기] / [결과 문구] / [도움 한 줄] 전부 가운데 정렬 · 2열 격자 폐기. 초 카운트는 **자리를 끝까지 차지**(높이 고정 · 사라질 때 투명도만) → 어떤 상태(안 누름 · 누름 · 시간 끝)에서도 고기와 문구 위치가 같다. 원인 기록(D): 2열 격자 자동 배치 + 투명 카운트가 1열 폭을 차지 → 문구가 왼쪽 아래로.
   ② **숫자**: 정수 초만(소수점 없음 — "3 · 2 · 1 · 0") · 검정 아님 — 테마 강조색(--accent) 에서 0 에 가까울수록 따뜻한 색으로(예: 보라 → 주황 → 빨강 · 밤 테마도) · 매 초 바뀔 때 **박동**(scale 1.15 → 1 · 180ms) · 사라질 때(hidden 구간)는 **스르륵**(opacity 1 → 0 · 600ms · 자리 그대로).
   ③ **소리 = 똑·딱**: 1초마다 강한 "똑"(낮고 또렷) · 0.5초마다 약한 "딱"(짧고 작게 · 강세의 40%) · 카운트가 사라지는 구간에서도 **소리는 이어지되 점점 작아져**(hidden 시작부터 사라질 때까지 음량 1 → 0.25) 리듬만 남긴다 · 0 에서 멈춤. WebAudio 합성(파일 없음) · 기존 메트로놈 tick 을 이것으로 바꿈. **박자 점(.cake-beats) 삭제**.
   ④ 결과 문구 다섯(생고기 · 덜 익음 · 딱 좋게 · 새까맣게 탐 · 안 누름/시간이 지났어요) 전부 고기 바로 아래 가운데 — lab 페이지에 **안 눌렀을 때 · 시간 끝** 상태도 넣어 PC 1536 · 2560 · m390 그림.
§B **타자 — 연습 입력칸**(찬종: "시간을 좀 더 늘리더라도 직접 키보드로 칠 수 있게 중간 대기 때 텍스트 상자 · 포커스 · 치다가 시작되면 자연스럽게 초기화하고 이어서")
   ready 단계(MinigameStage 216)에 타자 게임만 **연습 입력칸**: "다음 글 한글 (가) / 영어 (A)" 예고 아래 입력칸 하나(자동 포커스 · placeholder "여기서 미리 쳐 보세요") · 무엇을 쳐도 점수 없음 · 틀린 언어면 R066 의 빨간 안내 그대로 · **play 로 넘어가는 순간 칸을 비우고 포커스 유지**(같은 input 을 쓰거나 포커스를 넘김 — 모바일 키보드가 내려갔다 올라오지 않게 같은 요소 권장). ready 시간: 타자만 **+3초**(shared 상수 · 다른 게임은 그대로). 제보 창 열려 있으면 자동 포커스 건너뜀(R065 §C).
§C **연습 때 BGM 안 바뀜**(찬종: "미니게임 연습 하나만 할 경우 시작 브금이 바로 안 바뀌어 — 연습 때만 그런지 다른 때도 그런지 모름"): 코드는 intro 에서 setMusicMode('minigame') 이다 → 원인 후보 ⓐ 미니게임 곡을 처음 쓸 때 늦게 불러옴(lazy) ⓑ 로비에서는 음악이 안 도는 상태라 모드 전환이 재생을 시작하지 않음 ⓒ practice 흐름이 intro 를 건너뜀. **소리 로그(sound.ts logSound)로 연습 1판 · 정식 첫 판 · 미니게임만 첫 판 셋을 찍어** 원인을 D 에 적고 고친다(곡은 로비 진입 때 미리 불러옴 · 모드 전환이 멈춘 상태에서도 재생 시작 — 자동 재생 제한은 사용자 동작 뒤라 괜찮음).
§D **미니게임 기준 날짜**(찬종: "가격·최신 정보가 중요한 건 수집 기준 날짜도 같이 표기 · 문제 나왔을 때부터 정답 공개 때까지 계속"): 얼마게요(price priceAsOf) · 빅맥(worldprice 상품 asOf · 환율 fxAsOf) · 얼마나(estimate asOf — 있을 때만) · 어느 쪽(which asOf — 있을 때만)의 **문제 카드 머리줄 끝에 작은 글 "기준 2026-10-17"**(play · roundResult · 공개 화면 내내 · 같은 자리) · 서버 round spec 에 asOf 를 담아 보냄(defs quizSpec → shared RoundSpec `asOf?: string`) · null 이면 표시 안 함 · 빅맥은 "가격 기준 10-21 · 환율 10-17" 둘. ★ G021 이 적재하는 3차 항목에도 as_of 가 있다 — DB 칸(minigame_items.as_of)에서 읽는다.
§E **A91 위 막대 모으기**: PC 위 막대 7(초대 · 친구 · 포인트샵 · 제보 · 설정 · 안내 · 나가기) → **5(초대 · 친구 · 포인트샵 · ⚙ · 나가기)** · ⚙ 를 누르면 창 하나에 **탭 셋(설정 · 안내 · 제보)** · Alt+B = ⚙ 제보 탭 · 포인트샵 빨간 점 그대로 · 모바일 ☰ 는 그대로(이미 모여 있음). 16 §5-1 "모은 것 · 뺀 것" 표 · ui-check 기대값(위 막대 버튼 수 · 제보 메뉴 경로) 갱신.

■ 할 일 (묶음 다섯 · 커밋 다섯)
A. §A — 새 CakeWait 레이아웃 · 숫자 · 똑딱 · 점 삭제 · lab 상태 넷 · 그림(docs/design/r067 — 안 누름 상태 포함).
B. §B — 연습 입력칸 · ready +3초 · 봇: ready 에서 친 글이 play 시작에 비워지고 포커스가 남는지.
C. §C — 소리 로그 셋 → 원인 → 고침 · 로그를 0절에.
D. §D — asOf 전달 · 표시 · ui-check(얼마게요 play 화면에 "기준" 글자 · 공개 화면에도).
E. §E — ⚙ 탭 셋 · Alt+B · ui-check r063/r065 기대값.
끝 점검(검사 DB): typecheck · vitest · build · smoke → 봇(mgcake · mgtyping · mgquiz · report) → ui-check r067(새 — 고기 상태 · 타자 연습칸 · 기준 날짜 · ⚙) · r066 · r065 · `--wrap-audit`. 10 47절 표.
문서 — 01(고기 굽기 소리·숫자 규칙 · 타자 연습칸 · 기준 날짜 · 위 막대 5) · 04(RoundSpec asOf) · 07 D-294~ · 10 47절 · 13 **A95**(찬종 체감 — 고기 똑딱 · 타자 연습 · 기준 날짜 · ⚙) · A91 끝 표시 · 16 §5-1 표 · PLAY-GUIDE · 05 · 06 · README · `ai-out/R067.txt`(0절: 고기 전/후 그림 · 소리 로그 셋과 원인 · 기준 날짜 그림 · ⚙ 그림).
■ DB 쓰기: 실 DB 없음(제보 처리도 없음). 봇 행은 quizweb_test.
■ 하지 말 것: 난이도 기준·등급 손대기(설계가 15장을 고친 뒤 다른 라운드) · photoyear 게임 구현(R068 후보 — G021 데이터 뒤) · 미니게임 데이터 파일(GEN 몫) · 새 마이그레이션 · dev 서버 켜기/끄기 · force push.
■ 확인할 것 (원칙 7): R066 마지막 번호(D-293 · A94 · 10 46절) · 처리 안 된 제보 0 · .cake-stage 가 2열 격자인지 · setMusicMode 가 intro 에 있는지 · RoundSpec 에 asOf 가 없는지 · 위 막대 버튼 7 — 다르면 0절에.
■ 보고 항목: cmd 창 → 0 찬종이 볼 것(고기 전/후 · BGM 원인 한 줄 · 기준 날짜 그림 · ⚙) → 원칙 메모 → A~E → 끝 점검 표 → 고친 문서.
■ 커밋: 묶음마다 · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` · 내 파일만 · fetch → rebase → push.
■ ★ 이어서: 끝나면 멈춘다. 터미널 마지막 줄에 "R067 끝 — 다음 브리핑 대기".
■ 답변: 한국어 · 터미널 5줄 이내.
