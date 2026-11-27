import {items,bad} from './lib.mjs';
await import('./p1.mjs'); await import('./p2.mjs');
console.log(bad.length?bad.join('\n'):'ALL OK', items.length);
import fs from 'fs';
items.forEach((it,i)=>it.key='n'+(1901+i));
const out={done:true,chunk:'새재료-19',lane:'easy',items,dropped:{dupActive:80,weakStory:4,noSource:1,other:1},opened:36};
if(!bad.length) fs.writeFileSync('../chunk-19.json',JSON.stringify(out,null,1));
