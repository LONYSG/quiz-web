for t in "$@"; do
 curl -s -A "quiz-research/1.0" "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=$t" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const p=Object.values(JSON.parse(s).query.pages)[0];require('fs').writeFileSync('$t.txt',p.extract||'');console.log('$t',(p.extract||'').length)}catch(e){console.log('$t FAIL')}})"
 sleep 1
done
