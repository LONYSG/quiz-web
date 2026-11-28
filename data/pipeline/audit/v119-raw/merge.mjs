import fs from 'node:fs';
const D='data/pipeline/audit/v119-raw/';
const tg=JSON.parse(fs.readFileSync(D+'targets.json','utf8'));
const cards={};const bad=[];
for(let i=1;i<=12;i++){const w='w'+String(i).padStart(2,'0');const o=JSON.parse(fs.readFileSync(D+w+'.out.json','utf8'));
 for(const r of o){const id=String(r.id);if(cards[id])bad.push('dup '+id);
  const {id:_,...rest}=r;cards[id]={verdict:rest.verdict,why:rest.why??'',fix:rest.fix??[],web:rest.web??[],...(rest.unopened?.length?{unopened:rest.unopened}:{}),batch:w};}}
const miss=tg.filter(t=>!cards[t.id]).map(t=>t.id);const extra=Object.keys(cards).filter(k=>!tg.find(t=>t.id===k));
const vs={};for(const c of Object.values(cards))vs[c.verdict]=(vs[c.verdict]||0)+1;
const okPartial=Object.entries(cards).filter(([k,c])=>c.verdict==='ok'&&c.unopened).map(([k])=>k);
const noweb=Object.entries(cards).filter(([k,c])=>!c.web.length).map(([k])=>k);
console.log({n:Object.keys(cards).length,t:tg.length,bad,miss,extra,vs,okPartial:okPartial.length,noweb});
fs.writeFileSync('data/pipeline/audit/v119-check.json',JSON.stringify({done:true,rule:'V118 입력 파일(uNNN.txt)에 "재료 파일이 없다"가 적힌 카드 310장(카드-001~004 · 018 · 029 묶음) 중 ok 였던 306장(판정자가 근거 없이 ok 낸 꼴 — 판정자 메모는 저장돼 있지 않아 이 구조로 가름) + V118 이 이름 붙인 3장(#4462 · #4929 황남빵 · #4181 장혁재 PD)',counts:vs,cards},null,1));
for(const [k,c] of Object.entries(cards))if(c.verdict==='fix')console.log(k,JSON.stringify(c.fix).slice(0,500));
console.log('unopened',Object.entries(cards).filter(([k,c])=>c.verdict==='unopened').map(([k])=>k).join(','));
