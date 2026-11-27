#!/bin/bash
for spec in "$@"; do l=${spec%%:*}; t=${spec#*:}
 for i in 1 2 3 4; do ./f.sh $l "$t" >/dev/null; if ! grep -q '^ERR' "$l-$t.txt"; then break; fi; sleep 15; done
 echo "$l-$t $(wc -c < "$l-$t.txt")"; sleep 4
done
