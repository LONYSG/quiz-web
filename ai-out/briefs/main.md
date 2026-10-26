[MAIN R068 — 찬종 제보 13(10-25 플레이 #52~64) · 정답 공개 평가 3단계 · 1P(docs/19 §7) · photoyear 게임(docs/18 §8) · 긴 질문 240자 360폭 검사 · 고기 굽기 가림 = 소리 끊김]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다. 끝나면 멈춘다)
TASK: 찬종이 R067 빌드로 한 판(판 2194~2199 · 계정 lonysg2) 하며 남긴 **제보 13 을 처리**하고, **정답 공개 평가(3단계 · 1P)**와 **photoyear 미니게임**을 만들고, 질문 상한을 200 → 240자로 올릴 수 있는지 **화면으로 검사**한다. 머리에 `npm run reports:report -- --no-bots` 로 13 건을 읽는다(아래 표가 설계 요약 · 원문은 보고가 정본).
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` · 바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (07 **D-301** 부터 · 13 **A96** · 10 **48절** · 01 16-R068 · 05 · 06 · README). 하위 에이전트 ≤1 · 남는 메모리 1.5GB(검사 서버 · 봇은 `quizweb_test` 만 · 실 DB 는 마이그레이션과 photoyear 적재만 · 쓰기 전 `npm run db:backup`). 실 서버(3000) 재시작은 찬종(`ops.bat` 3 → 1) — MAIN 은 하지 않는다.
■ ★★ 동시 라운드 — **GEN G023**(재판정 결과 적용 — questions · question_answers 를 **쓴다** · 판이 열려 있을 때는 안 씀 · worth 열은 안 건드림) ‖ **VERIFY V029**(알가치 판정 — 읽기만)가 돌고 있을 수 있다. 0026 의 `ALTER TABLE questions ADD COLUMN worth` 는 G023 쓰기와 겹쳐도 된다(백업 뒤 · 판 없을 때 · 잠금 짧음). MAIN 은 **questions · question_answers 를 쓰지 않는다**(제보 문항 5 도 — 아래). 05 · 06 · 13 · README 는 쓰기 직전 fetch · rebase · 내 파일만 add · force 금지. R067 과 같이 끝 점검은 단계별로.

■ 제보 13 + 7 = 20 처리 (#52~64 lonysg2 · #65~71 lonysg 10-25 밤 · 처리마다 `reports:handle --id N --note "R068 …"` · 0절에 표: id · 화면 · 원문 요지 · 원인 · 고침/보류)
| id | 화면 | 요지 | 할 일 |
|---|---|---|---|
| 65 | game:question(설정) | 설정에서 "제보" 누르면 버튼이 다 튀어나감 · 이모티콘 설정에서 QHD(2560)일 때 둘째 줄 특별 이모티콘을 누르면 제대로 선택이 안 됨 | 설정 창 제보 버튼 레이아웃(1536/2560/m390) · 이모티콘 편집 둘째 줄 클릭 영역(2560 에서 히트 영역·겹침 확인 · 57 과 같은 뿌리인지) |
| 66 | game:reveal | 이모티콘을 붙여 보내면 세레모니에 맨 앞 하나만 표시됨 | 세레모니 이모티콘 파서가 첫 코드포인트만 잡는지(ZWJ · 연속 이모지) · 의도(하나만)면 보낼 때부터 하나로 제한하고 안내 |
| 67 | game:reveal · 문항 1941 | "답이 주관식이 아님"(정답 "특허를 공개했다" — 문장형 정답) | **문항은 안 고친다** — V028(verify 반)이 입력 꼴 표시로 잡는다 · R068 은 note 만("V028/G023 몫") · 처리 표시는 하지 않는다 |
| 68 | game:result | 결과 화면의 문제 평가는 기본 접힌 상태로 | 접힘 기본값 + 펼침 기억(localStorage) · 접혀 있어도 평가 수는 보이게 |
| 69 | room | 미니게임 고르기: 아이콘 가운데 정렬 · 체크 박스 더 크게 · 위치 정확히 | 아이콘·체크 정렬(1536/2560/m390 캡처) |
| 70 | room(idea) | 자주 쓰는 이모티콘 탭 | **보류**(note "다음 라운드 · 10 절 후보") — 사용 빈도 저장 설계가 필요 |
| 71 | room | **프로필 사진 변경이 안 됨 — 확장자 맞췄는데도 에러가 뜸**(PC 웹 · 10-26 00:56 · 계정 lonysg) · 같은 날 123qwe(3556)도 못 바꿔 설계가 DB 에 직접 넣어 줌(account_avatars 3556 jpeg 16,200B) | 원인 찾기(재현: test 서버 + playwright chromium, jpg 56KB 올리기): ① avatarRoutes PUT 의 409 "게임 중에는…"(room.state 가 LOBBY 가 아닐 때 — GAME_RESULT 에서 설정 열면?) ② express.raw type/limit 과 blob.type 불일치 → 400/413 ③ ProfileEditor 120 toBlob webp 실패 → "사진을 만들지 못했습니다" ④ 오류 글이 무엇이었는지 0절에 적고 고침 · 터널(cloudflared) 경유도 한 번 |
| 52 | room | 미니게임 첫 1위 설명이 길어 "…" 으로 생략 | 생략 없이 줄바꿈(폭 · 두 줄까지 · 1536/2560/m390) |
| 53 | room | "지난판 문제 평가" 누르면 글자가 오른쪽으로 쭉 늘어나 화면 밖으로 | 긴 질문 글 줄바꿈(nowrap · min-width · 표 셀 원인 찾기) · m390 포함 |
| 54 | balloon roundResult | 펌프가 가운데 정렬이 아님 · "점수 오르는 범위도 정해 주고 알려 줘" | 펌프 가운데 · 점수 규칙(얼마에서 얼마까지 · 어떻게 오르는지)을 도움 줄/결과에 한 줄로 보이게 |
| 55 | cake play | "소리가 끝까지 난다" — ★ 찬종 확정(2026-10-26): **가리면 소리도 끊는다** | CakeWait.tsx 똑딱 — hideStart 뒤 재생 안 함(점점 작게 규칙 삭제) · lab · ui-check r067 고기 기대값 · PLAY-GUIDE 문구 |
| 56 | room | 난이도 선택 버튼이 토글이 안 됨 — "눌러도 표기되는 건 선택된 걸로만 보임" | GameSettings.tsx 85~94(마지막 하나는 못 끄게 돼 있다) → 실제로 재현(PC · m390 · 방장/비방장 · 둘 이상 켠 뒤 끄기)해 원인 확정. 끌 수 없는 경우면 **그 이유가 보이게**(흔들림 + "하나는 남겨야" 안내) · 다른 원인(상태 안 반영 · 서버 설정 echo 지연)이면 고침 |
| 57 | game:question m390 | 이모티콘 편집 아이콘이 버튼과 그림이 안 맞음 | 모바일에서 아이콘 · 버튼 정렬 고침 · ui-check |
| 61 | game:reveal m390 | 긴 문제(5760 검도 · **140자**인데도)에서 시간 표시가 줄바꿈 됨(갤럭시 울트라는 안 생김 — 폭 360 쪽 문제) | 아래 ■ 240자 검사와 같이 — 시간 표시는 폭 360 에서도 한 줄 고정 |
| 64 | circle final | "원 말고 다른 도형 해도 재밌을 듯" | 구현 안 함 — 13 A96 에 "아이디어(보류 · 설계 대기함)" 로 적고 handle note "보류" |
| 58 · 59 · 60 · 62 · 63 | game | 문항 제보 5(3813 국화 분야 · 1438 민화 · 1619 지열 발전 "문제가 힌트같음" · 500 독일어 · 2096 타이브레이크 "무슨 게임인지") | **내용은 안 건드림** — handle note "V028 판정 대상(설계 브리핑) · 고침은 G023" |

■ 정답 공개 평가 — 3단계 버튼 · 1P (찬종 2026-10-26 · docs/19 §7 — ★ 옛 안(1~5 난이도 설문 팝업 · 설문 패널 · 알가치 두 번 묻기 · question_difficulty_votes · survey:report)은 **없앤다** · 찬종: "어차피 글까지 써 주는 사람은 없더라 · 정답 공개 시간에만 방금 문제 어땠냐고 3단계로 묻고 1P · 자세한 의견은 제보란")
- 지금 있는 것을 고친다: `question_feedback`(vote 1/−1 · reasons · comment · 문항당 계정당 한 줄) · client `QuestionFeedback.tsx`(RevealFeedback = 정답 공개 중 👍👎 · ResultFeedback = 결과 화면 · LastGameFeedback = 로비 "지난 판 문제 평가") · `server/src/http/feedbackRoutes.ts` · `feedback:report` · `feedback:adopt`(+5P 는 그대로).
- 마이그레이션 **0026**: `question_feedback.vote` CHECK → (−1 · 0 · 1) · `question_feedback.at_reveal boolean not null default false` · `question_feedback.rate_grant_id bigint null references point_grants(id) on delete set null` · ★ `questions.worth smallint null check (worth between 1 and 3)`(알가치 — docs/19 §9 · 값은 G025 가 넣는다 · R068 은 열만 · 코드에서 읽지 않는다). 실 DB 적용은 백업 뒤 · 관례대로. survey_panel · question_difficulty_votes 는 만들지 않는다.
- 정답 공개 화면(game:reveal · 공개 시간 동안): 정답 줄 아래 한 줄 **"방금 문제 어땠어요? (+1P)"** + 버튼 셋 **👍 좋아요 · 😐 그냥 · 👎 별로**(이름은 이것으로 — 더 자연스러운 이름이 있으면 0절에 둘 다 적고 하나로) · 누르면 그 자리가 **"+1P 고마워요"** 로 바뀜(바꾸기는 공개 시간 안에서만 · 포인트는 한 번) · 다음 문제로 넘어가면 사라짐 · 모바일에서 입력칸·힌트를 가리지 않게(m390 캡처). 봇·검사 계정은 버튼이 떠도 포인트 0(BOT 규칙 그대로).
- 포인트 규칙(서버가 판단 · 클라이언트 시각 안 믿음): 표가 들어온 순간 그 방이 **QUESTION_RESOLVED 이고 그 문항이 현재 문항**이면 at_reveal=true → **1P**(point_grants reason **`rate`** 신설 · ref = question_feedback.id · 토스트·잔액 갱신은 기존 지급 길) · **하루 상한 없음**(찬종 "1포인트씩") · 같은 문항 두 번 없음(rate_grant_id 가 있으면 다시 안 줌) · 공개 시간 밖(결과 화면 · 로비 지난 판 평가 · 늦게 온 요청)은 저장만 하고 **0P**(at_reveal=false · 찬종: "정답 공개 시간 외에 평가한 문제들은 포인트 안 준다").
- 결과 화면 · 로비 "지난 판 문제 평가": 버튼을 같은 3단계(👍/😐/👎)로 · reasons · comment 는 그대로 두되 머리에 **"자세한 의견은 제보에 적어 주세요(채택되면 +5P)"** 한 줄 + 제보 창 여는 링크 · 0P 라고 작게 표시("공개 시간에 누르면 +1P").
- 보고 `npm run feedback:report -- --no-bots` 확장: 문항별 👍/😐/👎 수 · 그중 at_reveal 수 · ★ **찬종 표(lonysg · lonysg2)는 따로 열** — 찬종은 "절대 신뢰"(실수는 제보 코멘트로 교정) · **검토 후보** 절: 찬종 표가 없고 남의 표가 ≥ 2 인 문항 중 👎 ≥ 👍 + 1 인 것 · 한 계정이 한 판에서 전부 같은 버튼(장난 의심 · 그 계정 표는 검토 후보에서 뺌) · (questions.worth 가 채워진 뒤) worth 3 인데 👎 > 👍 · worth 1 인데 👍 ≥ 2 → 설계가 찬종에게 가져간다(자동 반영 없음).
- 문구(그대로 쓴다): 공개 "방금 문제 어땠어요? (+1P)" · 누른 뒤 "+1P 고마워요" · 결과·로비 "공개 시간에 누르면 +1P · 자세한 의견은 제보에 적어 주세요(채택되면 +5P)". PLAY-GUIDE 한 절 갱신(옛 👍👎 설명 교체).
- 봇 시나리오: 공개 중 표 → 1P · 공개 뒤 같은 문항 다시 → 저장만 · 결과 화면 표 → 0P · 두 번 눌러도 잔액 +1.
- 그림: 300-rate-{reveal · after · result · m390}.png.

■ photoyear 미니게임 (docs/18 §8 · C82 ③ — 데이터 100 verified 가 `data/minigame/photoyear/items.json` 에 있다 · 적재 안 됨)
- 규칙: 사진 한 장 → **연도 4자리 입력**(모바일 숫자 키패드 · 1800~올해 범위) · 시간은 photo 게임과 같게 · 점수 = **오차 |입력 − year| 작은 순**(순위 점수는 다른 미니게임 꼴) · `yearKind circa` 는 `yearRange` 안이면 오차 0 · 공개 때 정답 연도 · title · place · 각자 오차 · attribution(photo 와 같은 자리) · as_of 머리줄 없음(as_of null).
- 코드: shared MINIGAME_KEYS · server defs(RoundSpec) · 클라이언트(PhotoGuess 꼴 재사용 가능하면) · 봇 시나리오 · 미니게임 카탈로그 설명 · 미니게임만 모드 · 연습.
- 적재: `minigame-load.mjs` 에 photoyear 추가(GAMES_ALL) → 백업 → `--game photoyear --dry-run` → `--apply`(100 · 그림은 이 PC assets/minigame 에 이미 있다 · `backups/minigame-g021.zip`) · difficulty 는 GEN 값 그대로(CV-73 (a)).
- 그림: 310-photoyear-{play · reveal · result}-{1536 · m390}.png.

■ 긴 질문 검사 (QLEN 200 → 240 올릴 수 있는가 — 15 §3-1 QLEN 블록은 SYNC · 설계가 고친다 · MAIN 은 결과만)
- 제보 문항 5760(140자) · 활성 중 가장 긴 5332(198자) · **인위 240자 질문**(검사 DB 에 넣음)으로 game:question · game:reveal 을 **360 폭(m390) · 1536 · 2560** 에서 캡처 — 줄 수 · 글자 크기 · 시간 표시 한 줄 유지(#61) · 입력칸 · 힌트 줄이 **스크롤 없이** 보이는지 · 야간 테마.
- 결과 표(폭 × 길이 140/198/240 → 줄 수 · 넘침 여부 · 시간 표시 줄바꿈) + 권고 한 줄(240 가능 / 220 까지 / 200 유지 · 조건). 글자 크기를 줄이거나 레이아웃을 바꾸면 **240자가 되는지도** 따로.
- 그림: 320-qlen-{140 · 198 · 240}-{m390 · 1536}.png.

■ 할 일 순서 · 커밋: A 제보 UI 7(52 · 53 · 54 · 55 · 56 · 57 · 61)과 240자 검사 → B 정답 공개 평가(마이그레이션 · 서버 · 공개 화면 · 결과·로비 · 포인트 · 보고) → C photoyear(게임 · 적재) → D 문서 · 끝 점검. 커밋 묶음마다 · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` · 내 파일만 · fetch → rebase → push.
■ 끝 점검(단계별 · 10 48절 표): typecheck · vitest · build · smoke · 봇(minigame · mgquiz · report · 새 photoyear · 평가 1P 봇 — 패널 계정만 창을 받는지 · 1초 연타 포인트 0 · 하루 10P 상한) · ui-check r068(제보 7 · 설문 · photoyear · 240자) + r067(고기 — 가림 뒤 소리 0) · wrap-audit · 메모리.
■ 하지 말 것: questions · question_answers 쓰기 · 문항 내용 고치기 · V028/G022 파일(audit/v028-* · g022-* · v028-raw) · 15 · 19 수정 · 실 서버 재시작 · 설문 패널 계정 켜기 · 로비 몰아서 설문 · 원 게임 다른 도형 구현 · force push.
■ 확인할 것 (원칙 7): 미처리 제보 20(#52~64 계정 4463 lonysg2 · #65~71 계정 483 lonysg) · R067 끝 번호 D-300 · A95 · 10 47절 · 마이그레이션 마지막 0025 · CakeWait.tsx 에 hideStart 뒤 점점 작게 규칙 · GameSettings.tsx 85~94 마지막 하나 못 끄기 · photoyear items.json 100 verified · GAMES_ALL 에 photoyear 없음 · 5760 질문 140자 · 가장 긴 활성 5332 198자 — 다르면 0절에.
■ 보고 `ai-out/R068.txt`: 0절 찬종이 볼 것(제보 13 표 · 평가 버튼 그림 · photoyear 그림 · 240자 표와 권고 · 난이도 버튼 원인 한 줄) · 끝 점검 표 · 고친 문서.
■ ★ 이어서: 끝나면 멈춘다. 터미널 마지막 줄 "R068 끝 — 다음 브리핑 대기".
■ 답변: 한국어 · 터미널 5줄 이내.
