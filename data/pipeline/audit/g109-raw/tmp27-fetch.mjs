import fs from 'fs';
const titles = process.argv.slice(2);
for (const t of titles) {
  const u = 'https://ko.wikipedia.org/w/index.php?title=' + encodeURIComponent(t) + '&action=raw';
  let txt='';
  for (let i=0;i<3;i++){
    const r = await fetch(u,{headers:{'User-Agent':'quiz-research/1.0'}});
    txt = await r.text();
    if (r.status==429){await new Promise(s=>setTimeout(s,30000));continue}
    break;
  }
  fs.writeFileSync(t.replace(/[\/()]/g,'_')+'.txt', txt);
  console.log(t, txt.length, txt.slice(0,50).replace(/\n/g,' '));
  await new Promise(s=>setTimeout(s,700));
}
