#!/bin/bash
# usage: _f.sh lang title outfile
enc=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$2")
curl -s -A "quiz-research/1.0" "https://$1.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&formatversion=2&titles=$enc" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(j.query.pages[0].extract||'')}catch(e){console.log('ERR '+s.slice(0,100))}})" > "/c/work/quiz-web/data/pipeline/audit/g111-raw/tmp58/$3"
echo "$3 $(wc -c < /c/work/quiz-web/data/pipeline/audit/g111-raw/tmp58/$3)"
