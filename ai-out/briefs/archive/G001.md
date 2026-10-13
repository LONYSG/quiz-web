[GEN G001]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다)
TASK: V005 판정 반영 → 미디어 200 적재 (DB 쓰기 허용 · 백업 뒤) + 번호 체계 전환(DG · G) + V005 반복 오류를 규칙·검사에 되먹임
실행 모델: Opus 5.5 (찬종 결정 — docs/16 0장)

■ 고정 규칙: docs/16-ROUND-PROTOCOL.md 그대로 (3장 절대 원칙 · 4장 보고 형식 · 5-2 GEN 규칙 · 1장 번호 체계).
  ★ 이번부터 바뀐 것 (16 1장): GEN 라운드 번호는 Gnnn — 이 라운드가 **G001**, 보고서 `ai-out/G001.txt`. 결정 번호는 **DG-nnn**(DG-001 부터). 13-PENDING 은 C 그대로(다음 C61). 반영 스크립트는 `scripts/g001-apply*.mjs`.

■ 먼저 읽기
- docs/16-ROUND-PROTOCOL.md (전체) · ai-out/gen.md (0 · 3 · 4 절)
- ai-out/V005.txt (전체 — 특히 3절 fix 36 · 4절 unsure·경계선 · 6절 반복 오류 · 새 결정 CV-01~03)
- data/pipeline/audit/v005-results.json (`items` 200 — ref 키 · verdict · categories · proposal{question,explanation,hint,variants,layer} · facts · depth · mech)
- data/pipeline/samples/r047-media.json (`items` 200 · `dropped` 10) · ai-out/R047.txt
- docs/13-PENDING-CHECKS.md C60 · CV-01~03 · docs/07-DECISIONS.md 의 D-174 · D-175 (R047 것 — 561~600행 부근에 MAIN R038 것과 겹쳐 있다)

■ 확정 결정 / 찬종의 말
- 우선순위: "main 은 여태 많이 해서 이제 퀄리티 있는 문제 수 늘리는 게 우선" (2026-10-13). 이 라운드는 그 첫 걸음 — 미디어 200 을 게임에 넣는다.
- CV-01(국민 밈 경계 — 4딸라 · 야동순재 · 거성 · 달인 · 도비): VERIFY 가 찬종의 '빵꾸똥꾸 좋음' 표시에 맞춰 ok 로 두었다. **그대로 둔다**(설계 판단 — 되돌리기 쉽다). 도비만 층을 대중으로(V005 제안).
- 한 번에 한 세션만 돈다 — 이 라운드 동안 VERIFY · MAIN 은 움직이지 않는다. 05 · 06 · 07 · 13 · README 를 자유롭게 고쳐도 된다.

■ 할 일 (순서대로 · 항목마다 "다 됐다" 의 기준)
A. 번호 정리 (코드·데이터 안 건드림 — 문서만)
   1. docs/07-DECISIONS.md 의 R047 결정 둘을 **D-174 → DG-001 · D-175 → DG-002** 로 바꾼다(제목·본문). MAIN 의 D-174 · D-175(R038)는 손대지 않는다. 05-STATUS · 13-PENDING · 15 등 docs 안의 참조도 바꾼다. ai-out/*.txt 는 append-only 라 손대지 않는다.
   2. ai-out/README.md 에 **"GEN 라운드 (`Gnnn.txt`)" 표**를 VERIFY 표처럼 새로 만든다(이번 G001 한 줄). 기존 R 표의 GEN 라운드 행(R011~R013 · R017~R024 · R026~R032 · R036 · R037 · R047 — 있는 행만)에 "(GEN)" 표시를 붙인다. 없는 행을 새로 만들 필요는 없다.
   3. docs/15-QUALITY-STANDARD.md **§0 머리글이 낡았다**(확인 대상): "30초" · "마지막 10초 초성" · "난이도 4~5 · 남은 20초 · 10초" · "해설이 5초" · "정답 중복 금지 미구현". 01-GAME-RULES 7 · 8장 기준(문제 40초 · 일반 힌트 남은 30초 · 초성 남은 15초 · 정답 공개 8초 · 힌트는 난이도 3~5(H0) · 한 게임 안 정답 중복 금지는 R014 구현)으로 고친다. 규칙을 바꾸는 것이 아니라 전제 서술을 현재에 맞추는 것이다. SYNC 블록 밖이면 criteria-sync 영향 없음 — `--check` 로 확인.
   다 됐다 = `grep -n "D-174\|D-175" docs/*.md` 결과가 MAIN R038 것뿐이다 · README 에 G 표가 있다 · 15 §0 이 01 과 맞는다.
B. V005 반영 → 최종 200 파일
   1. v005-results.json 의 fix 36 · unsure 2 를 항목별로 읽고 반영한다. 받지 않는 것은 사유를 보고서에(16 5-2). 제안 속 **새 사실은 한 번 더 웹 확인** — 특히 CV-03 의 지식 근거 힌트 5(은밀하게 위대하게 · 카오스 · 프렌즈 · 베스트도전 · 미스터 빈)와 unsure 2(이끼 힌트 · Sorry Sorry 해설). 확인 못 한 사실은 넣지 않는다(곁가지면 빼고, 핵심이면 다른 사실로).
   2. CV-02(카드캡터 체리 · 위닝 일레븐): GEN 판단 — B2 대로 변형을 비우거나, 질문의 한정("한국 방영 제목" · "한일 명칭")을 풀어 변형을 살리거나. 어느 쪽이든 "보고 그대로 친 사람이 오답이 되지 않는" 쪽을 고른다. 보고서에 사유.
   3. V005 6절 4번(단서를 바꾼 뒤 해설·힌트가 옛 질문을 전제로 남음 — 수아레스 등): clue 44 전부를 질문→해설→힌트 순으로 이어 읽어 같은 꼴이 더 있는지 본다.
   4. 고친 항목마다 기계 검사 다시(findAnswerInQuestion · blankCheck · roundDupCheck · assertiveWords · checkHint) → 다시 채점이 필요한 것(단서·층이 바뀐 것)만 score-v1 로 다시 → `pipeline-load` 게이트를 파일 단계에서(`--gate-only` 또는 같은 뜻) 200/200.
   5. 결과: `data/pipeline/samples/g001-media.json` (최종 200 · 항목마다 `v005: {verdict, applied: true/false, why}` · `dropped` 10 은 r047 것 그대로 이어 붙임) · `data/pipeline/audit/g001-fixes.json` (before/after · 사유 · 출처 — 반영 기록).
   다 됐다 = fix 36 + unsure 2 전부에 applied 여부와 사유가 있다 · 게이트 200/200 · 대중/팬 세부 비율이 MD1(30/70 ± 소수)에 있다.
C. 적재 — ★ **DB 쓰기 허용 (백업 뒤)**
   1. `node scripts/backup.mjs` → 덤프 경로를 보고서에.
   2. g001-media.json 을 적재한다(`pipeline-load` 의 `--round` 경로 또는 `scripts/g001-apply-media.mjs` — 멱등하게. 어느 길을 썼는지 보고서에). 소분류 key(`sub`) · game_topic 이 미디어·콘텐츠(해외축구는 sports)로 이어지는지 확인.
   3. 적재 뒤 확인: 활성 수 3,943 → **4,143** (확인 대상 — 다르면 왜) · 난이도 분포 · 미디어 묶음(`category_game_topics` = media) 활성 수와 난이도 분포 · 3~5 힌트 빈 칸 0 · 해외축구 25 가 sports 묶음에 있는지 · 같은 정답 누적(V005 2-8 과 같아야 한다 — 3건 이상 0).
   4. `node scripts/measure-pool-exhaust.mjs` 를 **미디어 묶음만**과 전체로 한 번씩 돌려 "50문제 게임 기준 같은 문제 없이 몇 판" 을 보고서에(R032 측정값과 나란히). 스크립트가 묶음 지정을 못 하면 전체만 돌리고 그 사실을 적는다.
   다 됐다 = 적재 건수 · 활성 수 · 분포 · 풀 측정이 숫자로 보고서에 있고, 백업 경로가 적혀 있다.
D. 규칙·검사 되먹임 (V005 6절 — 찬종 결정 없이 할 수 있는 범위만)
   - **기존 규칙의 예시·해설 추가(허용)**: 6절 1 · 2 → 15 §4-1 H9 근거 칸 또는 7-1 MD9 에 "뜻풀이·번역 · 대표곡·대표작·가장 유명한 사건 = 떠먹여 주기" 예시 / 6절 5 → 15 §2 B2 에 예시(카드캡터 체리 · 위닝 일레븐) / 6절 6 · 7 → 3-2 · H3·H4 근거 칸에 사례. criteria-sync → media-v2 · hint-v3 에 반영 · `--check` 통과. 프롬프트 버전을 올릴지는 GEN 판단(문구가 바뀌면 올린다).
   - **기계 검사 추가(허용 — 기술 판단)**: 6절 3 → `pipeline/lib/question-checks.mjs` 에 "정답을 이루는 낱말(2글자 이상)이 질문에 그대로 있는가" 경고 (findAnswerInQuestion 은 전체 일치만 본다). 6절 7 → hint-check 의 explain 경고를 게이트에서 어떻게 다룰지(fix 로 올릴지)는 오탐률을 표본으로 재 본 뒤 GEN 판단 — 바꾸면 DG 로 기록.
   - **새 규칙은 올리지 않는다(Q 로)**: 6절 8(힌트가 정답의 꼴 — 글자 수·언어·외자 — 을 말하는 것을 금지할지)은 기존 H7 취지와 걸치지만 새 규칙이다 → 08 에 Q-108 로 올리고(선택지 · 사례 5건 · GEN 권장) 이번에는 적용하지 않는다.
   다 됐다 = criteria-sync --check 통과 · 바뀐 프롬프트/검사의 이름과 버전이 보고서에 · Q-108 이 08 에 있다.
E. 문서 · 보고
   - 05-STATUS(Track D 행 — G001 · 활성 4,143) · 06-WORKLOG · 07(DG-003 부터: 적재 · CV-02 판단 · 검사 추가 등 결정마다) · 13-PENDING(C60 → "끝 — G001 적재" · CV-01 → 찬종 판단 대기로 남김 · CV-02 · CV-03 → 끝 · 새 C 는 C61 부터) · 08(Q-108) · 15 · README(G 표).
   - `ai-out/G001.txt` — 16 4장 형식. 목차: 0 찬종이 볼 것 · 1 번호 정리(A) · 2 V005 반영 표(ref · verdict · applied · 사유 — 36+2 전부) · 3 적재 결과(C — 숫자) · 4 풀 측정 · 5 규칙·검사 되먹임(D) · 6 GEN 판단 목록 · 7 새로 생긴 결정 필요(Q-108 포함).

■ 웹·토큰 예산: WebSearch **60회 이내**(CV-03 · unsure 2 · 제안 속 새 사실 재확인 우선) · 서브에이전트 **한 번에 3개 이내**(이 라운드는 대량 생성이 없다 — 반영·적재는 직접 하는 편이 안전하다).
■ 하지 말 것: 새 문항 생성(다음 라운드) · 기존 활성 3,943 수정(V005 는 신규 200 만 봤다) · midHints 1,328 수정(V006 뒤) · server/ client/ shared/ 수정 · 서버 기동 · ui-check · 찬종에게 묻기(13-PENDING C 또는 08 Q 로).
■ DB 쓰기: **허용 — C 의 적재만.** 반드시 `node scripts/backup.mjs` 먼저. 그 밖의 DB 쓰기 없음.
■ 확인할 것 (원칙 7): 활성 3,943(R047 보고) · V005 집계(ok 162 · fix 36 · unsure 2 · drop 0 · 제안 질문 6 · 해설 8 · 힌트 24 · 변형 2 · 층 2) · r047-media.json items 200 / dropped 10 · 07 의 D-174·175 겹침 위치 — 다르면 보고서 0장에.
■ 커밋: 단계마다(A · B · C · D · E) 커밋 · 끝에 push. `docs/media-deep-review.md` 를 고쳤다면 같이 커밋. 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. git 오류면 "VPN 확인 필요".
■ 중단·재개: B 의 반영 기록(g001-fixes.json)을 먼저 쓰고 적재는 한 번에. 적재 뒤 멈추면 활성 수와 백업 경로를 06 에 남긴다.
■ 답변: 한국어 · 터미널 5줄 이내. 첫 줄은 "적재 N건 · 활성 M" 으로.
