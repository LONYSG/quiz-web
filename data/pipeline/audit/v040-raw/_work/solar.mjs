import fs from 'node:fs';
const UA={'User-Agent':'quiz-web-v040/1.0'};
const u='https://en.wikipedia.org/w/api.php?action=parse&page='+encodeURIComponent('List of gravitationally rounded objects of the Solar System')+'&prop=text&format=json&formatversion=2&redirects=1';
let html;for(let i=0;i<5;i++){const r=await fetch(u,{headers:UA});if(r.ok){html=(await r.json()).parse.text;break}await new Promise(s=>setTimeout(s,4000))}
fs.writeFileSync('C:/work/quiz-web/data/pipeline/audit/v040-raw/solar.html',html);
const tabs=[...html.matchAll(/<table[\s\S]*?<\/table>/g)].map(m=>m[0]);
console.log('tables',tabs.length);
tabs.forEach((t,i)=>{const rs=[...t.matchAll(/<tr[\s\S]*?<\/tr>/g)].map(r=>[...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(c=>c[1].replace(/<sup[\s\S]*?<\/sup>/g,'').replace(/<[^>]+>/g,'').replace(/&#\d+;|&nbsp;/g,' ').trim().slice(0,30)));console.log('--T',i,rs.length);rs.slice(0,50).forEach(r=>console.log(r.slice(0,3).join(' | ')))});
