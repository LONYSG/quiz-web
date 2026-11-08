# 18. 미니게임 데이터 형식 (GEN 이 만들고 · VERIFY 가 재검증하고 · MAIN 이 적재·출제)

> 설계 에이전트 2026-10-17 신설. 퀴즈류 미니게임(docs/17 1-1 🟡🧠) 다섯 개의 **파일 형식**이다. GEN(G008~)은 이 형식으로 파일을 만들고, VERIFY(V011~)는 `verify` 칸을 채우며, MAIN(R052~)은 이 형식을 읽는 적재 스크립트와 DB 표를 만든다. 세 세션이 서로 기다리지 않도록 **파일이 정본**이고 DB 적재는 그 뒤다(G009).
> 형식을 바꾸려면 이 문서를 먼저 고치고 `version` 을 올린다. 라운드 안에서 임의로 칸을 더하지 않는다(모르는 칸은 적재 스크립트가 거부한다).

## 0. 공통

```
data/minigame/<game>/items.json        ← 정본 (git 에 있다) · 2차부터는 items-2.json · items-3.json … (묶음 파일 — 같은 형식 · id 는 이어서 · 읽는 쪽은 items*.json 전부)
data/minigame/worldprice/products.json ← 빅맥 계열만 (아래 2)
assets/minigame/<game>/<id>.<jpg|png|webp>  ← 그림 (git 에 없다 — .gitignore `assets/minigame/*/` · README 만 커밋)
```

- `<game>` = `price` · `worldprice` · `photo` · `estimate` · `which` · `photoyear`(G018 신설 — §8).
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
- G016 재적재(2026-10-20 · V012 fix 63 · V017 fix 29 반영 뒤): price 197 · worldprice 254 · photo 219 · estimate 199 · which 295 = **1,164 loaded**(파일 status 도 `--mark` 로 loaded) · 그림 1,002장 91.2MB · 품목 5 · 형식 거부 0 · 그림 없음 0 · rejected 11 은 넣지 않았다. 다시 돌려도 같다(멱등).
- 재적재 규칙(G016): 파일(값 · 그림)을 고치면 같은 스크립트를 다시 돌린다 — 같은 항목 id · 같은 그림 id 는 갱신(payload · bytea · 크기), loaded 도 다시 넣고, verified/loaded 가 아니게 된 항목은 active=false. 그림을 바꿀 때는 파일 이름(= 그림 id)을 그대로 두고 image 칸의 크기 · 출처 · 라이선스 · attribution 을 파일에 맞춘다. 다음 묶음은 `items-3.json`.
- G018 3차(2026-10-21 · 적재 전 — V023 뒤): `items-3.json`(price · photo · estimate · which · worldprice 덧붙인 나라 문항) + 새 게임 `photoyear/items.json` · 수량은 ai-out/G018.txt 0절. worldprice 기존 품목의 나라 보충은 products.json 의 그 품목 rows **끝에 덧붙이기만**(기존 행 · 다른 칸은 글자 그대로 — `g008-build --round g018` 이 바뀌면 멈춘다) · 환율은 그 품목의 fxAsOf 하루치. ★ `minigame-load.mjs` 의 게임 목록에 photoyear 가 아직 없다(적재 · 출제는 MAIN — R058 뒤).
- **G021 3차 적재(2026-10-25 · V024 뒤 — DG-058)**: V024 fix 22(`scripts/g021-apply-v024.mjs` · 멱등) · 그림 교체 6(`g021-images.mjs` — 새 그림은 값이 ok 라 verified 로 넣고 V027 이 다시 본다 · `audit/g021-images.json`) → `minigame-load --game price,worldprice,photo,estimate,which --apply` — 넣음 1,673 · 쉬게 함 0 · 활성 price 297 · worldprice 323 · photo 339 · estimate 299 · which 415 · 그림 1,529장 138.2MB · 품목 5(나라 행은 products.json 품목째 들어간다) · `--mark` 3차 509 loaded(★ --mark 는 이제 1칸 들여쓰기). ★ as_of(수집 기준 날짜 — 화면에 계속 보인다 · MAIN R067): price = priceAsOf · worldprice = **품목** asOf(minigame_products.as_of — 항목 행의 as_of 는 비어 있다) · estimate · which = asOf(없는 것은 시간 무관 사실 — "지금 상태" 를 묻는 항목은 asOf 를 꼭 채운다 · `scripts/g021-asof.mjs` 가 센다).

## 8. `photoyear` — 이 사진 몇 년도? (G018 신설 · DG-056 — 데이터가 먼저, 게임은 MAIN R058 뒤)

```json
{ "id": "photoyear-0001", "status": "candidate", "createdRound": "G018",
  "year": 1988, "yearKind": "exact", "yearRange": null,
  "title": "1988년 서울 올림픽 개막식 성화 점화", "place": "서울", "region": "kr", "difficulty": 2,
  "cues": "연도를 짐작할 단서 요지 (옷 · 차 · 간판 · 화질 — 한 줄)",
  "sources": [{ "url": "https://commons.wikimedia.org/wiki/File:…", "note": "Date: 1988-09-17 (파일 페이지 날짜 칸 원문)", "fetchedAt": "2026-10-21" }],
  "image": { … }, "tags": ["행사", "1980년대"], "verify": null }
```
- `year` = 파일 페이지(또는 소장 기관 기록)의 **촬영 연도** 정수 — 업로드 · 스캔 날짜가 아니다. 촬영일이 대략(circa · "1970년대")이면 `yearKind: "circa"` + `yearRange: [시작, 끝]`(폭 20년 이하 · year 는 그 안의 대표 값) · 정확하면 `yearKind: "exact"` · `yearRange: null`.
- `title` 공개 뒤 보여 줄 한 줄(연도 포함 가능) · `place` 도시 · 나라 · `region` `kr` | `world` · `difficulty` 1~3(GEN 추정 — 정답 모르는 맞혀 보기의 오차로 근거) · `cues` 짐작 단서 요지 한 줄.
- 그림 필수 · **자유 라이선스만**(위키미디어 공용 — photo 와 같다) · ★ **그림 안에 연도 · 날짜 · 캡션 글자가 보이면 안 된다**(현수막 연도 · 신문 날짜 · 사진 귀퉁이 날짜 · 워터마크 — 잘라 내고 attribution 에 "(cropped)"). 간판 · 상표 글자는 연도가 아니면 괜찮다.
- 소재 균형(1차): 한국 50 · 세계 50 · 연대를 고르게 · 유명 사건 사진은 한국 30% 이내 · 세계의 연도가 자명한 상징 사건은 10 이내 · 난이도 1 은 30% 이내. 같은 사진 · 같은 행사 연속 사진 금지(g008-check 가 같은 sourceUrl · 같은 title 을 막는다).
- ★ G021(2026-10-25): 데이터 100 verified(V024 ok 94 · fix 5 반영 · drop 1 → 0012 를 1967 부산항 사진으로 교체 — V027 재검증) · **게임 코드가 아직 없다**(shared MINIGAME_KEYS · server defs · 클라이언트) → 적재하지 않았다. `minigame-load --game photoyear` 는 형식 검사만(100 통과) · --apply 거부 · GAMES_ALL 밖 — MAIN R068 이 게임(사진 보고 연도 맞히기 · 오차 점수)을 만든 뒤 GAMES_ALL 에 넣고 적재한다. as_of 는 null(year 는 정답이지 수집 날짜가 아니다). difficulty 는 GEN 값 그대로(CV-73 (a) — 실플레이 오차로 보정).
- 판정(MAIN): 오차 |입력 − year| 작은 순 · circa 는 yearRange 안이면 오차 0. VERIFY(6절에 더해): 촬영 연도 근거(파일 페이지 · 기관 기록) · 그림의 연도 글자 · 라이선스.

---

## 9. 주제 세트 `topics` — 여러 미니게임이 나눠 쓰는 공용 데이터 (설계 2026-11-08 신설 · D-330 · 수집은 GEN G036 · 대조는 VERIFY V039 · 적재·게임은 MAIN R080~)

찬종(2026-11-08): "특정 주제에 관해 관련 정답을 최대한 많이 말하는 사람이 이기는 것 … 페이지 하나에 모여 있는 주제를 잘 선정해 수집 … 나중에 라이어 게임 키워드로도 재활용" · 2차 답 ⑸ "항목 하나에 태그 여러 개 — 게임은 태그로 골라 쓰고 경험 기록을 같이 써서 한 판에 같은 항목이 두 게임에 연속으로 안 나오게".

```
data/minigame/topics/<slug>.json        ← 주제 하나 = 파일 하나 (git 에 있다 · 그림 없음)
```

- **쓰는 게임**: 많이 말하기(D-330 ⑺ · `kind: closed` 만) · 빙고 · 겹치면 무효 · 라이어 게임(`liar` 태그 항목) · 캐치마인드(`draw` 태그 항목) · "친구들이 가장 많이 말한 답은?"(플레이 누적 — 뒤). 한 세트를 여러 게임이 읽는다 — 게임마다 따로 수집하지 않는다.
- **kind**: `closed` = 공식 목록이 한 페이지에 있고 50~250 항목 · 일반인이 20개쯤 떠올릴 수 있고 · 표기 변형을 닫을 수 있는 것(나라 193 · 원소 118 · 롤 챔피언 · 조선 왕 27 …) — 많이 말하기 · 빙고 · 겹치면 무효에 쓴다. `open` = "모두가 아는 구체 명사"(음식 · 동물 · 직업 · 장소 · 악기 · 스포츠 종목) — **라이어 · 캐치마인드 제시어 전용**(많이 말하기에는 절대 쓰지 않는다 — "이건 왜 정답 아니야" 를 닫을 수 없다).
- **파일 머리**: `{ "topic": "<slug>", "nameKo": "나라 이름", "kind": "closed"|"open", "version": 1, "asOf": "YYYY-MM-DD", "createdRound": "G036", "status": "candidate"|"verified"|"rejected"|"loaded", "source": [{ "url", "note", "fetchedAt" }], "liar": true|false, "draw": true|false, "timeSec": 30, "tags": ["지리", …], "count": n, "items": [ … ], "verify": null }`. `source` 는 **한 페이지**(공식 목록 · 나무위키 표 · ko.wikipedia · Wikidata SPARQL · 공식 API — Data Dragon · PokeAPI) · 둘째 출처는 VERIFY 가 대조 때 `verify.checked` 에 적는다.
- **항목 칸**:
  | 칸 | 뜻 |
  |---|---|
  | `id` | `<slug>-NNN`(0 채움 3자리) · 영구 · 경험 기록은 이 id |
  | `name` | 한국 표기 정본(판정의 기준 · 결과 목록에 보이는 이름) |
  | `label` | (선택 · 설계 2026-11-08 — G036 7절 ②) 화면용 짧은 이름 — 묶은 항목("달러(미국 · 캐나다 · …)")처럼 `name` 이 길 때만 · 없으면 `name` 을 보인다 · 판정에는 안 쓴다 |
  | `variants` | 받는 표기 — 15 §2 그대로(한국에서 실제로 치는 영문 · 한글 음차 · 약칭 · 옛 이름). 판정은 퀴즈와 같은 `normalizeAnswer` · `answerFlex` |
  | `tags` | 자유 태그 `[]`(하위 분류 · 세대 · 대륙 · 연도 등 — 빙고·겹치면 무효가 부분 집합을 고를 때 씀) |
  | `year` | 연도 하나(있을 때만 — "순서대로" 글 카드용 · 정수) |
  | `draw` | 그림으로 그려 맞힐 수 있는 구체 사물인가(캐치마인드 제시어) |
  | `liar` | 라이어 제시어로 좋은가(모두가 알고 · 한마디씩 설명할 거리가 있는 것) |
  | `qid` | 같은 이름의 **활성 퀴즈 대표 정답** 문항 id(정규화 일치로 기계 매핑 · 없으면 null — 찬종 ⑷ "퀴즈 정답 재사용") |
  | `note` | 짧은 메모(있을 때만 · 예 "환승역 — 2·4호선") |
- **유일성(세트 안)**: 두 항목의 `name` 정규화값이 같으면 안 된다(조지아 나라/주 → 한 세트에 하나만) · 한 항목의 변형이 다른 항목의 `name`·변형과 겹치면 안 된다(겹치면 둘 다 flag → GEN 이 하나를 뺀다). 검사 스크립트 `scripts/topics-check.mjs`(G036 이 만든다 — 형식 · 유일성 · 수 · 머리 칸).
- **변형 게이트**: 퀴즈 적재 게이트(라틴 · 특수문자 거부)는 **사람·작품 이름의 영문 표기**에 한해 푼다(롤 챔피언 "Ahri" · 포켓몬 "Pikachu" 처럼 실제로 치는 표기 — 많이 말하기 입력칸은 퀴즈와 같다). 번역어 · 일반어 · 설명 꼴은 안 받는다(15 §2).
- **수 규칙**: closed 는 공식 목록 **전부**(빼지 않는다 — 193 이면 193) · open 은 60~120 · 둘 다 `count` 와 `items.length` 가 같아야 한다.
- **상태 흐름**(설계 2026-11-08 고침): 파일 `status` 는 `candidate`(GEN) → `verified` / `rejected`(VERIFY — 출처 페이지 전수 대조 · 빠짐 · 더함 · 표기 · 변형 · 태그 → `verify` 칸 `{round, checkedAt, sources[{url, read, count}], missing, extra, rename, variantNotes, tagNotes, fixes, verdict, why}` · 고칠 것이 있으면 `candidate` 그대로 + `verify.fixes`(G 라운드가 그대로 적용) · **fixes 3건 이하면 verified 로 두고 fixes 도 적는다**) → **적재는 DB 기록**(`topic_sets.loaded_at` — 파일 status 는 `loaded` 로 바꾸지 않는다 · 적재 스크립트가 파일을 쓰지 않는다 — 플레이 트리에서 돌기 때문). 적재 = `scripts/topics-load.mjs`(R080 · `verified` 만 · candidate 는 검사 DB 에서만 `--allow-candidate`) · **ops 메뉴 1 이 migrate 뒤 자동으로 돌린다** → 찬종은 따로 할 일 없음.
- **`source[].read`**(설계 2026-11-08 — G036 7절 ①): 그 출처 페이지를 실제로 받아 대조했으면 `true` · 지식으로 썼으면 `false`(G036 은 note 머리 "★ 지식으로 작성" 으로 표시했다 — VERIFY 가 `verify.sources[].read` 에 적는다). **read true 인 출처로 대조한 세트만 verified**.
- **게임별 최소 수 `minItems`**(설계 2026-11-08 — G036 7절 ③): 많이 말하기 · 겹치면 무효 = **20 이상**(대통령 14 · KBO 12 · 월드컵 개최국 19 는 라이어 · 순서대로용으로만) · 빙고 = 40 이상 · 라이어 · 캐치마인드는 태그 항목 수 10 이상. 코드가 세트를 고를 때 거른다(수집 기준 50~250 은 그대로 — "공식 목록 전부").
- 고시가 해마다 바뀌는 세트(국가하천 · 100대 명산 · 시군구)는 `asOf` 를 **고시일**로(G036 7절 ④) · 바뀌면 version +1.
- **적재(R080 · 0031 · D-337)**: `topic_sets`(머리 + loaded_at · active) · `topic_items`(id · topic · seq · name · label · variants · tags · year · draw · liar · qid · note · active). `npm run topics:load`(dry-run) · `--apply` — 파일 status **verified(옛 loaded)** 만 · topics-check 의 `checkTopic` 막힘이 있으면 그 세트는 통째로 안 넣음(label 칸은 받는다) · 같은 id 갱신 · 빠졌거나 verified 가 아니게 된 세트 · 항목은 active=false · 파일은 안 쓴다. `--allow-candidate` 는 quizweb_test · quizweb_dev(또는 QUIZ_DEV_SERVER)에서만(실 quizweb 은 거부 · exit 2). 메뉴 1 이 자동으로 돌린다(11). 경험 기록 = `minigame_item_experiences.item_key 'topic:<slug>'`(세트 단위). 게임 쪽 최소 수: 많이 말하기 · 겹치면 무효 = closed · 항목 20 이상.
- **2차 주제 후보**(G036 ② · 설계 보류 — 찬종이 고르면 GEN 라운드): 광역자치단체(통합특별시 반영) · 미국 50개 주 · 하계 올림픽 개최 도시 · 한국 유네스코 세계유산 · 한글 자음·모음 이름.
- 1차 주제(G036 · 설계 지정): closed 23 = 나라 · 세계 수도 · 대한민국 시·군·구 · 서울 25 구 · 조선 왕 · 화학 원소 · 별자리 88 · 하계 올림픽 정식 종목 · 롤 챔피언 · 포켓몬 1세대 · 지브리 장편 · MCU 영화 · 디즈니 장편 애니 · KBO 구단(역대) · K리그 구단 · 프리미어리그 역대 구단 · 월드컵 개최국 · 성경 66권 · 태양계 행성·주요 위성 · 역대 대통령 · ★ 찬종 3(서울 지하철 1~9호선 역 · 세계 통화 단위 · 100대 명산 + 국가하천). open 6 = 음식 · 동물 · 직업 · 장소 · 악기 · 스포츠 종목.
- ★ **설계 2026-11-08 (7) — V039 · R080 뒤 고침**(13 CV-164 · CV-165 결정 · G039 가 적용 · V040 이 재대조):
  - **verified 전환 규칙**: VERIFY 가 `verify.fixes` 로 적은 것을 **G 라운드가 기계로 그대로 적용한 세트는 그 G 라운드가 `status` 를 verified 로 바꾼다**(`verify.appliedRound` 에 라운드 · fixes 는 지우지 않고 `applied` 표시). 범위 · 출처가 바뀐 세트(태양계 G039)는 candidate 그대로 → 다음 VERIFY 가 전수 재대조.
  - **라틴 변형 예외 — 원소 기호**(CV-165 ①): 사람·작품 이름에 더해 **원소 기호 2글자 이상**(Li · Na · Fe …)을 받는다(실제로 치는 표기). **영어 이름(Lithium)과 1글자 기호(H · K · O …)는 안 받는다**(1글자 입력은 실수와 구분 못 함).
  - **정본 표기 = 한국에서 더 쓰는 표기**(CV-165 ⑥): 원소는 나트륨 · 칼륨 · 티타늄 · 게르마늄을 `name` 으로, IUPAC 한글(소듐 · 포타슘 · 타이타늄 · 저마늄)은 변형으로. 결과 목록("못 말한 것")에 보이는 이름이 낯설지 않아야 한다.
  - **`label`**(CV-165 ②): name 에 괄호 묶음이 있거나 20자를 넘으면 반드시 둔다(통화 "달러(미국 · 캐나다 · …)" → "달러"). `topics-check` 가 받는다(G039).
  - **open 세트 태그**(CV-165 ③): 1차 open 6 은 liar 가 전부 true 라 변별력이 없다 — 태그 기준 재정의는 **라이어 · 캐치마인드 라운드(R082) 전 G 라운드**에서(제시어 품질 기준과 함께). 지금은 V039 가 집어낸 것만(악기 liar false 6 · 상하위 · 1글자 동음이의 제거).
  - **태양계**(CV-165 ④): "주요 위성" 은 닫히지 않으므로 범위를 **행성 8 + 왜행성 5 + 중력적으로 둥근 위성**(ko.wikipedia "중력적으로 둥근 천체 목록" 한 페이지)으로 바꾼다 · nameKo "태양계 행성 · 왜행성 · 둥근 위성".
  - **옛 이름 변형 금지**: 네피도의 "양곤" 처럼 **지금은 답이 아닌 옛 답**은 변형으로 받지 않는다(CV-165 ⑤) — 수도 · 구단 이름 · 행정구역에 같은 규칙.
  - **`year` 의 쓰임(R081 순서대로)**: 세트마다 뜻이 하나여야 한다(조선 왕 즉위 · 대통령 취임 · 영화 개봉 · 월드컵 개최 · KBO 창단 · 원소 발견). 순서대로는 closed · year 가 서로 다른 항목 ≥ 8 인 세트에서 5 장을 뽑는다 · **원소(발견년)는 코드 제외 목록**(상식 밖 — 뒤에 세트 머리 칸 `order: false` 로 옮길 수 있음). 빙고는 closed · 항목 ≥ 40(minItems 그대로).
  - 2026-11-08 파일 실측 — year 있는 항목: 디즈니 64 · 원소 101 · 지브리 22 · 조선 왕 27 · KBO 12 · 대통령 14 · MCU 38 · 올림픽 4 · 월드컵 개최국 19 · 나머지 0. label 0(G039 가 넣는다).
- ★ G036 실측(2026-11-08): 30 세트(100대 명산 · 국가하천을 둘로) · 항목 2,548 · topics-check 막힘 0 · qid 393 · 영문 변형 700(원소 · 롤 · 포켓몬 · 영화) · 겹치는 이름은 "부산 중구 · 포천 백운산" 꼴(짧은 꼴은 변형에도 없음) · **통화는 같은 단위 이름을 한 항목으로**("달러(미국 · 캐나다 · …)" + 변형 "미국 달러" …) · 대부분 세트가 조각 지식 작성이라 V039 대조 전 candidate · 국가하천 86/89.
- ★ G039 실측(2026-11-08): V039 fixes 57 적용 · 국가하천 5 건너뜀(2024 고시 신규 16 에 없음) · verified 21 → 28 · 항목 2,551 · label 19 · 원소 라틴 변형 239 → 105 · 태양계 32(행성 8 · 왜행성 5 · 둥근 위성 19 — en 위키 · candidate) · id = 마지막 번호 + 1(topics-check 가 "번호가 늘어남" 으로 봄) · ai-out/G039.txt
