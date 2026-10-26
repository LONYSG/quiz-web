import fs from 'node:fs';import {W} from './vblocks.mjs';
const RULES=['B1','DG-051','B10','B3','B2','B4','B5','B6','B7','B9','other'];
export function chkv(p,gold){let o;try{o=JSON.parse(fs.readFileSync(W+p+'.out.json','utf8'));}catch(e){return {p,fail:'PARSE '+e.message};}
const k=JSON.parse(fs.readFileSync(W+p+'.keys.json','utf8'));const errs=[];if(o.length!==k.length)errs.push('len '+o.length+'/'+k.length);
const c={};let miss=[];
o.forEach((x,i)=>{if(k[i]&&(Number(x.id)!==k[i].id||x.v!==k[i].v))errs.push('order@'+i);
c[x.verdict]=(c[x.verdict]||0)+1;
if(!['accept','reject','unsure'].includes(x.verdict))errs.push('verdict@'+i);
if(!['high','mid','low'].includes(x.confidence))errs.push('conf@'+i);
if(typeof x.why!=='string'||!x.why||[...x.why].length>30)errs.push('why@'+i);
if(!RULES.includes(x.rule))errs.push('rule@'+i+':'+x.rule);
if(typeof x.needsWeb!=='boolean')errs.push('web@'+i);
if(gold){const g=gold[x.id+'|'+x.v];if(g&&g!==x.verdict)miss.push(x.id+'|'+x.v+' gold '+g+' got '+x.verdict);}});
return {p,n:o.length,c,errs,miss};}
if((process.argv[1]||'').endsWith('chkv.mjs'))for(const p of process.argv.slice(2)){const r=chkv(p);console.log(p,r.n,JSON.stringify(r.c),r.errs?.length?'ERR '+r.errs.slice(0,8).join(' '):'ok',r.fail||'');}
