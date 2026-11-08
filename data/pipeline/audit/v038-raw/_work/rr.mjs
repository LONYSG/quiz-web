import fs from 'node:fs';
const D='data/pipeline/audit/v038-raw/';const R=JSON.parse(fs.readFileSync('data/pipeline/audit/v038-refurb.json','utf8')).items;const T=new Map(JSON.parse(fs.readFileSync(D+'targets.json','utf8')).items.map(i=>[i.id,i]));
const [a,b]=process.argv.slice(2).map(Number);const F=R.filter(x=>x.fix_text).slice(a,b);
for(const x of F){const t=T.get(x.id);
 console.log(`#${x.id} ${x.group} g${x.grade} ans=${t.display_answer} ${x.guess_hit?'':'MISS '}${x.guess2_hit?'':'MISS2 '}${x.flags?.length?'F:'+x.flags.join(';').slice(0,70):''}\n Q0: ${t.question_text}\n Q1: ${x.fix_text}\n H: ${(t.general_hint||'').slice(0,60)}`)}
