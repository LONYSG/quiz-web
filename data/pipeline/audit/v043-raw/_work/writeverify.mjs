import fs from 'node:fs';
const P=JSON.parse(fs.readFileSync('data/pipeline/audit/v043-raw/v043-proposals.json')).sets; const now=new Date().toISOString();
let n=0;
for (const s of Object.keys(P)) { const f=`data/minigame/topics/${s}.json`; const raw=fs.readFileSync(f,'utf8'); const t=JSON.parse(raw);
  const before=JSON.stringify([t.status,t.items]); const prev=t.verify; const {history,...prevCore}=prev||{};
  const fixes=[]; for(const p of P[s].proposals){ if(p.add.length) fixes.push({op:'variant',id:p.id,add:p.add,reason:p.reason,...(p.latinAbbr?{latinAbbr:true}:{}),...(p.conf?{conf:p.conf}:{})}); if(p.remove.length) fixes.push({op:'variant-remove',id:p.id,remove:p.remove.map(r=>r.v),reason:p.remove.map(r=>r.why).join(' / ')}); }
  t.verify={round:'V043',checkedAt:now,variantAudit:{items:t.items.length,proposedAdd:P[s].proposedAdd,proposedRemove:P[s].proposedRemove},fixes,verdict:prevCore.verdict??'verified',why:fixes.length?`변형 완전성 전수: add ${P[s].proposedAdd} · remove ${P[s].proposedRemove} 제안(status·items 불변) — 적용은 G045`:'변형 완전성 전수: 제안 0 — 빠진 흔한 표기·잘못 받는 변형 없음',history:[...(history||[]),prevCore]};
  if (JSON.stringify([t.status,t.items])!==before) throw new Error('items/status 변함 '+s);
  fs.writeFileSync(f,JSON.stringify(t,null,1)+'\n'); n++; }
console.log('wrote',n);
