import fs from 'node:fs';
const J=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const { checkHint } = await import('file:///C:/work/quiz-web/scripts/hint-check.mjs');
const { findAnswerInQuestion, } = await import('file:///C:/work/quiz-web/pipeline/lib/answer-rules.mjs');
const { assertiveWords, answerFragments, blankCheck } = await import('file:///C:/work/quiz-web/pipeline/lib/question-checks.mjs');
const it=Object.fromEntries(J('items.json').map(x=>[x.ref,x]));const all=[];for(let i=1;i<=12;i++)for(const x of J('../g'+i+'.out.json'))all.push(x);
const q=[...Object.values(it)].map(x=>[...x.question].length);
console.log('QLEN max',Math.max(...q),'>170',q.filter(n=>n>170).length,'>200',q.filter(n=>n>200).length);
const out={hintBad:[],qBad:[],hintN:0,qN:0};
for(const x of all){const p=x.proposal||{};const t=it[x.ref];
 if(p.hint){out.hintN++;const r=checkHint({hint:p.hint,answer:t.answer,variants:t.variants||[],question:p.question||t.question,explanation:t.explanation||''});const len=[...p.hint].length;if(r.block.length||len>120||/\n/.test(p.hint))out.hintBad.push([x.ref,len,r.block.map(b=>b.kind||b)])}
 if(p.question){out.qN++;const len=[...p.question].length;const ex=findAnswerInQuestion(p.question,t.answer);const bl=blankCheck(p.question,t.answer);if(len>200||ex!=='none'||!bl.ok)out.qBad.push([x.ref,len,ex,bl.ok])}}
console.log(JSON.stringify(out));
// 현재 힌트 기계 검사(전체)
let hb=0,hw={};for(const t of Object.values(it)){if(!t.hint)continue;const r=checkHint({hint:t.hint,answer:t.answer,variants:t.variants||[],question:t.question,explanation:t.explanation||''});if(r.block.length)hb++;for(const w of r.warn)hw[w.kind]=(hw[w.kind]||0)+1}
console.log('hint block',hb,'warn',JSON.stringify(hw));
