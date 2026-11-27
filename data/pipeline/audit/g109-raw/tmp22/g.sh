L=$1; shift
for t in "$@"; do
 f="$L-${t//[\/ ]/_}.txt"; [ -s "$f" ] && continue
 e=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$t")
 for i in 1 2 3; do
  curl -s -m 30 -A "quiz-research/1.0" "https://$L.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=$e" > raw.json
  if node -e "const p=Object.values(JSON.parse(require('fs').readFileSync('raw.json','utf8')).query.pages)[0];require('fs').writeFileSync(process.argv[1],p.extract||'(none)');console.log(process.argv[1],(p.extract||'').length)" "$f" 2>/dev/null; then break; fi
  sleep 20
 done
 sleep 2
done
