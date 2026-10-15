[VERIFY V009]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다)
TASK: G005 상 생성 2차 493 판정 — 문항(ok/fix/drop) · 난이도 재채점(score-v2 — 상 307 이 얼마나 남는가) · 고친 질문(rewrite 227) 확인 · 사실 · 힌트 464 · 변형. 결과는 G007 이 반영·적재
실행 모델: **Sonnet 5.5** (`claude --model claude-sonnet-5-5` — 기본 모델이 Opus 로 저장돼 있으니 꼭 지정한다)

■ 고정 규칙: docs/16-ROUND-PROTOCOL.md 그대로 (3장 · 4장 · 5-3 VERIFY 규칙과 교훈 A~G · 1장 — 13-PENDING 은 **CV-14** 부터 · README V 표에 V009 · 판정자 조각 data/pipeline/audit/v009-raw/).
■ ★★ 동시 라운드 — GEN G006(V008 제안 243 반영 · hint-v5 · **기존 활성 힌트만 DB 쓰기**)이 같이 돈다. G005 문항은 G006 이 건드리지 않는다.
  VERIFY 몫: ai-out/V009.txt · data/pipeline/audit/v009-* · 13 **CV 행(CV-14~ 추가만)** · README **V 표**. 그 밖의 파일은 건드리지 않는다. `git pull --rebase` 뒤 커밋 · `git fetch` 뒤 push · force 금지 · 충돌이면 양쪽 살림.
  ★ 메모리: 판정자 **한 번에 3개 이내**(GEN 이 2개를 쓴다) · 띄우기 전 남는 메모리 1.5GB 미만이면 2분 × 10 대기 · 429 면 모델을 바꾸지 않고 재설정 뒤 이어서.
  ★ DB 는 읽기만 — G006 이 활성 **힌트**를 바꾸는 중이라 활성 힌트 값은 판정 근거로 쓰지 않는다(질문·정답·변형·해설만 본다 — H12 도 질문·해설 기준이라 영향 없음).
■ 토큰: 조각 125 안팎(493 → 4조각) · 보고서 3절은 fix · drop 만 · ok 는 JSON 에만 · 사유 한 줄.

■ 먼저 읽기
- docs/16 · ai-out/verify.md(0 · 3 · 7-1) · **ai-out/G005.txt 전체** · ai-out/V007.txt(2-0 RUBRIC · 2-3 재채점 · 6절) · ai-out/V008.txt(2-0 · 6절)
- docs/15 전체(G004 판 — §5-1 "가장 쉬운 충분 단서" · §4-1 H0~H12 · §2 B2 · §3-2 · §3-3 · §7-1 MD3 · MD10 · MD11) · pipeline/prompts/score-v2.md · deep-v4.md · media-v3.md · hint-v4.md
- data/pipeline/audit/g005-verify-targets.json(`targets` 493 — 항목 칸은 G005 5절) · g005-flow.json · scripts/hint-check.mjs · scripts/hint-input.mjs(읽기 전용)

■ 찬종의 말 · 확정
- (2026-10-13) "퀄리티 있는 문제 수 늘리는게 우선이야."
- 설계 판단 (V008 CV — 2026-10-15): CV-11 → 나라·도시의 기본 정체(수도권 · 공용어 수 · 대표 소재 기업 · 수도)와 대표 제품·대표 사건 힌트는 **fix**(CV-05 판정 문장 그대로) · CV-12 → 힌트↔힌트 같은 사실은 ok(같은 문장만 fix) · CV-13 → 서로의 정답을 단서로 쓰는 쌍은 MAIN 출제 과제(목록만).

■ 대상 (확인 대상 — G005 보고서 값 · 판정 전에 파일·DB 와 다시 맞춘다)
- 493 (korea 110 · sports 84 · life 89 · media 60 · arts 50 · science 50 · history 50) · GEN 최종 상 307 · rewrite.changed 227 · 그대로 65 · 힌트 464 · hintBasis knowledge 10 · 2회차 (가) 34 · 같은 정답 누적 2건 50 · 격리 4 는 대상 밖.

■ 기준 (폐기 / 새 기준 / 적용 시점) — 새 기준 없음. 15 현재 문구 + 위 CV-11~13.
- ★ 재채점 — **blind**: 판정자 입력에서 `score` · `score1` · `easiestCue` · `targetWhy` · `selfJudge` · `rewrite.removedCue` 를 **빼고** 넘긴다(GEN 채점에 끌려가지 않게). 판정자가 먼저 "가장 쉬운 충분 단서" 를 고르고 그 단계로 매긴다(V007 읽기 · CV-07). 판정 뒤 GEN 값과 비교표.
- ★ rewrite 확인(227): `rewrite.before` 와 나란히 — ① 정답이 아직 하나인가 ② 새로 넣은 단서의 사실(addedCue)이 facts 에 문서로 있는가 ③ 마이너해지지 않았는가(deep-v4 경고 · MD3) ④ 질문이 읽기 어려워지지 않았는가(§3-1). 하나라도 걸리면 fix(되돌리기 제안 가능) 또는 drop.
- 문항: §3-2 정답 유일성 · §3-3 2회차(범주 단서만으로 풀리면 drop — CV-10) · 알 가치 · 미디어 알 가치 2 의 24 는 MD10(여러 해 회자되는 레전드 작품의 팬 세부인가 — CV-08 넓은 선) · 같은 정답 누적 2건 50 은 "지식이 다른가".
- 힌트: H9 판정 문장 "질문을 모르는 보통 한국 성인이 그 힌트만 보고 정답을 바로 말하는가" · H7 꼴만 · H10 반대 꼴 · H12(같은 정답 활성 문항 43 — 질문·해설과 같은 사실) · 세기만으로 fix 하지 않는다(교훈 B). G005 가 "힘이 약한" · "세기가 걸리는" 으로 스스로 적은 힌트(3절)는 직접 읽는다.
- 변형: 한국에서 실제로 치는 표기인가 · B2(질문이 요구하는 표현과 같은 종류) · 빠진 흔한 표기(C1 뱀장어 '장어' 는 B7 판단 포함).
- 교훈 F — 섞은 10건(korea 3 · media 2 · rewrite 3 · 그 밖 2)으로 RUBRIC 을 먼저 고정한다(V007 · V008 RUBRIC 이어받기).

■ 할 일 (항목마다 "다 됐다" 의 기준)
A. 문항 전수 — verdict(ok/fix/drop) · categories · reason 한 줄 · fix 면 proposal(바꿀 칸 전체 문구 · 새 사실은 웹 근거 url).
   다 됐다 = 묶음별 ok/fix/drop · drop 사유별 수.
B. 재채점 전수(blind) — dif · easiestCue · difWhy. 다 됐다 = 묶음별 **최종 상 수와 비율**(GEN 307 과 비교) · 내린 것의 꼴 · rewrite 227 안에서 상 유지 비율 · korea 상 수(45 + 이번 → 한 판 되는가).
C. rewrite 227 — 위 ①~④. 다 됐다 = 걸린 수 · 꼴.
D. 사실 — G005 2절 "출처가 약한 것"(나무위키 6 · 기사 1건 3 · 변형 약한 4) · 지식 힌트 10 · 출처 약한 힌트 9 · 단정어 경고 139 의 해당 facts 는 전부 문서로 연다 + 무작위 60 항목(질문 문장의 숫자·연도·동사를 note 와 글자 대조 포함). 오류율 3% 넘으면 넓힌다.
   ★ (V008 피드백) 사실 확인자 지시문에 처음부터 "항목마다 문서를 연다 · 지식으로 판정한 것은 무효(unverified)" 를 넣는다 — 다시 돌리는 일이 없게.
E. 힌트 464 전수 + 변형 전수(181 문항 · 227 변형).
F. 직접 재독 — fix · drop 전부 + ok 의 10% · 뒤집은 비율 7절(10% 넘으면 ok 전체).

■ 웹·토큰 예산: WebSearch **80회 이내**(변형 표기 확인 포함) · WebFetch 주 수단 · 판정자 **한 번에 3개 이내**.
■ 산출물: `ai-out/V009.txt`(0~7절) · `data/pipeline/audit/v009-results.json`(round · date · model · web · counts · stats · `items`(ref 키 — verdict · categories · reason · proposal · dif · easiestCue · difWhy · rewriteCheck · hint · variants · facts) · `rescoreVsGen` · `flipped` · `true60`) · `v009-raw/` · 13 CV-14~ · README V 표.
■ 하지 말 것: DB 쓰기 · 문항·힌트 고치기(제안만) · 기존 활성 판정(목록 밖은 "참고") · 규칙/프롬프트/코드 수정 · Q 올리기 · 서버 기동·빌드 · 다른 세션 몫 문서.
■ 커밋: 위 파일만 `git add`. 끝줄 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
■ 확인할 것 (원칙 7): targets 493 · 묶음별 수 · rewrite.changed 227 · 힌트 464 · 활성 4,630(G006 은 힌트만 바꿔 수가 그대로여야 한다) — 다르면 0절에.
■ 지난 피드백 (V008): 잘한 것 — 실제 수(433 · 40)를 0절에서 바로잡음 · 지식으로 판정한 확인자 t1 · t2 를 무효로 하고 다시 돌림 · 쌍 제안끼리 겹침 7쌍을 교체 · 조각 크기를 바꾼 이유를 0절에 · C66 꼴을 기계로 64쌍 뽑아 참고로. 고칠 것 — 위 D ★(확인자 지시문에 처음부터).
■ 답변: 한국어 · 터미널 5줄 이내.
