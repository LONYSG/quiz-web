# V036 조각 판정자 지침 — G032 pending 문항 (판정만 · DB·코드·문서 쓰기 금지)

작업 폴더: C:\work\quiz-web . 입력 `data/pipeline/audit/v036-raw/in/g032-pNN.json`(문항 50개, NN=01..10). 출력 `data/pipeline/audit/v036-raw/out/g032-pNN.json`(JSON 배열 — 입력 순서 그대로 · 한 문항 한 객체).
이 문항들은 AI 가 새로 만든 퀴즈다(아직 비활성). 너는 **독립 판정자**다. 생성자의 점수·의견은 일부러 빼 두었다.

## 먼저 읽을 것 (전부 읽는다)
- docs/19-DIFFICULTY.md §1~§4 (v2 등급 눈금 1~5 · 눈금자 · 기준 인물 · 판정 규칙), §8 (질문 읽기 ⓐⓑⓒ ⑨ · 8-1), §9 (알가치 1~3 정의 · 예시)
- docs/15-QUALITY-STANDARD.md §3 (사실·출처), §4-1 H0~H13 (힌트 규칙), §5-4 (정답 친숙도)
- ai-out/V033.txt (판정 꼴 예시)

## 문항마다 일곱 눈
1. **grade_v (독립 등급 1~5)** — ★ 가장 먼저, 다른 눈을 보기 전에 19 v2 눈금으로 매긴다. "질문 글 + 정답" 만 보고 기준 인물이 맞힐 확률로 판단. 한 줄 사유. 생성자 의도를 짐작하지 말고 눈금자 앵커와 견줘 매긴다. 후하게도 박하게도 말고 눈금대로.
2. **fact** — 질문·힌트·해설의 고유 사실(연도·숫자·이름·인과)을 웹으로 닫는다. 입력의 facts[](생성자가 열었다는 문서)는 참고만 — **직접 다시 연다**(WebFetch 위키 ko/en, WebSearch. User-Agent `quiz-web-v036/1.0`, 개인정보 금지. 위키 API 429 는 4초 간격 재시도). 출처 둘(위키 + 1차 출처 또는 다른 백과)이 원칙. 결과 `true` / `false` / `unverified`. false 면 고칠 문구를 `fact_fix` 에. 못 닫으면 unverified 와 어느 주장인지.
3. **worth (1/2/3)** — 19 §9 정의로. 저장값은 입력에 없다. 모르는 채 매긴다.
4. **read** — 19 §8 ⓐⓑⓒ ⑨ · 8-1 "무슨 말이야 테스트": `ok` / `rewrite` (+ `read_fix` 제안문, 같은 사실만 사용).
5. **hint** — 15 §4-1 H0~H13: 힌트 `ok` / `fix`(+ `hint_fix` 제안: 40~80자 · 정답 글자·초성 없음 · 질문과 겹치지 않음 · 한 문장 핵심). 형태 코드(h2 뜻풀이/h3/h5/h7/h12/too-weak/length 등)를 `hint_form`. 제안 힌트는 `node scripts/hint-check.mjs` 규칙에 걸리지 않게 쓴다(파일 머리의 사용법 확인).
6. **unique** — 정답 유일성: 질문에 대해 다른 답도 맞는가? 빠진 표기 변형이 있나? `unique_ok`(true/false) + `missing_variants[]` + 사유.
7. **dup** — 입력에 `pairedActive` 가 있을 때만: 짝 활성 문항과 같은 지식을 묻는가 `same` / `different` + 사유. 없으면 null.

## verdict
- `keep` — 그대로 활성해도 됨
- `fix` — 고치면 됨 (fact_fix / read_fix / hint_fix / 변형 추가 중 하나 이상)
- `drop` — 활성하면 안 됨: 사실이 틀리고 못 고침, 중복 same, 알가치 1, 정답 유일성 깨짐 등. 사유 필수.

## 출력 객체 꼴
{"id":"…","grade_v":N,"grade_why":"…","fact":"true|false|unverified","fact_notes":"어떤 주장을 어디서 닫았나(URL 요약) · 못 닫은 것","fact_fix":null|"…","worth_v":N,"worth_why":"…","read":"ok|rewrite","read_fix":null|"…","read_why":"…","hint":"ok|fix","hint_form":null|"…","hint_fix":null|"…","unique_ok":true|false,"missing_variants":[],"unique_why":"…","dup":null|"same|different","dup_why":null|"…","verdict":"keep|fix|drop","verdict_why":"한 줄"}

## 규칙
- 기준을 느슨하게 하지 마라: 의심스러우면 `unverified`/`fix` 로 두고 사유를 적어라. 설계가 fix·drop·unsure 를 전부 다시 읽는다.
- 모든 문항에 웹으로 최소 한 번은 사실을 직접 닫아 본다. 검색 없이 지식만으로 `true` 를 주지 마라(그 경우 fact_notes 에 "지식만" 이라고 적고 `unverified`).
- 개인정보(메일·이름)를 요청 헤더·검색어에 넣지 않는다. 키가 필요한 API 금지.
- 끝나면 파일을 쓰고 마지막에 "건수 N · keep a · fix b · drop c · 웹 대조 n" 한 줄만 답한다.

## ★ V036 추가 규칙 (V035 교훈 — 반드시)
- **사실 눈은 WebFetch 로 위키 원문(ko → 없으면 en)을 직접 열어 대조한다.** WebSearch 는 보조(문서 찾기용). 문항마다 최소 1회 WebFetch(질문의 핵심 사실 문서). 예: https://ko.wikipedia.org/wiki/<제목> . 429 면 4초 뒤 재시도.
- **해설(explanation) 문장도 닫는다.** 해설에서 연도·숫자·이름·인과 단정을 위키 원문과 대조. 못 닫으면 fact 는 unverified 로 두고 fact_notes 에 "어느 문장 · 삭제 제안" 을 적고 fact_fix 에 삭제/수정 문장을 쓴다. 해설 문장이 틀리면 false.
- fact=false 면 fact_notes 에 **출처 URL** 필수.
- 출력에 fact_web (WebFetch 로 연 URL 수)(WebFetch 로 연 URL 수) 숫자 필드를 추가한다.
- 입력의 facts[] 는 생성자 주장 — 믿지 말고 다시 연다. pairedActive 는 모두 비어 있다(dup 는 null).
- 개인정보(메일·이름) 금지, 키 필요한 API 금지, DB·코드·문서 쓰기 금지(out 파일만 쓴다).
- 마지막 답은 "건수 N · keep a · fix b · drop c · 웹 대조 n(WebFetch)" 한 줄만.
