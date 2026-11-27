import fs from 'fs';
const L=process.argv[2]; const titles=process.argv.slice(3);
for(const t of titles){
  const u=`https://${L}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(t)}`;
  for(let i=0;i<4;i++){
    const r=await fetch(u,{headers:{'User-Agent':'quiz-research/1.0'}});
    if(r.status==429){await new Promise(r=>setTimeout(r,30000));continue;}
    const j=await r.json(); const p=Object.values(j.query.pages)[0];
    fs.writeFileSync(`${L}-${t.replace(/[\/ ]/g,'_')}.txt`,p.extract||'(none)');
    console.log(L,t,(p.extract||'').length);break;
  }
}
