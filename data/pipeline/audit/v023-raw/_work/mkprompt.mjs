import fs from 'node:fs';
let t=fs.readFileSync('../../v022-raw/_work/f01.prompt.txt','utf8');
const names=process.argv.slice(2);
for(const n of names){const k=JSON.parse(fs.readFileSync(n+'.keys.json','utf8'));
 let p=t.replaceAll('v022-raw','v023-raw').replaceAll('f01',n).replace('블록 50개','블록 '+k.length+'개').replace('(입력 순서 · 50개)','(입력 순서 · '+k.length+'개)');
 fs.writeFileSync(n+'.prompt.txt',p);}
console.log(names.length, fs.readFileSync(names[0]+'.prompt.txt','utf8').match(/블록 \d+개|순서 · \d+개/g));
