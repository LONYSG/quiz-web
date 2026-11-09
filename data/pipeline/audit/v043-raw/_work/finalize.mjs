import fs from 'node:fs';
const R='data/pipeline/audit/v043-raw/'; const m=JSON.parse(fs.readFileSync(R+'_work/merged.json'));
// VERIFY 재독 제외 (id → 제외할 add / remove 이유)
const drop={ 'river-national-025':{add:['아라뱃길'],why:'경인아라뱃길은 아라천을 포함한 수로 전체 — 같은 개체가 아님'},
 'pokemon-gen1-029':{add:['Nidoran♀'],why:'♀ 기호 — topics-check 변형 특수문자 막힘 + 입력 어려움'}, 'pokemon-gen1-032':{add:['Nidoran♂'],why:'위와 같음'},
 'seoul-subway-station-004':{add:['종로삼가'],why:'숫자의 한글 표기(15 §2 B6) — 아무도 안 침'}, 'seoul-subway-station-005':{add:['종로오가'],why:'위와 같음'},
 'seoul-subway-station-038':{add:['을지로삼가'],why:'위와 같음'}, 'seoul-subway-station-039':{add:['을지로사가'],why:'위와 같음'},
 'seoul-subway-station-115':{remove:['당고개'],why:'세트 note: 4호선 당고개는 불암산으로 개명 — 변형이 옳음(조각 오판)'},
 'food-054':{add:['핫케이크'],why:'핫케이크는 팬케이크와 완전히 같은 말은 아님(mid)'} };
const log=[]; let add=0, rem=0; const per={};
for (const [s,v] of Object.entries(m)) { const keep=[];
  for (const p of v.proposals) { const d=drop[p.id]; if(d){ if(d.add) p.add=p.add.filter(a=>!d.add.includes(a)); if(d.remove) p.remove=p.remove.filter(r=>!d.remove.includes(r.v)); log.push({id:p.id,why:d.why}); }
    if(p.add.length||p.remove.length){keep.push(p);} }
  v.proposals=keep; const a=keep.reduce((n,p)=>n+p.add.length,0), r=keep.reduce((n,p)=>n+p.remove.length,0);
  v.proposedAdd=a; v.proposedRemove=r; add+=a; rem+=r; per[s]=[a,r]; }
fs.writeFileSync(R+'v043-proposals.json',JSON.stringify({round:'V043',dropped:log,sets:m},null,1));
console.log('add',add,'remove',rem,'dropped',log.length); console.log(JSON.stringify(per));
