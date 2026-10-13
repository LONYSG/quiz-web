// V006 합치기 — 판정자 13조각 + VERIFY override + R032 직접 판정 + #3930 → data/pipeline/audit/v006-results.json
import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v6';
const RAW = 'C:/work/quiz-web/data/pipeline/audit/v006-raw';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const { checkHint } = await import('file:///C:/work/quiz-web/scripts/hint-check.mjs');
const { normalizeAnswer } = await import('file:///C:/work/quiz-web/shared/dist/index.js');
const T = J('C:/work/quiz-web/data/pipeline/audit/r047-verify-targets.json').midHints.targets;
const F = J('C:/work/quiz-web/data/pipeline/audit/r032-fixes.json');
const byId = new Map(T.map(x => [x.id, x]));
const mech = J(SC + '/mech.json');
const OV = J(SC + '/override.json');
const R032 = J(SC + '/r032-judge.json');
const calibIds = J(SC + '/calib-ids.json');
const groups = J(SC + '/groups.json');
const meta = fs.existsSync(SC + '/report-meta.json') ? J(SC + '/report-meta.json') : {};
const PROPFIX = fs.existsSync(SC + '/propfix.json') ? J(SC + '/propfix.json') : {};
const OKREAD = fs.existsSync(SC + '/okread.json') ? J(SC + '/okread.json') : {};   // 내가 다시 읽은 판정자 ok (id → {verdict, reason, ...})
const TRUE60 = fs.existsSync(SC + '/true60.json') ? J(SC + '/true60.json') : null;  // 표본 60 웹 확인 결과

// ── 판정자 조각
const judged = new Map(); const chunkInfo = [];
for (let i = 1; i <= 13; i++) {
  const k = 'c' + String(i).padStart(2, '0');
  const inp = J(`${SC}/${k}.json`);
  const f = `${RAW}/${k}.out.json`;
  if (!fs.existsSync(f)) { chunkInfo.push({ chunk: k, input: inp.length, output: 0, missing: true }); continue; }
  let arr; try { arr = J(f); } catch (e) { chunkInfo.push({ chunk: k, input: inp.length, output: 0, parseError: String(e.message) }); continue; }
  const outIds = arr.map(r => r.id); const inIds = inp.map(x => x.id);
  const sameOrder = JSON.stringify(outIds) === JSON.stringify(inIds);
  chunkInfo.push({ chunk: k, input: inp.length, output: arr.length, sameOrder, missingIds: inIds.filter(id => !outIds.includes(id)), extraIds: outIds.filter(id => !inIds.includes(id)) });
  for (const r of arr) if (byId.has(r.id)) judged.set(r.id, { ...r, _judge: k });
}
const rank = { fix: 3, unsure: 2, ok: 1 };
const SHAPE_RE = /글자|외자|영어\s*낱말|영어로 된|한자어|일본어|독일어|프랑스어|라틴어|그리스어|이탈리아어|스페인어|○/;
const items = {};
for (const x of T) {
  const j = judged.get(x.id) || null;
  const o = OV[String(x.id)] || null;
  const ok = OKREAD[String(x.id)] || null;
  const out = {
    id: x.id, answer: x.answer, path: x.path, gen: x.gen ?? null,
    verdict: j ? j.verdict : 'unsure',
    categories: j ? [...(j.categories || [])] : ['unjudged'],
    hintAlone: j ? j.hintAlone ?? null : null,
    proposal: j && j.proposal && j.proposal.hint ? { hint: j.proposal.hint } : {},
    reason: j ? j.reason : '판정자 출력 없음',
    facts: j ? (j.facts || []) : [],
    shape: j ? j.shape ?? null : null,
    judge: j ? j._judge : null,
    read: j ? 'judge' : 'none',
    mech: (mech[x.id].block.length || mech[x.id].warn.length) ? mech[x.id] : null,
    sameAnswerIn: groups[normalizeAnswer(x.answer)] || null,
  };
  const applyMine = (o, tag) => {
    out.read = 'verify';
    if (o.forceVerdict) { out.verdict = o.forceVerdict; out.categories = o.categories || []; out.flipped = j && j.verdict !== o.forceVerdict ? `${j.verdict}→${o.forceVerdict}` : undefined; if (o.forceVerdict === 'ok') { out.proposal = {}; out.facts = out.facts.filter(f => !f.proposal); } }
    else if (o.verdict) { const v = rank[o.verdict] >= rank[out.verdict] ? o.verdict : out.verdict; if (j && j.verdict !== v) out.flipped = `${j.verdict}→${v}`; out.verdict = v; out.categories = [...new Set([...(out.categories || []).filter(c => c !== 'unjudged'), ...(o.categories || [])])]; }
    if (o.proposal && o.proposal.hint) out.proposal = { hint: o.proposal.hint };
    if (o.reason) out.reason = (out.reason && out.reason !== '판정자 출력 없음' ? out.reason + ' ‖ ' : '') + `[${tag}] ` + o.reason;
    if (o.facts) out.facts = [...out.facts, ...o.facts];
    if (o.shape) out.shape = o.shape;
  };
  if (o && (o.verdict || o.forceVerdict)) applyMine(o, 'VERIFY 직접');
  else if (o && o.mechRead) { out.read = 'verify'; out.mechRead = o.mechRead; out.reason += ' ‖ [VERIFY 기계 경고 재독] ' + o.reason; }
  if (ok) applyMine(ok, 'VERIFY 재독');
  if (TRUE60 && TRUE60[String(x.id)]) { for (const t of TRUE60[String(x.id)]) { const f = out.facts.find(f => f.claim === t.claim); if (f) { f.sampleCheck = { result: t.result, source: t.source }; if (t.result === 'false') { f.result = 'false'; } } } }
  // shape 보정: categories 에 shape 없는데 힌트가 꼴을 말하면 판정자 shape 필드로 판단 — 기계 후보는 따로 적는다
  out.shapeCandidate = SHAPE_RE.test(x.hint) && !out.categories.includes('shape') ? true : undefined;
  if (PROPFIX[String(x.id)] && out.verdict === 'fix') { out.proposal = { hint: PROPFIX[String(x.id)] }; out.proposalEditedByVerify = true; }
  if (out.proposal.hint) {
    const h = out.proposal.hint;
    out.proposalCheck = { ...checkHint({ hint: h, answer: x.answer, variants: x.variants || [], question: x.question, explanation: x.explanation || '' }), len: h.length, newline: /\n/.test(h), over120: h.length > 120 };
  }
  if (out.categories.includes('shape') || out.categories.includes('shape-only')) out.shapeOnly = out.categories.includes('shape-only');
  items[String(x.id)] = out;
}
const arr = Object.values(items);
const cnt = (a, f) => a.reduce((m, x) => { const k = f(x); if (k == null) return m; m[k] = (m[k] || 0) + 1; return m; }, {});
const allFacts = arr.flatMap(i => i.facts.map(f => ({ ...f, id: i.id, path: i.path })));
const nonProp = allFacts.filter(f => !f.proposal);
const stats = {
  verdict: cnt(arr, i => i.verdict),
  byPath: Object.fromEntries(['연결', '유래', '쓰임', '무리', '기타'].map(p => [p, cnt(arr.filter(i => i.path === p), i => i.verdict)])),
  categories: cnt(arr.flatMap(i => i.categories), c => c),
  read: cnt(arr, i => i.read),
  flipped: arr.filter(i => i.flipped).map(i => ({ id: i.id, flipped: i.flipped })),
  facts: { claims: nonProp.length, true: nonProp.filter(f => f.result === 'true').length, false: nonProp.filter(f => f.result === 'false').length, unverified: nonProp.filter(f => f.result !== 'true' && f.result !== 'false').length, doubt: nonProp.filter(f => f.doubt).length, web: nonProp.filter(f => f.basis === 'web').length, knowledge: nonProp.filter(f => f.basis !== 'web').length, itemsWithFacts: arr.filter(i => i.facts.some(f => !f.proposal)).length, proposalFacts: allFacts.filter(f => f.proposal).length, proposalFactsWeb: allFacts.filter(f => f.proposal && f.basis === 'web').length, falseList: nonProp.filter(f => f.result === 'false').map(f => ({ id: f.id, claim: f.claim, source: f.source })) },
  hintCheck: { blocks: Object.values(mech).reduce((s, r) => s + r.block.length, 0), warnKinds: cnt(Object.values(mech).flatMap(r => r.warn), w => w.kind), warnItems: Object.values(mech).filter(r => r.warn.length).length, mechRead: cnt(arr.filter(i => i.mech), i => i.mechRead || (i.verdict !== 'ok' ? 'fix-other-reason' : 'judge-ok')) },
  proposals: { count: arr.filter(i => i.proposal.hint).length, block: arr.filter(i => i.proposalCheck && i.proposalCheck.block.length).map(i => i.id), warn: arr.filter(i => i.proposalCheck && i.proposalCheck.warn.length).map(i => ({ id: i.id, warn: i.proposalCheck.warn })), over120: arr.filter(i => i.proposalCheck && i.proposalCheck.over120).map(i => i.id), newline: arr.filter(i => i.proposalCheck && i.proposalCheck.newline).map(i => i.id) },
  shape: { total: arr.filter(i => i.categories.includes('shape') || i.categories.includes('shape-only')).length, only: arr.filter(i => i.categories.includes('shape-only')).length, withOther: arr.filter(i => i.categories.includes('shape') && !i.categories.includes('shape-only')).length, alsoFix: arr.filter(i => (i.categories.includes('shape') || i.categories.includes('shape-only')) && i.verdict === 'fix').length, candidatesNotMarked: arr.filter(i => i.shapeCandidate).length },
  genFlagged: arr.filter(i => i.gen).map(i => ({ id: i.id, answer: i.answer, verdict: i.verdict, categories: i.categories })),
  sameAnswer: { groups: Object.keys(groups).length, items: Object.values(groups).flat().length },
  calibration: calibIds.map(id => ({ id, answer: items[String(id)].answer, path: items[String(id)].path, verdict: items[String(id)].verdict, categories: items[String(id)].categories })),
  chunks: chunkInfo,
};
// R032
const r032 = { edits: {}, variants: {}, deactivate: {}, sample10: R032.sample10 };
for (const e of F.edits) { const jj = R032.edits[String(e.id)] || { verdict: 'unsure', reason: '판정 없음' }; r032.edits[String(e.id)] = { id: e.id, kind: e.kind, answer: e.answer, src: e.src, overlapsMidHints: byId.has(e.id), ...jj }; }
for (const v of F.variants) r032.variants[String(v.id)] = { id: v.id, add: v.add, ...(R032.variants[String(v.id)] || { verdict: 'unsure' }) };
for (const d of F.deactivate) r032.deactivate[String(d.id)] = { id: d.id, answer: d.answer, ...(R032.deactivate[String(d.id)] || { verdict: 'unsure' }) };
const r032stats = { edits: cnt(Object.values(r032.edits), e => e.verdict), byKind: { assert: cnt(Object.values(r032.edits).filter(e => e.kind === 'assert'), e => e.verdict), unique: cnt(Object.values(r032.edits).filter(e => e.kind === 'unique'), e => e.verdict) }, variants: cnt(Object.values(r032.variants), e => e.verdict), deactivate: cnt(Object.values(r032.deactivate), e => e.verdict), overlap23: Object.values(r032.edits).filter(e => e.overlapsMidHints).length };
const ref = {
  '3930': { id: 3930, answer: '사워도우', difficulty: 4, hintVersion: 'hint-v3', verdict: 'fix', categories: ['explain-overlap'], reason: "힌트 '빵집마다 대를 이어 밀가루와 물을 주며 기르는 발효종' 과 해설 '밀가루와 물만으로 오래 기른 발효종' 은 같은 사실(발효종을 밀가루와 물로 오래 기른다)을 나눠 쓴다 — H4. 해설의 핵심(유산균·효모가 시큼한 맛을 냄)은 남으므로 가벼운 겹침이지만, 힌트에서 '밀가루와 물' 을 빼면 해설이 할 말이 온전히 남는다.", proposal: { hint: '빵집마다 대를 이어 기르는 발효종이 있어, 1849년 골드러시 때 만든 것을 지금도 쓴다고 내세우는 가게도 있다.' }, facts: [{ claim: '샌프란시스코 부댕 베이커리는 1849년 골드러시 때의 발효종을 지금도 쓴다고 한다', result: 'true', basis: 'web', source: 'https://en.wikipedia.org/wiki/Boudin_Bakery', proposal: true }], note: '목록 밖 — 참고(C61). 상(4) 힌트라 세기는 판정하지 않았다.' },
};
ref['3930'].proposalCheck = checkHint({ hint: ref['3930'].proposal.hint, answer: '사워도우', variants: ['사워도우'], question: '샌프란시스코의 명물 빵으로, 이 도시 이름이 학명에 붙은 유산균이 처음 발견된 빵은?', explanation: '밀가루와 물만으로 오래 기른 발효종이 효모와 함께 이 유산균을 품어 시큼한 맛을 냅니다.' });
const STRICT = /(d+|두|세|네|다섯)s*글자|글자s*수|알파벳 (세|네|두)|영문 세|외자|한자 (두|네) 글자|세 글자 한자어|두 글자 한자어|네 글자|한자 넷|두 한자|순우리말|영어에서 온 (두 글자 )?외래어|러시아 낱말|히브리어 이름|영어로 지은 별명|영어 별칭|영어 외래어|한자어 두 글자|○○|한 자리|네 자리|세 자리|1로 시작|영어 알파벳 세/;
const NAMESTRUCT = /(두|세|네|다섯|여섯|d+)s*글자|외자|글자s*수|○|한 글자|영어 낱말|한자어|한자 한|첫 글자|끝 글자|뒷글자|앞 글자|이름 (앞|뒤)부분|약어|알파벳/;
const shapeList = arr.filter(i => i.categories.includes('shape') || i.categories.includes('shape-only')).map(i => ({ id: i.id, answer: i.answer, path: i.path, verdict: i.verdict, shapeOnly: !!i.shapeOnly, strict: STRICT.test(byId.get(i.id).hint), shape: i.shape, hint: byId.get(i.id).hint }));
const shapeUnmarked = arr.filter(i => !(i.categories.includes('shape') || i.categories.includes('shape-only')) && NAMESTRUCT.test(byId.get(i.id).hint)).map(i => ({ id: i.id, answer: i.answer, verdict: i.verdict, hint: byId.get(i.id).hint }));
const res = {
  round: 'V006', date: new Date().toISOString().slice(0, 10), task: 'R036 중(3) 일반 힌트 1,328 판정 (C60 나 — 적재됨) + R032 고침 63 · 변형 2 · 격리 1 (C55) + 참고 #3930 (C61)',
  source: 'data/pipeline/audit/r047-verify-targets.json#midHints.targets · data/pipeline/audit/r032-fixes.json', model: 'Fable 5.1 (판정자 조각 13 — 같은 모델, v006-raw/RUBRIC.md 공유)',
  web: meta.web || null,
  counts: { midHints: T.length, judged: arr.filter(i => i.judge).length, ...stats.verdict, r032: 66, ref: 1 },
  stats, r032stats, midHints: items, r032, ref, shape: shapeList, shapeUnmarkedNameStructure: shapeUnmarked, genFlagged: stats.genFlagged, true60: TRUE60 ? (meta.true60 || null) : null,
};
fs.writeFileSync('C:/work/quiz-web/data/pipeline/audit/v006-results.json', JSON.stringify(res, null, 1) + '\n');
console.log(JSON.stringify({ chunks: chunkInfo.map(c => `${c.chunk}:${c.output}/${c.input}${c.sameOrder ? '' : '!'}`), verdict: stats.verdict, byPath: stats.byPath, categories: stats.categories, read: stats.read, facts: stats.facts, proposals: { ...stats.proposals, warn: stats.proposals.warn.length }, shape: stats.shape, flipped: stats.flipped.length, r032: r032stats }, null, 1));
// dumps for me
let s = '';
for (const i of arr.filter(i => i.verdict !== 'ok')) { const x = byId.get(i.id); s += `## #${i.id} [${i.verdict}] ${i.categories.join(',')} path=${i.path} A=${x.answer}${x.variants?.length ? ' V=' + x.variants.join('|') : ''} judge=${i.judge}\n Q: ${x.question.replace(/\n/g, ' ')}\n H: ${x.hint}\n E: ${(x.explanation || '').replace(/\n/g, ' ')}\n alone: ${i.hintAlone}\n reason: ${i.reason}\n prop: ${i.proposal.hint || '-'}${i.proposalCheck ? ' | chk ' + JSON.stringify({ b: i.proposalCheck.block, w: i.proposalCheck.warn.map(w => w.kind), len: i.proposalCheck.len }) : ''}\n\n`; }
fs.writeFileSync(SC + '/nonok.txt', s);
let f = '';
for (const x of nonProp.filter(f => f.result !== 'true')) f += `#${x.id} [${x.result}/${x.basis}${x.doubt ? '/doubt' : ''}] ${x.claim} ${x.source || ''}\n`;
fs.writeFileSync(SC + '/unverified.txt', f);
let sh = '';
for (const i of shapeList) sh += `#${i.id} [${i.verdict}${i.shapeOnly ? '/꼴만' : '/함께'}] ${i.answer} (${i.path}) — ${i.hint}\n`;
fs.writeFileSync(SC + '/shape.txt', sh);
let sc = '';
for (const i of arr.filter(i => i.shapeCandidate)) sc += `#${i.id} [${i.verdict}] ${i.answer} — ${byId.get(i.id).hint}\n`;
fs.writeFileSync(SC + '/shape-candidates.txt', sc);
console.log('nonok chars', s.length, 'unverified lines', f.split('\n').length - 1, 'shape', shapeList.length, 'shape-candidates', sc.split('\n').length - 1);
