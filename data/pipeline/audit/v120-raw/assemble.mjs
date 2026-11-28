import fs from 'node:fs';
const R=(f)=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^﻿/,''));
const diff=R('diff.json'), rt=R('regrade-targets.json'), braw=R('blind-raw.json');
const verd=new Map();for(const f of fs.readdirSync('.').filter(n=>/^j\d\d\.out\.json$/.test(n)))for(const r of R(f))verd.set(String(r.key),r);
// 수동 보정: 판정자가 놓친 5540
verd.set('5540',{key:'5540',verdict:'fix',unsolved:false,manual:true,fix:[{field:'q',span:'규칙적으로 수축하며 피를 온몸으로 내보내는 기관은 무엇일까요?',why:'질문이 심장의 일반 정의가 되어 카드의 대표 사실(쿠베르탱의 심장이 올림피아 기념비에 있다)이 힌트로 밀려났고, 해설의 "이 기관을 안치한 기념비"는 힌트 없이는 앞뒤가 안 맞는다 — 질문과 힌트의 자리만 바뀐 꼴이라 읽는 순서가 뒤집혔다',material:'f2: 그의 뜻에 따라 심장은 올림피아로 옮겨져 기념비 안에 놓임(질문 칸 사실) · f3: 심장은 혈액을 펌프질함(힌트 칸 사실)',kind:'new'}]});
const grade=new Map();for(const g of ['g01','g02']){const m=R(g+'.meta.json');const o=new Map(R(g+'.out.json').map(r=>[r.key,r]));for(const c of m.cards)grade.set(c.card,o.get(c.key));}
const bmap={'363':['miss'],'1272':['same',true,'다이너모 작전'],'5048':['miss'],'n7505':['same',true,'태양 복사 관리'],'5498':['miss'],'6623':['near'],'2189':['near'],'n6850':['miss'],'n6863':['same',true,'외국인 억양 증후군']};
const blind=new Map();for(const b of braw){let r;if(b.exact)r=['same',false];else r=bmap[b.key];if(!r)throw new Error('blind '+b.key);blind.set(b.key,{blind:r[0],blindAnswer:b.given,add:!!r[1],addText:r[2]})}
const cards={};const need=[],drops=[];
for(const [k,d] of Object.entries(diff.cards)){
 if(d.status==='need'){need.push(k);continue} if(d.status==='drop'){drops.push(k);continue}
 const v=verd.get(k);const o={verdict:v.verdict,changedReal:d.real};
 if(v.fix){o.fix=v.fix.map(x=>({field:x.field,span:x.span,why:x.why,material:x.material,kind:x.kind}));o.unsolved=!!v.unsolved||v.fix.some(x=>x.kind==='unsolved');}
 if(v.manual)o.manual=true;
 // 블라인드 wide=fix 규칙: wide 없음
 const g=grade.get(k);
 if(g&&(v.verdict==='ok'||/^n/.test(k))){const sent=null;o.grade=g.grade;o.gradeWhy=g.gradeWhy;o.worth=g.worth;o.worthKind=g.kind;o.worthWhy=g.worthWhy;const b=blind.get(k);if(b){o.blind=b.blind;o.blindAnswer=b.blindAnswer;if(b.add){o.add=true;if(b.addText)o.addText=b.addText}}}
 cards[k]=o;}
const spelling={'5024':{answer:'우르크',also:['우루크'],url:'https://ko.wikipedia.org/wiki/태양의_후예',quote:'유럽의 발칸 반도에 위치한 가상 국가 우르크를 배경으로 하는',note:'표준국어대사전(kdict.korean.go.kr/standard, searchKeyword=우루크 · HTTP 200)의 표제어 "우루크(Uruk)"는 「이라크 남부에 있는 수메르의 도시 유적」이라 드라마의 가상 국가와 다른 말이다 — 사전에는 드라마 속 나라 이름이 없어 사전 표기가 정할 수 없고, 재료(위키 f2 · f4)의 "우르크"가 작품 표기다. 정답 우르크 · 인정 답 우루크 권장. 사전에서 "우르크"는 따로 검색하지 않음'}};
const anchors={gradeWithin1:'10/10',gradeSame:'10/10',worthSame:'9/10',detail:'g01 · g02 각 묶음에 금 표본 10(등급 5 + 알가치 5)을 섞음 — g01-a2(금 3→2) 하나만 어긋남'};
const out={done:true,cards,need,spelling,anchors,drops,regradeSkippedFixDrop:rt.skipped};
fs.writeFileSync('../v120-fix.json',JSON.stringify(out));
const c={};Object.values(cards).forEach(x=>c[x.verdict]=(c[x.verdict]||0)+1);
const graded=Object.values(cards).filter(x=>x.grade);console.log(c,'graded',graded.length,'need',need.length,'drops',drops);
