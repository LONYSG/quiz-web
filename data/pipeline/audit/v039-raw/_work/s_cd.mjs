import fs from 'node:fs';import {rows,save,compare,topic,canon} from './lib.mjs';import {cover} from './cover.mjs';
// constellation
let r=rows(fs.readFileSync('_cache/ko-국제천문연맹_지정_별자리.html','utf8')).filter(x=>x.length>=5&&/자리 \//.test(x[0]));
let names=r.map(x=>x[0].split(' / ')[0].trim());console.log('const',names.length);save('constellation',names);console.log(JSON.stringify(compare('constellation',names)));
// disney
r=rows(fs.readFileSync('_cache/ko-디즈니의_장편_애니메이션_영화_목록.html','utf8')).filter(x=>/^《/.test(x[0]));
names=r.map(x=>x[0].replace(/[《》]/g,'').trim());console.log('disney rows',names.length);
const studios=r.map(x=>x.slice(1).join(' ; '));
fs.writeFileSync('_work/disney.txt',r.map(x=>x.join(' ; ')).join('\n'));
const t=topic('disney-animated-film');console.log('file',t.items.length);
console.log(JSON.stringify(compare('disney-animated-film',names)));
