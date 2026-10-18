[GEN G011]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다. 이번 라운드는 짧다 — g009a 하나만 · 끝나면 멈춘다)
TASK: **g009a 464 → V014 판정 반영 → 적재 → 상 풀 실측**(CV-34 (a)) + 15 §4-1 H9 한 줄(CV-37) + CV-38 닫기. **기존 활성 fix 955(V013~V015) · g009b · 미니게임은 이번에 하지 않는다**(다음 라운드)
실행 모델: Opus 5.5 (바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (번호 — G010 이 쓴 다음 **DG-041** · **C73** 부터 · Q 는 올리지 않는다). 하위 에이전트 **0~1**(사실 확인 조각 하나만 · 메모리 1.5GB) · 429 면 같은 모델로 이어서.
■ ★★ 동시 라운드 — VERIFY(V016: g009b 판정 — audit/v016-* · 13 CV-35 · CV-43~ · README V 표)가 같이 돈다. MAIN 은 쉬고 있다(R055 는 G011 뒤). GEN 몫: questions · question_answers · pipeline · 15 · prompts · `scripts/g011-*` · audit/g011-* · 05 Track D · 06 · 07 DG- · 13 CV-34 · CV-37 · CV-38 처리 표시 + C73 · README G 표. git: 내 파일만 · fetch → rebase → push.
■ 토큰: 넉넉하다 — fix 109 는 전부 읽고 판단한다(기계 일괄 적용 아님).

■ 먼저 읽기
- **ai-out/V014.txt 3절·4절·6절**(g009a: ok 351 · fix 109 · drop 4 · blind 분포 · "판정자 지식 기반 제안(문서 미확인)" 목록 · 사실 확인이 갈린 것) · `audit/v014-results.json`(items[ref].verdict · categories · proposal · blind · pairs) · 13 **CV-34 · CV-37 · CV-38**
- ai-out/G009.txt(0절 표 · 6절 게이트 · 7절 묶음 · 8절) · `audit/g009a-verify-targets.json` · `samples/g009-deep.json` · scripts/g009-build.mjs · pipeline-load.mjs(`--round g009a --dry-run` / 적재) · scripts/g008-apply-v010.mjs · g009-apply-v011.mjs(반영 스크립트 꼴 — 멱등 · before 보존) · measure-pool-exhaust.mjs · docs/15 §4-1 H9 · §3-3 · hint-v5

■ 찬종의 말 · 확정
- "퀄리티 있는 문제 수 늘리는게 우선이야." · 설계 판단(2026-10-18): **CV-34 (a)** — fix 109 는 제안을 읽고 반영(VERIFY 제안 속 새 사실은 한 번 더 웹 확인 — 16 5-2) · drop 4 제외 · 격리 36 제외(파일엔 남김) · **난이도 = V014 blind 재채점 값**(CV-14 선례 · 4 이상 191) · `score_version` 에 blind 표시(score-v3-blind 꼴 — V010 반영 때와 같이) · 적재 뒤 활성 ≈ 5,113 + 460 안팎. **CV-37**: 15 §4-1 H9 에 "대표 쓰임 · 대표 일화 · 상징 동상은 정체로 센다(예: 두려움 없는 소녀 · K-Ar 연대 측정)" 한 줄 → criteria-sync → hint-v5 SYNC(버전 그대로 · 예시 추가 — G009 B 꼴). **CV-38**: #4339 · #4365 · #3980 · S3-42 · K3-11 · M1-22 를 문서로 열어 닫는다(#3980 은 한정어로 못 닫으면 비활성).

■ 할 일 (항목마다 "다 됐다" · 단계마다 커밋)
A. 반영 — `scripts/g011-apply-v014.mjs`: g009a 파일(generated/g009a)에 fix 109 적용(질문 · 해설 · 힌트 · 변형 — 힌트는 hint-check 통과 · 2회차 fix 12 는 1회차와 다시 대조) · drop 4 제거 · blind 난이도 덮어쓰기 · `audit/g011-fixes.json`(rows[].before · after · 받지 않은 제안은 사유). 받지 않은 것 · 지식 기반 제안을 문서로 연 결과를 보고서 표로.
B. 적재 — `npm run db:backup` → `pipeline-load --round g009a --gate-only` 통과 수 = 적재 대상 수 → 적재 → 활성 수 · 상 수 · 묶음별 상 · 힌트 수 전/후 표 · 대상 밖 해시 같음.
C. 실측 — `measure-pool-exhaust.mjs`(상만 · 중+상 · 전체 · korea 상 · media 상) 전/후 → "상만 10판 → N판".
D. 15 H9 한 줄(CV-37) + criteria-sync --check · CV-38 6건 닫기(고친 것은 A 스크립트에 함께 · 되돌리기 before).
E. 문서 — 05 Track D(활성 · 상 · 판) · 06 · 07 DG-041~ · 13(CV-34 · CV-37 · CV-38 끝 · C71 "a 적재 · b V016 대기" · **C73** = V016 뒤 할 일 메모) · README G 표 · `ai-out/G011.txt`(0절: 전/후 표 · 받지 않은 제안 · 못 한 것).

■ DB 쓰기: **허용**(백업 뒤 · questions · question_answers · g009a 적재). 미니게임 표 금지.
■ 웹·토큰 예산: WebSearch **40회 이내** · WebFetch 주 수단 · 하위 에이전트 ≤1.
■ 하지 말 것: g009b(V016 판정 전) · 기존 활성 fix 955 반영(G012) · 미니게임 1차 fix 63 · 2차 적재(V017 뒤) · 생성 · server/ client/ shared/ · 13 A · README R/V.
■ 확인할 것 (원칙 7): 활성 5,113 · 상 503(난이도 4) + 2(5) · g009a 묶음 464 · v014-results.json 의 g009a 항목 464(ok 351 · fix 109 · drop 4) · 마지막 DG-040 · C72 — 다르면 0절에.
■ 보고 항목: cmd 창 → 0 찬종이 볼 것(전/후 표 · 상 N판) → 원칙 메모 → A~E → GEN 판단 → 새 결정 필요 → 고친 문서.
■ 커밋: 단계마다 · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` · 내 파일만 add · fetch → rebase → push.
■ ★ 이어서: 끝나면 멈춘다. 터미널 마지막 줄에 "G011 끝 — 다음 브리핑 대기".
■ 답변: 한국어 · 터미널 5줄 이내.
