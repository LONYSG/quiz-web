// blind 힌트 채점 — 대표 정답 · 변형 정규화 일치(1) · 부분(0.5) · 아니면 0
import { rj, wj } from './db.mjs';
import { normalizeAnswer as N } from '../../../../../shared/dist/index.js';
const D = rj('g038-decisions.json').items; const M = rj('g038-raw/blind/meta.json');
const pfx = process.argv[2] ?? 'h'; const files = (process.argv[3] ?? '0,1,2').split(',');
const out = files.flatMap((k) => rj(`g038-raw/blind/${pfx}${k}-out.json`));
const res = out.map((o) => { const d = D[o.id]; const set = [d.before.display_answer, ...d.before.variants].map(N); const x = N(o.guess);
  const hit = set.includes(x) ? 1 : set.some((s) => s.length >= 2 && x.length >= 2 && (x.includes(s) || s.includes(x))) ? 0.5 : 0;
  return { id: o.id, grade: M.grade[o.id], guess: o.guess, ans: d.before.display_answer, hit }; });
const by = {}; for (const r of res) { const b = (by[r.grade] ??= { n: 0, hit: 0, half: 0 }); b.n++; if (r.hit === 1) b.hit++; if (r.hit === 0.5) b.half++; }
console.log('n', res.length, 'hit', res.filter((r) => r.hit === 1).length, 'half', res.filter((r) => r.hit === 0.5).length, JSON.stringify(by));
console.log('half', res.filter((r) => r.hit === 0.5).map((r) => `${r.id} ${r.guess}/${r.ans}`).join(' · '));
console.log('miss', res.filter((r) => !r.hit).map((r) => `${r.id} ${r.guess}/${r.ans}`).join(' · '));
wj(`g038-raw/blind/${pfx}-graded.json`, res);
