[GEN G012]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다. ★ 밤샘 사슬 1/4 — 끝나면 같은 창에서 `gen-next.md` 를 읽고 G013 을 바로 시작한다)
TASK: **g009b 485 → V016 판정 반영 → 적재 → 상 풀 실측**(CV-44 (a) · C73 ①) + 15 두 줄(CV-45 2회차 · CV-46 H9 대표 제품·인물) + CV-43 기본값. **기존 활성 fix · 미니게임은 이 라운드에서 하지 않는다**(G013~)
실행 모델: Opus 5.5 (바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (번호 — G011 이 쓴 다음 **DG-044** · **C74** 부터 · Q 는 올리지 않는다). 하위 에이전트 **≤1** · 띄우기 전 남는 메모리 1.5GB(모자라면 2분 × 10 · 그래도 1개는 띄운다) · 429 면 같은 모델로 이어서.
■ ★★ 동시 라운드(밤샘 — 찬종이 자는 동안 세 창) — VERIFY(V017 미니게임 2차 판정 → V018 난이도 1 — audit/v017-* · v018-* · items-2.json 의 verify·status · 13 CV · README V 표) · MAIN(R055 검사만 — server/ client/ docs/design · 13 A · 10 · 06). GEN 몫: questions · question_answers · pipeline · 15 · prompts · `scripts/g012-*` · audit/g012-* · 05 Track D · 06 · 07 DG- · 13 CV-43~46 처리 표시 · C73 ① 끝 · C74 · README G 표. git: 내 파일만 · fetch → rebase → push(충돌은 13 · 06 머리줄 정도 — 상대 줄을 지우지 않는다). 찬종은 없다 — 묻지 말고 13 C 또는 보고서에 적고 간다.
■ 토큰: 넉넉하다 — fix 109 전부 읽고 판단 · 제안 속 새 사실은 다시 연다(16 5-2).

■ 먼저 읽기
- **ai-out/V016.txt 전체**(0절 a·b 비교 · 3절 fix·drop · 4절 경계 · 6절) · `audit/v016-results.json`(items[ref] · blind · pairs · flipped) · 13 **CV-43 · CV-44 · CV-45 · CV-46** · C73 ①
- ai-out/G011.txt(A 절 반영 방식 · 받지 않은 제안 사유 · 새 힌트 28 방식) · `scripts/g011-apply-v014.mjs`(**g009b · v016 으로 넓히거나 복제** — 멱등 · g012Before) · `audit/g009b-verify-targets.json` · pipeline-load.mjs · measure-pool-exhaust.mjs · docs/15 §3-3 · §4-1 H0 · H9

■ 찬종의 말 · 확정
- "퀄리티 있는 문제 수 늘리는게 우선이야." · 설계 판단(2026-10-18 밤): **CV-44 (a)** — fix 109 반영(읽고 판단) · drop 10 제외 · 격리 8 제외 · **난이도 = V016 blind**(4 이상 256) · score-v3-blind 표시. **CV-43 기본값** — blind 4 이상인데 힌트 없으면 fix(새 힌트 · 문서 확인) · 3 은 G011 과 같이 새로 쓰되 못 쓰면 적재에서 뺀다(K1-41 꼴). **CV-45** → 15 §3-3 한 줄 "1회차 정답의 정의 문장(이 세 날 · 태국 국수 꼴)을 2회차 질문에 쓰지 않는다" → criteria-sync → deep-v5 SYNC(버전 그대로 · 예시 추가). **CV-46** → 15 §4-1 H9 예에 "대표 제품 · 대표 전설 인물(ST-506 · 나이 카농 톰)도 정체" 한 줄 → hint-v5 SYNC · V016 이 "애매 ok" 로 남긴 C2-19 · K3-05 · K1-07 은 새 줄로 다시 읽어 필요하면 고침.

■ 할 일 (항목마다 "다 됐다" · 단계마다 커밋)
A. 반영 — `scripts/g012-apply-v016.mjs`(g009b 파일에 fix 109 · drop 10 · blind 난이도 · 새 힌트 · `audit/g012-fixes.json` rows[].before · after · notTaken 사유) · 제안 속 새 사실 · 변형을 하위 에이전트 하나가 문서로 다시 엶(true/partial/false 표) · hint-check 통과 · 2회차 fix 15 는 1회차와 다시 대조 · 게이트 `pipeline-load --round g009b --gate-only` 통과 수 = 적재 대상 수.
B. 적재 — `npm run db:backup` → 적재 → 활성 · 상 · 묶음별 상 · 힌트 수 전/후 표 · 대상 밖 해시 같음 · hint-check-active 막힘 0.
C. 실측 — measure-pool-exhaust(상만 · 중+상 · 전체 · korea 상 · media 상) → "상만 13 → N판".
D. 15 두 줄(CV-45 · CV-46) · criteria-sync --check · C2-19 · K3-05 · K1-07.
E. 문서 — 05 Track D · 06 · 07 DG-044~ · 13(CV-43 · 44 · 45 · 46 끝 · C73 ① 끝 · **C74** = 다음 메모) · README G 표 · `ai-out/G012.txt`(0절: 전/후 표 · 받지 않은 제안 · 못 한 것).

■ DB 쓰기: **허용**(백업 뒤 · questions · question_answers · g009b 적재). 미니게임 표 금지.
■ 웹·토큰 예산: WebSearch **40회 이내** · WebFetch 주 수단 · 하위 에이전트 ≤1.
■ 하지 말 것: 기존 활성 fix(G013~) · 미니게임 · 생성 · server/ client/ shared/ · 13 A · README R/V · CV-42 규칙.
■ 확인할 것 (원칙 7): 활성 5,571 · 상 696(난이도 4 694 + 5 2) · g009b 묶음 485 · v016-results.json 항목 485(ok 366 · fix 109 · drop 10) · 마지막 DG-043 · C73 · CV-46 — 다르면 0절에.
■ 보고 항목: cmd 창 → 0 찬종이 볼 것(전/후 표 · 상 N판) → 원칙 메모 → A~E → GEN 판단 → 새 결정 필요 → 고친 문서.
■ 커밋: 단계마다 · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` · 내 파일만 add · fetch → rebase → push.
■ ★ 이어서: 보고서 · 커밋 · push 뒤 같은 창에서 **`ai-out/briefs/gen-next.md`** 를 읽고 G013 을 바로 시작한다(찬종에게 묻지 않는다 · 파일이 없거나 첫 줄이 "보류" 면 멈춘다).
■ 답변: 한국어 · 터미널 5줄 이내.
