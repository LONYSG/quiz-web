// V024 — 조각별 판정자 프롬프트 생성 (파일이 지시 전체)
import fs from 'node:fs';
const RAW = 'C:/work/quiz-web/data/pipeline/audit/v024-raw';
const pieces = JSON.parse(fs.readFileSync(RAW + '/_work/pieces.json', 'utf8'));
const common = (name) => `너는 미니게임 데이터 재검증 판정자다. 이 파일이 지시 전체다. 모든 응답은 한국어.
작업 폴더 C:/work/quiz-web . 먼저 ${RAW}/RUBRIC.md 를 읽는다(판정 기준 · 보정 표본). 입력은 ${RAW}/_work/${name}.txt (항목 목록). 항목 key 순서는 ${RAW}/_work/${name}.refs.json 이다.

★ 규칙
- 쓸 수 있는 도구는 **Read(그림 파일 한 장씩 직접 열어 본다) · WebFetch(문서 열기) · Write(결과 파일 하나)** 뿐이다. WebSearch 는 어떤 페이지도 못 찾을 때만 조각 전체에서 3회까지. Bash 로 curl·node 로 문서를 열지 않는다(횟수 기록이 필요해 WebFetch 만).
- 지식(기억)으로 true 를 달지 않는다. 문서를 못 열었거나 문서에 그 값이 없으면 valueStatus "unverified" 로 적고, 틀린 증거가 없으면 verdict 는 ok 로 두되 reason 에 "unverified" 를 쓴다.
- items-3.json · photoyear/items.json · products.json · 그림 파일 · 코드는 수정하지 않는다. DB·서버 금지. 결과 파일 하나만 쓴다.
- 연 url 은 전부 항목의 urls 에 남긴다(WebFetch 로 연 것만). 다시 읽은 값은 reread 에 {url, what, value} 로.
- 한 항목 안 판정은 짧게(reason 한 줄). 429(사용량 한도)가 나면 멈추고 그때까지 결과를 파일에 쓰고 끝낸다.
- 항목마다 빠짐없이: 입력 항목 수와 같은 수 · refs.json 순서 그대로.
`;
const out = (name) => `\n★ 결과: ${RAW}/_work/${name}.out.json 에 JSON 배열로 쓴다(Write). 쓴 뒤 항목 수와 key 순서가 refs.json 과 같은지 스스로 확인하고, 마지막 답변에는 "항목 수 · ok/fix/drop 수 · 그림 문제 수 · WebFetch 횟수 · WebSearch 횟수 · 못 연 문서" 만 짧게 적는다.\n`;
const IMG = `그림 판정 값: "ok" | "wrong-target" | "text-visible" | "blur-watermark" | "multi-answer" — note 에 한 줄.`;
const body = {
  price: () => `
## 할 일 (price — 얼마게요)
항목마다:
1. 그림 파일(입력의 "그림:" 경로)을 Read 로 연다 — 그 상품이 맞는가 · 가격 숫자·할인 딱지·워터마크가 보이는가(상표 로고는 허용) · 그림의 수량(1개/세트)이 이름의 수량과 같은가. ${IMG}
2. 기록한 판매처가 아닌 **다른 판매처 1곳**의 상품 페이지를 WebFetch 로 열어 가격을 다시 읽는다(공식몰·11번가·SSG·롯데ON·네이버쇼핑·에누리·위메프 등 — 열리는 곳). 기록 가격(priceKrw)과 차이 % = (다시읽은값−기록)/기록. ±30% 안이면 통과. 새 상품인지 · 수량·용량이 이름과 같은지도 본다. 다나와 페이지를 다시 열었다면 그 판매처 목록 **첫 화면**의 최저~최고 범위도 reread 에 적는다(1.5 규칙은 첫 화면 기준).
2-1. 편의점 상품(CU · 이마트24 · GS25 · 세븐일레븐) 정가가 출처면: 세븐일레븐 ajax url 은 상품이 안 보일 수 있다 — 안 열리면 그 판매처는 unverified, 다른 판매처 정가로 닫히면 ok. 자동차는 제조사 공식 가격표가 열리면 그것, 아니면 카동·다나와 가격표.
3. 사치품(오메가 · 티파니 등)은 두 출처가 같은 회사 페이지일 수 있다 — **다른 판매처 하나 더** 열어 닫히면 ok, 안 열리면 unverified 로 적는다(reason 에 "사치품 단일 출처").
4. verdict: ok | fix(proposal 에 {priceKrw 새값, priceSources 교체 안 등 · 근거 url}) | drop(이유).
결과 항목 형식:
{"id":"price-0201","images":[{"file":"assets/minigame/price/price-0201.jpg","verdict":"ok","note":""}],"value":{"valueStatus":"confirmed|unverified|wrong","reread":[{"url":"…","what":"판매처","value":3790}],"diffPct":0.0,"newProduct":true,"note":""},"verdict":"ok|fix|drop","reason":"한 줄","proposal":null,"urls":["…"]}`,
  photo: () => `
## 할 일 (photo — 사진 이름 맞히기)
항목마다:
1. 그림(입력의 "그림:" 경로)을 Read 로 연다 — 대상이 정답과 맞는가 · 정답 글자(간판·이름표·로고·캡션·서명)가 읽히는가 · 흐림·워터마크 · 사진만 보고 비슷한 답이 둘 이상 떠오르는가(multi-answer — 그 후보를 note 에). ${IMG}
2. 위키미디어 공용 파일 페이지(원본 url 의 파일명으로 https://commons.wikimedia.org/wiki/File:<파일명>)를 WebFetch 로 열어 라이선스·저작자가 image 칸과 같은지, 자르기·고치기 표시가 필요한지 본다(\`license\`·\`attribution\` 일치 여부와 근거).
3. 한국 표기: 정답과 변형(altAnswers)이 한국에서 실제로 치는 표기인지 사전·위키(ko)·기사로 WebFetch 근거를 남긴다. 다른 이름 후보(실제로 쓰이는 한국어 이름)가 문서로 닫히면 proposal.altAnswers 로 추가 제안. 영문 원어는 넣지 않는다. 다른 물건 이름을 altAnswers 에 넣은 것은 fix(CV-59). 공인(person)이 아니면 drop 사유.
4. difficulty 1~3 을 다시 매긴다(RUBRIC). 결과 difficulty 칸에 숫자.
5. verdict: ok | fix(proposal 에 바꿀 칸 — altAnswers / answer / explanation / image 교체) | drop(사진만으로 답이 하나가 아니고 altAnswers 로도 못 받음 · 대상 다름 · 글자 노출 · 라이선스 문제).
결과 항목 형식:
{"id":"photo-0201","images":[{"file":"…","verdict":"ok","note":""}],"license":{"matches":true,"note":"공용 페이지 문장","modifiedNeedsNotice":false},"korean":{"ok":true,"note":"근거 문서","altAnswersProposal":[]},"unique":"one|several|none","difficulty":2,"verdict":"ok|fix|drop","reason":"한 줄","proposal":null,"urls":["…"]}`,
  estimate: () => `
## 할 일 (estimate — 얼마나 될까)
항목마다:
1. 그림이 있으면(입력의 "그림:" 경로) Read 로 연다 — 대상이 맞는가 · 정답 숫자·글자가 보이는가. ${IMG} (그림 없음 항목은 images: [])
2. 값(value·unit)을 표준 출처(위키·USDA·식약처·공식 통계·기관 문서) **다른 문서** 하나 이상을 WebFetch 로 열어 다시 읽는다. 차이 %. ±10% 안이면 통과. 범위로만 알려진 값은 note 에 범위가 있는지. 열량은 kJ→kcal 환산(1 kcal=4.184 kJ)을 확인. 단위 표시·질문이 대상을 명시했는지도 본다. 외화 금액이면 원화 환산 + 원래 통화 note 가 있는가.
3. verdict: ok | fix(proposal 에 {value 새값, unit, note, 근거 url}) | drop(이유 — 값이 출처마다 엇갈려 하나로 못 정함 · 곧 바뀜 등).
결과 항목 형식:
{"id":"estimate-0201","images":[{"file":"…","verdict":"ok","note":""}],"value":{"valueStatus":"confirmed|unverified|wrong","reread":[{"url":"…","what":"출처","value":6000}],"diffPct":0.0,"note":""},"verdict":"ok|fix|drop","reason":"한 줄","proposal":null,"urls":["…"]}`,
  which: () => `
## 할 일 (which — 어느 쪽?)
항목마다:
1. 그림 A·B(입력 "그림 A/B:" 경로)를 Read 로 연다 — 각 대상이 맞는가(국기라면 그 나라인가) · 정답 글자·캡션·워터마크 · 지도는 면적 단서가 되지 않는가. ${IMG}
2. 두 값(a.value · b.value)을 표준 출처 **다른 문서**로 WebFetch 해 다시 읽는다. 각각 차이 %(±10%) · 연도·asOf 정확. margin 규칙: bigger 는 큰 값/작은 값 1.3 이상(3차 생성 기준 1.45), earlier 는 5년 이상(3차 생성 기준 8년) — 다시 읽은 값으로도 만족하는가 · 정답 방향(answer)이 맞는가 · 두 대상이 같은 종류(비교 가능)인가.
2-1. **경계 근처**(bigger 1.45~1.6배 · earlier 8~10년)는 값을 **서로 다른 두 문서**로 닫는다. 문서마다 연도가 갈리는 대상(측우기 1441/1442 · 명동성당 1898 축성 등)은 어느 연도를 쓰는지 공식 문서 하나를 근거로 note 에 적고 valueStatus 를 "disputed" 로 둔다(정답 방향이 흔들리면 fix/drop).
3. verdict: ok | fix(proposal 에 {a.value·b.value·answer·margin·asOf, 근거 url}) | drop(이유).
결과 항목 형식:
{"id":"which-0301","images":[{"file":"…-a.jpg","verdict":"ok","note":""},{"file":"…-b.jpg","verdict":"ok","note":""}],"value":{"valueStatus":"confirmed|unverified|disputed|wrong","a":{"reread":123,"url":"…","diffPct":0.0},"b":{"reread":456,"url":"…","diffPct":0.0},"marginOk":true,"answerOk":true,"note":""},"verdict":"ok|fix|drop","reason":"한 줄","proposal":null,"urls":["…"]}`,
  photoyear: () => `
## 할 일 (photoyear — 이 사진 몇 년도? · 새 게임 · docs/18 §8)
RUBRIC.md 의 "★ photoyear" 절을 따른다. 항목마다:
1. 그림(입력의 "그림:" 경로)을 Read 로 연다. 판정값: "ok" | "wrong-target" | "year-text"(연도·날짜 글자가 정답 단서) | "other-year-text"(창업 연도 같은 다른 연도 글자 — ok 로 두되 note) | "blur-watermark" | "face-closeup"(얼굴이 화면 대부분인 개인 사진). note 에 한 줄.
2. sources[0].url 의 위키미디어 공용 파일 페이지를 WebFetch 로 열어 **날짜 칸 원문**을 다시 읽는다. dateBasis: "taken" | "published" | "uploaded" | "circa" | "none". yearMatch: year(circa 면 yearRange 와 year)가 그 날짜 칸의 촬영 연도와 맞는가(true/false). 촬영일이 아니라 업로드·출판·스캔 날짜를 촬영 연도로 쓴 것은 fix(circa 로 바꾸거나 근거 연도) · 근거 자체가 없으면 drop. circa 는 범위 ≤ 20년 · year 가 범위 안의 대표값인가. 날짜 칸이 여러 개면(예: "Date: 1950 (original)" · "Upload date: 2011") 촬영 쪽만 본다.
3. 라이선스·저작자가 image 칸과 같은가(license.matches) · 자르기·보정 표시가 필요한지.
4. title · place · region(kr/world)이 그림과 맞는가(titleOk). title 이 그림 속 사실과 어긋나면 fix.
5. 같은 기관 묶음(Agence Rol · Bundesarchiv · Anefo)이나 같은 행사 연속 사진이 **이 조각 안에** 보이면 overlap 에 id 를 적는다.
6. verdict: ok | fix(proposal) | drop(이유).
결과 항목 형식:
{"id":"photoyear-0001","images":[{"file":"assets/minigame/photoyear/photoyear-0001.jpg","verdict":"ok","note":""}],"date":{"raw":"파일 페이지 날짜 칸 원문","dateBasis":"taken","yearMatch":true,"shotYear":1950,"note":""},"license":{"matches":true,"note":"공용 페이지 문장","modifiedNeedsNotice":false},"titleOk":true,"overlap":[],"verdict":"ok|fix|drop","reason":"한 줄","proposal":null,"urls":["…"]}`,
};
const wp = (name) => {
  const prod = name.replace('wp-', '');
  const how = {
    iphone: `애플 나라별 스토어(입력의 출처 url — 예 https://www.apple.com/be-fr/shop/buy-iphone/iphone-17)를 WebFetch 로 다시 열어 아이폰 17 256GB(기본 모델) 가격을 다시 읽는다. 기록한 localPrice 와 ±10%. 통화 칸이 그 나라의 통화인지 확인(룩셈부르크 EUR).`,
    cocacola: `Numbeo 나라별 페이지(입력의 출처 url — https://www.numbeo.com/cost-of-living/country_result.jsp?country=<나라>)를 WebFetch 로 다시 열어 Restaurants 항목 "Soft Drink (Coca-Cola or Pepsi, 0.33 Liter Bottle)" 평균값을 다시 읽는다. 기록한 localPrice 와 ±10%. ★ 이 값은 Numbeo **사용자 입력 통계**다 — "통계 그대로인가" 만 본다(가게 판매가라 마트 정가보다 비쌈은 정상). products 의 note·sources 에 "사용자 입력 통계" 표시가 있는지 한 줄. ★ 이 행들은 asOf 가 기존 행(2026-10-18)보다 사흘 뒤(10월 21일경)다 — 같은 품목 안에서 asOf 가 둘인 점을 판정 note 에 한 줄(재독한 값이 두 시점 값과 얼마나 다른지). 불가리아 EUR(2026 유로 도입) 같은 통화 변경 나라는 통화 칸이 맞는지 본다. 사이트가 429 면 다른 표로 ±10% 를 시도하고 안 되면 unverified.`,
    gasoline: `GlobalPetrolPrices 나라별 페이지(입력의 출처 url — https://www.globalpetrolprices.com/<나라>/gasoline_prices/)를 WebFetch 로 다시 열어 "The current gasoline price in <나라> is <통화> <값> per liter" 문장의 값을 다시 읽는다. 기록한 localPrice 와 ±10%. 보조금 나라(극단값)는 다른 표(Trading Economics · 위키 "Gasoline and diesel usage and pricing" · 나라 기관)로 한 번 더. 사이트가 429 면 Trading Economics 등 다른 표로 ±10% 로 닫고 안 되면 unverified. 나라 전체 평균이라 지역 차이가 있다는 점은 note.`,
  }[prod];
  return `
## 할 일 (worldprice ${prod} — 덧붙인 나라 행 전수 · 이 조각은 나라 행이 단위다)
1. 품목 그림은 이번 대상이 아니다(images: []).
2. 나라 행마다 현지가: ${how}
3. 환율(통화마다 한 번): 입력 머리의 'fx 방식'의 값(ECB eurofxref-daily.xml: https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml)으로 1 통화당 원 값을 확인하고, ECB 밖 통화는 https://open.er-api.com/v6/latest/USD 나 https://www.floatrates.com/daily/usd.json 같은 **다른 환율 표**를 WebFetch 로 열어 ±3% 안인지 비교한다. 각 행의 krw 가 현지가 × 환율로 계산된 값과 맞는지(암시 환율 = krw/localPrice)를 본다. 통화마다 한 번만 열고 fxChecks 에 적는다.
4. verdict(행마다): ok | fix(현지가 또는 krw 새 값 + 근거 url) | drop(페이지가 없거나 값이 달라 품목에서 빼야 함).
결과 파일은 {"fxChecks":[{"currency":"EUR","rateSource":"url","impliedKrwPerUnit":1500,"refKrwPerUnit":1498,"diffPct":0.1}],"rows":[ … 행마다 … ]} 하나의 JSON 객체로 쓴다. 행 형식:
{"key":"${prod}/ID","images":[],"value":{"valueStatus":"confirmed|unverified|wrong","localPriceReread":43000,"currency":"IDR","url":"…","diffPct":0.0,"fxOk":true,"note":""},"verdict":"ok|fix|drop","reason":"한 줄","proposal":null,"urls":["…"]}`;
};
for (const name of Object.keys(pieces)) {
  const game = name.startsWith('wp-') ? 'worldprice' : name.replace(/\d+$/, '');
  const p = common(name) + (game === 'worldprice' ? wp(name) : body[game]()) + out(name);
  fs.writeFileSync(`${RAW}/_work/${name}.prompt.txt`, p);
}
// 맞혀 보기 (정답 모르는 판정자)
const gp = (g, extra) => `너는 "정답 모르는 판정자"다. 이 파일이 지시 전체다. 모든 응답은 한국어.
입력: ${RAW}/_work/guess-${g}.txt (각 줄: id | 그림 경로${g === 'photoyear' ? ' | cues(연도 숫자는 가렸다)' : ''}). 순서: ${RAW}/_work/guess-${g}.refs.json .
★ 규칙: 쓸 수 있는 도구는 Read(그림 한 장씩) · Write(결과 파일 하나) 뿐이다. 웹·다른 파일(items*.json · 정답 · 해설 · title · 이름이 든 파일 · audit 폴더 다른 파일)을 **열지 않는다** — 정답을 모르는 상태로 보는 것이 목적이다. 기억(지식)은 써도 된다 — 보통 한국 성인이 아는 정도로 추측한다.
${extra}
결과: ${RAW}/_work/guess-${g}.out.json 에 JSON 배열(입력 순서)을 Write 로 쓴다. 쓴 뒤 항목 수와 순서를 확인하고, 마지막 답변에는 항목 수와 확신도별 수만 적는다.\n`;
fs.writeFileSync(`${RAW}/_work/guess-photo.prompt.txt`, gp('photo', `항목마다: 그림을 Read 로 열고, 한국 성인이 이 사진 한 장만 보고 **한국어로 가장 먼저 떠올릴 이름 하나**(guess)와 확신도(confident|maybe|unknown), 헷갈릴 만한 다른 후보 이름들(alternatives — 있으면)을 적는다. 사진에 읽히는 글자가 있으면 note 에.\n형식: {"id":"photo-0201","guess":"병따개","confidence":"confident","alternatives":["코르크 따개"],"note":""}`));
fs.writeFileSync(`${RAW}/_work/guess-photoyear.prompt.txt`, gp('photoyear', `항목마다: 그림을 Read 로 열고 cues 를 보고, 이 사진이 **몇 년도에 찍혔는지** 정수 하나(guessYear)를 추정한다. 옷 · 차 · 간판 · 건물 · 화질 · 색감 · 도시 모습으로 판단한다. 확신도(confident|maybe|unknown)와 어림 범위(low~high), 사진 속에 읽히는 연도·날짜 글자가 있으면 note 에(있으면 그것도 단서로 쓰되 note 에 "연도 글자 보임"). 어느 나라·도시로 보는지(place)도 한 줄.\n형식: {"id":"photoyear-0001","guessYear":1952,"low":1948,"high":1956,"confidence":"maybe","place":"서울","note":""}`));
console.log(Object.keys(pieces).length, 'prompts + 2 guess');
