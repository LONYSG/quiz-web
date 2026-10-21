import fs from 'node:fs'; import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json'); const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const one=s=>(s??'').replace(/\s*\n\s*/g,' ').trim();
const c=new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const cats=(await c.query('select id,level,key,name_ko,parent_id,game_topic from categories')).rows; const topics=Object.fromEntries((await c.query('select key,name_ko from game_topics')).rows.map(r=>[r.key,r.name_ko]));
const cat=Object.fromEntries(cats.map(x=>[x.id,x]));
const chain=id=>{const a=[];let x=cat[id];while(x){a.push(x);x=x.parent_id?cat[x.parent_id]:null}return a};
const rows=(await c.query('select id,display_answer,explanation,difficulty_score d,category_id,accessibility,worth_knowing from questions where is_active')).rows; await c.end();
const info=r=>{const ch=chain(r.category_id);const topic=(ch.find(x=>x.game_topic)||{}).game_topic||null;const mid=ch.find(x=>x.level===2)||ch.find(x=>x.level===1)||ch[0];const first=one(r.explanation).split(/(?<=[.!?。]|다\.|요\.)\s/)[0];
 return {id:Number(r.id),answer:r.display_answer,topic,topicKo:topic?topics[topic]:'(없음)',mid:mid?.name_ko||'',cats:ch.map(x=>x.name_ko).reverse().join(' > '),first:first.slice(0,160),accessibility:r.accessibility,worth:r.worth_knowing,d:r.d}};
const v22=JSON.parse(fs.readFileSync('../../v022-targets.json','utf8')); const used=new Set(v22.targets.filter(t=>t.band==='mid').map(t=>t.id));
const pool=rows.filter(r=>r.d===3); const rest=pool.filter(r=>!used.has(Number(r.id))).map(info).sort((a,b)=>a.id-b.id);
fs.writeFileSync('../../v023-targets.json',JSON.stringify({round:'V023',date:'2026-10-21',counts:{active:rows.length,mid3Pool:pool.length,v022Sample:used.size,rest:rest.length},targets:rest.map(x=>({...x,band:'mid'}))},null,1));
let seed=20261023; const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff}; const sh=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const mk=(a,n,e)=>({id:n,answer:a[0],topicKo:a[1],mid:a[2],first:a[3],expected:e,cal:true});
// 1차 보정 예 10 (V022 와 같음)
const cal1=JSON.parse(fs.readFileSync('../../v022-raw/_work/cal.json','utf8')); fs.writeFileSync('cal.json',JSON.stringify(cal1,null,1));
// 교차 보정 예 10 (다른 것: 1 다섯 · 2 셋 · 3 둘)
const cal2=[['칸나이 전투','역사·사회','고대 로마','기원전 216년 한니발이 로마군을 포위해 섬멸한 전투.',1],['라파엘전파','문화·예술','미술 사조','19세기 영국에서 라파엘로 이전 양식으로 돌아가자던 화가 모임.',1],['곰비임비','한국','우리말','물건이 거듭 계속해서 쌓이거나 일이 겹치는 모양을 뜻하는 순우리말.',1],['브라에스의 역설','과학·기술','게임 이론','길을 새로 놓았는데 오히려 모두의 통행 시간이 늘어나는 역설.',1],['애로의 불가능성 정리','역사·사회','사회적 선택','어떤 투표 제도도 공정성 조건 몇 개를 동시에 만족할 수 없다는 정리.',1],['헤이안 시대','역사·사회','일본사','794년부터 약 400년간 교토에 수도가 있던 일본의 시대.',2],['마그나 카르타','역사·사회','서양사','1215년 영국 왕 존이 귀족들의 압박으로 서명한 문서.',2],['튤립 버블','역사·사회','경제사','17세기 네덜란드에서 튤립 알뿌리 값이 폭등했다 폭락한 사건.',2],['산업혁명','역사·사회','서양사','18세기 영국에서 시작된 기계화와 공장제 생산으로의 변화.',3],['타이타닉호','역사·사회','근대사','1912년 첫 항해에서 빙산에 부딪혀 침몰한 영국 여객선.',3]].map((x,i)=>mk(x,-(i+1),x[4])); fs.writeFileSync('cal2.json',JSON.stringify(cal2,null,1));
const NP=40; const per=Math.ceil(rest.length/NP); const shuf=sh(rest); const pieces=[];
const fmt=(mix,name,title)=>fs.writeFileSync(`${name}.txt`,`## ${title} ${name} (${mix.length}건)\n\n`+mix.map(x=>`### ${x.id}\n정답: ${x.answer}\n묶음: ${x.topicKo}\n중분류: ${x.mid}\n해설 첫 문장(정체 구별용): ${x.first}\n`).join('\n'));
for(let i=0;i<NP;i++){const a=shuf.slice(i*per,(i+1)*per);const mix=sh([...a,...cal1]);const name='m'+String(i+1).padStart(2,'0');fmt(mix,name,'정답 친숙도 조각');fs.writeFileSync(`${name}.keys.json`,JSON.stringify(mix.map(x=>x.id)));pieces.push([name,mix.length]);}
fs.writeFileSync('pieces.json',JSON.stringify(pieces));
fs.writeFileSync('lib.json',JSON.stringify({fmtNote:'cross pieces use cal2'}));
console.log(JSON.stringify({active:rows.length,pool:pool.length,v22:used.size,rest:rest.length,per,pieces:pieces.length,first:pieces[0],last:pieces[NP-1],noTopic:rest.filter(x=>!x.topic).length}));
