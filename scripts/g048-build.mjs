#!/usr/bin/env node
// =============================================================================
// G048 C — 캐치마인드 제시어 세트 draw-* 10 쓰기(docs/18 §12 · DG-086) — 파일만 · DB 쓰기 없음
//   입력: audit/g048-raw/_work/judge-1~4.json(조각 판정 — keep {word, set, sub, diff, variants} · drop {word: 사유})
//         + obj-drop.txt(GEN 재독 — 사물 687 → 400) + 아래 표(GEN 재독: 뺌 · 합침 · 이름 · 더함)
//         + 옛 proverb · idiom4(G044) → draw-proverb(그릴 수 있는 것만 · note 에 옛 id)
//   출력: data/minigame/topics/draw-<theme>.json(candidate · draw true · liar false · diff · id draw-<theme>-NNN)
//         · proverb.json · idiom4.json 삭제 · audit/g048-judge.json(단계별 수 · 결정)
// 사용: node scripts/g048-build.mjs [--apply]
// =============================================================================
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flexCanon } from '../shared/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/minigame/topics');
const WORK = path.join(ROOT, 'data/pipeline/audit/g048-raw/_work');
const APPLY = process.argv.includes('--apply');
const TODAY = '2026-11-09';
const C = (s) => flexCanon(String(s ?? ''));
const W = (s) => s.split(/\s+/).filter(Boolean);

const SETS = { object: '사물', animal: '동물', food: '음식', place: '장소·건물', action: '동작·상황', nature: '자연·날씨', character: '캐릭터·인물', vehicle: '탈것', job: '직업', proverb: '속담·사자성어' };

// ── GEN 재독: 뺌(세트 안 같은 말 · 상위어 · 제목 · 종교 · 논란 · 전문 · 문서류)
const DROP = new Set([
  ...W(readFileSync(path.join(WORK, 'obj-drop.txt'), 'utf8')).map((w) => `object:${w}`),
  ...W('예수님 부처 마라도나 에스키모 포켓몬스터 트랜스포머 세종 제갈량').map((w) => `character:${w}`),
  ...W('입맞춤 예배 혼례식 결혼 가족 몸살감기 마라톤경주 점심시간 성탄절 할프파이프 행글라이더').map((w) => `action:${w}`),
  ...W('커피숍 종합병원 철창 건물 초가 초가삼간 오두막집 아이스링크 바닷가 백사장 기찻길').map((w) => `place:${w}`),
  ...W('장미꽃 단풍나무 철쭉나무 대보름달 저녁놀 석양 해돋이 개기일식 이슬방울 가랑비 집중호우 대기오염 지구온난화 전갈자리 물고기자리 해왕성 잔디밭 진흙탕').map((w) => `nature:${w}`),
  ...W('주방장 첩보원 코미디언 헤어드레서 경찰 우체부 우편집배원 어릿광대 사진기자 운전기사 주지스님 오케스트라 중견수 구원투수 킬러 국회의원 향토예비군 월급쟁이').map((w) => `job:${w}`),
  ...W('승용차 자가용 헬기 전철 전동차 화물차 전차 불자동차 청소차 시내버스 마을버스 고속버스 항공기 고속철도 모범택시 경차 조각배 잠수정 제트기 폭격기 원양어선').map((w) => `vehicle:${w}`),
  ...W('과일 채소 야채 캔디 알사탕 블랙커피 모닝커피 에스프레소 아메리카노 카페라떼 포도주 적포도주 레몬주스 카레라이스 파스타 배추김치 단감 고구마튀김 알밤 청포도 얼음과자 콩나물국 콩나물밥 미역 음료수 패스트푸드 진수성찬 통닭구이 얼음물 크래커').map((w) => `food:${w}`),
  ...W('나귀 곤충 물고기 참개구리 왕개미 왕사마귀 인도코끼리 수리부엉이 재두루미 집오리 중병아리 하늘소 풍뎅이 호박벌 배추흰나비 도둑고양이').map((w) => `animal:${w}`),
]);
// ── 이름 다듬기 + 변형(뺀 같은 말은 변형으로)
const REN = {
  'character:세종대왕': { variants: ['세종'] }, 'character:제갈공명': { variants: ['제갈량'] },
  'character:슈퍼마리오': { name: '슈퍼 마리오', variants: ['마리오'] }, 'character:달려라하니': { name: '하니', variants: ['달려라 하니'] },
  'character:명탐정코난': { name: '코난', variants: ['명탐정 코난'] }, 'character:해리포터': { name: '해리 포터' }, 'character:셜록홈즈': { name: '셜록 홈즈', variants: ['셜록 홈스', '셜록'] },
  'character:빨강머리앤': { name: '빨강 머리 앤' }, 'character:가제트형사': { name: '가제트 형사', variants: ['가제트'] }, 'character:스티브잡스': { name: '스티브 잡스' },
  'character:마이클조던': { name: '마이클 조던' }, 'character:찰리채플린': { name: '찰리 채플린', variants: ['채플린'] }, 'character:스티븐호킹': { name: '스티븐 호킹' },
  'character:일곱난쟁이': { name: '일곱 난쟁이' }, 'character:콩쥐팥쥐': { name: '콩쥐 팥쥐' }, 'character:원더우먼': {}, 'character:산타클로스': { variants: ['산타'] },
  'place:해변': { variants: ['바닷가'] }, 'place:모래사장': { variants: ['백사장'] }, 'place:철길': { variants: ['기찻길'] }, 'place:스케이트장': { variants: ['아이스링크'] }, 'place:초가집': { variants: ['초가'] },
  'place:버스정류장': { name: '버스 정류장' }, 'place:종합병원': {}, 'place:고속도로': {},
  'nature:장미': { variants: ['장미꽃'] }, 'nature:노을': { variants: ['저녁놀', '석양'] }, 'nature:일출': { variants: ['해돋이'] }, 'nature:일식': { variants: ['개기일식'] }, 'nature:이슬비': { variants: ['가랑비'] },
  'job:경찰관': { variants: ['경찰'] }, 'job:집배원': { variants: ['우체부'] }, 'job:광대': { variants: ['어릿광대'] }, 'job:택시기사': { name: '택시 기사', variants: ['운전기사'] }, 'job:승려': { variants: ['스님'] },
  'job:스튜어디스': { name: '승무원', variants: ['스튜어디스'] }, 'job:디스크자키': { variants: ['DJ'] },
  'vehicle:자동차': { variants: ['승용차', '자가용'] }, 'vehicle:헬리콥터': { variants: ['헬기'] }, 'vehicle:지하철': { variants: ['전철'] }, 'vehicle:트럭': { variants: ['화물차'] },
  'vehicle:탱크': { variants: ['전차'] }, 'vehicle:소방차': { variants: ['불자동차'] }, 'vehicle:쓰레기차': { variants: ['청소차'] }, 'vehicle:견인자동차': { name: '견인차', variants: ['레커차'] }, 'vehicle:고기잡이배': { variants: ['어선'] },
  'food:사탕': { variants: ['캔디'] }, 'food:와인': { variants: ['포도주'] }, 'food:카레': { variants: ['카레라이스'] }, 'food:스파게티': { variants: ['파스타'] }, 'food:오렌지쥬스': { name: '오렌지 주스' },
};
// ── 세트 사이 변형 겹침(g044-topics-cross — 캐치는 한 풀)
const VAR_DROP = { 'action:카누경기': ['카누'] };
// ── 씨앗 밖 더함(GEN 2026 · 세트의 ≤15%)
const ADD = {
  character: W('둘리 뽀로로 짱구 도라에몽 스누피 헬로키티 펭수 엘사 올라프 스파이더맨 헐크 손오공 스폰지밥 미니언 토토로 호빵맨 텔레토비 쿠로미 피터팬').map((n) => ({ word: n, sub: '애니·캐릭터', diff: 2, variants: [] }))
    .concat([{ word: '미키 마우스', sub: '애니·캐릭터', diff: 1, variants: ['미키'] }]),
  action: [{ word: '셀카', sub: '일상', diff: 2, variants: ['셀피'] }, { word: '화상 회의', sub: '일상', diff: 3, variants: ['줌 회의'] }, { word: '음식 배달', sub: '일상', diff: 2, variants: ['배달'] }],
  vehicle: [{ word: '전동 킥보드', sub: '개인 이동', diff: 2, variants: ['킥보드'] }, { word: '배달 오토바이', sub: '오토바이', diff: 2, variants: [] }, { word: '행글라이더', sub: '하늘', diff: 3, variants: [] }],
};
const EASY = new Set(W('둘리 뽀로로 짱구 엘사 스파이더맨 호빵맨 스폰지밥 헐크'));

// ── 속담 · 사자성어(옛 G044 proverb · idiom4 — 그릴 수 있는 것만)
const PROVERB_DROP = new Set(['핑계 없는 무덤 없다', '개똥도 약에 쓰려면 없다', '적반하장', '노심초사', '막상막하']);
const PROVERB_EASY2 = new Set(['우물 안 개구리', '그림의 떡', '식은 죽 먹기', '하늘의 별 따기', '누워서 떡 먹기', '고래 싸움에 새우 등 터진다', '소 잃고 외양간 고친다', '원숭이도 나무에서 떨어진다', '일석이조', '작심삼일', '도토리 키 재기', '수박 겉 핥기', '티끌 모아 태산', '금강산도 식후경', '그림의 떡']);
const LABEL = { '콩 심은 데 콩 나고 팥 심은 데 팥 난다': '콩 심은 데 콩 난다', '호랑이 굴에 가야 호랑이 새끼를 잡는다': '호랑이 굴에 가야', '떡 줄 사람은 꿈도 안 꾸는데 김칫국부터 마신다': '김칫국부터 마신다', '자라 보고 놀란 가슴 솥뚜껑 보고 놀란다': '자라 보고 놀란 가슴', '물에 빠진 놈 건져 놓으니 보따리 내놓으라 한다': '물에 빠진 놈 보따리' };

const keep = []; const dropJudge = {};
for (const n of [1, 2, 3, 4]) { const j = JSON.parse(readFileSync(path.join(WORK, `judge-${n}.json`), 'utf8')); keep.push(...j.keep); Object.assign(dropJudge, j.drop); }
const stages = { seed: 0, mech: 0, judgeKeep: keep.length, judgeDrop: Object.keys(dropJudge).length };
const bySet = Object.fromEntries(Object.keys(SETS).map((k) => [k, []]));
const genDrop = [];
for (const k of keep) {
  const key = `${k.set}:${k.word}`;
  if (!bySet[k.set]) throw new Error(`모르는 세트 ${k.set}`);
  if (DROP.has(key)) { genDrop.push(key); continue; }
  const r = REN[key] ?? {};
  const vdrop = new Set(VAR_DROP[key] ?? []);
  bySet[k.set].push({ name: r.name ?? k.word, variants: [...new Set([...(k.variants ?? []), ...(r.variants ?? [])])].filter((v) => !vdrop.has(v)), sub: k.sub, diff: k.diff, from: 'namu' });
}
for (const [s, arr] of Object.entries(ADD)) for (const a of arr) bySet[s].push({ name: a.word, variants: a.variants, sub: a.sub, diff: EASY.has(a.word) ? 1 : a.diff, from: 'gen' });
// 속담
const old = [];
for (const slug of ['proverb', 'idiom4']) { const p = path.join(DIR, `${slug}.json`); if (existsSync(p)) old.push(...JSON.parse(readFileSync(p, 'utf8')).items.map((i) => ({ ...i, slug }))); }
for (const it of old) {
  if (PROVERB_DROP.has(it.name)) { genDrop.push(`proverb:${it.name}`); continue; }
  bySet.proverb.push({ name: it.name, variants: it.variants, sub: it.slug === 'idiom4' ? '사자성어' : '속담', diff: PROVERB_EASY2.has(it.name) ? 2 : 3, from: 'g044', note: `G044 ${it.id} 에서`, label: LABEL[it.name] });
}

// 세트 안 같은 이름 · 변형 겹침 정리(이름이 같으면 뒤 것 뺌 · 변형이 다른 항목 이름/변형이면 그 변형 뺌 · 죽은 변형 뺌)
const fixLog = [];
for (const [s, arr] of Object.entries(bySet)) {
  const seen = new Map(); const out = [];
  for (const x of arr) { const c = C(x.name); if (seen.has(c)) { fixLog.push(`${s}: 같은 이름 ${x.name} 뺌`); continue; } seen.set(c, x); out.push(x); }
  const used = new Set(out.map((x) => C(x.name)));
  for (const x of out) x.variants = x.variants.filter((v) => { const c = C(v); if (c === C(x.name) || used.has(c)) { fixLog.push(`${s}: ${x.name} 변형 ${v} 뺌`); return false; } used.add(c); return true; });
  bySet[s] = out;
}
// 세트 사이 겹침(캐치는 한 풀) — 뒤 세트에서 뺌
const global = new Map();
for (const s of Object.keys(SETS)) {
  bySet[s] = bySet[s].filter((x) => { const c = C(x.name); if (global.has(c)) { fixLog.push(`세트 사이: ${s}:${x.name} = ${global.get(c)} → 뺌`); return false; } global.set(c, `${s}:${x.name}`); return true; });
}

const files = [];
for (const [s, nameKo] of Object.entries(SETS)) {
  const items = bySet[s].map((x, i) => {
    const it = { id: `draw-${s}-${String(i + 1).padStart(3, '0')}`, name: x.name };
    if (x.label) it.label = x.label;
    Object.assign(it, { variants: x.variants, tags: [x.sub], sub: x.sub, diff: x.diff, draw: true, liar: false, qid: null });
    if (x.note) it.note = x.note;
    return it;
  });
  const gen = bySet[s].filter((x) => x.from === 'gen').length;
  files.push({
    topic: `draw-${s}`, nameKo, kind: 'open', version: 1, asOf: TODAY, createdRound: 'G048', status: 'candidate',
    source: [{ url: 'https://namu.wiki/w/캐치마인드/문제 목록', note: `씨앗 나무위키 캐치마인드/문제 목록(CC BY-NC-SA 2.0 KR — 씨앗으로만 · 단어마다 그리기 · 보편성 판정 · 우리 태그)${s === 'proverb' ? ' + 옛 G044 proverb · idiom4' : ''}${gen ? ` + GEN 2026 ${gen}` : ''}`, fetchedAt: TODAY, read: true }],
    liar: false, draw: true, timeSec: 90, tags: ['캐치마인드', nameKo], count: items.length, items, verify: null,
  });
}
let total = 0;
for (const t of files) {
  const d = t.items.reduce((m, i) => ((m[i.diff] = (m[i.diff] ?? 0) + 1), m), {});
  total += t.count;
  console.log(t.topic.padEnd(16), 'n', t.count, 'diff', JSON.stringify(d));
  if (APPLY) writeFileSync(path.join(DIR, `${t.topic}.json`), JSON.stringify(t, null, 1) + '\n');
}
console.log('합', total, '· GEN 재독 뺌', genDrop.length, '· 정리', fixLog.length);
for (const l of fixLog) console.log('  ', l);
if (APPLY) {
  for (const s of ['proverb', 'idiom4']) { const p = path.join(DIR, `${s}.json`); if (existsSync(p)) unlinkSync(p); }
  const seed = JSON.parse(readFileSync(path.join(ROOT, 'data/pipeline/audit/g048-raw/seed/seed.json'), 'utf8'));
  const mech = JSON.parse(readFileSync(path.join(WORK, 'mech-filter.json'), 'utf8'));
  stages.seed = seed.count; stages.mech = mech.kept; stages.final = total;
  const why = {}; for (const r of Object.values(dropJudge)) why[r] = (why[r] ?? 0) + 1;
  writeFileSync(path.join(ROOT, 'data/pipeline/audit/g048-judge.json'), JSON.stringify({ round: 'G048', stages, mechDropped: mech.dropped, judgeDropWhy: why, genDrop, fixLog, judgeDrop: dropJudge }, null, 1) + '\n');
  console.log('적용 · proverb · idiom4 삭제 · audit/g048-judge.json');
} else console.log('dry-run (--apply 로 씀)');
