// web-desk/check — 표본 300: 질문이 대표 사실을 묻는가(core/tidbit) + 난이도 블라인드(1~5). DB 를 열지 않는다(파일만).
//   node web-desk/check/_build.mjs  → 보낼것/조각-NN.txt · 받은것/결과-NN.json(빈 파일) · _정답.json(지금 등급 — 웹에 올리지 않는다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
// DB 가 꺼져 있을 때도 돌게 파일로 활성 집합을 세운다: 실린 카드(ready) − G097 끔 + G098 켬 − G098 끔 (지금 등급 = 재료의 meta.difficulty.now)
const OUT = path.join(ROOT, "web-desk/tone/보낼것");
const IN = path.join(ROOT, "web-desk/tone/받은것");
const answer = new Map(), gradeNow = new Map();
for (const f of fs.readdirSync(OUT).filter(f => /^재료-[0-9]{3}[.]json$/.test(f))) {
  const j = JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8"));
  for (const it of j.items || j.cards || []) { answer.set(it.id, it.answer); gradeNow.set(it.id, it.meta?.difficulty?.now ?? null); }
}
const S = v => typeof v === "string" ? v : (v && v.text) || "";
const ready = new Map();
for (const f of fs.readdirSync(IN).filter(f => /^카드-[0-9]{3}[.]json$/.test(f))) {
  const j = JSON.parse(fs.readFileSync(path.join(IN, f), "utf8"));
  for (const r of j.results || []) if (r.status === "ready" && S(r.question)) ready.set(r.id, S(r.question));
}
const T = path.join(ROOT, "data/pipeline/tone");
const g97 = JSON.parse(fs.readFileSync(path.join(T, "g097-apply.json"), "utf8"));
const g98 = JSON.parse(fs.readFileSync(path.join(T, "g098-apply.json"), "utf8"));
const offNow = new Set(g97.deactivate.map(x => x.id));
for (const x of g98.activate || []) offNow.delete(x.id);
for (const x of g98.deactivate || []) offNow.add(x.id);
offNow.add(4528);
for (const x of g98.items || []) if (x.question_text?.after) ready.set(x.id, x.question_text.after);
const rows = [...ready].filter(([id]) => !offNow.has(id) && [1, 2, 3, 4, 5].includes(gradeNow.get(id))).map(([id, q]) => ({ id, question_text: q, g: gradeNow.get(id) }));
const off = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'web-desk/pick/_swap.json'), 'utf8')).map(s => s.off)); // G099 가 끌 카드
const pool = rows.filter(r => !off.has(r.id) && answer.get(r.id));

// 씨앗 고정 무작위 · 등급마다 60장
let seed = 20261117;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const picked = [];
for (const g of [1, 2, 3, 4, 5]) picked.push(...shuffle(pool.filter(r => r.g === g)).slice(0, 60));
shuffle(picked);

fs.mkdirSync(path.join(here, '보낼것'), { recursive: true });
fs.mkdirSync(path.join(here, '받은것'), { recursive: true });
const key = {};
const PER = 100;
let n = 0;
for (let i = 0; i < picked.length; i += PER) {
  n++;
  const nn = String(n).padStart(2, '0');
  const part = picked.slice(i, i + PER);
  const lines = [`조각 ${nn} — 카드 ${part.length}장. 지시서대로 카드마다 q 와 grade 를 매긴다.`, ''];
  for (const r of part) { lines.push(`[${r.id}] 정답: ${answer.get(r.id)}`, `질문: ${r.question_text}`, ''); key[r.id] = { chunk: nn, grade_now: r.g }; }
  fs.writeFileSync(path.join(here, '보낼것', `조각-${nn}.txt`), lines.join('\n'));
  const out = path.join(here, '받은것', `결과-${nn}.json`);
  if (!fs.existsSync(out)) fs.writeFileSync(out, '');
}
fs.writeFileSync(path.join(here, '_정답.json'), JSON.stringify(key, null, 1));
console.log('활성', rows.length, '· 뽑을 수 있는 것', pool.length, '· 표본', picked.length, '· 조각', n);
