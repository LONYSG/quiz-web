import fs from 'node:fs';
const J=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const ov={ // VERIFY 재독 보정 (ok → fix)
 2138:{verdict:'fix',category:'누설 남음',proposal:'끝이 뾰족한 둥근 잎 모양 아래에 짧은 꼭지를 단 트럼프 무늬로, 두 가지 검은색 무늬 가운데 하나다.',reason:'VERIFY 재독: after 에 "검은 하트" 가 남아 기계가 #5725(하트 문항 정답)를 센다 — 클로버만 뺐고 하트 글자는 그대로(원 cross 클로버·하트 둘 다). 모양 묘사는 하트 없이 풀어 쓴다'},
 6069:{verdict:'fix',category:'누설 남음',proposal:'남아메리카에서 가장 큰 나라로, 삼바 축제와 아마존 열대우림으로 이름났다.',reason:'VERIFY 재독: "이베리아반도 서쪽 나라의 말" 은 포르투갈어를 돌려 말한 것 — 포르투갈어 문항에는 사실상 같은 누설이고 문장도 어색'},
 6699:{verdict:'fix',category:'사실 아님',proposal:'청취자가 보낸 우스운 사연 편지를 읽어 주며 오래 사랑받은 장수 라디오 프로그램이다.',reason:'VERIFY 재독: "최유라가 첫 방송부터 맡아" 는 새 사실인데 질문(두 진행자)과 어긋날 수 있고 확인 못 함(조각도 UNSURE)'},
};
const rows={};
for(const p of ['p01','p02','p03']){const i=Object.fromEntries(J(`in/${p}.json`).map(x=>[x.id,x]));for(const x of J(`out/${p}.json`)){const s=i[x.id];const o=ov[x.id];rows[x.id]={kind:'changed',grade:s.grade,answer:s.answer,piece:p,g038cls:s.g038cls,trueCls:x.trueCls,verdict:o?.verdict??x.verdict,category:o?.category??x.category,coreChanged:!!x.coreChanged,newName:!!x.newName,newFact:x.newFact,unsure:!!x.unsure,proposal:o?.proposal??x.proposal,reason:o?.reason??x.reason,sources:x.sources||[],after:s.after,before:s.before,verifierOverride:!!o}}}
for(const p of ['p04','p05']){const i=Object.fromEntries(J(`in/${p}.json`).map(x=>[x.id,x]));for(const x of J(`out/${p}.json`)){const s=i[x.id];rows[x.id]={kind:'core',grade:s.grade,answer:s.answer,piece:p,trueCls:x.trueCls,verdict:x.verdict,proposal:x.proposal,reason:x.reason,hint:s.hint,cross:s.crossOriginal.map(z=>z.crossAnswer)}}}
const ch=Object.values(rows).filter(r=>r.kind==='changed'),co=Object.values(rows).filter(r=>r.kind==='core');
const tab={};for(const r of ch){const k=r.grade;tab[k]??={n:0,ok:0,fix:0,drop:0,revert:0,core:0,L:0,A:0};tab[k].n++;tab[k][r.verdict]++;if(r.coreChanged)tab[k].core++;tab[k][r.trueCls]=(tab[k][r.trueCls]||0)+1}
const pop={1:232,2:641,3:816,4:536,5:90};let estFix=0;for(const g in tab){estFix+=pop[g]*tab[g].fix/tab[g].n}
const cc={};co.forEach(r=>cc[r.verdict]=(cc[r.verdict]||0)+1);
const ccg={};co.forEach(r=>{ccg[r.grade]??={n:0,leak:0};ccg[r.grade].n++;if(r.verdict==='leak')ccg[r.grade].leak++});
const sum={round:'V040',sample:{changed:ch.length,core:co.length,seed:40111},byGrade:tab,estimateFixOf2315:Math.round(estFix),core:cc,coreByGrade:ccg,unsureChanged:ch.filter(r=>r.unsure).length,overrides:Object.keys(ov).length};
fs.writeFileSync('../v040-hints.json',JSON.stringify({...sum,items:rows},null,1)+'\n');
console.log(JSON.stringify(sum,null,0));
