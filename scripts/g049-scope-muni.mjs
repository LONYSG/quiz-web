#!/usr/bin/env node
// =============================================================================
// G049 E — 범위 정리(18 §9 "세트 이름 = 정답 범위") — 파일만 · DB 쓰기 없음
//   ① closed 세트 머리 scope 한 줄(플레이어 말투 · ≤ 60자)
//   ② kr-municipality 넓히기(찬종 "시/군/구가 붙은 모든 지명"): 기존 227 불변 + 광역(특별시 · 광역시 · 특별자치시 · 통합특별시) 8
//      + 행정시 2(제주시 · 서귀포시) + 일반구 39(2026-02-01 기준 — 위키백과 "대한민국의 구") · 도는 넣지 않음
//      같은 끝 이름(남구 · 북구)은 "포항 남구" 꼴 · bare 꼴은 변형에 안 넣음(코드가 "앞 동네를 붙여 주세요")
//      status verified 유지(설계 예외) · verify.pending "V046 추가분"
//   ③ seoul-subway-station 삭제는 git rm(호선별 세트는 G050)
// 사용: node scripts/g049-scope-muni.mjs [--apply]
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flexCanon } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/minigame/topics');
const APPLY = process.argv.includes('--apply');
const C = (s) => flexCanon(String(s ?? ''));

const SCOPE = {
  'bible-book': '구약 39권 · 신약 27권 전부',
  constellation: '국제천문연맹이 정한 88개 별자리',
  country: '유엔 회원국 193개 나라 · 줄임말도 됩니다',
  currency: '나라별 화폐 단위 이름 — 달러 · 유로 · 엔처럼',
  'disney-animated-film': '디즈니 애니메이션 스튜디오 장편만 · 픽사는 빼요',
  element: '1~118번 전부 · 기호(Fe)도 됩니다',
  'epl-club': '프리미어리그(1992~)에 한 번이라도 뛴 구단',
  'ghibli-film': '스튜디오 지브리 장편 영화',
  'joseon-king': '태조부터 순종까지 27명 · 묘호로',
  'kbo-team': 'KBO 리그 역대 구단 · 없어진 팀도 됩니다',
  'kleague-team': '2026년 K리그1 · K리그2 구단',
  'kr-municipality': '서울시 · 대구광역시 · 제주시 · 분당구도 됩니다 · 서구 · 중구는 \'부산 서구\' 처럼',
  'kr-president': '이승만부터 지금까지 역대 대통령(대행은 빼요)',
  'lol-champion': '2026년 롤 챔피언 전부 · 영문도 됩니다',
  'mcu-film': 'MCU 극장 개봉 영화 · 드라마는 빼요',
  'mountain-100': '산림청이 고른 100대 명산',
  'olympic-summer-sport': '2024 파리 올림픽 32개 종목 · 세부 종목은 빼요',
  'pokemon-gen1': '1세대 1~151번 · 영문 이름도 됩니다',
  'river-national': '나라가 관리하는 국가하천(한강 · 낙동강 …)',
  'seoul-gu': '서울 25개 구 · \'구\' 를 빼고 말해도 됩니다',
  'solar-system': '행성 8 · 왜행성 5 · 둥근 위성 19',
  'us-state': '미국 50개 주 · 워싱턴 D.C.는 빼요',
  'world-capital': '유엔 회원국 193개 나라의 수도',
  'worldcup-host': '남자 월드컵을 연 나라 · 2026 캐나다까지',
};

// 광역(도 제외) — [name, variants, tag]
const METRO = [
  ['서울특별시', ['서울', '서울시'], '서울'],
  ['부산광역시', ['부산', '부산시'], '부산'],
  ['대구광역시', ['대구', '대구시'], '대구'],
  ['인천광역시', ['인천', '인천시'], '인천'],
  ['대전광역시', ['대전', '대전시'], '대전'],
  ['울산광역시', ['울산', '울산시'], '울산'],
  ['전남광주통합특별시', ['광주광역시', '전남광주'], '전남광주통합특별시'], // "광주" · "광주시" 는 경기 광주시와 겹쳐 안 넣음
  ['세종특별자치시', ['세종', '세종시'], '세종'],
];
const ADMIN_CITY = [['제주시', ['제주'], '제주'], ['서귀포시', ['서귀포'], '제주']];
// 일반구 39(2026-02-01) — [시(짧은 꼴), 도 태그, 구 이름들]
const ILBAN = [
  ['수원', '경기', ['장안구', '권선구', '팔달구', '영통구']],
  ['성남', '경기', ['수정구', '중원구', '분당구']],
  ['안양', '경기', ['만안구', '동안구']],
  ['부천', '경기', ['원미구', '소사구', '오정구']],
  ['안산', '경기', ['상록구', '단원구']],
  ['고양', '경기', ['덕양구', '일산동구', '일산서구']],
  ['용인', '경기', ['처인구', '기흥구', '수지구']],
  ['화성', '경기', ['만세구', '효행구', '병점구', '동탄구']],
  ['청주', '충북', ['상당구', '서원구', '흥덕구', '청원구']],
  ['천안', '충남', ['동남구', '서북구']],
  ['전주', '전북', ['완산구', '덕진구']],
  ['포항', '경북', ['남구', '북구']],
  ['창원', '경남', ['의창구', '성산구', '마산합포구', '마산회원구', '진해구']],
];
const SAME_END = new Set(['남구', '북구']); // 기존 자치구와 같은 끝 이름 → "포항 남구" 꼴 · bare 변형 없음
const NO_STEM = new Set(['일산동구', '일산서구', '남구', '북구']); // '구' 뺀 꼴이 어색하거나 겹침

const files = [];
for (const [slug, scope] of Object.entries(SCOPE)) {
  const file = path.join(DIR, `${slug}.json`);
  const t = JSON.parse(readFileSync(file, 'utf8'));
  if (t.kind !== 'closed') throw new Error(`${slug} closed 아님`);
  // 머리 칸 순서: nameKo 다음에 scope
  const out = {};
  for (const [k, v] of Object.entries(t)) { if (k === 'scope') continue; out[k] = v; if (k === 'nameKo') out.scope = scope; }
  files.push({ file, t: out });
}
const km = files.find((x) => x.t.topic === 'kr-municipality').t;
const before = km.items.length;
const taken = new Map(); for (const it of km.items) for (const v of [it.name, ...it.variants]) taken.set(C(v), it.id);
let next = Math.max(...km.items.map((x) => Number(x.id.slice(-3)))) + 1;
const added = []; const skipped = [];
function push(name, variants, tags) {
  if (taken.has(C(name))) { skipped.push(`${name} — name 이 ${taken.get(C(name))} 와 겹침`); return; }
  const id = `kr-municipality-${String(next++).padStart(3, '0')}`;
  const vs = [];
  for (const v of variants) { if (taken.has(C(v))) { skipped.push(`${name} 변형 ${v} — ${taken.get(C(v))} 와 겹침`); continue; } vs.push(v); }
  const it = { id, name, variants: vs, tags, draw: false, liar: false, qid: null };
  km.items.push(it);
  for (const v of [name, ...vs]) taken.set(C(v), id);
  added.push(it);
}
for (const [n, v, tag] of METRO) push(n, v, [tag, '광역']);
for (const [n, v, tag] of ADMIN_CITY) push(n, v, [tag, '행정시']);
for (const [city, prov, gus] of ILBAN) for (const g of gus) {
  if (SAME_END.has(g)) { push(`${city} ${g}`, [`${city}시 ${g}`], [prov, '일반구']); continue; }
  const vs = [`${city} ${g}`];
  if (!NO_STEM.has(g)) vs.unshift(g.slice(0, -1));
  push(g, vs, [prov, '일반구']);
}
km.nameKo = '대한민국 시·군·구(시·도 포함)';
km.count = km.items.length;
km.version += 1;
km.asOf = '2026-11-10';
km.source.push(
  { url: 'https://ko.wikipedia.org/wiki/대한민국의_행정_구역', note: 'G049 — 광역 17(특별시 1 · 통합특별시 1 · 광역시 5 · 특별자치시 1 · 도 · 특별자치도는 제외) · 제주 행정시 2 · 원문 audit/g049-raw/admin.wiki', fetchedAt: '2026-11-10', read: true },
  { url: 'https://ko.wikipedia.org/wiki/대한민국의_구', note: 'G049 — "2026년 2월 1일 기준 행정구 39개"(목록은 하위 페이지 — 39 이름은 GEN 지식 · 도별 수는 행정 구역 표 + 부천 2024 복원 · 화성 2026-02 신설 4 로 맞춤) · 원문 audit/g049-raw/gu.wiki', fetchedAt: '2026-11-10', read: true },
);
km.verify.pending = 'V046 추가분';
km.verify.g049 = { added: added.length, metro: METRO.length, adminCity: ADMIN_CITY.length, ilban: added.length - METRO.length - ADMIN_CITY.length, keptStatus: 'verified(설계 예외 — 기존 227 불변 · 추가분은 V046 재대조)' };

// #116 오답 11 확인
const ans = ['서울', '서울시', '서울특별시', '양평구', '대구광역시', '대구시', '광주광역시', '제주도', '제주시', '서귀포시', '서구'];
const check = ans.map((a) => {
  const hit = km.items.filter((it) => [it.name, ...it.variants].some((v) => C(v) === C(a)));
  const ends = km.items.filter((it) => C(it.name).endsWith(C(a)) && C(it.name) !== C(a));
  return { answer: a, result: hit.length ? `정답 → ${hit[0].name}` : ends.length > 1 ? `오답 · 겹침 ${ends.length}(${ends.slice(0, 3).map((x) => x.name).join(' · ')} …) → 코드 안내` : '오답' };
});

console.log(`kr-municipality ${before} → ${km.items.length} (+${added.length}) · 건너뜀 ${skipped.length}`, skipped.join(' | '));
console.log(added.map((x) => `${x.name}[${x.variants.join(';')}]`).join(' · '));
for (const c of check) console.log('  #116', c.answer, '→', c.result);
for (const { t } of files) console.log(t.topic.padEnd(22), [...t.scope].length, t.scope);
if (APPLY) {
  for (const { file, t } of files) writeFileSync(file, JSON.stringify(t, null, 1) + '\n');
  writeFileSync(path.join(ROOT, 'data/pipeline/audit/g049-scope-muni.json'), JSON.stringify({ round: 'G049', scope: SCOPE, muni: { before, after: km.items.length, added, skipped }, check116: check }, null, 1) + '\n');
  console.log('적용 · audit/g049-scope-muni.json');
} else console.log('dry-run (--apply 로 씀)');
