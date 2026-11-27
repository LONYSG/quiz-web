import fs from 'node:fs';
const s = JSON.parse(fs.readFileSync('../v117-regrade.json','utf8'));
const cards = Object.entries(s.cards);
// anchors
let gIn=0,gEq=0,wEq=0,n=0, lowG=[], lowW=[];
for (const [k,v] of Object.entries(s.anchors)) { const [a,b]=v.grade.split('/').map(Number), [c]=v.gradeSame.split('/').map(Number), [d]=v.worth.split('/').map(Number); gIn+=a;gEq+=c;wEq+=d;n+=5; if(a<5)lowG.push(k); if(d<4)lowW.push(k+':'+v.worth);}
console.log('anchors', {chunks:Object.keys(s.anchors).length, gradeWithin1:gIn+'/'+n, gradeSame:gEq+'/'+n, worthSame:wEq+'/'+n, lowG, lowW});
// grade matrix
const m={}; for (const [,c] of cards){ const k=c.was.grade+'>'+c.grade; m[k]=(m[k]??0)+1;}
const rows=[1,2,3,4,5].map(f=>{const tot=cards.filter(([,c])=>c.was.grade===f).length; const r={from:f,tot}; for(const t of [1,2,3,4,5]) r['to'+t]=m[f+'>'+t]??0; r.up=[1,2,3,4,5].filter(t=>t>f).reduce((a,t)=>a+r['to'+t],0); r.down=[1,2,3,4,5].filter(t=>t<f).reduce((a,t)=>a+r['to'+t],0); r.upPct=Math.round(100*r.up/tot); r.downPct=Math.round(100*r.down/tot); return r});
console.table(rows);
const gd={}; for (const [,c] of cards) gd[c.grade]=(gd[c.grade]??0)+1; console.log('new grade dist',gd);
const od={}; for (const [,c] of cards) od[c.was.grade]=(od[c.was.grade]??0)+1; console.log('old grade dist',od);
// worth
const wm={}; for (const [,c] of cards){ const k=(c.was.worth??'null')+'>'+c.worth; wm[k]=(wm[k]??0)+1;}
console.log('worth', wm);
const wd={}; for (const [,c] of cards) wd[c.worth]=(wd[c.worth]??0)+1; console.log('new worth',wd);
const kd={}; for (const [,c] of cards) kd[c.worthKind]=(kd[c.worthKind]??0)+1; console.log('kind',kd);
// jumps >=2
console.log('grade jump>=2:', cards.filter(([,c])=>Math.abs(c.grade-c.was.grade)>=2).length);
// blind other
const oth=cards.filter(([,c])=>c.blind==='other');
console.log('blind other by grade', [1,2,3,4,5].map(g=>g+':'+oth.filter(([,c])=>c.grade===g).length+'/'+cards.filter(([,c])=>c.grade===g).length).join(' '));
fs.writeFileSync('blind-other.json', JSON.stringify(oth.map(([id,c])=>({id,a:null,blindAnswer:c.blindAnswer,grade:c.grade}))));
