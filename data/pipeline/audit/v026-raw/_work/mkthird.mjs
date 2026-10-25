import fs from 'node:fs';
const W='C:/work/quiz-web/data/pipeline/audit/v026-raw/_work';const J=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const cal=J(W+'/cal1.json');const map=J(W+'/fam.map.json');const inv=Object.fromEntries(Object.entries(map).map(([k,v])=>[v,Number(k)]));
const refs=process.argv.slice(2);const ids=refs.map(r=>inv[r]);
const blocks={};
for(const n of ['f01','f02','f03','f04','f05','f06']){const t=fs.readFileSync(`${W}/${n}.txt`,'utf8').split('\n### ').slice(1);for(const b of t){const id=Number(b.split('\n')[0]);if(id>0)blocks[id]='### '+b.trimEnd()+'\n';}}
let seed=20261102;const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff};const sh=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const calBlocks=cal.map(c=>({id:c.id,t:`### ${c.id}\n정답: ${c.answer}\n묶음: ${c.topicKo}\n중분류: ${c.mid}\n한 줄 정체(구별용): ${c.first}\n`}));
const mix=sh([...ids.map(i=>({id:i,t:blocks[i]})),...calBlocks]);
fs.writeFileSync(`${W}/t1.txt`,`## 정답 친숙도 조각 t1 (${mix.length}건 — 1 · 근접 항목 셋째 확인)\n\n`+mix.map(x=>x.t).join('\n'));
fs.writeFileSync(`${W}/t1.keys.json`,JSON.stringify(mix.map(x=>x.id)));
const p=fs.readFileSync(`${W}/f02.prompt.txt`,'utf8').replaceAll('f02','t1').replace(/블록 \d+개/,`블록 ${mix.length}개`).replace(/순서 · \d+개/,`순서 · ${mix.length}개`).replace(/\(입력 순서 · \d+개\)/,`(입력 순서 · ${mix.length}개)`);
fs.writeFileSync(`${W}/t1.prompt.txt`,p);console.log(mix.length);
