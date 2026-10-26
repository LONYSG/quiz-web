import fs from 'node:fs';
export const R='C:/work/quiz-web/data/pipeline/audit/v030-raw/';export const W=R+'_work/';
export const T=JSON.parse(fs.readFileSync(R+'targets.json','utf8')).items;
const one=(s)=>String(s??'').replace(/\s+/g,' ').trim();
export const sent=(s)=>{const t=one(s);if(!t)return '(없음)';return t.split(/(?<=[.!?])\s+/).slice(0,2).join(' ').slice(0,300);};
// group: [{id, cands:[{v,kind}], skipVariants?:[..]}]
export function vblock(g){const x=T[g.id];const mid=[x.major,x.mid].filter(Boolean).join(' > ');
const ex=x.variants.filter(v=>!(g.hide||[]).includes(v));
return `### ${g.id}\n분야: ${mid}\n질문: ${one(x.question)}\n대표 정답: ${x.answer}${ex.length?'  (이미 받는 변형: '+ex.join(' / ')+')':''}\n해설: ${sent(x.explanation)}\n후보:\n${g.cands.map((c,i)=>`  ${i+1}) ${c.v}${c.part?'  [괄호 병기 '+(c.part==='out'?'밖':'안')+' — 원문 '+c.orig+']':''}`).join('\n')}\n`;}
export function groupBy(list){const m=new Map();for(const c of list){if(!m.has(c.id))m.set(c.id,{id:c.id,cands:[]});m.get(c.id).cands.push(c);}return [...m.values()];}
