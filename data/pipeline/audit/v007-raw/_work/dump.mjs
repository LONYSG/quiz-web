// 재독용 출력 — node dump.mjs jN [mode] [extra,refs]
//   mode: nonok(기본: fix·drop·unsure) | border(selfJudge 경계 중 ok) | ok(ok 전부) | refs(extra 만)
import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v7';
const RAW = 'C:/work/quiz-web/data/pipeline/audit/v007-raw';
const [, , piece, mode = 'nonok', extra = ''] = process.argv;
const out = JSON.parse(fs.readFileSync(`${RAW}/${piece}.out.json`, 'utf8'));
const items = new Map(JSON.parse(fs.readFileSync(SC + '/items.json', 'utf8')).map((x) => [x.ref, x]));
const want = new Set(extra.split(',').filter(Boolean));
const one = (s) => (s ?? '').toString().replace(/\s*\n\s*/g, ' ');
const c = {}; for (const r of out) c[r.verdict] = (c[r.verdict] || 0) + 1;
console.log(piece, out.length, JSON.stringify(c));
for (const r of out) {
  const x = items.get(r.ref);
  const pick = mode === 'refs' ? want.has(r.ref) : mode === 'nonok' ? (r.verdict !== 'ok' || want.has(r.ref)) : mode === 'border' ? (r.verdict === 'ok' && x.selfJudge !== '좋은 어려움') : mode === 'ok' ? r.verdict === 'ok' : false;
  if (!pick) continue;
  console.log(`## ${r.ref} [${r.verdict}] ${(r.categories || []).join(',')}  ${x.topic}/${x.sub}  A=${x.answer}${x.variants.length ? ' V=' + x.variants.join('|') : ''}  dif GEN${x.score.dif}→${r.score?.dif} wor${x.score.wor}${r.score?.wor ? '→' + r.score.wor : ''}  sj=${x.selfJudge}`);
  console.log(' Q: ' + one(x.question)); console.log(' E: ' + one(x.explanation)); console.log(' H: ' + one(x.hint));
  console.log(' difWhy: ' + one(r.score?.difWhy));
  console.log(' reason: ' + one(r.reason));
  if (r.hintRead) console.log(' hintRead: alone=' + one(r.hintRead.alone) + ' | ' + one(r.hintRead.rules));
  const p = r.proposal || {};
  for (const k of ['question', 'explanation', 'hint', 'variants', 'layer', 'score']) if (p[k] != null) console.log(` PROP.${k}: ` + (typeof p[k] === 'string' ? p[k] : JSON.stringify(p[k])));
  if (r.dup) console.log(' dup: ' + one(JSON.stringify(r.dup)));
  if (r.note) console.log(' note: ' + one(r.note));
  const bad = (r.facts || []).filter((f) => f.result !== 'true');
  if (bad.length) console.log(' FACTS≠true: ' + bad.map((f) => `[${f.where}] ${one(f.claim)} => ${f.result}`).join(' || '));
  console.log();
}
