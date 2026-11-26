// web-desk/spell — 정답 표기 look 157(G101 2절 · 사전에도 위키에도 표제어가 없는 것) → 나무위키 제목 · 사전 다시 보기(web 계정)
//   node web-desk/spell/_build.mjs  → 보낼것/조각-NN.txt · 받은것/결과-NN.json(빈 파일) · _원본.json(조각에 넣은 그대로)
//   DB 는 읽기만(quizweb · 활성). 찬종 기준 2026-11-18: 사전 → 위키 → (둘 다 없을 때만) 나무위키.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const D = 'C:/work/quiz-web/';
const H = D + 'web-desk/spell/';
const j = JSON.parse(readFileSync(D + 'data/pipeline/audit/g101-spelling.json', 'utf8'));
const look = j.items.filter((i) => i.verdict === 'look');
const ids = [...new Set(look.flatMap((i) => i.ids))];
const sql = `select q.id, q.display_answer, q.question_text, coalesce(string_agg(a.answer_text, ' / ' order by a.is_primary desc, a.id), '')
  from questions q left join question_answers a on a.question_id = q.id
  where q.is_active and q.id in (${ids.join(',')}) group by q.id order by q.id;`;
const out = execFileSync('psql', ['-h', 'localhost', '-p', '5434', '-U', 'quiz', '-d', 'quizweb', '-At', '-F', '\t'], {
  input: sql, encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'quizlocal', PGCLIENTENCODING: 'UTF8' } });
const row = new Map(out.trim().split('\n').map((l) => { const [id, ans, q, acc] = l.split('\t'); return [+id, { ans, q, acc }]; }));
const items = [];
for (const it of look) {
  const live = it.ids.map((id) => row.get(id) && { id, ...row.get(id) }).filter(Boolean);
  if (!live.length) continue; // 꺼진 카드
  const now = live[0].ans;
  if (now !== it.answer) continue; // 그 뒤에 이미 바뀐 정답
  items.push({ answer: it.answer, cat: it.cat, wiki: it.to, cards: live.map(({ id, q, acc }) => ({ id, q, acc })) });
}
const SIZE = 40;
mkdirSync(H + '보낼것', { recursive: true }); mkdirSync(H + '받은것', { recursive: true });
const chunks = [];
for (let i = 0; i < items.length; i += SIZE) chunks.push(items.slice(i, i + SIZE));
chunks.forEach((c, k) => {
  const n = String(k + 1).padStart(2, '0');
  let t = `조각 ${n} — 정답 표기 ${c.length}개(지시서 v2 대로 · chunk = "${n}")\n이 파일의 "열 주소"는 사용자가 준 주소다 — 그대로 열어서 확인한다.\n\n`;
  c.forEach((it, x) => {
    const u = (w) => 'https://namu.wiki/w/' + encodeURIComponent(w);
    t += `[${x + 1}] 정답: ${it.answer}\n분류: ${it.cat}\n위키백과가 넘겨주는 제목: ${it.wiki}\n표준국어대사전: 없음(정답 · 위키 제목 둘 다 · 띄어쓰기를 빼고도 찾아봄)\n열 주소: ${u(it.answer)}${it.wiki && it.wiki !== it.answer ? '  ·  ' + u(it.wiki) : ''}\n`;
    for (const cd of it.cards) t += `카드 #${cd.id} 질문: ${cd.q}\n지금 맞는 답으로 받는 것: ${cd.acc}\n`;
    t += '\n';
  });
  writeFileSync(H + `보낼것/조각-${n}.txt`, t);
  if (!existsSync(H + `받은것/결과-${n}.json`)) writeFileSync(H + `받은것/결과-${n}.json`, '');
});
writeFileSync(H + '_원본.json', JSON.stringify({ builtAt: new Date().toISOString(), from: 'g101-spelling.json look', total: items.length, skipped: look.length - items.length, items }, null, 1));
console.log(`look ${look.length} → 조각 ${chunks.length}개 · 항목 ${items.length} (꺼짐 · 이미 바뀜 ${look.length - items.length})`);
