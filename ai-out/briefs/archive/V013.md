[VERIFY V013]  (이 파일이 지시 전체다 — docs/16 2장. V012 를 끝낸 같은 창에서 이어서 한다. 다 읽고 시작한다)
TASK: **G009 생성분 판정**(g009a · g009b — 있는 것부터 · V009 꼴: 전수 판정 · blind 재채점 · 고침 효과 · 2회차 ↔ 1회차 질문·해설·**힌트** 대조 · 힌트 H0~H12). 묶음이 아직 없으면 (나) 기존 활성 난이도 3 표본 300 품질 점검. 반영은 G011
실행 모델: Sonnet 5.5 (같은 창 — 바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (3장 · 4장 · 5-3 · 교훈 A~G · 1장 — 13-PENDING 은 V012 가 쓴 다음 CV- 부터 · README V 표 · 조각 `audit/v013-raw/`).
■ ★★ 동시 라운드 — GEN(G009 → G010 미니게임 2차 · questions 는 G009 A 12행만 — 이미 끝났을 것) · MAIN(R051 → R052 — questions 안 건드림)이 같이 돈다. VERIFY 몫: V013.txt · audit/v013-* · 13 CV 행 · README V 표. git: 내 파일만 · fetch · rebase · force 금지. 판정자 **한 번에 1개**.
■ 토큰: 넉넉하다 — g009a · g009b 전수(각 ~490) · 표본으로 줄이지 않는다.

■ 먼저 읽기
- docs/16 · ai-out/verify.md(0 · 3 · 7-1) · **ai-out/V009.txt 전체**(G005 판정 꼴 — 2절 종류별 · 2-8 2회차 · 6절 · 7절 자기 점검) · ai-out/V010.txt 2절(blind 재채점 방법 · 보정 표본) · ai-out/G009.txt(0 · 3~7절) · 13 C71
- docs/15 전체(G009 판 — §3-3 에 "1회차 힌트도 대조" 한 줄이 새로 있다 · §4-1 H2 "이 탑" 예) · pipeline/prompts/score-v3.md(blind 채점 — 질문·정답만 · GEN 점수 안 보고) · deep-v5 · hint-v5
- data/pipeline/audit/g009a-verify-targets.json · g009b-verify-targets.json(없으면 `git pull` 뒤 다시 — 둘 다 없으면 (나)) · scripts/hint-check.mjs · hint-input.mjs(읽기 전용)

■ 찬종의 말 · 확정
- "퀄리티 있는 문제 수 늘리는게 우선이야." · 설계 판단: 상 = 4(5 는 목표 아님) · blind 재채점 값이 최종 난이도(CV-14 선례) · drop 은 사실 오류 · 정답 비유일 · 범주 단서 2회차 · 마이너 대상에만.

■ 대상 — g009a(게이트 통과분 전부) · g009b(같음 — 묶음이 늦게 오면 a 를 끝내고 push 한 뒤 `git pull` 로 b 를 집는다 · 30분 × 4 까지 기다리고 없으면 보고서에 "b 미판정" 으로 끝낸다).
■ 기준 — V009 와 같다: 질문 3-1 · 3-2(유일성 · 사실은 문서) · 2회차 3-3(1회차 질문·해설·**힌트** 전부와 대조 — V011 S1-13 · L3-17 꼴) · 힌트 H0~H12(hint-v5 · "이 탑" 꼴 한 글자 조각은 사람이 본다) · blind 재채점(score-v3 · 판정자는 GEN 점수 · difWhy 를 보지 않는다 · 보정 표본 12 로 edge 를 잰다 · 두 번째 채점자 100 으로 일치율) · 고침 효과(rewrite 전/후 중 어느 쪽이 더 낫나 · 고친 뒤 사실이 틀어지지 않았나) · 낱말 뜻·정의 꼴 비율 세기.
■ 할 일 — A. 전수 verdict(ok/fix/drop · categories · reason · proposal · 사실 url) B. blind 재채점 전수 + 보정 12 + r2 100 C. 2회차 전부 양방향 D. 힌트 전부 E. 직접 재독(fix · drop 전부 · ok 10%) F. 묶음별 집계(상 유지율 · fix · drop · "들어가면" 상 N판 추정).
   (나) 묶음이 없을 때만: 활성 difficulty_score 3 에서 무작위 300(시드 고정 · 라운드 섞어) — 정답 유일성 · 질문 사실 · 힌트 H12 · 3-1 읽기 좋음 → fix 제안 · `audit/v013-active3.json`.
■ 웹·토큰 예산: WebSearch **100회 이내** · WebFetch 주 수단(판정자도 WebFetch 만 · url 을 JSON 에) · 판정자 ≤1.
■ 산출물: `ai-out/V013.txt`(0~7절) · `audit/v013-results.json`(V009 꼴 — items[ref] · blind · pairs · flipped · counts 묶음별) · `v013-raw/` · 13 CV- · README V 표.
■ 하지 말 것: DB 쓰기 · 문항 고치기(제안만) · 미니게임 판정(V012 가 했다 · 2차는 V014) · 규칙/프롬프트/코드 수정 · Q · 서버 · 다른 세션 몫.
■ 커밋: 위 파일만 · 끝줄 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
■ 확인할 것 (원칙 7): 묶음 수(a · b) · 게이트 통과 수 = 묶음 수 · 활성 5,113(G009 A 는 행 수를 바꾸지 않는다) — 다르면 0절에.
■ ★ 이어서: 끝나면 멈춘다. 터미널 마지막 줄에 "V013 끝 — 다음 브리핑 대기".
■ 답변: 한국어 · 터미널 5줄 이내.
