import fs from 'node:fs';
const W='C:/work/quiz-web/data/pipeline/audit/v029-raw/_work/';const A='C:/work/quiz-web/data/pipeline/audit/';
const T=JSON.parse(fs.readFileSync(W+'../targets.json','utf8'));const items=JSON.parse(fs.readFileSync(W+'items.v029.json','utf8'));
const ch=JSON.parse(fs.readFileSync(W+'changes.json','utf8'));const D=JSON.parse(fs.readFileSync(W+'dif.now.json','utf8'));
const fb=JSON.parse(fs.readFileSync(W+'fb.json','utf8'));const an=JSON.parse(fs.readFileSync(W+'anchor.stats.json','utf8'));
const out={};let changed=0;
for(const [id,v] of Object.entries(items)){const o={worth:v.worth,kind:v.kind,why:v.why,confidence:v.confidence,anchor:v.anchor};
 if(ch[id]&&!v.anchor){o.judged=v.worth;o.worth=ch[id].w;o.reread=ch[id].note;changed++;}
 out[id]=o;}
const meta={builtAt:new Date().toISOString(),round:'V029',targets:Object.keys(out).length,
 anchors:{confirmedBy:'찬종',date:'2026-10-26',changedByChanjong:25,total:60,examples:20,selfTestSet:40},
 selfTest:{rounds:1,exact:'40/40',far:0,caveat:'INSTRUCTIONS 2절이 눈금자 이름을 대부분 직접 예시로 들어 새지 않은 문항 판정력을 재지 못함'},
 anchorInPieces:{judgements:an.tot,miss:an.bad,far:an.far,perPieceMax:2},
 instructions:'data/pipeline/audit/v029-raw/INSTRUCTIONS.md (+ _work/prompt.md = 예 20 채움)',
 rereadChanges:changed,dbWorthColumnAtStart:false,
 note:'worth = 판정자 값 → VERIFY 직접 재독으로 바꾼 것은 judged(원값)·reread(까닭) 있음. anchor:true 60 은 찬종 값 그대로. 난이도(difficulty_score)는 쓰지 않음.'};
fs.writeFileSync(A+'v029-worth.json',JSON.stringify({meta,items}));
// stats
const ids=Object.keys(out);const cnt=(a,f)=>a.reduce((m,x)=>{const k=f(x);m[k]=(m[k]||0)+1;return m},{});
const S={};S.n=ids.length;S.worth=cnt(ids,i=>out[i].worth);S.kind=cnt(ids,i=>out[i].kind);S.conf=cnt(ids,i=>out[i].confidence);
const tab={};for(const i of ids){const d=D[i];if(!d)continue;const k=d+'/'+out[i].worth;tab[k]=(tab[k]||0)+1}S.tab=tab;S.noDif=ids.filter(i=>!D[i]);
// kind x worth
S.kindWorth=cnt(ids,i=>out[i].kind+'/'+out[i].worth);
// category
const cat={};for(const i of ids){const m=T.items[i];const k=m.major||'(없음)';(cat[k]||={n:0,1:0,2:0,3:0});cat[k].n++;cat[k][out[i].worth]++;}S.major=cat;
const mid={};for(const i of ids){const m=T.items[i];const k=(m.major||'')+' > '+(m.mid||'');(mid[k]||={n:0,1:0,2:0,3:0});mid[k].n++;mid[k][out[i].worth]++;}S.mid=mid;
S.w1_d45=ids.filter(i=>out[i].worth==1&&D[i]>=4).length;S.w1_d12=ids.filter(i=>out[i].worth==1&&D[i]<=2).length;
// feedback
const byQ={};for(const r of fb){(byQ[r.qid]||={up:0,down:0,rs:[],cm:[]});if(r.vote>0)byQ[r.qid].up++;else byQ[r.qid].down++;if(r.reasons)byQ[r.qid].rs.push(r.reasons);if(r.comment)byQ[r.qid].cm.push(r.comment);}
S.fb=Object.entries(byQ).map(([q,v])=>({q:+q,...v,worth:out[q]?.worth,kind:out[q]?.kind,ans:T.items[q]?.answer,anchor:out[q]?.anchor}));
// fam1
try{const f=JSON.parse(fs.readFileSync(A+'g023-fam1-candidates.json','utf8'));S.fam1=cnt(f.items.map(x=>String(x.id)).filter(i=>out[i]),i=>out[i].worth);S.fam1n=f.items.length;S.fam1ex=f.items.filter(x=>!out[String(x.id)]).length;}catch(e){S.fam1err=e.message}
// tags
const tg={};for(const f of ['v027-rerate.json','v028-rerate.json']){try{const j=JSON.parse(fs.readFileSync(A+f,'utf8'));for(const [id,x] of Object.entries(j.items)){if(!out[id])continue;for(const t of x.tags||[]){(tg[t]||={n:0,1:0,2:0,3:0});tg[t].n++;tg[t][out[id].worth]++;}}}catch(e){S.tgerr=e.message}}S.tags=tg;
fs.writeFileSync(W+'final.stats.json',JSON.stringify(S,null,1));
console.log(JSON.stringify({worth:S.worth,conf:S.conf,changed,fam1:S.fam1,fam1n:S.fam1n,fam1ex:S.fam1ex,w1d45:S.w1_d45,w1d12:S.w1_d12,tags:S.tags},null,0));
