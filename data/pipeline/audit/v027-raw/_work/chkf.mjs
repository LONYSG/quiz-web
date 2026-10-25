import fs from 'node:fs'; const p=process.argv[2]; const o=JSON.parse(fs.readFileSync(p+'.out.json','utf8')); const k=JSON.parse(fs.readFileSync(p+'.keys.json','utf8'));
const cal=JSON.parse(fs.readFileSync(process.env.CAL||'cal1.json','utf8')); const exp=Object.fromEntries(cal.map(c=>[c.id,c.expected]));
const c={};for(const x of o)c[x.familiarity]=(c[x.familiarity]||0)+1;
const calRes=o.filter(x=>exp[x.id]!==undefined); const bad=calRes.filter(x=>x.familiarity!==exp[x.id]);
const pctok=o.every(x=>(x.familiarity===3&&x.pct>=70)||(x.familiarity===2&&x.pct>=30&&x.pct<70)||(x.familiarity===1&&x.pct<30));
console.log(p,o.length,k.length,o.every((x,i)=>x.id===k[i]),JSON.stringify(c),'cal',calRes.length,'mismatch',bad.map(x=>x.id+':'+x.familiarity+'(exp '+exp[x.id]+')').join(','),'pctConsistent',pctok);
console.log('  caught1',calRes.filter(x=>exp[x.id]===1&&x.familiarity===1).length+'/5');
