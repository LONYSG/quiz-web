#!/usr/bin/env node
// G037 — V038 재정비 2묶음 반영(활성 문항 고침 · 알가치·등급 안 바꿈)
//   step Q 질문 127(GEN 재독 뒤 fix_text) · H 힌트 다시(flags) · V 변형 · 표시 정답(7232) · F 사실(웹 재확인) · C crossans 54 중 받은 것(V038 제안 그대로)
//   + K 분야(category_id — lib 밖 · 결정 json 의 category · 같은 되돌리기 파일 steps.K)
//   입력 audit/g037-decisions.json · 되돌리기 audit/g037-undo.json
//   사용 node scripts/g037-apply-active.mjs [--step Q,H,V,F,C] [--apply | --undo [--dry-run]]   (기본 = 확인만) · 몸통 scripts/g033-apply-lib.mjs(G033 그대로)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli } from './g033-apply-lib.mjs';
import { connect, guardNoOpenGames } from './g023-common.mjs';

const AUD = (f) => path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'data/pipeline/audit', f);
const a = process.argv;
if (!a.includes('--step')) a.push('--step', 'Q,H,V,F,C');
const mode = a.includes('--undo') ? (a.includes('--dry-run') ? 'undo-dry' : 'undo') : a.includes('--apply') ? 'apply' : 'dry';
await cli('G037', 'g037-decisions.json', 'g037-undo.json', 'G037 Q·H·V·F·C — V038 질문 재정비 127 + flags + crossans 54 — --undo');

// K — 분야(category_id): 지금 값이 before 일 때만 · 한 트랜잭션 · 되돌리기 steps.K
const K = Object.entries(JSON.parse(readFileSync(AUD('g037-decisions.json'), 'utf8')).category ?? {});
if (K.length && !process.exitCode) {
  const c = await connect();
  try {
    const cur = new Map((await c.query('select id::int, category_id::int from questions where id = any($1::bigint[])', [K.map(([id]) => +id)])).rows.map((r) => [r.id, r.category_id]));
    let u; try { u = JSON.parse(readFileSync(AUD('g037-undo.json'), 'utf8')); } catch { u = { round: 'G037', steps: {} }; }
    const doneRows = u.steps?.K?.rows ?? [];
    if (mode === 'undo' || mode === 'undo-dry') {
      if (mode === 'undo') await guardNoOpenGames(c, 'G037 K undo');
      await c.query('begin'); let n = 0;
      for (const r of doneRows) n += (await c.query('update questions set category_id=$2 where id=$1 and category_id=$3', [r.id, r.before, r.after])).rowCount;
      await c.query(mode === 'undo' && n === doneRows.length ? 'commit' : 'rollback');
      console.log(`[G037 K undo] ${mode === 'undo' ? '되돌렸다' : '확인만'} ${n}/${doneRows.length}`);
    } else {
      const todo = K.filter(([id, [to]]) => cur.get(+id) !== to);
      console.log(`[G037 K] 분야 ${K.length} · 쓸 ${todo.length} · 이미 됨 ${K.length - todo.length} — ${todo.map(([id, [to]]) => `${id} ${cur.get(+id)}→${to}`).join(' · ')}`);
      if (mode === 'apply' && todo.length) {
        const at = await guardNoOpenGames(c, 'G037 K'); await c.query('begin'); const rows = []; let n = 0;
        for (const [id, [to, why]] of todo) { n += (await c.query('update questions set category_id=$2, updated_at=now() where id=$1 and category_id=$3', [+id, to, cur.get(+id)])).rowCount; rows.push({ id: +id, field: 'category_id', before: cur.get(+id), after: to, step: 'K', cv: 'CV-161', why }); }
        if (n !== todo.length) { await c.query('rollback'); console.error('★ K 수 다름 — 되돌림'); process.exitCode = 1; }
        else { await c.query('commit'); u.steps.K = { at, rows: [...doneRows, ...rows] }; writeFileSync(AUD('g037-undo.json'), JSON.stringify(u, null, 1) + '\n'); console.log(`[G037 K] 썼다 ${n}`); }
      }
    }
  } finally { await c.end(); }
}
