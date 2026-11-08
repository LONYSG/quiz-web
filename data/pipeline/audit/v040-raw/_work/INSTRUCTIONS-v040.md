# V040 힌트 표본 판정 지시서 (한국어 퀴즈 · 힌트 검증자)

G038 이 "다른 활성 문항의 정답이 글자 그대로 든 힌트"(crossans)를 다시 썼다. 너는 **생성자와 독립인 검증자**로, 다시 쓴 힌트(after)가 제대로인지, 그리고 원래(before)가 정말 바꿀 필요가 있었는지를 판정한다.
읽을 것: 이 파일 + `data/pipeline/audit/v040-raw/_work/hint-rules.md`(= 15 §4-1 H0~H13 — 필요할 때만 훑는다) + 입력 파일 1개. **DB 는 못 본다(입력에 필요한 건 다 있다). 웹은 새 사실이 든 때만.** 쓸 것: `out/pXX.json` 1개. 스크립트로 일괄 생성 금지 — 항목을 하나씩 읽고 판정한다.

## 입력 항목 (kind=changed)
`id, grade, answer, variants, question, explanation, before, after, g038cls(L/A — G038 의 자기 판정), g038why, crossOriginal[{crossId, crossAnswer, crossQuestion}], machineAfter[…], machineBefore[…], checkAfter{block,warn}`
- crossAnswer = before 힌트 속에 글자 그대로 있던 **다른 활성 문항의 정답**. crossQuestion = 그 문항 질문(앞 110자) — 그 문항을 풀 때 이 힌트를 봤다면 어떻게 되는지 가늠하는 데 쓴다.
- machineAfter = **after 에 아직 남은 다른 활성 문항 정답**(기계가 센 것 — 비어 있으면 안 남음). 비어 있지 않으면 눈으로 오탐인지(일반어·동음이의) 본다.

## 입력 항목 (kind=core) — G038 이 "핵심(C)"으로 두고 힌트를 안 바꾼 것
`id, grade, answer, question, explanation, hint, g038why, crossOriginal, machineNow`

---
## A. kind=changed 판정 — ★ 순서를 지킨다(after 에 끌리지 않게)

**① (before 만 보고) 핵심이었나** — V038 두 문장으로, **after 를 아직 보지 않고** before 를 본다.
 - Q1 "before 에서 그 cross 이름을 빼거나 다른 말로 바꿔도 이 문항의 힌트가 되는가?" 된다 → **A 덧붙임**
 - Q2 "그 cross 문항을 풀 때 이 힌트를 봤다면 답을 알게 되는가?" 된다 → **L 누설**(★ 핵심이라도 다른 문항의 정답을 그대로 알려 주면 L)
 - 둘 다 아니면(빼면 힌트가 성립 안 하고 cross 답을 알려 주지도 않음) → **C 핵심**
 - cross 여럿이면 가장 무거운 것(L > A > C) 하나를 `trueCls` 로. (G038 의 g038cls 와 달라도 된다 — 네 판단을 쓴다.)
**② after 판정:**
 1. cross 정답이 사라졌나(crossOriginal 이름이 after 에 글자로 안 남았나 · machineAfter 비었나) + **바꿔 넣은 말이 새 고유 이름(작품·사람·나라·회사)이라 또 다른 활성 문항 정답이 될 만한가**(machineAfter 가 이미 센 것만 아니라 눈으로도).
 2. 15 §4-1: 한 문장 · 70자 안팎(120 이내) · H2 정답 글자·변형·뜻풀이 조각 없음 · H3 질문 되풀이 아님 · H4 해설과 같은 사실 아님 · H10 정답과 같은 대상의 다른 이름·옆 이름 아님.
 3. **사실** — after 에서 before 에 없던 **새 사실**이 들어갔으면 맞는지 확인(웹 1회 이내 · 출처 URL). 새 사실이 없으면 `"새 사실 없음"`. 사실이 틀리거나 못 찾으면 verdict fix/drop + category `사실 아님`.
 4. **힌트 구실** — 아는 사람이 after 를 보고 "아 그거!" 하는가(H9) · 모르는 사람이 정답 공개 뒤 읽고 핵심이 남는가 · 덧붙임을 뺀 뒤 빈말(어느 문항에나 맞는 말)이 됐는가.
**③ verdict**
 - `ok` — after 가 문제 없다. (trueCls 가 C 인데 after 가 before 와 같거나 나으면 `ok` + `coreChanged: true` — 핵심이었지만 손해 없음.)
 - `fix` — 고치면 쓸 만하다. `proposal` = **힌트 전문 한 문장**(70자 안팎 · 정답 글자 금지 · 새 고유 이름 금지 · 가능하면 after 를 덜 바꿔서).
 - `drop` — 이 문항 힌트로 못 쓴다(제안도 어렵다). 이유.
 - `revert` — ★ trueCls 가 **C**(원래 핵심)이고 after 가 before 보다 **나쁨**(단서 약화 · 빈말 · 새 문제) → before 로 되돌릴 후보. (trueCls 가 C 인데 after 가 나쁘지 않으면 revert 가 아니라 ok+coreChanged.) before 자체가 L(누설)이면 revert 가 아니다.
 - category: `누설 남음` · `새 누설` · `정답 글자` · `사실 아님` · `해설 중복` · `빈말` · `단서 약화` · `길이` · `—`(ok 일 때).
 - **엄격하게**: 비교가 아슬아슬하면 `unsure: true` 를 켜고 이유를 쓴다(숨기지 않는다). 70자는 "안팎"이다 — 90자를 넘으면 `길이`.

## B. kind=core 판정 (hint 만 있고 바뀌지 않은 핵심)
각 cross 에 V038 두 문장을 적용: "빼도 힌트가 되나(A)" · "그 문항을 풀 때 이 힌트를 봤다면 답을 아나(L)" · 둘 다 아니면 C(핵심 맞음).
`trueCls` = 가장 무거운 것. L 이면 `proposal` = 누설을 없앤 힌트 전문(핵심은 지키고 cross 이름만 일반어로). A 이면 proposal 은 선택. verdict: `core-ok`(C 맞음) / `leak`(L) / `addon`(A). machineNow 에 무엇이 남았는지도 본다.
- 판정 예: 색맹 "빨강과 초록 같은 빛깔을 잘 가려 보지 못하는" ↔ 빨강(산타 옷 색 문항): C. 에델바이스 "'사운드 오브 뮤직'의 노래로 유명" ↔ '도레미 송' 뮤지컬 문항: L. 윔블던 ↔ "그랜드 슬램" 나열: A.

## 예시 (기준 맞추기)
- **ok**: #6149 덕수궁 B "…돌담길과 서양식 석조전으로" A "…돌담길과 서양식 건물로" — cross '석조전' 은 덧붙임(석조전이 정답인 문항을 풀면 힌트가 거의 정답) → trueCls L, 일반어 '건물' 로 바꿔 힌트 구실 유지 → ok.
- **revert**: (가상) 정답 '테아닌' 힌트 B "녹차에 든 '아미노산'으로 긴장을 풀어 주는 성분이다" ↔ cross '아미노산'(아미노산 문항). B 는 그 성분의 정체를 규정하는 핵심 — 빼도 되는 덧붙임이 아니고, 아미노산 문항의 답을 알려 주는 것도 아님(정답이 '아미노산'을 묻는 건 아님). → trueCls C. G038 이 "성분이다" 로만 줄여 "무엇의 성분인지 사라졌다" 면 단서 약화 → revert.
- **fix**: after 가 새 고유 이름을 넣었다(예: B "류현진도…" → A "박찬호도…" — 이름을 이름으로 바꿈; 박찬호도 정답인 문항이 있을 수 있음) → fix, proposal 은 이름을 일반어로.

## 출력 `out/pXX.json` (입력과 같은 순서 · 전부)
```json
[{"id":123,"kind":"changed","trueCls":"L","verdict":"ok","category":"—","coreChanged":false,"crossGone":true,"newName":false,"newFact":"새 사실 없음","hintUse":"유지","unsure":false,"proposal":null,"reason":"한 줄","sources":[]}]
```
core: `{"id":..,"kind":"core","trueCls":"C|A|L","verdict":"core-ok|addon|leak","proposal":null|"…","reason":"한 줄"}`
끝나면 마지막 줄에 `done N · changed(ok a/fix b/drop c/revert d · coreChanged e) 또는 core(ok/addon/leak)` 만 답한다.
