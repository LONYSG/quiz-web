import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v9';
const R = 'C:/work/quiz-web/data/pipeline/audit/v009-raw';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const items = Object.fromEntries(J(SC + '/items.json').map((x) => [x.ref, x]));
const all = []; for (let i = 1; i <= 8; i++) for (const x of J(`${R}/p${i}.out.json`)) all.push({ ...x, piece: 'p' + i });
const by = Object.fromEntries(all.map((x) => [x.ref, x]));
const one = (s) => (s ?? '').replace(/\s*\n\s*/g, ' ').trim();
let seed = 20261015; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const shuf = (a) => { const s = [...a]; for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; } return s; };
// U: 열지 않은 64 · B: 열었지만 미확인 주장 있는 105 · Rr: 판정자가 모두 true 로 닫은 항목 중 무작위 40
const U = all.filter((x) => !x.webOpened).map((x) => x.ref);
const B = all.filter((x) => x.webOpened && (x.facts || []).some((f) => !f.proposal && f.result === 'unverified')).map((x) => x.ref);
const rest = all.filter((x) => x.webOpened && !B.includes(x.ref) && (x.facts || []).filter((f) => !f.proposal).length).map((x) => x.ref);
const Rr = shuf(rest).slice(0, 40);
const fmtFull = (ref, tag) => { const t = items[ref]; return [`### ${ref}  [${tag}]`, `A: ${t.answer}`, `Q: ${one(t.question)}`, `E: ${one(t.explanation)}`, `H: ${one(t.hint)}   hintSources: ${(t.hintSources || []).join(' ; ')}   hintNote: ${one(t.hintNote)}`,
  `확인할 주장(facts 전부): ` + t.facts.map((f, i) => `\n   (${i + 1}) [${f.where}] ${one(f.claim)} <${f.url}> «${one(f.note).slice(0, 220)}»`).join(''), `(힌트의 사실 주장도 확인한다)`, ''].join('\n'); };
const fmtB = (ref) => { const t = items[ref]; const j = by[ref]; const un = (j.facts || []).filter((f) => !f.proposal && f.result === 'unverified');
  return [`### ${ref}  [판정자가 열었으나 미확인]`, `A: ${t.answer}`, `Q: ${one(t.question)}`, `E: ${one(t.explanation)}`, `H: ${one(t.hint)}   hintSources: ${(t.hintSources || []).join(' ; ')}`,
  `다시 확인할 주장(판정자가 unverified 로 남김): ` + un.map((f, i) => `\n   (${i + 1}) [${f.where}] ${one(f.claim)}  (판정자 source: ${f.source || '-'})`).join(''), `원 facts url: ${t.facts.map((f) => f.url).filter((v, i, a) => a.indexOf(v) === i).join(' ; ')}`, ''].join('\n'); };
const entries = [...U.map((r) => ({ r, k: 'U' })), ...B.map((r) => ({ r, k: 'B' })), ...Rr.map((r) => ({ r, k: 'R' }))];
const mixed = shuf(entries); const n = Math.ceil(mixed.length / 4);
const prompt = fs.readFileSync(R + '/_work/xprompt.md', 'utf8');
const man = {};
['x1', 'x2', 'x3', 'x4'].forEach((k, i) => { const b = mixed.slice(i * n, (i + 1) * n);
  fs.writeFileSync(`${R}/_work/${k}.txt`, b.map((e) => (e.k === 'B' ? fmtB(e.r) : fmtFull(e.r, e.k === 'U' ? '판정자가 열지 못함' : '무작위 재확인'))).join('\n'));
  fs.writeFileSync(`${R}/_work/${k}.refs.json`, JSON.stringify(b.map((e) => e.r)));
  fs.writeFileSync(`${R}/_work/${k}.prompt.txt`, prompt.replaceAll('@T@', k).replace('@N@', String(b.length)).replace('@MODE@', '대상: (U) 판정자가 열지 못한 항목의 facts 전체 · (B) 판정자가 열었으나 미확인으로 남긴 주장 · (R) 판정자가 true 로 닫은 항목의 무작위 재확인. 질문·해설·힌트의 사실 주장을 문서로 대조한다.'));
  man[k] = { n: b.length, U: b.filter((e) => e.k === 'U').length, B: b.filter((e) => e.k === 'B').length, R: b.filter((e) => e.k === 'R').length }; });
fs.writeFileSync(`${R}/_work/xsets.json`, JSON.stringify({ U, B, Rr }));
console.log(JSON.stringify(man), U.length, B.length, Rr.length);
// 제안 사실 점검 y
const flaggedRe = /VERIFY|확인|요약|검색|지식|403|404|unverified|못 함|못함|문서 밖/;
const props = all.filter((x) => x.verdict !== 'ok' && ((x.proposal && x.proposal.hint) || (x.proposal && x.proposal.question) || (x.proposal && x.proposal.explanation)));
const flagged = props.filter((x) => flaggedRe.test(x.note || '') || (x.facts || []).some((f) => f.proposal && f.result !== 'true'));
const others = shuf(props.filter((x) => !flagged.includes(x))).slice(0, 30);
const y = [...flagged, ...others];
const fmtY = (x) => { const t = items[x.ref]; const p = x.proposal;
  return [`### ${x.ref}`, `A: ${t.answer}`, `Q(현재): ${one(t.question)}`, `E(현재): ${one(t.explanation)}`, p.hint ? `제안 힌트: ${p.hint}` : null, p.question ? `제안 질문: ${one(p.question)}` : null, p.explanation ? `제안 해설: ${one(p.explanation)}` : null,
    `판정자가 단 근거: ${(x.facts || []).filter((f) => f.proposal).map((f) => `${one(f.claim)} <${f.source}> (${f.result}/${f.basis})`).join(' || ')}`, `판정자 note: ${one(x.note).slice(0, 200)}`, ''].filter((v) => v !== null).join('\n'); };
const yn = Math.ceil(y.length / 2);
['y1', 'y2'].forEach((k, i) => { const b = y.slice(i * yn, (i + 1) * yn); fs.writeFileSync(`${R}/_work/${k}.txt`, b.map(fmtY).join('\n')); fs.writeFileSync(`${R}/_work/${k}.refs.json`, JSON.stringify(b.map((x) => x.ref)));
  fs.writeFileSync(`${R}/_work/${k}.prompt.txt`, prompt.replaceAll('@T@', k).replace('@N@', String(b.length)).replace('@MODE@', '대상: 판정자가 새로 제안한 힌트·질문·해설 문구의 **사실**. 제안 문장의 주장이 맞는지, 판정자가 단 근거 url 이 그 주장을 정말 뒷받침하는지(where 는 ph) 문서를 직접 열어 본다. 제안 질문·해설은 숫자·연도·동사까지 글자 대조.')); });
console.log('proposals', props.length, 'flagged', flagged.length, 'random', others.length, 'y', y.length);
fs.writeFileSync(`${R}/_work/ysets.json`, JSON.stringify({ flagged: flagged.map((x) => x.ref), others: others.map((x) => x.ref) }));
