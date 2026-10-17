import fs from 'node:fs';
const R='C:/work/quiz-web/data/pipeline/audit/v014-raw/g009a';const J=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const items=Object.fromEntries(J(R+'/_work/items.json').map(x=>[x.ref,x]));
const all=[];for(let i=1;i<=8;i++)for(const x of J(`${R}/g${i}.out.json`))all.push({...x,piece:'g'+i});
const cnt=(a,f)=>a.reduce((m,x)=>{const k=f(x);m[k]=(m[k]||0)+1;return m},{});
console.log('n',all.length,cnt(all,x=>x.verdict));
console.log('blind dif',cnt(all,x=>x.score?.dif),'GEN final',cnt(all,x=>items[x.ref].score.dif));
const up=all.filter(x=>x.score.dif>items[x.ref].score.dif).length,dn=all.filter(x=>x.score.dif<items[x.ref].score.dif).length;console.log('judge higher than GEN',up,'lower',dn);
console.log('top(>=4) blind',all.filter(x=>x.score.dif>=4).length,'top & not drop',all.filter(x=>x.score.dif>=4&&x.verdict!=='drop').length,'GEN top',all.filter(x=>items[x.ref].score.dif>=4).length);
const cat={};for(const x of all.filter(x=>x.verdict!=='ok'))for(const k of x.categories||[])cat[k]=(cat[k]||0)+1;console.log('cat',cat);
console.log('byTopic',Object.fromEntries(Object.entries(cnt(all,x=>items[x.ref].topic)).map(([t,n])=>[t,[n,all.filter(x=>items[x.ref].topic===t&&x.verdict!=='ok').length]])));
console.log('method',cnt(all,x=>items[x.ref].method+':'+x.verdict));
console.log('rewrite',cnt(all,x=>String(items[x.ref].rewrite?.changed)+':'+x.verdict));
console.log('rwCheckBad',all.filter(x=>x.rewriteCheck?.applies&&(x.rewriteCheck.unique===false||x.rewriteCheck.addedCueInFacts===false||x.rewriteCheck.minor||x.rewriteCheck.readable===false)).map(x=>x.ref));
console.log('hasHint', all.filter(x=>items[x.ref].hint).length,'hint fix',all.filter(x=>x.verdict!=='ok'&&(x.categories||[]).some(c=>['spoon-feed','famous-one','meaning','shape-only','shape','wrong-name','pair-same','letters','alias','h-error','explain-overlap','question-repeat','weak'].includes(c))).length);
console.log('webOpened',cnt(all,x=>x.webOpened),'defForm',all.filter(x=>x.defForm).length);
console.log('unverified items',all.filter(x=>(x.facts||[]).some(f=>f.result==='unverified')).length,'애매 notes',all.filter(x=>/^애매/.test(x.note||'')).length);
console.log('drops',all.filter(x=>x.verdict==='drop').map(x=>[x.ref,x.categories,x.reason.slice(0,80)]));
// r2
const r2=J(R+'/r2.out.json'),by=Object.fromEntries(all.map(x=>[x.ref,x]));let ag=0,w1=0,n=0,both4=0,j4=0,r4=0;const gen=[];
for(const x of r2){const j=by[x.ref];if(!j)continue;n++;const d=Math.abs(x.dif-j.score.dif);if(d===0)ag++;if(d<=1)w1++;if(x.dif>=4&&j.score.dif>=4)both4++;if(j.score.dif>=4)j4++;if(x.dif>=4)r4++}
console.log('r2 vs judge n',n,'exact',ag,'within1',w1,'both>=4',both4,'judge>=4',j4,'r2>=4',r4);
