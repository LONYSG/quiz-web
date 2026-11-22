// 1회 자료 만들기(설계 2026-11-22) — 찬종이 직접 다듬은 해설(마무리-01) + 문단별 그림 지시(draw-01) + 그림에 쓸 사실(facts-3)
//   node web-desk/vscript/_build/build-01.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const V = 'C:/work/quiz-video/data/';
const m = JSON.parse(readFileSync('web-desk/vscript/받은것/마무리-01.json', 'utf8'));
const b = JSON.parse(readFileSync('web-desk/vscript/보탬-01.json', 'utf8'));
const d = JSON.parse(readFileSync('web-desk/vscript/_build/draw-01.json', 'utf8'));
const j = JSON.parse(readFileSync(V + 'questions-3.json', 'utf8'));
const extraSrc = {};
const facts = { note: '1회 문제별 사실 모음(설계 창이 문서를 다시 열어 뽑음 · quote = 그 문서의 문장 그대로). 대본에 없는 사실을 화면(글자 · 숫자 · 그림)에 보탤 때는 여기 있는 것만, quote 가 말하는 만큼만 쓴다. conflict = 문서끼리 서로 다른 곳 — 거기 적힌 안전한 굵기를 지킨다.', questions: [] };
const srcLines = [];
for (const q of j.questions) {
  const mq = m.questions.find((x) => x.answer === q.answer); const bq = b.questions.find((x) => x.answer === q.answer); const dq = d[q.answer];
  if (!mq || !bq || !dq) throw new Error('없음: ' + q.answer);
  const paras = mq.explanation.split(/\n\s*\n/).map((s) => s.trim()); const sayParas = mq.say.explanation.split(/\n\s*\n/).map((s) => s.trim());
  if (paras.length !== dq.scenes.length || paras.length !== sayParas.length) throw new Error(`${q.answer}: 문단 ${paras.length} · 읽는 글 ${sayParas.length} · 장면 ${dq.scenes.length}`);
  q.explanation = paras.join('\n\n'); q.say.explanation = sayParas.join('\n\n'); delete q.say_v3;
  q.paragraphs = paras.map((text, i) => ({ no: i + 1, text, say: sayParas[i] }));
  q.draw = { moment: dq.moment, care: dq.care, scenes: dq.scenes.map((s, i) => ({ para: i + 1, starts: paras[i].slice(0, 18) + '…', show: s.show, ...(s.extra ? { extra: s.extra } : {}), ...(s.care ? { care: s.care } : {}) })) };
  const used = (mq.uses || []).map((id) => bq.facts.find((f) => f.id === id)).filter(Boolean);
  q.sources = [...new Set(used.map((f) => f.url))];
  const seen = new Set(); srcLines.push(`${q.no}번 ${q.answer}`);
  for (const f of used) { const line = `· ${f.site}, 「${f.title}」${f.year ? ` (${f.year})` : ''}`; if (!seen.has(line)) { seen.add(line); srcLines.push(line); } }
  for (const l of extraSrc[q.answer] || []) srcLines.push(l);
  facts.questions.push({ no: q.no, answer: q.answer, usedInScript: mq.uses || [], facts: bq.facts.map(({ id, text, quote, site, title, year, url }) => ({ id, text, quote, site, title, year, url })), conflict: bq.conflict });
  console.log(q.no, q.answer, '문단', paras.length, '글자', q.explanation.replace(/\n/g, '').length, '출처 문서', seen.size);
}
j.episode.description.sources = srcLines;
j.note = `1회 자료(설계 창 2026-11-22 다시 씀). 해설 = 찬종이 직접 다듬은 글(web-desk/vscript/받은것/마무리-01.json rev ${m.rev}) — 한 글자도 고치지 않는다. ★ 해설이 길어졌다(357~501자) → paragraphs = 문단(장면) 단위로 나눈 화면 글 text 와 읽는 글 say. draw.scenes = 문단마다 보여 줄 것(show) · 대본에 없지만 화면에 보태도 되는 사실(extra — data/facts-3.json 의 id) · 조심할 것(care). 그 밖의 틀(question · hint · say · topic · episode)은 전과 같다. say = 숫자만 한글 · 빠르기 1.0.`;
writeFileSync(V + 'questions-3.json', JSON.stringify(j, null, 1) + '\n');
writeFileSync(V + 'facts-3.json', JSON.stringify(facts, null, 1) + '\n');
console.log(srcLines.join('\n'));
