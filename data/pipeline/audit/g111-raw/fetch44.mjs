import fs from 'fs';
for(const t of process.argv.slice(2)){
  for(let k=0;k<6;k++){
    const u='https://ko.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&formatversion=2&titles='+encodeURIComponent(t);
    const r=await fetch(u,{headers:{'User-Agent':'quiz-research/1.0'}});
    if(r.status==429){await new Promise(r=>setTimeout(r,25000));continue;}
    const p=(await r.json()).query.pages[0];const e=p.extract||'';fs.writeFileSync(t+'.txt',e);console.log(t,'->',p.title,e.length);break;
  }
  await new Promise(r=>setTimeout(r,3000));
}
