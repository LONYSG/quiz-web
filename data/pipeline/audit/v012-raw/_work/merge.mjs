// V012 merge — 조각 출력 → _work/merged.json (게임별 id→결과) · 순서·누락 점검
import fs from 'node:fs';
const W = 'C:/work/quiz-web/data/pipeline/audit/v012-raw/_work';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const pieces = J(W + '/pieces.json');
const merged = { price: {}, photo: {}, estimate: {}, which: {}, worldprice: { rows: {}, fx: {}, images: {} } };
const problems = [];
for (const name of Object.keys(pieces)) {
  const refs = J(`${W}/${name}.refs.json`); let out = J(`${W}/${name}.out.json`);
  const isWp = name.startsWith('wp-');
  const arr = isWp ? (out.rows || []) : out;
  if (isWp) { for (const f of out.fxChecks || []) merged.worldprice.fx[`${name}:${f.currency}`] = f; if (out.image) merged.worldprice.images[name] = out.image; }
  const keyOf = (x) => (isWp ? x.key : x.id);
  if (arr.length !== refs.length) problems.push(`${name}: 수 ${arr.length} ≠ ${refs.length}`);
  refs.forEach((r, i) => { if (keyOf(arr[i]) !== r) problems.push(`${name}: 순서 ${i} ${keyOf(arr[i])} ≠ ${r}`); });
  const game = isWp ? 'worldprice' : name.replace(/\d+$/, '');
  for (const x of arr) { x.piece = name; if (isWp) merged.worldprice.rows[x.key] = x; else merged[game][x.id] = x; }
}
fs.writeFileSync(W + '/merged.json', JSON.stringify(merged, null, 1));
const cnt = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
console.log('problems', problems);
for (const g of ['price', 'photo', 'estimate', 'which']) { const a = Object.values(merged[g]); console.log(g, a.length, cnt(a, (x) => x.verdict), 'imgProblems', a.flatMap((x) => x.images || []).filter((i) => i.verdict !== 'ok').length, 'imgs', a.flatMap((x) => x.images || []).length, 'unverified', a.filter((x) => x.value?.valueStatus === 'unverified' || /unverified/.test(x.reason || '')).length); }
const wr = Object.values(merged.worldprice.rows); console.log('worldprice rows', wr.length, cnt(wr, (x) => x.verdict), 'fx', Object.keys(merged.worldprice.fx).length, 'imgs', Object.keys(merged.worldprice.images));
