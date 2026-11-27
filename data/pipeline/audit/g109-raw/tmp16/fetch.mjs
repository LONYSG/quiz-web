import fs from 'fs';
const [lang,title,out]=process.argv.slice(2);
const u=`https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=${encodeURIComponent(title)}`;
for(let i=0;i<6;i++){
 const r=await fetch(u,{headers:{'User-Agent':'quiz-research/1.0'}});
 const t=await r.text();
 try{const j=JSON.parse(t);const p=Object.values(j.query.pages)[0];
 fs.writeFileSync(out,(p.title||'')+'\n'+(p.extract||'(none)'));console.log(out,(p.extract||'').length,p.title);process.exit(0);}catch{await new Promise(r=>setTimeout(r,30000));}
}
console.log(out,'FAIL');
