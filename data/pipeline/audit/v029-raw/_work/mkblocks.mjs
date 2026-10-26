import fs from 'node:fs';
const R='C:/work/quiz-web/data/pipeline/audit/v029-raw/';
export const T=JSON.parse(fs.readFileSync(R+'targets.json','utf8')).items;
const one=(s)=>String(s??'').replace(/\s+/g,' ').trim();
const sent=(s)=>{const t=one(s);if(!t)return '(없음)';return t.split(/(?<=[.!?])\s+/).slice(0,2).join(' ').slice(0,300);};
export function block(id){const x=T[id];const mid=[x.major,x.mid].filter(Boolean).join(' > ');return `### ${id}\n분야: ${mid}\n질문: ${one(x.question)}\n정답: ${x.answer}${x.variants?.length?'  (변형: '+x.variants.join(' / ')+')':''}\n해설: ${sent(x.explanation)}\n`;}
