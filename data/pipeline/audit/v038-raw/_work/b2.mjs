import fs from 'node:fs';import {normalizeAnswer as N} from '../../../../../shared/dist/index.js';
const D='data/pipeline/audit/v038-raw/';const R=JSON.parse(fs.readFileSync('data/pipeline/audit/v038-refurb.json','utf8'));const T=new Map(JSON.parse(fs.readFileSync(D+'targets.json','utf8')).items.map(i=>[i.id,i]));
const m=new Map(R.items.map(x=>[x.id,x]));let n=0;
for(let i=1;i<=4;i++){const f=D+`blind2/blind2-0${i}-out.json`;if(!fs.existsSync(f))continue;for(const o of JSON.parse(fs.readFileSync(f,'utf8'))){const x=m.get(String(o.id));const t=T.get(String(o.id));const g=N(String(o.guess2||''));
 x.guess2=o.guess2;x.ask2=o.ask2;x.guess2_hit=!!g&&o.guess2!=='?'&&[t.display_answer,...(t.variants||[])].some(a=>{const na=N(a);return na&&(na.includes(g)||g.includes(na))});n++}}
fs.writeFileSync('data/pipeline/audit/v038-refurb.json',JSON.stringify(R,null,1));
const F=R.items.filter(x=>x.fix_text);console.log('blind2',n,'fix',F.length);
const p=(a,b)=>(100*a/b).toFixed(1);let rows=[];
for(let k=1;k<=12;k++){const L=F.filter(x=>x.piece===k);if(!L.length)continue;const b=L.filter(x=>x.guess_hit).length,a=L.filter(x=>x.guess2_hit).length;rows.push([k,L.length,p(b,L.length),p(a,L.length),(p(a,L.length)-p(b,L.length)).toFixed(1)])}
console.table(rows.map(r=>({piece:r[0],n:r[1],before:r[2],after:r[3],diff:r[4]})));
const tb=F.filter(x=>x.guess_hit).length,ta=F.filter(x=>x.guess2_hit).length;console.log('total before',p(tb,F.length),'after',p(ta,F.length));
for(const g of [1,2]){const L=F.filter(x=>x.grade===g);console.log('grade',g,L.length,p(L.filter(x=>x.guess_hit).length,L.length),p(L.filter(x=>x.guess2_hit).length,L.length))}
fs.writeFileSync(D+'_work/lost.json',JSON.stringify(F.filter(x=>x.guess_hit&&!x.guess2_hit).map(x=>x.id)));
console.log('hit→miss',F.filter(x=>x.guess_hit&&!x.guess2_hit).length,'miss→hit',F.filter(x=>!x.guess_hit&&x.guess2_hit).length);
