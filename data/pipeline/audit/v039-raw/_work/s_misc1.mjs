import fs from 'node:fs';import {rows,lines,save,compare,topic} from './lib.mjs';
const R=f=>rows(fs.readFileSync('_cache/'+f,'utf8'));
// EPL
let r=R('en-List_of_Premier_League_clubs.html').filter(x=>x.length>8&&x[0]!=='Club');
let n=[...new Set(r.map(x=>x[0].replace(/\[.*?\]/g,'').replace(/[*†‡§]+$/,'').trim()))];console.log('epl',n.length,n.join(' | '));
save('epl-club',n);console.log(JSON.stringify(compare('epl-club',n)));
console.log(topic('epl-club').items.map(i=>i.name+'['+i.variants.join('/')+']').join(' '));
