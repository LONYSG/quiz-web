import fs from 'node:fs';
const D='data/pipeline/audit/v037-raw/';const R=JSON.parse(fs.readFileSync('data/pipeline/audit/v037-refurb.json','utf8')).items;const T=new Map(JSON.parse(fs.readFileSync(D+'targets.json','utf8')).items.map(i=>[i.id,i]));
const ids=process.argv[2].split(',');
for(const id of ids){const x=R.find(r=>r.id===id),t=T.get(id);console.log(`## ${id} g${x.grade} ans=${t.display_answer} var=${(t.variants||[]).join('/')} | guess=${x.guess}→${x.guess2||''}\nQ0: ${t.question_text}\nQ1: ${x.fix_text}\nH: ${(t.general_hint||'').slice(0,90)} | refit=${x.hint_refit} ${x.hint_why||''}\n`)}
