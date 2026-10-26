import fs from 'node:fs';import {W,T,vblock,groupBy} from './vblocks.mjs';
const acc=[[732,'원령공주'],[881,'로컬라이제이션'],[881,'번안'],[1099,'크로뮴'],[1226,'탈출기'],[1580,'과피'],[1793,'중풍'],[1821,'래브라도 리트리버'],[1868,'민주공화국'],[1969,'펜네 리가테'],[2224,'엿기름'],[2321,'깨강정'],[2321,'땅콩강정']];
const rej=[[47,'대영제국'],[570,'산세리프체'],[804,'유전자 가위'],[886,'MFA'],[896,'유독가스'],[1347,'페스트'],[1428,'피사탑'],[1901,'부처'],[2002,'콜럼부스'],[2071,'스태프 롤'],[2082,'다윗'],[2158,'세제'],[2688,'마킹'],[2978,'팬라이트'],[3662,'JSA'],[4278,'MBC'],[6331,'EXO-K']];
const gold={};const all=[];
for(const [i,v] of acc){gold[i+'|'+v]='accept';all.push({id:i,v,kind:'other'});}
for(const [i,v] of rej){gold[i+'|'+v]='reject';all.push({id:i,v,kind:'other'});}
let seed=7;const rnd=()=>(seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff;
const gs=groupBy(all).sort(()=>rnd()-0.5);
for(const g of gs)g.hide=g.cands.map(c=>c.v);
fs.writeFileSync(W+'self.txt',gs.map(vblock).join('\n'));
fs.writeFileSync(W+'self.keys.json',JSON.stringify(gs.flatMap(g=>g.cands.map(c=>({id:g.id,v:c.v})))));
fs.writeFileSync(W+'self.gold.json',JSON.stringify(gold));
console.log(all.length,gs.length);
