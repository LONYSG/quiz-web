import fs from 'node:fs';
const R='C:/work/quiz-web/data/pipeline/audit/v029-raw/';
const T=JSON.parse(fs.readFileSync(R+'targets.json','utf8')).items;
const L=fs.readFileSync(R+'anchors60.md','utf8').split('\n').filter(l=>/^\| \d+ \| \d+ \|/.test(l));
const out=L.map(l=>{const c=l.split('|').map(s=>s.trim());const id=+c[2];const design=+c[6].match(/\*\*(\d)\*\*/)[1];const w=c[10]?+c[10]:design;return {n:+c[1],id,answer:c[4],design,worth:w,reason:c[6].replace(/\*\*\d\*\* · /,''),kind:c[7],ex:c[8]==='✓',changed:w!==design,inDb:!!T[id]};});
fs.writeFileSync('anchors60.json',JSON.stringify(out));
console.log(out.length,out.filter(x=>x.ex).length,out.filter(x=>!x.inDb).length,out.filter(x=>x.changed).length);
for(const x of out.filter(x=>x.ex)) console.log(x.id,x.worth,x.design,x.kind,x.answer,'|',x.reason);
