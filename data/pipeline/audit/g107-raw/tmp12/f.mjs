import fs from 'fs';
const lang=process.argv[2];
for(const t of process.argv.slice(3)){
 const u=`https://${lang}.wikipedia.org/w/index.php?title=${encodeURIComponent(t.replace(/ /g,'_'))}&action=raw`;
 let r=await fetch(u,{headers:{'User-Agent':'quizcollect/1.0 (research)'},redirect:'follow'});
 let x=await r.text();
 if(r.status!=200){console.log(t,r.status);continue}
 for(let i=0;i<3;i++){x=x.replace(/\{\{[^{}]*\}\}/g,'')}
 x=x.replace(/<ref[^>]*\/>/g,'').replace(/<ref[^>]*>.*?<\/ref>/gs,'').replace(/<!--.*?-->/gs,'').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g,'$1').replace(/'''?/g,'').replace(/\[\[파일:[^\]]*\]\]/g,'');
 fs.writeFileSync(`w-${lang}-${t.replace(/[\/ ?]/g,'_')}.txt`,x);
 console.log(t,r.status,x.length);
 await new Promise(s=>setTimeout(s,1200));
}
