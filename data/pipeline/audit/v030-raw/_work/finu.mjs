import fs from 'node:fs';
const m=JSON.parse(fs.readFileSync('uniq.merged.json','utf8'));const T=JSON.parse(fs.readFileSync('../targets.json','utf8')).items;
const ov={
303:{verdict:'narrow',fixText:'에스프레소 위에 뜨거운 물을 부어 옅게 마시는 커피 음료는?',confidence:'mid',why:'롱블랙(물 먼저)과 가름 — 물을 붓는 순서'},
1901:{verdict:'unique',why:'부처·붓다는 넓은 말(DG-051) — 변형 안 받음'},
2688:{verdict:'unique',why:'마킹 용례 못 찾음(DG-055) — 변형 안 받음'},
2976:{verdict:'unique',why:'엔터테인먼트·엔터는 넓은 말(DG-055)'},
5843:{verdict:'unique',why:'존슨탕은 질문이 묻는 "어떤 찌개" 의 답이 아님'},
3522:{verdict:'unique',why:'배선도는 다른 도면 종류'},
1905:{verdict:'accept',addVariants:['석탑'],why:'석탑만 좁은 말로 받음(사리탑은 다른 대상)'},
1669:{verdict:'accept',addVariants:['제니 방적기'],why:'조건 채우는 좁은 말 하나만'},
5971:{verdict:'accept',addVariants:['부고장'],why:'부음은 소식 자체라 뺌'},
6381:{verdict:'accept',addVariants:['럭키 뱀부'],needsWeb:true,why:'행운죽은 쓰임 불확실해 뺌'},
1236:{verdict:'unique',why:'중복 상대 문항이 활성에 없음 — 그대로'},
1070:{verdict:'unique',why:'국가적 응원(외환위기 광고)은 상록수 — 아침이슬 아님'},
2744:{verdict:'unique',why:'1991 단일팀에 양영자는 없음 — 현정화만',confidence:'low'},
};
const flags={6616:'fixText 가 정답 풀이에 가까움(§3-2) — CV',1928:'변형 해적기가 질문 낱말과 겹침(B9) — 기존 변형 제거 제안',6801:'1426 하기아 소피아와 같은 건물 정답 중복 — 쌍 후보'};
const out={meta:{builtAt:new Date().toISOString(),pieces:13,note:'judged=판정자 원값 · final=VERIFY 재독 뒤 · 589 전부 재독'},items:{}};const c={};let changed=0;
for(const [id,j] of Object.entries(m)){const judged={verdict:j.verdict,fixText:j.fixText,addVariants:j.addVariants,confidence:j.confidence,why:j.why};
let f={...judged};const o=ov[id];let reread='ok';
if(o){f={...f,...o};if(o.verdict!=='narrow')delete f.fixText;if(o.verdict!=='accept')delete f.addVariants;reread='changed';changed++;}
if(id==='3730')reread='judged-by-verify';
const e={verdict:f.verdict,confidence:f.confidence,why:f.why,judged:id==='3730'?null:judged,final:f,reread,flag:flags[id]};
if(f.verdict==='narrow')e.fixText=f.fixText;if(f.verdict==='accept'){e.addVariants=f.addVariants;if(f.needsWeb)e.needsWeb=true;}
if(f.verdict==='unique'||f.verdict==='drop')e.delete=undefined;
e.v2=undefined;out.items[id]=e;
c[f.verdict]=(c[f.verdict]||0)+1;}
out.meta.counts=c;out.meta.rereadChanges=changed;
fs.writeFileSync('../../v030-unique.json',JSON.stringify(out));console.log(c,changed);
