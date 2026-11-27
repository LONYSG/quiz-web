#!/bin/bash
# usage: f.sh lang title
l=$1; t=$2
curl -s -A "quiz-research/1.0" -G "https://$l.wikipedia.org/w/api.php" --data-urlencode "action=query" --data-urlencode "prop=extracts" --data-urlencode "explaintext=1" --data-urlencode "redirects=1" --data-urlencode "titles=$t" --data-urlencode "format=json" --data-urlencode "formatversion=2" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(j.query.pages[0].extract||"NONE")}catch(e){console.log("ERR "+s.slice(0,100))}})' > "$l-$t.txt"
echo "$l-$t $(wc -c < "$l-$t.txt")"
