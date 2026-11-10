import fs from 'fs';
const d='data/minigame/topics/';const out='data/pipeline/audit/v046-raw/';
for(const f of fs.readdirSync(d).filter(x=>x.startsWith('metro-'))){
 const j=JSON.parse(fs.readFileSync(d+f,'utf8'));
 fs.writeFileSync(out+'_work/in-'+j.topic+'.txt',`# ${j.topic} | ${j.nameKo} | scope: ${j.scope} | count ${j.items.length}\n`+j.items.map(i=>`${i.id}\t${i.name}\t${(i.variants||[]).join(' | ')}`).join('\n')+'\n');
}
const k=JSON.parse(fs.readFileSync(d+'kr-municipality.json','utf8'));
console.log(k.verify.pending, JSON.stringify(k.verify).slice(0,0));
const add=k.items.slice(227);
console.log(add.length, add[0].id, add[0].name);
fs.writeFileSync(out+'_work/in-kr-muni-add.txt',add.map(i=>`${i.id}\t${i.name}\t${(i.variants||[]).join(' | ')}`).join('\n')+'\n');
fs.writeFileSync(out+'_work/in-kr-muni-all-names.txt',k.items.map(i=>i.name).join('\n'));
