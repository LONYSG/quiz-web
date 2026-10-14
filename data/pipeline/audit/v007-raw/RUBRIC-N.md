# V007 (나) · (다) 판정 기준 — 이미 게임에 나가는 힌트 79건 (적재됨)

먼저 `RUBRIC.md` 의 "힌트 판정" 절과 `docs/15-QUALITY-STANDARD.md` §4-1 을 읽는다. 여기서는 판정 대상이 다르다.

## 상황
- (나) **표본 50** — V006 이 fix 로 판정해 G002 가 지난 라운드에 **DB 에 이미 반영한 중(3) 힌트 484건** 가운데 고정 시드 무작위 41 + G002 가 의심한 3(#1518 탄소 · #3630 한강 · #3817 고추) + 경계 6(#603 · #791 · #870 · #3583 · #3792 · #3996). 항목에 `before`(V006 이 판정한 옛 힌트)와 `after`(지금 DB 힌트 = 판정 대상)가 같이 있다. `v006`(V006 판정 사유)와 `by`(verify=제안 그대로 · gen=G002 가 확인된 사실로 다시 씀)도 있다.
- (다) **같은 정답 쌍 ok 쪽 29** — V006 이 ok 로 두고 G002 가 "그대로" 둔 힌트. 쌍의 **다른 쪽**(`others`: 현재 DB 의 질문·해설·힌트)이 같이 있다.
- 판정 대상은 **지금 DB 의 힌트**다. 우리는 고치지 않고 제안만 쓴다. 반영은 G004.

## (나) 항목마다
1. `verdict`: `ok` / `fix` — **after** 를 RUBRIC 의 "힌트 판정" 그대로: H2(풀어 쓴 조각 포함) · H10 · H5(사실) · H4(해설과 같은 사실) · H3(질문 되풀이) · H9(세기 — 판정 문장 "질문을 모르는 보통 한국 성인이 그 힌트만 보고 정답을 바로 말하는가") · **새 규칙 ① 꼴만 ② 정답이 아닌 이름으로 유도 ③ 같은 정답 다른 활성 문항(`sameAnswerActive`)의 질문·해설과 같은 사실** · H11. 세기만으로 fix 하지 않는다(교훈 B).
2. `alone`: 힌트만 읽은 보통 한국 성인이 떠올릴 답(떠올리면 그 답, 아니면 "못 떠올림").
3. `afterVsBefore`: after 가 before 보다 나은가 — `better`/`same`/`worse` + 한 줄(무엇이 나아졌고 무엇이 남았나).
4. 사실: after 의 주장마다 true/false/unverified. `g002sources`(G002 가 연 url)를 **WebFetch 로 직접 열어** 대조한다(검색하지 않는다). 새 사실을 제안에 넣을 때도 url 을 열어 확인.
5. fix 면 `proposal.hint`(규칙은 RUBRIC.md "제안 힌트" 와 같다) + 근거 url.
6. `group` 이 의심·경계인 것은 reason 맨 앞에 "의심/경계:" 를 붙이고 **왜 그렇게 갈랐는지** 한 줄 더.

## (다) 항목마다
1. `others` 의 **질문·해설**(힌트가 아니라)과 이 항목의 **힌트**가 **같은 사실**인가 — 낱말 겹침이 아니라 지식. 판정 문장: "다른 쪽 문제를 앞 판에서 본 사람에게 이 힌트가 새 사실 없이 사실상 정답을 알려 주는가 / 같은 사실을 되풀이하는가". 같으면 `fix`(`pair-same`).
2. 그와 별개로 이 힌트의 H2·H5·H9·새 규칙 ① ② 도 본다(V006 ok 이므로 대개 ok).
3. fix 면 제안 힌트: 두 번째 줄 사실 · 웹 근거(url 을 열어 확인) · **쌍의 양쪽(이 항목 질문·해설 + 다른 쪽 질문·해설)과 겹치지 않게**.
4. `sameFact`: 다른 쪽 어느 id 의 질문/해설과 어떤 사실이 같은지(없으면 "겹침 없음").

## 결과 형식 (입력 순서 그대로 · 개수 같게 · id 로 대조)
```json
{"id":341,"set":"n|d",
 "verdict":"ok|fix",
 "categories":["pair-same","shape-only","wrong-name","spoon-feed","famous-one","meaning","letters","alias","h-error","explain-overlap","question-repeat","weak"],
 "reason":"한 줄",
 "alone":"…", "rules":"①②③·H2·H3·H4·H9 어디에 걸렸나(ok 면 비움)",
 "afterVsBefore":"(나) better|same|worse — 한 줄  /  (다) 해당 없음",
 "sameFact":"(다) 겹침 없음 | #3424 질문의 '○○' 와 같은 사실",
 "proposal":{"hint":null},
 "webOpened":true,
 "facts":[{"claim":"…","result":"true|false|unverified","basis":"web|knowledge","source":"URL 또는 null","proposal":false}],
 "note":null}
```
- 웹: WebFetch 주 수단. WebSearch 는 이 조각에서 **10회 이내**. "문서에서 못 찾음" 은 unverified(거짓 아님).
- 인용은 원문에서 확인한 것만(교훈 A). 추측을 사실처럼 쓰지 않는다.
