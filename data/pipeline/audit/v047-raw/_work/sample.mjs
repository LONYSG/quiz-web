import fs from 'fs';
const d='data/minigame/topics/';const SEED=20261110;
let s=SEED;const rnd=()=>{s=(s*1664525+1013904223)>>>0;return s/2**32};
const files=fs.readdirSync(d).filter(f=>/^draw-/.test(f)).filter(f=>{const j=JSON.parse(fs.readFileSync(d+f,'utf8'));return j.createdRound==='G051'});
const sets=files.map(f=>{const j=JSON.parse(fs.readFileSync(d+f,'utf8'));return {topic:j.topic,items:j.items,status:j.status}});
const total=sets.reduce((a,x)=>a+x.items.length,0);console.log(files.length,total,sets.map(x=>x.topic+':'+x.items.length+':'+x.status).join(' '));
// largest remainder allocation
let alloc=sets.map(x=>({x,q:300*x.items.length/total}));alloc.forEach(a=>a.n=Math.floor(a.q));
let rem=300-alloc.reduce((a,b)=>a+b.n,0);alloc.sort((a,b)=>(b.q-b.n)-(a.q-a.n));for(let i=0;i<rem;i++)alloc[i].n++;
const out=[];
for(const a of alloc){const idx=a.x.items.map((_,i)=>i);for(let i=idx.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[idx[i],idx[j]]=[idx[j],idx[i]]}
 for(const i of idx.slice(0,a.n)){const it=a.x.items[i];out.push({topic:a.x.topic,id:it.id,name:it.name,variants:it.variants||[]})}}
fs.writeFileSync('data/pipeline/audit/v047-raw/sample.json',JSON.stringify({seed:SEED,total,n:out.length,items:out},null,1));
fs.writeFileSync('data/pipeline/audit/v047-raw/_work/sample.txt',out.map((o,i)=>`${i}\t${o.topic.replace('draw-','')}\t${o.name}\t${o.variants.join('|')}`).join('\n'));
console.log(out.length);
