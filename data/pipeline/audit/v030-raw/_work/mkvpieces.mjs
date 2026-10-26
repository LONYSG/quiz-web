import fs from 'node:fs';import {W,T,vblock,groupBy} from './vblocks.mjs';
const p=JSON.parse(fs.readFileSync(W+'pre.json','utf8'));
const gs=groupBy(p.keep).sort((a,b)=>a.id-b.id);
// 문항 100 단위, 후보 수 균형 위해 순서는 id 순 + 후보 많은 문항(≥6)은 앞쪽 조각에 흩어짐 방지 위해 그대로
const NP=Math.ceil(gs.length/100);const meta=[];
for(let i=0;i<NP;i++){const arr=gs.slice(Math.floor(i*gs.length/NP),Math.floor((i+1)*gs.length/NP));const name='v'+String(i+1).padStart(2,'0');
const keys=arr.flatMap(g=>g.cands.map(c=>({id:g.id,v:c.v})));
fs.writeFileSync(W+name+'.txt',arr.map(vblock).join('\n'));fs.writeFileSync(W+name+'.keys.json',JSON.stringify(keys));
fs.writeFileSync(W+name+'.prompt.txt',`V030 변형 판정자. 먼저 C:/work/quiz-web/data/pipeline/audit/v030-raw/INSTRUCTIONS-variants.md 를 Read 로 전부 읽고 그 지시대로 한다.\n입력: ${W}${name}.txt (문항 ${arr.length}개 · 후보 ${keys.length}개). 결과: ${W}${name}.out.json (JSON 배열 · 후보 순서 그대로 · Write 로 직접). 입력 파일과 지시서 외 다른 파일은 열지 않는다. 웹 검색은 쓰지 않는다. 스크립트 일괄 처리 금지 — 한 건씩 읽고 판정한다. 끝나면 "done" 한 줄만 답한다.\n`);
meta.push([name,arr.length,keys.length]);}
console.log(NP,meta.slice(0,5).join(' | '),'max',Math.max(...meta.map(m=>m[2])));
