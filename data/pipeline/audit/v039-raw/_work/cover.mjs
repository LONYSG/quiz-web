import {topic,canon} from './lib.mjs';
// usage: import cover(slug, text) -> {extra:[ids not found], leftover:string}
export function cover(slug,text,{useVariants=true}={}){
  const t=topic(slug);let T=canon(text);const extra=[];
  const items=[...t.items].sort((a,b)=>canon(b.name).length-canon(a.name).length);
  for(const it of items){const cands=[it.name,...(useVariants?it.variants||[]:[])].map(canon).filter(Boolean).sort((a,b)=>b.length-a.length);
    let hit=false;for(const c of cands){const i=T.indexOf(c);if(i>=0){T=T.slice(0,i)+'\u0000'.repeat(1)+T.slice(i+c.length);hit=true;break;}}
    if(!hit)extra.push({id:it.id,name:it.name});}
  return {extra,leftover:T.split('\u0000').filter(Boolean)};
}
