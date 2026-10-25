#!/usr/bin/env node
// =============================================================================
// G021 — V024 판정(C80 · CV-72~77 — 찬종 결정 전부 기본값 (a)) 반영. 멱등(두 번 돌려도 같다).
//   node scripts/g021-apply-v024.mjs            dry-run — 바뀔 칸만 보여 준다
//   node scripts/g021-apply-v024.mjs --apply    파일에 쓴다 + data/pipeline/audit/g021-applied.json
// ★ proposal 을 그대로 옮긴다(V024 · audit/v024-minigame.json). verify 칸은 두고 status 만 candidate → verified.
// ★ 그림 교체 6(which-0306-b · 0316-b · 0346-a · 0397-b · photo-0305 · photoyear-0012)은 scripts/g021-images.mjs 가 한다
//   — 여기서는 그 항목들의 값 · 칸만(0346 · 0397 은 값 그대로).
// ★ GEN 이 문서를 열어 닫은 것(G021): CV-74 변형 3(찍찍이 · 핸드 스피너 · 플라즈마 볼) · CV-76 disputed 5 note · CV-72 0037 메모.
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const AT = '2026-10-25';

const FILES = {
  price: 'data/minigame/price/items-3.json',
  photo: 'data/minigame/photo/items-3.json',
  which: 'data/minigame/which/items-3.json',
  photoyear: 'data/minigame/photoyear/items.json',
};
const docs = Object.fromEntries(Object.entries(FILES).map(([g, f]) => [g, JSON.parse(readFileSync(path.join(ROOT, f), 'utf8'))]));
const find = (id) => { const it = docs[id.split('-')[0]].items.find((x) => x.id === id); if (!it) throw new Error(`없음 ${id}`); return it; };
const log = [];
/** 칸 하나를 바꾼다 — 이미 같으면 아무것도 하지 않는다(멱등) */
const set = (id, key, value, why) => {
  const it = find(id); const keys = key.split('.'); let o = it;
  for (const k of keys.slice(0, -1)) o = o[k];
  const last = keys.at(-1); const before = o[last];
  if (JSON.stringify(before) === JSON.stringify(value)) return;
  o[last] = value; log.push({ id, key, before, after: value, why });
};
const verified = (id, why) => set(id, 'status', 'verified', why);
const addAlt = (id, alt, why) => { const it = find(id); if (!it.altAnswers.includes(alt)) set(id, 'altAnswers', [...it.altAnswers, alt], why); };
const addSource = (id, src, why) => { const it = find(id); if (!it.sources.some((s) => s.url === src.url && s.note === src.note)) set(id, 'sources', [...it.sources, src], why); };

// ── price (CV-77 (a))
set('price-0283', 'priceKrw', 74990, 'V024 fix — 다나와 첫 화면 4곳 중앙값');
set('price-0283', 'bucket', '1~10만', 'V024 fix — 74,990 이라 버킷 이동');
set('price-0283', 'priceAsOf', '2026-10-24', 'V024 이 다시 읽은 날');
set('price-0283', 'priceSources', [
  { url: 'https://prod.danawa.com/info/?pcode=3322594', seller: '다나와 판매처 목록 첫 화면 4곳 중앙값', priceKrw: 74990, fetchedAt: '2026-10-24' },
  { url: 'https://price.enuri.com/search?keyword=MTG%20%EB%A6%AC%ED%8C%8C%20%ED%8C%8C%EC%98%A4%20FF-PO1858F', seller: '에누리 최저', priceKrw: 73690, fetchedAt: '2026-10-24' },
], 'V024 fix proposal.priceSources(문장 → 칸)');
addSource('price-0283', { url: 'https://prod.danawa.com/info/?pcode=3322594', note: 'V024 재열람(2026-10-24): 다나와 첫 화면 73,690~77,400원 · 에누리 최저 73,690원 — G018 기록 137,655 의 -45% (요지)', fetchedAt: '2026-10-24' }, 'V024 근거');
verified('price-0283', 'V024 fix 적용');
// 0216 은 CU 상품 페이지를 다시 열어 3,900원(정가) 확인 — 값 그대로(G021 · 0절)

// ── photo (CV-74 (a))
set('photo-0224', 'image.attribution', 'Michael Nutt / Wikimedia Commons (cropped)', 'V024 fix');
set('photo-0232', 'image.attribution', '국립국어원 / Wikimedia Commons (cropped)', 'V024 fix');
set('photo-0244', 'image.attribution', 'Brian Negin (bdnegin) / Wikimedia Commons (cropped, retouched)', 'V024 fix');
set('photo-0302', 'image.attribution', 'Chatham House / Wikimedia Commons (cropped)', 'V024 fix');
set('photo-0306', 'image.attribution', 'Sfcphoto.KeunHwa / Wikimedia Commons (cropped)', 'V024 fix');
set('photo-0290', 'image.license', 'CC BY 2.0', 'V024 fix — 공용 페이지 CC BY 2.0(VERIFY 직접 확인)');
set('photo-0290', 'image.attribution', 'Sam Valadi / Wikimedia Commons (extracted from another file)', 'V024 fix');
set('photo-0265', 'altAnswers', ['미륵보살 반가사유상', '반가상', '미륵반가사유상'], 'V024 fix — ko 위키 반가사유상');
addAlt('photo-0270', '개스 마스크', 'V024 fix — ko 위키 근거(가스 마스크 · 방독마스크는 그대로)');
set('photo-0318', 'altAnswers', ['카카오나무', '카카오 나무'], "V024 fix — '코코아나무' 근거 없음 · 뺌");
set('photo-0339', 'altAnswers', ['호랑꼬리여우원숭이', '호랑이꼬리여우원숭이', '고양이원숭이'], 'V024 fix');
// CV-74 (a) — 맞혀 보기 변형 중 문서로 닫히는 것(G021 이 열어 봄)
addAlt('photo-0231', '찍찍이', 'CV-74 — ko 위키 "찍찍이" 문서 첫 줄(상표명 벨크로) · 기사 다수');
addSource('photo-0231', { url: 'https://ko.wikipedia.org/wiki/%EC%B0%8D%EC%B0%8D%EC%9D%B4', note: '찍찍이, 후크앤드루프 패스너(hook-and-loop fastener), 상표명 벨크로(Velcro)는 갈고리와 걸림고리가 쌍을 이뤄 서로 붙였다 떼었다 할 수 있게 하는 도구다.', fetchedAt: AT }, 'CV-74 변형 근거');
addAlt('photo-0251', '핸드 스피너', 'CV-74 — 기사 "피젯스피너(핸드스피너)" · "핸드 스피너(장난감)"');
addSource('photo-0251', { url: 'http://www.newspim.com/news/view/20171019000105', note: '손안에서 회전하는 장난감 피젯스피너(핸드스피너)를 우주공간에서 돌린 영상이 공개됐다. (뉴스핌 2017-10-19 · 네이버 뉴스 검색 요지)', fetchedAt: AT }, 'CV-74 변형 근거');
addAlt('photo-0259', '플라즈마 볼', 'CV-74 — 기사 쓰임(국립부산과학관 "플라즈마 볼 체험" 등 뉴스 154건)');
addSource('photo-0259', { url: 'https://www.inews24.com/view/2011369', note: '서로 멀리 떨어진 입자 사이에서도 특별한 상관관계가 나타나는 양자얽힘은 플라즈마 볼 체험으로 이해할 수… (아이뉴스24 · 네이버 뉴스 검색 요지)', fetchedAt: AT }, 'CV-74 변형 근거');
for (const id of ['photo-0224', 'photo-0232', 'photo-0244', 'photo-0302', 'photo-0306', 'photo-0290', 'photo-0265', 'photo-0270', 'photo-0318', 'photo-0339']) verified(id, 'V024 fix 적용');
// photo-0305 는 g021-images.mjs(그림 교체) 뒤 verified

// ── which (CV-76 (a))
set('which-0347', 'a.value', 2800, 'V024 fix — 본류 길이(슈얏알아랍 빼고)');
set('which-0347', 'b.value', 1900, 'V024 fix — 같은 정의');
set('which-0347', 'margin', 1.47, 'V024 fix');
set('which-0347', 'note', '강 본류 길이 기준(유프라테스는 샤트알아랍을 빼면 약 2,800km · 티그리스 약 1,900km) — 비율 1.47 로 경계', 'V024 fix proposal.note');
addSource('which-0347', { url: 'https://en.wikipedia.org/wiki/Euphrates', note: 'V024 재열람: 같은 정의(본류)로 맞추면 유프라테스 약 2,800km · 티그리스 약 1,900km (요지 · https://en.wikipedia.org/wiki/Tigris)', fetchedAt: '2026-10-24' }, 'V024 근거');
verified('which-0347', 'V024 fix 적용');
set('which-0304', 'note', '애나벌새 최고 속도는 문서마다 갈린다(구애 비행 약 98km/h · 다른 문서 약 83km/h) — 어느 쪽이든 집비둘기가 빠르다', 'CV-76 (a) disputed — note 에 근거');
set('which-0353', 'note', '블랙맘바 속도는 문서마다 약 20~22.5km/h — 어느 쪽이든 장수거북이 빠르다', 'CV-76 (a) disputed');
set('which-0371', 'note', '측우기는 세종 23년(1441) 제작 기록 · 이듬해(1442) 제도를 정했다고 적는 문서도 있다 — 어느 쪽이든 먼저다', 'CV-76 (a) disputed');
set('which-0420', 'note', '워싱턴 기념탑은 석조 구조가 1884년에 완성되고 1888년에 일반에 열렸다 — 어느 쪽이든 먼저다', 'CV-76 (a) disputed');
set('which-0385', 'note', '스페이스 니들은 1962년 개장(1961년 말 공사를 마쳤다는 문서도 있다) — 개장 연도 기준', 'CV-76 (a) disputed');
// which-0306 · 0316 · 0346 · 0397 은 그림 교체 뒤 verified(g021-images.mjs)

// ── photoyear (CV-72 (a))
set('photoyear-0021', 'title', '1979년 4월 서울 도심 거리의 환영 아치와 코리아나 호텔', 'V024 fix — 지하도 표현 근거 약함');
set('photoyear-0023', 'place', '포항', 'V024 fix — 파일 설명 Base: Pohang');
set('photoyear-0066', 'title', '1958년 6월 드레스덴의 노면전차와 새 아파트 공사 거리', 'V024 fix — 거리 이름은 문서마다 달라 뺌');
set('photoyear-0079', 'title', '1977년 파리 거리에 주차된 푸조 승용차와 아이들', "V024 fix — '렌터카' 근거 없음");
set('photoyear-0094', 'title', '2008년 8월 베이징 왕푸징 거리', "V024 fix — '올림픽 표어 광고판' 근거 없음");
for (const id of ['photoyear-0021', 'photoyear-0023', 'photoyear-0066', 'photoyear-0079', 'photoyear-0094']) verified(id, 'V024 fix 적용');
{
  const it = find('photoyear-0037'); const add = " · GEN 메모(G021 · CV-72 (a)): 그림 속 깃발의 'WELCOME … 2002' 는 이듬해 월드컵 글자 — 정답(2001) 단서가 아니라 그대로 둠";
  if (!it.sources[0].note.includes('CV-72')) set('photoyear-0037', 'sources.0.note', it.sources[0].note + add, 'CV-72 (a) 0037 그대로 + note');
}
// photoyear-0012 는 g021-images.mjs(다른 1960년대 사진으로 교체)

// ── 쓰기
console.log(`[g021-apply-v024] ${APPLY ? '쓰기' : 'dry-run'} — 바뀔 칸 ${log.length}`);
for (const l of log) console.log(`  ${l.id} ${l.key}: ${JSON.stringify(l.before)?.slice(0, 60)} → ${JSON.stringify(l.after)?.slice(0, 60)}`);
if (APPLY) {
  for (const [g, f] of Object.entries(FILES)) writeFileSync(path.join(ROOT, f), JSON.stringify(docs[g], null, 1) + '\n');
  const ap = path.join(ROOT, 'data/pipeline/audit/g021-applied.json');
  let prev = { round: 'G021', note: 'V024 fix 반영 로그 — before 로 되돌릴 수 있다', runs: [] };
  try { prev = JSON.parse(readFileSync(ap, 'utf8')); } catch { /* 처음 */ }
  if (log.length) prev.runs.push({ at: new Date().toISOString(), script: 'g021-apply-v024', changes: log });
  writeFileSync(ap, JSON.stringify(prev, null, 1) + '\n');
}
