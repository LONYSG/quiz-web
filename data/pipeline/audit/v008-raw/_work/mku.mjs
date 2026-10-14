import fs from 'node:fs';
const done = new Set(['3506', '3348', '3391', '3425', '3510', '3949']);
const txt = fs.readFileSync('t1.txt', 'utf8') + '\n' + fs.readFileSync('t2.txt', 'utf8');
const blocks = txt.split(/\n(?=### )/).filter((b) => b.startsWith('###'));
const keep = blocks.filter((b) => !done.has(b.match(/### #(\d+)/)[1]));
const h = Math.ceil(keep.length / 2);
const parts = { u1: keep.slice(0, h), u2: keep.slice(h) };
const p = fs.readFileSync('t1.prompt.txt', 'utf8');
const note = '★★ 이전 확인자가 "내 지식" 으로 판정해 무효가 됐다. 이번에는 **항목마다 반드시 WebFetch 로 문서를 최소 하나 열어** 주장을 대조한다. 지식만으로 true 를 달지 않는다 — 문서를 못 열었거나 문서에 없으면 unverified 다(basis 는 web 일 때만 true/false). 한 항목에 문서 하나로 여러 주장을 닫아도 된다. WebFetch 횟수가 항목 수보다 훨씬 적으면 다시 한다.\n\n방법:';
for (const [k, b] of Object.entries(parts)) {
  fs.writeFileSync(k + '.txt', b.join('\n')); fs.writeFileSync(k + '.refs.json', JSON.stringify(b.map((x) => x.match(/### #(\d+)/)[1])));
  fs.writeFileSync(k + '.prompt.txt', p.replaceAll('t1', k).replace('방법:', note));
  console.log(k, b.length);
}
