#!/usr/bin/env node
// =============================================================================
// G016 A — 미니게임 1차(items.json) V012 fix 63 반영 (docs/18 · ai-out/V012.txt 3절 · audit/v012-minigame.json)
//   node scripts/g016-apply-v012.mjs            ← dry-run
//   node scripts/g016-apply-v012.mjs --apply    ← items.json 쓰기 + audit/g016-fixes.json parts.v012
//   take: proposal(제안 그대로) · modified(고쳐 받음) · image(그림 교체 · 자름) · rejected
//   ★ 그림 파일은 먼저 바꿔 둔다(scripts/g016-crop.mjs · scripts/g008-img.mjs) — 여기서는 칸만 맞춘다(크기는 파일에서 읽음)
//   ★ CV-49 기준(13 · 설계 2026-10-19): 변형 제거 제안은 표준국어대사전 · ko 위키 문서명/넘겨주기 · 언론 기사 중 하나라도 있으면 유지
// =============================================================================
import { run } from './g016-lib.mjs';

const WIKI_EN_CITIES = 'https://en.wikipedia.org/wiki/List_of_cities_in_South_Korea';
const F = '2026-10-20';
const census = (id, extra = {}) => ({
  id,
  take: extra.take ?? 'proposal',
  set: {
    stem: '둘 중 인구가 더 많은 도시는? (2020년 인구총조사)',
    asOf: '2020-11-01',
    sources: [{ url: WIKI_EN_CITIES, note: '(요지) 시별 인구 — 2020년 인구총조사 값(V012 재확인 · 값은 그대로)', fetchedAt: F }],
    ...(extra.set ?? {}),
  },
  why: extra.why ?? 'V012 fix — 값은 2020 인구총조사 값이라 질문 · asOf 의 연도를 2020 으로',
});
const attr = (id, a, why = 'V012 fix — 공용 파일의 자름 · 보정 표시를 attribution 에') => ({ id, take: 'proposal', set: { 'image.attribution': a }, why });
const alt = (id, list, why, take = 'proposal') => ({ id, take, set: { altAnswers: list }, why });

export const DECISIONS = [
  // ── price 6
  { id: 'price-0013', take: 'image', img: { image: { sourceUrl: 'http://shop1.phinf.naver.net/20190102_10/mysskagi2271_1546433663130qPGN2_JPEG/69740822751238046_1784286401.jpg', license: 'product-page', attribution: '네이버 쇼핑 판매처 상품 이미지(너네집 생활용품)' } }, why: 'V012 fix — 액체형 병 그림 → 분말형 1kg 용기 그림(네이버 이미지 검색 · 다나와 상품 페이지에는 액체형 그림 하나뿐). 가격은 그대로(unverified ok)' },
  { id: 'price-0018', take: 'modified', set: { name: '시디즈 T50 컴퓨터 책상 의자 HLDA (블랙 프레임 · 딥그린 좌판)' }, why: "V012 fix — 그림은 다나와 pcode=18132734 대표 그림 그대로 둠: 다나와 상품 정보의 색상은 '딥그린 · 웜그레이 · 차콜'(좌판)이고 '블랙' 은 프레임 · 메쉬 색이라, 그림을 바꾸지 않고 이름을 그림에 맞춤(GEN 판단)" },
  { id: 'price-0030', take: 'image', img: { image: { attribution: '다나와 상품 페이지 (배지 · 글자 잘라 냄)' } }, why: 'V012 fix — 배지 · 글자를 잘라 낸 제품 사진(scripts/g016-crop.mjs)' },
  { id: 'price-0049', take: 'image', img: { image: { attribution: "다나와 상품 페이지 ('New' 문구 잘라 냄)" } }, why: "V012 fix — 'New' 문구를 잘라 냄" },
  { id: 'price-0062', take: 'rejected', why: 'V012 fix(priceKrw null) — 롤렉스 공식 정가를 열지 못함(rolex.com 403 · 뉴스는 모델별 정가가 갈림) · 다나와 판매처 2,310만~3,040만은 병행 시세라 새 상품 정가 근거가 아님 → rejected(GEN 판단 · CV-29 사치품)' },
  { id: 'price-0098', take: 'rejected', why: 'V012 5절 — price-0018 과 같은 상품(다나와 pcode=18132734) · 브리핑대로 하나를 뺌(0018 은 판매처 3곳 · 이름을 그림에 맞춤)' },
  // ── photo 34
  attr('photo-0002', 'Martin Olsson (Mnemo) / Wikimedia Commons (cropped)'),
  attr('photo-0005', 'Donovan Govan / Wikimedia Commons (rotated)', "V012 fix — 회전 표시 · 변형 '깔대기' 는 제거 제안이 아니라 그대로"),
  alt('photo-0007', ['오뚜기', '오똑이'], "V012 fix — 문서로 닫히는 '오똑이' 더함"),
  attr('photo-0010', 'Peng / Wikimedia Commons (colour-adjusted)', "V012 fix — 보정 표시 · 변형 '휘스크' 는 그대로(제거 제안 아님)"),
  attr('photo-0011', 'Crisco 1492 / Wikimedia Commons (brightness adjusted, cropped)'),
  alt('photo-0018', ['트래픽 콘', '트래픽콘', '칼라콘'], "V012 fix — 문서로 닫히는 '칼라콘' · '트래픽콘' 더함"),
  { id: 'photo-0019', take: 'proposal', set: { altAnswers: ['시각 장애인 유도 블록', '안전유도블록', '점자블록'], 'image.attribution': 'Haragayato / Wikimedia Commons (edited)' }, why: "V012 fix — '안전유도블록'(ko 위키 문장) 더함 · edited 표시" },
  attr('photo-0027', 'Jmb / Wikimedia Commons (colour-adjusted, watermark removed)'),
  { id: 'photo-0028', take: 'modified', set: { altAnswers: ['와샤', '나사받이', '자릿쇠'], 'image.attribution': 'agr / Wikimedia Commons (cropped)' }, why: "V012 fix — '자릿쇠' 더함 · 자름 표시. 제안은 '와샤' 를 뺐으나 판정 reason 은 unverified 일 뿐 제거 사유가 아니라 유지(CV-49 기준)" },
  { id: 'photo-0031', take: 'modified', set: { altAnswers: ['타이랩', '집 타이', '호스 타이'], 'image.attribution': 'Silverxxx / Wikimedia Commons (brightness adjusted)' }, why: "V012 fix — '집 타이 · 호스 타이' 더함 · 밝기 보정 표시. 제안은 '타이랩' 을 뺐으나 언론 기사 86건(네이버 뉴스 — 예: 중앙일보 2026-07-10 '케이블타이의 두 얼굴')에 쓰여 CV-49 기준으로 유지" },
  attr('photo-0035', 'Sundar1 / Wikimedia Commons (cropped, colour-adjusted)', "V012 fix — 자름 · 보정 표시(제안의 한국어 문구를 다른 항목과 같은 영어 꼴로) · '프레즐' 은 그대로"),
  attr('photo-0036', 'Michelle Naherny / Wikimedia Commons (cropped)', 'V012 fix — 자름 표시(영어 꼴로)'),
  attr('photo-0057', 'Raul654 / Wikimedia Commons (contrast adjusted)', 'V012 fix — 보정 표시(영어 꼴로)'),
  alt('photo-0058', ['판골린'], "V012 fix — ko 위키에 나오는 '판골린' 더함"),
  attr('photo-0060', 'nomis-simon / Wikimedia Commons (shadows adjusted)', 'V012 fix — 보정 표시(영어 꼴로)'),
  { id: 'photo-0064', take: 'proposal', set: { 'image.license': 'CC BY 2.0', 'image.attribution': 'Yousuf Karsh / Library and Archives Canada / Wikimedia Commons' }, why: 'V012 fix — 라이선스 PD → CC BY 2.0 · 저작자' },
  attr('photo-0068', 'South Africa The Good News / www.sagoodnews.co.za / Wikimedia Commons (edited)', 'V012 fix — edit 표시'),
  { id: 'photo-0079', take: 'proposal', set: { 'image.license': 'CC BY-SA 3.0', 'image.attribution': 'Benh LIEU SONG / Wikimedia Commons' }, why: 'V012 fix — 라이선스 PD → CC BY-SA 3.0' },
  { id: 'photo-0080', take: 'proposal', set: { 'image.license': 'CC BY-SA 3.0', 'image.attribution': 'Elcobbola / Wikimedia Commons' }, why: 'V012 fix — 라이선스 PD → CC BY-SA 3.0' },
  alt('photo-0085', ['마추피추', '마추 픽추'], "V012 fix — 위키 표기 '마추 픽추' 더함. 제안은 '마추피추' 제외를 검토했으나 ko 위키 넘겨주기(마추피추 → 마추 픽추)와 기사 545건이 있어 CV-49 기준으로 유지", 'modified'),
  alt('photo-0090', ['사그라다 파밀리아 성당', '성가정 성당'], "V012 fix — 문서로 닫히는 '성가정 성당' 더함"),
  { id: 'photo-0093', take: 'proposal', set: { 'image.license': 'CC BY-SA 4.0', 'image.attribution': 'Diego Delso, delso.photo, License CC BY-SA / Wikimedia Commons' }, why: 'V012 fix — 라이선스 PD → CC BY-SA 4.0 · delso.photo 표기' },
  alt('photo-0101', ['미니컴보이'], "V012 fix — 영문 변형 제거(15 B2) · '미니컴보이' 더함"),
  alt('photo-0102', [], 'V012 fix — 영문 변형 제거(15 B2)'),
  alt('photo-0108', ['이니그마', '에니그마 암호기', '에니그마 기계'], "V012 fix — 영문 'Enigma' 제거 · '에니그마 기계' 더함. 제안은 '에니그마 암호기' 도 뺐으나 제거 사유가 적혀 있지 않아 유지", 'modified'),
  alt('photo-0110', [], 'V012 fix — 영문 변형 제거(15 B2)'),
  alt('photo-0112', ['뉴턴의 진자'], "V012 fix — 문서로 닫히는 '뉴턴의 진자' 더함"),
  alt('photo-0113', [], 'V012 fix — 영문 변형 제거(15 B2)'),
  alt('photo-0114', [], 'V012 fix — 영문 변형 제거(15 B2)'),
  alt('photo-0116', ['메르세데스-벤츠', '메르세데스 벤츠', '메르세데스'], "V012 fix — 영문 변형 제거 · '메르세데스' 더함"),
  alt('photo-0117', [], 'V012 fix — 영문 변형 제거(15 B2)'),
  alt('photo-0118', ['미츠비시'], 'V012 fix — 영문 변형 제거(미츠비시 유지)'),
  alt('photo-0119', [], 'V012 fix — 영문 변형 제거(15 B2)'),
  alt('photo-0120', [], 'V012 fix — 영문 변형 제거(15 B2)'),
  // ── estimate 3
  { id: 'estimate-0003', take: 'proposal', set: { value: 1500, note: '수컷 일반적으로 1,300~1,700kg(중앙값)', explanation: '기린 수컷은 보통 1.3~1.7톤(약 1.5톤)이고 암컷은 그보다 200~400kg 가볍다.', sources: [{ url: 'https://ko.wikipedia.org/wiki/기린', note: '(요지) 수컷 몸무게 1,300~1,700kg (V012 재확인)', fetchedAt: F }] }, why: 'V012 fix — ko 위키 범위의 중앙값 1,500kg + note(범위)' },
  { id: 'estimate-0069', take: 'image', img: { image: { sourceUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Fullset.jpg?width=1024', license: 'CC0', attribution: 'Roquex / Wikimedia Commons' } }, why: 'V012 fix — 틀니 모형 → 자연 치아 위턱 치열 사진(공용 Category:Permanent teeth · CC0) · 값은 그대로' },
  { id: 'estimate-0086', take: 'proposal', set: { value: 2000, asOf: '2025-12-18', note: '2025-12-18 부터 소형차 2,000원(종전 5,500원)', explanation: '2025년 12월 18일 5,500원에서 2,000원으로 내렸다(평균 63% 인하).', sources: [{ url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148957659', note: '인천대교는 지난달 18일부터 통행료를 평균 63% 인하했다. 승용차(소형)는 5500원에서 2000원으로…', fetchedAt: F }] }, why: 'V012 fix — 제안 caveat 대로 공식 뉴스(정책브리핑 korea.kr)로 재확인 뒤 반영' },
  // ── which 20
  { id: 'which-0001', take: 'modified', set: { 'a.value': 138902185, 'b.value': 83644258, margin: 1.66, asOf: '2026-07-01', note: '둘 다 UN 추계 2026년 값(Worldometer)', sources: [{ url: 'https://www.worldometers.info/world-population/population-by-country/', note: '(요지) 2026 인구 — 에티오피아 138,902,185 · 독일 83,644,258 (UN 추계 · V012 재확인)', fetchedAt: F }] }, why: "V012 fix — 한 출처(UN 추계 2026) 값으로 · asOf 는 날짜 꼴만 받으므로 '(UN 추계)' 는 note 로" },
  census('which-0016', { set: { 'b.label': '광주광역시' }, why: "V012 fix — 연도 2020 · '광주'(경기 광주시와 헷갈림) → 광주광역시" }),
  census('which-0017'),
  census('which-0018'),
  census('which-0019'),
  census('which-0020'),
  census('which-0021'),
  census('which-0022'),
  { id: 'which-0026', take: 'proposal', set: { 'b.value': 1480, margin: 2.7, note: '둘 다 수컷 평균 기준', sources: [{ url: 'https://en.wikipedia.org/wiki/Hippopotamus', note: '(요지) 하마 수컷 평균 1,480kg (V012 재확인)', fetchedAt: F }, { url: 'https://en.wikipedia.org/wiki/Largest_and_heaviest_animals', note: '(요지) 동물별 다 자란 개체의 평균 몸무게 표(average mass)', fetchedAt: '2026-10-17' }] }, why: 'V012 fix — 하마 값을 종 문서(수컷 1,480kg)로' },
  { id: 'which-0033', take: 'proposal', set: { 'b.value': 25, margin: 1.92, sources: [{ url: 'https://en.wikipedia.org/wiki/Fastest_animals', note: '(요지) 동물별 최고 속도(km/h) 표', fetchedAt: '2026-10-17' }, { url: 'https://en.wikipedia.org/wiki/Elephant', note: '(요지) 코끼리 최고 속도 25km/h (V012 재확인)', fetchedAt: F }] }, why: 'V012 fix — 코끼리 25km/h' },
  { id: 'which-0036', take: 'modified', set: { 'b.value': 268, margin: 1.46, note: '그린란드상어 392년은 방사성 탄소 추정(±120년) — 그래도 가장 오래 사는 척추동물로 꼽힌다', sources: [{ url: 'https://genomics.senescence.info/species/entry.php?species=Somniosus_microcephalus', note: 'Maximum longevity: 392 years (wild)', fetchedAt: '2026-10-17' }, { url: 'https://en.wikipedia.org/wiki/Bowhead_whale', note: '(요지) 북극고래 최대 수명 268년 (V012 재확인)', fetchedAt: F }] }, why: 'V012 fix — 북극고래 268 · 상어 값의 폭은 note 로(중앙값 비율 1.46 ≥ 1.3 · 방향 그대로 · GEN 판단)' },
  { id: 'which-0038', take: 'proposal', set: { 'a.value': 37, margin: 9.25, sources: [{ url: 'https://en.wikipedia.org/wiki/Naked_mole-rat', note: '(요지) 벌거숭이두더지쥐 최대 수명 37년 (V012 재확인)', fetchedAt: F }, { url: 'https://genomics.senescence.info/species/entry.php?species=Mus_musculus', note: 'Maximum longevity: 4 years (captivity)', fetchedAt: '2026-10-17' }] }, why: 'V012 fix — 두더지쥐 37년' },
  { id: 'which-0058', take: 'image', img: { 'a.image': { attribution: 'Aleksandr Markin / Wikimedia Commons (cropped · 아래 글자 잘라 냄)' } }, why: 'V012 fix — 오른쪽 아래 워터마크 글자를 잘라 냄(scripts/g016-crop.mjs) · 값 그대로' },
  { id: 'which-0073', take: 'proposal', set: { 'a.value': 7169, 'b.value': 2916, margin: 2.46, sources: [{ url: 'https://en.wikipedia.org/wiki/List_of_largest_companies_by_revenue', note: 'Data reflects the most recent fiscal year, primarily 2024 or 2025. (매출 US$ billions)', fetchedAt: '2026-10-17' }, { url: 'https://en.wikipedia.org/wiki/Samsung_Electronics', note: '(요지) 매출 US$291.63B (FY2025 · V012 재확인)', fetchedAt: F }] }, why: 'V012 fix — 삼성전자 FY2025 291.6B' },
  { id: 'which-0075', take: 'proposal', set: { 'a.value': 7131, 'b.value': 4377, margin: 1.63, sources: [{ url: 'https://en.wikipedia.org/wiki/List_of_largest_companies_by_revenue', note: 'Data reflects the most recent fiscal year, primarily 2024 or 2025. (매출 US$ billions)', fetchedAt: '2026-10-17' }, { url: 'https://en.wikipedia.org/wiki/Toyota', note: '(요지) 매출 US$437.69B (FY2025 · V012 재확인)', fetchedAt: F }] }, why: 'V012 fix — 토요타 FY2025 437.7B' },
  { id: 'which-0076', take: 'proposal', set: { 'a.value': 4028, 'b.value': 2010, margin: 2, sources: [{ url: 'https://en.wikipedia.org/wiki/List_of_largest_companies_by_revenue', note: 'Data reflects the most recent fiscal year, primarily 2024 or 2025. (매출 US$ billions)', fetchedAt: '2026-10-17' }, { url: 'https://en.wikipedia.org/wiki/Meta_Platforms', note: '(요지) 매출 US$201B (FY2025 · V012 재확인)', fetchedAt: F }] }, why: 'V012 fix — 메타 FY2025 201B' },
  { id: 'which-0077', take: 'modified', set: { 'a.value': 3219, 'b.value': 1335, unit: '억 유로', margin: 2.41, asOf: '2025-12-31', sources: [{ url: 'https://en.wikipedia.org/wiki/Volkswagen_Group', note: 'Revenue €321.913B (2025)', fetchedAt: F }, { url: 'https://en.wikipedia.org/wiki/BMW', note: 'Revenue €133.453 billion (2025)', fetchedAt: F }] }, why: "V012 fix(값 null) — 두 회사 모두 같은 해(2025) · 같은 통화(유로) 정보상자 값으로 · 단위 '억 유로'(환산을 하지 않음 · GEN 판단)" },
  { id: 'which-0078', take: 'rejected', why: 'V012 fix(벤츠 값 null) — 메르세데스-벤츠 그룹 2025 매출을 문서로 못 닫음(위키 정보상자는 €145.6B 2024) · 코스트코(US$ 2025)와 같은 연도 · 통화로 맞출 수 없어 rejected' },
  { id: 'which-0088', take: 'proposal', set: { 'b.value': 482287, margin: 1.5, sources: [{ url: 'https://en.wikipedia.org/wiki/List_of_islands_by_area', note: '(요지) 섬별 면적(km2) 표', fetchedAt: '2026-10-17' }, { url: 'https://en.wikipedia.org/wiki/Sumatra', note: '(요지) 수마트라 면적 482,286.55km² (V012 재확인)', fetchedAt: F }] }, why: 'V012 fix — 수마트라 482,287㎢' },
  { id: 'which-0118', take: 'image', img: { 'b.image': { attribution: 'HappyMidnight / Wikimedia Commons (cropped — 현대 건물만)' } }, why: 'V012 fix — 기아 건물이 함께 보이던 그림 B 를 현대 건물만 남게 잘라 냄 · 1967 은 en 위키 Hyundai Motor Company 문장(sources)' },
];

await run('v012', DECISIONS);
