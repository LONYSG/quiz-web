// web-desk/newq — 조각 새 방식(2026-11-27 · 찬종 고름): 조각 하나 = 소분류 2개 + 그 칸에 이미 있는 정답을 조각 안에
//   까닭: 대분류 단위 조각은 web 이 대표 개념부터 떠올려 후보 320개 중 300개가 겹쳤다(32~41). 8,524줄 목록은 web 이 다 대조 못 한다.
//   node web-desk/newq/_build2.mjs --plan <plan.json>   plan = [{ "nn": "43", "lane": "easy", "grade": 1, "subs": ["대 > 중 > 소", "…"] }, …]
//   node web-desk/newq/_build2.mjs --sparse [N]          빈 소분류 N개(기본 40)를 활성 정답 수 적은 차례로 찍기(고를 때 보기)
//   DB 는 읽기만(quizweb · 활성 + 꺼진 것). 결과 파일(받은것/결과-NN.json)은 없을 때만 빈 채로 만든다. _check.mjs 는 그대로(새재료-(59+NN)).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
const D = 'C:/work/quiz-web/';
const H = D + 'web-desk/newq/';
const psql = (sql) => execFileSync('psql', ['-h', 'localhost', '-p', '5434', '-U', 'quiz', '-d', 'quizweb', '-At', '-F', '\t'], {
  input: sql, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, PGPASSWORD: 'quizlocal', PGCLIENTENCODING: 'UTF8' } }).trim();
const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : (process.argv[i + 1] ?? ''); };

const rows = psql(`select g.name_ko, m.name_ko, s.name_ko, q.is_active, q.display_answer
  from categories s join categories m on m.id = s.parent_id join categories g on g.id = m.parent_id
  left join questions q on q.category_id = s.id where s.level = 3 order by 1, 2, 3, q.display_answer;`).split('\n');
const subs = new Map(); // "대 > 중 > 소" → { act, answers[] }
for (const l of rows) {
  const [g, m, s, act, ans] = l.split('\t'); const k = `${g} > ${m} > ${s}`;
  const o = subs.get(k) || { act: 0, answers: [] }; if (act === 't') o.act++; if (ans) o.answers.push(ans + (act === 't' ? '' : '(꺼짐)')); subs.set(k, o);
}

// 아직 DB 에 없는 새재료(sub 가 적힌 것 · 조각 43 부터)도 그 칸의 목록에 — 시범 칸을 다시 팔 때 같은 것을 또 내지 않게
const T = D + 'web-desk/tone/보낼것/';
for (const f of readdirSync(T).filter((f) => /^새재료-\d+\.json$/.test(f))) {
  let j; try { j = JSON.parse(readFileSync(T + f, 'utf8')); } catch { continue; }
  for (const it of j.items || []) {
    if (!it.sub) continue; const k = `${it.major} > ${it.mid} > ${it.sub}`; const o = subs.get(k); if (o) o.answers.push(it.answer + '(새 카드 대기)');
  }
}

if (process.argv.includes('--sparse')) {
  const N = +(arg('--sparse') || 40) || 40;
  for (const [k, o] of [...subs].sort((a, b) => a[1].act - b[1].act).slice(0, N)) console.log(`${String(o.act).padStart(3)}  ${k}`);
  process.exit(0);
}

const plan = JSON.parse(readFileSync(arg('--plan'), 'utf8'));
const GRADE = { 1: '쉬움(등급 1) — 친구들 대부분이 들어 봤거나, 들으면 "아 그거!" 하는 것', 4: '어려움(등급 4)', 5: '어려움(등급 5)' };
for (const p of plan) {
  const key = 6001 + (+p.nn - 1) * 20;
  const parts = p.subs.map((k) => { const o = subs.get(k); if (!o) throw new Error(`없는 소분류: ${k}`); return [k, o]; });
  const majs = new Set(parts.map(([k]) => k.split(' > ')[0]));
  const t = `조각 ${p.nn} — 새 문항 재료 10개(지시서대로 · chunk = "${p.nn}") · ★ 새 방식: 소분류 두 칸만 판다
- 길: ${GRADE[p.grade]} · "lane": "${p.lane}" · "grade": ${p.grade}
- 칸(이 두 소분류에서만 · 반씩 비슷하게):
${parts.map(([k, o]) => `  · ${k}  (지금 게임에 ${o.act}개)`).join('\n')}
- "major" = 칸의 첫 이름 · "mid" = 둘째 이름 · ★ "sub" = 셋째 이름(소분류)을 재료마다 더 적는다.
- key: n${key} 부터 차례로(n${key}, n${key + 1}, …)
- ★ 이 칸에 이미 있는 정답 — 이것과 같은 대상(다른 표기 · 영어 이름 포함)은 만들지 않는다. 프로젝트의 "_있는정답.txt"(전체 목록)도 그대로 피한다.
${parts.map(([k, o]) => `  · ${k.split(' > ')[2]}: ${o.answers.length ? o.answers.join(' · ') : '(없음)'}`).join('\n')}
- 칸이 좁아도 기준은 그대로다: 어려운 것은 이름을 몰라도 "오~ 이런 개념이" 하는 배울 가치가 있는 것 — 자잘한 사람 이름 · 작은 지명 · 마니아만 아는 것은 내지 않는다. 쉬운 것은 정말 널리 아는 것만. 모자라면 10개를 못 채워도 된다.
`;
  writeFileSync(H + `보낼것/조각-${p.nn}.txt`, t);
  if (!existsSync(H + `받은것/결과-${p.nn}.json`)) writeFileSync(H + `받은것/결과-${p.nn}.json`, '');
  console.log(`조각-${p.nn} · ${p.lane} ${p.grade} · ${parts.map(([k, o]) => `${k.split(' > ')[2]}(${o.act})`).join(' + ')} · 대분류 ${[...majs].join('/')}`);
}
