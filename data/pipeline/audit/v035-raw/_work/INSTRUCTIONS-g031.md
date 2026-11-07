# V035 조각 판정자 지침 — G031 힌트 (등급 1·2 새 힌트) (판정만 · DB·코드·문서 쓰기 금지)

작업 폴더 C:\work\quiz-web . 입력 `data/pipeline/audit/v035-raw/in/g031-pN.json`(약 50개: id · group · grade · worth · q · answer · variants · explanation · hint(지금 DB 글) · basis(web/knowledge) · hintNote). 출력 `data/pipeline/audit/v035-raw/out/g031-pN.json` (입력 순서 JSON 배열).

## 먼저 읽을 것
- docs/15-QUALITY-STANDARD.md §4-1 H0~H13 전체 (예시 포함)
- ai-out/V033.txt (판정 꼴: ok/fix/unsure · h2·h3·h5·h7·h12·too-weak·length)
- `scripts/hint-check.mjs` 파일 머리(사용법). 제안 힌트는 이 규칙에 걸리지 않아야 한다.

## 문항마다 판정
- `hint`: ok / fix / unsure. 길이 40~80자(알가치 1 이면 120자까지). 질문을 되풀이하지 않기(H4), 정답 글자·초성 금지, 사전 뜻풀이·이름 풀이 금지(H2: 쉬운 일반명사·음식은 뜻풀이 대신 쓰임·대표 장면·곁들이는 것), 핵심 한 줄로 정답을 떠올리게 하되 떠먹여 주지 않기(H9), 고유 사실(연도·금액·대사·이름)은 맞아야 한다(H5/H7).
- `form`: fix/unsure 일 때 h2/h3/h5/h7/h12/too-weak/length/fact 중.
- `fix_text`: fix 일 때 제안 힌트(hint-check 통과).
- `fact`: 힌트 안의 고유 사실(연도·금액·대사·이름·장소)을 **직접 웹으로**(WebFetch 위키 ko/en, WebSearch; User-Agent `quiz-web-v035/1.0`, 개인정보 금지) 닫는다: true / false / unverified. group 에 `K` 가 있는 문항(basis knowledge · 고유 사실 든 힌트)은 반드시 웹으로 닫는다. 나머지는 사실이 들어 있을 때만.
- `expl`: 해설(explanation)이 있으면 ok/fix + 사유(해설에 못 닫은 단정·힌트와 같은 사실 H4).
- `why`: 한 줄 사유.
기준은 느슨하게 하지 마라. 의심스러우면 unsure. 설계가 fix·unsure 를 전부 다시 읽는다.

## 출력 객체 꼴
{"id":"…","hint":"ok|fix|unsure","form":null|"…","fix_text":null|"…","fact":"true|false|unverified|none","fact_notes":"…","expl":"ok|fix|none","expl_why":null|"…","why":"…"}
끝나면 파일을 쓰고 "건수 N · ok a · fix b · unsure c · 사실 틀림 d" 한 줄만 답한다.
