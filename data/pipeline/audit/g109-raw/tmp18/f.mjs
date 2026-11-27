import fs from 'fs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for (const t of process.argv.slice(2)) {
  for (let i=0;i<4;i++){
    const r = await fetch(`https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(t)}&action=raw`,{headers:{'User-Agent':'quiz-research/1.0'}});
    const s = await r.text();
    if (r.ok && !s.startsWith('<!DOCTYPE')) {
      let x=s.replace(/<ref[^>]*\/>/g,'').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g,'').replace(/<!--[\s\S]*?-->/g,'');
      for(let k=0;k<6;k++) x=x.replace(/\{\{[^{}]*\}\}/g,'');
      x=x.replace(/\[\[(?:File|Image|Category):[^\]]*(\[\[[^\]]*\]\][^\]]*)*\]\]/g,'').replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g,'$2').replace(/'''?/g,'').replace(/<[^>]+>/g,'').replace(/\[https?:[^ \]]* ?([^\]]*)\]/g,'$1');
      fs.writeFileSync(`en-${t}.txt`,x); console.log(t,x.length); break;
    }
    console.log('retry',t,r.status); await sleep(20000);
  }
  await sleep(4000);
}
