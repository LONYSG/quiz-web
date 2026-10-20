import fs from 'node:fs'; import { createRequire } from 'node:module';
const { normalizeAnswer } = await import('file:///C:/work/quiz-web/shared/dist/index.js');
const J=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const items=J('items.json'); const by=Object.fromEntries(items.map(x=>[x.id,x]));
const out=['p1','p2','p3','p4'].flatMap(p=>J(p+'.out.json'));
const map=J('blind-map.json'); const bo=J('blind.out.json'); const bid=Object.fromEntries(map.map(m=>[m.b,m.id]));
const n=s=>normalizeAnswer(s||'').replace(/[^0-9a-z가-힣]/g,'');
const blind={};
for(const g of bo){const id=bid[g.b];const t=by[id];const set=[t.answer,...t.variants].map(n);const gs=n(g.guess);
 const exact=gs&&set.some(s=>s===gs||(gs.length>=2&&(s.includes(gs)||gs.includes(s))));
 const alt=(g.alternatives||[]).some(a=>set.includes(n(a)));
 blind[id]={guess:g.guess,confidence:g.confidence,alternatives:g.alternatives||[],exact:!!exact,inAlt:alt&&!exact,answer:t.answer};}
fs.writeFileSync('blind-auto.json',JSON.stringify(blind,null,1));
const res={};for(const o of out){res[o.id]={...o,grp:by[o.id].grp,kind:by[o.id].kind,blind:blind[o.id]||null};}
fs.writeFileSync('merged.json',JSON.stringify(res,null,1));
const cnt=(a,f)=>a.reduce((m,x)=>{const k=f(x);m[k]=(m[k]||0)+1;return m},{});
const all=Object.values(res);
console.log('total',all.length,cnt(all,x=>x.verdict));
for(const g of ['g009b','g013','g014','g015']){const a=all.filter(x=>x.grp===g);const w=a.filter(x=>x.kind!=='cleared');const c=a.filter(x=>x.kind==='cleared');console.log(g,'n',a.length,'written',w.length,'fix',w.filter(x=>x.verdict==='fix').length,'cleared',c.length,'fix',c.filter(x=>x.verdict==='fix').length);}
const w=all.filter(x=>x.kind!=='cleared');
console.log('written total',w.length,'fix',w.filter(x=>x.verdict==='fix').length,'cats',cnt(w.filter(x=>x.verdict==='fix').flatMap(x=>x.categories.map(c=>({c}))),x=>x.c));
console.log('famous-one fix',w.filter(x=>x.categories.includes('famous-one')).length);
const b=w.filter(x=>x.blind);console.log('blind n',b.length,'exact',b.filter(x=>x.blind.exact).length,'모름',b.filter(x=>x.blind.guess==='모름').length,'inAlt',b.filter(x=>x.blind.inAlt).length);
const fx=b.filter(x=>x.verdict==='fix'),ok=b.filter(x=>x.verdict==='ok');
console.log('fix&exact',fx.filter(x=>x.blind.exact).length,'/',fx.length,' ok&exact',ok.filter(x=>x.blind.exact).length,'/',ok.length);
console.log('exact list');for(const x of b.filter(x=>x.blind.exact||x.blind.inAlt))console.log(x.id,x.verdict,x.blind.confidence,x.blind.answer,'<-',x.blind.guess,x.blind.inAlt?'(alt)':'');
console.log('non-exact non-모름 fix');for(const x of fx.filter(x=>!x.blind.exact))console.log(x.id,x.blind.answer,'<-',x.blind.guess,x.blind.confidence,x.categories.join(','));
