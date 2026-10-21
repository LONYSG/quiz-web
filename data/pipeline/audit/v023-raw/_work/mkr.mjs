import fs from 'node:fs';
const T=JSON.parse(fs.readFileSync('../../v023-targets.json','utf8')).targets; const by=Object.fromEntries(T.map(x=>[x.id,x]));
const cal2=JSON.parse(fs.readFileSync('cal2.json','utf8'));
let seed=20261024; const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff}; const sh=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const ids=[...JSON.parse(fs.readFileSync('m03.keys.json')),...JSON.parse(fs.readFileSync('m22.keys.json'))].filter(i=>i>0);
const s=sh(ids.map(i=>by[i])); const half=Math.ceil(s.length/2);
for(const [name,a] of [['r01',s.slice(0,half)],['r02',s.slice(half)]]){const mix=sh([...a,...cal2]);
 fs.writeFileSync(name+'.txt',`## 정답 친숙도 조각 ${name} (${mix.length}건)\n\n`+mix.map(x=>`### ${x.id}\n정답: ${x.answer}\n묶음: ${x.topicKo}\n중분류: ${x.mid}\n해설 첫 문장(정체 구별용): ${x.first}\n`).join('\n'));
 fs.writeFileSync(name+'.keys.json',JSON.stringify(mix.map(x=>x.id)));}
console.log(ids.length);
