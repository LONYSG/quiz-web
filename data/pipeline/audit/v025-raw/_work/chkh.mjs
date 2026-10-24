import fs from 'node:fs'; const p=process.argv[2]; const o=JSON.parse(fs.readFileSync(p+'.out.json','utf8')); const k=JSON.parse(fs.readFileSync(p+'.keys.json','utf8'));
const c={},h={};for(const x of o){c[x.confidence]=(c[x.confidence]||0)+1;h[x.how]=(h[x.how]||0)+1}
console.log(p,o.length,k.length,o.every((x,i)=>x.key===k[i]),JSON.stringify(c),JSON.stringify(h));
