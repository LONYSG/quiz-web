import fs from 'node:fs';
const R='data/pipeline/audit/v044-raw/', T='data/minigame/topics/';
const m=JSON.parse(fs.readFileSync(R+'_work/merged.json'));
// VERIFY 재독 조정
const place=m['liar-place']; if(!place.issues.find(p=>p.id==='liar-place-009')) place.issues.push({id:'liar-place-009',name:'교회',probs:[{t:'fool',d:'성당 — 설명(십자가·예배)이 거의 겹쳐 정답이 둘로 좁혀짐(VERIFY 표본 재독에서 추가)',fix:'성당 → 모스크'}],fool:[{f:'성당',v:'tooClose',alt:'모스크'}]});
const mu=m['liar-music']; const nj=mu.issues.find(p=>p.name==='뉴진스');
if(nj){ mu.issues=mu.issues.filter(p=>p!==nj); mu.unsure.push('liar-music-003 뉴진스: 조각은 remove 권고(어도어 전속계약 분쟁·소송) — 사건·범죄가 아닌 계약 분쟁이라 VERIFY 가 remove 에서 unsure 로 낮춤. 설계가 정할 것'); }
const now=new Date().toISOString(); const items={}; const sum={}; let G={fool:0,ok:0,tooClose:0,tooFar:0,bad:0};
for (const [s,v] of Object.entries(m)) {
  const f=T+s+'.json'; const t=JSON.parse(fs.readFileSync(f)); const before=JSON.stringify(t.items);
  const byId=new Map(v.issues.map(p=>[p.id,p])); const c={fool:0,tooClose:0,tooFar:0,bad:0,remove:0,diff:0,era:0,sub:0,variant:0};
  const fixes=[];
  for (const it of t.items) { c.fool+=it.fool.length; const p=byId.get(it.id);
    if(!p){items[it.id]={verdict:'ok',fool:it.fool.map(f=>({f,v:'ok'}))}; continue;}
    const fv=it.fool.map(f=>{const x=(p.fool||[]).find(q=>q.f===f);return x?{f,v:x.v,alt:x.alt??null}:{f,v:'ok'}});
    for(const x of fv){ if(c[x.v]!==undefined)c[x.v]++; }
    for(const x of p.probs) if(c[x.t]!==undefined&&x.t!=='fool') c[x.t]++;
    items[it.id]={verdict:'fix',probs:p.probs,fool:fv};
    const fl=fv.filter(x=>x.v!=='ok');
    if(fl.length) fixes.push({op:'fool',id:it.id,name:it.name,replace:fl.map(x=>({from:x.f,verdict:x.v,to:x.alt??null}))});
    for(const x of p.probs.filter(x=>x.t!=='fool')) fixes.push({op:x.t,id:it.id,name:it.name,reason:x.d,fix:x.fix});
  }
  if(JSON.stringify(t.items)!==before) throw new Error('items 변함');
  const okFool=c.fool-c.tooClose-c.tooFar-c.bad; for(const k of ['fool','tooClose','tooFar','bad']) G[k]+=c[k]; G.ok+=okFool;
  const problemItems=v.issues.length;
  const prev=t.verify; const {history,...core}=prev||{};
  t.verify={round:'V044',checkedAt:now,itemsChecked:t.items.length,foolAudit:{fools:c.fool,ok:okFool,tooClose:c.tooClose,tooFar:c.tooFar,bad:c.bad},problemItems,counts:{remove:c.remove,diff:c.diff,era:c.era,sub:c.sub,variant:c.variant},fixes,unsure:v.unsure,verdict:problemItems<=3?'verified':'candidate',why:`라이어 제시어 전수 판정: 문제 항목 ${problemItems}/${t.items.length} (fool tooClose ${c.tooClose} · tooFar ${c.tooFar} · bad ${c.bad} · remove ${c.remove} · diff ${c.diff} · era ${c.era} · sub ${c.sub} · 변형 ${c.variant}) — 적용은 G049`,history:[...(history||[]),...(prev?[core]:[])]};
  t.status=t.verify.verdict; sum[s]={items:t.items.length,problemItems,...c,okFool,status:t.status};
  fs.writeFileSync(f,JSON.stringify(t,null,1)+'\n'); }
fs.writeFileSync('data/pipeline/audit/v044-topics.json',JSON.stringify({round:'V044',total:Object.keys(items).length,sets:sum,fools:G,items},null,1));
console.log(Object.keys(items).length,JSON.stringify(G)); for(const [s,v] of Object.entries(sum)) console.log(s,v.items,v.problemItems,'tc',v.tooClose,'tf',v.tooFar,'bad',v.bad,'rm',v.remove,'diff',v.diff,'era',v.era,'sub',v.sub,'var',v.variant,v.status);
