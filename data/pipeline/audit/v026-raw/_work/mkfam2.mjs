import fs from 'node:fs';
const W='C:/work/quiz-web/data/pipeline/audit/v026-raw/_work';
const J=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const cal=J(W+'/cal1.json');
const redo=process.argv.slice(2); // 예: f01 f05
const ids=redo.flatMap(n=>J(`${W}/${n}.keys.json`)).filter(i=>i>0);
// 입력 블록 텍스트를 원래 조각에서 그대로 뽑는다
const blocks={};
for(const n of redo){const t=fs.readFileSync(`${W}/${n}.txt`,'utf8').split('\n### ').slice(1);for(const b of t){const id=Number(b.split('\n')[0]);if(id>0)blocks[id]='### '+b.trimEnd()+'\n';}}
let seed=20261101;const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff};
const sh=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const all=sh(ids);const half=Math.ceil(all.length/2);const names=[];
const p1=fs.readFileSync(`${W}/f02.prompt.txt`,'utf8');
[all.slice(0,half),all.slice(half)].forEach((part,k)=>{
  const name='r'+(k+1);
  const calBlocks=cal.map(c=>`### ${c.id}\n정답: ${c.answer}\n묶음: ${c.topicKo}\n중분류: ${c.mid}\n한 줄 정체(구별용): ${c.first}\n`);
  const mix=sh([...part.map(i=>({id:i,t:blocks[i]})),...cal.map((c,i)=>({id:c.id,t:calBlocks[i]}))]);
  fs.writeFileSync(`${W}/${name}.txt`,`## 정답 친숙도 조각 ${name} (${mix.length}건 — ${redo.join('+')} 재실행)\n\n`+mix.map(x=>x.t).join('\n'));
  fs.writeFileSync(`${W}/${name}.keys.json`,JSON.stringify(mix.map(x=>x.id)));
  fs.writeFileSync(`${W}/${name}.prompt.txt`,p1.replaceAll('f02',name).replace(/블록 \d+개/,`블록 ${mix.length}개`).replace(/순서 · \d+개/,`순서 · ${mix.length}개`).replace(/\(입력 순서 · \d+개\)/,`(입력 순서 · ${mix.length}개)`));
  names.push([name,mix.length]);
});
console.log(JSON.stringify(names), ids.length);
