import fs from 'fs';
const [lang,...ts]=process.argv.slice(2);
for(const t of ts){
 const u=`https://${lang}.wikipedia.org/w/index.php?title=${encodeURIComponent(t)}&action=raw`;
 let txt='';
 for(let i=0;i<3;i++){const r=await fetch(u,{headers:{'User-Agent':'quizresearch/1.0'}});txt=await r.text();if(r.status==429||txt.startsWith('You are making')){await new Promise(s=>setTimeout(s,5000));continue}break;}
 fs.writeFileSync(`${lang}_${t.replace(/[ ()\/]/g,'_')}.txt`,txt);
 console.log(t,txt.length,txt.slice(0,40).replace(/\n/g,' '));
 await new Promise(s=>setTimeout(s,1500));
}
