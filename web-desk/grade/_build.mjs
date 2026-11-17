// web-desk/grade — 지금 등급 4 · 5 인 활성 카드의 난이도를 블라인드로 다시 매기기(웹 계정용). DB 를 열지 않는다(파일만).
//   node web-desk/grade/_build.mjs  → 보낼것/조각-NN.txt · 받은것/결과-NN.json(빈 파일) · _정답.json(지금 등급 — 웹에 올리지 않는다)
//   표본 300(web-desk/check)에서 이미 매긴 카드는 뺀다(그 결과를 그대로 쓴다).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const OUT = path.join(ROOT, 'web-desk/tone/보낼것');
const IN = path.join(ROOT, 'web-desk/tone/받은것');
const answer = new Map(), gradeNow = new Map();
for (const f of fs.readdirSync(OUT).filter(f => /^재료-[0-9]{3}[.]json$/.test(f))) {
  const j = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
  for (const it of j.items || j.cards || []) { answer.set(it.id, it.answer); gradeNow.set(it.id, it.meta?.difficulty?.now ?? null); }
}
const S = v => typeof v === 'string' ? v : (v && v.text) || '';
const ready = new Map();
for (const f of fs.readdirSync(IN).filter(f => /^카드-[0-9]{3}[.]json$/.test(f))) {
  const j = JSON.parse(fs.readFileSync(path.join(IN, f), 'utf8'));
  for (const r of j.results || []) if (r.status === 'ready' && S(r.question)) ready.set(r.id, S(r.question));
}
const T = path.join(ROOT, 'data/pipeline/tone');
const g97 = JSON.parse(fs.readFileSync(path.join(T, 'g097-apply.json'), 'utf8'));
const g98 = JSON.parse(fs.readFileSync(path.join(T, 'g098-apply.json'), 'utf8'));
const offNow = new Set(g97.deactivate.map(x => x.id));
for (const x of g98.activate || []) offNow.delete(x.id);
for (const x of g98.deactivate || []) offNow.add(x.id);
offNow.add(4528); // G099
for (const x of g98.items || []) if (x.question_text?.after) ready.set(x.id, x.question_text.after);
// G099 의 맞바꾸기(폭스바겐 S0745 는 뺀 묶음)
const SKIP = new Set(['S0173', 'S0439', 'S0537', 'S0800', 'S0745']);
for (const s of JSON.parse(fs.readFileSync(path.join(ROOT, 'web-desk/pick/_swap.json'), 'utf8'))) if (!SKIP.has(s.key)) { offNow.delete(s.on); offNow.add(s.off); }
const done = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'web-desk/check/_정답.json'), 'utf8'))).map(Number));
const pool = [...ready].filter(([id]) => !offNow.has(id) && !done.has(id) && answer.get(id) && [4, 5].includes(gradeNow.get(id)))
  .map(([id, q]) => ({ id, q, g: gradeNow.get(id) }));

let seed = 20261117;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }

fs.mkdirSync(path.join(here, '보낼것'), { recursive: true });
fs.mkdirSync(path.join(here, '받은것'), { recursive: true });
const key = {};
const PER = 200;
let n = 0;
for (let i = 0; i < pool.length; i += PER) {
  n++;
  const nn = String(n).padStart(2, '0');
  const part = pool.slice(i, i + PER);
  const lines = [`조각 ${nn} — 카드 ${part.length}장. 지시서대로 카드마다 grade 를 매긴다.`, ''];
  for (const r of part) { lines.push(`[${r.id}] 정답: ${answer.get(r.id)}`, `질문: ${r.q}`, ''); key[r.id] = { chunk: nn, grade_now: r.g }; }
  fs.writeFileSync(path.join(here, '보낼것', `조각-${nn}.txt`), lines.join('\n'));
  const out = path.join(here, '받은것', `결과-${nn}.json`);
  if (!fs.existsSync(out)) fs.writeFileSync(out, '');
}
fs.writeFileSync(path.join(here, '_정답.json'), JSON.stringify(key, null, 1));
console.log('등급 4 · 5 활성(표본 뺌)', pool.length, '· 등급 4:', pool.filter(r => r.g === 4).length, '· 5:', pool.filter(r => r.g === 5).length, '· 조각', n);
