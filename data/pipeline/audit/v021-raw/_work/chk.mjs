import fs from 'node:fs'; const p=process.argv[2]; const o=JSON.parse(fs.readFileSync(p+'.out.json','utf8')); const k=JSON.parse(fs.readFileSync(p+'.keys.json','utf8'));
const c={};for(const x of o)c[x.verdict]=(c[x.verdict]||0)+1;
console.log(p,o.length,k.length,o.every((x,i)=>(x.key||x.id)===k[i]),JSON.stringify(c));
