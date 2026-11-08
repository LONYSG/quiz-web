# V037 blind 2 — 고친 질문만 읽고 추측 (판정자: 정답·원문·힌트 모름)
입력 `data/pipeline/audit/v037-raw/blind2/blind2-NN-in.json` (id · question_text). 다른 파일(targets.json · out/ · refurb · DB)은 열지 않는다.
문항마다 `guess2`(정답 추측 하나 — 모르면 "?") 와 `ask2`(무엇을 묻는지 한 줄)를 쓴다. 못 맞히는 것은 흠이 아니다.
출력 `blind2/blind2-NN-out.json` — JSON 배열, 입력 순서, `{"id","ask2","guess2"}`. 마지막 답은 "건수 N" 한 줄.
