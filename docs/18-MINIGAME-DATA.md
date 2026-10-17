# 18. 미니게임 데이터 형식 (GEN 이 만들고 · VERIFY 가 재검증하고 · MAIN 이 적재·출제)

> 설계 에이전트 2026-10-17 신설. 퀴즈류 미니게임(docs/17 1-1 🟡🧠) 다섯 개의 **파일 형식**이다. GEN(G008~)은 이 형식으로 파일을 만들고, VERIFY(V011~)는 `verify` 칸을 채우며, MAIN(R052~)은 이 형식을 읽는 적재 스크립트와 DB 표를 만든다. 세 세션이 서로 기다리지 않도록 **파일이 정본**이고 DB 적재는 그 뒤다(G009).
> 형식을 바꾸려면 이 문서를 먼저 고치고 `version` 을 올린다. 라운드 안에서 임의로 칸을 더하지 않는다(모르는 칸은 적재 스크립트가 거부한다).

## 0. 공통

```
data/minigame/<game>/items.json        ← 정본 (git 에 있다) · 2차부터는 items-2.json · items-3.json … (묶음 파일 — 같은 형식 · id 는 이어서 · 읽는 쪽은 items*.json 전부)
data/minigame/worldprice/products.json ← 빅맥 계열만 (아래 2)
assets/minigame/<game>/<id>.<jpg|png|webp>  ← 그림 (git 에 없다 — .gitignore `assets/minigame/*/` · README 만 커밋)
```

- `<game>` = `price` · `worldprice` · `photo` · `estimate` · `which`.
- 묶음 파일(2026-10-17 설계 에이전트 추가): 한 라운드가 만든 항목은 한 파일에 둔다(1차 `items.json` · 2차 `items-2.json` …). VERIFY 가 한 파일의 `verify` 칸을 쓰는 동안 GEN 은 그 파일을 건드리지 않고 새 묶음 파일에만 쓴다. MAIN 적재 스크립트 · g008-check 는 `items*.json` 을 모두 읽는다(id 유일성은 파일을 합쳐서 본다). worldprice 의 `products.json` 은 품목 추가만(기존 품목 rows 는 그대로).
- 파일 머리: `{ "game": "<game>", "version": 1, "asOf": "YYYY-MM-DD", "items": [ … ] }`.
- **공통 칸** (항목마다):
  | 칸 | 뜻 |
  |---|---|
  | `id` | 문자열 · 영구 · 바꾸지 않는다 · `<game>-NNNN`(0 채움 4자리). 경험 시스템(01 12장)은 이 id 로 기록한다 |
  | `status` | `candidate`(GEN) → `verified` / `rejected`(VERIFY) → `loaded`(MAIN 적재 뒤) |
  | `createdRound` | `G008` 처럼 |
  | `sources` | `[{url, note, fetchedAt}]` — 값마다 문서 URL. `note` 는 문서 문장(또는 "(요지)") |
  | `image` | `{file, sourceUrl, license, attribution, width, height, bytes}` 또는 `null`. `file` 은 `assets/minigame/<game>/<id>.<ext>` |
  | `tags` | 자유 태그 `[]`(소재 균형 집계용 — 예: `["식품","라면"]`) |
  | `verify` | VERIFY 가 채운다 `{round, verdict: ok|fix|drop, reason, proposal, checked:[…]}`. GEN 은 비워 둔다(`null`) |
- **그림 규칙**: 긴 변 1024px 이하 · 500KB 이하(sharp 로 줄인다 — `scripts/emoji-import.mjs` 꼴) · 워터마크 없음 · 정답 글자가 그림 안에 보이면 안 된다(상표 로고·가격표·캡션 포함 — 사진 게임은 특히). 정본은 G009 적재 뒤 DB(bytea · 백업 포함). 그때까지는 찬종 PC 파일뿐이므로 GEN 은 라운드 끝에 `assets/minigame/` 을 `backups/minigame-<날짜>.zip` 으로도 묶는다.
- **저작권**(찬종 2026-10-16 "상업 이용 안 할거니까 그냥 다운 및 표시는 해도 됨" · 공개 저장소에는 넣지 않는다):
  - `photo`(사진 이름 맞히기)는 **자유 라이선스만**(위키미디어 공용 CC0 · CC BY · CC BY-SA · 퍼블릭 도메인) — 화면에 작게 출처를 붙일 수 있게 `attribution` 을 꼭 채운다.
  - `price` · `worldprice` 는 제조사·공식몰 상품 이미지(출처 URL 기록 · `license: "product-page"`).
  - `estimate` · `which` 의 그림은 위 둘 중 하나.
- **값 규칙**: 숫자는 숫자형(문자열 금지) · 날짜는 `YYYY-MM-DD` · 통화는 원 단위 정수.
- **정답 표기**(사진 게임): 퀴즈와 같다 — 15 §2 B2(질문이 요구하는 표현과 같은 종류) · 한국에서 실제로 치는 표기만 변형에 · 정규화는 정답 판정과 같은 함수.

## 1. `price` — 얼마게요

```json
{ "id": "price-0001", "name": "신라면 멀티팩 5입", "brand": "농심", "category": "식품",
  "priceKrw": 4500, "priceKind": "official", "priceAsOf": "2026-10-17",
  "priceSources": [{ "url": "…", "seller": "농심몰", "priceKrw": 4500, "fetchedAt": "2026-10-17" },
                   { "url": "…", "seller": "다나와 최저가(새 상품)", "priceKrw": 4320, "fetchedAt": "2026-10-17" }],
  "bucket": "<1만", "note": "결과 화면 한 줄(재밌는 점·왜 이 가격인지)", "image": {…}, "tags": ["라면"], … }
```
- `category`: 식품 · 생활 · 가전 · 패션 · 뷰티 · 취미 · 자동차 · 사치품 · 해외 · 기타. `bucket`: `<1만` · `1~10만` · `10~100만` · `100만+`.
- `priceKrw` = **공식 정가**(`official`) 또는 **가격비교 새 상품 가격의 중앙값**(`median`). 출처 **2곳 이상** · 중고 · 렌탈 · 해외직구 · 부속품 · 리퍼 · 한정판 · 경매 제외.
- ★ 적합성: 출처 사이 **최고/최저 비율 1.5 이내**가 아니면 버린다(찬종: "판매자에 따라 가격이 천차만별이 아니고 적당히 형성된 가격"). 1,000원 미만 제외. 가격은 **1년 지나면 자동 제외**(MAIN 이 `priceAsOf` 로 거른다).
- 소재 균형: 생필품 · 가전 · 명품 · 기괴한 해외 상품 · 의외로 비싼 것 · 의외로 싼 것을 섞는다. 같은 브랜드 3개 이하.

## 2. `worldprice` — 빅맥지수

`products.json`:
```json
{ "version": 1, "products": [
  { "productId": "bigmac", "nameKo": "빅맥", "unit": "1개", "image": {…}, "asOf": "2026-07-01",
    "fxAsOf": "2026-07-01", "fxSource": "…",
    "rows": [{ "cc": "KR", "countryKo": "한국", "localPrice": 5500, "currency": "KRW", "krw": 5500, "source": "…" },
             { "cc": "US", "countryKo": "미국", "localPrice": 5.69, "currency": "USD", "krw": 7900, "source": "…" }, …],
    "sources": [ … ], "note": "이코노미스트 빅맥지수 2026-07" } ] }
```
`items.json` 항목: `{ "id": "worldprice-0001", "productId": "bigmac", "targetCc": "JP", "shownCc": ["KR","US","GB"], … }`
- 품목(1차): **빅맥 · 아이폰(기본 모델 출고가) · 넷플릭스(표준 요금)**. 나라는 품목마다 **구할 수 있는 전부**(최저·최고가 드러나게) — `rows` 는 한 품목에 한 번만.
- `targetCc` 는 KR 제외 · `shownCc` 는 항상 KR 포함 3곳(목표 제외) · 한 (품목, 나라)에 항목 하나. 결과 화면은 전체 순위 + 최저/최고 + 주요국 강조(MAIN).
- 환율은 `fxAsOf` 하루치로 통일 · 출처 기록.

## 3. `photo` — 사진 보고 이름 맞히기

```json
{ "id": "photo-0001", "answer": "애글릿", "altAnswers": ["aglet"], "category": "everyday",
  "revealMode": "zoom", "explanation": "신발끈 끝의 플라스틱·금속 마감 — 1~2문장 · 출처", "difficulty": 2,
  "image": { "file": "assets/minigame/photo/photo-0001.jpg", "sourceUrl": "https://commons.wikimedia.org/…", "license": "CC BY-SA 4.0", "attribution": "…" }, … }
```
- `category`: `person`(공인·역사 인물만) · `place`(명소) · `object`(제품·사물) · `everyday`(흔한데 이름은 모르는 것) · `food` · `animal` · `logo`.
- `revealMode`: `zoom`(확대에서 점점 멀어짐) · `mosaic`(점점 풀림) · `plain`(그대로). 실루엣은 쓰지 않는다(찬종 — 누끼 품질).
- ★ **사진만으로 정답이 하나로 좁혀져야** 한다(비슷한 것이 여럿이면 버림). 정답 유일성 · 변형은 퀴즈와 같은 선.
- `difficulty` 1~3 은 GEN 추정 · VERIFY 가 다시 매긴다.

## 4. `estimate` — 얼마나 될까

```json
{ "id": "estimate-0001", "kind": "weight", "question": "다 자란 수컷 아프리카코끼리 한 마리의 몸무게는?",
  "value": 6000, "unit": "kg", "displayDecimals": 0, "asOf": null, "explanation": "…", "image": {…}, … }
```
- `kind`: `weight` · `calorie` · `count` · `length` · `height` · `distance` · `population` · `year` · `speed` · `price` 외는 `other`. `unit` 은 표시 단위 그대로(`kg` · `kcal` · `m` · `km` · `명` · `년` · `km/h`).
- 질문은 **대상을 명시**한다("이것" 없이) · 값은 표준 출처(공식 통계 · 백과 · 제조사) 하나 이상 · 범위로만 알려진 값은 중앙값과 `note` 에 범위.
- 점수는 비율 오차(|log(추정/정답)|)로 — MAIN. `displayDecimals` 는 결과 표시 자리.

## 5. `which` — 어느 쪽?

```json
{ "id": "which-0001", "kind": "bigger", "stem": "둘 중 인구가 더 많은 나라는?",
  "a": { "label": "베트남", "value": 100300000, "image": {…} }, "b": { "label": "독일", "value": 83500000, "image": {…} },
  "answer": "a", "unit": "명", "margin": 1.2, "asOf": "2025-01-01", … }
```
- `kind`: `bigger`(수치가 큰 쪽) · `earlier`(먼저 일어난·나온 쪽). `value` 는 둘 다 숫자(연도면 정수).
- ★ 근소하면 버린다: `bigger` 는 비율 **1.3배 이상** · `earlier` 는 **5년 이상**(`margin` 에 비율 또는 연 차이).
- 연속 10문항으로 한 미니게임이 되므로 소재를 섞는다(나라 · 동물 · 건물 · 발명 · 작품 · 가격 …).

## 6. VERIFY 재검증 기준 (V011~)
- `image`: 그 대상이 맞는가 · 정답 글자 노출 없음 · 라이선스 칸이 사실인가(사진 게임은 공용 문서 페이지로 확인).
- `price`: 다른 판매처 1곳 이상에서 다시 열어 ±30% 안인가 · 중고/부속품 아닌가 · 정가 표기가 맞는가.
- `worldprice`: 표본 나라 10곳의 현지가·환율을 다시 열어 ±10% 안인가.
- `photo`: 사진만 보고 답이 하나인가 · 한국 표기 · 공인 여부.
- `estimate` · `which`: 값을 표준 출처로 다시 열어 ±10%(연도는 정확히) · `margin` 규칙.
- 결과는 `verify` 칸 + `data/pipeline/audit/vNNN-minigame.json`.

## 7. 적재 (R052 신설 · MAIN — 0~6절 형식은 그대로)

| 단계 | 누가 | 무엇 |
|---|---|---|
| `candidate` | GEN | 파일에 쓴다 |
| `verified` / `rejected` | VERIFY | `verify` 칸 · status |
| **적재** | MAIN(또는 G010 이 같은 스크립트로) | `node scripts/minigame-load.mjs`(dry-run) → `npm run db:backup` → `--apply` — **status `verified`(또는 이미 `loaded`) 만** DB 에 넣는다 |
| `loaded` | G010 | `node scripts/minigame-load.mjs --mark` — 적재된 항목의 파일 status 를 `loaded` 로(★ MAIN 은 파일을 쓰지 않는다) |

- 스크립트: `data/minigame/<game>/items*.json`(묶음 파일 전부) + `worldprice/products.json` 을 읽고 **형식 검사**(0~5절 — 모르는 칸 · 빠진 칸 · 숫자형 · 날짜 · id 꼴 · 게임별 규칙 · 그림 파일 이름 · 500KB)를 한 뒤 넣는다. 걸린 항목은 넣지 않고 목록으로(형식 거부). 그림 파일이 없으면 그 항목은 건너뛴다(그림 없음 목록).
- DB 표(03 · 0018): `minigame_items`(payload = 파일 항목 그대로에서 `verify` 칸만 뺀 것 · image_ids · as_of · tags) · `minigame_images`(그림 bytea — 파일 이름이 그림 id) · `minigame_products`(빅맥 계열 품목). **같은 id 는 갱신**(멱등 — 두 번 돌려도 같다). 파일에서 빠졌거나 verified 가 아니게 된 항목은 `active=false`(지우지 않는다 — 경험 기록이 남아 있다).
- 그림은 적재 뒤 **DB 가 정본**(백업 포함). 서빙 `GET /api/minigame/image/:imageId`(로그인 · 캐시).
- 출제 규칙(MAIN · 01 16-1): 얼마게요는 `priceAsOf` 가 1년 지나면 내지 않는다 · 빅맥지수는 `targetCc: "EU"` 를 내지 않고 표에는 "유로 지역" 한 줄 · 경험은 문항 `id` 로(01 12장).
- R052 첫 적재(2026-10-17 · V012 뒤): price 93 · worldprice 171 · photo 86 · estimate 96 · which 127 = **573** · 그림 447장 41.6MB · 형식 거부 0 · 그림 없음 0. candidate 63 · rejected 6 은 넣지 않았다.

