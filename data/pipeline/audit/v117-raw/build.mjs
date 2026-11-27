// V117 build — DB(읽기만) → targets.json · 묶음 입력(cNNN.txt · cNNN.meta.json) · 블랙 입력 · worth-instructions.md
// 실행: node data/pipeline/audit/v117-raw/build.mjs   (이미 있는 묶음 파일은 덮어쓰지 않는다 — 판정 도중 DB 가 바뀌어도 묶음이 안 흔들리게)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUD = path.join(HERE, '..');
const CH = 100;
const NL = String.fromCharCode(10);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb' });
await db.connect();

const cats = new Map((await db.query('select id,name_ko,parent_id from categories')).rows.map((r) => [r.id, r]));
const catPath = (id) => {
  const out = [];
  let c = cats.get(id);
  while (c) { out.unshift(c.name_ko); c = c.parent_id ? cats.get(c.parent_id) : null; }
  return out.join(' > ');
};

async function loadCards(where, params = []) {
  const qs = (await db.query(
    `select id,question_text,display_answer,general_hint,explanation,category_id,difficulty_score,worth
       from questions where ${where}`, params)).rows;
  const ids = qs.map((q) => q.id);
  const an = (await db.query('select question_id,answer_text,is_primary from question_answers where question_id = any($1) order by is_primary desc, id', [ids])).rows;
  const by = new Map();
  for (const a of an) { if (!by.has(a.question_id)) by.set(a.question_id, []); by.get(a.question_id).push(a); }
  return qs.map((q) => {
    const list = by.get(q.id) ?? [];
    const prim = list.find((a) => a.is_primary)?.answer_text ?? q.display_answer;
    const variants = [...new Set(list.map((a) => a.answer_text).filter((t) => t !== prim && t !== q.display_answer))];
    return { id: q.id, cat: catPath(q.category_id), q: q.question_text, a: q.display_answer, variants, hint: q.general_hint, exp: q.explanation, grade: q.difficulty_score, worth: q.worth };
  });
}

// 목록은 처음 한 번만 뽑아 얼린다(묶음 구성이 흔들리지 않게). 새로 뽑으려면 targets.json 을 지운다.
const TF = path.join(HERE, 'targets.json');
let all;
if (fs.existsSync(TF)) all = JSON.parse(fs.readFileSync(TF, 'utf8'));
else {
  all = await loadCards("status='approved' and is_active");
  all.sort((x, y) => (x.grade ?? 9) - (y.grade ?? 9) || x.id - y.id);
  fs.writeFileSync(TF, JSON.stringify(all));
}

// ── 금 표본 ──
// v028 금 20 (지시서 본문에서 파싱)
const ins = fs.readFileSync(path.join(AUD, 'v028-raw/INSTRUCTIONS.md'), 'utf8');
const goldLines = ins.split('## 금 표본 예 20')[1].split('## 읽기 기준')[0].split('\n').filter((l) => l.startsWith('- v2 **'));
const gold28 = [];
for (const l of goldLines) {
  const m = l.match(/^- v2 \*\*(\d)\*\* \(지금 (\d)\) — (.+) → 정답 (.+)$/);
  if (!m) throw new Error('gold parse: ' + l);
  gold28.push({ grade: +m[1], q: m[3], a: m[4] });
}
if (gold28.length !== 20) throw new Error('gold28 ' + gold28.length);
// 질문 글로 DB 에서 분야 · 해설 · 힌트 찾기(없으면 분야 없이)
for (const g of gold28) {
  const hit = (await loadCards('question_text = $1 limit 1', [g.q]))[0];
  g.cat = hit?.cat ?? '(분야 미상)'; g.exp = hit?.exp ?? null; g.hint = hit?.hint ?? null; g.variants = hit?.variants ?? [];
}
// anchors60 (찬종 값)
const an = fs.readFileSync(path.join(AUD, 'v029-raw/anchors60.md'), 'utf8');
const rows = [];
for (const l of an.split('\n')) {
  const c = l.split('|').map((s) => s.trim());
  if (c.length < 11 || !/^\d+$/.test(c[1])) continue;
  rows.push({ n: +c[1], id: +c[2], v2: +c[3], ans: c[4], kind: c[7], ex: c[8] === '✓', chan: +c[10] });
}
if (rows.length !== 60) throw new Error('anchors ' + rows.length);
const full = JSON.parse(fs.readFileSync(path.join(AUD, 'v029-raw/targets.json'), 'utf8')).items;
const anchorCards = [];
for (const r of rows) {
  const hit = (await loadCards('id = $1', [r.id]))[0];
  const f = full[String(r.id)];
  anchorCards.push({ ...r, cat: hit?.cat ?? '(분야 미상)', q: f.question, a: f.answer, variants: f.variants ?? [], hint: f.hint, exp: f.explanation });
}
// worth 예 20 → worth-instructions.md
const ex = anchorCards.filter((r) => r.ex);
if (ex.length !== 20) throw new Error('ex ' + ex.length);
const exLines = ex.map((r) => `- worth **${r.chan}** (${r.kind}) — ${r.q} → 정답 ${r.a}`).join('\n');
const wtpl = fs.readFileSync(path.join(AUD, 'v029-raw/INSTRUCTIONS.md'), 'utf8');
fs.writeFileSync(path.join(HERE, 'worth-instructions.md'), wtpl.replace(NL + '{{예 20}}' + NL, () => NL + exLines + NL));
const pool = anchorCards.filter((r) => !r.ex); // 40
if (pool.length !== 40) throw new Error('pool ' + pool.length);

// ── 묶음 ──
const block = (key, c) => [
  `### ${key}`,
  `분야: ${c.cat}`,
  `질문: ${c.q}`,
  `정답: ${c.a}${c.variants?.length ? '  (변형: ' + c.variants.join(' / ') + ')' : ''}`,
  `해설: ${c.exp ?? '(없음)'}`,
  `힌트: ${c.hint ?? '(없음)'}`,
  '',
].join('\n');

const nChunks = Math.ceil(all.length / CH);
let made = 0;
for (let i = 0; i < nChunks; i++) {
  const name = 'c' + String(i + 1).padStart(3, '0');
  const f = path.join(HERE, name + '.txt');
  if (fs.existsSync(f)) continue;
  const cards = all.slice(i * CH, (i + 1) * CH);
  const items = cards.map((c, j) => ({ key: `${name}-${String(j + 1).padStart(3, '0')}`, id: c.id, card: c }));
  // 금 표본 10: v028 5 + anchors60 5 (묶음마다 돌려 가며) — 카드 사이 고르게 섞음
  const g5 = [0, 1, 2, 3, 4].map((k) => gold28[(i * 5 + k) % 20]);
  const a5 = [0, 1, 2, 3, 4].map((k) => pool[(i * 5 + k) % 40]);
  const anchors = [
    ...g5.map((g, k) => ({ key: `${name}-g${k + 1}`, anchor: 'grade', gold: g.grade, card: g })),
    ...a5.map((a, k) => ({ key: `${name}-a${k + 1}`, anchor: 'worth', gold: a.chan, card: a })),
  ];
  // 고정 모양으로 섞기(묶음 번호로 결정 — 다시 만들어도 같게)
  const merged = items.slice();
  anchors.forEach((a, k) => merged.splice(Math.min(merged.length, (k * 11 + (i % 7) * 3 + 5) % (merged.length + 1)), 0, a));
  fs.writeFileSync(f, `## V117 ${name} (${merged.length}건)\n\n` + merged.map((m) => block(m.key, m.card)).join('\n'));
  fs.writeFileSync(path.join(HERE, name + '.meta.json'), JSON.stringify({
    chunk: name,
    order: merged.map((m) => m.key),
    cards: items.map((m) => ({ key: m.key, id: m.id, grade: m.card.grade, worth: m.card.worth, a: m.card.a, variants: m.card.variants })),
    anchors: anchors.map((a) => ({ key: a.key, kind: a.anchor, gold: a.gold })),
  }));
  fs.writeFileSync(path.join(HERE, name + '.blind.txt'),
    cards.map((c, j) => `${name}-${String(j + 1).padStart(3, '0')}\t${c.q.replace(/\s+/g, ' ')}`).join('\n') + '\n');
  made++;
}
console.log(JSON.stringify({ active: all.length, chunks: nChunks, made, byGrade: all.reduce((o, c) => (o[c.grade] = (o[c.grade] ?? 0) + 1, o), {}) }));
await db.end();
