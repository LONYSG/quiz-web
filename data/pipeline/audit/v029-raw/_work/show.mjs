import fs from 'node:fs';
const it=JSON.parse(fs.readFileSync('items.v029.json','utf8')),T=JSON.parse(fs.readFileSync('../targets.json','utf8')).items;
const ids=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const a=+process.argv[3]||0,b=+process.argv[4]||ids.length;
const one=(s)=>String(s??'').replace(/\s+/g,' ').trim();
for(const i of ids.slice(a,b)){const t=T[i],v=it[i];console.log(`${i}|w${v.worth}${v.confidence[0]}|${v.kind}|${v.why}|${t.mid||''}|Q:${one(t.question).slice(0,105)}|A:${t.answer}`);}
