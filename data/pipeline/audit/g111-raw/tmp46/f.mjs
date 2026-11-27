import fs from 'fs';
const lang=process.env.L||'ko';
for(const t of process.argv.slice(2)){
  for(let k=0;k<6;k++){
  const u=`https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&formatversion=2&titles=`+encodeURIComponent(t);
  const r=await fetch(u,{headers:{'User-Agent':'quiz-research/1.0'}});
  if(r.status==429){await new Promise(r=>setTimeout(r,25000));continue;}
  const txt=await r.text();
  try{const p=JSON.parse(txt).query.pages[0];const e=p.extract||'';fs.writeFileSync(lang+'-'+t+'.txt',e);console.log(t,'->',p.title,e.length);}catch(e){console.log(t,'ERR',r.status)}
  break;}
  await new Promise(r=>setTimeout(r,4000));
}
