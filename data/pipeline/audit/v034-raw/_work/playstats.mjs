import fs from 'node:fs';
import pg from 'pg';
const SKIP='^(bot|uic|r10_|test$|test2$|timer136$|timer1346$)';
const db=new pg.Client({connectionString:'postgresql://quiz:quizlocal@localhost:5434/quizweb'});await db.connect();
const SINCE=process.argv[2]??null; // 전체 or --since
const where=SINCE?`AND gq.started_at >= '${SINCE}'::timestamptz`:'';
const rows=(await db.query(`
SELECT gq.game_id::text gid, gq.question_index qi, gq.question_id::text qid, gq.started_at, gq.resolution,
  coalesce(gq.grade,q.difficulty_score) grade, (gq.grade IS NOT NULL) grade_logged, coalesce(gq.worth,q.worth) worth,
  (SELECT min(e.response_ms) FROM answer_events e JOIN accounts a ON a.id=e.account_id WHERE e.game_id=gq.game_id AND e.question_index=gq.question_index AND e.accepted AND a.login_id !~ $1) human_ms,
  (SELECT count(*) FROM answer_events e WHERE e.game_id=gq.game_id AND e.question_index=gq.question_index AND e.accepted)::int any_ok,
  (SELECT count(*) FROM game_players p JOIN accounts a ON a.id=p.account_id WHERE p.game_id=gq.game_id AND a.login_id !~ $1)::int humans
FROM game_questions gq JOIN questions q ON q.id=gq.question_id
WHERE gq.resolved_at IS NOT NULL AND gq.resolution IS DISTINCT FROM 'aborted' ${where}
 AND EXISTS (SELECT 1 FROM game_players p JOIN accounts a ON a.id=p.account_id WHERE p.game_id=gq.game_id AND a.login_id !~ $1)
ORDER BY gq.game_id, gq.question_index`,[SKIP])).rows;
const bucket=r=>{if(r.human_ms!==null){const m=+r.human_ms;return m<10000?'pre':m<25000?'hint':'initial'}return r.any_ok>0?'bot':'miss'};
const per=new Map();
for(const r of rows){const k=r.qid;const o=per.get(k)??{qid:k,grade:r.grade,worth:r.worth,n:0,pre:0,hint:0,initial:0,miss:0,bot:0,ms:[],games:new Set(),loggedGrade:r.grade_logged};
o.n++;o[bucket(r)]++;if(r.human_ms!==null)o.ms.push(+r.human_ms);o.games.add(r.gid);per.set(k,o)}
const med=a=>{if(!a.length)return null;a=[...a].sort((x,y)=>x-y);const m=a.length>>1;return a.length%2?a[m]:Math.round((a[m-1]+a[m])/2)};
const out=[...per.values()].map(o=>({qid:o.qid,grade:o.grade,worth:o.worth,n:o.n,pre:o.pre,hint:o.hint,initial:o.initial,miss:o.miss,bot:o.bot,medianMs:med(o.ms),games:[...o.games]}));
const games=new Set(rows.map(r=>r.gid));
console.log('rows',rows.length,'games',games.size,'questions',out.length,'since',SINCE);
const byG={};
for(const o of out){if(o.n<3)continue;const g=o.grade??'?';const t=byG[g]??={q:0,n:0,pre:0,hint:0,initial:0,miss:0,bot:0};t.q++;t.n+=o.n;for(const b of['pre','hint','initial','miss','bot'])t[b]+=o[b]}
console.log('grade (n>=3 questions): q, plays, pre%, hint%, initial%, miss%, bot%');
for(const g of Object.keys(byG).sort()){const t=byG[g];const p=x=>Math.round(x/t.n*100);console.log(g,t.q,t.n,p(t.pre),p(t.hint),p(t.initial),p(t.miss),p(t.bot))}
const byAll={};for(const o of out){const g=o.grade??'?';const t=byAll[g]??={q:0,n:0,pre:0,hint:0,initial:0,miss:0,bot:0};t.q++;t.n+=o.n;for(const b of['pre','hint','initial','miss','bot'])t[b]+=o[b]}
console.log('ALL questions',JSON.stringify(byAll));
const dist={};out.forEach(o=>dist[o.n]=(dist[o.n]??0)+1);console.log('n dist',JSON.stringify(dist));
fs.writeFileSync('data/pipeline/audit/v034-raw/playstats-raw.json',JSON.stringify({games:[...games].length,items:out},null,0));
await db.end();
