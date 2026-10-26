[MAIN R069 — 난이도 설정을 초급·중급·고급(단일 선택)으로 바꾸고 등급 비율 출제 + 알가치 가중 선택(docs/19 §5) · 긴 지문 360 폭 글자 규칙(240자 대비) · 자주 쓰는 이모티콘 탭(#70)]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다. 끝나면 멈춘다)
TASK: 찬종 결정(2026-10-26 · docs/19 §5 정본)대로 방 설정의 난이도를 **하·중·상 켜고 끄기 → 초급 · 중급 · 고급 중 하나**로 바꾸고, 한 판의 문항을 **등급(difficulty_score 1~5) 비율**로 뽑되 **가장 어려운 칸은 알가치(questions.worth) 3 에서만 · 나머지 칸은 알가치 3 ×2 · 2 ×1 · 1 은 예비**로 고른다. 경험 규칙(안 본 문제 우선 3단계) · 같은 판 같은 정답 금지 · 정답 흘림 검사 · 분야 필터는 그대로 두고 **그 안에서** 등급·알가치가 후보를 좁힌다. 머리에 `npm run reports:report -- --no-bots` 로 미처리 제보를 본다(R068 이 19 건을 처리했고 #70 자주 쓰는 이모티콘 탭 · #64 다른 도형이 보류 — #70 은 이번에 한다 · #64 는 그대로 보류).
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` · 바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (07 **D-307** 부터 · 13 **A97** · 10 **49절** · 01 16-R069 · 05 · 06 · README). 하위 에이전트 ≤1 · 남는 메모리 1.5GB(검사 서버 · 봇 · ui-check 는 `quizweb_test` 만 · ui-check 는 3GB 남을 때 · 실 DB 쓰기 **없음** — 마이그레이션도 없다 · worth 열은 R068 0026 이 이미 만들었다). 실 서버(3000) 재시작은 찬종(`ops.bat` 3 → 1) — MAIN 은 하지 않는다. 16 §5-1 "모은 것 · 뺀 것" 표.
■ ★★ 동시 라운드 — **GEN G024**(힌트 라운드 — questions 의 general_hint · explanation · category_id 를 **쓴다** · 6686 비활성 · 판이 열려 있을 때는 안 씀 · worth 안 건드림) 가 돌고 있다. VERIFY V029 는 끝났다(`questions.worth` 값은 아직 **전부 NULL** — G025 가 `audit/v029-worth.json` 을 쓴다 · 이번 라운드는 NULL 을 2 로 치는 규칙으로 완성하고, 값이 들어오면 그대로 동작해야 한다). MAIN 은 **questions · question_answers 를 쓰지 않는다**. 05 · 06 · 13 · README 는 쓰기 직전 fetch · rebase · 내 파일만 add · force 금지(작업 트리에 GEN 의 미커밋 파일이 있을 수 있다 — 건드리지 않는다). 끝 점검은 단계별로.

■ 먼저 읽기
- **docs/19 §5 전체**(비율 표 · 가장 어려운 칸 규칙 · 가중 · 그대로 두는 규칙 · 저장) · §9-2 씀 ① · 13 **CV-113**(가장 어려운 칸 공급 — 고급 5등급 × 알가치 3 = 15 뿐 · 설계 결정: **폴백은 §5 그대로(3 → 2 → 한 등급 아래) · 비율을 따로 두지 않는다** · 경험 규칙이 사람마다 다른 문제를 주므로 자연히 돌아간다 — CV-113 줄 끝에 "설계 결정 — 그대로 · R069" 를 MAIN 이 적는다) · V029.txt 2-2 표(등급 × 알가치 수 — 검사 기대값의 근거 · 지금 DB 는 worth NULL)
- `shared/src/settings.ts`(DifficultyTier · DIFFICULTY_TIERS · DEFAULT_DIFFICULTIES · difficultyScores · formatDifficulties · RoomSettingsInput.difficulties · validateRoomSettings) · `server/src/db/questions.ts`(difficultyWhere · filterWhere · PoolFilter · countAvailableQuestions) · `server/src/db/questionPool.ts`(PoolQuestion — difficulty_score · worth 가 없다 → 더한다) · **`server/src/game/select.ts`**(selectNextQuestion — 3단계 경험 규칙 · 정답 중복 · 흘림 · weightedPick · 순수 함수 · 단위 테스트) · `server/src/game/question.ts`(92행 selectNextQuestion 호출 · game.stage3Count) · `server/src/rooms/types.ts`(58 · 474 difficulties) · `server/src/lobby/info.ts` · `server/src/socket/index.ts` · `server/src/db/stats.ts`(byTier) · `client/src/GameSettings.tsx`(242~269 난이도 버튼 · 마지막 하나 못 끄기 R068) · `client/src/Lobby.tsx` · `client/src/Question.tsx`(227 뱃지 "난이도 하·중") · `client/src/useRoom.ts` · `scripts/bot.mjs` 3790~3890(난이도 검사) · ui-check 묶음(설정 화면)
- docs/04-PROTOCOL 3장(선정 알고리즘 — D-054) · 01 4장 136행(난이도 매핑) · 8장 · PLAY-GUIDE 38 · 68행 · R068.txt 0절 "240자 표" 와 "측정 메모"(QuestionText 자동 맞춤이 재는 때에 따라 19px/15.2px 로 갈림)

■ A. 설정 모델 — 초급 · 중급 · 고급 (shared → server → client)
- `shared/src/settings.ts`: `DifficultyLevel = 'beginner' | 'intermediate' | 'advanced'` · `DIFFICULTY_LEVELS`(순서 = 표기 순서 · label 초급 · 중급 · 고급 · 한 줄 설명(19 §5 문구 — 화면에 맞춰 다듬되 뜻 유지) · `ratio: [p1,p2,p3,p4,p5]`(초급 30/50/20/0/0 · 중급 10/30/40/20/0 · 고급 5/15/30/30/20) · `scores`(비율 > 0 인 등급 — 초급 1~3 · 중급 1~4 · 고급 1~5) · `hardest`(초급 3 · 중급 4 · 고급 5)) · **기본값 중급**(찬종) · `RoomSettingsInput.difficulties` → `level: DifficultyLevel` · `validateRoomSettings`: `level` 검증 · ★ **옛 `difficulties` 배열이 오면 받아서 옮긴다**(hard 포함 → advanced · easy 만 → beginner · 그 밖 → intermediate — 다시 하기 이어받기 · 옛 클라이언트 · 봇) · `formatDifficulties` → `formatLevel`(초급/중급/고급) · `planGrades(count, level, random)`: 문항 수 × 비율 → 등급별 수(큰 나머지 순 반올림 · 20이면 초급 6·10·4 / 중급 2·6·8·4 / 고급 1·3·6·6·4 · 예시를 단위 테스트로) → **등급 목록을 무작위로 섞는다**(오름차순 아님 — 찬종 "하에서 5 는 당황 · 상에서 1 은 괜찮다" 는 비율로 이미 지켜진다) · 순수 함수 · 테스트.
- 서버 `PoolFilter.difficulties` → `level` · `difficultyWhere` 는 그 level 의 scores 로(초급은 1~3 전부 읽는다 — 폴백 "한 등급 아래" 가 같은 풀 안에서 돌아야 한다) · `countAvailableQuestions` 는 그대로 **전체 수**(Q-21 안내 · "문제가 부족합니다" 는 전체가 모자랄 때만 — 19 §5) · rooms/types · lobby/info · socket 핸들러 · games 에 이 판의 level 기록(지금 difficulties 를 어디에 남기는지 따라) · `stats.ts` byTier 는 **등급 1~5 다섯 칸**(label '1'~'5' · 프로필 전적 화면은 "등급별 맞힌 수" 작은 표 — 하/중/상 글자 없앰).
- 클라이언트: 설정의 난이도 = **버튼 셋 중 하나**(라디오 꼴 · 켜고 끄기 아님 · "하나는 남겨야 해요" 안내와 흔들림 제거 · 버튼 밑 한 줄 설명은 고른 것만 보이거나 셋 다 작은 글자 — 360 폭에서 두 줄 안) · 게스트는 고른 것만 진하게(분야와 같은 꼴) · Question.tsx 뱃지 "난이도 중급" · 결과 화면 · 로비 설정 요약 · 다시 하기 · PLAY-GUIDE.
- 봇 `scripts/bot.mjs` 난이도 검사(3790~) 를 level 로 다시 쓴다 + 옛 `difficulties` 를 보내면 옮겨지는 검사 한 줄 · ui-check 설정 묶음.

■ B. 선정 — 등급 계획 + 알가치 가중 (`server/src/game/select.ts` 안에서 · 순수 함수 유지 · await 없음)
- 게임 시작 때 `planGrades` 로 **등급 계획 배열**(길이 = 문항 수)을 만들어 game 에 둔다(다시 하기는 새로 섞음 · 중간 참가 · 조기 종료는 그대로). 문항 i 의 **목표 등급 g** = 계획[i].
- `selectNextQuestion` 입력에 `targetGrade · level(hardest) · worthWeight` 를 더하고, 후보를 고를 때:
  ① **후보 집합** = 지금 규칙(경험 3단계 · 정답 중복 · 흘림)으로 걸러진 것 가운데 `difficulty_score === g`.
  ② **가장 어려운 칸**(g === hardest): worth 3 인 것만 → 비면 worth 2(NULL 포함) → 비면 **g−1 등급**에서 같은 순서(3 → 2) → 그래도 비면 ③ 의 폴백. worth 1 은 이 칸에 넣지 않는다.
  ③ **나머지 칸**: 가중 = 기존 가중(미경험자 수) × (worth 3 → 2 · worth 2 또는 NULL → 1) · **worth 1 은 3·2 후보가 하나도 없을 때만**(그때는 ×1).
  ④ **등급 폴백**: g 에 후보가 없으면 g−1 → g−2 … → 그다음 g+1 …(level 의 scores 안에서만 · 아래 먼저 — 19 §5) · 전부 없으면 지금의 "문제 부족" 경로 그대로.
  ⑤ 경험 규칙의 단계(1 → 2 → 3)는 **등급보다 우선**한다(04 3장 · D-054 — 전원이 아는 문제보다 다른 등급의 안 본 문제가 먼저). 즉 순서는: 단계 1 안에서 ①~④ → 없으면 단계 2 안에서 ①~④ → 단계 3.
- `game_questions` 에 목표 등급 · 실제 등급 · worth 를 남긴다(열이 없으면 로그 한 줄로 — 마이그레이션은 하지 않는다 · 열 추가가 꼭 필요하면 0절에 제안만) · 콘솔 한 줄 "#id (등급 g→실제 s · 알가치 w · 선정 n단계 · 폴백 여부)".
- **단위 테스트**(select.test): 계획 수 20 셋 · 섞임 · 가장 어려운 칸 worth 3 만 · 3 이 없으면 2 · 2 도 없으면 g−1 · worth 1 은 예비 · NULL = 2 · 폴백 순서(아래 먼저) · 경험 단계 우선 · 흘림·정답 중복 그대로 · 문항 수 1 · 3 · 50 · 200 의 계획 합이 문항 수.

■ C. 긴 지문 360 폭 글자 규칙 + 자주 쓰는 이모티콘 탭
- R068 권고(240자 가능 — 360 에서 150자 넘는 지문은 15px): `QuestionText` 자동 맞춤을 **재는 때에 안 흔들리게** — 글자 수 · 폭으로 정하는 결정적 규칙(예: 폭 ≤ 400 이고 150자 초과 → 15px · 100~150 → 17px · 그 밖 19px — 수치는 R068 표에 맞춰 MAIN 이 정하고 0절에) · PC 는 그대로 · 검사 DB 의 240자 문항으로 m360 9줄 · 입력칸 보임 재확인(320-qlen-240-m360 다시). 15 §3-1 QLEN 블록은 설계가 G025 에서 240 으로 올린다 — MAIN 은 화면만.
- **#70 자주 쓰는 이모티콘 탭**: 이모티콘 고르기 창 첫 탭 "자주"(최근 보낸 것 순 · 12 · localStorage · 비어 있으면 탭 숨김 또는 "아직 없어요") · 특별 이모티콘도 포함 · 단축키 자리 설정과 무관 · `reports:handle --id 70 --note "R069 …"`.

■ D. 문서 · 끝 점검
- 문서: 01 4장 난이도 매핑 줄(초급·중급·고급 비율 · 알가치 가중) · 8장(출제 규칙) · 16-R069 · 04 3장 선정 알고리즘(등급 계획 · 알가치 · 폴백 순서) · PLAY-GUIDE 38 · 68행 · 19 §5 머리에 "적용 R069(날짜 · 커밋)" 한 줄(본문은 설계 몫) · 07 D-307~ · 13 A97(체감 — 초급·중급·고급 이름 · 설명 · 고급 한 판에서 "모르는데 알아 둘 만한" 문제가 나오는지 · 등급별 분포) + CV-113 줄 끝 · 10 49절 · 05 · 06 · README R 표.
- 끝 점검(단계별 · 10 49절 표): typecheck · vitest(select 새 테스트 포함) · build · smoke · 봇(설정 level 셋 · 옛 difficulties 옮김 · 다시 하기 이어받음 · 게스트 권한 · ★ **비율 실측**: quizweb_test 에 등급 1~5 · worth 1/2/3/NULL 이 고루 있는 seed 를 넣고 20문항 중급 판을 돌려 실제 등급 분포가 계획 2·6·8·4 와 같은지(폴백 없을 때) · 고급 판의 5등급 칸이 worth 3 에서만 나오는지 · worth 3 을 비우면 2 로 · 전부 비우면 4등급으로 내려오는지 · 흘림·정답 중복 검사 그대로) · ui-check r069(설정 화면 PC 5크기 + m390 · 뱃지 · 결과 · 프로필 전적 · 240자 m360 · 이모티콘 "자주" 탭) · wrap-audit · 메모리.
- ★ 검사 DB 에 worth 를 넣는 seed 는 `npm run db:test-init` 의 최소 seed 에 더한다(실 DB 는 안 건드림).
■ 하지 말 것: 실 DB 쓰기 전부(마이그레이션 · questions · worth) · 15 · 19 본문 수정(19 §5 머리 한 줄만) · 문항 내용 · G024 파일(audit/g024-* · g024-raw) · 13 새 CV 줄(A97 과 CV-113 줄 끝만) · 실 서버 재시작 · 사람이 하는 동안 끝 점검(검사 DB 분리됐으니 봇·ui-check 는 되지만 메모리 규칙) · force push · `worth_knowing`(옛 R011 열 — worth 와 다르다 · 건드리지 않음).
■ 커밋: 묶음마다(A shared+server+client · B 선정+테스트 · C 화면 둘 · D 문서·끝 점검) · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
■ 확인할 것 (원칙 7): R068 끝 번호 D-306 · A96 · 10 48절 · 마이그레이션 마지막 0026(`questions.worth smallint null` 있음 · 값 전부 NULL · 옛 `worth_knowing` 열 따로) · 활성 6,506(G024 가 6686 비활성 — 6,507 일 수도) · 등급 분포 1:572 · 2:1,707 · 3:2,560 · 4:1,369~1,370 · 5:298 · DEFAULT_DIFFICULTIES = 셋 전부 · select.ts 순수 함수 · 미처리 제보 2(#70 · #64) — 다르면 0절에.
■ 보고 `ai-out/R069.txt`: 0절 찬종이 볼 것(설정 화면 그림 PC · m390 · 선정 규칙 한 문단 · 봇 비율 실측 표(계획 vs 실제 · 폴백 수) · 지문 글자 규칙 표 · "자주" 탭 그림 · game_questions 기록 방식) · 끝 점검 표 · 고친 문서.
■ ★ 이어서: 끝나면 멈춘다. 터미널 마지막 줄 "R069 끝 — 다음 브리핑 대기".
■ 답변: 한국어 · 터미널 5줄 이내.
