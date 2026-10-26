import fs from 'node:fs';import {W,T,sent,groupBy} from './vblocks.mjs';
const one=(s)=>String(s??'').replace(/\s+/g,' ').trim();
export function block2(g,first,hide){const x=T[g.id];const mid=[x.major,x.mid].filter(Boolean).join(' > ');
const ex=x.variants.filter(v=>!(hide||[]).includes(v));
return `### ${g.id}\n분야: ${mid}\n질문: ${one(x.question)}\n대표 정답: ${x.answer}${ex.length?'  (이미 받는 변형: '+ex.join(' / ')+')':''}\n해설: ${sent(x.explanation)}\n후보 (1차 판정 포함):\n${g.cands.map((c,i)=>{const f=first[g.id+'|'+c.v];return `  ${i+1}) ${c.v}${c.part?'  [괄호 병기 '+(c.part==='out'?'밖':'안')+' — 원문 '+c.orig+']':''}  ← 1차: ${f.verdict}(${f.rule},${f.confidence}) "${f.why}"`;}).join('\n')}\n`;}
function build(name,cands,first,hide){const gs=groupBy(cands);
fs.writeFileSync(W+name+'.txt',gs.map(g=>block2(g,first,hide&&hide[g.id])).join('\n'));
const keys=gs.flatMap(g=>g.cands.map(c=>({id:g.id,v:c.v})));fs.writeFileSync(W+name+'.keys.json',JSON.stringify(keys));
fs.writeFileSync(W+name+'.prompt.txt','');return keys.length;}
const mode=process.argv[2];
if(mode==='self'){const first={};for(const x of JSON.parse(fs.readFileSync(W+'self.out.json','utf8')))first[x.id+'|'+x.v]=x;
const cands=Object.values(first).filter(x=>x.verdict!=='reject').map(x=>({id:x.id,v:x.v}));
const hide={};for(const c of cands)(hide[c.id]||=[]).push(c.v);
console.log('s2',build('s2',cands,first,hide));}
if(mode==='all'){const m=JSON.parse(fs.readFileSync(W+'vmerged.json','utf8'));const pre=JSON.parse(fs.readFileSync(W+'pre.json','utf8'));
const cands=pre.keep.filter(c=>m[c.id+'|'+c.v].verdict!=='reject');const gs=groupBy(cands).sort((a,b)=>a.id-b.id);
const NP=Math.ceil(cands.length/200);let n=0;const per=Math.ceil(gs.length/NP);
for(let i=0;i<NP;i++){const arr=gs.slice(i*per,(i+1)*per);const name='w'+String(i+1).padStart(2,'0');
const flat=arr.flatMap(g=>g.cands);n+=build(name,flat,m);}
console.log('w pieces',NP,'cands',n);}
