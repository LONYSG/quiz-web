#!/usr/bin/env node
// =============================================================================
// G021 — V024 그림 교체 6 의 칸 고치기(그림 파일은 scripts/g008-img.mjs 로 받고 sharp 로 자른 뒤 · 원본은 tmp/g021/orig/).
//   node scripts/g021-images.mjs            dry-run
//   node scripts/g021-images.mjs --apply    파일에 쓴다 + audit/g021-applied.json · audit/g021-images.json(V027 그림 재검증 대상)
// ★ 그림 id(파일 이름)는 그대로 — image 칸의 크기 · 출처 · 라이선스 · attribution 만 바꾼다(18 §7 재적재 규칙).
// ★ 값은 V024 ok 그대로 → status verified(2차 G016 꼴). 새 그림 6 은 V027 이 다시 본다(13 C82).
// ★ photoyear-0012 는 V024 drop(공용 파일 삭제 요청 중) → 다른 1960년대 사진(NH 104846 · 미 해군 · 퍼블릭 도메인 · 촬영일 1967-06-15)으로 바꾼 새 항목.
// =============================================================================
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

sharp.cache(false);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const AT = '2026-10-25';
const FILES = { photo: 'data/minigame/photo/items-3.json', which: 'data/minigame/which/items-3.json', photoyear: 'data/minigame/photoyear/items.json' };
const docs = Object.fromEntries(Object.entries(FILES).map(([g, f]) => [g, JSON.parse(readFileSync(path.join(ROOT, f), 'utf8'))]));
const find = (id) => docs[id.split('-')[0]].items.find((x) => x.id === id);
const log = [];
const put = (id, obj, key, value, why) => { if (JSON.stringify(obj[key]) === JSON.stringify(value)) return; log.push({ id, key, before: obj[key], after: value, why }); obj[key] = value; };
const dims = async (file) => { const b = readFileSync(path.join(ROOT, file)); const m = await sharp(b).metadata(); return { width: m.width, height: m.height, bytes: statSync(path.join(ROOT, file)).size }; };

const REPL = [
  { id: 'which-0306', side: 'b', file: 'assets/minigame/which/which-0306-b.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Baffin_Island_location_map.svg', license: 'CC BY-SA 3.0', attribution: 'Time3000 / Wikimedia Commons (cropped)', why: 'V024 fix — 위성 사진이라 배핀섬 윤곽이 안 보임 → 위치 지도(섬을 초록으로) · 왼쪽 지명 글자 잘라 냄' },
  { id: 'which-0316', side: 'b', file: 'assets/minigame/which/which-0316-b.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Yellowfin_tuna_nurp.jpg', license: 'Public domain', attribution: 'OAR/National Undersea Research Program (NURP), NOAA / Wikimedia Commons', why: 'V024 fix — 250px 저해상도 → 1024px 사진' },
  { id: 'which-0346', side: 'a', file: 'assets/minigame/which/which-0346-a.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:East_bank_of_the_V%C3%A4nern_lake_in_Sweden_02.jpg', license: 'CC BY-SA 4.0', attribution: 'Leonhard Lenz / Wikimedia Commons', why: 'V024 fix — 흐림 → 선명한 베네른호 동쪽 기슭 사진' },
  { id: 'which-0397', side: 'b', file: 'assets/minigame/which/which-0397-b.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Death_of_Marat_by_David.jpg?width=1024', license: 'Public domain', attribution: 'Jacques-Louis David / Wikimedia Commons (cropped)', why: "V024 fix — 편지의 '13 juillet 1793' 글자 → 편지 · 나무 상자가 안 보이게 더 자름(같은 원본)" },
  { id: 'photo-0305', side: null, file: 'assets/minigame/photo/photo-0305.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Son_Heung-min_-_2022_(52552243725)_(cropped).jpg', license: 'CC BY-SA 2.0', attribution: 'Republic of Korea (대한민국 정부 공식 Flickr) / Wikimedia Commons (extracted from another file)', why: 'V024 fix — 라이선스 의심(EXIF 저작권 THFC) → 대한민국 정부 공식 Flickr 사진(2022-12-08 청와대 영빈관 · CC BY-SA 2.0)' },
];

for (const r of REPL) {
  const it = find(r.id); const img = r.side ? it[r.side].image : it.image;
  const d = await dims(r.file);
  const next = { ...img, file: r.file, sourceUrl: r.sourceUrl, license: r.license, attribution: r.attribution, ...d };
  if (r.side) put(r.id, it[r.side], 'image', next, r.why); else put(r.id, it, 'image', next, r.why);
  put(r.id, it, 'status', 'verified', 'V024 fix(그림 교체) 적용 — 새 그림은 V027 재검증');
}
if (find('photo-0305').sources.length === 1) put('photo-0305', find('photo-0305'), 'sources', [...find('photo-0305').sources, { url: 'https://commons.wikimedia.org/wiki/File:Son_Heung-min_-_2022_(52552243725)_(cropped).jpg', note: 'President Yoon Suk Yeol and first lady Kim Keon Hee host a dinner for the national football team. December 8, 2022 Yeongbingwan, Cheong Wa Dae (파일 설명 원문) · Licensing: cc-by-sa-2.0 · Author: Republic of Korea from Seoul', fetchedAt: AT }], '새 그림 근거');

// photoyear-0012 — 새 사진
{
  const it = find('photoyear-0012'); const f = 'assets/minigame/photoyear/photoyear-0012.jpg'; const d = await dims(f);
  const want = {
    status: 'verified', year: 1967, yearKind: 'exact', yearRange: null,
    title: '1967년 6월 부산항에서 베트남으로 떠나는 국군 장병을 태운 수송선과 환송 인파', place: '부산', region: 'kr', difficulty: 2,
    cues: '대형 수송선 · 부두를 메운 환송 인파 · 양산 · 버스 · 흑백 사진',
    sources: [{ url: 'https://commons.wikimedia.org/wiki/File:NH_104846.jpg', note: 'Date: 15 June 1967 (파일 페이지 날짜 칸 원문) / Description: USS General W. H. Gordon (AP-117) at Pusan after loading South Korean troops bound for South Vietnam. The troops are already on board … photo by Colonel Spears, U.S. Army (Naval History and Heritage Command NH 104846) · Licensing: Public domain(미국 정부 저작물) · 삭제 틀 없음', fetchedAt: AT }],
    image: { file: f, sourceUrl: 'https://commons.wikimedia.org/wiki/File:NH_104846.jpg', license: 'Public domain', attribution: 'Colonel Spears, U.S. Army / Naval History and Heritage Command / Wikimedia Commons', ...d },
    tags: ['항구', '행사', '1960년대'],
  };
  for (const [k, v] of Object.entries(want)) put('photoyear-0012', it, k, v, 'CV-72 (a) — 0012 다른 1960년대 사진으로 교체');
}

console.log(`[g021-images] ${APPLY ? '쓰기' : 'dry-run'} — 바뀔 칸 ${log.length}`);
for (const l of log) console.log(`  ${l.id} ${l.key}`);
if (APPLY) {
  for (const [g, f] of Object.entries(FILES)) writeFileSync(path.join(ROOT, f), JSON.stringify(docs[g], null, 1) + '\n');
  const ap = path.join(ROOT, 'data/pipeline/audit/g021-applied.json');
  const prev = JSON.parse(readFileSync(ap, 'utf8'));
  if (log.length) prev.runs.push({ at: new Date().toISOString(), script: 'g021-images', changes: log });
  writeFileSync(ap, JSON.stringify(prev, null, 1) + '\n');
  const targets = [...REPL.map((r) => ({ id: r.id, image: r.file, sourceUrl: r.sourceUrl, license: r.license, attribution: r.attribution, why: r.why })),
    { id: 'photoyear-0012', image: 'assets/minigame/photoyear/photoyear-0012.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:NH_104846.jpg', license: 'Public domain', attribution: find('photoyear-0012').image.attribution, why: '새 항목(1967-06-15 부산항) — 연도 근거 · 연도 글자 · 얼굴 · 라이선스' }];
  writeFileSync(path.join(ROOT, 'data/pipeline/audit/g021-images.json'), JSON.stringify({ round: 'G021', note: 'V027 그림 재검증 대상(13 C82) — 그림은 이 PC assets/minigame · backups/minigame-g021.zip · 교체 전 원본 tmp/g021/orig/(git 밖)', count: targets.length, targets }, null, 1) + '\n');
}
