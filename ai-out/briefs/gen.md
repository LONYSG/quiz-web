[GEN G035 — ★ V037 반영 라운드(DB 쓰기 · 활성 문항): 알가치 3 질문 재정비 1묶음 **fix 358 적용**(fix_text 를 GEN 이 한 줄씩 재독 → 15 §3-1 새 길이 규칙 → 적용) · **358 전부 hint-check 다시** + 질문과 어긋난 힌트 다시 씀(hint_refit 9 + 기계 걸림 + 종류 단서 새로 생긴 곳) → blind · 변형 누락 39 · 사실 의심 36 웹 재확인 · 비유일 17 · **알가치 · 등급 변경 없음** · DG-073 · C96 · 4~6시간]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: V037(2026-11-08 · `ai-out/V037.txt` · `audit/v037-refurb.json` 1,047 — fix 358 · keep 689)은 판정·제안만 했다. 설계가 CV-157 권고 **(a) "358 전부 적용"** 을 채택 · CV-158 은 **(b)**(알가치는 그대로 · 재판정 없음 — 찬종 2026-11-08 · w1 8 만 보고서 표로 찬종). D-328 ④ "힌트는 질문이 바뀐 문항만 다시 씀". 도구는 G033 lib(`scripts/g033-apply-lib.mjs` — 결정 json · 활성 행 · 한 트랜잭션 · undo · G034 가 `g034-apply-active.mjs` 로 쓴 꼴).
실행 모델: Opus 5.5 (`claude --model claude-opus-5-5` — 바꾸지 않는다)

■ 고정 규칙: docs/16 5-3 그대로. 07 **DG-073** · 13 **C96** + **CV-157 · CV-158 줄 끝**(반영 결과 — CV-158 은 "G035 알가치 안 바꿈 · 재판정 없음(찬종) · w1 8 찬종") · 15 **§3-1 끝 메모 한 줄**(설계 2026-11-08 메모 둘 아래 — G035 실측 한 줄 · **SYNC 구간은 손대지 않는다**) · 05 Track D 머리 · 06 자기 절 · README **G 표** · `ai-out/G035.txt`.
■ ★★ 동시 라운드 — **MAIN R079**(코드 · 마이그레이션 0030 파일 · questions 안 건드림) · **VERIFY V038**(읽기 · 대상 = V037 밖 알가치 3 등급 1·2 + crossans 표본 — V037 대상 1,047 은 다시 안 본다 · 찬종 2026-11-08). 겹침 없음. V038 ⓒ 는 G035 가 바꾼 358 힌트를 뺀다. 문서 분담: 위 줄 · 05/06 자기 절만 · 쓰기 직전 fetch → rebase --autostash · `tmp/` 는 add 안 함 · `audit/g035-raw/` 는 커밋(G034 꼴) · force 금지.
■ 하위 에이전트(sonnet · 동시 2 이하): blind(힌트만 보고 맞히기 — 다시 쓴 힌트 전부) 1~2 · 웹 재확인 1(WebFetch 위키 ko → en 원문 · User-Agent `quiz-web-g035/1.0` · 개인 정보 금지 · 429 는 4초). ★ 질문 fix_text 재독 358 은 **GEN 본인**(조각 안 씀 — 판정의 판정이라 눈이 하나여야 한다).
■ 토큰: 넉넉하다 — 358 전부 · 줄이지 않는다. 예상 4~6시간(G034 484 ≈ 4시간 · 이번은 재독 + 힌트 다시 쓰기가 더 든다).

■ 먼저 읽기: `ai-out/V037.txt` 전부(특히 0절 ①~⑦ · 6 flags · hint_refit) · `audit/v037-refurb.json`(키: id · grade · worth · fix_text · fix_len · fix_sentences · hint_refit · hint_why · flags · reread · reread_note · verdict · worth_v) · 13 CV-157~160 · 15 §3-1(**끝 메모 둘** — 70/90/240 · 2~4문장 · 첫 문장 종류 단서 · 해설 정보 안 끌어옴 · 기계 문장수 오탐) · §4-1(hint-v7 · H2 · H3 · H12) · 19 §8-2 · §8-5 · `scripts/g033-apply-lib.mjs`(결정 json 꼴 · before 일치 조건) · `g034-apply-active.mjs` · `hint-check.mjs` · `hint-check-active.mjs` · `hint-crossans.mjs` · `pipeline/lib/answer-rules.mjs` · `question-checks.mjs` · `ai-out/G034.txt` 3 · 5절(lib 쓰임 · "제안과 다르게 한 것" 꼴) · `audit/g034-raw/_work/`(blind 지시서 꼴).

■ 설계 결정
⑴ **질문**: fix_text 를 그대로 믿지 않는다 — GEN 이 358 전부 한 줄씩 읽고 (a) **원문에 없던 사실 · 종류 단서가 들어갔으면 뺀다**(V037 ⑦(e) — 6111 '중국에서 발굴' 꼴 · 6255 · 5319 · 5837 · 6068 · 해설에서 끌어온 정보 금지 15 §3-1) (b) 문장 하나 70자 · 전체 240 · 2~4문장(인용문 · 이니셜 마침표 오탐은 눈으로 — 5432 · 5683 · 6599) (c) 한정어 · 정답 유일성 그대로(checkAnswerSet · 비유일 flags 17 은 여기서 같이) (d) 표기 지정 문장(DG-072)은 그대로 (e) 첫 문장에 종류 단서가 없으면 **원문에 있는 정보로** 넣는다(없으면 그대로). 고친 fix_text 는 결정 json 에 before(원문) / after + why. 안 받은 fix 는 notTaken(사유).
⑵ **힌트**: 358 전부 새 질문으로 `checkHint`(H3 질문 문구 되풀이 · H2 조각 · blank · 120자) + crossans → 막힘 · 경고 + hint_refit 9(2064 · 6255 · 5319 · 5375 · 6419 · 6068 · 4558 · 6271 · 5837) + "질문에 종류 단서가 새로 생겨 힌트와 겹치는 곳" 은 **힌트 다시 씀**(hint-v7 · 15 §4-1 그대로 · 해설은 바꾸지 않음) → blind(힌트만) ≥ 80% · 못 맞힌 것은 한 번 다시 쓰기 · 그래도 못 맞히면 질문+힌트 판정(CV-152 꼴) 기록. 그 밖 힌트는 그대로(D-328 ④).
⑶ **변형 누락 39**(flags variant_missing): G034 게이트 그대로(라틴 · 특수문자 거부 · 번역어 · 일반어 · 설명 꼴 안 받음 · 표기 지정 문항은 지정 표기만 · 정규화로 이미 같으면 안 넣음) → 받은 것 add · 안 받은 것 notTaken.
⑷ **사실 의심 36**(flags fact_doubt): 웹 재확인(ko → en 위키 원문) → true 면 그대로 · false 면 고침(질문/힌트/해설 — 닫힌 문장만 · 새 수치는 웹으로 닫힌 것만) · unverified 면 그 문장 삭제/완화(V036 · G034 꼴) → sources 에.
⑸ **알가치 바꾸지 않는다**(CV-158 (b) · 재판정도 없다 — 찬종 "재판정이 끝난 문제를 또 재판정 — 굳이") — w1 8(3519 · 3597 · 5772 · 4453 · 4303 · 5095 · 5312 · 4558)은 보고서 0절에 질문 · 정답 · V037 사유와 함께 찬종에게 표로.
⑹ **등급 바꾸지 않는다**(문장 나누기는 난이도를 안 바꾼다 — 바꿔야 할 것이 보이면 목록만).
⑺ G030 이 고친 24 중 18 이 다시 fix(V037 ④) — 쓴 뒤 그 18 의 전후 표를 보고서에(설계가 15 §3-1 예시로 쓴다).
⑻ lib 제약(G034 3절): 활성 행 고침 도구(`g034-apply-active` 꼴)로 · before 가 지금 DB 값과 같을 때만 쓴다 — V037 사본(G034 전)과 다른 행이 있으면 건너뛰고 목록(1절).

■ 할 일 (순서대로)
A. 준비: `npm run reports:report` · 남는 메모리 · 열린 판 0 · 백업(`npm run db:backup`) · 활성 7,151 · fix 358 의 지금 DB question_text / general_hint 가 refurb json 원문과 같은지(다르면 1절에 id) · `audit/g035-plan.json`(Q 358 · H 후보 · V 39 · F 36 · U 17). 커밋 1.
B. **질문 358 재독** → `audit/g035-decisions.json` step Q(question_text · notTaken · fix_text 손질 목록 ⑴). (커밋은 D 와)
C. **힌트**: checkHint 358 → 다시 쓸 목록 → 새 힌트 → blind → step H(general_hint · general_hint_version hint-v7 그대로).
D. **변형 39 · 사실 36 · 비유일 17** → step V / F. `scripts/g035-apply-active.mjs`(lib) dry-run → 적용(한 트랜잭션 · 열린 판 0) → undo dry-run. 커밋 2(결정 json + 스크립트 + raw).
E. **끝 점검**(G034 G 꼴): 활성 7,151 그대로 · pending 0 · 바뀐 열 목록(백업 대조 — question_text n · general_hint n · explanation n · question_answers +n −n · 그 밖 0) · hint-check-active 막힘 0 · checkAnswerSet 막힘 0 · blank 0 · 240자 넘음 0 · **문장 70자 넘음 0**(기계 + 오탐은 눈으로 적음) · criteria-sync --check 같음(SYNC 안 건드렸으니) · `npm test` · undo dry-run 전부 · 열린 판 0.
F. 문서 · 보고서 `ai-out/G035.txt`(0 찬종이 볼 것: ① 적용 표(fix 358 → 질문 n · fix_text 손질 n(id) · 힌트 다시 n · 변형 +n · 사실 fix n · notTaken n + 사유 분포) ② 가장 많이 바뀐 질문 10 전 → 후 ③ 힌트 다시 쓴 것 전후 10 + blind 수 ④ **w1 8 표**(찬종 결정) ⑤ G030 18 전후 · 1 원칙 7 실측 · 2~5 단계 · 6 GEN 판단(되돌리기 쉽다) · 7 결정 필요). 07 DG-073 · 13 C96 + CV-157 · 158 줄 끝 · 15 §3-1 끝 메모 한 줄 · 05 · 06 · README G 표. 커밋 3.
■ 산출물: `ai-out/G035.txt` · `audit/g035-{plan,decisions,undo}.json` · `audit/g035-raw/` · `scripts/g035-apply-active.mjs` · 07 · 13 · 15(메모 한 줄) · 05 · 06 · README.
■ 하지 말 것: 새 생성 · keep 689 손대기 · 알가치 · 등급 변경 · 해설 손질(사실 false 만 예외) · V038 대상(V037 밖 등급 1·2) 손대기 · crossans 덧붙임 297 고치기(V038 몫) · 15 SYNC 구간 · 16 · 19 · 13 의 A · C95 · C97 · CV-159 · CV-160 줄 · README R · V 표 · `g03[46]-*` · `v03[78]-*` 고치기·add.
■ 커밋: 위 파일만 · 1~3 · fetch → rebase --autostash → push · 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
■ 확인할 것 (원칙 7): 활성 7,151 · V037 fix 358 · keep 689 · hint_refit 9 · flags variant_missing 39 · fact_doubt 36 · not_unique 17 · worth_v≠3 403(w1 8) · reread 9 · g030_fixed 24(다시 fix 18) · 07 마지막 DG-072(맨 위는 MAIN 의 D-33x 일 수 있다) · 13 마지막 C95 · CV-160 · README G 표 마지막 G034 · 열린 판 0 · MAIN R079 · VERIFY V038 돎.
■ 지난 피드백(G034): 잘한 것 — lib 제약을 읽고 B·D 를 한 결정 · 한 트랜잭션으로 · 제안과 다르게 한 것 사유 · blind 다시 씀 · 웹 unverified 처리 · 설계 추정과 다른 수를 1절에. 이번에도 같은 꼴 — fix_text 를 "판정자가 쓴 글" 로 보고 GEN 눈으로 한 번 더.
■ ★ 이어서: 끝나면 **`ai-out/briefs/gen-next.md`(G036 — 미니게임 주제 세트 수집 · DB 안 씀 · 파일만)** 를 읽고 **같은 창에서 바로 시작**한다(묻지 않음). 터미널 줄 "G035 끝 → G036 시작".
■ 답변: 한국어 · 터미널 5줄 이내.
