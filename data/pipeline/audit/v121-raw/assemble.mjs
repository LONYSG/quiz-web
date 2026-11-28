import fs from 'node:fs';import { normalizeAnswer } from '../../../../shared/dist/index.js';
const R=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));const T='C:/work/quiz-web/web-desk/tone/';
const b=R(T+'보낼것/기존-고침-02-p01.json'),g=R(T+'받은것/기존-고침-02-p01.json'),diff=R('diff.json');
const sent=new Map(b.items.map(x=>[x.key,x])),got=new Map(g.cards.map(c=>[c.key,c]));
const verd=new Map();for(const f of ['j01','j02'])for(const r of R(f+'.out.json'))verd.set(String(r.key),r);
const m=R('g01.meta.json'),o=new Map(R('g01.out.json').map(r=>[r.key,r])),bl=new Map(R('g01.blind.out.json').map(r=>[r.key,r.answer]));
const cards={},need=[],drops=[],blindInfo={};
for(const [k,d] of Object.entries(diff.cards)){
 if(d.status==='need'){need.push({key:k,why:got.get(k).why});continue}if(d.status==='drop'){drops.push(k);continue}
 const v=verd.get(k);const c={verdict:v.verdict,changedReal:d.real,from:sent.get(k).from};
 if(v.fix){c.fix=v.fix;c.unsolved=!!v.unsolved}
 cards[k]=c;}
for(const x of m.cards){const k=x.card,r=o.get(x.key),s=sent.get(k).card;const c=cards[k];
 c.prevGrade=s.grade??null;c.prevWorth=s.worth??null;
 c.grade=r.grade;c.gradeWhy=r.gradeWhy;c.worth=r.worth;c.worthKind=r.kind;c.worthWhy=r.worthWhy;
 const acc=[s.answer??sent.get(k).material?.answer,...(s.also??sent.get(k).material?.also??[])].filter(Boolean).map(normalizeAnswer);
 const given=bl.get(x.key);const same=acc.includes(normalizeAnswer(given));c.blind=same?'same':'?';c.blindAnswer=given;}
const ga=m.anchors.filter(a=>a.kind==='grade'),wa=m.anchors.filter(a=>a.kind==='worth');
const gx=ga.filter(a=>o.get(a.key).grade===a.gold).length,wx=wa.filter(a=>o.get(a.key).worth===a.gold).length;
const gw=ga.filter(a=>Math.abs(o.get(a.key).grade-a.gold)<=1).length;
const anchors={gradeWithin1:`${gw}/5`,gradeSame:`${gx}/5`,worthSame:`${wx}/5`};
fs.writeFileSync('../v121-fix.json',JSON.stringify({done:true,cards,need,drops,anchors}));
const cnt={};Object.values(cards).forEach(x=>cnt[x.verdict]=(cnt[x.verdict]||0)+1);
console.log(cnt,anchors,JSON.stringify(Object.entries(cards).filter(([k,c])=>c.grade).map(([k,c])=>[k,c.prevGrade,c.grade,c.prevWorth,c.worth,c.blind,c.blindAnswer])));
