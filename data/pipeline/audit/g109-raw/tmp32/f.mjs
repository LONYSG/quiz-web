import fs from 'fs';
const [lang,...ts]=process.argv.slice(2);
for(const t of ts){
 const u=`https://${lang}.wikipedia.org/w/index.php?title=${encodeURIComponent(t)}&action=raw`;
 let r;for(let i=0;i<3;i++){r=await fetch(u,{headers:{'User-Agent':'quiz-research/1.0'}});if(r.status!=429)break;await new Promise(s=>setTimeout(s,30000));}
 const x=await r.text();fs.writeFileSync(`${lang}-${t}.txt`,x);console.log(lang,t,r.status,x.length);
}
