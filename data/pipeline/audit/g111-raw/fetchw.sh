#!/bin/bash
# usage: fetchw.sh lang title outfile
curl -s -G -A "quiz-research/1.0" "https://$1.wikipedia.org/w/api.php" --data-urlencode "action=query" --data-urlencode "prop=extracts" --data-urlencode "explaintext=1" --data-urlencode "redirects=1" --data-urlencode "format=json" --data-urlencode "formatversion=2" --data-urlencode "titles=$2" | python -c "import sys,json;d=json.load(sys.stdin);print(d['query']['pages'][0].get('extract',''))" > "$3"
