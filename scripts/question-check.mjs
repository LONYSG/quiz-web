#!/usr/bin/env node
// =============================================================================
// G037 — 질문 길이 기계 검사(V038 CV-161 · 15 §3-1) — 세기만 한다(고치지 않는다 · DB 읽기만)
//   활성 문항 전부의 question_text 를 문장으로 나눠:
//     over70   문장 하나가 70자 넘음          over90   문장 하나가 90자 넘음(심함)
//     over240  전체 240자 넘음                sents1 · sents5  한 문장(옛 "…것은?" 꼴 — 짧으면 정상 · 수만) · 5문장 넘음
//     firstQ   첫 문장이 '?' 로 끝나는데 문장이 둘 이상(종류 단서 없이 바로 묻고 덧붙임 — 추정)
//   ★ 문장 나누기: 마침표·물음표·느낌표 뒤 공백. 단 따옴표·괄호 안의 마침표 · 이니셜(Y. A.) · 약어(St. · Dr.) · 숫자(3. 1) 에서는 나누지 않는다.
//     기계 나누기(단순)와 결과가 다른 문항은 "사람 눈 확인" 목록(eye)으로 따로 낸다(G035 ④ 인용문 오탐).
//   출력: data/pipeline/audit/question-check-<YYYY-MM-DD>.json (수 · 등급별 · 알가치별 · id 목록) · 화면엔 수만
// 사용: node scripts/question-check.mjs [--ids 1,2,3] [--no-write]     (npm run question:check)
// =============================================================================
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(path.join(ROOT, '.env'));
const L = (s) => [...(s ?? '')].length;
const OPEN = { "'": "'", '"': '"', '‘': '’', '“': '”', '「': '」', '『': '』', '(': ')', '《': '》', '〈': '〉' };

/** 단순 나누기 — 끝 문자 뒤 공백 */
export const naiveSplit = (s) => String(s).split(/(?<=[.?!])\s+/).filter(Boolean);

/** 따옴표·괄호 안 · 이니셜 · 약어 · 숫자에서는 나누지 않는 나누기 */
export function smartSplit(s) {
  const t = String(s); const out = []; let start = 0; const stack = [];
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (stack.length && ch === stack.at(-1)) { stack.pop(); continue; }
    if (OPEN[ch] && !(ch === "'" && /[A-Za-z]/.test(t[i - 1] ?? '') && /[A-Za-z]/.test(t[i + 1] ?? ''))) { if (ch === "'" || ch === '"') { if (stack.at(-1) === ch) { stack.pop(); continue; } } stack.push(OPEN[ch]); continue; }
    if (!/[.?!]/.test(ch) || !/\s/.test(t[i + 1] ?? '')) continue;
    if (stack.length) continue;
    const before = t.slice(Math.max(0, i - 4), i);
    if (ch === '.' && (/(^|[\s(])[A-Z]$/.test(before) || /(^|\s)(St|Dr|Mr|Mrs|Ms|Jr|Sr|vs|No|Vol|etc)$/.test(before) || /\d$/.test(before) && /^\s\d/.test(t.slice(i + 1, i + 3)))) continue;
    out.push(t.slice(start, i + 1).trim()); start = i + 1;
  }
  if (t.slice(start).trim()) out.push(t.slice(start).trim());
  return out;
}

export function checkQuestion(text) {
  const ss = smartSplit(text); const lens = ss.map(L);
  const r = { len: L(text), sents: ss.length, lens, over70: lens.some((x) => x > 70), over90: lens.some((x) => x > 90), over240: L(text) > 240, sents1: ss.length < 2, sents5: ss.length > 4, firstQ: ss.length >= 2 && /\?$/.test(ss[0]) };
  const nv = naiveSplit(text).map(L);
  r.eye = nv.length !== ss.length && (nv.some((x) => x > 70) !== r.over70 || (nv.length < 2) !== r.sents1 || (nv.length > 4) !== r.sents5 || nv.length !== ss.length);
  return r;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/question-check.mjs')) {
  const a = process.argv.slice(2); const ii = a.indexOf('--ids'); const only = ii >= 0 ? a[ii + 1].split(',').map(Number) : null;
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
  try {
    const rows = (await c.query(`select id::int, question_text, difficulty_score g, worth w from questions where is_active ${only ? 'and id = any($1::bigint[])' : ''} order by id`, only ? [only] : [])).rows;
    const K = ['over70', 'over90', 'over240', 'sents1', 'sents5', 'firstQ', 'eye']; const ids = Object.fromEntries(K.map((k) => [k, []]));
    const by = { grade: {}, worth: {} };
    for (const r of rows) {
      const x = checkQuestion(r.question_text);
      for (const k of K) if (x[k]) ids[k].push(r.id);
      if (x.over70 || x.over90) for (const [dim, v] of [['grade', r.g], ['worth', r.w]]) { const b = (by[dim][v ?? '-'] ??= { over70: 0, over90: 0 }); if (x.over70) b.over70++; if (x.over90) b.over90++; }
    }
    const counts = Object.fromEntries(K.map((k) => [k, ids[k].length]));
    const date = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    console.log(`[question-check] 활성 ${rows.length} · 문장 70자 넘음 ${counts.over70} · 90자 넘음 ${counts.over90} · 240자 넘음 ${counts.over240} · 한 문장 ${counts.sents1} · 5문장 넘음 ${counts.sents5} · 첫 문장 '?' ${counts.firstQ} · 사람 눈 확인 ${counts.eye}`);
    console.log(`  등급별(70 · 90) ${JSON.stringify(by.grade)} · 알가치별 ${JSON.stringify(by.worth)}`);
    if (!a.includes('--no-write') && !only) {
      const f = path.join(ROOT, `data/pipeline/audit/question-check-${date}.json`);
      writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), round: 'G037', active: rows.length, rule: '문장 70 · 한 문장 90 · 전체 240 · 2~4문장 · 첫 문장 ? — 세기만(15 §3-1 · V038 CV-161)', counts, by, ids }, null, 1) + '\n');
      console.log(`  → ${path.relative(ROOT, f)}`);
    }
  } finally { await c.end(); }
}
