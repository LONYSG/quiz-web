[VERIFY V025]  (이 파일이 지시 전체다 — docs/16 2장. 다 읽고 시작한다. 끝나면 멈춘다)
TASK: **g019a 346 전수 판정**(상 생성 4차 a 묶음 — `audit/g019a-verify-targets.json` · 적재 전) — V014 · V016 이 g009a/b 를 판정한 꼴 그대로(조각 · 보정 표본 · blind 재채점 전수 · 독립 채점자 100 · 2회차 양방향 · 힌트 H0~H12 · 고침 효과) + ★ 이번 새 몫 셋: **정답 친숙도 둘째 판정자 교차**(15 §5-4 · CV-69 (a)) · **blind 2회차 결과 검증**(GEN 이 판정 문장 15 를 다시 썼다 — H1-35 글자 무리 꼴 포함) · **층(layer) 대중/팬 세부 60** 이 맞게 매겨졌는지. 반영·적재는 GEN(G020/G021).
실행 모델: Sonnet 5.5 (`claude --model claude-sonnet-5-5` — 바꾸지 않는다)

■ 고정 규칙: docs/16 그대로 (13-PENDING-CHECKS 는 V024 가 쓴 다음 **CV-78** 부터 · README V 표 · 조각 `audit/v025-raw/`). 판정자 한 번에 1개 · 남는 메모리 1.5GB(모자라면 2분 × 10 · 그래도 1개는 띄운다). 찬종에게 묻지 않는다(결정은 CV 로).
■ ★★ 동시 라운드 — **GEN G019(g019b 생성 — tmp/g019 · generated · audit/g019-* 를 쓴다 · g019a 파일은 끝나 있다(19c6787))** 와 **MAIN R066(client/server/shared · docs · ui-check)** 이 같은 PC 에서 돈다. VERIFY 몫: V025.txt · audit/v025-* · 13 CV-78~ · README V 표 — **g019a-verify-targets.json 은 읽기만**(verdict 는 `audit/v025-results.json` 에). 05 · 06 · 13 · README 는 같이 쓴다 → 쓰기 직전 `git fetch` · `git rebase origin/main` · 내 파일만 add · force 금지. 하위 에이전트 ≤1(셋 동시 — 메모리 1.5GB 규칙 엄수).
■ 토큰: 넉넉하다 — 346 전수 · 독립 채점자 100 · 친숙도 교차 346 · 줄이지 않는다.

■ 먼저 읽기
- docs/16 · **ai-out/V016.txt 전체**(g009b 판정 꼴 — 0절 a/b 비교 표 · 판정자 품질 관리 · 7절) · `audit/v014-raw/g009a/RUBRIC.md` + 판정자 지시(**그대로 재사용** — "항목마다 질문 핵심 사실을 문서로 연다 · Write 로 직접 쓴다") · ai-out/V022.txt 0·6절(친숙도 판정 방법 · 보정 예) · V023.txt(둘째 판정자 교차 꼴)
- **docs/15 전체 — 특히 §3-1(200자 · QLEN) · §4-1 H9 blind 자기 점검 · ★ §5-4 정답 친숙도(G019 신설) · §5-5 예시** · score-v3 · hint-v6 · 13 **CV-68 · CV-69 · CV-71**(친숙도 처리 — 경계 · 2 로 보임)
- `audit/g019a-verify-targets.json`(346 — 칸: first(2회차의 1회차) · layer · work · hobby · defForm · familiarity{judge · pct · why · genPct} · blind{hint · guess · hit} · rewrite{before · after} · score1 · score · sources · facts · hintBasis · selfJudge · check[] · criteria) · `audit/g019a-blind.json`(first · redo · second) · `audit/g019a-flow.json`(묶음별 흐름 표) · **tmp/g019/STATE.md 의 a 줄**(G019.txt 는 아직 없다 — GEN 이 b 를 끝내야 쓴다 · 1·2차 blind · 판정 문장 걸림 15 · "H1-35 글자 무리 꼴은 V024 볼 것" = 이번 V025 가 본다)
- ai-out/G017.txt 8절(GEN 판단 꼴) · V021.txt 0절(G017 표본 결과 — fix 율 · blind 기준)

■ 찬종의 말 · 확정(V014 · V016 과 같다 + 새 것): "퀄리티 있는 문제 수 늘리는게 우선이야." · "들어본 적조차 없는 문제" 는 안 된다(→ 15 §5-4 · 친숙도 1 은 격리) · 상 = 4 · **blind 재채점 값이 최종 난이도** · drop 은 사실 오류 · 정답 비유일 · 2회차 범주 단서 · 친숙도 1 확정(둘 다 1) · famous-one 힌트는 fix.
■ ★ 설계 판단(이번 새 기준 — CV 로 확정)
 ① **친숙도 교차**: GEN 의 판정자는 1 을 버리고 2(47 — A1-02 A1-08 A1-12 A1-13 C1-04 C1-05 C1-06 C1-09 C1-25 C2-02 C2-03 C2-10 C2-11 C2-14 C2-21 C2-22 H1-07 H1-08 H1-10 H1-18 H1-22 H1-29 H1-40 H2-04 H2-07 H2-10 H2-11 H2-18 K1-11 K1-23 L1-10 L1-21 L1-22 L1-25 L2-03 L2-24 L2-25 M2-07 M2-19 M2-20 M2-26 S1-01 S1-02 S2-14 S2-21 S2-23 S2-25)·3(299)만 남겼다. VERIFY 가 **정답만 보는 둘째 판정자**(V022 꼴 · 보정 예 그대로 · GEN 값 안 보여 줌)로 346 전부 다시 매긴다 → 둘 다 1 이면 **drop(친숙도)** · 하나만 1 이면 경계(CV 에 목록 · 기본 유지) · 2 가 많은 묶음(C2 · H1 · S2)을 0절에. V022 처럼 판정자가 1 을 69% 만 맞혔으니 보정 예 결과를 먼저 적는다.
 ② **blind**: GEN 1차 blind 252/320 맞힘(79%) → 판정 문장 걸림 15 를 다시 씀 → 2차 13/15. VERIFY 는 **힌트만 보고 맞혀 보기 전수 346**(V016 꼴 · 정답 안 보여 줌) + 맞힌 것의 "어떻게 맞혔나" 를 셋으로(ⓐ 정체 그대로(H9 판정 문장 — fix) ⓑ 두 번째 줄 사실에서 추론(ok) ⓒ 지식으로 바로(힌트가 사실상 정답 — fix 후보)). ★ **H1-35**(힌트 "레이테섬 상륙과 오키나와 상륙은 첫날을 저마다 다른 영문자 하나를 붙여 불렀다" — 영문자+Day 이름 무리) 꼴 = "정답이 속한 이름 무리를 힌트가 그대로 드러내는가" 를 CV 로 정한다(같은 꼴이 더 있는지 346 에서 센다).
 ③ **층(layer)**: 대중 17 · 팬 세부 43(media · sports) — 15 MD11 "국민 밈은 층" 규칙대로 매겨졌는지(팬 세부인데 대중이 아는 것 · 거꾸로) · 층 없음 286 중 media·sports 에 층이 있어야 할 것이 있는지. hobby 67 · defForm 7 · work 칸은 표만.
 ④ 2회차 44(pairedWith → first 칸에 1회차 질문·해설·힌트): 양방향 — 1회차 정답의 정의 문장 재사용(15 §3-3) · 1회차 힌트와 겹침 · 2회차가 1회차보다 쉬운지.
 ⑤ 고침 효과: rewrite.changed 241 — before/after 를 전수(고친 뒤 사실이 틀어진 것 · 200자 넘은 것(지금 최대 166 — 0) · 질문 첫 문장이 가장 쉬운 단서를 미리 주는 것).

■ 할 일
A. 전수 verdict 346(ok/fix/drop · categories · reason · proposal 전문 · url — 항목마다 핵심 사실 문서 하나 이상 열기 · facts[] 의 url 을 먼저 다시 연다).
B. blind 재채점 전수 + 독립 채점자 100(시드 고정 · GEN 점수·판정자 점수 안 보여 줌) → 일치율 · "들어가면 상 N" · ②.
C. 친숙도 둘째 판정자 346 → 교차 표(①) · 보정 예 결과.
D. 2회차 44 양방향(④) · 층 60(③) · 힌트 전수(hint-check 기계 + H2 · H9 famous-one · H12 · H1-35 꼴).
E. 고침 효과(⑤) · 직접 재독(drop 전부 · fix 전부 · ok "애매" 20 · 친숙도 교차 불일치 전부).
F. 집계 — 주제별 n/ok/fix/drop · GEN 4 이상 → 판정자 4 이상 · 친숙도 1 확정/경계 · blind 맞힘 ⓐⓑⓒ · a(g009a · g009b · G017 표본)와 비교.
■ 웹·토큰 예산: WebSearch **60회 이내** · WebFetch 주 수단(판정자도 WebFetch 만 · url 을 JSON 에) · 판정자 ≤1 · 조각 ≤20 · 429 면 멈췄다가 같은 모델로 이어서.
■ 산출물: `ai-out/V025.txt`(0~7절 — 0절 a 비교 표 · 친숙도 교차 표 · blind ⓐⓑⓒ 표) · `audit/v025-results.json`(V016 꼴 — items[ref] · blind · familiarity2 · pairs · layer · counts) · `v025-raw/` · 13 CV-78~ · README V 표.
■ 하지 말 것: DB 쓰기 · 문항 고치기(제안만) · targets 파일 수정 · 규칙/프롬프트/코드 수정 · Q · 서버 · 빌드 · 미니게임 데이터 · GEN 의 tmp/g019 · generated · MAIN 의 client/server/docs 코드 건드리기.
■ 커밋: 위 파일만 · 단계(B · C · D)마다 커밋 · fetch → rebase → push · 끝줄 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
■ 확인할 것 (원칙 7): 346(topics arts 20 · science 49 · history 70 · korea 48 · life 50 · media 60 · sports 49) · 2회차 44 · defForm 7 · 층 대중 17 · 팬 세부 43 · hobby 67 · 친숙도 2 47 · 3 299(1 없음) · blind 320 중 252 · rewrite 241 · score dif 2:26 · 3:187 · 4:133 · 활성 6,044(시작·끝 — GEN 은 이번에 적재 안 함) · v014-raw/g009a/RUBRIC.md 존재 — 다르면 0절에.
■ ★ 이어서: 끝나면 멈춘다. 터미널 마지막 줄 "V025 끝 — 다음 브리핑 대기".
■ 답변: 한국어 · 터미널 5줄 이내.
