import fs from 'fs';
const d='data/minigame/topics/', raw='data/pipeline/audit/v047-raw/';
const sample=JSON.parse(fs.readFileSync(raw+'sample.json','utf8'));
const prob={'토르소':'낯섦'}; // sample judgments: only problem
const celebRemove=['김병만','박세리','기성용','하정우'];
const celebCaution=['홍명보','박민영','차태현','이선희','브래드피트','싸이'];
const sc=new Map();for(const s of sample.items)sc.set(s.topic,(sc.get(s.topic)||0)+1);
const judged=sample.items.map(s=>({id:s.id,topic:s.topic,name:s.name,verdict:prob[s.name]||'ok'}));
fs.writeFileSync(raw+'sample-judged.json',JSON.stringify({seed:sample.seed,n:judged.length,problems:judged.filter(x=>x.verdict!=='ok'),celebRemove,celebCaution,items:judged},null,1));
const now=new Date().toISOString();const rows=[];
for(const f of fs.readdirSync(d).filter(x=>/^draw-/.test(x))){
 const p=d+f, j=JSON.parse(fs.readFileSync(p,'utf8'));if(j.createdRound!=='G051')continue;
 const before=JSON.stringify(j.items);
 const fixes=[];
 for(const it of j.items){
  if(it.name==='토르소')fixes.push({op:'remove',id:it.id,name:it.name,why:'낯섦(표본에서 나옴)'});
  if(celebRemove.includes(it.name))fixes.push({op:'remove',id:it.id,name:it.name,why:'논란 인물(판정자 기억 기준 · 웹 0) — 설계 확인'});
  if(celebCaution.includes(it.name))fixes.push({op:'flag',id:it.id,name:it.name,why:'주의(소규모 논란 · 기억 기준) — 두어도 됨, 설계 확인'});
 }
 const n=sc.get(j.topic)||0, pr=judged.filter(x=>x.topic===j.topic&&x.verdict!=='ok').length;
 const prev=j.verify;
 j.verify={round:'V047',checkedAt:now,mode:'표본 300 직접 판정(씨앗 '+sample.seed+') · 웹 0 · 기준 = 정답을 듣고도 모를 낯선 말/논란/비속/단어아님/변형 · 그리기 난도 안 봄',
  sampleInSet:n,sampleProblems:pr,sampleTotal:300,sampleProblemTotal:1,problemRate:'1/300 = 0.33% (<5%)',fixes,verdict:'verified',
  why:'표본 문제율 0.33% < 5% → G051 새 항목 든 세트 전부 verified(표본 검증 — 전수 아님). 연예인 남김 106 전수 읽기 · 논란 4 remove 제안 · 주의 6'};
 if(prev)j.verify.history=[prev];
 if(JSON.stringify(j.items)!==before)throw 1;
 j.status='verified';
 fs.writeFileSync(p,JSON.stringify(j,null,1)+'\n');
 rows.push([j.topic,j.items.length,n,pr,fixes.length]);
}
console.log(rows.map(r=>r.join(' ')).join('\n'));
