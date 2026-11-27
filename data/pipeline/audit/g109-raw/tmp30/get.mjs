import fs from 'fs';
const [lang,...titles]=process.argv.slice(2);
for(const t of titles){
  const f=`data/pipeline/audit/g109-raw/tmp30/${lang}-${t.replace(/[\/ ]/g,'_')}.txt`;
  if(fs.existsSync(f))continue;
  for(let i=0;i<3;i++){
  const r=await fetch(`https://${lang}.wikipedia.org/w/index.php?title=${encodeURIComponent(t)}&action=raw`,{headers:{'User-Agent':'quiz-research/1.0'}});
  if(r.status==429){await new Promise(s=>setTimeout(s,30000));continue}
  const x=await r.text(); fs.writeFileSync(f,x); console.log(f,r.status,x.length); break;}
}
