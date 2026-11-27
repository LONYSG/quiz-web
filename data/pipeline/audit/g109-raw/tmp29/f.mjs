import fs from 'fs';
for (const t of process.argv.slice(2)) {
  const f = t.replace(/[\/ ]/g,'_')+'.txt';
  if (fs.existsSync(f)) continue;
  const r = await fetch('https://ko.wikipedia.org/w/index.php?title='+encodeURIComponent(t)+'&action=raw',{headers:{'User-Agent':'quiz-research/1.0'}});
  const s = await r.text(); fs.writeFileSync(f,s); console.log(t,r.status,s.length);
  await new Promise(r=>setTimeout(r,800));
}
