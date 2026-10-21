import fs from 'node:fs';
const J=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const T=J('../../v023-targets.json').targets; const by=Object.fromEntries(T.map(x=>[x.id,x]));
const fam=p=>p>=70?3:p>=30?2:1;
const items={}; let fixedPct=0, dupSeen=0;
const rer=new Set(['m03','m08','m09','m18','m19','m22']);
const put=(o,src)=>{for(const x of o){if(x.id<0)continue; const f=fam(x.pct); if(f!==x.familiarity)fixedPct++; items[x.id]={familiarity:f,pct:x.pct,why:x.why,src,...(items[x.id]?{prev:{familiarity:items[x.id].familiarity,pct:items[x.id].pct,src:items[x.id].src}}:{})};}};
for(let i=1;i<=40;i++){const n='m'+String(i).padStart(2,'0'); if(rer.has(n)){put(J(n+'.run1.json'),n+'#run1');} put(J(n+'.out.json'),n);}
// m03/m22 — 둘째 재판정(r01 r02)이 최종
for(const n of ['r01','r02']) put(J(n+'.out.json'),n);
// run1 → 최종 덮어쓰기 순서 보장: items[id] 는 마지막 put 이 최종
const out={round:'V023',date:'2026-10-21',pctFixed:fixedPct,items:{}};
let miss=0; for(const t of T){const it=items[t.id]; if(!it){miss++;continue;} out.items[t.id]={id:t.id,answer:t.answer,topic:t.topicKo,mid:t.mid,accessibility:t.accessibility,worth:t.worth,...it};}
fs.writeFileSync('merged.json',JSON.stringify({miss,fixedPct,n:Object.keys(out.items).length,items:out.items},null,1));
const c={1:0,2:0,3:0}; const bt={}; const bm={};
for(const v of Object.values(out.items)){c[v.familiarity]++; (bt[v.topic]??={1:0,2:0,3:0,n:0}); bt[v.topic][v.familiarity]++; bt[v.topic].n++; (bm[v.mid]??={1:0,n:0}); bm[v.mid].n++; if(v.familiarity===1)bm[v.mid][1]++;}
console.log(JSON.stringify({miss,fixedPct,n:Object.keys(out.items).length,c,bt}));
const mm=Object.entries(bm).filter(([k,v])=>v.n>=8).sort((a,b)=>b[1][1]/b[1].n-a[1][1]/a[1].n).slice(0,10).map(([k,v])=>k+' '+v[1]+'/'+v.n); console.log('rate',mm.join(' · '));
console.log('count',Object.entries(bm).sort((a,b)=>b[1][1]-a[1][1]).slice(0,10).map(([k,v])=>k+' '+v[1]+'/'+v.n).join(' · '));
