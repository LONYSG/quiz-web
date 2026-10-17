// V013 (나) build — 판정자 6조각 + VERIFY 재독 → data/pipeline/audit/v013-active3.json (+ v013-results.json 별칭) · ai-out/V013.txt
import fs from 'node:fs';
const RAW = 'C:/work/quiz-web/data/pipeline/audit/v013-raw'; const A = 'C:/work/quiz-web/data/pipeline/audit';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const cnt = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const tg = J(RAW + '/targets-ids.json'); const items = Object.fromEntries(J(RAW + '/_work/items.json').map((x) => [x.id, x])); const merged = J(RAW + '/_work/merged.json');
const grp = (src) => { const m = (src || '').match(/#(g\d+|r\d+[a-z]*|\d+)/i); return m ? (/^g|^r/i.test(m[1]) ? m[1].toLowerCase() : 'legacy#') : (src || '').startsWith('manual') ? 'manual' : 'other'; };
const res = {};
for (const id of tg.ids) { const x = merged[id]; const it = items[id]; res[id] = { id, answer: it.answer, source: it.source, group: grp(it.source), verdict: x.verdict, categories: x.categories || [], reason: x.reason, uniqueness: x.uniqueness, facts: x.facts || [], readable: x.readable, hint: x.hint, proposal: x.proposal || null, urls: x.urls || [], note: x.note ?? null, piece: x.piece, unverified: /unverified/.test((x.reason || '') + (x.note || '') + JSON.stringify(x.facts || [])) }; }
const all = Object.values(res); const fixes = all.filter((x) => x.verdict === 'fix');
const byGroup = {}; for (const g of Object.keys(cnt(all, (x) => x.group))) { const a = all.filter((x) => x.group === g); byGroup[g] = { n: a.length, fix: a.filter((x) => x.verdict === 'fix').length, pct: +(a.filter((x) => x.verdict === 'fix').length / a.length * 100).toFixed(1) }; }
const cat = {}; for (const x of fixes) for (const k of x.categories) cat[k] = (cat[k] || 0) + 1;
const kind = { hint: fixes.filter((x) => x.categories.some((c) => c.startsWith('h-'))).length, question: fixes.filter((x) => x.proposal?.question || x.categories.some((c) => ['readable', 'scope'].includes(c))).length, explanation: fixes.filter((x) => x.proposal?.explanation).length, variants: fixes.filter((x) => x.proposal?.variants).length, factError: fixes.filter((x) => x.categories.includes('fact-error')).length };
const counts = { sample: all.length, poolSize: tg.poolSize, seed: tg.seed, activeDb: tg.activeDb, ok: all.length - fixes.length, fix: fixes.length, fixPct: +(fixes.length / all.length * 100).toFixed(1), unverified: all.filter((x) => x.unverified).length, byGroup, categories: cat, kind, withSame: all.filter((x) => items[x.id].same.length).length, pairSame: cat['h-pair-same'] || 0 };
const flipped = []; // VERIFY 재독으로 뒤집은 것 없음 — 사실 4건 직접 확인(가리발디·이창동·골든글로브·가루다)
const overlapV011 = [2187, 2412].map(String).filter((id) => res[id]?.verdict === 'fix');
const out = { round: 'V013', part: '(나) 기존 활성 난이도 3 표본 300 — G009 묶음(g009a·g009b)이 아직 없어서', date: '2026-10-17', model: 'claude-sonnet-5-5 (VERIFY · 판정자도 같은 모델)', web: { webFetchJudges: 82 + 61 + 72 + 55 + 72 + 51, webSearchJudges: 0, verifyWebFetch: 4, verifyWebSearch: 0, limitWebSearch: 100, r429: 0 }, counts, overlapV011, targets: { ids: tg.ids, seed: tg.seed }, items: res, flipped };
fs.writeFileSync(A + '/v013-active3.json', JSON.stringify(out, null, 1));
fs.writeFileSync(A + '/v013-results.json', JSON.stringify({ round: 'V013', bundles: { g009a: null, g009b: null, note: 'G009 묶음 없음 — (나) 로 진행. 자세한 것은 v013-active3.json' }, active3: { counts, ref: 'v013-active3.json' } }, null, 1));
// 보고서
const L = []; const p = (...a) => L.push(...a); const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
p('===========================================', 'ROUND: V013', 'DATE: 2026-10-17', 'TASK: G009 생성분 판정(g009a · g009b) — 묶음이 아직 없어 (나) 기존 활성 난이도 3 표본 300 품질 점검으로 진행. 반영은 G011', 'STATUS: 완료 — (나) 만 · g009a · g009b 미판정', '===========================================', '');
p('[cmd 창 요약]');
p(`1. ★ g009a · g009b 묶음 없음(git fetch 로 origin/main 확인 · G009.txt 없음 · audit/g009-fixes.json 만 있음) → 브리핑대로 (나) 로 진행. 묶음이 올라오면 다음 V 에서 판정(0절 · CV).`);
p(`2. (나) 활성 난이도 3(${tg.poolSize}) 중 시드 ${tg.seed} 무작위 300: ok ${counts.ok} · fix ${counts.fix}(${counts.fixPct}%) · 문서로 못 닫은(unverified) ${counts.unverified}.`);
p(`3. fix 사유(중복 포함): 힌트 정답 글자·조각 ${cat['h-letters'] || 0} · 같은 정답 활성과 같은 사실 ${cat['h-pair-same'] || 0} · 힌트 약함·대표 사실 ${(cat['h-weak'] || 0) + (cat['h-famous'] || 0)} · 힌트 사실 틀림 ${cat['h-error'] || 0} · 변형 누락 ${cat.variants || 0} · 단정 ${cat.assertive || 0} · 해설 ${cat.explanation || 0} · 질문·해설 사실 틀림 ${cat['fact-error'] || 0} · 정답 비유일 ${cat['not-unique'] || 0} · 읽기 ${cat.readable || 0}.`);
p(`4. 사실 틀림 5(#279 토가 · #1888 애시 · #1965 이창동 · #2066 드림웍스 · #3995 가리발디)와 힌트 사실 틀림 4(#1296 #1953 #2532 #3771)는 모두 문서로 확인 — 일부는 직접 다시 열어 일치(가리발디 · 이창동 · 골든글로브 · 가루다).`);
p('5. 새 결정 CV(13번). DB 쓰기 0 · 429 없음. 결과: ai-out/V013.txt · audit/v013-active3.json · v013-results.json · v013-raw/', '');
p('0. 웹 검색·조회 (맨 앞) · 묶음 상태');
p(`- 판정자 6조각(한 번에 1개): WebFetch 약 ${out.web.webFetchJudges}회(그중 404 다수 — 자기 보고) · WebSearch 0 · VERIFY 직접 WebFetch ${out.web.verifyWebFetch}회 · WebSearch 0 (한도 100 이내) · 429 없음 · 모델 유지(Sonnet 5.5). 이번엔 판정자에게 WebFetch 만 쓰게 했고 연 url 은 항목의 urls 에 있다.`);
p('- ★ 원칙 7 확인: 브리핑은 "묶음 수(a · b) · 게이트 통과 수 = 묶음 수 · 활성 5,113". 묶음이 없어 앞 둘은 확인 못 했다. 활성 5,113 은 DB 에서 확인(일치). g009a · g009b 는 origin/main 에도 없다(G009 GEN 이 아직 올리지 않음) — "30분 × 4 기다림" 은 b 를 집을 때의 규칙이라 (나)로 시작했다.');
p(`- 묶음별 집계(F): g009a · g009b — 없음(미판정). "들어가면 상 N판" 추정은 다음 V 에서.`, '');
p('1. 건수·빠진 것');
p(`- (나) 300 전수(판정자 6조각 50건씩 — 출력 수·key 순서 입력과 기계 대조 불일치 0). 보정 표본 6건(RUBRIC) 판정자가 같은 쪽으로 판정. 직접 재독: fix 60 전부 제안 문구를 읽었고 사실 4건을 문서로 다시 열어 확인. ok 240 은 reason 만 훑음(10% 24건). 못 한 것: unverified ${counts.unverified} 건 — ko 위키 404(개자추 · 플레이스테이션 · 변신 · 은밀하게 위대하게 등)와 문서에 문장이 없는 것 · 항목당 문서를 하나씩만 열어 대조한 것이 많다(질문의 모든 숫자를 다 대조한 것은 아님).`, '');
p('2. 종류별');
p(`- 힌트 ${kind.hint}건(fix 의 ${Math.round(kind.hint / fixes.length * 100)}%): 정답 글자·조각 ${cat['h-letters'] || 0}(아파넷 ARPA · 바우하우스 Bau+Haus · 파나막스 · 시즈닝 "길이 들고" · 용승 "샘물이 솟는" · 이명법 "이(二)" 꼴) · 같은 정답 활성과 같은 사실 ${cat['h-pair-same'] || 0}(변신 #2643↔#4016 등 — 쌍 양쪽이 다 표본에 들어온 것도 있음) · 대표 사실·질문 되풀이 ${(cat['h-weak'] || 0) + (cat['h-famous'] || 0)} · 사실 틀림 ${cat['h-error'] || 0}.`);
p(`- 질문·정답·해설: 변형 누락 ${cat.variants || 0}(합리론·합리주의 · 옴부즈맨/만 · 아비뇽 유수↔바빌론 유수 · 맥아↔엿기름 · 메탄 하이드레이트↔가스 하이드레이트 · 로보토미↔백질 절제술 …) · 정답 비유일 ${cat['not-unique'] || 0}(영국↔잉글랜드 · 도약 방법 · 에디션) · 단정 ${cat.assertive || 0}(시간 의존: 골든글로브 · 에어로젤 "가장 가벼운 고체" · 학설: 엔타시스 · 케인스 뉴딜) · 사실 틀림 ${cat['fact-error'] || 0} · 읽기 ${cat.readable || 0}.`);
p(`- 출처 라운드별 fix 율: ${Object.entries(byGroup).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${k} ${v.fix}/${v.n}(${v.pct}%)`).join(' · ')}.`, '');
p('3. fix 만 (ok 는 JSON 에만)');
for (const x of fixes) { const pr = x.proposal ? Object.entries(x.proposal).filter(([, v]) => v).map(([k, v]) => `${k[0]}:${Array.isArray(v) ? v.join('|') : v}`).join(' ## ') : ''; p(`- #${x.id} ${x.answer} [${x.categories.join(',')}] ${one(x.reason).slice(0, 110)}${pr ? ' ⇒ ' + one(pr).slice(0, 220) : ''}`); }
p('', '4. 경계·미확인');
p('- 겹침: #2187 도약 방법 · #2412 터널 굴착기는 V011 CV-20 에서 이미 fix 였다(#2187 질문 한정어·변형 · #2412 변형) — 이번에는 #2412 가 힌트(영어 세 글자 약칭 H7) 사유로 또 fix. 두 번 판정된 것은 G011 이 합쳐서 한 번에 고친다.');
p('- 제안의 새 사실을 문서로 못 닫은 것(G011 이 열어 본 뒤 적용): #45 유스티니아누스(니카 반란 뒤 재건 — 확정 불충분) · #4069 은밀하게 위대하게(5446 부대 · 2011 대한민국 콘텐츠 대상 장관상) · #5150 가부키(1603) · #3926 두부(나라 시대) · #2643 변신(대체 힌트 근거 약 — 힌트를 비우는 쪽도 검토).');
p('- 질문·해설 사실을 문서로 못 연 unverified ok 가 많다(대표: #2449 해설 "기러기발" · #4275 주자 선택 문장 · #4898 실버골 "마지막 2초" · #4490 마수걸이 · #1241 "40대 중반").', '');
p('5. 누적·중복');
p(`- 같은 정답 활성 쌍과 힌트가 겹친 fix ${cat['h-pair-same'] || 0}건 — H12 규칙을 G006 이 "같은 문장만" 고친다로 정했으나(CV-12) 같은 사실 다른 문장은 그대로 남은 것이 이 표본에 ${cat['h-pair-same'] || 0}/300. 활성 전체로 환산하면 난이도 3 의 약 ${Math.round((cat['h-pair-same'] || 0) / 300 * tg.poolSize)}건(표본 환산 — 불확실).`, '');
p('6. 반복 오류 유형');
p('- ① 힌트가 이름의 번역·약칭·한자 뜻을 풀어 써 정답 조각을 건넨다(h-letters 12/300 = 4%) — hint-v5 의 H2 는 글자 포함은 막지만 "번역·한자 뜻풀이" 꼴이 남는다(바우하우스 "짓다+집" · 용승 "샘물이 솟는").');
p('② 변형 누락(16/300 = 5.3%) — 한국어 문서가 같은 말로 소개하는 별칭·표기(합리주의 · 가스 하이드레이트 · 엿기름)가 변형에 없다. 퀴즈 정답 판정에서 억울한 오답이 된다(B2).');
p('③ 시간·학설 단정(13/300 = 4.3%) — 현재형 단정("~가 주며" "가장 가벼운 고체로 불리며")과 설을 사실처럼 쓴 해설. 3-2 의 "바뀔 수 있는 사실" 선 반복.', '');
p('7. 자기 점검');
p('- 판정자는 6개를 한 번에 1개씩 돌렸고 출력 수·순서를 기계로 대조했다. 판정자가 WebFetch 만 쓰게 한 첫 라운드라 url 이 JSON 에 남았다. 단 이 표본 300 은 난이도 3 전체(2,386)의 12.6% 라 "전체 fix 율 20%" 는 신뢰구간이 넓다(약 ±4.5%p).');
p('- 새로 생긴 결정 필요 항목: CV-31 g009a·g009b 미판정(다음 V) · CV-32 활성 난이도 3 의 fix 20% 처리 방식(60건 전부 G011 이 고칠지 · 나머지 2,086 도 같은 기준으로 훑을지) · CV-33 H2 "번역·한자 뜻풀이" 꼴을 15 §4-1 에 예로 더할지.');
p('- 고친 문서: docs/13-PENDING-CHECKS.md(CV-31~33 · C71 처리 표시) · ai-out/README.md(V 표). 규칙·프롬프트·코드는 고치지 않았다.');
fs.writeFileSync('C:/work/quiz-web/ai-out/V013.txt', L.join('\n') + '\n');
console.log(JSON.stringify(counts, null, 1));
