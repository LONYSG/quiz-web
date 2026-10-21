import fs from 'node:fs';
const J=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const m=J('merged.json').items; const T22=J('../../v022-targets.json').targets; const F22=J('../../v022-familiarity.json').items; const T23=J('../../v023-targets.json').targets;
const info={}; for(const t of [...T22,...T23]) info[t.id]=t;
let seed=20261025; const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff}; const sh=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const midOnes=Object.values(m).filter(v=>v.familiarity===1).map(v=>v.id);
const topOnes=Object.entries(F22).filter(([k,v])=>v.familiarity===1&&v.band==='top').map(([k])=>Number(k));
const topNon=Object.entries(F22).filter(([k,v])=>v.familiarity>1&&v.band==='top').map(([k])=>Number(k));
const midNon=Object.values(m).filter(v=>v.familiarity>1).map(v=>v.id);
const decoy=[...sh(topNon).slice(0,60),...sh(midNon).slice(0,60)];
const all=[...midOnes,...topOnes,...decoy]; const role=Object.fromEntries([...midOnes.map(i=>[i,'mid1']),...topOnes.map(i=>[i,'top1']),...decoy.map(i=>[i,'decoy'])]);
const cal2=J('cal2.json'); const s=sh(all.map(i=>info[i])); const NP=12; const per=Math.ceil(s.length/NP); const names=[];
for(let i=0;i<NP;i++){const a=s.slice(i*per,(i+1)*per); const mix=sh([...a,...cal2]); const name='x'+String(i+1).padStart(2,'0');
 fs.writeFileSync(name+'.txt',`## 정답 친숙도 조각 ${name} (${mix.length}건)\n\n`+mix.map(x=>`### ${x.id}\n정답: ${x.answer}\n묶음: ${x.topicKo}\n중분류: ${x.mid}\n해설 첫 문장(정체 구별용): ${x.first}\n`).join('\n'));
 fs.writeFileSync(name+'.keys.json',JSON.stringify(mix.map(x=>x.id))); names.push(name);}
fs.writeFileSync('roles.json',JSON.stringify(role));
console.log(JSON.stringify({midOnes:midOnes.length,topOnes:topOnes.length,decoy:decoy.length,total:all.length,per,names:names.length}));
