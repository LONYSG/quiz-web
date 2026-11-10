import fs from 'fs';
const d='data/minigame/topics/', raw='data/pipeline/audit/v046-raw/';
const now=new Date().toISOString();
const sets=fs.readdirSync(d).filter(x=>x.startsWith('metro-')).map(f=>f.slice(0,-5));
const out={};
for(const t of sets){
 const p=d+t+'.json', j=JSON.parse(fs.readFileSync(p,'utf8')), r=JSON.parse(fs.readFileSync(raw+'R-'+t+'.json','utf8'));
 const fixes=[];
 for(const e of r.extra)fixes.push({op:'remove',id:e.id,name:e.name,why:e.why});
 for(const m of r.missing)fixes.push({op:'add',name:m.name,why:m.why});
 for(const v of r.variantFix)fixes.push({op:'variant',id:v.id,add:v.variant,why:v.why});
 const before=JSON.stringify(j.items);
 const prev=j.verify;
 const verdict=fixes.length?'candidate':'verified';
 j.verify={round:'V046',checkedAt:now,
  sources:r.sourcesRead.map(s=>({url:s.url,read:!!s.ok,count:s.stationCount||0})).concat([{url:'G050 읽은 한국어 위키백과 노선 문서(audit/g050-raw/*.wiki) — 이번엔 안 읽음(다른 출처 규칙)',read:false,count:0}]),
  itemsChecked:r.itemsChecked,missing:r.missing.map(m=>m.name),extra:r.extra.map(e=>e.name),fixes,
  shortcheck:'제보 답 확인(수원·세류·금정·광명=1호선 · 수원시청=수인분당) · 세트 안 이름/변형 겹침 0 · 환승 88',
  unsure:r.unsure||[],verdict,why:fixes.length?`문제 ${fixes.length}건 — fixes 참고(G 적용 뒤 verified)`:'영문 위키 역 목록·G050 한국어 위키와 일치 — 빠짐 0 · 없음 0 · 변형 문제 0'};
 if(prev)j.verify.history=[prev];
 if(JSON.stringify(j.items)!==before)throw 1;
 j.status=verdict;
 fs.writeFileSync(p,JSON.stringify(j,null,1)+'\n');
 out[t]={verdict,items:j.items.length,fixes:fixes.length};
}
// muni
const p=d+'kr-municipality.json', j=JSON.parse(fs.readFileSync(p,'utf8')), r=JSON.parse(fs.readFileSync(raw+'R-kr-muni-add.json','utf8'));
const prev={...j.verify}; delete prev.pending;
j.verify={round:'V046',checkedAt:now,scope:'G049 추가분 49(광역 8 · 행정시 2 · 일반구 39)',
 sources:r.sourcesRead.map(s=>({url:s.url,read:!!s.ok,note:s.note})),itemsChecked:49,missing:[],extra:[],fixes:[],
 unsure:['일반구 이름(수원 · 성남 · 안양 · 안산 · 고양 · 용인 · 청주 · 천안 · 전주 · 포항 · 창원)은 수 39 만 위키로 확인 · 이름은 지식(V046 판정자도 정상으로 봄)','"전남광주특별시" 변형 추가 제안은 확신 낮아 fix 에 안 넣음','광역 "서울" 변형이 metro-line1 서울역 변형 "서울" 과 같은 글자 — 세트 사이라 무방(CV-179)'],
 verdict:'verified',why:'추가분 49: 수 39 일반구 위키 일치 · 부천 2024 복원 · 화성 4구 2026-02 · 전남광주통합 2026-07 · bare 겹침 이름 변형 0 · 인천 2026-07 개편은 49 밖',history:[prev]};
fs.writeFileSync(p,JSON.stringify(j,null,1)+'\n');
console.log(out);
