# V011 판정 기준 — (가) G007 GEN 문구 24 + 지식 근거 5 · (나) CV-20 질문 품질 note 13 · (다) 2회차 25 ↔ 1회차

이미 DB 에 들어 있는 활성 문구를 **판정만** 한다(DB 쓰기·파일 수정(출력 파일 외)·서버·빌드 금지). 난이도 값은 판정 근거로 쓰지 않는다. 기준 문서: `docs/15-QUALITY-STANDARD.md` §3-1 §3-2 §3-3 §4-1(H0~H12) §2 B2 — 그리고 V009/V010 RUBRIC.

## (가) G007 에서 GEN 이 직접 쓴 문구 24 — `q1.txt` 앞부분
- 입력 항목: `key`=`REF:field`(hint/question/explanation) · 지금 DB 의 Q/E/H · `before`(GEN 이 바꾸기 전) · `AFTER`(지금 DB 문구 — **판정 대상**) · GEN 사유 · sources · facts(G005 생성 때 연 문서) · sameAnswerActive.
- **힌트(19)**: H2 정답 글자·조각 → H10 다른 이름 → H5 사실(문서로) → H4 해설과 같은 사실 → H3 질문 되풀이 → **H9 판정 문장 "질문을 모르는 보통 한국 성인이 그 힌트만 보고 정답을 바로 말하는가"** → CV-11(나라·도시의 기본 정체·대표 제품·대표 사건·대표 인물 작품 → fix) → ① 꼴만 ② 정답 아닌 이름으로 유도 ③ H12(같은 정답 활성 문항의 질문·해설과 같은 사실). CV-12: 힌트↔힌트는 ok. 세기만으로 fix 하지 않는다. `afterVsBefore`: 이전 문구보다 나은가 better/same/worse.
- **질문(2)·해설(3)**: 3-1(한눈에 들어오는가·묻는 문장 끝) · 3-2(정답 유일성·한정어·단정어·바뀔 수 있는 사실·문서 대조) · 해설 E1~E6(정답만 알려 주는 문장·틀린 사실·단정). GEN 이 고친 이유가 "문서와 어긋남"이면 **고친 문장이 문서와 맞는지** 직접 열어 본다.
- 사실은 **전부 문서를 열어** 대조한다(표본 아님). **지식으로 true 를 달면 무효** — 문서를 못 열었거나 문서에 그 문장이 없으면 `unverified`(basis 는 web 일 때만 true/false).

## (가-2) 지식 근거로 적재한 주장 5 — `q1.txt` 중간
- G007 이 문서로 끝내 못 닫아 `knowledge` 로 적재한 주장(`«…»`). **이번에는 이전과 다른 문서·검색어로 한 번 더 연다.** 닫으면 true(source), 끝내 못 닫으면 unverified 그대로(틀린 증거가 있으면 false). 항목마다 시도한 문서를 `tried` 에 적는다. 이 항목은 verdict 를 ok/fix 로 내지 않고 claims 결과만 낸다(문장이 틀렸다고 확인되면 verdict fix + proposal).

## (나) CV-20 질문 품질 note 13 — `q1.txt` 뒤쪽
- 질문 조건을 **모두** 만족하는 **다른 답이 실제로 있는가** — 있으면 `fix`(어느 쪽이 나은지: 질문에 한정어 제안 vs 변형 추가 제안 + 이유), 없으면 `ok`. 다른 답 후보는 **실제 예**를 `otherAnswers` 에 적는다(없으면 []). 후보가 있어도 질문의 한정어가 이미 막고 있으면 ok 이다 — 문서/검색으로 확인한다.
- #1783 은 3-1(질문이 정답을 풀어 쓴 꼴 — 정답이 질문 문장에 거의 그대로) · #3466 #3555 #3609 #3680 은 3-2 "바뀔 수 있는 사실·학설" 선(질문이 '~알려진/전한다' 로 한정돼 있으면 ok, 단정이면 fix).
- fix 면 `proposal`(질문 또는 변형 또는 해설 전체 문구 — 새 사실은 url 을 열어 확인).

## (다) 2회차 25 ↔ 1회차 — `q2.txt`
- 판정 문장 그대로(V009 2-8): **"1회차만 아는 사람이 이 2회차 질문을 새 사실 없이 바로 푸는가 · 범주 단서만으로 풀리는가"**(3-3 — 1회차 정답의 정의 문장을 이 질문의 단서로 쓰면 범주 단서) + **H12 양방향**: 2회차 힌트 ↔ 1회차 질문·해설, 그리고 1회차 힌트 ↔ 2회차 질문·해설이 같은 사실인가(낱말 겹침이 아니라 지식). **drop 은 제안하지 않는다**(이미 적재 — fix 로 범주 단서를 빼는 제안만).
- 결과: `verdict`(ok/fix) · `threeThree`(ok|category|same-fact + 한 줄) · `h12`: {`secondToFirst`: ok|same, `firstToSecond`: ok|same, 근거} · 어느 쪽 문구를 고칠지 `fixSide`(2회차 질문/2회차 힌트/1회차 힌트/…) · `proposal`(고칠 칸 전체 문구; 1회차 활성 문항 문구도 제안만).

## 결과 형식 (각 파일 `q1.out.json` / `q2.out.json` — 입력 순서 그대로 JSON 배열 · key 로 대조)
```json
{"key":"S1-10:hint","verdict":"ok|fix","categories":[],"reason":"한 줄","alone":"…","afterVsBefore":"better|same|worse — 한 줄","proposal":{"hint":null,"question":null,"explanation":null,"variants":null},"facts":[{"claim":"…","where":"q|e|h","result":"true|false|unverified","basis":"web|none","source":"URL|null","proposal":false}],"otherAnswers":[],"tried":null,"note":null}
```
- categories(사유): `famous-one` `meaning` `question-repeat` `explain-overlap` `h-error` `letters` `spoon-feed` `shape-only` `wrong-name` `pair-same` `weak` / `not-unique` `scope` `fact-error` `assertive` `readable` `explanation` `expose` `variants` / `pair-3-3` `pair-h12`.
- 제안 힌트는 쓰기 전 `node C:/work/quiz-web/data/pipeline/audit/v011-raw/_work/chk.mjs <ref> "문구"` 로 검사(막힘 0 · 120자 · 줄바꿈 없음). 새 사실은 WebFetch 로 열어 `proposal:true` 로 적는다. WebSearch 는 조각당 15회 이내. 429 가 나면 멈추고 저장된 곳까지 보고(모델을 바꾸지 않는다).

## ★ 보정 표본 6건 (VERIFY 가 먼저 읽고 정한 선) · 교훈 F
- (가 힌트) S2-01 코비 — AFTER "고교 시절 2,883점으로 윌트 체임벌린을 넘고 펜실베이니아 남동부 고교 역대 최다 득점자" → 두 번째 줄 사실 · 질문 없이 코비라고 말할 사람은 드묾 → **ok**(better — 앞의 힌트는 대표 사건이었다).
- (가 힌트) K4-28 초혼 처럼 AFTER 가 "이 의식의 이름과 같은 제목의 대중가요(장윤정)" 면 → 정답 이름을 제목으로 가리켜 질문 없이 바로 나오므로 **fix famous-one**.
- (가 질문) K1-17 삼전도비 "1895년 강물에 던져졌다가" → "땅속에 묻혔다가" — 어느 쪽이 서울시·신문 등 문서와 맞는지 문서로 열어 확인: 맞으면 ok(better), 문서와 어긋나면 fix.
- (나) #3555 패미컴(카트리지를 꽂는 닌텐도의 첫 가정용 게임기) — 닌텐도가 1977 에 컬러 TV 게임을 먼저 냈다는 학설이 있지만 질문이 "카트리지를 꽂는" 이라 패미컴 하나 → **ok**(다른 답 후보가 질문 조건을 못 채우면 ok).
- (나) 정답 유일성이 의심되는 일반어 정답(예: "회피")이면 질문 조건을 모두 만족하는 다른 법 용어가 실제로 있는지 문서/사전으로 본다 — 후보가 이름만 같고 조건을 못 채우면 ok, 채우면 fix(한정어 또는 변형 제안).
- (다) 1회차가 정답의 정의 문장을 주고 2회차가 같은 대상을 일화로 묻는 쌍 — 2회차 질문에 그 정의 문장이 없고 일화(새 사실)가 단서이면 **ok**, 2회차 질문의 단서가 "점술 카드·국수 요리·신문 낱말 퍼즐" 같은 범주 이름만이면 **fix**(범주 단서를 빼는 제안).
