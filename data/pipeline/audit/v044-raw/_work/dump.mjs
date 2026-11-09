import fs from 'node:fs';
for (const s of process.argv.slice(2)) { const t=JSON.parse(fs.readFileSync('data/minigame/topics/'+s+'.json'));
 console.log('## '+s+' '+t.nameKo+' ('+t.items.length+')');
 for (const i of t.items) console.log(i.id.split('-').pop()+' | '+i.name+(i.variants.length?' ['+i.variants.join(';')+']':'')+' | '+i.sub+' | '+i.era+' | d'+i.diff+' | fool: '+i.fool.join(' / ')); }
