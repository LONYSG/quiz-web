// usage: node wiki.mjs lang title [grep]
const [lang,title,g]=process.argv.slice(2);
const u=`https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=${encodeURIComponent(title)}`;
for(let i=0;i<4;i++){const r=await fetch(u,{headers:{'User-Agent':'quiz-web-v034/1.0'}});if(r.status===429){await new Promise(s=>setTimeout(s,4000));continue}
const j=await r.json();const p=Object.values(j.query.pages)[0];const t=p.extract??'(none)';
if(!g){console.log(t.slice(0,3000));break}
const re=new RegExp(g,'g');const lines=t.split('\n').filter(l=>re.test(l));console.log(p.title,'\n'+lines.map(l=>'- '+l.slice(0,500)).join('\n'));break}
