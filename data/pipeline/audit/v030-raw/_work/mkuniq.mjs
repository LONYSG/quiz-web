import fs from 'node:fs';import {W,T,sent} from './vblocks.mjs';
const U=JSON.parse(fs.readFileSync('C:/work/quiz-web/data/pipeline/audit/g023-lists.json','utf8')).unique;
const one=(s)=>String(s??'').replace(/\s+/g,' ').trim();
const items=U.filter(u=>T[u.id]);console.log('unique',U.length,'active',items.length,'excluded',U.filter(u=>!T[u.id]).map(u=>u.id));
const blk=(u)=>{const x=T[u.id];const mid=[x.major,x.mid].filter(Boolean).join(' > ');
const ex=one(x.explanation).split(/(?<=[.!?])\s+/).slice(0,3).join(' ').slice(0,450);
return `### ${u.id}\n분야: ${mid}\n질문: ${one(x.question)}\n정답: ${x.answer}${x.variants.length?'  (변형: '+x.variants.join(' / ')+')':''}\n해설: ${ex||'(없음)'}\n이전 판정자 note: ${u.notes.map(n=>'['+n.from+'] '+n.note).join(' ‖ ')}\n`;};
const NP=Math.ceil(items.length/50);const keys=[];
for(let p=0;p<NP;p++){const arr=items.slice(Math.floor(p*items.length/NP),Math.floor((p+1)*items.length/NP));const name='u'+String(p+1).padStart(2,'0');
fs.writeFileSync(W+name+'.txt',arr.map(blk).join('\n'));fs.writeFileSync(W+name+'.keys.json',JSON.stringify(arr.map(u=>u.id)));
fs.writeFileSync(W+name+'.prompt.txt',`V030 비유일 판정자. 먼저 C:/work/quiz-web/data/pipeline/audit/v030-raw/INSTRUCTIONS-unique.md 를 Read 로 전부 읽고 그 지시대로 한다.\n입력: ${W}${name}.txt (문항 ${arr.length}개). 결과: ${W}${name}.out.json (JSON 배열 · 입력 순서 그대로 · Write 로 직접). 입력 파일과 지시서 외 다른 파일은 열지 않는다. 웹 검색은 쓰지 않는다. 스크립트 일괄 처리 금지 — 한 건씩 읽고 판정한다. 끝나면 "done" 한 줄만 답한다.\n`);}
console.log(NP,'pieces');
