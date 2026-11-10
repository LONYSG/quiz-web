# V050 판정 지시 (이모지 제목 퀴즈)

입력: judge-in-K.txt (탭 구분: id, 갈래, 이모지줄, 정답, alt(/구분), why, 연도, 힌트, 난이도) + blind-out-K.json (블라인드 풀이: guess1/guess2 — 정답 모름 상태에서 낸 추측).
블라인드 판정: guess1 이 정답(또는 alt)과 같은 작품 = "ok" · guess2 에만 = "edge" · 둘 다 아님 = "miss".

항목마다 판정:
1. **유일성** — 이 이모지 줄로 다른 유명 작품(같은 갈래)도 떠오르나? 떠오르면 fix + emoji op (from=현재 줄, to=제안 줄: 그 작품만의 소품·장면 하나를 넣어 좁힘, 3~5개, 글자 없음, 흔한 이모지). 블라인드 guess 가 다른 작품이면 그 작품명을 reasons 에 적는다.
2. **범용 줄** — 경찰·총·칼·돈·하트만으로 된 줄 → 1과 같은 처리.
3. 너무 쉬움(포스터/제목 글자 1:1 — 이건 표시만, fix 안 함) · 너무 어려움(why 를 읽어도 억지) → fix.
4. **보편성** — 20~40대 열 명 중 일곱이 제목을 아나? 아니면 drop. **세대** — 2000년 전 작품이면 지금 20~30대도 다 아는 레전드급인가? 아니면 drop.
5. **사실** — 정식 한국어 제목 · 연도(확실치 않으면 reasons 에 "확인필요").
6. **변형** — 흔한 표기가 alt 에 빠짐(variant-add: to=추가할 표기) · 엉뚱한 alt(variant-remove: from).
7. **힌트** — 정답 글자/제목 조각 누설이면 fix hint(to=새 힌트 15~30자). 도움 안 되면 같음.
8. diff(1~3) 가 맞나 — 1~2 단계 차이만 제안(op diff, from, to).
블라인드 miss 라도 이것만으로 drop 하지 않는다. 판단은 유일성이 중심: 블라인드 miss 인데 이모지가 작품에 잘 맞으면(내가 봐도 정답이 하나로 좁혀지면) ok 가능, 오로지 억지면 fix.
verdict: ok | fix | drop. 아주 엄격하게 하되 전체의 대부분을 fix 로 만들지는 말 것(목표 fix 15~30%, drop 3~8%).

출력: C:\work\quiz-web\data\pipeline\audit\v050-raw\judge-out-K.json 에 Write 로 저장.
[{"id":"…","verdict":"ok|fix|drop","blind":"ok|edge|miss","reasons":["짧게"],"fixes":[{"op":"emoji|variant-add|variant-remove|hint|diff|category","from":"…","to":"…","why":"…"}]}]
모든 항목 빠짐없이(251개). reasons 는 ok 면 []. 끝나면 "done N ok/fix/drop 수" 한 줄만 답하라.
웹 검색은 필요할 때만(제목/연도 사실 의심, 총 3회 이하).
