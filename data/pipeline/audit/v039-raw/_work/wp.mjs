// usage: node wp.mjs <lang> <title> [html]  -> prints plain text of page (tables flattened)
import https from 'node:https';
const [lang,title,mode]=process.argv.slice(2);
const u=`https://${lang}.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=${mode==='wt'?'wikitext':'text'}&format=json&formatversion=2&redirects=1`;
const r=await fetch(u,{headers:{'User-Agent':'quiz-web-v039/1.0'}});
const j=await r.json();
let t=mode==='wt'?j.parse.wikitext:j.parse.text;
if(mode!=='wt'){t=t.replace(/<style[\s\S]*?<\/style>/g,'').replace(/<\/(tr|p|li|h\d|div)>/g,'\n').replace(/<\/t[dh]>/g,' | ').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&#160;/g,' ').replace(/&amp;/g,'&').replace(/\n\s*\n+/g,'\n');}
console.log(t);
