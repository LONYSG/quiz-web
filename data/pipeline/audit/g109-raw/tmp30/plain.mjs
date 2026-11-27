import fs from 'fs';
const [lang,...titles]=process.argv.slice(2);
for(const t of titles){
  const f=`p-${lang}-${t.replace(/[\/ ]/g,'_')}.txt`;
  if(fs.existsSync(f))continue;
  for(let i=0;i<3;i++){
  const r=await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(t)}`,{headers:{'User-Agent':'quiz-research/1.0'}});
  if(r.status==429){await new Promise(s=>setTimeout(s,30000));continue}
  const j=await r.json(); const p=Object.values(j.query.pages)[0]; fs.writeFileSync(f,(p.title||'')+'\n'+(p.extract||'')); console.log(f,(p.extract||'').length); break;}
}
