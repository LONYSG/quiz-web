import fs from 'node:fs';
const W='C:/work/quiz-web/data/pipeline/audit/v029-raw/_work/';
const R='C:/work/quiz-web/data/pipeline/audit/v029-raw/';
const T=JSON.parse(fs.readFileSync(R+'targets.json','utf8'));
const A=JSON.parse(fs.readFileSync(W+'anchors60.json','utf8'));
const items={};const anchorJudged={};let pieces=0;
const ancSet=new Set(A.map(a=>a.id));
for(let p=1;p<=65;p++){const n='p'+String(p).padStart(2,'0');const o=JSON.parse(fs.readFileSync(W+n+'.out.json','utf8'));pieces++;
 for(const x of o){const id=Number(x.id);if(ancSet.has(id)){(anchorJudged[id]||=[]).push(x.worth);continue;}
  if(items[id])throw 'dup '+id;items[id]={worth:x.worth,kind:x.kind,why:x.why,confidence:x.confidence,anchor:false,piece:n};}}
const KIND0={}; // 예 20 kinds
for(const a of A){items[a.id]={worth:a.worth,kind:a.kind==='이름확인'?(a.worth===3?'상식':a.worth===2?'취미세부':'고유명사'):a.kind,why:'눈금자(찬종)',confidence:'high',anchor:true,piece:null};}
const miss=Object.keys(T.items).filter(i=>!items[i]);console.log('pieces',pieces,'items',Object.keys(items).length,'missing',miss.length);
// anchor stats
let tot=0,bad=0,far=0;const badRows=[];
for(const [id,arr] of Object.entries(anchorJudged)){const g=A.find(a=>a.id==id).worth;for(const w of arr){tot++;if(w!==g){bad++;badRows.push(id+':'+g+'→'+w);}if(Math.abs(w-g)>1)far++;}}
console.log('anchor judgements',tot,'miss',bad,'far',far, badRows.length+' rows');
fs.writeFileSync(W+'items.v029.json',JSON.stringify(items));
fs.writeFileSync(W+'anchor.stats.json',JSON.stringify({tot,bad,far,badRows,perAnchor:Object.fromEntries(Object.entries(anchorJudged).map(([id,a])=>[id,{gold:A.find(x=>x.id==id).worth,n:a.length,miss:a.filter(w=>w!==A.find(x=>x.id==id).worth).length}]))}));
const dist={};for(const v of Object.values(items))dist[v.worth]=(dist[v.worth]||0)+1;console.log(dist);
