import fs from 'node:fs';import {T} from './vblocks.mjs';
const first=JSON.parse(fs.readFileSync('vmerged.json','utf8'));const pre=JSON.parse(fs.readFileSync('pre.json','utf8'));
const second={};for(const f of fs.readdirSync('.').filter(f=>/^w\d\d\.out\.json$/.test(f)))for(const x of JSON.parse(fs.readFileSync(f,'utf8')))second[x.id+'|'+x.v]=x;
const rows=[];const c={};let noSecond=0,flip={};
for(const cand of pre.keep){const k=cand.id+'|'+cand.v;const a=first[k];let b=second[k];let fin;
if(a.verdict==='reject'){fin={...a};}
else if(b){fin={...b};}
else{noSecond++;fin={...a,verdict:a.verdict==='accept'?'unsure':a.verdict,why:'2차 판정 누락 — 보수적으로 불확실',rule:a.rule};}
const fk=a.verdict+'>'+fin.verdict;flip[fk]=(flip[fk]||0)+1;
rows.push({id:cand.id,v:cand.v,kind:cand.kind,part:cand.part,orig:cand.orig,verdict:fin.verdict,rule:fin.rule,confidence:fin.confidence,why:fin.why,needsWeb:!!(fin.needsWeb||a.needsWeb),first:{verdict:a.verdict,rule:a.rule,confidence:a.confidence,why:a.why},webChecked:false});
c[fin.verdict]=(c[fin.verdict]||0)+1;}
console.log(c,'noSecond',noSecond,flip);fs.writeFileSync('vfinal.rows.json',JSON.stringify(rows));
// 표본
let seed=29;const rnd=()=>(seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff;const shuf=a=>{const t=[...a];for(let i=t.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[t[i],t[j]]=[t[j],t[i]];}return t;};
const line=r=>`${r.id}|${T[r.id].answer.slice(0,12)}|${r.v}|${r.verdict}/${r.rule}/${r.confidence[0]}|${r.why}|Q:${T[r.id].question.replace(/\s+/g,' ').slice(-60)}`;
const hi=shuf(rows.filter(r=>r.verdict==='accept'&&r.confidence==='high')).slice(0,100);
fs.writeFileSync('s_hi.txt',hi.map(line).join('\n'));
const asc=shuf(rows.filter(r=>r.verdict==='reject'&&/^[\x20-\x7e]+$/.test(r.v))).slice(0,60);
fs.writeFileSync('s_asc.txt',asc.map(line).join('\n'));
const lm=shuf(rows.filter(r=>r.verdict==='accept'&&r.confidence!=='high')).slice(0,150);
fs.writeFileSync('s_lm.txt',lm.map(line).join('\n'));
console.log('ascii reject total',rows.filter(r=>r.verdict==='reject'&&/^[\x20-\x7e]+$/.test(r.v)).length);
