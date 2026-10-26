import fs from 'node:fs';
import {normalizeAnswer as N} from 'file:///C:/work/quiz-web/shared/dist/normalize.js';
import {findAnswerInQuestion as F} from 'file:///C:/work/quiz-web/pipeline/lib/answer-rules.mjs';
const A='C:/work/quiz-web/data/pipeline/audit/';
const T=JSON.parse(fs.readFileSync(A+'v030-raw/targets.json','utf8')).items;
const V=JSON.parse(fs.readFileSync(A+'g023-variants-pending.json','utf8')).items;
const prim=new Map();for(const x of Object.values(T)){const k=N(x.answer);(prim.get(k)||prim.set(k,[]).get(k)).push(x.id);}
const V0=V;const V1=[];const split={n:0,parts:0};for(const v of V0){if(v.kind==='chars'){const m=v.v.match(/^(.*?)\s*[(（](.*)[)）]\s*$/);if(m){split.n++;for(const [part,w] of [[m[1],'out'],[m[2],'in']]){if(part.trim()){split.parts++;V1.push({...v,v:part.trim(),orig:v.v,part:w});}}continue;}}V1.push(v);}
const pre={total:V.length,parts:V1.length,inactive:0,already:0,b9:0,otherPrimary:0,dupInList:0};const keep=[],out=[];const seen=new Set();
for(const v of V1){const t=T[v.id];if(!t){pre.inactive++;out.push({...v,pre:'inactive'});continue;}
const nv=N(v.v);const ex=new Set([N(t.answer),...t.variants.map(N)]);
const key=v.id+'|'+nv;
if(ex.has(nv)){pre.already++;out.push({...v,pre:'already'});continue;}
if(seen.has(key)){pre.dupInList++;out.push({...v,pre:'dup'});continue;}
if(F(t.question,v.v)==='word'){pre.b9++;out.push({...v,pre:'b9'});continue;}
const o=(prim.get(nv)||[]).filter(i=>i!==v.id);if(o.length){pre.otherPrimary++;out.push({...v,pre:'otherPrimary',other:o});continue;}
seen.add(key);keep.push(v);}
const qs=new Set(keep.map(v=>v.id));
console.log(split,pre,'keep',keep.length,'questions',qs.size);
const kinds={};for(const v of keep)kinds[v.kind]=(kinds[v.kind]||0)+1;console.log(kinds);
fs.writeFileSync('pre.json',JSON.stringify({pre,keep,out}));
