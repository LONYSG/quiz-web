// V014 build — 끝난 조각 out.json 합본 → audit/v014-active3.json (끝난 조각 수 < 전체면 partial)
import fs from 'node:fs';
const RAW = 'C:/work/quiz-web/data/pipeline/audit/v018-raw/a'; const A = 'C:/work/quiz-web/data/pipeline/audit';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const tg = J(RAW + '/targets-ids.json'); const items = Object.fromEntries(J(RAW + '/_work/items.json').map((x) => [x.id, x]));
const pieces = J(RAW + '/_work/pieces.json');
const grp = (src) => { const m = (src || '').match(/#(g\d+|r\d+[a-z]*|\d+)/i); return m ? (/^g|^r/i.test(m[1]) ? m[1].toLowerCase() : 'legacy#') : (src || '').startsWith('manual') ? 'manual' : 'other'; };
const res = {}; const done = [];
for (const p of pieces) {
  const f = `${RAW}/_work/${p}.out.json`; if (!fs.existsSync(f)) continue;
  const refs = J(`${RAW}/_work/${p}.refs.json`); const out = J(f);
  if (out.length !== refs.length || !out.every((x, i) => String(x.id) === refs[i])) continue;
  done.push(p);
  for (const x of out) { const it = items[x.id]; const txt = (x.reason || '') + (x.note || '') + JSON.stringify(x.facts || []);
    res[x.id] = { id: String(x.id), answer: it.answer, source: it.source, group: grp(it.source), verdict: x.verdict, categories: x.categories || [], reason: x.reason, uniqueness: x.uniqueness, facts: x.facts || [], readable: x.readable, hint: x.hint, proposal: x.proposal || null, urls: x.urls || [], note: x.note ?? null, piece: p, unverified: /unverified/.test(txt) }; }
}
const flipped = [];
const all = Object.values(res); const fixes = all.filter((x) => x.verdict === 'fix'); const drops = all.filter((x) => x.verdict === 'drop');
const cnt = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const byGroup = {}; for (const g of Object.keys(cnt(all, (x) => x.group))) { const a = all.filter((x) => x.group === g); const n = a.filter((x) => x.verdict !== 'ok').length; byGroup[g] = { n: a.length, fix: n, pct: +(n / a.length * 100).toFixed(1) }; }
const cat = {}; for (const x of [...fixes, ...drops]) for (const k of x.categories) cat[k] = (cat[k] || 0) + 1;
const counts = { done: all.length, total: tg.ids.length, ok: all.length - fixes.length - drops.length, fix: fixes.length, drop: drops.length, fixPct: +((fixes.length + drops.length) / Math.max(all.length, 1) * 100).toFixed(1), unverified: all.filter((x) => x.unverified).length, byGroup, categories: cat, pieces: done.length };
const partial = done.length < pieces.length;
const out = { flipped, ...(partial ? { partial: true, done: all.length } : {}), round: 'V018', part: '활성 난이도 1 전수', date: '2026-10-18', model: 'claude-sonnet-5-5 (VERIFY · 판정자도 같은 모델)', counts, items: res };
fs.writeFileSync(A + '/v018-active1.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(counts));
