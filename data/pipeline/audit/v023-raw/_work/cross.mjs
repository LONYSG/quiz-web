import fs from 'node:fs';
const J=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const m=J('merged.json').items; const F22=J('../../v022-familiarity.json').items; const T22=Object.fromEntries(J('../../v022-targets.json').targets.map(t=>[t.id,t])); const roles=J('roles.json');
const fam=p=>p>=70?3:p>=30?2:1; const sec={}; let calC={}; const cal2=Object.fromEntries(J('cal2.json').map(c=>[c.id,c.expected]));
for(let i=1;i<=12;i++){const n='x'+String(i).padStart(2,'0'); for(const x of J(n+'.out.json')){ if(x.id<0){const k=cal2[x.id]+'>'+fam(x.pct);calC[k]=(calC[k]||0)+1;continue;} sec[x.id]={familiarity:fam(x.pct),pct:x.pct,why:x.why,piece:n};}}
const out={round:'V023',date:'2026-10-21',calConfusion:calC,mid:{},top:{},decoy:{}};
const stat={mid1:{c:0,b:0},top1:{c:0,b:0},decoy:{one:0,n:0}};
for(const [k,r] of Object.entries(roles)){const id=Number(k); const s=sec[id]; if(!s){console.log('MISSING',id);continue;}
 if(r==='decoy'){stat.decoy.n++; if(s.familiarity===1)stat.decoy.one++; out.decoy[id]={first:(m[id]||F22[id]).familiarity,second:s.familiarity,pct2:s.pct};continue;}
 const f1=r==='mid1'?m[id]:F22[id]; const t=r==='mid1'?m[id]:T22[id]; const conf=s.familiarity===1;
 const rec={id,answer:r==='mid1'?m[id].answer:T22[id].answer,topic:r==='mid1'?m[id].topic:T22[id].topicKo,mid:r==='mid1'?m[id].mid:T22[id].mid,accessibility:r==='mid1'?m[id].accessibility:T22[id].accessibility,worth:r==='mid1'?m[id].worth:T22[id].worth,pct1:f1.pct,pct2:s.pct,second:s.familiarity,why1:f1.why,why2:s.why,confirmed:conf,familiarity1Final:conf?1:'borderline',band:r==='mid1'?'mid':'top'};
 if(r==='top1'&&F22[id].verify)rec.v022Verify=F22[id].verify;
 (r==='mid1'?out.mid:out.top)[id]=rec; stat[r][conf?'c':'b']++;}
out.stat=stat; fs.writeFileSync('../../v023-cross.json',JSON.stringify(out,null,1));
// 묶음별 확정 · 판 수
const all=[...Object.values(out.mid),...Object.values(out.top)]; const bt={}; for(const v of all){bt[v.band+'/'+v.topic]??={c:0,b:0}; bt[v.band+'/'+v.topic][v.confirmed?'c':'b']++;}
console.log(JSON.stringify({stat,calC,bt}));
