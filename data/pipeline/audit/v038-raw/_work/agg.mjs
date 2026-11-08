import fs from 'node:fs';
const J=JSON.parse(fs.readFileSync('data/pipeline/audit/v038-refurb.json','utf8')).items;
const pc=(a,b)=>b?(100*a/b).toFixed(0)+'%':'-';
function row(name,L){const n=L.length;const c=k=>L.filter(k).length;
 console.log(name.padEnd(8),n,'read a/b/c',pc(c(x=>x.read_final==='a'),n),pc(c(x=>x.read_final==='b'),n),pc(c(x=>x.read_final==='c'),n),'askok',pc(c(x=>x.ask_ok),n),'dup',pc(c(x=>x.subj==='dup'),n),'cramp',pc(c(x=>x.comp==='cramped'),n),'fix',pc(c(x=>x.verdict==='fix'),n),'fixtext',pc(c(x=>x.fix_text),n),'refit',pc(c(x=>x.hint_refit==='yes'),n),'w3',pc(c(x=>x.worth_v===3),n),'hit',pc(c(x=>x.guess_hit),n))}
for(const g of [1,2,3,4,5])row('grade'+g,J.filter(x=>x.grade===g));
for(const g of ['a','b','c'])row('group'+g,J.filter(x=>x.group===g));
row('all',J);
console.log('piece fix%:',Array.from({length:12},(_,i)=>{const L=J.filter(x=>x.piece===i+1);return pc(L.filter(x=>x.verdict==='fix').length,L.length)}).join(' '));
console.log('g030 seen',J.filter(x=>x.g030_seen).length,'fixed',J.filter(x=>x.g030_fixed).length,'fixed→b/c',J.filter(x=>x.g030_fixed&&x.read_final!=='a').length,'fix',J.filter(x=>x.g030_fixed&&x.verdict==='fix').length);
console.log('worth_v!=3',J.filter(x=>x.worth_v!==3).length);
