#!/bin/bash
# usage: f.sh Title  -> plain text en-Title.txt
t="$1"
curl -s -A "quiz-research/1.0" "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&formatversion=2&titles=$t" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.query.pages[0].extract||"")})' > "en-$t.txt"
sleep 2
