// V120 3절 — 등급 · 알가치 재판정 묶음 + 블라인드 입력. 대상 = ready 중 (질문 실제로 바뀜 ∪ needsRegrade) 에서 judge fix·drop 뺀 것 + 새 카드(n) 전부
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import pg from 'pg';
const HERE=path.dirname(fileURLToPath(import.meta.url)); const AUD=path.join(HERE,'..'); const R='C:/work/quiz-web/web-desk/tone/';
const diff=JSON.parse(fs.readFileSync(path.join(HERE,'diff.json'),'utf8'));
const sent=new Map(), got=new Map();
for(let i=1;i<=8;i++){const p='p0'+i;
 JSON.parse(fs.readFileSync(`${R}보낼것/기존-고침-01-${p}.json`,'utf8').replace(/^\uFEFF/,'')).items.forEach(x=>sent.set(String(x.key),x));
 JSON.parse(fs.readFileSync(`${R}받은것/기존-고침-01-${p}.json`,'utf8').replace(/^\uFEFF/,'')).cards.forEach(x=>got.set(String(x.key),x));}
// judge 결과
const verd=new Map();
for(const f of fs.readdirSync(HERE).filter(n=>/^j\d\d\.out\.json$/.test(n))) for(const r of JSON.parse(fs.readFileSync(path.join(HERE,f),'utf8').replace(/^\uFEFF/,''))) verd.set(String(r.key),r);
const missingV=[...got.keys()].filter(k=>got.get(k).status==='ready'&&!verd.has(k));
if(missingV.length) throw new Error('판정 없음 '+missingV.length);
const T=[]; const skipped=[];
for(const [k,g] of got){ if(g.status!=='ready') continue; const d=diff.cards[k]; const isNew=/^n/.test(k);
 const need=d.real.includes('q')||d.needsRegrade||isNew; if(!need) continue;
 const v=verd.get(k).verdict;
 if(v!=='ok'&&!isNew){skipped.push([k,v]);continue;} T.push({key:k,isNew,v}); }
// DB 분야
const db=new pg.Client({connectionString:'postgresql://quiz:quizlocal@localhost:5434/quizweb'}); await db.connect();
const cats=new Map((await db.query('select id,name_ko,parent_id from categories')).rows.map(r=>[r.id,r]));
const catPath=(id)=>{const o=[];let c=cats.get(id);while(c){o.unshift(c.name_ko);c=c.parent_id?cats.get(c.parent_id):null}return o.join(' > ')};
async function loadCards(where,params=[]){const qs=(await db.query(`select id,question_text,display_answer,general_hint,explanation,category_id from questions where ${where}`,params)).rows;
 const ids=qs.map(q=>q.id);const an=(await db.query('select question_id,answer_text,is_primary from question_answers where question_id = any($1) order by is_primary desc, id',[ids])).rows;
 const by=new Map();for(const a of an){if(!by.has(a.question_id))by.set(a.question_id,[]);by.get(a.question_id).push(a)}
 return qs.map(q=>{const list=by.get(q.id)??[];const prim=list.find(a=>a.is_primary)?.answer_text??q.display_answer;const variants=[...new Set(list.map(a=>a.answer_text).filter(t=>t!==prim&&t!==q.display_answer))];return{id:q.id,cat:catPath(q.category_id),q:q.question_text,a:q.display_answer,variants,hint:q.general_hint,exp:q.explanation}})}
// 금 표본(v117 build 와 같은 방식)
const ins=fs.readFileSync(path.join(AUD,'v028-raw/INSTRUCTIONS.md'),'utf8');
const gold28=[];for(const l of ins.split('## 금 표본 예 20')[1].split('## 읽기 기준')[0].split('\n').filter(l=>l.startsWith('- v2 **'))){const m=l.match(/^- v2 \*\*(\d)\*\* \(지금 (\d)\) — (.+) → 정답 (.+)$/);if(!m)throw new Error('gold');gold28.push({grade:+m[1],q:m[3],a:m[4]})}
for(const g of gold28){const hit=(await loadCards('question_text = $1 limit 1',[g.q]))[0];g.cat=hit?.cat??'(분야 미상)';g.exp=hit?.exp??null;g.hint=hit?.hint??null;g.variants=hit?.variants??[]}
const an=fs.readFileSync(path.join(AUD,'v029-raw/anchors60.md'),'utf8');const rows=[];
for(const l of an.split('\n')){const c=l.split('|').map(s=>s.trim());if(c.length<11||!/^\d+$/.test(c[1]))continue;rows.push({n:+c[1],id:+c[2],v2:+c[3],ans:c[4],kind:c[7],ex:c[8]==='✓',chan:+c[10]})}
const full=JSON.parse(fs.readFileSync(path.join(AUD,'v029-raw/targets.json'),'utf8')).items;
const pool=[];for(const r of rows){if(r.ex)continue;const hit=(await loadCards('id = $1',[r.id]))[0];const f=full[String(r.id)];pool.push({...r,cat:hit?.cat??'(분야 미상)',q:f.question,a:f.answer,variants:f.variants??[],hint:f.hint,exp:f.explanation})}
await db.end();
const block=(key,c)=>[`### ${key}`,`분야: ${c.cat}`,`질문: ${c.q}`,`정답: ${c.a}${c.variants?.length?'  (변형: '+c.variants.join(' / ')+')':''}`,`해설: ${c.exp??'(없음)'}`,`힌트: ${c.hint??'(없음)'}`,''].join('\n');
const cardOf=(k)=>{const s=sent.get(k),g=got.get(k),c=s.card;
 const cat=/^n/.test(k)?[s.material.major,s.material.mid,s.material.sub].filter(Boolean).join(' > '):c.field;
 return {cat,q:g.question,a:c.answer,variants:c.also??[],hint:g.hint,exp:g.explanation}};
const per=30; const n=Math.ceil(T.length/per); const sz=Math.ceil(T.length/n); const metas=[];
for(let i=0;i<n;i++){const name='g'+String(i+1).padStart(2,'0'); const ks=T.slice(i*sz,(i+1)*sz);
 const items=ks.map(t=>({key:`${name}-${String(ks.indexOf(t)+1).padStart(3,'0')}`,card:t}));
 const g5=[0,1,2,3,4].map(k=>gold28[(i*5+k)%20]); const a5=[0,1,2,3,4].map(k=>pool[(i*5+k)%40]);
 const anchors=[...g5.map((g,k)=>({key:`${name}-g${k+1}`,anchor:'grade',gold:g.grade,card:g})),...a5.map((a,k)=>({key:`${name}-a${k+1}`,anchor:'worth',gold:a.chan,card:a}))];
 const merged=items.map(it=>({key:it.key,c:cardOf(it.card.key)})); anchors.forEach((a,k)=>merged.splice(Math.min(merged.length,(k*7+(i%7)*3+4)%(merged.length+1)),0,{key:a.key,c:a.card}));
 fs.writeFileSync(path.join(HERE,name+'.txt'),`## V120 ${name} (${merged.length}건)\n\n`+merged.map(m=>block(m.key,m.c)).join('\n'));
 fs.writeFileSync(path.join(HERE,name+'.meta.json'),JSON.stringify({chunk:name,order:merged.map(m=>m.key),cards:items.map(it=>({key:it.key,card:it.card.key,isNew:it.card.isNew})),anchors:anchors.map(a=>({key:a.key,kind:a.anchor,gold:a.gold}))}));
 fs.writeFileSync(path.join(HERE,name+'.blind.txt'),items.map(it=>`${it.key}\t${cardOf(it.card.key).q.replace(/\s+/g,' ')}`).join('\n')+'\n'); metas.push([name,merged.length]);}
fs.writeFileSync(path.join(HERE,'regrade-targets.json'),JSON.stringify({targets:T,skipped}));
console.log(JSON.stringify({targets:T.length,new:T.filter(t=>t.isNew).length,skippedFixDrop:skipped.length,chunks:metas}));
