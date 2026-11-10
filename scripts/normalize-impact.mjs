#!/usr/bin/env node
// =============================================================================
// ★ R088 (CV-173 ④) → ★ R090 (D-347) 넓힘 — 정규화 영향 측정: 판정 표준형(flexCanon)에 **문장부호 · 기호 전부 지우기**(stripSymbols)를 넣으면?
//
//   node scripts/normalize-impact.mjs        ← 읽기만(DB 는 SELECT · 파일은 읽기) → 콘솔 + tmp/normalize-impact.md
//   DATABASE_URL 기본 = 실 quizweb(읽기만 — 활성 문항의 정답 · 변형)
//
// 잣대(브리핑 R090 A-1):
//   ① 열쇠가 바뀌는 정답 · 변형 수(옛 표준형 R089 → 새 표준형)
//   ② ★ 같은 세트 안 **서로 다른 항목**이 새로 같아지는 쌍(문제 — 판정 맵이 그 열쇠를 뺀다 · 원꼴로만) · 노래는 같은 곡의 제목 ↔ 가수
//   ③ 지우면 빈 글 · 1자 이하가 되는 것(stripSymbols 가 지우지 않음 — 원꼴로만)
//   ④ 숫자 꼴이 바뀌는 것(소수점 · 음수 · 분수 — 남겨야 맞다 · 남았는지 확인)
//   퀴즈는 한 문항의 정답이 한 뜻이라 문항 안 겹침은 무해 · 문항 사이 겹침은 판정과 무관(참고)
// =============================================================================
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { normalizeAnswer, flexCanon, stripParens, stripArticle } = await import('../shared/dist/index.js');
/** 옛(R089) 표준형 — 괄호 · 관사 · 가운뎃점 · 마침표 · 쉼표 · 물결 */
const OLD_PUNCT = /[·・･‧∙.,，~〜～]/g;
const oldPunct = (s) => (/^[\d\s.,，]+$/.test(s) ? s.replace(/[,，]/g, '') : s.replace(OLD_PUNCT, ''));
const OLD = (s) => normalizeAnswer(oldPunct(stripArticle(stripParens(s.normalize('NFC')))));
const NEW = (s) => flexCanon(s);
const SYM = /[\p{P}\p{S}]/u;
const NUM = /\d[.\/]\d|(^|[^0-9a-z])-\d/;

const url = process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';
const db = new pg.Client({ connectionString: url });
await db.connect();
const rows = (
  await db.query(`SELECT q.id::text qid, a.answer_text t FROM questions q JOIN question_answers a ON a.question_id = q.id WHERE q.is_active ORDER BY q.id, a.id`)
).rows;
await db.end();

const stat = { changed: 0, short: 0, num: 0 };
const ex = { changed: [], short: [], num: [], pairs: [], cross: [] };
const push = (k, v, n = 14) => ex[k].length < n && ex[k].push(v);
function look(label, s) {
  const n = normalizeAnswer(s);
  const o = OLD(s);
  const w = NEW(s);
  if (o !== w) {
    stat.changed += 1;
    push('changed', `${label} ${s}`);
  }
  if ([...n].some((c) => SYM.test(c)) && w === n && n.length) {
    // 기호가 있는데 지우지 않았다 = 짧은 글 예외(1자 이하) 또는 숫자 예외
    if (NUM.test(n)) {
      stat.num += 1;
      push('num', `${label} ${s}`);
    } else {
      stat.short += 1;
      push('short', `${label} ${s}`);
    }
  } else if (NUM.test(n)) {
    stat.num += 1;
    push('num', `${label} ${s} → ${w}`);
  }
  return { o, w };
}

/** 묶음(세트 · 곡) 안 다른 항목끼리 새로 같아지는 쌍 */
function groupPairs(label, items) {
  const o = new Map();
  const w = new Map();
  for (const it of items)
    for (const s of it.forms) {
      const r = look(label, s);
      (o.get(r.o) ?? o.set(r.o, new Set()).get(r.o)).add(it.id);
      (w.get(r.w) ?? w.set(r.w, new Set()).get(r.w)).add(it.id);
    }
  let pairs = 0;
  for (const [k, ids] of w) {
    if (ids.size < 2) continue;
    const before = o.get(k);
    if (before && before.size >= ids.size) continue;
    pairs += 1;
    push('pairs', `${label}: ${k} ← ${[...ids].join(' · ')}`, 40);
  }
  return pairs;
}

// ① 퀴즈
const byQ = new Map();
for (const r of rows) (byQ.get(r.qid) ?? byQ.set(r.qid, []).get(r.qid)).push(r.t);
const before = { ...stat };
const own = new Map();
const ownOld = new Map();
for (const [qid, list] of byQ)
  for (const t of list) {
    const r = look(`#${qid}`, t);
    (own.get(r.w) ?? own.set(r.w, new Set()).get(r.w)).add(qid);
    (ownOld.get(r.o) ?? ownOld.set(r.o, new Set()).get(r.o)).add(qid);
  }
let cross = 0;
for (const [k, qs] of own) {
  if (qs.size < 2) continue;
  const b = ownOld.get(k);
  if (b && b.size >= qs.size) continue;
  cross += 1;
  push('cross', `${k} ← #${[...qs].slice(0, 4).join(' #')}`, 10);
}
const quiz = { changed: stat.changed - before.changed, short: stat.short - before.short, num: stat.num - before.num };

// ② 주제 세트
const b2 = { ...stat };
const dir = path.join(ROOT, 'data/minigame/topics');
const files = readdirSync(dir).filter((x) => x.endsWith('.json')).sort();
let setPairs = 0;
const setRows = [];
for (const f of files) {
  const t = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
  const c0 = stat.changed;
  const p = groupPairs(t.topic, t.items.map((it) => ({ id: it.id, forms: [it.name, ...(it.variants ?? [])] })));
  setPairs += p;
  if (stat.changed - c0 || p) setRows.push(`| ${t.topic} | ${t.status} | ${stat.changed - c0} | ${p} |`);
}
const topics = { changed: stat.changed - b2.changed, short: stat.short - b2.short, num: stat.num - b2.num };

// ③ 노래(곡마다 제목 ↔ 가수 — 둘 다 정답이라 무해 · 참고)
const b3 = { ...stat };
const songs = JSON.parse(readFileSync(path.join(ROOT, 'data/minigame/song/items.json'), 'utf8')).items;
let songPairs = 0;
for (const s of songs) {
  songPairs += groupPairs(s.id, [
    { id: 'title', forms: [s.title, ...(s.titleVariants ?? []), ...(s.itunes?.trackName ? [s.itunes.trackName] : [])] },
    { id: 'artist', forms: [s.artist, ...(s.artistVariants ?? []), ...(s.itunes?.artistName ? [s.itunes.artistName] : [])] },
  ]);
}
const song = { changed: stat.changed - b3.changed, short: stat.short - b3.short, num: stat.num - b3.num };

const md = [
  '# 정규화 영향 측정 — 판정 표준형에 문장부호 · 기호 전부 지우기 (R090 · D-347)',
  '',
  `DB ${url.split('/').pop()} · 활성 문항 ${byQ.size} · 정답 · 변형 ${rows.length} · 주제 파일 ${files.length} · 노래 ${songs.length}`,
  '',
  '| 대상 | 열쇠 바뀜 | ★ 같은 묶음 안 다른 항목 새 겹침 | 1자 이하라 안 지움 | 숫자 꼴 |',
  '|---|---|---|---|---|',
  `| 퀴즈(활성 정답 · 변형) | ${quiz.changed} | (문항 안 = 같은 정답 · 무해) · 문항 사이 참고 ${cross} | ${quiz.short} | ${quiz.num} |`,
  `| 주제 세트 | ${topics.changed} | ${setPairs} | ${topics.short} | ${topics.num} |`,
  `| 노래(제목 ↔ 가수 · 무해) | ${song.changed} | ${songPairs} | ${song.short} | ${song.num} |`,
  '',
  '바뀌는 열쇠 예: ' + ex.changed.join(' / '),
  '',
  '★ 새 겹침(판정 맵이 뺌 — 원꼴로만): ' + (ex.pairs.join(' / ') || '없음'),
  '',
  '1자 이하라 안 지움(원꼴로만): ' + (ex.short.join(' / ') || '없음'),
  '',
  '숫자 꼴(소수점 · 음수 · 분수 남김): ' + (ex.num.join(' / ') || '없음'),
  '',
  '문항 사이 새 겹침 예(참고): ' + (ex.cross.join(' / ') || '없음'),
  '',
  '| 세트 | status | 바뀌는 열쇠 | 새 겹침 |',
  '|---|---|---|---|',
  ...setRows,
  '',
].join('\n');
mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
writeFileSync(path.join(ROOT, 'tmp', 'normalize-impact.md'), md);
console.log(md.split('\n').slice(0, 22).join('\n'));
console.log('→ tmp/normalize-impact.md');
