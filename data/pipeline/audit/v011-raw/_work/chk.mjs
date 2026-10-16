// 제안 힌트 기계 검사 (V011) — node chk.mjs <ref|id> "문구"   (DB 안 씀)
import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v11';
const { checkHint } = await import('file:///C:/work/quiz-web/scripts/hint-check.mjs');
const [key0, text] = process.argv.slice(2);
const key = String(key0).split(':')[0];
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const pool = [...J(SC + '/ga.json').map((x) => ({ k: x.ref, id: x.id, r: x.row })), ...J(SC + '/kn.json').map((x) => ({ k: x.ref, id: x.id, r: x.row })), ...J(SC + '/cv.json').map((x) => ({ k: String(x.id), id: x.id, r: x.row })), ...J(SC + '/pr.json').flatMap((x) => [{ k: x.ref, id: x.id, r: x.row }, { k: String(x.pairedId), id: x.pairedId, r: x.pairedRow }])];
const it = pool.find((p) => p.k === key || String(p.id) === key);
if (!it) { console.log('항목 없음', key); process.exit(1); }
const r = checkHint({ hint: text, answer: it.r.answer, variants: it.r.variants || [], question: it.r.question, explanation: it.r.explanation || '' });
const len = [...text].length; console.log(JSON.stringify({ len, newline: /\n/.test(text), block: r.block, warn: r.warn, ok: !r.block.length && len <= 120 && !/\n/.test(text) }));
