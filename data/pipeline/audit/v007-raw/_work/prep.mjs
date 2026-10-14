// V007 prep — 판정자 조각 입력(txt + refs json) 생성
import fs from 'node:fs';
const SC = 'C:/Users/lonys/AppData/Local/Temp/claude/C--work-quiz-web/48121e5c-81cd-452a-b439-d1306ade57a2/scratchpad/v7';
const W = 'C:/work/quiz-web/data/pipeline/audit/v007-raw/_work';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const items = J(SC + '/items.json');
const one = (s) => (s ?? '').replace(/\s*\n\s*/g, ' ').trim();

for (const x of items) {
  const why = [];
  if (x.selfJudge !== '좋은 어려움') why.push('selfJudge ' + x.selfJudge);
  if (x.warn.assert.length) why.push('단정어 ' + x.warn.assert.join('/'));
  if (x.sameAnswerActive.length || x.aliasMatchActive.length) why.push('dbCheck(같은 정답 활성)');
  if (x.pairedWith) why.push('2회차');
  if (x.score.dif >= 4) why.push('GEN 난이도 ' + x.score.dif);
  x.webOpenPre = why;
}
const fmt = (x) => {
  const L = [];
  L.push(`### ${x.ref}  [${x.topic}/${x.mid}/${x.sub}]  method=${x.method}${x.pairedWith ? ' pairedWith=' + x.pairedWith : ''}${x.layer ? ' layer=' + x.layer : ''}${x.work ? ' work=' + x.work : ''}`);
  L.push(`Q: ${one(x.question)}`);
  L.push(`A: ${x.answer}${x.variants.length ? '   변형: ' + x.variants.join(' | ') : ''}${x.originalTitleVariants.length ? '   originalTitle: ' + x.originalTitleVariants.join(' | ') : ''}`);
  L.push(`E: ${one(x.explanation)}`);
  L.push(`H: ${x.hint ? one(x.hint) : '(힌트 없음 — 난이도 ' + x.score.dif + ')'}${x.hint ? '   hintSources: ' + (x.hintSources || []).join(' ; ') : ''}`);
  L.push(`GEN: dif ${x.score.dif} (${x.score.difWhy}) · wor ${x.score.wor} (${x.score.worWhy}) · acc ${x.score.acc}   selfJudge: ${x.selfJudge}${x.selfJudgeWhy ? ' — ' + one(x.selfJudgeWhy) : ''}`);
  L.push('facts: ' + x.facts.map((f) => `[${f.where}] ${one(f.claim)} <${f.url}>`).join('  ||  '));
  L.push(`dbCheck: ${one(x.dbCheck)}${x.pairCheck ? '   pairCheck: ' + one(x.pairCheck) : ''}`);
  L.push(`warn: assert=[${x.warn.assert.join(',')}] frag=[${x.warn.frag.join(',')}] hint=[${x.warn.hint.join(',')}]`);
  if (x.sameAnswerActive.length || x.aliasMatchActive.length) {
    for (const s of x.sameAnswerActive) L.push(`  sameAnswerActive #${s.id} (dif ${s.dif}): Q: ${one(s.question)} | E: ${one(s.explanation)} | H: ${one(s.hint)}`);
    for (const s of x.aliasMatchActive) L.push(`  aliasMatchActive #${s.id} 답=${s.answer} (dif ${s.dif}): Q: ${one(s.question)} | E: ${one(s.explanation)}`);
  }
  if (x.hint) L.push(`questionWords: ${x.questionWords.join(' ')}`);
  L.push(`webOpen: ${x.webOpenPre.length ? 'TRUE (' + x.webOpenPre.join(', ') + ')' : 'false (재채점 뒤 난이도 4~5 가 되면 TRUE)'}`);
  L.push('');
  return L.join('\n');
};
const byTopic = (t) => items.filter((x) => t.includes(x.topic)).sort((a, b) => (a.ref < b.ref ? -1 : 1));
const halves = (arr) => { const n = Math.ceil(arr.length / 2); return [arr.slice(0, n), arr.slice(n)]; };
const P1 = halves(byTopic(['korea', 'sports']));
const P2 = halves(byTopic(['life', 'arts']));
const P3 = [byTopic(['media']), byTopic(['science'])];
const P4 = [byTopic(['history'])];
const pieces = { j1: P1[0], j2: P1[1], j3: P2[0], j4: P2[1], j5: P3[0], j6: P3[1], j7: P4[0] };
const manifest = {};
for (const [k, arr] of Object.entries(pieces)) {
  fs.writeFileSync(`${W}/${k}.txt`, arr.map(fmt).join('\n'));
  fs.writeFileSync(`${W}/${k}.refs.json`, JSON.stringify(arr.map((x) => x.ref)));
  manifest[k] = { n: arr.length, topics: [...new Set(arr.map((x) => x.topic))], webOpenPre: arr.filter((x) => x.webOpenPre.length).length, hint: arr.filter((x) => x.hint).length };
}
// (나)(다)
const s50 = J(SC + '/sample50.json'), p29 = J(SC + '/pairs29.json');
const fmtN = (x) => {
  const L = [`### #${x.id}  [나/${x.group}]  A=${x.answer}${x.variants.length ? ' 변형: ' + x.variants.join('|') : ''}  난이도 ${x.dif}  길=${x.path}`];
  L.push(`Q: ${one(x.question)}`); L.push(`E: ${one(x.explanation)}`);
  L.push(`before(V006 이 판정한 옛 힌트): ${one(x.before)}`); L.push(`AFTER(지금 DB 힌트 — 판정 대상, 버전 ${x.dbVersion}, by=${x.by}, ${x.status}): ${one(x.after)}`);
  L.push(`V006 판정: ${x.v006.verdict} [${(x.v006.categories || []).join(',')}] — ${one(x.v006.reason)}`);
  L.push(`V006 제안: ${one(x.v006.proposal?.hint)}`);
  L.push(`G002 사유: ${one(x.g002reason)}   g002sources: ${(x.g002sources || []).join(' ; ')}`);
  for (const s of x.sameAnswerActive) L.push(`  sameAnswerActive #${s.id}: Q: ${one(s.question)} | E: ${one(s.explanation)} | H: ${one(s.hint)}`);
  L.push(`warn.hint: [${x.warn.hint.join(',')}]`); L.push('');
  return L.join('\n');
};
const fmtD = (x) => {
  const L = [`### #${x.id}  [다/쌍]  A=${x.answer}${x.variants.length ? ' 변형: ' + x.variants.join('|') : ''}  난이도 ${x.dif}  묶음=${x.group}  쌍=${x.pairIds.join('↔')}`];
  L.push(`Q: ${one(x.question)}`); L.push(`E: ${one(x.explanation)}`); L.push(`H(판정 대상 — 지금 DB 힌트, ${x.hintVersion}): ${one(x.hint)}`);
  for (const s of x.others) L.push(`  others #${s.id} (dif ${s.dif}): Q: ${one(s.question)} | E: ${one(s.explanation)} | H: ${one(s.hint)}`);
  L.push(''); return L.join('\n');
};
fs.writeFileSync(`${W}/j8.txt`, '## (나) 표본 50\n\n' + s50.map(fmtN).join('\n') + '\n## (다) 쌍 29\n\n' + p29.map(fmtD).join('\n'));
fs.writeFileSync(`${W}/j8.refs.json`, JSON.stringify([...s50.map((x) => x.id), ...p29.map((x) => x.id)]));
manifest.j8 = { n: s50.length + p29.length, na: s50.length, da: p29.length };
fs.writeFileSync(`${W}/manifest.json`, JSON.stringify(manifest, null, 1));
fs.writeFileSync(`${W}/items-webopenpre.json`, JSON.stringify(Object.fromEntries(items.map((x) => [x.ref, x.webOpenPre]))));
console.log(JSON.stringify(manifest));
for (const k of Object.keys(manifest)) console.log(k, fs.statSync(`${W}/${k}.txt`).size);
