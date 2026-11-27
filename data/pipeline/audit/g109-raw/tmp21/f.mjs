import fs from 'fs';
const [lang, ...titles]=process.argv.slice(2);
for(const t of titles){
 const fn=`${lang}-${t}.txt`;
 if(fs.existsSync(fn)) continue;
 for(let i=0;i<4;i++){
 const r=await fetch(`https://${lang}.wikipedia.org/w/index.php?title=${encodeURIComponent(t)}&action=raw`,{headers:{'User-Agent':'quiz-research/1.0'}});
 if(r.status==429){await new Promise(s=>setTimeout(s,30000));continue;}
 const x=await r.text(); fs.writeFileSync(fn,x); console.log(t,r.status,x.length); break;}
}
