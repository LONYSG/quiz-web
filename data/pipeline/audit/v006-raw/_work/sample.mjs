// 판정자 ok 무작위 10% 재독 표본 + 판정자 true(knowledge) 주장 무작위 60 표본 — 결정적 난수(seed)
import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v6';
const RAW = 'C:/work/quiz-web/data/pipeline/audit/v006-raw';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const T = J('C:/work/quiz-web/data/pipeline/audit/r047-verify-targets.json').midHints.targets;
const byId = new Map(T.map(x => [x.id, x]));
const OV = J(SC + '/override.json');
const which = process.argv[2] || 'ok';   // ok | true60
let seed = 20261013; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const judged = [];
for (let i = 1; i <= 13; i++) { const k = 'c' + String(i).padStart(2, '0'); const f = `${RAW}/${k}.out.json`; if (!fs.existsSync(f)) continue; for (const r of J(f)) judged.push({ ...r, _judge: k }); }
if (which === 'ok') {
  const oks = judged.filter(r => r.verdict === 'ok' && !(OV[String(r.id)] && (OV[String(r.id)].verdict || OV[String(r.id)].forceVerdict)));
  const n = Math.ceil(oks.length * 0.10);
  const pick = shuffle(oks).slice(0, n).sort((a, b) => a.id - b.id);
  let s = '';
  for (const r of pick) { const x = byId.get(r.id); s += `## #${x.id} [${x.path}] A=${x.answer}${x.variants?.length ? ' V=' + x.variants.join('|') : ''} judge=${r._judge} cat=${(r.categories || []).join(',')}\nQ: ${x.question.replace(/\n/g, ' ')}\nH: ${x.hint}\nE: ${(x.explanation || '').replace(/\n/g, ' ')}\nalone: ${r.hintAlone}\n\n`; }
  fs.writeFileSync(SC + '/oksample.txt', s);
  fs.writeFileSync(SC + '/oksample-ids.json', JSON.stringify(pick.map(r => r.id)));
  console.log('judge ok', oks.length, 'sample', n, 'chars', s.length);
} else {
  const claims = [];
  for (const r of judged) for (const f of (r.facts || [])) if (f.result === 'true' && f.basis !== 'web' && !f.proposal) claims.push({ id: r.id, path: byId.get(r.id).path, claim: f.claim, answer: byId.get(r.id).answer, hint: byId.get(r.id).hint });
  const pick = shuffle(claims).slice(0, 60);
  fs.writeFileSync(SC + '/true60-input.json', JSON.stringify(pick, null, 1));
  let s = ''; for (const c of pick) s += `#${c.id} (${c.path}) A=${c.answer}\n  CLAIM: ${c.claim}\n  HINT: ${c.hint}\n`;
  fs.writeFileSync(SC + '/true60-input.txt', s);
  console.log('knowledge-true claims', claims.length, 'sample', pick.length);
}
