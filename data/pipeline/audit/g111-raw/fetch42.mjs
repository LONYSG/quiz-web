import fs from 'fs';
const titles = process.argv.slice(2);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for (const t of titles) {
  if (fs.existsSync('tmp42/'+t+'.txt')) continue;
  for (let i=0;i<8;i++){
    const u = 'https://ko.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=' + encodeURIComponent(t);
    const r = await fetch(u, {headers:{'User-Agent':'quiz-research/1.0'}});
    const s = await r.text();
    let j; try{ j=JSON.parse(s);}catch{ await sleep(45000); continue; }
    const p = Object.values(j.query.pages)[0];
    fs.writeFileSync('tmp42/' + t + '.txt', (p.title||'') + '\n' + (p.extract||'(없음)'));
    console.log(t, (p.extract||'').length); break;
  }
  await sleep(4000);
}
console.log('END');
