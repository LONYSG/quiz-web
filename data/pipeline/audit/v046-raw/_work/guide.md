# V046 대조 지침 (판정만 — items 파일은 절대 수정 금지)
너는 수도권 전철 노선 세트의 역 목록을 **다른 출처**와 대조한다. 입력: `data/pipeline/audit/v046-raw/_work/in-<topic>.txt` (id \t name \t variants). name 은 '역'을 뗀 꼴(서울역만 '서울역'), variants 에 '○○역' 꼴 등.
G050 이 읽은 출처 = 한국어 위키백과 노선 문서(원문 `data/pipeline/audit/g050-raw/*.wiki` — 읽지 마라, 같은 출처 반복이 된다). 너는 **다른 출처를 하나 이상** 열어라: 나무위키(namu.wiki) 노선 문서 · 운영사(서울교통공사·코레일·신분당선 등) 노선도 · 영문 위키백과 · 네이버/다음 지식 — 열리는 것. WebFetch/WebSearch 사용. 못 열면 열린 것만 쓰고 'sourcesRead' 에 실패를 숨기지 말고 적어라(지식만으로 판정했으면 confidence 'low').
기준: 2026-11 현재 **영업 중** 역(미개통·폐역 제외). 지선·직결 구간은 scope 문장과 맞는지.
각 세트마다 확인:
1. missing: 출처에 있는데 items 에 없는 역 (name 꼴로)
2. extra: items 에 있는데 출처에 없거나 미개통/폐역/다른 노선인 것(id 포함)
3. variantFix: 흔한 표기 빠짐(예 '○○역' 말고 흔한 줄임/옛 이름) 또는 잘못 받는 변형. 같은 세트 다른 역 name/variants 와 겹치면 안 됨(겹침 제안 금지).
4. scopeNote: scope 문장이 구간과 어긋나면 새 문장 제안(플레이어 말투 한 줄)
5. 환승역: 환승역이 해당 노선 세트에 있는지(출처의 환승 표기로) — 빠진 건 missing 에.
confidence: high(출처 2개 이상 일치) / mid / low. 애매하면 제안하지 말고 unsure 에 넣어라.
출력: `data/pipeline/audit/v046-raw/R-<topic>.json` 에 Write 도구로 **직접 손으로** 작성(스크립트로 판정 생성 금지):
{"topic":..., "sourcesRead":[{"url":...,"ok":true/false,"stationCount":n}], "itemsChecked":n, "missing":[{"name":..,"why":..,"confidence":..}], "extra":[{"id":..,"name":..,"why":..,"confidence":..}], "variantFix":[{"id":..,"op":"add"|"remove","variant":..,"why":..}], "scopeNote":null|"...", "unsure":[..], "verdict":"verified"|"candidate"}
verdict: 문제(missing+extra+variantFix+scope) 0 이면 verified.
끝에 한 줄 요약(세트별 missing/extra/variantFix 수)만 답하라.
