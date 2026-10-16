[GEN G007]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다)
TASK: V009 판정 반영 → G005 적재(483 안팎) · 힌트 fix 138 + 새 힌트 20(hint-v5) · 변형 · 풀 실측 · 다음 생성을 위한 규칙 보강(score-v2 · deep-v4 · hint-v5 예시)
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` · 2026-10-16 20시부터 고정 세팅)

■ 고정 규칙: docs/16-ROUND-PROTOCOL.md 그대로 (3장 · 4장 · 5-2 · 1장 번호 — 다음 DG-030 · C69 · Q 는 올리지 않는다).
■ ★★ 동시 라운드 셋 — MAIN R050(미니게임 1차 · 마이그레이션 0017 · questions 는 읽기만) · VERIFY V010(기존 활성 상 608 blind 재채점 · DB 읽기만)이 같이 돈다 (docs/16 6장)
- GEN 몫: pipeline/ · scripts/g007-* · scripts/_g005-*(다시 써도 된다) · data/(audit 의 v010-* 제외) · 15 · 05 Track D 행과 그 아래 줄 · 06(맨 위 새 블록) · 07 DG- · 13 **C 행 + CV-14~17 끝 표시** · README **G 표**.
- MAIN 몫: server/ client/ shared/ migrations/ · 01~04 · 05 R 행 · 07 D- · 13 A 행 · README R 표 · 17 상태 칸. VERIFY 몫: V010 · audit/v010-* · 13 CV-18~ 행 · README V 표.
- ★ V010 은 **G005 가 아닌 기존 활성 상**만 본다 — G007 이 적재하는 g005 행은 V010 대상이 아니다. 기존 활성 문항의 difficulty_score 는 이번에 바꾸지 않는다(V010 결과는 다음 라운드).
- git: `git pull --rebase` 뒤 커밋 · `git fetch` 뒤 push · force 금지 · 충돌이면 양쪽 살림.
- ★ 메모리: 하위 에이전트 **한 번에 2개 이내**(VERIFY 2 · MAIN 1) · 띄우기 전 남는 메모리 1.5GB 미만이면 2분 × 10 대기 · 429 면 모델을 바꾸지 않고 재설정 뒤 이어서. ★ MAIN 이 빌드·봇을 돌리는 중일 수 있다 — 적재 전 백업은 메모리를 확인하고.
■ 토큰: 하위 에이전트는 새 힌트 · 새 사실 확인에만 · 보고서는 바뀐 것과 표만.

■ 먼저 읽기
- docs/16 · ai-out/gen.md(3 · 4-1) · **ai-out/V009.txt 전체**(특히 0 · 2-2 · 3절 · 4절 · 6절) · ai-out/G006.txt 0절 · ai-out/G004.txt(B 단계 — 적재 꼴)
- data/pipeline/audit/v009-results.json(`items`[ref] — verdict · dif · proposal{question · explanation · hint · variants} · rewriteCheck · `rescoreVsGen`) · g005-verify-targets.json · data/pipeline/generated/g005/ · scripts/g004-apply-g003.mjs(반영·적재 본 — g007 판으로) · scripts/pipeline-load.mjs · scripts/hint-check.mjs · hint-input.mjs · measure-pool-exhaust.mjs
- docs/15(G006 판 — §4-1 hint-v5) · pipeline/prompts/hint-v5.md · score-v2.md · deep-v4.md

■ 찬종의 말 · 확정
- (2026-10-13) "퀄리티 있는 문제 수 늘리는게 우선이야." · (2026-10-15) "gen은 데이터 수집 및 생성 담당이야."
- 설계 판단 (V009 CV — 2026-10-16 · 되돌리기 쉽다):
  · **CV-14 → DB 난이도는 V009 blind 값**(items[ref].dif — G004 가 V007 값을 쓴 방침 그대로). 두 채점자 모두 4 일 때만 상으로 치는 엄한 읽기는 쓰지 않는다. 결과 상 174 안팎(drop 뺀).
  · **CV-15 → drop 9 그대로 받는다**(CV-10 선). 경계 4(L3-02 · K3-14 · L3-12 drop / S1-23 · S1-21 ok)도 V009 대로.
  · **CV-16 → 기본값 제안대로**: S1-07 은 KIA·기아 타이거즈 변형을 받는다(같은 구단 · 질문이 이름이 아니라 팀을 묻는다면) · S2-01 "코비" · C1-27 "장어" 는 넣지 않는다(B5 · B7).
  · **CV-17 → 다른 문서(방송사 · 기사 · 공식 사이트)로 닫아 보고, 못 닫으면 hintBasis/knowledgeClaims 에 "지식 근거" 로 표시해 적재**(제외하지 않는다). 나무위키만인 미디어 6 도 같다.

■ 대상 (확인 대상 — V009 보고서 값 · 반영 전에 파일과 다시 맞춘다)
- 493 = ok 299 · fix 184 · drop 10 → 적재 대상 483. 힌트 fix 138 · 힌트 없음인데 dif ≥3 이 된 20(새로 쓴다 — H0) · 변형 fix 28 · rewrite 걸림 4(L2-27 · L2-28 · K3-08 · M1-20=drop) · 제안 없는 fix 3(K4-06 · K4-02 · K4-26 — 새 사실 찾고 없으면 H8 비움) · 문서로 못 닫은 ok 16 + 힌트 9(4-1 · 4-2).
- 활성 4,630 · 상 718 · 힌트 2,447.

■ 기준 (폐기 / 새 기준 / 적용 시점)
- 힌트는 hint-v5 로(fix 138 · 새 20). 제안을 받을 때도 hint-v5 ①~④(덜 유명한 것 · 꼴 빼서 비면 새 사실 · 같은 정답 묶어 · 질문 조건 되풀이 금지)로 다시 읽는다 — ★ V009 3-1 의 제안 가운데도 대표 작품·대표 사건으로 보이는 것이 있다(예: K4-28 초혼 → "장윤정 트로트 초혼" 은 노래가 더 유명하면 떠먹여 주기). 이유를 대고 새로 쓰는 것은 5-2 대로.
- ★ **규칙 보강 (15 문구 변경 허용 — 이번 라운드만)** — V009 6절을 되돌려 준다:
  ① score-v2 → **score-v3**: "질문의 **모든 문장**에서 가장 쉬운 충분 단서를 찾는다 — 앞부분의 정의 문장 · 흔한 일화가 하나라도 있으면 그 단계다" (V009 6절 7 · GEN 채점 62% vs blind 35%). 생성 직후 채점자에게 blind 판정자와 같은 RUBRIC(v009-raw/RUBRIC.md 의 난이도 부분)을 준다.
  ② deep-v4 → **deep-v5**: rewrite 로 질문에서 뺀 쉬운 단서를 **힌트로 옮기지 않는다**(6절 1 ①) · 고친 뒤 정답 유일성을 한 번 더(6절 5) · 2회차는 "1회차 정답의 정의 문장을 이 질문의 단서로 쓰면 범주 단서"(6절 4).
  ③ hint-v5 → 예시만 추가(문구 변경 아님): 6절 1 의 꼴 · 3 의 사실 오류 꼴.
  criteria-sync → `--check` 통과 → 새 프롬프트 · 옛 버전 얼림. 적용: 다음 생성부터(이번 적재분의 힌트는 hint-v5).

■ 할 일 (항목마다 "다 됐다" 의 기준)
A. 반영 — 5-2 규칙(fix 는 읽고 판단 · 안 받은 것은 사유). 제안 새 사실은 한 번 더 웹 확인: V009 가 "unverified" 로 남긴 것 · 3절 ★ 교체 9 · 무작위 30. CV-17 의 25건은 다른 문서로.
   다 됐다 = 받음 · 고쳐 받음 · 안 받음(사유별) 수 · 다시 연 사실 수와 틀림 수 · 지식 근거로 적재하는 수.
B. 같은 정답 · 겹침 — 적재분과 활성(G006 반영 뒤)의 같은 정답 누적 3건 이상 0 · 적재분 힌트 ↔ 같은 정답 활성 문항 질문·해설 4글자·숫자 겹침 기계 검사(읽고 사유) · 적재분끼리 힌트=힌트 같은 문장 0.
C. 적재 — `npm run db:backup`(또는 scripts/backup.mjs) → `scripts/g007-apply-g005.mjs`(멱등 · 파일 단계 검사 먼저 · 게이트 `pipeline-load --round g005` 전량 통과) → 적재. difficulty_score 는 V009 dif · general_hint_version hint-v5(새로 쓴 것)/hint-v4(그대로 받은 것) · source_ref `…#g005-<ref>`.
   다 됐다 = 적재 수 = 보고서 수 · 활성 4,630 + N · 상 718 + M · 힌트 2,447 + K · hint-check-active 막힘 0 · 백업 이름.
D. 풀 실측 — measure-pool-exhaust(50문제 · 전원 처음): 상만 · 중+상 · 전체 · 미디어 상 · 미디어 전체 · korea 상 · 묶음별 상. G004 실측 · V009 추정(상만 17 · 중+상 58 · 전체 102 · 미디어 상 2 · korea 상 1)과 표로.
E. 규칙 보강(위 ①②③) · 13 CV-14~17 끝 표시 · C69(다음: V010 결과 반영 · 미니게임 데이터 G008) · 05 · 06 · 07 DG-030~ · README G 표 · `ai-out/G007.txt`.

■ DB 쓰기: **허용 — G005 적재(questions · question_answers · 힌트 · 분류 연결)만.** 기존 활성 문항은 건드리지 않는다(difficulty · 힌트 · active 전부 — V010 이 읽는 중). 백업 필수.
■ 웹·토큰 예산: WebSearch **60회 이내** · WebFetch 주 수단 · 하위 에이전트 **한 번에 2개 이내**.
■ 하지 말 것: 새 생성 · 기존 활성 수정 · 미니게임 데이터(G008) · 새 Q · server/ client/ shared/ migrations/ · MAIN · VERIFY 몫 문서.
■ 확인할 것 (원칙 7): 활성 4,630 · 상 718(그중 g003 110) · 힌트 2,447 · V009 items 493 · drop 10 · hint-v5 가 지금 판 — 다르면 0절에.
■ 끝 점검: 게이트 N/N · 적재 행 수 = g007-fixes(또는 load 기록) = 보고서 · 같은 정답 3건 이상 0 · hint-check-active 막힘 0 · criteria-sync --check · 기존 활성 행 변경 0(적재 전후 해시).
■ 보고 항목: cmd 창 → 0 찬종이 볼 것(받음/안 받음 · 적재 수 · 풀 실측 표 · korea 상 한 판 되는가 · 미디어 상) → 원칙 메모(7 · 동시 라운드) → 1 반영 → 2 겹침 → 3 적재 → 4 실측 → 5 규칙 보강 → 6 GEN 판단 → 7 새 결정 필요 → 고친 문서.
■ 커밋: 단계마다 · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` · `git pull --rebase` → push. 임시 도구 `scripts/_g005-*` 는 커밋하지 않는다(필요하면 g007-* 로 정식화).
■ 지난 피드백 (G006): 잘한 것 — 제안 6 을 대표작·대표 성분이라 받지 않고 새로 쓴 것 · 미확인 7 을 다른 문서로 닫은 것 · 쌍 겹침 218 → 29 를 다 읽은 것 · 반영 전후 해시로 힌트 밖 칸 변경 0 을 증명. 고칠 것 — 없음. 이번엔 적재가 크다 — 적재 전 파일 단계에서 막는 검사를 G004 처럼.
■ 답변: 한국어 · 터미널 5줄 이내.
