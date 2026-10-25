import fs from 'node:fs';
const W = 'C:/work/quiz-web/data/pipeline/audit/v028-raw/_work';
const A = JSON.parse(fs.readFileSync(W + '/anchors62.json', 'utf8'));
const EX = new Set([51, 2914, 722, 3041, 766, 160, 2367, 887, 251, 803, 2800, 781, 3230, 86, 488, 2731, 3589, 569, 1779, 4096]);
const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const blk = (x) => `### ${x.id}\n분야: ${x.category || ''}\n질문: ${one(x.question)}\n정답: ${x.dbAnswer}${x.variants?.length ? '  (변형: ' + x.variants.join(' / ') + ')' : ''}\n해설: ${one(x.explanation) || '(없음)'}\n힌트: ${one(x.hint) || '(없음)'}\n`;
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const t = A.filter((a) => !EX.has(a.id)); for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; }
const name = process.argv[2] || 's1';
fs.writeFileSync(`${W}/${name}.txt`, `## 난이도 v2 자가 시험 ${name} (${t.length}건)\n\n` + t.map(blk).join('\n'));
fs.writeFileSync(`${W}/${name}.keys.json`, JSON.stringify(t.map((x) => String(x.id))));
fs.writeFileSync(`${W}/${name}.gold.json`, JSON.stringify(Object.fromEntries(t.map((x) => [x.id, x.lvl]))));
fs.writeFileSync(`${W}/${name}.prompt.txt`, `V028 난이도 v2 판정자. 먼저 ${'C:/work/quiz-web/data/pipeline/audit/v028-raw/INSTRUCTIONS.md'} 를 Read 로 전부 읽고 그 지시대로 한다.\n입력: ${W}/${name}.txt (블록 ${t.length}개 · 순서 ${name}.keys.json)\n결과: ${W}/${name}.out.json (JSON 배열 · Write 로 직접)\n`);
console.log(t.length, Object.entries(t.reduce((m, x) => (m[x.lvl] = (m[x.lvl] || 0) + 1, m), {})));
