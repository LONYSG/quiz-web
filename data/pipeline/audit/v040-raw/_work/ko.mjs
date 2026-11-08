const UA={'User-Agent':'quiz-web-v040/1.0'};
const names=process.argv.slice(2);
for(const n of names){
 const u='https://ko.wikipedia.org/w/api.php?action=query&titles='+encodeURIComponent(n)+'&redirects=1&format=json&formatversion=2';
 let out='?';for(let i=0;i<4;i++){const r=await fetch(u,{headers:UA});if(r.ok){const j=await r.json();const q=j.query;out=(q.redirects?.[0]?`→ ${q.redirects[0].to}`:'(직접)')+(q.pages[0].missing?' MISSING':'');break}await new Promise(s=>setTimeout(s,3000))}
 console.log(n,out);await new Promise(s=>setTimeout(s,400));
}
