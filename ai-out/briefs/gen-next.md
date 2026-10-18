[GEN G013]  (이 파일이 지시 전체다 — docs/16 2장. ★ 밤샘 사슬 2/4 — G012 를 끝낸 같은 창에서 이어서 한다. 끝나면 `gen-next2.md` 를 읽고 G014)
TASK: **기존 활성 난이도 4·5 의 V015 fix 126 반영**(`audit/v015-active4.json` · CV-39 첫 덩어리 — 상 풀부터) + 15 §3-2 한정어↔변형 한 줄(CV-41) + 활성 힌트 H2-21 · C2-18 다시 보기(C73 ②). **난이도 3·2 는 G014 · G015**
실행 모델: Opus 5.5 (바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (번호 — G012 가 쓴 다음 DG- · C- 부터(07 · 13 을 보고) · Q 는 올리지 않는다). 하위 에이전트 ≤1 · 메모리 1.5GB · 429 면 같은 모델로 이어서. 동시 라운드 · GEN 몫 · git 규칙은 G012 와 같다(VERIFY V017/V018 · MAIN R055). 찬종은 없다 — 묻지 않는다.
■ 토큰: 넉넉하다 — 126 전부 읽고 판단(기계 일괄 아님) · 제안 속 새 사실은 다시 연다.

■ 먼저 읽기
- **ai-out/V015.txt 2절 · 3절(난이도 4·5 부분) · 4절 · 6절** · `audit/v015-active4.json`(items[id] — verdict · categories · reason · proposal · facts[].source · uniqueness — **id 는 V015 시점 활성 505 · g009a/b 로 늘어난 행은 대상 아님**) · 13 CV-39 · CV-41 · C73 ②
- ai-out/G012.txt(방금 쓴 반영 방식) · G011.txt A 절 · `scripts/g009-apply-v011.mjs` · `g008-apply-v010.mjs`(**DB 활성 행** 반영 꼴 — 백업 → rows[].before → 멱등 → 해시 대조) · scripts/hint-check.mjs · docs/15 §3-2 · §3-3 · §4-1 H2 · H9 · H12

■ 찬종의 말 · 확정
- "퀄리티 있는 문제 수 늘리는게 우선이야." · 설계 판단(2026-10-18): **CV-39 → 난이도 4·5 부터** · fix 는 제안을 읽고 반영 · 사실이 갈리면 문서로 닫고 못 닫으면 비활성(`inactive_reason` 에 "V015 <id>") · 힌트 fix 72 는 hint-check 통과 + 같은 정답 활성 쌍과 대조(H12) · 변형 44 는 정규화 중복 · 영문 일반어(B2) · 넓은 말(B7) 거르고 받는다 · **CV-41** → 15 §3-2 한 줄: "정답과 **다른 대상**(육두구↔메이스 · 코냑↔아르마냐크)이면 **질문에 한정어**, **같은 대상의 표기·별칭**(옴부즈맨↔옴부즈만)이면 **변형**" → criteria-sync → deep-v5 SYNC · **C73 ②** H2-21 · C2-18 을 새 H9 줄로 다시 읽어 필요하면 고침.

■ 할 일 (항목마다 "다 됐다" · 단계마다 커밋)
A. `npm run db:backup` → `scripts/g013-apply-v015a.mjs`(난이도 4·5 126: 질문 · 해설 · 힌트 · 변형 · 비활성 — `audit/g013-fixes.json` rows[].before · after · notTaken 사유) · 지식 기반 제안(V014 4절 목록 중 난이도 4·5 인 것)은 문서로 연 뒤 · 대상 밖 해시 같음 · hint-check-active 막힘 0. 다 됐다 = 받음/고쳐 받음/받지 않음 표 · 비활성 수.
B. 15 §3-2 한 줄(CV-41) · criteria-sync --check · H2-21 · C2-18.
C. 실측 — 활성 · 상 수 · measure-pool-exhaust 전/후 한 줄.
D. 문서 — 05 · 06 · 07 DG- · 13(CV-39 "4·5 끝 · 3·2 남음" · CV-41 끝 · C73 ② 끝 · 다음 C 메모) · README G 표 · `ai-out/G013.txt`(0절: 표 · 비활성 목록 · 못 한 것).

■ DB 쓰기: **허용**(백업 뒤 · questions · question_answers). 적재 없음.
■ 웹·토큰 예산: WebSearch **40회 이내** · WebFetch 주 수단 · 하위 에이전트 ≤1.
■ 하지 말 것: 난이도 3·2·1 fix · 미니게임 · 생성 · server/ client/ shared/ · 13 A · README R/V · CV-42 규칙.
■ 확인할 것 (원칙 7): v015-active4.json items 505(fix 126 · ok 379) · 그 id 가 지금도 활성인지(G012 에서 바뀐 것 없음) · 마지막 DG · C 번호 — 다르면 0절에.
■ 보고 항목: cmd 창 → 0 찬종이 볼 것 → 원칙 메모 → A~C → D → GEN 판단 → 새 결정 필요 → 고친 문서.
■ 커밋: 단계마다 · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` · 내 파일만 add · fetch → rebase → push.
■ ★ 이어서: 보고서 · 커밋 · push 뒤 같은 창에서 **`ai-out/briefs/gen-next2.md`** 를 읽고 G014 를 바로 시작한다(파일이 없거나 첫 줄이 "보류" 면 멈춘다).
■ 답변: 한국어 · 터미널 5줄 이내.
