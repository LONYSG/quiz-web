#!/bin/bash
# 해설 다섯 단계 러너(설계 창) — 사용: haeseol-run.sh <파일이름 앞부분> <번호> <정답> <질문> <힌트> [시작단계]
cd /c/work/quiz-web
K="$1"; NO="$2"; ANS="$3"; Q="$4"; H="$5"; FROM="${6:-1}"; TO="${7:-5}"
D=web-desk/vscript; O=$D/받은것/해설; L=tmp/haeseol; mkdir -p $O $L
head() { cat <<H2
이 실행은 러너(설계 창이 직접)가 부른 것이다 — AGENTS.md 3-3 · 3-4. 지시 파일 하나대로 하고, 적힌 출력 경로 한 파일만 쓴다. 묻지 않는다. ai-talk 글은 쓰지 않는다. 마지막 메시지는 한 줄.
문제: 번호 $NO · 질문: $Q · 힌트: $H · 정답: $ANS
H2
}
run() { # 단계 지시서 입력 출력 옵션...
  local s=$1 brief=$2 inp=$3 out=$4; shift 4
  { head; echo "지시 파일: \`$D/해설-단계/$brief\` 를 읽고 그대로 따른다."; [ -n "$inp" ] && echo "입력: $inp"; echo "출력: \`$out\` (JSON · 한 파일 · 맨 위에 \"no\": \"$NO\", \"answer\": \"$ANS\", \"step\": $s · 그 지시서의 '적을 것'을 담는다)"; } > $L/$K-$s.prompt
  codex "$@" -s workspace-write --skip-git-repo-check -o $L/$K-$s.last - < $L/$K-$s.prompt > $L/$K-$s.log 2>&1
  echo "step $s exit=$? tokens=$(grep -A1 'tokens used' $L/$K-$s.log | tail -1) $(test -f $out && echo ok || echo MISSING)"
}
[ $FROM -le 1 ] && [ $TO -ge 1 ] && run 1 1-이야기모으기.md "" $O/$K-1.json --search exec
[ $FROM -le 2 ] && [ $TO -ge 2 ] && run 2 2-주제고르기.md "\`$O/$K-1.json\`" $O/$K-2.json exec -m gpt-6.2-astra -c model_reasoning_effort=high
[ $FROM -le 3 ] && [ $TO -ge 3 ] && run 3 3-출처.md "\`$O/$K-2.json\`(장면 차례) · 참고 \`$O/$K-1.json\`" $O/$K-3.json --search exec
[ $FROM -le 4 ] && [ $TO -ge 4 ] && run 4 4-쓰기.md "\`$O/$K-2.json\` · \`$O/$K-3.json\`" $O/$K-4.json exec
[ $FROM -le 5 ] && [ $TO -ge 5 ] && run 5 5-연출.md "\`$O/$K-4.json\` (사실 목록은 \`$O/$K-3.json\` — 더하거나 바꾸지 않는다 · 줄기 · 끝장면 · 유명 일화는 \`$O/$K-2.json\` — 연출 중에도 지킨다)" $O/$K-5.json exec -m gpt-6.2-astra -c model_reasoning_effort=high
