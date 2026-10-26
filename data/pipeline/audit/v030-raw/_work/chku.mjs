import fs from 'node:fs';import {W,T} from './vblocks.mjs';
const lenQ=(s)=>[...s].length;
for(const p of process.argv.slice(2)){let o;try{o=JSON.parse(fs.readFileSync(W+p+'.out.json','utf8'));}catch(e){console.log(p,'PARSE FAIL',e.message);continue;}
const k=JSON.parse(fs.readFileSync(W+p+'.keys.json','utf8'));const errs=[];
if(o.length!==k.length)errs.push('len '+o.length+'/'+k.length);
if(!o.every((x,i)=>Number(x.id)===k[i]))errs.push('order');
const c={};
for(const x of o){c[x.verdict]=(c[x.verdict]||0)+1;
if(!['unique','narrow','accept','drop'].includes(x.verdict))errs.push('verdict '+x.id);
if(!['high','mid','low'].includes(x.confidence))errs.push('conf '+x.id);
if(typeof x.why!=='string'||!x.why||[...x.why].length>40)errs.push('why '+x.id);
const t=T[x.id];if(!t)continue;
if(x.verdict==='narrow'){if(!x.fixText||lenQ(x.fixText)>200)errs.push('fix len '+x.id);
 else{const a=[t.answer,...t.variants];for(const s of a){if(s.length>=2&&x.fixText.includes(s))errs.push('LEAK '+x.id+':'+s);}}}
if(x.verdict==='accept'&&!(x.addVariants?.length))errs.push('noadd '+x.id);
if(x.verdict!=='narrow'&&x.fixText)errs.push('fix extra '+x.id);}
console.log(p,o.length,JSON.stringify(c),errs.length?'ERR '+errs.slice(0,8).join(' '):'ok');}
