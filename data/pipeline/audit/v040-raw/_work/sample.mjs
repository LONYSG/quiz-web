import fs from 'node:fs';
const A='data/pipeline/audit/';const J=f=>JSON.parse(fs.readFileSync(A+f,'utf8'));
const agg=J('g038-raw/agg.json').all;const dec=J('g038-decisions.json').items;
const byId={};for(const v of Object.values(agg))byId[v.id]=v;
// seeded rng
let s=40111;const rnd=()=>{s=(s*1664525+1013904223)>>>0;return s/2**32};
const shuf=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const ch=Object.keys(dec).map(Number);
const info=ch.map(id=>({id,cls:byId[id]?.cls??'?',grade:byId[id]?.grade}));
const cnt={};for(const x of info){const k=x.grade+x.cls;cnt[k]=(cnt[k]||0)+1}
console.log(cnt);
const pick=[];
for(let g=1;g<=5;g++){const L=shuf(info.filter(x=>x.grade===g&&x.cls==='L')),Aa=shuf(info.filter(x=>x.grade===g&&x.cls==='A')),o=shuf(info.filter(x=>x.grade===g&&x.cls!=='L'&&x.cls!=='A'));
 let l=L.slice(0,35),a=Aa.slice(0,15);const need=50-l.length-a.length;if(need>0){const rest=[...L.slice(35),...Aa.slice(15),...o];l=l.concat(rest.slice(0,need))}
 pick.push(...l,...a)}
const C=Object.values(agg).filter(v=>v.cls==='C').map(v=>({id:v.id,cls:'C',grade:v.grade}));
console.log('picked',pick.length,'C',C.length,'unk',info.filter(x=>x.cls==='?').length);
fs.writeFileSync(A+'v040-raw/sample.json',JSON.stringify({seed:40111,changed:pick,core:C},null,1));
