import fs from 'node:fs';
const J=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const map=J('guess.map.json');const T=J('../../g019a-verify-targets.json').targets;const by=Object.fromEntries(T.map(t=>[t.ref,t]));
const norm=s=>String(s).replace(/[\s·\-_()'"]/g,'').toLowerCase();
const rows=[];
for(const n of ['h01','h02','h03','h04','h05'])for(const x of J(n+'.out.json')){const ref=map[x.key];const t=by[ref];const set=[t.answer,...(t.variants||[]),...(t.originalTitleVariants||[])].map(norm);const g=norm(x.guess);
 const exact=set.includes(g);const part=!exact&&set.some(s=>s.length>=2&&(g.includes(s)||s.includes(g)&&g.length>=2));
 rows.push({ref,topic:t.topic,answer:t.answer,guess:x.guess,conf:x.confidence,how:x.how,note:x.note,exact,part,genHit:t.blind?.hit,genGuess:t.blind?.guess,genConf:t.blind?.confidence,hint:t.hint});}
const cnt=(a,f)=>a.reduce((m,x)=>{const k=f(x);m[k]=(m[k]||0)+1;return m},{});
console.log('n',rows.length,'exact',rows.filter(r=>r.exact).length,'part',rows.filter(r=>r.part).length,'genHit',rows.filter(r=>r.genHit).length);
console.log('how all',cnt(rows,r=>r.how),'how hit',cnt(rows.filter(r=>r.exact),r=>r.how));
console.log('byTopic',JSON.stringify(Object.fromEntries(Object.entries(cnt(rows,r=>r.topic)).map(([k,n])=>[k,[n,rows.filter(r=>r.topic===k&&r.exact).length]]))));
console.log('agree (v exact vs gen)',cnt(rows,r=>(r.exact?'V1':'V0')+'/'+(r.genHit?'G1':'G0')));
fs.writeFileSync('guess-rows.json',JSON.stringify(rows,null,1));
console.log('part',rows.filter(r=>r.part).map(r=>r.ref+':'+r.answer+'->'+r.guess).join(' | '));
console.log('hit&how A/C',rows.filter(r=>r.exact&&(r.how==='A'||r.how==='C')).length);
