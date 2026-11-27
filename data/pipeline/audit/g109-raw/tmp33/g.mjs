import {strip} from './s.mjs';
const [f,...ks]=process.argv.slice(2);const t=strip(f);
for(const k of ks){let i=-1,n=0;while((i=t.indexOf(k,i+1))>=0&&n<3){console.log('>>',t.slice(Math.max(0,i-60),i+260));n++;}}
