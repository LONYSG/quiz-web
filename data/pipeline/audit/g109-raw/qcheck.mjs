// G109 — quote 가 에이전트가 받아 둔 원문(tmpNN/)에 글자 그대로 있는지(공백 · 위키 마크업 느슨하게)
//   node data/pipeline/audit/g109-raw/qcheck.mjs 16 [17 …]
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
const D = 'data/pipeline/audit/g109-raw/';
const flat = (s) => String(s).replace(/<[^>]+>/g, '').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'''?|\{\{[^}]*\}\}|&nbsp;|[\s"“”'‘’]/g, '').toLowerCase();
const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => walk(p + '/' + f)) : [p]);
for (const nn of process.argv.slice(2)) {
  const tdir = `${D}tmp${nn}`; const j = JSON.parse(readFileSync(`${D}chunk-${nn}.json`, 'utf8'));
  const blob = existsSync(tdir) ? walk(tdir).map((f) => flat(readFileSync(f, 'utf8'))).join('\n') : '';
  let all = 0, ok = 0; const miss = [];
  for (const it of j.items) for (const [k, l] of [['core', it.core], ...(it.story || []).map((s, i) => [`story${i + 1}`, s]), ['hint', it.hintIdea]]) {
    if (!l?.quote) continue; all++;
    const q = flat(l.quote); const part = q.slice(0, Math.min(40, q.length));
    if (blob.includes(q) || (q.length > 60 && blob.includes(part) && blob.includes(q.slice(-30)))) ok++; else miss.push(`${it.key} ${it.answer} ${k}`);
  }
  console.log(`${nn} quote ${ok}/${all} 원문에서 찾음${blob ? '' : ' (tmp 폴더 없음)'}`); if (miss.length) console.log('   못 찾음:', miss.join(' · '));
}
