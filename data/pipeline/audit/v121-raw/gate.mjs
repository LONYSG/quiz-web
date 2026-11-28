import fs from 'node:fs';import { checkHint } from '../../../../scripts/hint-check.mjs';
const R='C:/work/quiz-web/web-desk/tone/';const J=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));
const b=J(R+'보낼것/기존-고침-02-p01.json'),g=J(R+'받은것/기존-고침-02-p01.json');const gm=new Map(g.cards.map(c=>[c.key,c]));
for(const it of b.items){const c=gm.get(it.key);if(c.status!=='ready')continue;const a=it.card.answer;const v=it.card.also??[];
 const r=checkHint({hint:c.hint,answer:a,variants:v,question:c.question,explanation:c.explanation});console.log(it.key,JSON.stringify(r).slice(0,200));}
