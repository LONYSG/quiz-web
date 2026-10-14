[MAIN R048]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다)
TASK: 찬종 실플레이 피드백 1차 — 도배 방지 개정(채팅 · 이모티콘) · 단축키 꾹 누름 방지 · 포인트(계정별 맞힌 문제 수) · 특별 이모티콘(테마 '치이카와' 27) 기반 — 이모티콘샵·뽑기 화면은 R049
실행 모델: Fable 5.1 (docs/16 0장)

■ 고정 규칙: docs/16-ROUND-PROTOCOL.md 그대로 (3장 절대 원칙 · 4장 보고 형식 · 5-1 MAIN 규칙 · 끝 점검 "단계별로 끝까지 돌면 통과" · 1장 번호 체계 — 다음 번호 D-228 · A54 · Q-110(★ Q-109 는 GEN 이 쓴다) · 마이그레이션 0016).

■ ★★ 동시 라운드 — GEN G002 가 같은 저장소에서 돌고 있다 (docs/16 6장 "문서 분담")
- GEN 이 고치는 것: questions 테이블(중 힌트 484 · 질문 3 · 해설 1) · pipeline/ · scripts/g002-* · data/ · docs 05 **Track D 행** · 06(자기 항목) · 07 **DG-** · 08 **Q-109** · 13 **C · CV 행** · 15 · README **G 표**.
- MAIN 이 고치는 것: server/ client/ shared/ migrations/ scripts/bot·ui-check · docs 01 · 03 · 04 · 05(**Phase · R 행 · 머리글** — Track D 는 건드리지 않는다) · 06(자기 항목을 **맨 위에 새 블록으로** — GEN 줄은 손대지 않는다) · 07 **D-228~** · 08 **Q-110~** · 10 · 13 **A 행** · DB-ADMIN · README **R 표**.
- git: 커밋 전 `git pull --rebase` · push 는 `git fetch` 뒤 · **절대 force 하지 않는다** · 문서 충돌이 나면 양쪽을 다 살린다(GEN 줄을 지우지 않는다). 오류면 "VPN 확인 필요".
- DB: 마이그레이션은 **표·열 추가만**(questions 는 읽기만). 돌리기 전 `npm run db:backup`. GEN 의 적용은 짧은 한 트랜잭션이라 겹쳐도 막히지 않는다.
- ★ 메모리(찬종 PC 남는 메모리 1~3GB — GEN 이 서브에이전트 4개를 돌린다): 봇 · ui-check 같은 무거운 단계 **앞마다** 남는 메모리를 잰다(`powershell -c "(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory"` — KB). **1.5GB 미만이면 2분 기다렸다 다시** (최대 10번). 그래도 안 되면 그 단계는 "못 돌림 — 메모리" 로 보고하고 통과라 쓰지 않는다. 구현 · 빌드 · 단위 테스트는 바로 한다.

■ 먼저 읽기
- docs/16 (전체) · ai-out/main.md (0 · 3 · 4-2 · 5 · 6) · ai-out/R046.txt (직전 MAIN 보고서)
- docs/01 9장(채팅 · ★ "도배 제한의 기준은 서버 보호" — 이번에 개정한다) · 12장(경험 기록) · 16장(참여자 칸 · 이모티콘 R039 · 모바일 · 팝업 규칙 · 단축키 절)
- shared/src/protocol.ts RULES(CHAT_RATE_* · EMOJI_RATE_*) · server/src/config.ts tuning · server/src/socket/index.ts(chat.send 의 checkChatRate · emoji.send) · client/src/Lobby.tsx(throttle-note) · useRoom.ts(chat.throttled) · shortcuts.ts(Alt+1~0) · emojiCatalog.ts · EmojiPicker.tsx · Seat.tsx · server/src/http/emojiRoutes.ts · migrations/0013_emojis.sql(머리글 — custom 은 image 를 DB 에 · 1MB CHECK) · docs/DB-ADMIN.md "이모티콘 직접 등록"
- migrations/0001_init.sql answer_events(accepted — 정답자로 확정된 기록) · 0012_account_avatars.sql(그림을 DB 에 두는 방식)

■ 찬종의 말 (2026-10-14, 그대로)
> "플레이 몇판 해봤어. 전체적으로 완성도가 좋아. 근데 도배 방지를 해야겠어. 채팅과 채팅 사이 간격 제한은 필요 없을듯. 근데 일정 시간 내에 5회가 넘어가도록 채팅이 입력되면 잠시 후 기다리라는 알림(본인만 보임)이 뜨면서 도배를 잠시 막는걸로 하자. 이 기준은 보통 도배 방지 처리를 하는 시스템들에서 많이 쓰는 기준대로 맞추자. 그리고 키보드 단축키를 쭉 누르고 있으면 이모티콘이 계속 쭉쭉쭉 나오던데 이거 방지 가능한가? 반복된 감정표현을 하고 싶으면 하나하나 단축키를 꾹꾹 눌러서 표기하도록 하는게 좋아보이는데 꾹 누르니까 너무 얌체같달까? 이것도 반영해줘."
> "혹시 여태까지 계정별로 문제 맞힌 개수가 기록이 되어있나? 기본 이모티콘 말고 특별한 이모티콘을 추가하려고 해. C:\work\data\gif\Chiikawa 경로에 내가 좋아하는 캐릭터 gif 파일 27개를 넣어놨어. 이모티콘샵을 만들어서 언제든지 (게임 플레이 중이더라도) 방문해서 내가 여태 맞힌 문제수=1 point 로 해서 돈처럼 쓸 수 있게 하는거야. 특별한 이모티콘의 종류는 점점 늘려나갈건데 일단 지금 만든 테마는 '치이카와'야. 단, 테마는 선택할 수 있지만 원하는 gif를 고를 수는 없어. 무작위 뽑기 시스템이야. … 각 테마별로 내가 보유한 이모티콘 개수를 보여주고 (0/27), (1/10) 이런식으로. 내 포인트를 지불해서 뽑기를 진행해. 치이카와 테마를 예를 들어 가격이 20포인트라고 하자. … 갓챠 애니메이션 효과도 있으면 좋겠지. 그렇게 뽑힌 특별한 이모티콘은 기존 이모티콘 탭 안에서 또 분리된 탭안에 존재하고, 단축키에도 등록할 수 있고 자유롭게 사용할 수 있어. 다만, 기존 채팅창 로그에 올라오는 이모티콘은 일반 채팅과 같은 크기였지만 이 특별한 이모티콘은 공간을 좀더 차지해서 모두가 자세히 볼 수 있게 하는거야. 대신 도배 방지 기준은 더 엄격하게 적용해야겠지."
- ★ 건우(=찬종) 의 옛 확정 "도배하는 것도 재밌는 포인트다. 시스템에 부하 갈 정도로 도배하는 것만 막자"(Q-84) 는 **이번 말로 개정**됐다 — 01 9장에 개정으로 적는다(옛 문구는 지우지 말고 "R048 개정" 표시).

■ 설계 판단 (되돌리기 쉽다 — 값은 전부 RULES + 환경 변수로)
- 채팅 도배 기준: **5초 안 5회를 넘으면(6번째부터) 10초 잠금**. 잠금 중 보낸 것은 버리고 본인에게만 "너무 빨리 보내고 있어요 · N초 후 다시" (남은 초 카운트다운, 기존 throttle-note 자리). 서버가 판정한다(클라이언트 표시만으로 끝내지 않는다). 잠금이 풀리면 창은 비워서 다시 센다. 환경 변수 CHAT_RATE_WINDOW_MS=5000 · CHAT_RATE_MAX=5 · 새로 CHAT_RATE_LOCK_MS=10000. ("5초 5회" 는 Discord 자동 관리 등 흔한 기본값이다. 퀴즈 답을 연달아 치는 속도(초당 1개 이하)는 걸리지 않는다.)
- 표준 이모티콘: 채팅과 **따로 세되 같은 값**(5초 5회 · 10초 잠금). 지금은 조용히 버리는데, 이번부터 같은 안내를 본인에게 보인다.
- 특별 이모티콘(R049 에서 보냄): **10초 안 3회 · 넘으면 15초 잠금** — 값만 RULES 에 미리 둔다(SPECIAL_EMOJI_RATE_*). 이번 라운드에 보내는 기능은 없다.
- 단축키 꾹 누름: `keydown` 의 `e.repeat` 는 무시하고, **같은 키는 keyup 이 온 뒤에만 다시** 받는다(Alt+1~0 · Alt+S 전부). 한 번 꾹 = 한 번.
- 포인트 = **answer_events 에서 accepted=true 인 수(계정별, 처음부터 전부)** − 쓴 포인트. 옛 기록도 그대로 인정한다(2026-09-10 부터 23계정 1,824건 — 봇 계정 포함, 상관없다). 쓴 포인트는 새 표 `point_spends`(id · account_id · amount · reason · ref · created_at)에 적는다 — 잔액은 둘의 차로 계산(별도 잔액 열 없음 — 재구성 가능).
- 특별 이모티콘 자료 구조: `emoji_themes`(id · key · name_ko · price · sort_order · active) + `emojis.theme_id`(nullable, FK) + `account_emojis`(account_id · emoji_id · obtained_at, PK 둘). 특별 이모티콘은 kind='custom' · category='special' · theme_id 있음. **theme_id 가 있는 이모티콘은 보유한 사람만 보낼 수 있다**(서버가 emoji.send 에서 막는다 — R049 전에도 규칙은 먼저).
- GIF 처리: 27개 중 **9개가 1MB CHECK 를 넘는다**(최대 3.4MB · 720×720). 화면에선 작게 보이므로 **256×256 이하 · 1MB 이하**로 줄여 넣는다(`sharp` — 움직이는 GIF 입·출력 지원 — 를 devDependency 로 더해 `scripts/emoji-import.mjs`). 원본·변환본 파일은 **저장소에 넣지 않는다**(public 저장소 · 캐릭터 저작물) — DB 에만(프사와 같은 방식, 백업에 들어간다).

■ 할 일 (항목마다 "다 됐다" 의 기준)
A. 도배 방지 개정 — RULES(CHAT_RATE_WINDOW_MS 5000 · CHAT_RATE_MAX 5 · CHAT_RATE_LOCK_MS 10000 · EMOJI 동일 · SPECIAL_EMOJI_RATE_* 값만) · config.tuning 환경 변수 · checkChatRate 를 "창 + 잠금" 으로 · emoji.send 도 같은 함수 · `chat.throttled`{retryAfterMs} 를 이모티콘에도 · 클라이언트 안내에 남은 초 · 01 9장 개정(찬종 말 인용 · 표 갱신). 봇 시나리오: 5초에 6개 → 6번째 거부 + 안내 본인만 · 10초 뒤 다시 됨 · 초당 1개 60초는 한 번도 안 걸림 · 이모티콘 같은 꼴.
   다 됐다 = 봇 통과 + 터널 없이 로컬 두 창으로 안내가 본인에게만 뜨는 그림.
B. 단축키 꾹 누름 — shortcuts.ts 에서 repeat 무시 + keyup 게이트. 테스트: CDP 로 keydown 을 repeat=true 로 5번 보내도 1번만 · keyup 뒤 다시 1번.
   다 됐다 = ui-check 한 줄 검사 통과 + 손으로 꾹 눌러 하나만 나오는 것(사람 확인은 A54 로).
C. 포인트 — 마이그레이션 0016(point_spends) · `GET /api/me/points` {earned, spent, balance} · 프로필 창(✏️ 프로필)에 "포인트 N" 한 줄(게임 중에도 열린다 — 팝업 규칙 D-217 그대로) · 03-DATA-MODEL 에 표 · 04-PROTOCOL 에 API.
   다 됐다 = 찬종 계정 잔액이 SQL 로 센 값과 같다(보고서에 둘 다) · 봇이 한 판 맞히면 1 오른다.
D. 특별 이모티콘 기반 — 마이그레이션 0016 에 emoji_themes · emojis.theme_id · account_emojis · `scripts/emoji-import.mjs --dir <폴더> --theme chiikawa --name 치이카와 --price 20`(sharp 로 ≤256px · ≤1MB 변환 → INSERT, 다시 돌리면 같은 파일명은 건너뜀 — 파일명을 source_name 열로) · 치이카와 27 적재(이름은 파일명의 캐릭터를 한글로: 치이카와 · 하치와레 · 우사기 · 모몽가 · 쿠리만쥬 · 카니 · 랏코 · 시사 · 세이렌 · 카부토무시 · 쿠로이 나가레보시 + 번호 — 찬종이 SQL 로 바꿀 수 있게 DB-ADMIN 에 적는다) · `/api/emoji` 목록에서 **보유하지 않은 특별 이모티콘은 내려보내지 않는다**(고르기 창에 아직 안 보임) · emoji.send 서버 검사. 고르기 창의 "특별" 탭 · 샵 · 뽑기 · 큰 표시는 **R049** — 이번엔 데이터와 API 까지.
   다 됐다 = DB 에 테마 1 · 이모티콘 27(전부 ≤1MB · 가로세로 ≤256) · 변환 전후 크기 표 · `/api/emoji/<id>/image` 로 하나 열어 움직이는 그림 확인(그림 파일은 docs/design/r048/ 에 캡처만).
E. 문서 · 끝 점검 — 01(9장 · 16장 이모티콘 행에 특별 이모티콘 규칙 예고) · 03 · 04 · 05(머리글 "마지막 갱신: R042" → R048 · R048 행 · ★ 01 의 "마지막 갱신: R042" 도) · 06 · 07 D-228~ · 10(새 검사) · 13 A54~(사람이 볼 것: 꾹 누름 · 도배 안내 체감 · 포인트 숫자) · README R 표 · DB-ADMIN(테마 · 이름 바꾸기 · 가격 바꾸기 SQL) · `ai-out/R048.txt`. 끝 점검 5-1 그대로(단계별 · 메모리 규칙 위).

■ DB 쓰기: 허용 — 마이그레이션 0016 과 emoji-import 만(백업 뒤). questions · 경험 · 계정 데이터는 읽기만.
■ 하지 말 것: 이모티콘샵 · 뽑기 · 애니메이션 · 큰 표시(R049) · 특별 이모티콘을 고르기 창에 노출 · questions/pipeline/15/13 C·CV/README G·V 표 수정 · GIF 원본·변환본 커밋 · 찬종 PC 의 dev 서버·터널·브라우저 조작 · force push.
■ 확인할 것 (원칙 7): answer_events.accepted 집계(23계정 · 1,824 · 2026-09-10~) · RULES 현재값(1초 20) · 0013 의 1MB CHECK · GIF 27개 중 9개 >1MB · sharp 가 움직이는 GIF 를 출력하는지(안 되면 대안 — ImageMagick 은 PC 에 없다 — 을 보고서에).
■ 보고 항목: cmd 창 → 0 찬종이 볼 것(실기기로 볼 것 · 못 한 것 · R049 에 넘긴 것) → 원칙 메모(7 검증 · 동시 라운드 충돌 유무) → 1 A → 2 B → 3 C(잔액 표) → 4 D(변환 표 · 적재 결과) → 5 끝 점검(단계별 건수 · 메모리 때문에 미룬 것) → 6 판단 목록 → 7 새 결정 필요 → 고친 문서.
■ 커밋: 단계마다 · 끝줄 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` · `git pull --rebase` → push.
■ 지난 피드백 (R046): 잘한 것 — 나가기·끊김 60칸 매트릭스로 규칙을 잰 것. 이번에 더할 것 — 값(5초·5회·10초)은 전부 한 곳(RULES)에서 와야 한다(01 16장 "시간 값은 RULES 한 곳" 과 같은 원칙).
■ 답변: 한국어 · 터미널 5줄 이내.
