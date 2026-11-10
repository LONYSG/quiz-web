import fs from 'node:fs';
const R='data/pipeline/audit/v048-raw/', T='data/minigame/topics/';
const m=JSON.parse(fs.readFileSync(R+'_work/merged.json'));
// VERIFY 재독 조정
const add=(set,id,name,probs,unsure)=>{const v=m[set];let p=v.issues.find(x=>x.id===id);if(!p){p={id,name,probs:[],fool:[]};v.issues.push(p)}p.probs.push(...probs);if(unsure)v.unsure.push(unsure)};
const sp='liar-sport-2';
add(sp,'liar-sport-2-032','박태환',[{t:'remove',d:'도핑 양성 → FINA 18개월 자격정지(2015-03 · 웹 확인) — G053 이 마라도나(도핑 징계)를 뺀 기준과 같게',fix:'remove'}],'liar-sport-2-032: 박태환 remove 는 G053 기준(처벌받은 사건)과 맞춘 VERIFY 제안 — 2014 사건이라 설계가 최종');
add(sp,'liar-sport-2-035','추신수',[{t:'remove',d:'2011 미국 음주운전 적발 → 면허정지 6개월 + 벌금(웹 확인) — 이경규(약물운전 벌금)를 뺀 기준과 같게. 15년 전 일이라 약한 제안',fix:'remove'}],'liar-sport-2-035: 추신수 remove 는 약한 제안(2011 · 이후 문제 없음) — 설계가 최종');
const ob=m['liar-object-2'].issues.find(p=>p.id==='liar-object-2-012'); if(ob) ob.probs.forEach(x=>{if(x.t==='variant'){x.d="'숫가락' 은 오타 표기(15 §2 X) — 제거만(수저는 젓가락 포함 상위어라 추가 안 함)";x.fix='variants 에서 숫가락 제거'}});
const now=new Date().toISOString(); const items={}; const sum={}; let G={fool:0,ok:0,tooClose:0,tooFar:0,bad:0};
for (const [s,v] of Object.entries(m)) {
  const f=T+s+'.json'; const t=JSON.parse(fs.readFileSync(f)); const before=JSON.stringify(t.items);
  const byId=new Map(v.issues.map(p=>[p.id,p])); const c={fool:0,tooClose:0,tooFar:0,bad:0,remove:0,diff:0,era:0,sub:0,variant:0,dup:0};
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
  t.verify={round:'V048',checkedAt:now,itemsChecked:t.items.length,foolAudit:{fools:c.fool,ok:okFool,tooClose:c.tooClose,tooFar:c.tooFar,bad:c.bad},problemItems,counts:{remove:c.remove,dup:c.dup,diff:c.diff,era:c.era,sub:c.sub,variant:c.variant},fixes,unsure:v.unsure,verdict:problemItems<=3?'verified':'candidate',why:`라이어 제시어 전수 판정: 문제 항목 ${problemItems}/${t.items.length} (fool tooClose ${c.tooClose} · tooFar ${c.tooFar} · bad ${c.bad} · remove ${c.remove} · dup ${c.dup} · diff ${c.diff} · era ${c.era} · sub ${c.sub} · 변형 ${c.variant}) — 적용은 G049`,history:[...(history||[]),...(prev?[core]:[])]};
  t.status=t.verify.verdict; sum[s]={items:t.items.length,problemItems,...c,okFool,status:t.status};
  fs.writeFileSync(f,JSON.stringify(t,null,1)+'\n'); }
fs.writeFileSync('data/pipeline/audit/v048-topics.json',JSON.stringify({round:'V048',total:Object.keys(items).length,sets:sum,fools:G,items},null,1));
console.log(Object.keys(items).length,JSON.stringify(G)); for(const [s,v] of Object.entries(sum)) console.log(s,v.items,v.problemItems,'tc',v.tooClose,'tf',v.tooFar,'bad',v.bad,'rm',v.remove,'diff',v.diff,'era',v.era,'sub',v.sub,'var',v.variant,v.status);
