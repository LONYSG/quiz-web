#!/usr/bin/env node
// =============================================================================
// G044 C — closed 세트 liar/draw 태그 정리(18 §9 "제시어 풀 원칙" · DG-082) — 파일만 · DB 쓰기 없음
//   liar 전부 false: 성경 · 통화 · 원소 · 별자리 · 100대 명산 · 국가하천 · 지하철역 · K리그 · EPL · 서울 25구 · 롤 · 포켓몬
//   liar 유명한 것만: 세계 수도 20 · 나라 40 · 태양계 = 행성 8
//   draw 전부 false: 별자리 · 원소 · 태양계 · draw 유명한 것만: 포켓몬 50
//   그대로: 대통령 · 조선 왕 · KBO · 디즈니 · 지브리 · MCU · 올림픽(이 스크립트가 안 연다)
//   바뀐 세트만: items[].liar/draw · 머리 liar/draw = 항목에 하나라도 true · version +1 · verify · status · 나머지 칸 그대로
//   전후 표 → data/pipeline/audit/g044-tags.json
// 사용: node scripts/g044-tag-fix.mjs [--apply]
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/minigame/topics');
const APPLY = process.argv.includes('--apply');

const LIAR_OFF = ['bible-book', 'currency', 'element', 'constellation', 'mountain-100', 'river-national', 'seoul-subway-station', 'kleague-team', 'epl-club', 'seoul-gu', 'lol-champion', 'pokemon-gen1'];
const DRAW_OFF = ['constellation', 'element', 'solar-system'];
// GEN 판단(되돌리기 쉽다 — 찬종 눈 확인 G044.txt 2절)
const LIAR_KEEP = {
  // 빈(1글자) 대신 암스테르담
  'world-capital': ['서울', '도쿄', '베이징', '워싱턴 D.C.', '런던', '파리', '베를린', '로마', '마드리드', '모스크바', '방콕', '하노이', '오타와', '캔버라', '카이로', '아테네', '리스본', '암스테르담', '프라하', '멕시코시티'],
  // 아시아 · 유럽 · 아메리카 · 오세아니아 주요국 · 정치 현안 소지(북한 · 이스라엘) 뺌 · 아프리카는 이집트만
  country: ['대한민국', '일본', '중국', '인도', '인도네시아', '말레이시아', '필리핀', '싱가포르', '태국', '베트남', '몽골', '사우디아라비아', '튀르키예', '이집트',
    '영국', '프랑스', '독일', '이탈리아', '스페인', '포르투갈', '네덜란드', '벨기에', '스위스', '오스트리아', '체코', '폴란드', '그리스', '러시아', '아일랜드', '덴마크', '노르웨이', '스웨덴', '핀란드',
    '미국', '캐나다', '멕시코', '브라질', '아르헨티나', '호주', '뉴질랜드'],
  'solar-system': ['수성', '금성', '지구', '화성', '목성', '토성', '천왕성', '해왕성'],
};
const DRAW_KEEP = {
  'pokemon-gen1': ['이상해씨', '이상해꽃', '파이리', '리자몽', '꼬부기', '거북왕', '피카츄', '라이츄', '캐터피', '버터플', '구구', '꼬렛', '아보', '모래두지', '삐삐', '식스테일', '나인테일', '푸린', '주뱃', '뚜벅쵸',
    '디그다', '나옹', '고라파덕', '망키', '가디', '윈디', '발챙이', '캐이시', '꼬마돌', '야돈', '코일', '고오스', '팬텀', '롱스톤', '찌리리공', '또가스', '럭키', '잉어킹', '갸라도스', '라프라스',
    '메타몽', '이브이', '잠만보', '프리져', '썬더', '파이어', '미뇽', '망나뇽', '뮤츠', '뮤'],
};

const touched = new Set([...LIAR_OFF, ...DRAW_OFF, ...Object.keys(LIAR_KEEP), ...Object.keys(DRAW_KEEP)]);
const rows = [];
for (const topic of [...touched].sort()) {
  const file = path.join(DIR, `${topic}.json`);
  const t = JSON.parse(readFileSync(file, 'utf8'));
  const before = { liar: t.items.filter((i) => i.liar).length, draw: t.items.filter((i) => i.draw).length, head: [t.liar, t.draw], version: t.version };
  for (const [keep, key] of [[LIAR_KEEP[topic], 'liar'], [DRAW_KEEP[topic], 'draw']]) {
    if (!keep) continue;
    const names = new Set(t.items.map((i) => i.name));
    const miss = keep.filter((n) => !names.has(n));
    if (miss.length) throw new Error(`${topic} ${key}: 없는 이름 ${miss.join(', ')}`);
  }
  for (const it of t.items) {
    if (LIAR_OFF.includes(topic)) it.liar = false;
    if (DRAW_OFF.includes(topic)) it.draw = false;
    if (LIAR_KEEP[topic]) it.liar = LIAR_KEEP[topic].includes(it.name);
    if (DRAW_KEEP[topic]) it.draw = DRAW_KEEP[topic].includes(it.name);
  }
  t.liar = t.items.some((i) => i.liar);
  t.draw = t.items.some((i) => i.draw);
  const after = { liar: t.items.filter((i) => i.liar).length, draw: t.items.filter((i) => i.draw).length, head: [t.liar, t.draw] };
  const changed = before.liar !== after.liar || before.draw !== after.draw || before.head[0] !== after.head[0] || before.head[1] !== after.head[1];
  if (changed) t.version += 1;
  rows.push({ topic, nameKo: t.nameKo, n: t.items.length, before, after: { ...after, version: t.version }, changed, liarPool: after.liar > 0, drawPool: after.draw > 0 });
  if (APPLY && changed) writeFileSync(file, JSON.stringify(t, null, 1) + '\n');
}
for (const r of rows) console.log(r.topic.padEnd(22), `liar ${r.before.liar} → ${r.after.liar}`.padEnd(16), `draw ${r.before.draw} → ${r.after.draw}`.padEnd(16), `머리 ${r.before.head} → ${r.after.head}`, r.changed ? `v${r.before.version}→${r.after.version}` : '(그대로)');
if (APPLY) { writeFileSync(path.join(ROOT, 'data/pipeline/audit/g044-tags.json'), JSON.stringify({ round: 'G044', rows }, null, 1) + '\n'); console.log('적용 · audit/g044-tags.json'); }
else console.log('dry-run (--apply 로 씀)');
