// 설계 도구 — 카드 통째 작업의 입력 묶음을 우선순위 순으로 만든다 (지금 DB 값 기준 · 읽기만)
//   node web-desk/tone/_mk_cards.mjs      → 보낼것/카드-001.txt … + _카드-순서.json
import pg from 'pg';import fs from 'node:fs';
const c=new pg.Client({connectionString:'postgresql://quiz:quizlocal@localhost:5434/quizweb'});await c.connect();
const q=async s=>(await c.query(s)).rows;
const rows=await q(`select q.id,q.question_text qt,q.display_answer a,q.general_hint h,q.explanation e,q.difficulty_score d,
  coalesce(p.plays,0) plays, coalesce(p.miss,0) miss, coalesce(f.down,0) down, f.memo
  from questions q
  left join (select question_id, count(*) plays, count(*) filter (where resolution in ('timeout','skip_vote')) miss from game_questions group by 1) p on p.question_id=q.id
  left join (select question_id, count(*) filter (where vote=-1) down,
       string_agg(nullif(trim(coalesce(array_to_string(reasons,'·'),'')||' '||coalesce(comment,'')),''),' / ') filter (where vote=-1) memo from question_feedback group by 1) f on f.question_id=q.id
  where q.is_active and q.question_text not like '%이모지가 나타내는%' order by q.id`);
await c.end();
const dir='web-desk/tone/';
const done=new Set(JSON.parse(fs.readFileSync(dir+'받은것/카드-18.json','utf8')).results.map(x=>x.id));
const notes={};
for(const f of fs.readdirSync(dir+'받은것')){if(!/^결과-\d\d\.json$/.test(f))continue;const n=+f.slice(3,5);if(n<6||n>17)continue;
  try{for(const r of JSON.parse(fs.readFileSync(dir+'받은것/'+f,'utf8')).results){const t=[];if(r.verdict==='rebuild')t.push(`앞선 검토(${r.reason}): ${r.note||''}`);if(r.flag)t.push(`힌트·해설 표시: ${r.flag}`);if(t.length)notes[r.id]=t.join(' / ')}}catch(e){}}
Object.assign(notes,{7256:'검수 확인(원문 틀림): 존스가 만든 것은 수익의 20% 성과 보수. "2% 운용 보수 = 2와 20"은 뒤에 굳은 관행',1924:'검수 확인(원문 부분 틀림): 한국 규정은 깃봉까지 올렸다가 깃면 너비만큼 내려 단다("절반 높이" 아님)',1904:'검수 확인(원문 틀림): 보신각 제야의 종은 33번. 108번은 절에서 치는 종',2420:'검수 확인(원문 부분 틀림): 절대영도에서 "분자 운동이 멈춘다"는 단정은 부정확'});
const sent=s=>(s.match(/[.?!]\s|[.?!]$/g)||[]).length;
const tier=r=>{
  if(r.down>0||r.miss>=2||notes[r.id])return 1;                       // 실전에서 걸린 것 · 앞선 검토가 문제를 짚은 것
  if(r.d>=2&&(sent(r.qt)>=3||r.qt.length>=120))return 2;              // 꼬인 꼴 신호(길고 여러 문장)
  if(r.d===3)return 3;if(r.d===2)return 4;if(r.d>=4)return 5;return 6;
};
const list=rows.filter(r=>!done.has(r.id)).map(r=>({...r,tier:tier(r)})).sort((a,b)=>a.tier-b.tier||b.down-a.down||b.miss-a.miss||b.plays-a.plays||a.id-b.id);
const SIZE=100;const index=[];const names={1:'실전에서 걸린 것 · 앞선 검토가 짚은 것',2:'꼬인 꼴 신호(길고 여러 문장)',3:'등급 3',4:'등급 2',5:'등급 4·5',6:'등급 1'};
for(let i=0,n=1;i<list.length;i+=SIZE,n++){
  const part=list.slice(i,i+SIZE);const nn=String(n).padStart(3,'0');
  let t=`# 카드-${nn} (${part.length}문항) — 지시서-카드.md 대로 카드(질문 · 힌트 · 해설)를 통째로 본다 → 받은것/카드-${nn}.json\n# 한 문항 = [id] 등급 / 질문 / 정답 / 힌트 / 해설 (/ 메모 — 있으면: 실전 평가 · 앞선 검토가 짚은 것)\n# 우선순위 묶음: ${[...new Set(part.map(x=>x.tier))].map(k=>k+' '+names[k]).join(' · ')}\n`;
  for(const r of part){t+=`\n[${r.id}] 등급 ${r.d}\n질문: ${r.qt.replace(/\s+/g,' ')}\n정답: ${r.a}\n힌트: ${(r.h||'').replace(/\s+/g,' ')}\n해설: ${(r.e||'').replace(/\s+/g,' ')}\n`;
    const m=[];if(r.down>0)m.push(`실전 👎 ${r.down}${r.memo?' — '+r.memo.replace(/\s+/g,' '):''}`);if(r.miss>=2)m.push(`출제 ${r.plays}번 중 ${r.miss}번 아무도 못 맞힘`);if(notes[r.id])m.push(notes[r.id]);if(m.length)t+=`메모: ${m.join(' / ')}\n`}
  fs.writeFileSync(`${dir}보낼것/카드-${nn}.txt`,t);const out=`${dir}받은것/카드-${nn}.json`;if(!fs.existsSync(out))fs.writeFileSync(out,'');
  index.push({file:`카드-${nn}`,n:part.length,tiers:part.reduce((o,x)=>(o[x.tier]=(o[x.tier]||0)+1,o),{}),ids:part.map(x=>x.id)});
}
fs.writeFileSync(dir+'_카드-순서.json',JSON.stringify(index));
const tc={};for(const r of list)tc[r.tier]=(tc[r.tier]||0)+1;console.log('전체',list.length,'묶음',index.length,tc);
