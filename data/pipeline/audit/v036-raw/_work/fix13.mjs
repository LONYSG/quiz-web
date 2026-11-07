import fs from 'node:fs';
let d = fs.readFileSync('docs/13-PENDING-CHECKS.md', 'utf8');
const rep = (a, b) => { if (!d.includes(a)) { console.log('MISS', a.slice(0, 40)); return; } d = d.replace(a, b); };
rep('(V036 ★ ①·② )', '(V036 ★ ①·② `audit/v036-g032.json`)');
rep('(V036  항목마다', '(V036 `audit/v036-g032.json` 항목마다');
rep('id 는 JSON )', 'id 는 JSON `hint==fix`)');
rep('다른 문항의  를 어느', '다른 문항의 `difficulty` 를 어느');
rep(' ·  ·  · 조각 10 ·', ' · `ai-out/V036.txt` · `audit/v036-g032.json` · 조각 10 ·');
// join the broken line in CV-154
d = d.replace(/hint_fix 의 ?\n? ?이스케이프/, 'hint_fix 의 `\\n` 이스케이프');
fs.writeFileSync('docs/13-PENDING-CHECKS.md', d);
const i = d.indexOf('| CV-154');
console.log(d.slice(i, d.indexOf('\n| CV-155', i)).split('\n').length, 'lines in CV-154');
