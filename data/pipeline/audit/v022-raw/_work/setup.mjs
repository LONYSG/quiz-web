import fs from 'node:fs'; import { createRequire } from 'node:module';
const require = createRequire('C:/work/quiz-web/package.json'); const pg = require('pg'); process.loadEnvFile('C:/work/quiz-web/.env');
const one=s=>(s??'').replace(/\s*\n\s*/g,' ').trim();
const c=new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const cats=(await c.query('select id,level,key,name_ko,parent_id,game_topic from categories')).rows; const topics=Object.fromEntries((await c.query('select key,name_ko from game_topics')).rows.map(r=>[r.key,r.name_ko]));
const cat=Object.fromEntries(cats.map(x=>[x.id,x]));
const chain=id=>{const a=[];let x=cat[id];while(x){a.push(x);x=x.parent_id?cat[x.parent_id]:null}return a};
const rows=(await c.query('select id,display_answer,question_text,explanation,difficulty_score d,category_id,accessibility,worth_knowing,is_active from questions where is_active')).rows; await c.end();
const info=r=>{const ch=chain(r.category_id);const topic=(ch.find(x=>x.game_topic)||{}).game_topic||null;const mid=ch.find(x=>x.level===2)||ch.find(x=>x.level===1)||ch[0];const first=one(r.explanation).split(/(?<=[.!?。]|다\.|요\.)\s/)[0];
 return {id:Number(r.id),answer:r.display_answer,topic,topicKo:topic?topics[topic]:'(없음)',mid:mid?.name_ko||'',cats:ch.map(x=>x.name_ko).reverse().join(' > '),first:first.slice(0,160),accessibility:r.accessibility,worth:r.worth_knowing,d:r.d}};
const top=rows.filter(r=>r.d>=4).map(info).sort((a,b)=>a.id-b.id);
let seed=20261021; const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff}; const sh=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const mid3=sh(rows.filter(r=>r.d===3).map(info)).slice(0,300).sort((a,b)=>a.id-b.id);
const targets=[...top.map(x=>({...x,band:'top'})),...mid3.map(x=>({...x,band:'mid'}))];
fs.writeFileSync('../../v022-targets.json',JSON.stringify({round:'V022',date:'2026-10-21',seed:20261021,counts:{active:rows.length,top:top.length,top4:top.filter(x=>x.d===4).length,top5:top.filter(x=>x.d===5).length,mid3Pool:rows.filter(r=>r.d===3).length,mid3Sample:mid3.length},targets},null,1));
// 보정 예 10 (프롬프트 안의 기준 예와 다른 것)
const by=Object.fromEntries(rows.map(r=>[Number(r.id),r]));
const cal=[['르네상스','역사·사회','서양사','14~16세기 유럽에서 일어난 고전 문화 부흥 운동.',3],['라 마르세예즈','역사·사회','프랑스 혁명','프랑스의 국가(國歌)로 프랑스 혁명기에 만들어진 노래.',3],['러다이트 운동','역사·사회','산업혁명','19세기 초 영국 노동자들이 기계를 부순 운동.',2],['스위스 프랑','역사·사회','통화','스위스의 법정 통화.',2],['6단계 분리','역사·사회','사회학','누구나 여섯 다리만 건너면 모두 연결된다는 이론.',2],['미트라교','역사·사회','고대 종교','로마 제국 군인들 사이에 퍼졌던 밀의 종교.',1],['몬테카시노 전투','역사·사회','제2차 세계대전','1944년 이탈리아에서 벌어진 연합군과 독일군의 전투.',1],['요르문간드','역사·사회','북유럽 신화','북유럽 신화에서 세계를 둘러싼 거대한 뱀.',1],['트리무르티','역사·사회','힌두교','힌두교의 세 주신(브라마·비슈누·시바)을 하나로 묶은 개념.',1],['플린 효과','과학·기술','심리학','세대가 지나며 IQ 검사 점수가 올라가는 현상.',1]].map((x,i)=>({id:-(i+1),answer:x[0],topicKo:x[1],mid:x[2],first:x[3],expected:x[4],cal:true}));
fs.writeFileSync('cal.json',JSON.stringify(cal,null,1));
const NP=32; const per=Math.ceil(targets.length/NP); const shuf=sh(targets); const pieces=[];
for(let i=0;i<NP;i++){const a=shuf.slice(i*per,(i+1)*per);const mix=sh([...a,...cal]);const name='f'+String(i+1).padStart(2,'0');
 fs.writeFileSync(`${name}.txt`,`## 정답 친숙도 조각 ${name} (${mix.length}건)\n\n`+mix.map(x=>`### ${x.id}\n정답: ${x.answer}\n묶음: ${x.topicKo}\n중분류: ${x.mid}\n해설 첫 문장(정체 구별용): ${x.first}\n`).join('\n'));
 fs.writeFileSync(`${name}.keys.json`,JSON.stringify(mix.map(x=>x.id)));pieces.push([name,mix.length]);}
fs.writeFileSync('pieces.json',JSON.stringify(pieces));
const eight=[4617,933,4640,4635,6090,627,3190,4630].map(id=>by[id]?[id,by[id].display_answer,by[id].d,by[id].is_active]:[id,'(없음)']);
console.log(JSON.stringify({active:rows.length,top:top.length,top4:top.filter(x=>x.d===4).length,top5:top.filter(x=>x.d===5).length,mid3:rows.filter(r=>r.d===3).length,mid3Sample:mid3.length,pieces:pieces.length,per,first:pieces[0],last:pieces[pieces.length-1],eight,noTopic:targets.filter(x=>!x.topic).length}));
