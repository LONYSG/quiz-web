import fs from 'fs';
const [,, title, kw, lang='en', n='3'] = process.argv;
const f = `x-${lang}-${title.replace(/[^\w가-힣]/g,'_')}.txt`;
async function get(){
  const u=`https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=${encodeURIComponent(title)}`;
  for(let i=0;i<3;i++){
    try{const r=await fetch(u,{headers:{'User-Agent':'quizbot-research/1.0'}}); if(r.ok){const j=await r.json();const p=Object.values(j.query.pages)[0];if(p.extract)return p.extract;} }catch(e){}
    await new Promise(r=>setTimeout(r,6000));
  }
  return '';
}
let t = fs.existsSync(f)?fs.readFileSync(f,'utf8'):'';
if(t.length<5){t=await get(); if(t) fs.writeFileSync(f,t); await new Promise(r=>setTimeout(r,2500));}
console.log(`=== ${title} (${t.length})`);
const re=new RegExp(kw,'i');
let c=0;
for(const s of t.split(/\n/)){ if(re.test(s)){ // print sentences matching
  for(const x of s.split(/(?<=[.!?。다])\s+/)){ if(re.test(x)){console.log('  -',x.slice(0,420)); if(++c>=+n) break;} } if(c>=+n)break;}}
