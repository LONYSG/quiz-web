#!/usr/bin/env node
// =============================================================================
// ★ R088 (D-345 · 13 CV-173 ④) — 정규화 영향 측정: normalizeAnswer 에 콜론 · 하이픈 · 아포스트로피 지우기를 넣으면?
//
//   node scripts/normalize-impact.mjs        ← 읽기만(DB 는 SELECT · 파일은 읽기) → 콘솔 + tmp/normalize-impact.md
//   DATABASE_URL 기본 = 실 quizweb(읽기만 — 활성 문항의 정답 · 변형)
//
// ★ 이 라운드는 재기만 한다(고치지 않는다). 잣대:
//   ① 퀴즈: 활성 문항의 정답 · 변형 중 열쇠가 바뀌는 것 · **같은 문항 안**에서 새로 같아지는 쌍(판정상 무해 — 같은 정답) · 문항 사이 새 겹침(판정과 무관 · 참고)
//   ② 주제 세트(data/minigame/topics 전부): **같은 세트 안 서로 다른 항목**의 열쇠(이름 · 변형)가 새로 같아지는 쌍 — 이것이 0 이어야 넣을 수 있다
//   ③ 경험 · 근접 오답 등 다른 쓰임은 재지 않는다(같은 함수라 판정이 넓어지기만 한다)
// =============================================================================
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { normalizeAnswer } = await import('../shared/dist/index.js');
/** 후보: 지금 정규화 뒤 콜론 · 하이픈 · 아포스트로피(정규화가 한 꼴로 모은 뒤) 지움 */
const N1 = (s) => normalizeAnswer(s);
const N2 = (s) => normalizeAnswer(s).replace(/[:\-']/g, '');

const url = process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';
const db = new pg.Client({ connectionString: url });
await db.connect();
const rows = (
  await db.query(`SELECT q.id::text qid, a.answer_text t FROM questions q JOIN question_answers a ON a.question_id = q.id WHERE q.is_active ORDER BY q.id, a.id`)
).rows;
await db.end();

// ① 퀴즈
const byQ = new Map();
for (const r of rows) {
  let a = byQ.get(r.qid);
  if (!a) byQ.set(r.qid, (a = []));
  a.push(r.t);
}
let changed = 0;
const changedEx = [];
let inQ = 0;
const n2Owner = new Map(); // N2 → Set(qid)
const n1Owner = new Map();
for (const [qid, list] of byQ) {
  const k1 = new Set(list.map(N1));
  const k2 = new Set(list.map(N2));
  for (const t of list) {
    if (N1(t) !== N2(t)) {
      changed += 1;
      if (changedEx.length < 12) changedEx.push(`#${qid} ${t}`);
    }
  }
  if (k2.size < k1.size) inQ += k1.size - k2.size;
  for (const k of k1) (n1Owner.get(k) ?? n1Owner.set(k, new Set()).get(k)).add(qid);
  for (const k of k2) (n2Owner.get(k) ?? n2Owner.set(k, new Set()).get(k)).add(qid);
}
let crossNew = 0;
const crossEx = [];
for (const [k, qs] of n2Owner) {
  if (qs.size < 2) continue;
  // 이 N2 열쇠를 공유하는 문항들이 N1 에서는 같은 열쇠를 공유하지 않았던가
  const before = n1Owner.get(k);
  if (before && before.size >= qs.size) continue;
  crossNew += 1;
  if (crossEx.length < 8) crossEx.push(`${k} ← #${[...qs].slice(0, 4).join(' #')}`);
}

// ② 주제 세트
const dir = path.join(ROOT, 'data/minigame/topics');
const setRows = [];
let setPairs = 0;
const setEx = [];
let setChanged = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const t = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
  const own1 = new Map();
  const own2 = new Map();
  let ch = 0;
  for (const it of t.items) {
    for (const s of [it.name, ...(it.variants ?? [])]) {
      const a = N1(s);
      const b = N2(s);
      if (a !== b) ch += 1;
      (own1.get(a) ?? own1.set(a, new Set()).get(a)).add(it.id);
      (own2.get(b) ?? own2.set(b, new Set()).get(b)).add(it.id);
    }
  }
  let pairs = 0;
  for (const [k, ids] of own2) {
    if (ids.size < 2) continue;
    const before = own1.get(k);
    if (before && before.size >= ids.size) continue;
    pairs += 1;
    if (setEx.length < 12) setEx.push(`${t.topic}: ${k} ← ${[...ids].join(' · ')}`);
  }
  setChanged += ch;
  setPairs += pairs;
  if (ch || pairs) setRows.push(`| ${t.topic} | ${t.status} | ${ch} | ${pairs} |`);
}

const md = [
  '# 정규화 영향 측정 — 콜론 · 하이픈 · 아포스트로피 지우기 (R088 · CV-173 ④)',
  '',
  `DB ${url.split('/').pop()} · 활성 문항 ${byQ.size} · 정답 · 변형 ${rows.length}`,
  '',
  '| 잣대 | 수 |',
  '|---|---|',
  `| 퀴즈 — 열쇠가 바뀌는 정답 · 변형 | ${changed} |`,
  `| 퀴즈 — 같은 문항 안에서 새로 같아지는 쌍(무해) | ${inQ} |`,
  `| 퀴즈 — 문항 사이 새 겹침(판정과 무관 · 참고) | ${crossNew} |`,
  `| 주제 세트 — 열쇠가 바뀌는 이름 · 변형 | ${setChanged} |`,
  `| ★ 주제 세트 — 같은 세트 안 **다른 항목끼리** 새로 같아지는 쌍 | ${setPairs} |`,
  '',
  '바뀌는 정답 예: ' + changedEx.join(' / '),
  '',
  '문항 사이 새 겹침 예: ' + (crossEx.join(' / ') || '없음'),
  '',
  '주제 세트 새 겹침 예: ' + (setEx.join(' / ') || '없음'),
  '',
  '| 세트 | status | 바뀌는 열쇠 | 새 겹침 |',
  '|---|---|---|---|',
  ...setRows,
  '',
].join('\n');
mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
writeFileSync(path.join(ROOT, 'tmp', 'normalize-impact.md'), md);
console.log(md.split('\n').slice(0, 16).join('\n'));
console.log('→ tmp/normalize-impact.md');
