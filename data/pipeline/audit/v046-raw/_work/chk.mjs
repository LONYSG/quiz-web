import fs from 'fs';
const d='data/minigame/topics/';const S={};
for(const f of fs.readdirSync(d).filter(x=>x.startsWith('metro-')))S[f.slice(0,-5)]=JSON.parse(fs.readFileSync(d+f,'utf8'));
const has=(t,q)=>S[t].items.some(i=>i.name===q||i.variants.includes(q));
for(const [q,t] of [['수원','metro-line1'],['세류','metro-line1'],['금정','metro-line1'],['광명','metro-line1'],['수원역','metro-line1'],['수원시청','metro-suin-bundang'],['수원시청역','metro-suin-bundang'],['금정','metro-line4'],['수원','metro-suin-bundang']])console.log(q,t,has(t,q));
// 환승 cross: names in >=2 sets
const m={};for(const[t,s]of Object.entries(S))for(const i of s.items)(m[i.name]??=[]).push(t);
console.log('multi',Object.values(m).filter(a=>a.length>1).length);
// variant collisions within set
for(const[t,s]of Object.entries(S)){const seen={};for(const i of s.items)for(const k of [i.name,...i.variants]){if(seen[k]&&seen[k]!==i.id)console.log('COLL',t,k);seen[k]=i.id}}
console.log(S['metro-line4'].items.find(i=>i.id==='metro-line4-035'));
console.log(S['metro-gyeongui-jungang'].items.filter(i=>/항공대/.test(i.name+i.variants)));
