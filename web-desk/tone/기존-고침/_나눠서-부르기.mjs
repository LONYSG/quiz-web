// 설계 2026-11-28: G120 이 기존-고침-01.json 을 다 만들면(done:true) 40장씩 나눠 gpt(기본 = sol) 줄에 넣는다.
// node web-desk/tone/기존-고침/_나눠서-부르기.mjs [--dry]
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const IN = 'web-desk/tone/보낼것/기존-고침-01.json';
const j = JSON.parse(fs.readFileSync(IN, 'utf8').replace(/^﻿/, ''));
if (j.done !== true) { console.error('아직 done 아님'); process.exit(2); }
const arr = Array.isArray(j.items) ? j.items : Object.values(j).find(Array.isArray);
const rank = (it) => { const w = JSON.stringify(it.why ?? it); return /재료|fix|V116|앞 판|사실/.test(w) ? 0 : /wide|좁힘|lack/.test(w) ? 1 : 2; };
const items = arr.map((it, i) => [rank(it), i, it]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
const tpl = fs.readFileSync('web-desk/tone/기존-고침/_틀.md', 'utf8');
const SIZE = 40; const parts = [];
for (let i = 0; i < items.length; i += SIZE) parts.push(items.slice(i, i + SIZE));
parts.forEach((p, k) => {
  const P = String(k + 1).padStart(2, '0');
  const inP = `web-desk/tone/보낼것/기존-고침-01-p${P}.json`;
  const outP = `web-desk/tone/받은것/기존-고침-01-p${P}.json`;
  const brief = `web-desk/tone/기존-고침/지시-p${P}.md`;
  fs.writeFileSync(inP, JSON.stringify({ done: true, note: `${IN} 의 ${k * SIZE + 1}~${k * SIZE + p.length}번째(사실 어긋남 먼저)`, items: p }, null, 1));
  fs.writeFileSync(brief, tpl.replaceAll('{{P}}', P).replaceAll('{{IN}}', inP).replaceAll('{{OUT}}', outP).replaceAll('{{N}}', String(p.length)));
  console.log(P, p.length, inP);
  if (!process.argv.includes('--dry')) spawnSync('node', ['scripts/gpt-run.mjs', '--brief', brief, '--out', outP, '--label', `기존고침-p${P}`], { stdio: 'inherit' });
});
console.log('묶음', parts.length, '장', items.length);
