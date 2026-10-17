// V012 — 조각별 판정자 프롬프트 생성 (파일이 지시 전체)
import fs from 'node:fs';
const RAW = 'C:/work/quiz-web/data/pipeline/audit/v012-raw';
const pieces = JSON.parse(fs.readFileSync(RAW + '/_work/pieces.json', 'utf8'));
const common = (name, game) => `너는 미니게임 데이터 재검증 판정자다. 이 파일이 지시 전체다.
작업 폴더 C:/work/quiz-web . 먼저 ${RAW}/RUBRIC.md 를 읽는다(판정 기준 · 보정 표본 6건). 입력은 ${RAW}/_work/${name}.txt (항목 목록). 항목 key 순서는 ${RAW}/_work/${name}.refs.json 이다.

★ 규칙
- 쓸 수 있는 도구는 **Read(그림 파일 한 장씩 직접 열어 본다) · WebFetch(문서 열기) · Write(결과 파일 하나)** 뿐이다. WebSearch 는 어떤 페이지도 못 찾을 때만 조각 전체에서 3회까지. Bash 로 curl·node 로 문서를 열지 않는다(횟수 기록이 필요해 WebFetch 만).
- 지식(기억)으로 true 를 달지 않는다. 문서를 못 열었거나 문서에 그 값이 없으면 valueStatus "unverified" 로 적고, 틀린 증거가 없으면 verdict 는 ok 로 두되 reason 에 "unverified" 를 쓴다.
- items.json · products.json · 그림 파일 · 코드는 수정하지 않는다. DB·서버 금지. 결과 파일 하나만 쓴다.
- 연 url 은 전부 항목의 urls 에 남긴다(WebFetch 로 연 것만). 다시 읽은 값은 reread 에 {url, what, value} 로.
- 한 항목 안 판정은 짧게(reason 한 줄). 429(사용량 한도)가 나면 멈추고 그때까지 결과를 파일에 쓰고 끝낸다.
- 항목마다 빠짐없이: 입력 항목 수와 같은 수 · refs.json 순서 그대로.
`;
const out = (name) => `\n★ 결과: ${RAW}/_work/${name}.out.json 에 JSON 배열로 쓴다(Write). 쓴 뒤 항목 수와 key 순서가 refs.json 과 같은지 스스로 확인하고, 마지막 답변에는 "항목 수 · ok/fix/drop 수 · 그림 문제 수 · WebFetch 횟수 · WebSearch 횟수 · 못 연 문서" 만 짧게 적는다.\n`;
const IMG = `그림 판정 값: "ok" | "wrong-target" | "text-visible" | "blur-watermark" | "multi-answer" — note 에 한 줄.`;
const body = {
  price: (n) => `
## 할 일 (price — 얼마게요)
항목마다:
1. 그림 파일(입력의 "그림:" 경로)을 Read 로 연다 — 그 상품이 맞는가 · 가격 숫자·할인 딱지·워터마크가 보이는가(상표 로고는 허용). ${IMG}
2. 기록한 판매처가 아닌 **다른 판매처 1곳**의 상품 페이지를 WebFetch 로 열어 가격을 다시 읽는다(공식몰·11번가·SSG·롯데ON·네이버쇼핑·에누리·위메프 등 — 열리는 곳). 기록 가격(priceKrw)과 차이 % = (다시읽은값−기록)/기록. ±30% 안이면 통과. 새 상품인지 · 수량·용량이 이름과 같은지도 본다. 다나와 페이지를 다시 열었다면 그 판매처 목록 범위도 reread 에 적는다.
3. 사치품·자동차는 더 깊게: 사치품은 정가(공식몰/매장 가격)를 열어 병행수입 시세와 1.5 안인지, 자동차는 공식 가격표/기아·현대·벤츠 사이트로.
4. verdict: ok | fix(proposal 에 {priceKrw 새값, priceSources 교체 안 등 · 근거 url}) | drop(이유).
결과 항목 형식:
{"id":"price-0001","images":[{"file":"assets/minigame/price/price-0001.jpg","verdict":"ok","note":""}],"value":{"valueStatus":"confirmed|unverified|wrong","reread":[{"url":"…","what":"판매처","value":3790}],"diffPct":0.0,"newProduct":true,"note":""},"verdict":"ok|fix|drop","reason":"한 줄","proposal":null,"urls":["…"]}`,
  photo: () => `
## 할 일 (photo — 사진 이름 맞히기)
항목마다:
1. 그림(입력의 "그림:" 경로)을 Read 로 연다 — 대상이 정답과 맞는가 · 정답 글자(간판·이름표·로고·캡션·서명)가 읽히는가 · 흐림·워터마크 · 사진만 보고 비슷한 답이 둘 이상 떠오르는가(multi-answer — 그 후보를 note 에). ${IMG}
2. 위키미디어 공용 파일 페이지(원본 url 의 파일명으로 https://commons.wikimedia.org/wiki/File:<파일명>)를 WebFetch 로 열어 라이선스·저작자가 image 칸과 같은지, 자르기·고치기 표시가 필요한지 본다(\`license\`·\`attribution\` 일치 여부와 근거).
3. 한국 표기: 정답과 변형(altAnswers)이 한국에서 실제로 치는 표기인지 사전·위키(ko)·기사로 WebFetch 근거를 남긴다. 다른 이름 후보(실제로 쓰이는 한국어 이름)가 문서로 닫히면 proposal.altAnswers 로 추가 제안. 영문 원어는 넣지 않는다. 공인(person)이 아니면 drop 사유.
4. difficulty 1~3 을 다시 매긴다(RUBRIC). 결과 difficulty 칸에 숫자.
5. verdict: ok | fix(proposal 에 바꿀 칸 — altAnswers / answer / explanation / image 교체) | drop(사진만으로 답이 하나가 아니고 altAnswers 로도 못 받음 · 대상 다름 · 글자 노출 · 라이선스 문제).
결과 항목 형식:
{"id":"photo-0001","images":[{"file":"…","verdict":"ok","note":""}],"license":{"matches":true,"note":"공용 페이지 문장","modifiedNeedsNotice":false},"korean":{"ok":true,"note":"근거 문서","altAnswersProposal":[]},"unique":"one|several|none","difficulty":2,"verdict":"ok|fix|drop","reason":"한 줄","proposal":null,"urls":["…"]}`,
  estimate: () => `
## 할 일 (estimate — 얼마나 될까)
항목마다:
1. 그림이 있으면(입력의 "그림:" 경로) Read 로 연다 — 대상이 맞는가 · 정답 숫자·글자가 보이는가. ${IMG} (그림 없음 항목은 images: [])
2. 값(value·unit)을 표준 출처(위키·USDA·식약처·공식 통계·기관 문서) **다른 문서** 하나 이상을 WebFetch 로 열어 다시 읽는다. 차이 %. ±10% 안이면 통과. 범위로만 알려진 값은 note 에 범위가 있는지. 열량은 kJ→kcal 환산(1 kcal=4.184 kJ)을 확인. 단위 표시·질문이 대상을 명시했는지(3-1)도 본다.
3. verdict: ok | fix(proposal 에 {value 새값, unit, note, 근거 url}) | drop(이유 — 값이 출처마다 엇갈려 하나로 못 정함 · 곧 바뀜 등).
결과 항목 형식:
{"id":"estimate-0001","images":[{"file":"…","verdict":"ok","note":""}],"value":{"valueStatus":"confirmed|unverified|wrong","reread":[{"url":"…","what":"출처","value":6000}],"diffPct":0.0,"note":""},"verdict":"ok|fix|drop","reason":"한 줄","proposal":null,"urls":["…"]}`,
  which: () => `
## 할 일 (which — 어느 쪽?)
항목마다:
1. 그림 A·B(입력 "그림 A/B:" 경로)를 Read 로 연다 — 각 대상이 맞는가(국기라면 그 나라인가) · 정답 글자·캡션·워터마크 · 지도는 면적 단서가 되지 않는가. ${IMG}
2. 두 값(a.value · b.value)을 표준 출처 **다른 문서**로 WebFetch 해 다시 읽는다. 각각 차이 %(±10%) · 연도·asOf 정확. margin 규칙: bigger 는 큰 값/작은 값 1.3 이상, earlier 는 5년 이상 — 다시 읽은 값으로도 만족하는가 · 정답 방향(answer)이 맞는가 · 두 대상이 같은 종류(비교 가능)인가.
3. verdict: ok | fix(proposal 에 {a.value·b.value·answer·margin·asOf, 근거 url}) | drop(이유).
결과 항목 형식:
{"id":"which-0001","images":[{"file":"…-a.jpg","verdict":"ok","note":""},{"file":"…-b.jpg","verdict":"ok","note":""}],"value":{"valueStatus":"confirmed|unverified|wrong","a":{"reread":123,"url":"…","diffPct":0.0},"b":{"reread":456,"url":"…","diffPct":0.0},"marginOk":true,"answerOk":true,"note":""},"verdict":"ok|fix|drop","reason":"한 줄","proposal":null,"urls":["…"]}`,
};
const wp = (name) => {
  const prod = name.replace('wp-', '').replace(/\d+$/, '');
  const how = { bigmac: `이코노미스트 빅맥지수 원자료(https://raw.githubusercontent.com/TheEconomist/big-mac-data/master/output-data/big-mac-full-index.csv)를 WebFetch 로 다시 열어 각 나라의 local_price·currency 를 다시 읽는다(정확히 일치해야 한다). 그리고 극단값(환산 후 2달러 미만 또는 7달러 초과로 보이는 나라)은 다른 문서(위키 Big Mac Index · 현지 맥도날드 메뉴 · Numbeo)로 ±10% 안인지 본다. EU 행(유로 지역 한 줄)은 값만 본다.`, iphone: `애플 나라별 스토어 페이지(예: https://www.apple.com/<국가경로>/shop/buy-iphone/iphone-17 — 입력의 출처 url 을 쓴다)를 WebFetch 로 다시 열어 iPhone 17 256GB 의 가격을 다시 읽는다. 미국·캐나다처럼 세전 표기인 나라는 note 에. 기록한 localPrice 와 ±10%.`, netflix: `넷플릭스 헬프 페이지(입력의 출처 url)를 WebFetch 로 다시 열어 나라별 표준(Standard) 요금을 다시 읽는다. 기록한 localPrice 와 ±10%. 광고 요금제·프리미엄과 혼동하지 않았는지.` }[prod];
  return `
## 할 일 (worldprice ${prod} — 나라 행 전수 · 이 조각은 나라 행이 단위다)
1. 품목 그림(입력 머리의 "품목 그림:" 경로)을 Read 로 한 번 연다 — ${IMG} (그림은 이 조각 첫 항목의 images 에 적는다 · 나머지 항목은 images: [])
2. 나라 행마다 현지가: ${how}
3. 환율(통화마다 한 번): 입력 머리의 'fx 방식'의 값(ECB eurofxref-daily.xml: https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml · 2026-10-16)으로 1 통화당 원 값을 확인하고, ECB 밖 통화는 https://open.er-api.com/v6/latest/USD 나 https://www.floatrates.com/daily/usd.json 같은 **다른 환율 표**를 WebFetch 로 열어 ±3% 안인지 비교한다. 각 행의 krw 가 현지가 × 환율로 계산된 값과 맞는지(암시 환율 = krw/localPrice)를 본다. 통화마다 한 번만 열고 fxChecks 에 적는다.
4. verdict(행마다): ok | fix(현지가 또는 krw 새 값 + 근거 url) | drop(페이지가 없거나 값이 달라 품목에서 빼야 함).
결과 파일은 {"fxChecks":[{"currency":"IDR","rateSource":"url","impliedKrwPerUnit":0.074,"refKrwPerUnit":0.073,"diffPct":1.2}],"rows":[ … 행마다 … ]} 하나의 JSON 객체로 쓴다. 행 형식:
{"key":"${prod}/ID","images":[],"value":{"valueStatus":"confirmed|unverified|wrong","localPriceReread":43000,"currency":"IDR","url":"…","diffPct":0.0,"fxOk":true,"note":""},"verdict":"ok|fix|drop","reason":"한 줄","proposal":null,"urls":["…"]}`;
};
for (const name of Object.keys(pieces)) {
  const game = name.startsWith('wp-') ? 'worldprice' : name.replace(/\d+$/, '');
  const p = common(name, game) + (game === 'worldprice' ? wp(name) : body[game](name)) + out(name);
  fs.writeFileSync(`${RAW}/_work/${name}.prompt.txt`, p);
}
console.log(Object.keys(pieces).length, 'prompts');
