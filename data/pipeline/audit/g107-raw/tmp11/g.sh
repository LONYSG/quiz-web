#!/bin/bash
# usage: g.sh Title keyword [lang]
t="$1"; k="$2"; l="${3:-en}"
f="x-$l-$t.txt"
if [ ! -s "$f" ] || [ $(wc -c <"$f") -lt 5 ]; then curl -s -A "quizbot-research/1.0" "https://$l.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=$t" | node ex.mjs > "$f"; sleep 3; if [ $(wc -c <"$f") -lt 5 ]; then sleep 10; curl -s -A "quizbot-research/1.0" "https://$l.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=$t" | node ex.mjs > "$f"; fi; fi
echo "=== $t ($(wc -c <$f) chars)"
grep -i -E "$k" "$f" | head -${4:-4} | cut -c1-600
