import fs from 'node:fs';
const f='data/pipeline/audit/v038-refurb.json';const J=JSON.parse(fs.readFileSync(f,'utf8'));const R=J.items;
const demote={'6976':'끝말만 바뀜(방송 → 방송 갈래) — 사실상 변화 없음','6894':'끝말만 바뀜(서체는? → 서체 이름은 무엇일까요?) — 사실상 변화 없음','7087':'"이 말은?" → "말은?" 한 글자 — 사실상 변화 없음'};
const note={'3205':'목어와 겹침(not_unique) — 고친 질문이 한정어를 보강하지 못함 · blind 전후 둘 다 miss → G037 이 한정어 보강','7236':'분야가 사진가·유명 사진으로 어긋남(데이터 flag)','7450':'분야 중국 왕조 → 음식 쪽이 맞음(데이터 flag)','7232':'정답 표시가 셀카(한국식)인데 질문은 영어 낱말을 묻는다 — 변형 selfie 필요/질문 정리','7374':'blind 전 hit → 후 miss(어려운 답 · 변동 가능)','7418':'blind 전 hit → 후 miss(문장 재배열로 단서 약해짐 가능) — G037 이 확인'};
const keepMach=R.filter(x=>x.verdict==='keep'&&x.mach.some(m=>m==='one90'||m==='sent70'));
for(const x of R){x.reread=false;x.rr_verdict=x.verdict;x.rr_note=null;
 if(x.fix_text||keepMach.includes(x)||x.group==='a3')x.reread=true;
 if(demote[x.id]){x.rr_verdict='keep';x.rr_note='재독: '+demote[x.id]}
 if(note[x.id])x.rr_note=(x.rr_note?x.rr_note+' / ':'')+note[x.id]}
J.rereadAt=new Date().toISOString();J.rereadSummary={fixAll:R.filter(x=>x.fix_text).length,keepMach:keepMach.length,control:60,keepSample14:true,demoted:Object.keys(demote)};
fs.writeFileSync(f,JSON.stringify(J,null,1));
const pc=(a,b)=>b?(100*a/b).toFixed(0)+'%':'-';
const F=R.filter(x=>x.rr_verdict==='fix');
console.log('final fix',F.length,pc(F.length,R.length));
for(const g of ['a1','a2','a3'])for(const gr of [1,2]){const L=R.filter(x=>x.group===g&&x.grade===gr);const f=L.filter(x=>x.rr_verdict==='fix').length;console.log(g,'g'+gr,L.length,'fix',f,pc(f,L.length))}
for(const gr of [1,2]){const L=R.filter(x=>x.grade===gr);console.log('grade',gr,L.length,'fix',L.filter(x=>x.rr_verdict==='fix').length,pc(L.filter(x=>x.rr_verdict==='fix').length,L.length),'b',pc(L.filter(x=>x.read_final==='b').length,L.length),'dup',pc(L.filter(x=>x.subj==='dup').length,L.length),'cramp',pc(L.filter(x=>x.comp==='cramped').length,L.length))}
const c=(k)=>R.filter(k).length;console.log('worth_v dist',[1,2,3].map(w=>c(x=>x.worth_v===w)).join('/'),'w3 kept',pc(c(x=>x.worth_v===3),R.length));
console.log('a1 by cause: cramped',c(x=>x.group==='a1'&&x.comp==='cramped'),'dup',c(x=>x.group==='a1'&&x.subj==='dup'),'b',c(x=>x.group==='a1'&&x.read_final==='b'));
console.log('a2: cramped',c(x=>x.group==='a2'&&x.comp==='cramped'),'dup',c(x=>x.group==='a2'&&x.subj==='dup'),'b',c(x=>x.group==='a2'&&x.read_final==='b'));
// sentence-length of fixes
const sl=F.map(x=>x.fix_len);console.log('fix_len avg',(sl.reduce((a,b)=>a+b,0)/sl.length).toFixed(0),'sentences avg',(F.reduce((a,x)=>a+x.fix_sentences,0)/F.length).toFixed(1));
console.log('flags kinds',JSON.stringify(R.flatMap(x=>x.flags||[]).reduce((o,s)=>{const k=s.split(':')[0];o[k]=(o[k]||0)+1;return o},{})));
console.log('hint_refit',c(x=>x.hint_refit==='yes'),'piece fix%',Array.from({length:12},(_,i)=>{const L=R.filter(x=>x.piece===i+1);return pc(L.filter(x=>x.verdict==='fix').length,L.length)}).join(' '));
