[GEN G022 — 난이도 v2 재판정 2라운드(GEN 몫 2,853 — VERIFY V028 이 나머지 2,870 을 같은 지시서로 동시에 판정) + 같이 보는 검수 아홉 · ★ 이번은 판정만(DB 쓰기 없음 · 생성 없음 · 적용은 G023)]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다. 끝나면 멈춘다)
TASK: 전수 재판정을 반으로 나눠 빨리 끝내기 위해 GEN 이 **판정자 역할**을 맡는다. **2라운드 지시서 `data/pipeline/audit/v028-raw/INSTRUCTIONS.md`(설계가 썼다 — 고치지 않는다)** 로 `audit/v028-split.json` 의 **`gen` 배열 2,853**(겹침 200 포함 — VERIFY 와 대조용)을 판정한다. 결과 스키마 · 조각 꼴 · 검사 스크립트 · 둘째 검토자 · 친숙도 판정자 모두 **V027 이 만든 것을 그대로 재사용**한다(`audit/v027-raw/_work/` · `audit/v027-rerate.json`). ★ **판정자 · 검토자 · 친숙도 하위 에이전트는 모두 `model: sonnet`** 으로 띄운다 — VERIFY 와 같은 눈이어야 두 반이 이어진다(Opus 로 매기면 겹침 대조가 모델 차이가 된다).
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` · 바꾸지 않는다 · 하위 판정자만 sonnet)

■ 고정 규칙: docs/16 그대로 (07 **DG-060** 부터 · 05 · 06 · README G 표 · G022.txt). **DB 쓰기 없음 · 문항 생성 없음**(찬종 2026-10-25 생성 중단 유지). ★ **13-PENDING-CHECKS 는 이번에 고치지 않는다**(VERIFY V028 이 같은 시간에 13 을 쓴다 — 충돌 방지 · 결정 필요 항목은 G022.txt 7절 "CV 후보" 에 적고 설계가 옮긴다). 하위 에이전트 ≤1 · 남는 메모리 1.5GB.
■ ★★ 동시 라운드 — **VERIFY V028**(`verify` 2,870 · 산출 `audit/v028-rerate.json` · 13 · README 는 VERIFY 몫). GEN 몫: `audit/g022-rerate.json` · `audit/g022-raw/`(INSTRUCTIONS 는 복사하지 말고 v028-raw 의 것을 경로로 준다 · 자기 보정 메모가 생기면 `audit/v028-raw/INSTRUCTIONS.gen-memo.md`) · scripts/g022-targets.mjs(읽기 전용) · docs 05 · 06 · 07 · README · G022.txt. 05 · 06 · 07 · README 는 쓰기 직전 fetch · rebase · 내 파일만 add · force 금지. MAIN R068 은 둘 중 하나가 끝난 뒤 찬종이 연다.
■ 토큰: 넉넉하다 — 2,853 전수 · 표시 아홉 · 줄이지 않는다. 조각 40 + 눈금자 10 = 50 건씩 약 72 조각.

■ 먼저 읽기
- **`audit/v028-raw/INSTRUCTIONS.md` 전체** · docs/19 전체(§4 눈금자 **62**) · `ai-out/briefs/difficulty-draft.md` 8절(금 표본 62 전문) · 15 §3-1 · §3-2 · §5-4 · §4-1 H9 · docs/16
- **ai-out/V027.txt 전체**(0-3 자가 시험 꼴 · 0-4 운영(조각 · chkp · 재실행 기준) · 5-2 둘째 검토자 · 6 집계 꼴 · 10 한계) · `audit/v027-raw/_work/`(chkp.mjs · chkself.mjs · agg.mjs · anchors52.json(62 건) · r1.prompt.txt 둘째 검토자 · f01.prompt.txt 친숙도 · 조각 입력 꼴 · 판정자 호출 꼴) · `audit/v027-rerate.json`(결과 스키마 그대로) · scripts/v027-targets.mjs(조회 SQL 꼴)
- `audit/v028-split.json`: gen 2,853(지금 1:293 · 2:605 · 3:1,413 · 4:541 · 5:1) · overlap 200 · familiarityNeeded.gen 898(지금 ≤2 만 친숙도 둘째 판정 — 상은 V022 · 중은 V023 · g019 689 는 V025/V026 결과에 이미 있다 → `v025-results.json` · `v026-results.json` 의 친숙도 값을 `familiarity.source` 로 옮긴다)

■ 할 일 (V028 과 같은 절차)
A. **자가 시험**: 금 표본 62 중 지시서 예 20 을 뺀 **42 를 정답 없이**(sonnet 판정자) → 일치 ≥ 34/42 · ±1 ≥ 41. 못 미치면 지시서는 그대로 두고 `INSTRUCTIONS.gen-memo.md`(≤ 5줄)를 덧붙여 다시(최대 3번 · 0절에 회차·일치·메모 전문).
B. **전수 판정 2,853**(조각 40 + 눈금자 10 · 어긋남 > 2 재실행 · chkp): 지시서 "결과 꼴" 그대로(tags 에 R2 · R3 · 쉬운3 · 이름은앎 포함). ① 친숙도 둘째 판정자(정답만 · 보정 10)는 **지금 ≤2 인 898 만**.
C. **둘째 검토자**(읽기 ⓑⓒ 제안 전수 · r1.prompt.txt + 지시서 ㄱ·ㄴ 보강) → `flags.read.review{verdict ok/fix/reject · fixText · leak · factChange · easier}` · 기계 검사(정답·변형 글자 새로 등장 · 240자 · 끝 문장 · 새 숫자) 전수.
D. **겹침 200 대조**(끝 단계 · `audit/v028-rerate.json` 이 있으면 — 없으면 한 줄).
E. **직접 재독**(GEN 본체가 읽는다): 5 전부 · R2 올림 30 · R3 내림 전부 · conf low 전부 · 읽기 ⓒ 전부 + ⓑ 30 · 사실 의심 전부(웹으로 닫을 수 있으면 — WebFetch ≤ 80 · WebSearch ≤ 20 · 네이버 API 는 쓰지 않는다) · 겹침 ±2 전부.
F. **집계**(V028 과 같은 표 — 설계가 둘을 합친다): 분포 · 이동 표 · 태그 · 친숙도 1 후보(898 중) · H9 · 비유일 · 사실 · 변형(문항 · 항목 · 입력 꼴) · 읽기 ⓐⓑⓒ 등급별 + glossed + 검토자 ok/fix/reject · 시간 의존 · 분야 · 민감 · 기계(힌트 없는 v2 3+ **— G023 뒤 GEN 이 써야 할 힌트 수** · 같은 정답 쌍 · 200자 초과).
■ 산출물: `ai-out/G022.txt`(0~7절 — 0절 자가 시험 · 겹침 대조 · 분포 · 읽기 표 · 7절 CV 후보) · `audit/g022-rerate.json`(items[id]: V027 스키마 + `familiarity.source` + `half:"gen"` + `overlap`) · `audit/g022-raw/` · scripts/g022-targets.mjs · 07 DG-060~ · 05 · 06 · README G 표.
■ 하지 말 것: DB 쓰기 · 문항 생성 · 문항 고치기(표시·제안만) · **INSTRUCTIONS.md 수정** · 13 · 15 · 19 수정 · pipeline/scripts 규칙 수정 · 미니게임 데이터 · client/server/shared · VERIFY 의 v028-* 파일 · 네이버 API · force push.
■ 커밋: 위 파일만 · 단계(A · B 중간(조각 20 마다) · C · 끝)마다 · fetch → rebase → push · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
■ 확인할 것 (원칙 7): 활성 6,507(시작·끝 같아야 한다) · split gen 2,853 · overlap 200 · 금 표본 62 · 지시서에 "2라운드 보정 규칙" · "사람 결과와 맞은 예 20" · "읽기 보강" 절 · V027 결과 스키마 · Agent 도구가 `model: sonnet` 을 받는다 — 다르면 0절에.
■ ★ 이어서: 끝나면 멈춘다. 터미널 마지막 줄 "G022 끝 — 다음 브리핑 대기".
■ 답변: 한국어 · 터미널 5줄 이내.
