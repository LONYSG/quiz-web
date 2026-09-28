#!/usr/bin/env node
// =============================================================================
// 해설 감사 — "정답을 알려 주는 것만이 목적인 문장" 찾기 (R023 작업 A)
//
// ★ 왜: 해설은 정답 공개와 **함께** 5초 동안 보인다. 정답은 이미 화면에 있다.
//   "아연입니다. 철보다 먼저…" 의 앞 문장은 5초를 낭비한다.
//
// ★★ 이 스크립트는 **고치지 않는다.** 분류만 한다. 수정은 사람이 목록을 읽은 뒤 따로 한다
//   (R023 수정 기록: data/pipeline/audit/r023-explanation-fix.json).
//   R020 변형 정리 때처럼 목록 → 표본 확인 → 수정 순서를 지킨다.
//
// 분류
//   drop      정답 알림 문장만 있다 → 문장을 지운다. 남는 해설이 없으면 empty 로 따로 센다
//   prefix    "정답 알림 문장 + 다른 문장" → 앞 문장만 지운다
//   keep      정답이 주어로 나와 새 정보를 준다 ("아연은 철보다…") → 손대지 않는다
//   unsure    정답 알림처럼 보이지만 정보가 섞였다 ("바로 아연입니다" 뒤에 이유 등) → 표시만
//
// 사용법
//   node scripts/explanation-audit.mjs [--out <json>]
// =============================================================================

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { normalizeAnswer } from '../shared/dist/index.js';
import { generatedDir } from '../pipeline/lib/seedstore.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* 기본값 */ }
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

// ── 문장 나누기: 마침표·물음표·느낌표 뒤 공백 기준 (숫자 소수점은 공백이 없어 안 잘린다)
export const splitSentences = (t) => (t ?? '').split(/(?<=[.!?。])\s+/).map((s) => s.trim()).filter(Boolean);

const COPULA = '(?:입니다|이다|다|예요|이에요|에요|랍니다|이랍니다|죠|이죠|지요|이지요)';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 한 문장이 "정답 알림" 인가
//   ★ 정답(또는 변형) 을 빼고 남는 것이 조사·계사·'정답은' 뿐이면 알림 문장이다
export function classifySentence(sent, answers) {
  const s = sent.replace(/[.!?。]+$/, '').trim();
  for (const a of answers) {
    if (!a) continue;
    const A = esc(a.trim());
    const pure = [
      new RegExp(`^(?:정답은|답은|정답:|답:)?\\s*[「'"“]?${A}[」'"”]?\\s*(?:\\([^)]*\\))?\\s*${COPULA}?$`),
      new RegExp(`^(?:정답은|답은)\\s*[「'"“]?${A}[」'"”]?.*${COPULA}$`),
      new RegExp(`^[「'"“]?${A}[」'"”]?\\s*(?:이|가)\\s*정답${COPULA}?$`),
    ];
    if (pure[0].test(s) || pure[2].test(s)) return 'pure';
    if (pure[1].test(s)) return s.length <= a.length + 12 ? 'pure' : 'mixed';
    // "바로 아연입니다" / "그것이 아연입니다" — 거의 알림이지만 수식어가 붙었다
    if (new RegExp(`^(?:바로|그것이|이것이|이것은|그것은|이 (?:물질|원소|사람|작품|나라|곳)은)\\s*[「'"“]?${A}[」'"”]?\\s*${COPULA}$`).test(s)) return 'mixed';
  }
  return null;
}

export function classify(expl, answers) {
  const sents = splitSentences(expl);
  if (!sents.length) return { kind: 'none', sents };
  const tags = sents.map((x) => classifySentence(x, answers));
  if (!tags.some(Boolean)) return { kind: 'keep', sents, tags };
  if (tags.includes('mixed')) return { kind: 'unsure', sents, tags };
  const rest = sents.filter((_, i) => tags[i] !== 'pure');
  if (!rest.length) return { kind: 'drop', sents, tags, fixed: '' };
  // ★ 알림 문장이 첫 문장이 아니면(중간·끝) 문장 연결이 깨질 수 있다 → 표시만
  if (tags.findIndex(Boolean) !== 0) return { kind: 'unsure', sents, tags, fixed: rest.join(' '), note: '알림 문장이 첫 문장이 아니다' };
  return { kind: 'prefix', sents, tags, fixed: rest.join(' ') };
}

async function collect() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const rows = (await c.query(`
    SELECT q.id, q.display_answer, q.explanation, q.source_id, s.name AS source_name
      FROM questions q LEFT JOIN sources s ON s.id = q.source_id WHERE q.is_active`)).rows;
  const ans = (await c.query('SELECT question_id, answer_text FROM question_answers')).rows;
  await c.end();
  const byQ = new Map();
  for (const a of ans) { const k = String(a.question_id); (byQ.get(k) ?? byQ.set(k, []).get(k)).push(a.answer_text); }
  const items = rows.map((r) => ({ where: `db:${r.id}`, source: r.source_name ?? r.source_id, answer: r.display_answer,
    answers: [...new Set([r.display_answer, ...(byQ.get(String(r.id)) ?? [])])], explanation: r.explanation }));
  // ★ R022 (미적재 파일)
  const dir = generatedDir('r022');
  for (const f of (await readdir(dir)).filter((x) => x.endsWith('.json') && !x.startsWith('_'))) {
    const d = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
    for (const it of d.items) {
      const q = it.question; if (!q?.ok) continue;
      items.push({ where: `r022:${it.seedId}`, file: f, source: 'r022 파일', answer: q.answer, answers: [q.answer, ...(q.acceptedAnswers ?? [])], explanation: q.explanation });
    }
  }
  return items;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('explanation-audit.mjs')) {
  {
    const items = await collect();
    const out = { generatedAt: new Date().toISOString(), counts: {}, bySource: {}, items: [] };
    for (const it of items) {
      const r = classify(it.explanation, it.answers);
      out.counts[r.kind] = (out.counts[r.kind] ?? 0) + 1;
      const bs = (out.bySource[it.source] ??= {}); bs[r.kind] = (bs[r.kind] ?? 0) + 1;
      if (r.kind !== 'keep' && r.kind !== 'none') out.items.push({ ...it, kind: r.kind, fixed: r.fixed ?? null, note: r.note ?? null, tags: r.tags });
    }
    console.log('[해설 감사] 대상', items.length, JSON.stringify(out.counts));
    for (const [s, v] of Object.entries(out.bySource)) console.log('  ', s.padEnd(14), JSON.stringify(v));
    const OUT = opt('--out');
    if (OUT) await writeFile(OUT, JSON.stringify(out, null, 1) + '\n', 'utf8');
  }
}
