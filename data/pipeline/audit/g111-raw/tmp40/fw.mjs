import fs from 'fs';
const list = [
 ['ko','바니타스'],['en','Vanitas'],['ko','프루스트 현상'],['en','Involuntary memory'],
 ['ko','교향곡 제94번 (하이든)'],['en','Symphony No. 94 (Haydn)'],['ko','미제레레 (알레그리)'],
 ['ko','팔림프세스트'],['en','Palimpsest'],['ko','솔라리제이션'],['en','Solarization (photography)'],
 ['ko','프로타주'],['en','Frottage'],['ko','아상블라주'],['en','Assemblage (art)'],
 ['ko','에피파니'],['en','Epiphany (literature)'],['ko','박수부대'],['ko','마술적 사실주의'],['en','Magic realism'],
 ['ko','블루 아워'],['en','Blue hour'],['ko','울리포'],['ko','누보로망'],['ko','스프레차투라'],['ko','파라고네'],
 ['ko','고스트 라이트'],['ko','클라크'],
];
for (const [l,t] of list) {
  const u=`https://${l}.wikipedia.org/w/index.php?title=${encodeURIComponent(t)}&action=raw`;
  let txt='',st=0;
  for (let i=0;i<3;i++){ const r=await fetch(u,{headers:{'User-Agent':'quiz-research/1.0'}}); st=r.status; txt=await r.text(); if(st!==429)break; await new Promise(r=>setTimeout(r,20000)); }
  fs.writeFileSync(`${l}-${t.replace(/[ ()\/]/g,'_')}.txt`,txt);
  console.log(l,t,st,txt.length,txt.slice(0,50).replace(/\n/g,' '));
  await new Promise(r=>setTimeout(r,800));
}
