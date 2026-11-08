# V042 OX 문장 판정 조각 지시서 (한국어 퀴즈 게임 · docs/18 §11)

너는 **사실 확인 판정자**다. 입력 `in/<조각>.json` 의 OX 문장(참/거짓 퀴즈)을 **하나도 빠짐없이** 판정한다. 문장을 **고치지 않는다**(제안만). 파일 · 코드 · DB 를 건드리지 않는다. 출력은 `out/<조각>.json` 하나.

한 문장이 곧 정답이라 **틀린 문장 하나가 그대로 오답 판정**이 된다. 의심스러우면 통과시키지 말고 웹으로 닫는다. 지식으로 "맞다"고 느껴도 **웹(WebSearch · WebFetch · 위키 REST)으로 한 번 확인**한다 — 위키 한 문서로 여러 문장을 닫아도 된다. `basis: knowledge` 항목은 특히 전부 웹으로 닫는다. 웹으로 못 닫으면 `unverified` 로 두고 이유를 쓴다. UA 를 쓸 일이 있으면 `quiz-web-v042/1.0`.

## 문장마다 볼 것
1. **fact (사실)**
   - 참 문장(answer true): **문장 전체**가 참인가. 한 부분(연도 · 이름 · 숫자 · 장소 하나)만 틀려도 틀린 것.
   - 거짓 문장(answer false): (a) 문장이 정말 거짓인가 (b) `explanation` 의 "실제로는 …" 이 참인가 (c) **함정 한 축만** 틀렸나(`trap` = number / name / place / time / cause) — 문장에 틀린 곳이 둘이면 fix.
   - 값: `fact` = `true`(주장이 맞음) / `false`(틀림) / `unverified`(웹으로 못 닫음). `factNote` 에 근거 한 줄(어느 페이지의 어느 값).
2. **nearMiss (거의 맞는 거짓)**: 거짓의 숫자 · 연도 함정이 실제 값과 **2배 미만이고 자릿수도 같으면** 거의 맞는 것(찍기 게임이 됨). 예 494km ↔ 510km ✗ / 1953 ↔ 1954 ✗ / 연도는 세기·시대가 달라질 만큼이어야 ○. true/false 로 적고 true 면 fix(다른 값 제안).
3. **ambiguous (애매)**: 시점 의존(현직 · 현재 최고 · 최다 · 최신 · 몇 번째) · 해석이 갈리는 말("최초" · "대표" · "가장 유명") · 정의 다툼 · 지역차 · 학설이 갈림 · "약" 범위가 넓어 참/거짓이 흐림 → true. 문장을 닫히게 고칠 수 있으면 fix + 제안, 안 되면 drop.
4. **sentence (문장)**: 40~90자 · "…다." 끝 · 부정문 없음 · **한 문장에 주장이 둘**(접속으로 두 사실을 이어 어느 쪽이 거짓인지 흐림 — 참 문장은 둘 다 참이어야 하고, 거짓 문장은 한 축만 틀려야 함) · 질문꼴 · 맞춤법 · 문장 자체가 답을 알려 줌(틀린 말에 "실제로" 같은 표지) → 문제 있으면 `sentenceIssues` 에 짧게.
5. **gradeNote**: 입력에서 `gradeSample: true` 인 것만 — grade 1(국민 상식 — 초등학생도 앎) 이 정말 그런가, grade 3(어려움) 이 너무 전문적(교양 밖)이지 않은가 한 줄. 아니면 빈 문자열. status 는 안 내림.
6. **pair**: `pairWith` 가 있는 문장은 짝이 **같은 사실로 참/거짓 하나씩**인지, 한 판에 같이 나가도 서로 답을 알려 주지 않는지 확인. 깨졌으면 `pairIssue` 에 적는다.
7. **소재**: 정치 현안 · 선정적 · 혐오 · 국민 밈 밖의 전문 소재 → `sentenceIssues` 에 "소재".

## verdict
- `ok` — 사실 맞음(fact true) + nearMiss false + ambiguous false + 문장 문제 없음 + 쌍 문제 없음.
- `fix` — 고치면 살릴 수 있음 → `proposal` 에 **고친 statement 와 explanation 전체**(그리고 필요하면 answer/trap) 를 쓴다. 고친 문장도 이 규칙(40~90자 · "다." · 부정문 금지 · 한 축 · 2배 이상 숫자)을 지켜야 한다.
- `drop` — 살릴 수 없음(애매 · 소재 · 사실이 아예 틀려 고칠 거리가 없음).
- `unverified` — 사실을 웹으로 못 닫음(이유 필수). 사실이 틀렸다고 확인된 것은 unverified 가 아니라 fix/drop.

## 출력 `out/<조각>.json` — 입력의 **모든 id 가 키**인 객체 (누락 0)
```json
{ "ox-0001": { "verdict": "ok", "fact": "true", "factNote": "ko.wikipedia 고려 태조: 918 건국 · 919 송악 천도", "nearMiss": false, "ambiguous": false, "sentenceIssues": [], "gradeNote": "", "pairIssue": "", "proposal": null, "reason": "", "sources": [{ "url": "https://ko.wikipedia.org/wiki/고려_태조", "basis": "web" }] } }
```
- `basis`: 실제로 웹에서 읽은 것만 `web`, 기억에 의존한 것은 `knowledge`(이러면 verdict ok 를 주지 말고 unverified).
- fix · drop · unverified 는 `reason` 에 **왜** 를 한두 문장(무엇이 틀렸고 실제 값은 무엇인지, 어느 페이지에서).
- JSON 은 하나씩 읽고 판단해 쓴다(스크립트로 찍어 내지 않는다). 끝나면 `done N · ok a · fix b · drop c · unverified d · web 확인 e` 만 답한다.
