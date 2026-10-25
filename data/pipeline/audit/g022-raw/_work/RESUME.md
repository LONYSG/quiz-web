# G022 이어 하기 (일시 중지 2026-10-26 · 찬종 요청 — PC 끔)
끝: A 자가 시험(s1 3회 · 38/42) · B 본 판정 p01~p72 → merged.json(2,853 · 눈금자 720 일치 563 · ±1 718 · maxd 2) · 친숙도 f01~f05(f02 · f03 재실행 · f03 은 2회 모두 caught1 3/5 — 2회째 채택) · 기계 검사 rchk.json(997 · leak 0 · 200자 초과 1 · 끝 문장 1 · 새 숫자 3)
진행 중이던 것: C 둘째 검토자 r01~r04 끝(ok 181 · fix 19 · reject 0) — **r05 부터 다시**(r05.out.json 지움). 프롬프트 = rNN.prompt.txt + "leak 또는 factChange 가 true 이면 verdict 는 fix 또는 reject(ok 금지)" 한 줄(r02 부터 붙임 · r01 은 없이 돌림 — r01 에 leak true 인데 ok/fix 2).
남음: C r05~r20 → D 겹침 200(audit/v028-rerate.json 있으면) → E 직접 재독(5 전부 · R2 올림 30 · R3 내림 전부 · conf low 전부 · ⓒ 전부 + ⓑ 30 · 사실 의심 · 겹침 ±2) → F 집계(agg 꼴 · familiarity.source · half gen · overlap) → audit/g022-rerate.json · ai-out/G022.txt · 07 DG-060~ · 05 · 06 · README G 표 · 커밋.
메모: p48-13 변형 "유ventus" 빼기 · 변형 끝 공백 trim · 친숙도 재실행 프롬프트에 "처음 듣는 이름은 pct 30 미만" 한 줄 더함(f02 재 · f03 재 · f04 · f05) · 6575 예거마이스터는 친숙도 출처 없어 f 에 넣음 · 읽기 ⓑⓒ 35%(997) 높음 → 0절 · p01~p20 커밋 메시지 "160/200" 은 실제 162/200.
