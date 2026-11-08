import fs from 'node:fs';
const P=s=>`data/minigame/topics/${s}.json`;
const now=new Date().toISOString();
const spec={
 'solar-system':{status:'verified',sources:[{url:'https://en.wikipedia.org/wiki/List_of_gravitationally_rounded_objects_of_the_Solar_System',read:true,count:32}],missing:[],extra:[],rename:[],
  variantNotes:['페이지: 행성 8(표) + IAU 왜행성 5(Ceres·Pluto·Haumea·Makemake·Eris) + 둥근 위성 19(Moon~Charon) = 32 = 파일 32, 1:1(빠짐 0 더함 0)','같은 페이지의 "가능한 왜행성" 표(Orcus·Quaoar·Gonggong·Sedna)는 IAU 비공인이라 범위 밖(5 만 — nameKo 의 "왜행성" 은 IAU 공인 5 로 읽음)','포보스·데이모스(비구형)는 없음 — 맞음','한국 표기: ko.wikipedia 항목 이름 = 유로파(위성) · 가니메데 · 티탄/타이탄(위성) · 이아페투스 · 카론 · 세레스 · 명왕성. 파일 에우로페[유로파] · 타이탄[티탄] · 카론[샤론] · 세레스[케레스] · 명왕성[플루토] 모두 양쪽 표기가 변형으로 받아져 오답 위험 없음(정본 선택은 표기 문제일 뿐)','변형 전수 확인: 가니메드·엔셀라더스·이아페토스·플루토·케레스 모두 통용 표기'],
  tagNotes:['draw 10·liar 9 그대로'],fixes:[],verdict:'verified',why:'태양계 새 범위 32 전수 1:1 · fixes 0'},
 'river-national':{status:'verified',sources:[{url:'https://ko.wikipedia.org/wiki/대한민국의_국가하천_목록',read:true,count:89},{url:'https://www.nepla.ai/law/하천법시행령',read:true,count:null},{url:'https://ko.wikipedia.org/wiki/무심천 · 광주천 · 학의천 (ko.wikipedia 하천 항목 머리말)',read:true,count:null},{url:'https://www.gimhae.go.kr/06161/09407/06203.web',read:false,count:null},{url:'https://www.segye.com/newsView/20240207507288 (2024-02 환경부 보도: 73→89, 신규 16 · 구간 연장 4)',read:true,count:89}],
  missing:['무심천','광주천','화포천'],extra:[],rename:[],
  variantNotes:['하천법 시행령 별표 1 은 2017-07-17 삭제됨(nepla.ai 현행 본문) — 국가하천 목록은 기후에너지환경부 고시로 이관돼 고시 원문은 못 열음. 그래서 고시 원문 대조는 못 한 채 아래 간접 근거로 판정','파일 86 + 3 = 공식 89(2024-02 보도 73 → 89). 공식 수와 맞는 빠짐 3 = 2020-01 승격분 무심천 · 광주천(ko.wikipedia 항목: "2020년 1월 1일부터 국가하천으로 승격") · 화포천(김해시 안내: 하천등급 국가하천 · 2020년 중하류 13.84km 승격 보도)','학의천은 지방하천 확인(ko.wikipedia · 안양시 법정하천 현황표) → 추가 안 함. 신갈천은 국가하천 근거를 못 찾음 → 추가 안 함(G039 의 건너뜀이 맞음). 위키 상자 89 에는 이 둘이 끼어 있고 전주천 · 천미천이 빠져 있어 상자는 부정확','천미천은 하류 11.33km 만 2025 지정(구간) — 이름 단위로는 포함','근거가 위키 항목 머리말 · 지자체 안내 · 언론이고 고시 원문이 아니다 — 약한 근거(V040 7절)'],
  tagNotes:[],fixes:[{op:'add',name:'무심천',variants:[],why:'2020-01 국가하천 승격(ko.wikipedia 항목) — 공식 89 와 파일 86 의 차이'},{op:'add',name:'광주천',variants:[],why:'2020-01 국가하천 승격(ko.wikipedia 항목)'},{op:'add',name:'화포천',variants:[],why:'2020 중하류 승격 · 김해시 국가하천 표기'}],verdict:'verified',why:'86 + 빠짐 3 = 공식 89 로 맞음 · 빠진 3 은 추가만 하면 되고(≤3) 적재해도 틀린 항목이 없다(빠짐만) → verified + fixes 3. 고시 원문은 못 열어 간접 근거'},
 'element':{sources:[{url:'https://ko.wikipedia.org/wiki/원소_목록',read:true,count:118}],missing:[],extra:[],rename:[],
  variantNotes:['G039 뒤: 118 항목 · 변형 138 · 1글자 기호 0 · 정본 4 rename 확인(나트륨[소듐/Na] · 칼륨[포타슘] · 티타늄[타이타늄/Ti/티타니움] · 게르마늄[저마늄/Ge] — IUPAC 꼴 변형으로 남음)','영어 이름 변형이 1건 남음: 주석 [Sn, Tin]'],tagNotes:[],fixes:[{op:'variant-remove',id:'element-050',variants:['Tin'],why:'영어 이름 변형(G039 기준 영어 이름 0 에 맞춤)'}],verdict:'verified',why:'fixes 1 (≤3) · 정본 4 rename 맞음'},
 'mcu-film':{sources:[{url:'https://ko.wikipedia.org/wiki/마블_시네마틱_유니버스',read:true,count:38}],missing:[],extra:[],rename:[],variantNotes:['label 2 (가디언즈 오브 갤럭시 Volume 2/3 → 2/3) 확인: 짧은 이름이 맞음'],tagNotes:[],fixes:[],verdict:'verified',why:'V040 label 확인 — 문제 없음'},
};
const s7=['kr-municipality','seoul-subway-station','currency','world-capital','constellation','disney-animated-film','sport'];
const out={};
for(const s of s7)spec[s]={sources:null,missing:[],extra:[],rename:[],variantNotes:s==='currency'?['verify.fixes 적용분 9 전부 items 에 반영 확인 · label 17 확인: 모두 대표 단위명(달러 · 페소 …)으로 짧고 맞음(원은 1글자지만 단위 이름 그대로)','변형 표본(로티 · 란드)']:['verify.fixes 적용분 전부 items 에 반영 확인(기계 대조: 어긋남 0)','변형 표본 2건 확인(문제 없음)'],tagNotes:[],fixes:[],verdict:'verified',why:'G039 기계 적용 대조 어긋남 0'};
for(const s of Object.keys(spec)){
 const f=P(s);const raw=fs.readFileSync(f,'utf8');const t=JSON.parse(raw);const before=JSON.stringify({...t,verify:0,status:0});
 const prev=t.verify;const hist=[...(prev?.history||[])];if(prev){const {history,...p}=prev;hist.push(p)}
 const sp=spec[s];const v={round:'V040',checkedAt:now,sources:sp.sources??(prev?.sources||[]),missing:sp.missing,extra:sp.extra,rename:sp.rename,variantNotes:sp.variantNotes,tagNotes:sp.tagNotes,fixes:sp.fixes,verdict:sp.verdict,why:sp.why,history:hist};
 t.verify=v;if(sp.status)t.status=sp.status;
 if(JSON.stringify({...t,verify:0,status:0})!==before)throw new Error('changed other fields '+s);
 fs.writeFileSync(f,JSON.stringify(t,null,1)+'\n');
 out[s]={status:t.status,verdict:v.verdict,fixes:v.fixes.length,why:v.why};
}
fs.writeFileSync('data/pipeline/audit/v040-topics.json',JSON.stringify({round:'V040',at:now,topics:out},null,1)+'\n');
console.log(out);
