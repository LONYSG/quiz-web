[GEN G009]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다)
TASK: A. V011 반영(CV-21~24 · 활성 12행 안팎 고침 · DB 쓰기) · B. 15 §3-3 · §4-1 한 줄씩(2회차 ↔ 1회차 힌트 대조 · 한 글자 조각) · C. **상 생성 3차 500**(G005 흐름 — 생성 → 채점 → 한 번 고침 → 힌트 → 게이트 → VERIFY 묶음) · D. 작업 폴더 정리. 생성분은 **적재하지 않는다**(V013 뒤 G010). 미니게임 데이터는 손대지 않는다(V012 가 verify 칸을 쓰는 중)
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5`)

■ 고정 규칙: docs/16-ROUND-PROTOCOL.md 그대로 (3장 · 4장 · 5-2 · 1장 번호 — 다음 DG-036 · C71 · Q 는 올리지 않는다).
■ ★★ 동시 라운드 — VERIFY V012(미니게임 642 재검증 — `data/minigame/*/items.json` 의 verify·status 칸을 쓴다 · DB 읽기만) · MAIN R051(미니게임 2차 · 미커밋 server/ client/ 파일 있음 · questions 는 안 건드림)이 같이 돈다 (docs/16 6장).
- GEN 몫: pipeline/ · scripts/g009-* · data/pipeline/(audit 의 v012-* 제외) · 15 · 05 Track D 행과 그 아래 줄 · 06(맨 위 새 블록) · 07 DG- · 13 **C 행 + CV-21~24 끝 표시** · README **G 표**. ★ `data/minigame/` · `assets/minigame/` 은 이번엔 **읽기도 쓰기도 하지 않는다**.
- git: G008 방식 그대로 — 내 파일만 `git add` · `git fetch` 로 원격 확인 · 앞서 있으면 내 커밋을 `git rebase origin/main` · force 금지. V012 가 items.json 을 커밋해도 내 쪽과 겹치지 않는다.
- ★ 메모리: 하위 에이전트 **한 번에 2개 이내**(VERIFY 1 · MAIN 1 — MAIN 은 이번에 헤드리스 Chrome 검사를 많이 돌린다) · 띄우기 전 남는 메모리 1.5GB 미만이면 2분 × 10 대기 · 429 면 모델을 바꾸지 않고 재설정 뒤 이어서 · 에이전트마다 임시 폴더 `tmp/g009/work-*`.
■ 토큰: 하위 에이전트는 생성 · 채점 · 힌트 · 사실 확인에만 · 보고서는 바뀐 것과 표만(항목 전문은 JSON).

■ 먼저 읽기
- docs/16 · ai-out/gen.md(3 · 4-1) · **ai-out/V011.txt 전체**(3절 fix 12 · 4절 경계 · 6절 반복 오류) · **ai-out/V010.txt 6절**(다음 생성을 위한 제안 — 낱말 뜻·정의 꼴 · 취미 세부) · ai-out/G008.txt 0 · 1절 · ai-out/G005.txt(1~5절 — 흐름 · 소재 배분 · 고침 효과) · ai-out/V009.txt 6절
- docs/15 전체(G008 판 — §5-1 상 = 4 각주 · §3-2 · §3-3 · §4-1 H0~H12 · §2 B2 · §7-1) · pipeline/prompts/deep-v5.md · media-v3.md · score-v3.md · hint-v5.md · seed-v3.md · seed-r2-v2.md
- data/pipeline/audit/v011-results.json(`cv20`[id].proposal · `pairs`["id↔id"].proposal · `g007Gen`(ref → id)) · scripts/g006-apply-hints.mjs · g008-apply-hints.mjs(반영 꼴) · scripts/g005-build.mjs · pipeline-load.mjs(`--gate-only`) · hint-check-active.mjs · measure-pool-exhaust.mjs · scripts/criteria-sync.mjs
- (G005 작업 꼴) tmp/g005/ 의 GEN-INSTRUCTIONS · SUPPLEMENT · SCORE-INSTRUCTIONS · HINT-INSTRUCTIONS 가 남아 있으면 본으로.

■ 찬종의 말 · 확정
- (2026-10-13) "퀄리티 있는 문제 수 늘리는게 우선이야." · (2026-10-14) "gen과 main이 각각 개별적으로 작업이 가능하다면 진행해."
- G008 실측(V010 반영 뒤): 50문제 **상만 10판**(풀 505) · 중+상 57 · 전체 102 · korea 상 1판(57) · 묶음 하나만 고르면 상은 전부 1판 → 상 풀 회복이 1순위.
- 설계 판단(2026-10-17 · 되돌리기 쉽다):
  · **CV-21 → 판정자 기본값 그대로**: 질문을 고치는 쪽 #1783 · #2187 · #3680(질문+해설) · 변형 추가 쪽 #2262(+5 · 기존 변형 "탄소 배출량" 제거) · #2412(+2) · #2887(+4 — 슬래시 "R/P" 는 A5 게이트가 막으면 빼고 "채굴 가능 연수" 는 꼭) · #3072(+2 한글 음차만). 문구는 v011-results cv20[id].proposal.
  · **CV-22 → K1-17(#4973) 만 중립으로**: 질문의 "1895년 땅속에 묻혔다가" 를 "1895년 자취를 감췄다가" 꼴(묻힘/수장 어느 쪽도 단정하지 않음)로 · 유일성·길이는 그대로. L1-19 파라과이 해설은 "풀이된다" 한정이 있으니 그대로.
  · **CV-23 → 그대로**(K4-07 · M1-02 — 틀린 증거 없음 · "지식 근거" 표시 유지).
  · **CV-24 → 5 전부 반영**: #4848 해설 · #5176 힌트 · #4760 힌트 · #2106 힌트(1회차) · #99 힌트(1회차) — pairs[…].proposal 그대로(chk 통과분).
  · V011 4절의 **#14 해설**(낡은 작업 메모 "Q-37에 따라 힌트를 만들지 않아야 한다")은 지운다 — 해설이 그 메모뿐이면 15 §4 E1~E4 에 맞는 한 줄을 새로 쓴다(사실은 문서로).

■ 대상·목표 (확인 대상 — 설계 에이전트가 G008 보고서에서 센 값 · 작업 전 DB 와 다시 맞춘다)
- 활성 5,113 · 상(4) 505 · 힌트 2,924(그중 3 은 MAIN ui-check 시험 힌트 #1~3 — 손대지 않고 해시 비교에서 뺀다) · 묶음별 상: korea 57 · sports 64 · life 68 · history 68 · science 75 · media 83 · arts 90 · G008 백업 quizweb-20261017-021125.
- 생성 **500 이내** · 배분: **korea 120 · sports 100 · life 80 · media 60 · history 50 · science 50 · arts 40**. 소분류는 활성 상이 적은 쪽부터(G005 1절 표 갱신).
- ★ 목표: GEN 채점(score-v3) 상 **55% 이상**(G005 는 62% → V009 blind 35%였다 — blind 로 **상 175 안팎**이 목표). korea 상이 blind 뒤에도 40 이상 더해지게(57 → 100 안팎 → korea 상만으로 두 판).

■ 기준 — 새 기준 없음. G005 흐름 ①~⑥ 그대로(생성 직후 채점 → 3 이하 한 번 고침 → 다시 채점 · 사실은 문서 · 질문 숫자·연도·동사 글자 대조 · hint-v5 · 변형은 검색 확인 · B2). 프롬프트는 deep-v5 · media-v3 · score-v3 · hint-v5.
- ★ 이번에 더하는 것(V010 6절 · V011 6절):
  ① **낱말 뜻·정의 꼴**("~을 뜻하는 말은?" · "~을 이르는 낱말은?")은 묶음마다 **10% 이하** — 상은 "들으면 아는 대상의 교과서 밖 세부" 로.
  ② 취미 영역 세부를 늘린다(life: 낚시 · 등산 · 캠핑 · 자동차 · 요리 · 원예 · 반려동물 · 보드게임 · DIY · 사진 / sports: 규칙 · 기록 · 장비 · 구단 역사) — 마이너 대상이 아니라 "관심층은 아는" 세부(deep-v5 경고 그대로).
  ③ **2회차를 쓸 때 1회차의 힌트까지 같이 대조**(H12 양방향 — hint-input 의 sameAnswerActive 에 1회차 힌트를 넣는다) · 2회차 힌트에 정답의 끝 낱말 한 글자 조각("이 탑" ↔ 에펠탑)이 나오지 않게 사람이 본다(기계 H2 는 못 막는다).
- 같은 정답이 활성에 2건 이상이면 쓰지 않는다 · 2회차 (가)는 §3-3. 자기 검토는 판정이 아니다 — 최종 난이도는 V013 blind.

■ 할 일 (항목마다 "다 됐다" 의 기준 · A → E · 단계마다 커밋)
A. **V011 반영** — `npm run db:backup` → `scripts/g009-apply-v011.mjs`(멱등 · 파일 단계 검사 · 대상 행의 지금 값이 V011 before 와 같은 행만 · 다르면 건너뛰고 목록) → 질문 3(#1783 #2187 #3680 + #4973 K1-17) · 해설 2(#3680 · #4848) + #14 · 변형(#1783 +3 · #2187 +3 · #2262 +5/−1 · #2412 +2 · #2887 · #3072 +2 — 게이트 question-checks 통과분만 · 막힌 것은 사유) · 힌트 4(#5176 #4760 #2106 #99 — checkHint 막힘 0). 다 됐다 = `data/pipeline/audit/g009-fixes.json`(ref · id · field · before · after · why · sources) · 대상 밖 questions(#1~3 제외) · question_answers md5 가 반영 전후 같음 · hint-check-active 막힘 0 · 활성 5,113 그대로.
B. **15 · 프롬프트 한 줄씩** — §3-3 SYNC 구간에 "2회차를 쓸 때 1회차 **힌트**도 같이 대조한다(H12 양방향 — V011 S1-13 · L3-17)" · §4-1 H2 에 예 "이 탑 ↔ 에펠탑(정답 끝 낱말 한 글자)" · deep-v5 SYNC · `criteria-sync --check` 통과 · DG-036. 다 됐다 = 15 머리글 · 프롬프트 버전은 올리지 않는다(deep-v5 그대로 · 예시 추가).
C. **생성 3차** — 소재(배분 표 · 전역 대조 활성 5,113 + 이번 초안 · 버린 소재 수와 사유) → 생성 → 중앙 기계 검사 → 사실 → 채점 → 고침 한 번 → 다시 채점 → 힌트 → checkHint · hint-check 경고 읽기 → 게이트 `data/pipeline/generated/g009/` → `pipeline-load --round g009 --gate-only` 전량 통과 · 같은 정답 누적 3건 이상 0.
   다 됐다 = 묶음별 표: 생성 · 탈락(사유별) · 1차 채점 상 · 고침 수 · 고친 뒤 상 · 최종 상 비율 · 낱말 뜻 꼴 비율 · 2회차 수 · 알 가치 · 접근성 2 수 · 힌트 수 · hintBasis · "들어가면" 풀 추정(상 · 중+상 · 전체 · korea 상 — blind 35% 가정으로도).
D. **작업 폴더 정리** — 미추적 임시 도구 `scripts/_g005-*` · `_g006-*` · `_g007-*` · `_g008-*`(22개)를 `tmp/gen-tools/` 로 옮긴다(커밋하지 않는다 · 지우지 않는다) → `git status` 에 GEN 미추적 파일 0. 이번 라운드의 임시 도구도 처음부터 `tmp/g009/` 에.
E. **VERIFY 묶음 · 문서** — `data/pipeline/audit/g009-verify-targets.json`(G005 꼴 + rewrite · score1 · score · 2회차는 1회차 id·힌트 포함) · samples/g009-deep.json · 05 Track D · 06 · 07 DG-036~ · 13 CV-21~24 끝 표시 · C71(V013 대기 — 표본 · 먼저 볼 것) · README G 표 · `ai-out/G009.txt`.

■ DB 쓰기: **A 만 허용**(백업 1회 뒤 · 위 행만). 생성분 적재 금지 · 난이도 변경 금지 · 미니게임 표 금지.
■ 웹·토큰 예산: WebSearch **150회 이내** · WebFetch 주 수단 · 하위 에이전트 **한 번에 2개 이내** · 생성 500 이내.
■ 하지 말 것: 적재 · 기존 활성의 A 밖 수정 · 15 규칙 문구 변경(B 의 두 줄과 예시만) · 새 Q · 마이너 대상으로 어렵게 · 두 번 이상 고치기 · server/ client/ shared/ · data/minigame · assets/minigame · VERIFY·MAIN 몫 문서.
■ 확인할 것 (원칙 7): 활성 5,113 · 상 505 · 묶음별 상(위) · 힌트 2,924(ui-check 3 포함) · 풀 실측(상 10 · 중+상 57 · 전체 102) · deep-v5 · media-v3 · score-v3 · hint-v5 가 지금 판 · v011-results 의 fix 12 — 다르면 0절에.
■ 끝 점검: 게이트 N/N · 활성 5,113 그대로 · 해시 대조 · 결과 파일 개수 = 보고서 건수 · criteria-sync --check 통과 · `git status` 미추적 GEN 파일 0.
■ 보고 항목: cmd 창 → 0 찬종이 볼 것(A 반영 12행 표 · 묶음별 건수 흐름 표 · 상 비율 · 낱말 뜻 꼴 비율 · "들어가면" 상 N판) → 원칙 메모(7 · 동시 라운드) → 1 A → 2 B → 3 소재 → 4 생성·검사·사실 → 5 채점·고침·힌트 → 6 게이트 → 7 VERIFY 묶음·측정 → 8 GEN 판단 → 9 새 결정 필요 → 고친 문서.
■ 커밋: 단계마다 · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` · 내 파일만 add · fetch → rebase → push.
■ 지난 피드백 (G008): 잘한 것 — 대상 밖 4,585행 · 변형 표 md5 로 "바꾸지 않았다" 를 증명한 것 · ui-check 시험 힌트 3 을 알아채고 뺀 것 · 사진을 정답 모르는 에이전트에게 맞혀 보게 한 것 · 1.5 규칙을 판매처 목록 전체에 적용한 것 · EU 행을 지우지 않고 결정 후보로 남긴 것. 고칠 것 — 임시 도구 미추적 파일 22개가 작업 폴더에 쌓여 MAIN 의 rebase 를 막았다 → D.
■ 답변: 한국어 · 터미널 5줄 이내.
