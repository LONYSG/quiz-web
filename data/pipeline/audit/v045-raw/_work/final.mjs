import fs from 'node:fs';
const R='data/pipeline/audit/v045-raw/', T='data/minigame/topics/';
const m=JSON.parse(fs.readFileSync(R+'_work/merged.json')); const now=new Date().toISOString(); const items={}; const sum={};
for (const [s,v] of Object.entries(m)) { const f=T+s+'.json'; const t=JSON.parse(fs.readFileSync(f)); const before=JSON.stringify(t.items);
  const by=new Map(v.issues.map(p=>[p.id,p])); const c={remove:0,dup:0,diff:0,variant:0,sub:0,person:0}; const fixes=[]; let probItems=0;
  for(const it of t.items){const p=by.get(it.id); if(!p){items[it.id]={verdict:'ok'};continue;} probItems++;
    items[it.id]={verdict:'fix',probs:p.probs};
    for(const x of p.probs){ if(c[x.t]!==undefined)c[x.t]++; fixes.push({op:x.t==='dup'?'remove':x.t,id:it.id,name:it.name,reason:x.d,fix:x.fix,...(x.t==='dup'?{dup:true}:{})}); } }
  if(JSON.stringify(t.items)!==before) throw new Error('items 변함');
  const pct=+(100*probItems/t.items.length).toFixed(1); const prev=t.verify; const {history,...core}=prev||{};
  t.verify={round:'V045',checkedAt:now,itemsChecked:t.items.length,problemItems:probItems,problemPct:pct,counts:c,fixes,unsure:v.unsure,verdict:pct<=3?'verified':'candidate',why:`캐치마인드 풀 전수 판정: 문제 항목 ${probItems}/${t.items.length} (${pct}%) — remove ${c.remove} · 그림 중복 ${c.dup} · diff ${c.diff} · 변형 ${c.variant} · sub ${c.sub} — 적용은 G049`,history:[...(history||[]),...(prev?[core]:[])]};
  t.status=t.verify.verdict; sum[s]={items:t.items.length,problemItems:probItems,pct,...c,unsure:v.unsure.length,status:t.status};
  fs.writeFileSync(f,JSON.stringify(t,null,1)+'\n'); }
fs.writeFileSync('data/pipeline/audit/v045-topics.json',JSON.stringify({round:'V045',total:Object.keys(items).length,sets:sum,items},null,1));
console.log(Object.keys(items).length); for(const [s,v] of Object.entries(sum))console.log(s,JSON.stringify(v));
