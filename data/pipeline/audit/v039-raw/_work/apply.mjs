import fs from 'node:fs';
const D='C:/work/quiz-web/data/minigame/topics/',R='C:/work/quiz-web/data/pipeline/audit/v039-raw/';
const sum=[];
for(const f of fs.readdirSync(D)){const slug=f.replace('.json','');const s=fs.readFileSync(D+f,'utf8');const j=JSON.parse(s);
  const before=JSON.stringify({...j,verify:null,status:null});
  const v=JSON.parse(fs.readFileSync(R+slug+'.verify.json','utf8'));
  j.verify=v;j.status=v.verdict;
  const after=JSON.stringify({...j,verify:null,status:null});if(before!==after)throw new Error('changed other fields '+slug);
  const nl=s.endsWith('\r\n')?'\r\n':s.endsWith('\n')?'\n':'';
  fs.writeFileSync(D+f,JSON.stringify(j,null,1)+nl);
  sum.push({slug,kind:j.kind,items:j.items.length,status:j.status,sourcesRead:v.sources.every(x=>x.read),missing:v.missing.length,extra:v.extra.length,rename:v.rename.length,fixes:v.fixes.length,why:v.why});
}
fs.writeFileSync('C:/work/quiz-web/data/pipeline/audit/v039-topics.json',JSON.stringify({round:'V039',at:new Date().toISOString(),sets:sum},null,1));
console.log(sum.map(x=>`${x.slug} ${x.status} items${x.items} m${x.missing} e${x.extra} r${x.rename} f${x.fixes}`).join('\n'));
