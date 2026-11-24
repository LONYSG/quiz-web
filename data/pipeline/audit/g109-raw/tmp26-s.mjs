for (const q of process.argv.slice(2)) {
 const r=await fetch('https://ko.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=4&srsearch='+encodeURIComponent(q),{headers:{'User-Agent':'quiz-research/1.0'}});
 try{const j=await r.json(); console.log(q,'=>',j.query.search.map(s=>s.title).join(' | '));}catch{console.log(q,'ERR')}
 await new Promise(s=>setTimeout(s,4000));
}
