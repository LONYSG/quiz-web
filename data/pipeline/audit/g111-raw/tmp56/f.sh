for t in "$@"; do
  f="$t.txt"; [ -s "$f" ] && continue
  for i in 1 2 3; do
    enc=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$t")
    code=$(curl -s -A "quiz-research/1.0" -o "$f" -w "%{http_code}" "https://ko.wikipedia.org/w/index.php?title=$enc&action=raw")
    [ "$code" = 200 ] && break
    echo "$t $code"; sleep 20
  done
  echo "$t $(wc -c < "$f")"
  sleep 4
done
