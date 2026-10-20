[GEN G018]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다. 긴 라운드 — 묶음 둘 · 묶음마다 push · 끝나면 멈춘다)
TASK: **상(난이도 4) 생성 4차 — 700 = 두 묶음(g018a 350 · g018b 350)**(G009 흐름 그대로 — 소재 → 생성 → 기계 검사 → 사실 → 채점 → 3 이하 한 번 고침 → 다시 채점 → 힌트(**hint-v6**) → ★ blind 자기 점검 → 게이트 → VERIFY 묶음 · 묶음마다 push). 앞서 **15 두 줄을 프롬프트로**(§3-1 질문 200자 → QLEN SYNC 안 · §4-1 H9 blind 자기 점검 한 줄 → hint-v6). 생성분은 **적재하지 않는다**(V022 판정 뒤 다음 G). ★ 이 번호(G018)로 앞서 쓴 "V020 반영" 브리핑은 `archive/G018-unrun.md` 로 미뤘다 — 그 일(미니게임 photo 2 · 애매 fix 10 · drop 2 · unverified 7 · 행정 구역 16 · 빈 힌트 16)은 **이번에 하지 않는다**(G019).
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` · 바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (번호 — 다음 **DG-056 · C80** · 07 · 13 을 보고 · Q 는 올리지 않는다). 하위 에이전트 **한 번에 1개**(VERIFY 가 같이 돈다) · 띄우기 전 남는 메모리 1.5GB 미만이면 2분 × 10 대기 · 429 면 같은 모델로 재설정 뒤 이어서 · 임시 폴더 `tmp/g018/`(미추적 도구는 처음부터 여기 — 작업 폴더에 GEN 미추적 파일 0).
■ ★★ 동시 라운드 — VERIFY(V021 — g009a/b "애매" 나머지 약 315 전수 + G017 표본 — **questions 읽기만** · audit/v021-* · 13 CV-64~ · README V 표). MAIN 은 쉰다. GEN 몫: pipeline/prompts(hint-v6 새 파일 · SYNC 구간) · docs/15(두 줄 + 머리글) · scripts/g018-* · data/pipeline/generated/g018a · g018b · audit/g018-* · samples · 05 Track D · 06(맨 위 새 블록) · 07 DG- · 13(C79 ③ 끝 표시 · **C80**) · README G 표. ★ 13 을 쓰기 직전 `git fetch` · rebase — V021 이 같은 파일을 쓴다. git: 내 파일만 add · fetch → rebase → push · force 금지.
■ ★ DB 쓰기: **없음**(이번 라운드는 questions 를 한 행도 쓰지 않는다 — 적재 금지 · 난이도 변경 금지 · 미니게임 표 금지). 읽기는 자유(전역 대조 · 풀 실측).
■ 토큰: 넉넉하다 — 아끼려고 건수를 줄이지 않는다. 하위 에이전트는 생성 · 채점 · 고침 · 힌트 · 사실 확인 · blind 에만 · 보고서는 바뀐 것과 표만(항목 전문은 JSON).

■ 먼저 읽기
- docs/16 · **ai-out/briefs/archive/G009.md**(지난 생성 브리핑 — 흐름 · 표 꼴) · **ai-out/G009.txt 0 · 3 · 4 · 5 · 6 · 7절**(묶음별 건수 흐름 표 · 소재 배분 · 쓰기 전 버림 사유) · ai-out/G011.txt 0절 · G012.txt 0절(blind 뒤 상 유지 — a 191/251 · b 256/296) · ai-out/V016.txt 6절 · V019.txt 2절(blind 맞힘 63% · 정밀도 27%) · V020.txt 3-B(애매 fix 유형 — 변형 누락 · famous-one · h-error)
- docs/15 전체(G017 판 — §3-1 200자 줄(95행 · 아직 SYNC 밖) · §3-2 · §3-3 · §4-1 H0~H12(H8 새 줄 · H9) · §5-1 · §2 B2 · §7-1) · pipeline/prompts/deep-v5.md · media-v3.md · score-v3.md · hint-v5.md · seed-v3.md · seed-r2-v2.md · rewrite-v2.md · question-v4.md · scripts/criteria-sync.mjs(SYNC 구간 이름 · --check)
- scripts/g009-build.mjs · pipeline-load.mjs(`--gate-only` · question-checks 에 길이 검사가 있는지) · hint-check.mjs · hint-check-active.mjs · measure-pool-exhaust.mjs(`--topic`) · `audit/g009a-flow.json` · `g009a-verify-targets.json`(VERIFY 묶음 꼴 — rewrite · score1 · score · 2회차는 1회차 id·힌트 포함)
- (작업 꼴) **tmp/g009/** 의 GEN-INSTRUCTIONS · SCORE-INSTRUCTIONS · REWRITE-INSTRUCTIONS · HINT-INSTRUCTIONS · STATE.md · ctx-lessons.json 을 본으로(복제해 tmp/g018/ 에 — 바뀐 규칙만 덧붙임)

■ 찬종의 말 · 확정
- (2026-10-13) "퀄리티 있는 문제 수 늘리는게 우선이야." · (2026-10-21) 게임 몇 판 해 본 뒤 "**일단 문제 더 만들어보자**" — 상 4차를 지금 연다.
- 설계 판단(2026-10-21):
  · **목표는 상만 25판**(지금 19판 = 상 952). 지난 3차는 생성 1,000 → 게이트 949 → 적재 935 → blind 뒤 상 447(생성의 45%). 같은 비율이면 700 → 상 +315 → 1,267 = **25판**. GEN 채점 상 비율 목표 **55% 이상**(G009 58%).
  · **묶음 배분(350 마다)**: history 70 · media 60 · science 50 · sports 50 · life 50 · korea 50 · arts 20 — 활성 상이 적은 묶음부터(history 111 · science 132 · media 133 · sports 135 · life 144 · korea 148 · arts 149). 소분류는 활성 상이 적은 쪽부터 · b 는 a 가 못 채운 소분류 우선 · 전역 대조는 활성 6,044 + g018a 초안.
  · **§3-1 200자 → QLEN SYNC 안으로**(C79 ③): 15 의 95행 한 줄을 `SYNC:QLEN` 구간 끝에 옮기고 criteria-sync → question-v4 · deep-v5 · media-v3 · rewrite-v2 에 들어간다(버전은 올리지 않는다 — 예시·한 줄 추가). 게이트 question-checks 에 길이 검사가 없으면 "200자 초과 = 막힘" 한 줄을 더한다(QLEN). 생성 뒤 200자 초과 0.
  · **§4-1 H9 blind 자기 점검 한 줄 → hint-v6**(CV-54 (b) · CV-58 (b)): H9 끝에 "★ 자기 점검(G018): 힌트를 쓴 뒤 정답을 모르는 에이전트에게 **힌트만 주고 맞혀 보게 한다**(blind). 맞힘은 수치로 적는다 — 맞힌 것만으로 버리지 않는다(V019: 맞힘 63% · 그중 fix 27%). 맞힌 것 가운데 **판정 문장에 걸리는 것**(정체 · 대표 사건 · 대표작 · 뜻풀이)만 두 번째 줄 사실로 다시 쓴다." 를 더하고, hint-v5 는 얼리고(G017 까지의 기록) **hint-v6** 파일을 만들어 SYNC(머리글 v5 → v6 사유 · 쓰는 순서에 "blind 자기 점검" 한 단계). 새 힌트의 general_hint_version = hint-v6(적재는 다음 G).
  · **blind 단계(묶음마다)**: 힌트 다 쓴 뒤 하위 에이전트 1(정답 · 질문 모름 · 힌트만) → 맞힘 수 · famous-one 으로 다시 쓴 수 · 다시 쓴 뒤 다시 맞혀 본 수 — 수치만(파이프라인 필터 아님). V019 수치(63%)와 비교해 표로.
  · 난이도는 GEN 채점(score-v3)이고 **최종은 V022 blind** — 지난 3차처럼 적재 때 blind 값을 쓴다(CV-34 (a) · CV-44 (a)).
  · 미니게임 · 기존 활성 fix(V020 · V021 제안) · 행정 구역 · 빈 힌트 16 은 **G019**. 이번엔 생성만.

■ 기준 — 새 기준은 위 두 줄뿐. G009 흐름 ①~⑥ 그대로(생성 직후 채점 → 3 이하 한 번 고침 → 다시 채점 · 사실은 문서 · 질문 숫자·연도·동사 글자 대조 · 변형은 검색 확인 · B2 · 2회차는 §3-3 + 1회차 힌트 대조 H12 양방향 · 낱말 뜻·정의 꼴 묶음마다 10% 이하 · 취미 세부는 "관심층은 아는" 세부 · 마이너 대상으로 어렵게 만들지 않는다). 프롬프트는 deep-v5 · media-v3 · score-v3 · **hint-v6** · seed-v3 · rewrite-v2.
- ★ 이번에 더 조심할 것(V014 · V016 · V020 반복 오류): ① 변형 누락 — 일상 표기 · 한글 음차 · 띄어쓰기(V020 ① 유형 5 — "야구 장갑/글로브" 꼴은 사전·기사로 쓰임 확인) ② 힌트 famous-one(V016 힌트 fix 81 중 54 — H9 판정 문장을 힌트마다 적용 · blind 자기 점검) ③ 2회차 범주 단서(V016 drop 10 중 9 — §3-3 을 2회차마다 다시 읽는다) ④ 질문 200자 · 한정어는 묻는 문장 안(§3-2 판정 문장) ⑤ 단정 — 문서에 없는 "유일 · 최초 · 가장" 은 쓰지 않는다(V020 unverified 유형).
- 같은 정답이 활성에 2건 이상이면 쓰지 않는다 · 같은 정답 누적 3건 이상 0(a+b+활성). 자기 검토는 판정이 아니다.

■ 할 일 (항목마다 "다 됐다" 의 기준 · A → E · 단계마다 커밋)
A. **15 두 줄 · 프롬프트** — §3-1 200자 줄을 QLEN SYNC 안으로 · §4-1 H9 자기 점검 한 줄 · hint-v6 새 파일(v5 얼림) · `criteria-sync` → `--check` 통과 · 게이트 길이 검사(없으면 추가 · `--gate-only` 로 기존 g009a 를 돌려 통과 수가 그대로인지) · DG-056 · 15 머리글 G018. 다 됐다 = `--check` 다름 0 · hint-v6 SYNC 구간 = 15 §4-1 · deep-v5 QLEN 구간에 200자 줄.
B. **g018a 350 끝까지**(소재 → 생성 → 기계 검사 → 사실 → 채점 → 고침 한 번 → 다시 채점 → 힌트 hint-v6 → checkHint · hint-check 경고 읽기 → blind 자기 점검 → 게이트 `data/pipeline/generated/g018a/` → `pipeline-load --round g018a --gate-only` 전량 통과 → `audit/g018a-verify-targets.json` · `g018a-flow.json` · `g018a-blind.json` → **커밋 · push**). 다 됐다 = 묶음 표(G009 0절 꼴: 생성 · 쓰기 전 버림 · 기계 탈락 · 격리 · 남음 · 1차 상 · 고침 · 고친 뒤 상 · 최종 상 · 상 비율 · 낱말 뜻 꼴 · 2회차 · 취미 세부 · 200자 초과 0 · blind 맞힘/다시 씀).
C. **g018b 350 같은 흐름**(a 가 못 채운 소분류 우선 · 전역 대조에 a 초안 포함) → push. 다 됐다 = B 와 같은 표 + a+b 합 · 같은 정답 누적 3 이상 0.
D. **실측 · 추정** — `measure-pool-exhaust`(지금 풀 — 상만 · 중+상 · 전체 · `--topic` 7묶음) + "들어가면" 표(GEN 채점 그대로 / blind 45% 가정 — 상만 판 · 묶음별 상만 판). 다 됐다 = 표 둘.
E. **VERIFY 묶음 · 문서** — verify-targets 둘(G009 꼴 + rewrite · score1 · score · blind · 2회차 1회차 id·힌트) · samples/g018-deep.json(묶음별 5) · 05 Track D · 06 · 07 DG-056 · 13(C79 ③ 끝 · **C80** = V022 대기 — 표본 · 먼저 볼 것 · blind 수치) · README G 표 · `ai-out/G018.txt`.

■ 웹·토큰 예산: WebSearch **250회 이내** · WebFetch · 위키백과 API · 한국민족문화대백과가 주 수단 · 하위 에이전트 **한 번에 1개** · 생성 700 이내.
■ 하지 말 것: 적재 · DB 쓰기 전부 · 기존 활성 수정 · 15 규칙 문구 변경(A 의 두 줄만) · 프롬프트 버전 올리기(hint-v6 만 새로) · 새 Q · 마이너 대상으로 어렵게 · 두 번 이상 고치기 · server/ client/ shared/ migrations/ · data/minigame · assets/minigame · VERIFY·MAIN 몫 문서 · `archive/G018-unrun.md` 의 일.
■ 확인할 것 (원칙 7): 활성 **6,044**(1: 755 · 2: 1,486 · 3: 2,851 · 4: 949 · 5: 3) · 상 952 · 묶음별 상(history 111 · science 132 · media 133 · sports 135 · life 144 · korea 148 · arts 149 — category_game_topics 기준) · 풀 실측(상만 19 · 중+상 76 · 전체 120) · 질문 200자 초과 0 · 중 힌트 빈 칸 16 · 프롬프트 지금 판 deep-v5 · media-v3 · score-v3 · hint-v5 · seed-v3 · rewrite-v2 · question-v4 · 마지막 DG-055 · C79 — 다르면 0절에.
■ 끝 점검: 게이트 N/N(a · b) · 활성 6,044 그대로(DB 쓰기 0 — questions · question_answers md5 전후 같음) · 결과 파일 개수 = 보고서 건수 · `criteria-sync --check` 통과 · `git status` 미추적 GEN 파일 0 · tmp/g018/STATE.md 에 단계 기록(창이 끊겨도 이어서).
■ 보고 항목: cmd 창 → 0 찬종이 볼 것(묶음별 건수 흐름 표 · 상 비율 · blind 맞힘·다시 씀 · "들어가면" 상 N판 · 묶음별) → 원칙 메모(7 · 동시 라운드 · DB 쓰기 0) → 1 A → 2 소재 → 3 생성·검사·사실 → 4 채점·고침·힌트·blind → 5 게이트 → 6 VERIFY 묶음·측정 → 7 GEN 판단 → 8 새 결정 필요 → 고친 문서.
■ 커밋: 단계마다(A · a · b · 문서) · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` · 내 파일만 add · fetch → rebase → push.
■ 지난 피드백 (G009 · G017): 잘한 것 — 묶음마다 push 해 VERIFY 가 먼저 집은 것 · 쓰기 전 버림 사유를 센 것 · 대상 밖 해시로 "바꾸지 않았다" 를 증명한 것 · 비우기 전 문서에서 한 번 더 찾은 것(비움 0). 고칠 것 — 메모리 부족으로 멈췄을 때 찬종 "이어서" 를 기다렸다 → 이번엔 STATE.md 로 단계를 적고 대기(2분 × 10) 뒤 스스로 이어서.
■ ★ 이어서: 끝나면 멈춘다(gen-next.md 없음). 터미널 마지막 줄에 "G018 끝 — 다음 브리핑 대기". a 만 끝난 채 창이 끊기면 다음 창에서 이 파일을 다시 읽고 STATE.md 부터 이어서.
■ 답변: 한국어 · 터미널 5줄 이내.
