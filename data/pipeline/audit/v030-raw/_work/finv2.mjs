import fs from 'node:fs';import {T} from './vblocks.mjs';
const rows=JSON.parse(fs.readFileSync('vfinal.rows.json','utf8'));const pre=JSON.parse(fs.readFileSync('pre.json','utf8'));
const second={};for(const f of fs.readdirSync('.').filter(f=>/^w\d\d\.out\.json$/.test(f)))for(const x of JSON.parse(fs.readFileSync(f,'utf8')))second[x.id+'|'+x.v]=x;
let b5=0;const out=[];
for(const r of rows){const s=second[r.id+'|'+r.v];
let fin={verdict:r.verdict,rule:r.rule,confidence:r.confidence,why:r.why,by:s?'2차':(r.first.verdict==='reject'?'1차':'1차(2차 누락→보수)')};
if(r.verdict==='accept'&&/풀네임|풀 네임|전체 이름/.test(r.why+(r.first.why||''))){fin={verdict:'reject',rule:'B5',confidence:'mid',why:'인명 풀네임 변형 — B5(VERIFY)',by:'VERIFY-B5'};b5++;}
out.push({id:r.id,v:r.v,kind:r.kind,...(r.part?{part:r.part,orig:r.orig}:{}),verdict:fin.verdict,rule:fin.rule,confidence:fin.confidence,why:fin.why,needsWeb:r.needsWeb,webChecked:false,judged:{first:r.first,second:s?{verdict:s.verdict,rule:s.rule,confidence:s.confidence,why:s.why}:null},final:fin});}
const counts={},byRule={},byKind={};for(const r of out){counts[r.verdict]=(counts[r.verdict]||0)+1;const k=r.verdict+'/'+r.rule;byRule[k]=(byRule[k]||0)+1;const kk=r.kind+'/'+r.verdict;byKind[kk]=(byKind[kk]||0)+1;}
const per={};for(const r of out)if(r.verdict==='accept')per[r.id]=(per[r.id]||0)+1;
const dist={};for(const n of Object.values(per))dist[n]=(dist[n]||0)+1;
const over3=Object.entries(per).filter(([,n])=>n>3).map(([id,n])=>({id:Number(id),n}));
const exist={};for(const id of Object.keys(per))exist[id]=(T[id]?.variants.length||0)+per[id];
const over7=Object.entries(exist).filter(([,n])=>n>7).map(([id,n])=>({id:Number(id),total:n}));
const meta={builtAt:new Date().toISOString(),pre:{...pre.pre,note:'chars 209 → 괄호 쪼갠 340 조각 · 이미 204(chars 쪼갠 조각 포함) · b9 66 · otherPrimary 127 · dup 48'},judged:out.length,counts,byRule,byKind,acceptPerQuestion:dist,over3:over3.length,over7:over7.length,b5FullnameOverride:b5,
passes:'1차 51조각(원값 judged.first) → 받음·불확실 4,325 를 반박 2차(22조각 judged.second) → 최종 final · 2차 누락 5건은 보수적으로 받음→불확실',webChecked:0,note:'VERIFY 직접 읽기: 받음 high 100 · 안 받음 ASCII 60 · 받음 low/mid 150 표본(seed 29) — 받음 전수 직접 재독과 웹 쓰임 확인(150)은 못 함 — 표본 + 2차 반박 판정으로 대신'};
fs.writeFileSync('../../v030-variants.json',JSON.stringify({meta,over3,over7,items:out}));
console.log(JSON.stringify(meta,null,1).slice(0,2500));
