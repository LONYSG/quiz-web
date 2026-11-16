// web-desk/pick — 같은 정답 묶음에서 남길 한 장 다시 고르기(웹 계정용 조각 만들기)
//   node web-desk/pick/_build.mjs        → 보낼것/조각-NN.txt · 받은것/결과-NN.json(빈 파일) · _정답.json(설계 검사용 — 웹에 올리지 않는다)
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const src = JSON.parse(fs.readFileSync('data/pipeline/tone/g097-same-answer.json', 'utf8')).groups;
const res = JSON.parse(fs.readFileSync('data/pipeline/tone/g097-same-answer-result.json', 'utf8')).groups;
const byGid = new Map(src.map(g => [g.gid, g]));
const PER = 60;

// 한 장만 남긴 묶음(one) + 동음이의가 섞인 묶음의 "같은 것끼리" 부분 묶음(2장 이상)
const units = [];
for (const r of res) {
  const g = byGid.get(r.gid);
  const card = id => g.cards.find(c => c.id === id);
  if (r.verdict === 'one') units.push({ key: r.gid, answer: g.answer, cards: g.cards.filter(c => c.applied), kept: r.keep });
  else for (const [i, s] of (r.subsets || []).entries()) if (s.ids.length >= 2) units.push({ key: `${r.gid}-${i + 1}`, answer: g.answer, cards: s.ids.map(card).filter(c => c && c.applied), kept: s.keep });
}
const use = units.filter(u => u.cards.length >= 2);
fs.mkdirSync(path.join(here, '보낼것'), { recursive: true });
fs.mkdirSync(path.join(here, '받은것'), { recursive: true });
const key = {};
let n = 0;
for (let i = 0; i < use.length; i += PER) {
  n++;
  const nn = String(n).padStart(2, '0');
  const part = use.slice(i, i + PER);
  const lines = [`조각 ${nn} — 묶음 ${part.length}개. 지시서대로 묶음마다 남길 카드 하나를 고른다.`, ''];
  for (const u of part) {
    lines.push(`## ${u.key} · 정답: ${u.answer}`);
    for (const c of u.cards) lines.push(`- #${c.id} (등급 ${c.difficulty_score})`, `  질문: ${c.question}`, `  해설: ${c.explanation}`);
    lines.push('');
    key[u.key] = { chunk: nn, kept_g097: u.kept, ids: u.cards.map(c => c.id) };
  }
  fs.writeFileSync(path.join(here, '보낼것', `조각-${nn}.txt`), lines.join('\n'));
  const out = path.join(here, '받은것', `결과-${nn}.json`);
  if (!fs.existsSync(out)) fs.writeFileSync(out, '');
}
fs.writeFileSync(path.join(here, '_정답.json'), JSON.stringify(key, null, 1));
console.log('묶음', use.length, '· 조각', n, '· 카드', use.reduce((s, u) => s + u.cards.length, 0));
