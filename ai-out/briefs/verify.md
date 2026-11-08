[VERIFY V040 — ★ 둘 묶음(★ **G038 · G039 둘 다 끝난 뒤** 시작 — 둘 중 하나라도 안 끝났으면 멈추고 "V040 대기" 한 줄): ⓐ **G038 crossans 다시 쓴 힌트 표본 판정**(A·L 로 다시 쓴 힌트 등급별 50 ≈ 250 + 핵심(C) 표본 50 — 누설이 정말 사라졌나 · 새 누설 · 정답 글자 · 해설 중복 · 사실) ⓑ **주제 세트 G039 뒤 재대조**(태양계 새 범위 전수 · 국가하천 별표 · 기계 적용 7 세트 fixes 반영 대조 + 변형 표본) · 판정만 · 웹 있음 · DB 읽기만(힌트) · C103 · CV-166~ · Sonnet · 2시간]  (이 파일이 지시 전체 — 다른 문서 지시는 docs/16)
TASK: ⓐ G038 이 crossans(다른 활성 문항의 정답이 들어간 힌트) ≈2,500~2,800 고유 힌트를 핵심/덧붙임/누설/오탐으로 판정하고 덧붙임 · 누설(≈1,200~1,500 추정)을 **GEN 이 다시 썼다**(sonnet 조각 판정 · GEN 재독 L 전부 · A 20% — 생성자의 자기 판정이라 16 0장 "생성자가 자기 산출물을 최종 판정하지 않는다" 에 따라 VERIFY 표본이 필요). ⓑ G039 가 V039 fixes 를 기계 적용하고 7 세트를 verified 로 바꿨고(설계가 허용 — 18 §9) 태양계는 범위를 바꿨다(행성 8 + 왜행성 5 + 둥근 위성) · 국가하천은 별표 확인 결과에 따라 — 이 둘은 candidate 그대로라 **VERIFY 가 verified 로 바꿔야 적재된다**.
실행 모델: Sonnet 5.5 (`claude --model claude-sonnet-5-5` — 바꾸지 않는다)

■ 고정 규칙: docs/16 5-3 그대로 + **예외**(V039 와 같음): `data/minigame/topics/<slug>.json` 의 **`verify` 칸과 `status` 만**(round V040 · 들여쓰기 · UTF-8 · 끝 줄바꿈 그대로 · 쓴 뒤 `node scripts/topics-check.mjs` 막힘 0). 13 **C103** · **CV-166~** · README V 표 · 05 · 06. 조각 `data/pipeline/audit/v040-raw/`. **DB 읽기만**(힌트 · 질문 · 해설 — quizweb 읽기) · 웹 있음(UA `quiz-web-v040/1.0`).
■ ★★ 동시 라운드 — **MAIN R081**(코드 · DB 는 quizweb_test) 과 겹침 없음. GEN 은 쉼(G039 끝). V040 은 topics/*.json 의 verify · status · ai-out/V040 · audit/v040-* · 13 · README · 05 · 06 만.

■ 먼저 읽기: `ai-out/G038.txt`(0절 ① C·A·L·F 수 · ② 바꾼 힌트 수 · 등급별 · ③ 전후 예 · ⑤ 남은 crossans) · `audit/g038-decisions.json`(호스트 힌트 id · cls · before/after · cross 목록) · `audit/g038-plan.json` · `ai-out/V038.txt` 7절(경계 규칙 — "핵심이라도 다른 문항의 정답을 그대로 알려 주면 누설") · `data/pipeline/audit/v038-crossans.json`(V038 표본 100 — 기준 예시로만) · docs/15 §4-1(H9~H12) · `scripts/hint-check.mjs`(checkHint) · `scripts/hint-crossans.mjs`(보정 뒤 규칙 · crossans-skip.json) · `ai-out/G039.txt`(0절 ① 표 · ③ 국가하천 · ④ 태양계) · `audit/g039-topics-diff.json` · docs/18 §9 · `ai-out/V039.txt` 4절 표.

■ ⓐ 판정 틀(힌트)
 (1) 대상 = g038-decisions 에서 **cls A · L 로 힌트가 바뀐 호스트** → 등급(1~5)별 **50 씩 층화**(등급에 50 이 안 되면 전부 · 합 ≤ 250) + **cls C(그대로 둔 핵심) 표본 50**(등급 섞어 — 핵심 판정이 누설을 놓쳤나) = ≤ 300.
 (2) 바뀐 힌트마다: ① **원래 cross 정답이 사라졌나**(기계 — `hint-crossans.mjs` 의 판정을 그 힌트 하나에 적용 + 눈 · 바꿔 넣은 이름이 또 다른 활성 문항 정답인가) ② 새 힌트가 15 §4-1(70자 안팎 · H9 세기 · H10 다른 이름 · H12 정답 글자 · 해설과 같은 사실 아님) ③ **사실**(바뀐 문장에 새 사실이 들어갔으면 웹 1 — 없으면 unverified 가 아니라 "새 사실 없음") ④ **힌트 구실**(그 문항의 힌트로 여전히 쓸모 있나 — 덧붙임을 뺀 뒤 빈말이 됐는지) → verdict ok / fix(proposal 전문) / drop + category(누설 남음 · 새 누설 · 정답 글자 · 사실 아님 · 해설 중복 · 빈말 · 길이).
 (3) C 표본 50: V038 두 문장으로 ("저 문항을 풀 때 이 힌트를 봤다면 답을 알게 되는가") → 핵심 맞음 / 사실은 누설(L) / 사실은 덧붙임(A) 수.
 (4) 결과 `audit/v040-hints.json`(호스트 id 전부 키로 · verdict · category · proposal · reason · sources) · 조각 sonnet · 100 건 안팎 · 동시 2 · 첫 조각은 VERIFY 가 전부 읽고 기준을 맞춘 뒤 나머지 · **fix · drop 전부 + ok 10% 재독**(16 0장).
■ ⓑ 판정 틀(주제)
 (1) **태양계**(G039 가 바꾼 범위): 출처 페이지(G039 가 적은 source[0])를 직접 받아 **전수 1:1**(행성 8 · 왜행성 5 · 둥근 위성 — 페이지 수와 파일 수) · 비구형 위성이 남아 있나 · 변형 표본 전부(작은 세트) → verified / candidate+fixes.
 (2) **국가하천**: G039 가 별표로 적용했으면 그 별표 페이지를 받아 **전수 1:1**(공식 수와 파일 수) → verified / fixes · G039 가 못 열었으면 VERIFY 가 law.go.kr 별표 · 환경부 고시를 시도(둘 다 막히면 candidate 그대로 · why).
 (3) **기계 적용 7 세트**(시군구 · 지하철 · 통화 · 수도 · 별자리 · 디즈니 · 스포츠): `verify.fixes` 와 items 를 기계로 대조(applied 표시된 fix 마다 그 결과가 items 에 있나 · 없거나 다른 것 수) + 변형 표본 10 + **원소**(변형 정리 · 정본 4) · **통화 label** 표본 — 문제 있으면 `verify.fixes` 에 더하고(round V040) status 는 **verified 그대로**(3건 이하) · 많으면 candidate 로 내리고 why.
 (4) `verify` 칸 갱신(round V040 · checkedAt · sources read · 결과) — 태양계 · 국가하천은 `status` 도.
■ 할 일 (순서대로)
A. 0절 준비: G038 · G039 끝났나(README G 표 · ai-out/G03[89].txt) · 메모리 · 13 마지막(C102 · CV-165) · 지시서 `v040-raw/_work/INSTRUCTIONS-v040.md` · 층화 표본 뽑기(기계 · 시드 적어 둠). 커밋 없음.
B. ⓐ 조각 → VERIFY 재독 → `audit/v040-hints.json`. 커밋 1(raw + json).
C. ⓑ 태양계 · 국가하천 · 7 세트 → 파일 verify · status → topics-check 막힘 0 → `audit/v040-topics.json`. 커밋 2.
D. 13 **C103** · **CV-166**(G038 표본 결과 → 다음 G 가 적용할 fix 묶음 · 비율로 본 전체 추정) · **CV-167**(핵심 C 표본에서 놓친 누설 비율 — 전수 재판정이 필요한지의 근거 — 설계 결정) · README V 표 · 05 · 06 · `ai-out/V040.txt`(0 ★ 찬종이 볼 것: ① 다시 쓴 힌트 표본 ok/fix/drop 수와 비율 · 등급별 ② 핵심 50 중 사실은 누설 수 ③ 태양계 · 국가하천 verified 여부 → "다음 메뉴 1 때 세트 n" ④ 7 세트 대조 어긋남 수 ⑤ 전후 예 5 · 1 건수 · 2 종류별 · 3 fix·drop 전부 · 4 unsure · 5 — · 6 반복 유형 · 7 자기 점검). 커밋 3.
■ 하지 말 것: 힌트 · 질문 쓰기(DB · 파일) · items 고치기(fixes 제안만) · G038 이 C 로 둔 힌트 전수 재판정(표본 50 만) · V038 100 · G037 54 다시 판정 · 코드 · 18 고치기 · 13 A · C101 · C102 · CV-162 · CV-164 · CV-165 줄 · README G · R 표.
■ 커밋: 위 파일만 · 1~3 · fetch → rebase --autostash → push · 끝줄 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
■ 확인할 것 (원칙 7): G038 바꾼 힌트 수 · 등급별(0절 ②) · g038-decisions 키 수 = 호스트 수 · G039 verified 수(예상 28) · 태양계 항목 수(≈32) · 국가하천 적용 여부 · 13 마지막 C102 · CV-165 · README V 마지막 V039 · topics-check 막힘 0 · MAIN R081 돎.
■ 지난 피드백(V039): 잘한 것 — "지식으로 작성" 세트를 전부 페이지로 다시 받아 셈 · 7절에 약한 근거(개수+본문 용어 대조 4 세트 · 영문 순서 대응 3 세트)를 숨기지 않음 · fixes 를 기계가 적용할 수 있는 op 꼴로. 이번에도 표본으로만 본 것은 숫자로.
■ ★ 이어서: 끝나면 멈춘다(verify-next.md 없음). 터미널 마지막 줄 "V040 끝 — 다음 브리핑 대기 · /clear 가능".
■ 답변: 한국어 · 터미널 5줄 이내.
