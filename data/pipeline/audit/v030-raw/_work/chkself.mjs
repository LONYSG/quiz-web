import fs from 'node:fs';import {chkv} from './chkv.mjs';
const gold=JSON.parse(fs.readFileSync('self.gold.json','utf8'));const r=chkv('self',gold);console.log(r.n,JSON.stringify(r.c),r.errs,r.miss);
const o=JSON.parse(fs.readFileSync('self.out.json','utf8'));let ok=0;for(const x of o){if(gold[x.id+'|'+x.v]===x.verdict)ok++;}console.log('exact',ok+'/30');
