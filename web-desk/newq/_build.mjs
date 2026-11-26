// web-desk/newq — 새 문항 재료 찾기(web 계정 · 2026-11-26 · G107~G111 의 GEN 하위 에이전트 일을 web 으로 옮김)
//   node web-desk/newq/_build.mjs [--from 1]  → _있는정답.txt(web 프로젝트에 올림) · _taken.tsv(검사용) · 보낼것/조각-NN.txt · 받은것/결과-NN.json(빈)
//   DB 는 읽기만(quizweb · 활성 + 꺼진 것). 조각 = 대분류 × 난이도 길(쉬움 1 · 어려움 4 · 어려움 5) · 한 조각 10개.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const D = 'C:/work/quiz-web/';
const H = D + 'web-desk/newq/';
const psql = (sql) => execFileSync('psql', ['-h', 'localhost', '-p', '5434', '-U', 'quiz', '-d', 'quizweb', '-At', '-F', '\t'], {
  input: sql, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, PGPASSWORD: 'quizlocal', PGCLIENTENCODING: 'UTF8' } }).trim();

// 1. 이미 있는 정답 — DB(활성 + 꺼짐) · 새재료-* · vstock · 영상 장부 · 앞 web 결과
const rows = psql(`select q.id, q.is_active, q.display_answer, coalesce(string_agg(a.answer_text, '|'), '') from questions q
  left join question_answers a on a.question_id = q.id group by q.id order by q.id;`).split('\n');
const taken = []; // [출처, 대표, 표기들]
for (const l of rows) { const [id, act, ans, acc] = l.split('\t'); taken.push([`db#${id}${act === 't' ? '' : '(꺼짐)'}`, ans, [ans, ...acc.split('|').filter(Boolean)]]); }
const T = D + 'web-desk/tone/보낼것/';
for (const f of readdirSync(T).filter((f) => /^새재료-\d+\.json$/.test(f)).sort()) {
  const j = JSON.parse(readFileSync(T + f, 'utf8'));
  for (const it of j.items) taken.push([`${j.chunk}/${it.key}`, it.answer, [it.answer, ...(it.also || [])]]);
}
for (const f of readdirSync(D + 'web-desk/vstock/받은것')) {
  try { for (const it of JSON.parse(readFileSync(D + 'web-desk/vstock/받은것/' + f, 'utf8')).items) taken.push([`vstock/${f}`, it.answer, [it.answer]]); } catch {}
}
for (const e of JSON.parse(readFileSync(D + 'web-desk/vscript/회차.json', 'utf8')).episodes)
  for (const q of e.questions || []) if (q.answer) taken.push([`영상${e.no}`, q.answer, [q.answer]]);
writeFileSync(H + '_taken.tsv', taken.map(([s, a, f]) => `${s}\t${a}\t${[...new Set(f)].join('|')}`).join('\n') + '\n');
// web 에 올릴 목록: 대표 표기(다른 표기 몇 개) · 가나다 · 같은 대표는 한 줄
const byMain = new Map();
for (const [, a, f] of taken) { const k = a.trim(); if (!k) continue; const s = byMain.get(k) || new Set(); for (const x of f) if (x && x !== k) s.add(x); byMain.set(k, s); }
const lines = [...byMain].sort((x, y) => x[0].localeCompare(y[0], 'ko')).map(([a, s]) => a);
writeFileSync(H + '_있는정답.txt', `# 이미 게임에 있는 정답 ${lines.length}개 (${new Date().toISOString().slice(0, 10)} · 이 목록의 정답과 같은 대상은 재료로 만들지 않는다 · 다른 표기도 같은 대상이면 겹침)\n` + lines.join('\n') + '\n');

// 2. 조각
const MID = {};
for (const l of readFileSync(D + 'data/pipeline/audit/g107-raw/categories.txt', 'utf8').split('\n').filter(Boolean)) {
  const [maj, mid] = l.replace(/ \(\d+\)$/, '').split(' > '); (MID[maj] ||= []).push(mid);
}
const MAJ = ['한국', '문화·예술', '인문·사회', '자연과학', '스포츠·게임', '생활·상식', '기술·의학'];
const LANES = [
  { lane: 'easy', grade: 1, label: '쉬움(등급 1)' },
  { lane: 'hard', grade: 5, label: '어려움(등급 5)' },
  { lane: 'hard', grade: 4, label: '어려움(등급 4)' },
];
const PER = 10, KEY0 = 6001;
mkdirSync(H + '보낼것', { recursive: true }); mkdirSync(H + '받은것', { recursive: true });
const plan = [];
let k = 0;
for (const L of LANES) for (const maj of MAJ) plan.push({ ...L, maj, n: ++k });
const from = +(process.argv[process.argv.indexOf('--from') + 1] || 1) || 1;
for (const p of plan) {
  const nn = String(p.n + from - 1).padStart(2, '0');
  const key = KEY0 + (p.n + from - 2) * 20;
  const t = `조각 ${nn} — 새 문항 재료 ${PER}개(지시서대로 · chunk = "${nn}")

- 길: ${p.label} · "lane": "${p.lane}" · "grade": ${p.grade}
- 대분류: ${p.maj}
- 중분류(이 가운데서 고르게 — 한 중분류에 셋 넘게 몰지 않는다): ${MID[p.maj].join(' · ')}
- key: n${key} 부터 차례로(n${key}, n${key + 1}, …)
- 겹침: 프로젝트의 "_있는정답.txt" 에 있는 정답(다른 표기 포함)과 같은 대상은 만들지 않는다.
`;
  writeFileSync(H + `보낼것/조각-${nn}.txt`, t);
  if (!existsSync(H + `받은것/결과-${nn}.json`)) writeFileSync(H + `받은것/결과-${nn}.json`, '');
}
console.log(`있는 정답 ${lines.length}줄(표기 ${taken.length}) · 조각 ${plan.length}개 × ${PER} = ${plan.length * PER}`);
