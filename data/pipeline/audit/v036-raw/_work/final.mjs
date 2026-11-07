import fs from 'node:fs';
const D='data/pipeline/audit/v036-raw/';
const o=JSON.parse(fs.readFileSync(D+'merged-raw.json','utf8'));
const ks=new Set(JSON.parse(fs.readFileSync(D+'_work/keep-sample.json','utf8')).map(String));
const web3=new Set(['7119','7446','7228']);
for(const x of o){x.reread=x.verdict!=='keep'?'VERIFY 재독(fix 전부)':ks.has(x.id)?'VERIFY 재독(keep 표본)':'조각만';if(web3.has(x.id))x.reread+=' + 직접 웹(WebFetch)';}
const adj=(id,f)=>{const x=o.find(y=>y.id===id);f(x);x.reread+=' · VERIFY 조정'};
adj('7400',x=>{x.verdict='fix';x.hint='fix';x.hint_form='h3';x.verdict_why='(VERIFY 재독) 힌트가 질문의 "초등 과정의 옛 이름" 을 되풀이(H3) — 조각이 keep 으로 둠. 제안 없음 → G034 가 새 사실로 교체'});
adj('7194',x=>{x.verdict='fix';x.hint='fix';x.hint_form='h2';x.verdict_why='(VERIFY 재독) 힌트 "단풍 드는 철" 이 정답 조각 "가을" 을 풀어 줌(H2) · 질문이 이미 "열리는 철" 을 말함 — 조각이 keep 으로 둠. 제안 없음'});
adj('7091',x=>{x.verdict_why+=' · (VERIFY) hint_fix 문안의 \n 이스케이프가 조각 출력에서 깨졌다(빈 따옴표·줄바꿈) → 적용 전 "줄바꿈 같은 특수 문자를 나타내는 표시" 처럼 백슬래시 없이 다시 쓸 것'});
adj('7463',x=>{x.verdict_why+=' · (VERIFY 재독) 힌트 "긴장 완화 국면" 이 질문 되풀이 기미(약함) — keep 유지, G034 선택'});
fs.writeFileSync(D+'../v036-g032.json',JSON.stringify({round:'V036',at:new Date().toISOString(),n:o.length,items:o},null,1));
const cnt=(f)=>o.reduce((m,x)=>{const k=f(x);m[k]=(m[k]||0)+1;return m},{});
console.log('verdict',cnt(x=>x.verdict),'reread',cnt(x=>x.reread.split(' ')[0]+x.reread.split(' ')[1]));
// 5x5
const g=[...Array(6)].map(()=>Array(6).fill(0));o.forEach(x=>g[x.gradeIndep][x.scoreV4]++);
for(let i=1;i<=5;i++)console.log('독'+i,g[i].slice(1).join(' '));
const agree=o.filter(x=>x.gradeIndep===x.scoreV4).length;const lo=o.filter(x=>x.gradeIndep<x.scoreV4).length,hi=o.filter(x=>x.gradeIndep>x.scoreV4).length;
console.log('agree',agree,'indep lower',lo,'higher',hi,'mean diff',(o.reduce((a,x)=>a+x.gradeIndep-x.scoreV4,0)/o.length).toFixed(3),'within1',o.filter(x=>Math.abs(x.gradeIndep-x.scoreV4)<=1).length);
const v4_4=o.filter(x=>x.scoreV4===4);console.log('v4=4:',v4_4.length,'indep dist',cnt2(v4_4));function cnt2(a){return JSON.stringify(a.reduce((m,x)=>{m[x.gradeIndep]=(m[x.gradeIndep]||0)+1;return m},{}))}
console.log('indep=4/5:',o.filter(x=>x.gradeIndep>=4).map(x=>x.id+':'+x.answer+'(v4 '+x.scoreV4+')').join(' '));
console.log('worth agree',o.filter(x=>x.worthIndep===x.worthStored).length,'indep higher',o.filter(x=>x.worthIndep>x.worthStored).length,'lower',o.filter(x=>x.worthIndep<x.worthStored).length,'worth1',o.filter(x=>x.worthIndep===1).map(x=>x.id).join(','));
const fix=o.filter(x=>x.verdict==='fix');
const heavy=fix.filter(x=>x.read==='rewrite'||x.hint==='fix'||x.unique_ok===false||(x.fact==='false'&&!/^해설/.test(x.fact_fix||'')));
const falseQH=o.filter(x=>x.fact==='false');
console.log('fix',fix.length,'질문·힌트 손질',heavy.length,'hint fix',o.filter(x=>x.hint==='fix').length,'read rewrite',o.filter(x=>x.read==='rewrite').length,'fact false',falseQH.length,'unverified',o.filter(x=>x.fact==='unverified').length,'unique✗',o.filter(x=>x.unique_ok===false).length);
console.log('only variants/expl',fix.length-heavy.length);
console.log('hint forms',JSON.stringify(cnt(x=>x.hint==='fix'?String(x.hint_form||'').split(/[ (/]/)[0].replace(/-.*/,''):'-')));
console.log('missing variants items',o.filter(x=>x.missing_variants?.length).length,'total',o.reduce((a,x)=>a+(x.missing_variants?.length||0),0));
console.log('webfetch sum',o.reduce((a,x)=>a+(x.fact_web||0),0),'items with 0 web',o.filter(x=>!x.fact_web).length);
// by category of source
console.log('piece verdict',JSON.stringify(cnt(x=>x.piece+':'+x.verdict)));
