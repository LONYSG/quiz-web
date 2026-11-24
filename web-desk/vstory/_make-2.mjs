// 조각 08~12 만들기(설계 2026-11-24 밤) — 난이도 2 · 5 를 채운다(1~7 조각은 1 · 3 · 4 뿐이었다).
//   난이도 2 = vstock 실마리 · 난이도 5 = 게임 DB(활성 · 승인)의 질문 · 해설을 실마리로. 한 조각 정답 셋(Sonnet 이 길어서 멈추지 않게).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const D = 'C:/work/quiz-web/web-desk/';
const stock = new Map();
for (const f of readdirSync(D + 'vstock/받은것')) { try { for (const it of JSON.parse(readFileSync(D + 'vstock/받은것/' + f, 'utf8')).items) stock.set(it.answer, it); } catch {} }
const db = (a) => {
  const out = execFileSync('psql', ['-h', 'localhost', '-p', '5434', '-U', 'quiz', '-d', 'quizweb', '-At', '-F', '\t'], { input: `select q.question_text, q.difficulty_score, coalesce(c.name_ko,''), coalesce(q.explanation,'') from questions q left join categories c on c.id=q.category_id where q.is_active and q.status='approved' and q.display_answer = '${a.replace(/'/g, "''")}' order by q.id limit 1;`,
    encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'quizlocal', PGCLIENTENCODING: 'UTF8' } }).trim();
  if (!out) return null;
  const [question, difficulty, topic, explanation] = out.split('\t');
  return { question, difficulty, topic, explanation };
};
const CH = [
  ['로봇', '나이키', '병마용'],
  ['만유인력', '파리지옥', '문어'],
  ['계획적 진부화', '루퍼트 왕자의 눈물', '주석 페스트'],
  ['헤이플릭 한계', '글라스 하모니카', '아나모르포시스'],
  ['제멜바이스', '스티븐 브래드버리', '아쿠아파바'],
];
const miss = [];
CH.forEach((c, i) => {
  const no = String(i + 8).padStart(2, '0');
  let t = `조각 ${no} — 정답 셋의 해설 소재를 찾는다(지시서대로 · chunk = "${no}")\n\n`;
  c.forEach((a, k) => {
    const s = stock.get(a) ?? db(a); if (!s) miss.push(a);
    t += `[${'abc'[k]}] 정답: ${a}\n주제: ${s?.topic ?? ''} · 난이도 ${s?.difficulty ?? ''}\n질문(참고): ${s?.question ?? ''}\n실마리(전에 찾아 둔 짧은 이야기 · 또는 게임 문항의 해설 — 출발점일 뿐이다 · 문서로 다시 확인할 것):\n${s?.explanation ?? '(없음)'}\n\n`;
  });
  writeFileSync(D + `vstory/보낼것/조각-${no}.txt`, t);
  const r = D + `vstory/받은것/결과-${no}.json`; if (!existsSync(r)) writeFileSync(r, '');
});
console.log('조각 08~12 · 실마리 없는 정답:', miss.join(' · ') || '없음');
