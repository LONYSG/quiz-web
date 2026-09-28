// 작업 D — 297개 소분류의 대상 성격 분류 + 2회차 규모 추정
//   ★ 분류는 소분류 이름과 1회차 정답을 보고 GEN 이 손으로 매긴 것이다. 추정이다.
//   비율은 R021 파일럿 실측(답이 1회차와 같은 2회차 / 1회차): 생물 67% · 장소 67% · 유물·역사 42% · 사건 20% · 개념 8%
//   ★ 인물·작품은 파일럿에서 재지 않았다 → 42% 를 임시로 쓴다 (측정 필요)
import fs from 'node:fs';
const C = {
  B: '생물·기관', P: '장소·천체·국기', W: '인물·작품·상품', H: '역사 시대', V: '사건·대회', K: '개념·용어·규칙',
};
const RATE = { B: 0.67, P: 0.67, W: 0.42, H: 0.42, V: 0.20, K: 0.08 };
const M = {
  B: 'animals/1-6 plants/1-4 pets-garden/1-2 human-body/1-4',
  P: 'world-geo/1-5 kr-geo/1-4 architecture/3-4 astronomy/1-2 symbols/1',
  W: 'classical/1-3 art/1-3 world-lit/1-5 kr-lit/1-5 world-cinema/1-4 kr-screen/1-4 animation/1-5 comics/1-3 popular-music/1-5 kr-music/1-5 theatre/2 architecture/2 myth/1-4 philosophy/1-4 psychology/3 invention/1-4 esports/1-3 brands/1-4 fashion/2 design-photo/2 kr-tv/1 drinks/1-5 world-food/1-3 world-food/5 kr-food/1-5 music-theory/3-5 transport/2 aerospace/1-2 aerospace/5 religion/1-5 board-game/1-4',
  H: 'kr-history/1-6 world-history-west/1-5 world-history-east/1-4 war-history/1-3 economy/5',
  V: 'olympic/1-2 football/2 football/5 esports/4 war-history/4',
};
const cls = {};
for (const [k, spec] of Object.entries(M)) for (const t of spec.split(' ')) {
  const [mid, range] = t.split('/'); const [a, b] = range.split('-').map(Number);
  for (let i = a; i <= (b ?? a); i++) cls[`${mid}/${i}`] = k;
}
const st = JSON.parse(fs.readFileSync('data/pipeline/seeds/_state.json', 'utf8'));
const first = {}; // subId → 1회차 성공 문항 수 (r017~r022, 파일럿 제외)
for (const [key, v] of Object.entries(st.subs)) {
  if (key.startsWith('r021p:')) continue;
  first[v.subId] = (first[v.subId] ?? 0) + (v.questionsOk ?? 0);
}
const agg = {};
for (const [sub, n] of Object.entries(first)) {
  const k = cls[sub] ?? 'K'; cls[sub] = k;
  (agg[k] ??= { subs: 0, q: 0, list: [] }); agg[k].subs += 1; agg[k].q += n; agg[k].list.push(sub);
}
let tq = 0, est = 0;
console.log('성격            소분류  1회차 문항  비율  2회차 추정');
for (const k of Object.keys(C)) {
  const a = agg[k] ?? { subs: 0, q: 0 }; const e = Math.round(a.q * RATE[k]); tq += a.q; est += e;
  console.log(`${C[k].padEnd(14)} ${String(a.subs).padStart(4)}  ${String(a.q).padStart(8)}  ${(RATE[k] * 100).toFixed(0).padStart(3)}%  ${String(e).padStart(6)}`);
}
console.log(`합계           ${Object.keys(first).length}  ${tq}        ${est}`);
const unknown = Object.keys(cls).filter((s) => !first[s]);
if (unknown.length) console.log('★ 분류표에만 있고 1회차에 없는 소분류:', unknown.join(' '));
fs.writeFileSync('data/pipeline/audit/r022-nature.json', JSON.stringify({ classes: C, rates: RATE, bySub: cls, agg }, null, 1) + '\n');
