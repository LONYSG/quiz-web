import fs from 'node:fs';
export const UA={'User-Agent':'quiz-web-v039/1.0'};
export async function page(lang,title,mode='html'){
  const u=`https://${lang}.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=${mode==='wt'?'wikitext':'text'}&format=json&formatversion=2&redirects=1`;
  for(let i=0;i<5;i++){const r=await fetch(u,{headers:UA});if(r.ok){const j=await r.json();if(j.parse)return mode==='wt'?j.parse.wikitext:j.parse.text;}await new Promise(s=>setTimeout(s,4000));}
  throw new Error('fail '+title);
}
export function lines(html){
  return html.replace(/<style[\s\S]*?<\/style>/g,'').replace(/<sup[\s\S]*?<\/sup>/g,'').replace(/<\/(tr|p|li|h\d|div|caption)>/g,'\n').replace(/<\/t[dh]>/g,' | ').replace(/<[^>]+>/g,'').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&#91;.*?&#93;/g,'').split('\n').map(s=>s.trim()).filter(Boolean);
}
// table rows: returns array of arrays of cell texts
export function rows(html){
  const out=[];const re=/<tr[\s\S]*?<\/tr>/g;let m;
  while((m=re.exec(html))){const cells=[...m[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(c=>c[1].replace(/<sup[\s\S]*?<\/sup>/g,'').replace(/<style[\s\S]*?<\/style>/g,'').replace(/<br\s*\/?>/g,' / ').replace(/<[^>]+>/g,'').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&#91;.*?&#93;/g,'').replace(/\s+/g,' ').trim());out.push(cells);}
  return out;
}
export const canon=s=>String(s).normalize('NFKC').toLowerCase().replace(/[\s·・\-_.,'’"()\[\]\/:!?&]/g,'');
export function topic(slug){return JSON.parse(fs.readFileSync(`C:/work/quiz-web/data/minigame/topics/${slug}.json`,'utf8'));}
export function save(slug,names,extra={}){fs.writeFileSync(`C:/work/quiz-web/data/pipeline/audit/v039-raw/${slug}.src.json`,JSON.stringify({slug,fetchedAt:new Date().toISOString(),count:names.length,names,...extra},null,1));}
// compare: file items vs source names. src may contain alt spellings: names = array of string | string[]
export function compare(slug,srcNames){
  const t=topic(slug);const fileMap=new Map();
  for(const it of t.items){fileMap.set(canon(it.name),it);for(const v of it.variants||[])if(!fileMap.has(canon(v)))fileMap.set(canon(v),it);}
  const srcSet=new Set();const missing=[];const matched=new Set();
  for(const n of srcNames){const alts=Array.isArray(n)?n:[n];let hit=null;for(const a of alts){if(fileMap.has(canon(a))){hit=fileMap.get(canon(a));break;}}if(hit)matched.add(hit.id);else missing.push(alts[0]);}
  const extra=t.items.filter(i=>!matched.has(i.id)).map(i=>({id:i.id,name:i.name}));
  const exactRename=[];// matched only via variant
  for(const n of srcNames){const a=Array.isArray(n)?n[0]:n;const it=fileMap.get(canon(a));if(it&&canon(it.name)!==canon(a))exactRename.push({id:it.id,file:it.name,src:a});}
  return {fileCount:t.items.length,srcCount:srcNames.length,missing,extra,viaVariant:exactRename};
}
