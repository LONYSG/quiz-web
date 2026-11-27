import fs from 'fs';import {execFileSync} from 'child_process';
const [lang, ...titles]=process.argv.slice(2);
for(const t of titles){
 const fn=`p-${lang}-${t}.txt`;
 if(fs.existsSync(fn)&&fs.statSync(fn).size>0) continue;
 for(let i=0;i<4;i++){
  try{
  const o=execFileSync('curl',['-s','-m','25','-A','quiz-research/1.0',`https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(t)}`],{maxBuffer:1e8}).toString();
  const j=JSON.parse(o);const pg=Object.values(j.query.pages)[0];const x=pg.extract||'';fs.writeFileSync(fn,x);console.log(t,pg.title,x.length);break;
  }catch(e){console.log('retry',t);execFileSync('sleep',['10']);}
 }
}
