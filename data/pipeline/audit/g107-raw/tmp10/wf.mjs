import {writeFileSync,existsSync,readFileSync} from 'node:fs';
const [lang,...titles]=process.argv.slice(2);
for(const t of titles){
 const f=`${lang}-${t.replace(/[^\w가-힣]/g,'_')}.txt`;
 let s;
 if(existsSync(f)) s=readFileSync(f,'utf8'); else {
  const r=await fetch(`https://${lang}.wikipedia.org/w/index.php?title=${encodeURIComponent(t)}&action=raw`,{headers:{'User-Agent':'quizbot-research/1.0'},redirect:'follow'});
  s=r.status==200?await r.text():`ERR ${r.status}`; if(r.status==200)writeFileSync(f,s); await new Promise(r=>setTimeout(r,1200));
 }
 console.log('#####',t,s.length);
}
