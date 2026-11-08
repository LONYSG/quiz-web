const UA={'User-Agent':'quiz-web-v040/1.0'};
for(const n of ['학의천','신갈천','화포천','무심천','광주천 (광주광역시)','광주천','아라천','가화천']){
 const u='https://ko.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles='+encodeURIComponent(n)+'&redirects=1&format=json&formatversion=2';
 for(let i=0;i<4;i++){const r=await fetch(u,{headers:UA});if(r.ok){const j=await r.json();const p=j.query.pages[0];const t=(p.extract||'MISSING').replace(/\n/g,' ');const m=t.match(/.{0,60}(국가하천|지방하천|지방 1급|준용하천).{0,60}/g);console.log(n,'|',(m||[t.slice(0,160)]).join(' // '));break}await new Promise(s=>setTimeout(s,3000))}
 await new Promise(s=>setTimeout(s,500));}
