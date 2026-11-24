import fs from 'fs';
const [,, lang, ...titles]=process.argv;
for(const t of titles){
  const f=`${lang}-${t.replace(/[\/ ]/g,'_')}.txt`;
  if(fs.existsSync(f)) continue;
  for(let i=0;i<4;i++){
    try{
    const r=await fetch(`https://${lang}.wikipedia.org/w/index.php?title=${encodeURIComponent(t)}&action=raw`,{headers:{'User-Agent':'quiz-research/1.0'}});
    if(r.status==429){await new Promise(s=>setTimeout(s,30000));continue;}
    const x=await r.text(); fs.writeFileSync(f,r.ok?x:'ERR '+r.status); console.log(t,r.status,x.length); break;
    }catch(e){console.log(t,'fail');await new Promise(s=>setTimeout(s,5000));}
  }
}
