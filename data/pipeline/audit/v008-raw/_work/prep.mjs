// V008 prep — 판정자 조각 입력(txt + refs json)
import fs from 'node:fs';
const SC = process.env.V8SC;
const W = 'C:/work/quiz-web/data/pipeline/audit/v008-raw/_work';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const one = (s) => (s ?? '').replace(/\s*\n\s*/g, ' ').trim();
const ga = J(SC + '/ga.json'), na = J(SC + '/na.json'), da = J(SC + '/da-all.json');
const daHitById = new Map(da.map((d) => [d.id, d]));
const QR = (id) => J(SC + '/qrows.json')[id];
const qrows = J(SC + '/qrows.json');

const h12line = (id) => {
  const d = daHitById.get(id); if (!d) return null;
  return 'H12 기계 후보: ' + d.hits.slice(0, 3).map((h) => `#${h.other} 와 겹침 "${h.bestStr || ''}"${h.nums.length ? ' 숫자 ' + h.nums.join(',') : ''}`).join(' / ');
};
const fmtSame = (arr) => arr.map((s) => `  sameAnswerActive #${s.id} (dif ${s.dif}): Q: ${one(s.question)} | E: ${one(s.explanation)} | H: ${one(s.hint)}`);

// (가) — 섞어서 3조각 (id 해시로 결정)
const gaSorted = [...ga].sort((a, b) => ((a.id * 2654435761) % 1000003) - ((b.id * 2654435761) % 1000003));
const pieces = { g1: [], g2: [], g3: [] };
gaSorted.forEach((x, i) => pieces['g' + ((i % 3) + 1)].push(x));
for (const k of Object.keys(pieces)) pieces[k].sort((a, b) => a.id - b.id);
const fmtG = (x) => {
  const L = [`### #${x.id}  [가/중]  A=${x.answer}${x.variants.length ? ' 변형: ' + x.variants.join(' | ') : ''}  난이도 ${x.dif}  길=${x.path}`];
  L.push(`Q: ${one(x.question)}`); L.push(`E: ${one(x.explanation)}`);
  L.push(`before(V006 이 판정한 옛 힌트): ${one(x.before)}`);
  L.push(`AFTER(지금 DB 힌트 — 판정 대상, by=${x.by}, ${x.status}): ${one(x.after)}`);
  L.push(`V006 판정: ${x.v006.verdict} [${(x.v006.categories || []).join(',')}] — ${one(x.v006.reason)}`);
  L.push(`G002 사유: ${one(x.g002reason)}   g002sources: ${(x.g002sources || []).join(' ; ')}`);
  L.push(...fmtSame(x.sameAnswerActive));
  const hl = h12line(x.id); if (hl) L.push(hl);
  L.push(`warn.hint: [${x.warn.hint.join(',')}]`); L.push('');
  return L.join('\n');
};
const manifest = {};
for (const [k, arr] of Object.entries(pieces)) {
  fs.writeFileSync(`${W}/${k}.txt`, arr.map(fmtG).join('\n'));
  fs.writeFileSync(`${W}/${k}.refs.json`, JSON.stringify(arr.map((x) => String(x.id))));
  manifest[k] = { n: arr.length, withSame: arr.filter((x) => x.sameAnswerActive.length).length, by: arr.reduce((m, x) => { m[x.by] = (m[x.by] || 0) + 1; return m; }, {}) };
}

// (나)
const fmtN = (x) => {
  if (x.field === 'discarded' || x.missingDb) return null;
  const L = [`### ${x.key}  [나/${x.src}/${x.field}]  id=#${x.id}  A=${x.answer}${x.variants.length ? ' 변형: ' + x.variants.join(' | ') : ''}  난이도 ${x.dif}`];
  L.push(`Q: ${one(x.question)}`); L.push(`E: ${one(x.explanation)}`);
  if (x.field === 'general_hint' || x.field === 'hint') {
    L.push(`before(GEN 이 바꾸기 전 힌트): ${one(x.before)}`);
    L.push(`AFTER(지금 DB 힌트 — 판정 대상, GEN 이 쓴 문구): ${one(x.after)}`);
  } else {
    L.push(`H(지금 DB 힌트, 참고): ${one(x.hint)}`);
    L.push(`before(GEN 이 바꾸기 전 ${x.field}): ${one(x.before)}`);
    L.push(`AFTER(지금 DB ${x.field} — 판정 대상, GEN 이 쓴 문구): ${one(x.after)}`);
  }
  L.push(`GEN 사유: ${one(x.why)}   sources: ${(x.sources || []).join(' ; ')}`);
  L.push(...fmtSame(x.sameAnswerActive));
  const hl = h12line(x.id); if (hl) L.push(hl);
  L.push(`warn.hint: [${x.warn.hint.join(',')}]`); L.push('');
  return L.join('\n');
};
const naOut = na.map((x) => [x, fmtN(x)]).filter((z) => z[1]);
fs.writeFileSync(`${W}/n1.txt`, naOut.map((z) => z[1]).join('\n'));
fs.writeFileSync(`${W}/n1.refs.json`, JSON.stringify(naOut.map((z) => z[0].key)));
manifest.n1 = { n: naOut.length, skipped: na.filter((x) => x.field === 'discarded' || x.missingDb).map((x) => x.key) };

// (다)
const dsorted = [...da].sort((a, b) => ((a.id * 2654435761) % 1000003) - ((b.id * 2654435761) % 1000003));
const dp = { d1: [], d2: [], d3: [] };
dsorted.forEach((x, i) => dp['d' + ((i % 3) + 1)].push(x));
for (const k of Object.keys(dp)) dp[k].sort((a, b) => a.id - b.id);
const fmtD = (e) => {
  const r = qrows[e.id];
  const L = [`### #${e.id}  [다]  A=${r.answer}${r.variants.length ? ' 변형: ' + r.variants.join(' | ') : ''}  난이도 ${r.dif}  버전 ${r.ver}`];
  L.push(`Q: ${one(r.question)}`); L.push(`E: ${one(r.explanation)}`);
  L.push(`H(판정 대상 — 지금 DB 힌트): ${one(r.hint)}`);
  const inGa = ga.some((g) => g.id === e.id), inNa = na.some((n) => n.id === e.id);
  if (inGa || inNa) L.push(`(이 힌트는 ${inGa ? '(가)' : '(나)'} 대상이기도 하다)`);
  for (const h of e.hits) {
    const o = qrows[h.other];
    L.push(`  others #${h.other} (dif ${o.dif}): Q: ${one(o.question)} | E: ${one(o.explanation)} | H: ${one(o.hint)}`);
    L.push(`    겹침(기계): "${h.bestStr || ''}"${h.nums.length ? ' 숫자 ' + h.nums.join(',') : ''}${h.latin.length ? ' 영문 ' + h.latin.join(',') : ''}${(daHitById.get(h.other)?.hits || []).some((z) => z.other === e.id) ? '   ★ 역방향(#' + h.other + ' 의 힌트도 이 문항과 겹침)' : ''}`);
  }
  L.push(''); return L.join('\n');
};
for (const [k, arr] of Object.entries(dp)) {
  fs.writeFileSync(`${W}/${k}.txt`, arr.map(fmtD).join('\n'));
  fs.writeFileSync(`${W}/${k}.refs.json`, JSON.stringify(arr.map((x) => String(x.id))));
  manifest[k] = { n: arr.length };
}
fs.writeFileSync(`${W}/manifest.json`, JSON.stringify(manifest, null, 1));
console.log(JSON.stringify(manifest));
for (const k of Object.keys(manifest)) console.log(k, fs.statSync(`${W}/${k}.txt`).size);
