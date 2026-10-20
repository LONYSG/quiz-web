#!/usr/bin/env node
// =============================================================================
// G016 B — 미니게임 2차(items-2.json) V017 fix 29 반영 + CV-50 그림(verified 6) (ai-out/V017.txt 3절 · audit/v017-minigame.json)
//   node scripts/g016-apply-v017.mjs            ← dry-run
//   node scripts/g016-apply-v017.mjs --apply    ← items-2.json 쓰기 + audit/g016-fixes.json parts.v017
//   설계 판단(2026-10-19): CV-47 (a) 원화 환산 + note · CV-49 변형은 사전 · 위키 문서명/넘겨주기 · 기사 중 하나라도 있으면 유지
//   · CV-50 그림 교체(못 구하면 자르기 + attribution) · CV-51 0207 · 0141 은 altAnswers 에 다식 · 다식판 · 0213 큰부리새 · 0140 교체 못 하면 rejected
//   drop 1(which-0178)은 V017 이 이미 rejected 로 썼다 — 여기서는 건드리지 않는다
//   변형 근거: tmp/g016/variant-evidence.mjs 결과(ko 위키 넘겨주기 · 네이버 뉴스 표기 그대로 건수) — G016.txt 표
// =============================================================================
import { run } from './g016-lib.mjs';

const F = '2026-10-20';
const alt = (id, list, why, take = 'proposal') => ({ id, take, set: { altAnswers: list }, why });
const keep = (id, why) => ({ id, take: 'modified', set: {}, why: `V017 fix(변형 제거 제안) — ${why} · CV-49 기준으로 유지(변형 그대로)` });
const won = (id, value, note, rateUrl) => ({
  id,
  take: 'proposal',
  set: { value, unit: '원', note },
  extraSource: { url: rateUrl, note: '(요지) 2026-10 월평균 환율(x-rates) — 원화 환산 기준(V017 판정자)', fetchedAt: '2026-10-19' },
  why: 'V017 fix · CV-47 (a) — 원화 환산(현재 환율 단순 곱 · 당시 가치 아님) · 원래 통화 · 연도는 note',
});
const crop = (id, slot, attribution, why) => ({ id, take: 'image', img: { [slot]: { attribution } }, why });
const USD = 'https://www.x-rates.com/average/?from=USD&to=KRW&amount=1&year=2026';

const D = [
  // ── price 1
  { id: 'price-0144', take: 'modified', set: { name: '엘라스틴 퍼퓸 샴푸 러브미 400ml' }, why: "V017 fix — CU 상품 그림(공식 · 바코드 8801051152845)의 병 표기가 'LOVE ME' 이고 엘라스틴 퍼퓸 샴푸의 향 이름은 '러브미'(네이버 이미지 검색 — 예스24 · 롯데 등 '퍼퓸 러브미 샴푸 400ml'). CU 설명의 'Lovely' 는 향을 꾸미는 말이라 이름을 그림에 맞춤" },
  // ── photo 20
  { id: 'photo-0140', take: 'rejected', why: 'V017 fix · CV-51 — 한국 키 사진을 공용에서 못 구함(ko 위키 키 (도구) 의 그림은 일본 키와 아이가 키를 쓴 사진 · 공용 검색 winnow/키 농기구에 한국 키 사물 사진 없음) → rejected' },
  alt('photo-0141', ['다식판'], "V017 fix · CV-51 — 정답 모르는 판정자가 '다식판' 으로 답함 → 설계 판단대로 altAnswers 에 '다식판'", 'modified'),
  alt('photo-0152', ['깡깡이', '앵금'], "V017 fix — 문서로 닫히는 '앵금' 더함"),
  alt('photo-0170', ['시트로엔'], "V017 fix — ko 위키 문장의 '시트로엔' 더함"),
  keep('photo-0172', "'파리 개선문' · '프랑스 개선문' 은 ko 위키 넘겨주기(→ 에투알 개선문)가 있고 기사도 많음(2,457 · 307)"),
  keep('photo-0174', "'타워 브릿지' 는 ko 위키 넘겨주기(→ 타워 브리지)와 기사 1,910"),
  alt('photo-0175', ['브란덴부르크 개선문', '브란덴부르크문'], "V017 fix — '브란덴부르크문' 더함. '브란덴부르크 개선문' 은 ko 위키 넘겨주기와 기사 59 가 있어 CV-49 기준으로 유지", 'modified'),
  keep('photo-0176', "'버즈 칼리파' · '버즈 두바이' 는 ko 위키 넘겨주기(→ 부르즈 할리파)와 기사(1,655 · 2,556)"),
  { id: 'photo-0177', take: 'proposal', set: { 'image.license': 'CC BY-SA 3.0', 'image.attribution': 'Diliff / Wikimedia Commons (cropped, contrast adjusted)' }, why: 'V017 fix — 라이선스 PD → CC BY-SA 3.0 · 손질 표시' },
  { id: 'photo-0185', take: 'modified', set: { altAnswers: ['하기아 소피아', '하기아 소피아 대성당', '아야 소피아 성당', '아야 소피아 대성당'], 'image.attribution': 'Arild Vågen / Wikimedia Commons (edited)' }, why: "V017 fix — edited 표시 · '아야 소피아 대성당'(기사 36) 더함. '아야 소피아 성당' 은 ko 위키 넘겨주기와 기사 362 가 있어 CV-49 기준으로 유지(제안은 교체)" },
  keep('photo-0188', "'빈센트 반 고호' 는 ko 위키 넘겨주기(→ 빈센트 반 고흐)와 기사 123"),
  keep('photo-0191', "'토마스 에디슨' 은 ko 위키 넘겨주기(→ 토머스 에디슨)와 기사 1,969"),
  keep('photo-0193', "'마크 트와인' 은 ko 위키 넘겨주기(→ 마크 트웨인) · 기사 2"),
  keep('photo-0194', "'프로이드' · '지그문트 프로이드' 는 ko 위키 넘겨주기(→ 지그문트 프로이트)와 기사(2,517 · 215)"),
  alt('photo-0207', ['다식'], "V017 fix · CV-51 — 정답 모르는 판정자가 '다식' 으로 답함 → 설계 판단대로 altAnswers 에 '다식'", 'modified'),
  alt('photo-0210', ['빨간 무'], "V017 fix — ko 위키 문장의 '빨간 무' 더함"),
  alt('photo-0213', ['왕부리새', '큰부리새'], "V017 fix · CV-51 — 설계 판단대로 '큰부리새'(정답 모르는 판정자의 답 · 기사 241) 더함. 제안은 '왕부리새'(과 이름)를 뺐으나 ko 위키 넘겨주기(→ 왕부리새류)와 기사 138 이 있어 CV-49 기준으로 유지", 'modified'),
  crop('photo-0214', 'image', 'Malene Thyssen / Wikimedia Commons (cropped — 서명 잘라 냄)', 'V017 fix · CV-51 — 오른쪽 위 서명 글자를 잘라 냄(scripts/g016-crop.mjs)'),
  { id: 'photo-0215', take: 'proposal', set: { 'image.attribution': 'birdphotos.com / Wikimedia Commons (cropped)' }, why: 'V017 fix — 자름 표시' },
  alt('photo-0220', ['몰라몰라', '안진복', '골복짱이'], "V017 fix — 문서로 닫히는 '안진복' · '골복짱이' 더함. '몰라몰라' 는 ko 위키 넘겨주기(→ 개복치)가 있어 CV-49 기준으로 유지"),
  // ── estimate 6 (CV-47 (a))
  won('estimate-0185', 9672408000, '원래 7,200,000달러(1867). 환산 기준: 2026-10 평균 환율 1달러 = 1,343.39원(x-rates 월평균, 부분월) 곱셈. 당시 가치가 아닌 현재 환율 단순 환산', USD),
  won('estimate-0186', 20150850000, '원래 15,000,000달러(1803). 환산 기준: 2026-10 평균 1달러 = 1,343.39원(x-rates) 단순 곱. 당시 가치가 아닌 현재 환율 단순 환산', USD),
  won('estimate-0187', 804691, '원래 599달러(2007 미국 출시 · 2년 약정). 환산 기준: 2026-10 평균 1달러 = 1,343.39원(x-rates) 단순 곱. 당시 가치가 아닌 현재 환율 단순 환산', USD),
  won('estimate-0188', 604928517000, '원래 450,300,000달러(2017 크리스티 · 수수료 포함). 환산 기준: 2026-10 평균 1달러 = 1,343.39원(x-rates) 단순 곱. 당시 가치가 아닌 현재 환율 단순 환산', USD),
  won('estimate-0189', 203516550000, '원래 135,000,000유로(2022-05 경매). 환산 기준: 2026-10 평균 1유로 = 1,507.53원(x-rates) 단순 곱. 당시 가치가 아닌 현재 환율 단순 환산', 'https://www.x-rates.com/average/?from=EUR&to=KRW&amount=1&year=2026'),
  won('estimate-0190', 134339000000, '원래 100,000,000달러(1962 보험 평가액). 환산 기준: 2026-10 평균 1달러 = 1,343.39원(x-rates) 단순 곱. 당시 가치가 아닌 현재 환율 단순 환산', USD),
  // ── which 2 (fix) + CV-50 verified 6
  crop('which-0190', 'b.image', 'Aleksandr Markin / Wikimedia Commons (cropped · 아래 글자 잘라 냄)', 'V017 fix · CV-50 — 그림 B 오른쪽 아래 워터마크 글자를 잘라 냄(which-0058-a 와 같은 파일 · 같은 자름) · 값 그대로'),
  crop('which-0199', 'a.image', 'Duha masood / Wikimedia Commons (cropped — 워터마크 잘라 냄)', 'V017 fix · CV-50 — 그림 A 오른쪽 아래 워터마크를 잘라 냄 · 값 그대로'),
  crop('which-0272', 'b.image', '작자 미상 / Wikimedia Commons (cropped — 글씨 잘라 냄)', 'CV-50 — 정약용 초상 양옆 한자(이름 · 찬문)를 잘라 냄 · verified 그대로'),
  crop('which-0278', 'a.image', '작자 미상 / Wikimedia Commons (cropped — 이름표 · 번호 잘라 냄)', 'CV-50 — 가슴의 이름표(柳寬順)와 번호를 잘라 냄 · verified 그대로'),
  crop('which-0279', 'b.image', 'Integral / Wikimedia Commons (cropped — 현판 잘라 냄)', "CV-50 — 받침의 '퇴계 이황 선생 상' 현판을 잘라 냄 · verified 그대로"),
  { id: 'which-0286', take: 'image', img: { 'a.image': { sourceUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Statue_of_King_Sejong.jpg?width=1024', license: 'CC BY-SA 2.0', attribution: 'Republic of Korea / Wikimedia Commons (cropped)' } }, why: 'CV-50 — 훈민정음 해례본 면(제목 · 본문 한자)은 잘라서 글자를 뺄 수 없어 광화문 세종대왕 동상 사진으로 바꿈(오른쪽 아래 광고 글자 잘라 냄) · verified 그대로' },
  crop('which-0292', 'b.image', 'Martin Grandjean / Wikimedia Commons (cropped — 글자 잘라 냄)', "CV-50 — 국제연맹 깃발의 'LEAGUE OF NATIONS' 글자를 잘라 내고 가운데 별 무늬만 · verified 그대로"),
  crop('which-0300', 'b.image', 'Svetlana Miljkovic / Wikimedia Commons (cropped — 포장 글자 잘라 냄)', "CV-50 — 'BAND-AID' 포장을 잘라 내고 반창고만 · verified 그대로"),
];

// estimate 환율 출처는 sources 에 더한다(이미 있으면 그대로 — 멱등)
import { readFileSync } from 'node:fs';
const est = JSON.parse(readFileSync('data/minigame/estimate/items-2.json', 'utf8')).items;
for (const d of D) {
  if (!d.extraSource) continue;
  const cur = est.find((x) => x.id === d.id).sources;
  d.set.sources = cur.some((s) => s.url === d.extraSource.url) ? cur : [...cur, d.extraSource];
  delete d.extraSource;
}

export const DECISIONS = D;
await run('v017', DECISIONS);
