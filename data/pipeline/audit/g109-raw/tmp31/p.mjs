import fs from 'fs';
const [lang,...titles]=process.argv.slice(2);
for(const t of titles){
  const u=`https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(t)}`;
  let r;
  for(let i=0;i<3;i++){ r=await fetch(u,{headers:{'User-Agent':'quiz-research/1.0'}}); if(r.status!=429)break; await new Promise(s=>setTimeout(s,30000)); }
  const j=await r.json(); const pg=Object.values(j.query.pages)[0];
  fs.writeFileSync(`P-${lang}-${t.replace(/[\/:]/g,'_')}.txt`,pg.extract||'');
  console.log(lang,t,r.status,(pg.extract||'').length);
}
