[MAIN R060]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다. 짧은 라운드 — 끝나면 main-next.md(R059)로 이어진다)
TASK: ① ★★★ **검사 DB 분리** — ui-check · 봇 · smoke 가 띄우는 검사 서버가 **실제 DB(quizweb)** 에 붙어 부팅 정리(bootCleanup)로 사람이 하던 방·판을 닫았다(2026-10-21 23:06~23:46 · 11번). 검사는 `quizweb_test` 만 쓰고, 실 DB 로는 못 뜨게 막는다 ② 어젯밤 모바일 실사용 버그 넷 — (가) 미니게임만 모드 사이 연출 "퀴즈로 돌아갑니다!" (나) '얼마나 될까' 단위(광년) 줄바꿈 (다) 특별 이모티콘 바로 보내기 뒤 고르기 창이 반응을 가림 (라) 미니게임 안 동점 처리(설계 판단 — 아래)
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` · 바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (번호 — R058 이 쓴 다음: **D-253 · A87** · 10 **40절** · 마이그레이션 없음(0023 은 R059 몫)). 하위 에이전트 ≤1 · 경량 ui-check(R053 묶음). 메모리: GEN(G019) · VERIFY(V023)가 돌 수 있다 — 띄우기 전 1.5GB 미만이면 2분 × 10 대기 · ui-check · 봇은 3GB 이상일 때만. ★★ **① 이 끝나 검사 DB 로 돌기 전에는 ui-check · 봇 · smoke 를 한 번도 띄우지 않는다**(사람이 하고 있을 수 있다). 셸이 회수되면 같은 명령을 다시 걸지 않는다.
■ ★★ 동시 라운드 — GEN(G019 — data/ · pipeline · 15 · 05 Track D/E · 06 · 07 DG- · 13 C · README G · tmp/) · VERIFY(V023 — audit · 13 CV · README V). MAIN 몫: server/ client/ shared/ scripts/ docker-compose · 01 · 03 · 10 · 13 A · 07 D- · DB-ADMIN · 05 · 06 · README R. 쓰기 직전 fetch · rebase · 내 파일만 add · force 금지 · 찬종 PC dev 서버(3000)·터널·브라우저 안 건드림(지금은 꺼져 있을 수 있다 — 켜지 않는다).
■ 토큰: 넉넉하다.

■ 먼저 읽기
- ai-out/R058.txt(끝 점검 · 봇 near) · docs/10 39절 · 13 A80 · A86 · server/src/db/bootCleanup.ts(부팅 정리 — **고치지 않는다**) · server/src/db/pool.ts · server/src/index.ts(부팅 순서) · scripts/ui-check.mjs(697~760 ensureServer · 767/818/857 DATABASE_URL 기본값 · PORT 후보 3101…) · scripts/ui-check-bundles.mjs · scripts/bot.mjs(604 · 7484) · scripts/smoke.mjs · scripts/migrate.mjs · scripts/backup.mjs · restore.mjs · docker-compose.yml · package.json scripts
- 버그 자리: client/src/minigame/MinigameStage.tsx 264(outro 문구) · client/src/minigame/QuizReveal.tsx 114 · 135 · QuizNumber.tsx 52 · 73 · 81(단위) · client/src/EmojiPicker.tsx 42~62(열림/닫힘) · 97 · 169(보내기) · 반응 층(1~3개 이모티콘만 = 큰 반응 — R057 B) 의 z-index · shared/src/minigame.ts 54~57 · 227(tiebreak) · 361 · server/src/minigame/engine.ts 500~520(rankFinal · tie) · server/src/game/question.ts 528

■ 사고 기록 (2026-10-21 밤 · DB games · minigame_runs 로 맞춤 — 설계 에이전트)
- MAIN 끝 점검(R058 봇 22:58~23:05 · R059 ui-check 묶음 23:05~23:46)이 띄운 검사 서버가 같은 DB 로 부팅 → bootCleanup 이 `ended_at IS NULL` 인 games 전부 · 열린 rooms 전부 · 열린 minigame_runs 를 닫음. 찬종 둘이 하던 미니게임만 판 game 2134(23:06:34) · 2138(23:10:20 · 이후 판 468 · 469 · 472 · 474 · 475 · 476 이 잇달아 닫힘) · 2145(23:23:15 · 478 · 483 · 484 · 487 · 491) · 퀴즈 2146(23:36:40). game_id 가 비어 있는 판 479 · 482 · 485 · 488 · 492~497 이 검사 서버의 연습 판이다(시각이 맞물린다). 22:09 game 2025 도 같은 꼴.
- 실 서버(3000)도 23:06:35 에 다시 떴다(원인 추정: 밑에서 닫힌 행 때문에 예외 — 확인 대상 · 필요하면 10 40절에 한 줄).

■ 찬종의 말 (2026-10-21 밤 · 원문)
- "미니게이 모드 하다가 각도 맞히기 두판 하니까 갑자기 멈추더니 방 터졌어." / "방금 방 또 터짐."
- "미니게임 총합 동점인데 1,2위 점수가 다른 이유는 뭐지?"
- "미니게임 '얼마나 될까' 에서 ~광년 의 광년 이 줄바꿈이 생겨."
- "미니게임만 모드인데 게임 끝날때마다 이제 퀴즈로 넘어간다는 문구가 자동으로 붙네. 퀴즈가 아니라 게임인데."
- "특별 이모티콘 눌렀을때 정작 보낸 사람은 이모티콘 선택창에 가려져서 이모티콘이 안보여. 이것도 해결해야함."

■ 설계 판단 (찬종 확인 전 — 권장안 · 되돌리기 쉽다)
- **① 검사 DB**: 같은 컨테이너(quiz-web-db · 5434)에 **`quizweb_test`**. `npm run db:test-init` = (없으면 createdb) → 최신 `backups/*.dump` 또는 지금 quizweb 를 `pg_dump | pg_restore` 로 **통째 복사**(124MB · 문항 · 미니게임 · 이모티콘 · 계정 다 필요하므로) → migrate. `--refresh` 면 지우고 다시. ui-check.mjs · ui-check-bundles.mjs · bot.mjs · smoke.mjs 의 DATABASE_URL **기본값을 quizweb_test 로** 바꾸고, 검사 DB 가 없으면 "먼저 npm run db:test-init" 하고 멈춤. **서버 쪽 빗장**: 검사 스크립트는 서버를 띄울 때 `QUIZ_TEST_SERVER=1` 을 주고, 서버는 그 값이 있는데 DB 이름이 `quizweb` 면 **부팅 거부**(pool.ts 또는 index.ts · 부팅 정리 전에). 반대로 사람이 쓰는 `npm run dev` 는 그대로 quizweb. 실 DB 를 읽는 보고·운영 스크립트(feedback:report · answers:near · db:backup · migrate · minigame-load · pipeline-load …)는 **손대지 않는다**. bootCleanup 은 설계가 맞으니 그대로.
- **(가) outro 문구**: `view.series` 면 "다음 미니게임으로!" · 마지막(done + 1 === total)이면 "결과로!" — view 에 그 정보가 없으면 MinigameView 에 한 칸(series: { done, total }) 더한다. 연습은 "로비로" 그대로.
- **(나) 단위 줄바꿈**: 숫자와 단위를 `white-space: nowrap` 한 span 으로(QuizReveal 114 · 135 · QuizNumber 52 · 73 · 입력칸 옆 단위 81). 긴 단위(광년 · 킬로미터 · 만 원)로 m390 그림.
- **(다) 이모티콘 가림**: **바로 보내기 모드로 보내면 고르기 창을 닫는다**(PC · 모바일 같이 · 입력창에 넣기 모드는 열어 둠 — 여러 개 넣는 모드니까). 더해서 큰 반응 층의 z-index 를 고르기 창보다 위로(닫히기 전 한 프레임 · 길게 누르기 뒤에도 보이게). 길게 누르기 = 넣기는 그대로.
- **(라) 동점**: 찬종이 본 것은 **한 미니게임 안에서 둘의 점수(total)가 같은데 1위 · 2위로 갈려 순위 점수(2 · 1)가 달라진 것**으로 보인다 — 지금 규칙은 R053 tiebreak 'lastRank'(마지막 라운드 순위로 가름). 권장: **미니게임 안의 동점은 공동 순위**(둘 다 1위 → 순위 점수 · 포인트 보너스 같이 · 다음은 3위) · 미니게임만 모드의 **최종** 동점만 마지막 미니게임 순위로 가름(R057 그대로) · 'timeSum'(맞힌 시간 합) 방식은 그대로(시간은 거의 안 겹친다). 결과 화면 "공동 1위" 표기. 찬종이 "동점 가르기 그대로" 라고 하면 되돌리기 — 13 A87 에 체감 한 줄.

■ 할 일 (항목마다 "다 됐다" · 단계마다 커밋)
A. 검사 DB — db:test-init(+ --refresh) · 검사 스크립트 넷 기본값 · 서버 빗장(QUIZ_TEST_SERVER + quizweb 면 거부 · 테스트) · DB-ADMIN 에 "검사 DB" 절 · docs/10 끝 점검 명령에 `db:test-init` 한 줄. 다 됐다 = ① quizweb_test 에서 봇 2 묶음 + ui-check 1 묶음이 돈다 ② 그동안 quizweb 의 rooms · games · minigame_runs 에 **아무 변화도 없다**(앞뒤 count 로 증명 · 10 40절 표) ③ 빗장 테스트(DATABASE_URL=quizweb + QUIZ_TEST_SERVER=1 → 거부).
B. 버그 넷 — (가)(나)(다)(라) 각각 커밋 · 테스트(라: rankFinal 공동 순위 · 다음 순위 건너뜀 · 최종 lastRank 그대로) · 그림(m390 · PC): outro 두 가지 · 광년 · 이모티콘 보낸 직후 · 공동 1위 결과.
C. 끝 점검 — **A 끝난 뒤 · 검사 DB 로만** · 메모리 규칙대로: 게이트 → 봇(mgonly · emojiinline · near + R059 못 돌린 것 없음) → ui-check(r056 · r057 묶음 + 이번 그림). 다 됐다 = 10 40절 표 · 못 돌린 것은 사유.
D. 문서 — 01(미니게임 동점 규칙 · 미니게임만 사이 문구 · 이모티콘 보내면 닫힘) · 07 D-253(검사 DB 분리 · 사고 기록 요약 · 동점 공동 순위) · 13 A87(찬종: 동점 · 이모티콘 · 문구 체감) · 10 40절(사고 · 검사 DB · 끝 점검 표) · DB-ADMIN · 16 은 설계 에이전트가 이미 고침(§6 환경 줄) · 05 · 06 · README R · `ai-out/R060.txt`.

■ DB 쓰기: **quizweb 는 금지**(읽기 · count 만). quizweb_test 는 자유(만들고 지우고). 마이그레이션 없음.
■ 하지 말 것: bootCleanup 수정 · dev 서버 켜기/끄기 · 실 DB 로 검사 서버 띄우기 · 0023/제보 채택(R059 몫 — main-next.md) · A82 · 15 · pipeline · force push.
■ 확인할 것 (원칙 7): R058 마지막 번호(D-252 · A86 · 0022 · 10 39절) · 사고 시각(games 2134 · 2138 · 2145 · 2146 end_reason server_restart) · ui-check PORT 후보 3101~ · bot.mjs 7484 가 서버 모듈에 DATABASE_URL 을 넘기는 것 · vitest 는 DB 를 안 쓴다 — 다르면 0절에.
■ 보고 항목: cmd 창 → 0 찬종이 볼 것(검사 중 실 DB 무변화 표 · 버그 넷 그림 · 동점 규칙 한 줄) → 원칙 메모 → A~C → D → 판단 목록 → 새 결정 필요 → 고친 문서.
■ 커밋: 단계마다 · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` · 내 파일만 add · fetch → rebase → push.
■ ★ 이어서: 끝나면 `ai-out/briefs/main-next.md`(R059 제보 채택 보너스)를 읽고 이어서 한다. 없거나 첫 줄이 "보류" 면 멈춘다. 터미널 마지막 줄에 "R060 끝 — R059 로".
■ 답변: 한국어 · 터미널 5줄 이내.
