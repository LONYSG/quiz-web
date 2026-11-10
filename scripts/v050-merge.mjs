import fs from 'fs';
const R='data/pipeline/audit/v050-raw/',G='data/pipeline/generated/g057/';
const all=JSON.parse(fs.readFileSync(R+'all.json','utf8'));const by={};all.forEach(x=>by[x.id]=x);
const J=[],B=[];for(let k=0;k<3;k++){J.push(...JSON.parse(fs.readFileSync(R+`judge-out-${k}.json`,'utf8')));B.push(...JSON.parse(fs.readFileSync(R+`blind-out-${k}.json`,'utf8')))}
const jm={};J.forEach(j=>jm[j.id]=j);
const n=s=>String(s||'').replace(/[\s·.,!?'"~\-:]/g,'').toLowerCase();
const bm={};B.forEach(b=>{const x=by[b.id];if(!x)return;const set=[x.ans,...(x.alt||[]),...(x.webAlt||[])].map(n);
 const hit=g=>g&&set.some(s=>s&&(n(g)===s||(s.length>=3&&n(g).includes(s))||(n(g).length>=3&&s.includes(n(g)))));
 bm[b.id]={ref:b.id,guess1:b.guess1,guess2:b.guess2,rank:hit(b.guess1)?'ok':hit(b.guess2)?'edge':'miss'}});
fs.writeFileSync('data/pipeline/audit/v050-blind.json',JSON.stringify(Object.values(bm),null,1));
let miss=[];for(const x of all){if(!jm[x.id])miss.push(x.id)}
console.log('no judge',miss.length,'no blind',all.filter(x=>!bm[x.id]).length);
const stat={};
for(const f of fs.readdirSync(G)){const p=G+f;const j=JSON.parse(fs.readFileSync(p,'utf8'));
 for(const it of j.items){const v=jm[it.seedId];if(!v)continue;
  it.verify={round:'V050',verdict:v.verdict,blind:(bm[it.seedId]||{}).rank||v.blind,reasons:v.reasons||[],fixes:v.fixes||[]};
  const fld=it.seed.field,s=stat[fld]||(stat[fld]={n:0,ok:0,fix:0,drop:0,b1:0,edge:0,miss:0});
  s.n++;s[v.verdict]++;s[{ok:'b1',edge:'edge',miss:'miss'}[it.verify.blind]]++}
 fs.writeFileSync(p,JSON.stringify(j,null,1)+'\n')}
fs.writeFileSync('data/pipeline/audit/v050-emoji.json',JSON.stringify(J.map(v=>({...v,blind:bm[v.id]?.rank||v.blind})),null,1));
const T={n:0,ok:0,fix:0,drop:0,b1:0,edge:0,miss:0};
for(const [k,s] of Object.entries(stat)){console.log(k,JSON.stringify(s),(100*s.b1/s.n|0)+'%');for(const q in T)T[q]+=s[q]}
console.log('TOTAL',JSON.stringify(T));
const ops={};J.forEach(v=>(v.fixes||[]).forEach(f=>ops[f.op]=(ops[f.op]||0)+1));console.log(ops);
