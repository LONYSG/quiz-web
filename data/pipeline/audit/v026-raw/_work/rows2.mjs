import fs from 'node:fs';
const J=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const rows=J('guess-rows.json');const all={};for(let i=1;i<=12;i++)for(const x of J('../g'+i+'.out.json'))all[x.ref]=x;
const bad=new Set(['C1-09','K2-22','L1-25']);
const HC=['famous-one','meaning','spoon-feed','letters','alias','question-repeat','weak','pair-same','wrong-name','name-group','explain-overlap'];
for(const r of rows){r.hit=(r.exact||r.part)&&!bad.has(r.ref);r.v=all[r.ref];r.hintFix=r.v.verdict!=='ok'&&(r.v.categories||[]).some(c=>HC.includes(c));}
const cnt=(a,f)=>a.reduce((m,x)=>{const k=f(x);m[k]=(m[k]||0)+1;return m},{});
console.log('hits',rows.filter(r=>r.hit).length,'/',rows.length,'GEN',rows.filter(r=>r.genHit).length);
console.log('hit by how & fixed:',JSON.stringify(cnt(rows.filter(r=>r.hit),r=>r.how+(r.hintFix?':fix':':ok'))));
console.log('miss',JSON.stringify(cnt(rows.filter(r=>!r.hit),r=>r.how+(r.hintFix?':fix':':ok'))));
console.log('agree',JSON.stringify(cnt(rows,r=>(r.hit?'V1':'V0')+'/'+(r.genHit?'G1':'G0'))));
console.log('high',rows.filter(r=>r.conf==='high').length,rows.filter(r=>r.conf==='high'&&r.hit).length);
console.log('byTopic',JSON.stringify(Object.fromEntries(Object.entries(cnt(rows,r=>r.topic)).map(([k,n])=>[k,[n,rows.filter(r=>r.topic===k&&r.hit).length]]))));
console.log('A/C hit & ok:');
for(const r of rows.filter(r=>r.hit&&(r.how==='A'||r.how==='C')&&!r.hintFix))console.log(r.ref,r.how,r.conf,r.answer,'<-',r.guess,'|',r.hint.slice(0,110),'|',(r.v.note||'').slice(0,90));
fs.writeFileSync('guess-rows2.json',JSON.stringify(rows,null,1));
