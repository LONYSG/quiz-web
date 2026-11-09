import fs from 'node:fs';
const D='data/minigame/topics/';
for (const s of process.argv.slice(2)) { const t=JSON.parse(fs.readFileSync(D+s+'.json'));
 console.log('## '+s+' ['+t.kind+'] '+t.nameKo+' tags='+t.tags);
 for (const i of t.items) console.log(i.id.split('-').pop()+' | '+i.name+(i.label?' {label:'+i.label+'}':'')+' | '+(i.variants||[]).join(' ; ')+(i.note?' (note:'+i.note+')':'')+(i.year?' y'+i.year:''));}
