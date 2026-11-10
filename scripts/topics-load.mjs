#!/usr/bin/env node
// =============================================================================
// ★★★ 주제 세트 적재 (R080 · D-330 · D-337 · docs/18 §9 · 0031)
//
//   node scripts/topics-load.mjs                  ← 기본 dry-run: 읽기 · 검사 · 표만 (DB 를 쓰지 않는다)
//   node scripts/topics-load.mjs --apply          ← 쓰기 (topic_sets · topic_items)
//   [--allow-candidate]  candidate 세트도 넣는다 — ★ 검사 DB(quizweb_test · quizweb_dev) 또는 QUIZ_DEV_SERVER 일 때만 받는다(실 quizweb 은 거부)
//
// ★ 읽는 것: data/minigame/topics/*.json 전부. 파일 status 'verified'(또는 옛 'loaded') 만 넣는다 — candidate · rejected 는 넣지 않는다.
// ★ 검사: topics-check.mjs 의 checkTopic(머리 · 항목 칸 · id 꼴 · count · 세트 안 유일성 · 변형 특수문자)을 그대로 import 해 돌린다.
//   막힘이 있는 세트는 통째로 넣지 않는다(목록). ★ §9 의 label 칸(선택)은 topics-check 가 아직 모른다 → 그 막힘 하나만 여기서 푼다(문자열이면).
// ★ 멱등: 같은 topic · 같은 항목 id 는 갱신. 파일에서 빠졌거나 넣을 수 없게 된 세트 · 항목은 active=false(지우지 않는다 — 경험 기록 'topic:<slug>').
// ★ 파일은 쓰지 않는다(§9 — 적재 = topic_sets.loaded_at · 플레이 트리에서 돈다).
// ★ ops 메뉴 1(play.mjs)이 migrate · 빌드 뒤 `--apply` 로 한 번 돌린다(실패해도 서버는 뜬다 — 한 줄 경고).
// ★★ R088 (D-345 · 0034 · 18 §12 · §9) — 항목 fool · era · sub · diff · 세트 scope 도 올린다(파일에 없으면 null). 0034 전 DB 에는 옛 칸만(자동).
// ★★ R090 (D-347 · 0035) — 세트 group · optIn 도(없으면 null · false · 0035 전 DB 는 건너뜀). 머리의 모르는 칸은 버린다(올리지 않음).
//   끝 줄에 "fool n · diff n" 을 붙인다(메뉴 1 이 보인다).
// =============================================================================
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/minigame/topics');
const DEFAULT_URL = 'postgresql://quiz:quizlocal@localhost:5434/quizweb';
const LOADABLE = new Set(['verified', 'loaded']);
const TEST_DBS = new Set(['quizweb_test', 'quizweb_dev']);

/** 연결 문자열의 DB 이름 */
export function dbNameOf(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, '')) || 'postgres';
  } catch {
    return String(url).split('/').pop()?.split('?')[0] ?? '';
  }
}

/** --allow-candidate 빗장 — { ok, why } */
export function candidateGate(url, env = process.env) {
  const name = dbNameOf(url);
  if (name === 'quizweb') return { ok: false, why: `실 DB(${name})에는 candidate 를 넣지 않는다 — verified 만(docs/18 §9)` };
  if (TEST_DBS.has(name) || env.QUIZ_DEV_SERVER) return { ok: true, why: '' };
  return { ok: false, why: `--allow-candidate 는 quizweb_test · quizweb_dev(또는 QUIZ_DEV_SERVER)에서만 — 지금 DB '${name}'` };
}

/** §9 label(선택) — topics-check 가 모르는 칸이라 낸 막힘 하나만 걸러 낸다 */
export function topicProblems(checkTopic, t, file) {
  const r = checkTopic(t, file);
  const err = r.err.filter((e) => !/: 모르는 칸 label$/.test(e));
  for (const it of Array.isArray(t.items) ? t.items : []) {
    if ('label' in it && (typeof it.label !== 'string' || !it.label.trim())) err.push(`${it.id}: label 은 글(빈칸 아님)`);
  }
  if (typeof t.timeSec === 'number' && (t.timeSec < 10 || t.timeSec > 120)) err.push(`timeSec ${t.timeSec}(10~120)`);
  return err;
}

/**
 * ★ 적재 계획(순수) — 넣을 세트 · 항목 · 넣지 않는 세트(이유).
 * @param list [{ file, t }]
 */
export function planLoad(list, { allowCandidate, checkTopic }) {
  const sets = [];
  const items = [];
  const skipped = [];
  for (const { file, t } of list) {
    const slug = path.basename(file, '.json');
    const ok = LOADABLE.has(t.status) || (allowCandidate && t.status === 'candidate');
    if (!ok) {
      skipped.push({ topic: slug, why: `status ${t.status}` });
      continue;
    }
    const err = topicProblems(checkTopic, t, file);
    if (err.length) {
      skipped.push({ topic: slug, why: `형식 막힘 ${err.length} — ${err.slice(0, 3).join(' · ')}` });
      continue;
    }
    sets.push({
      topic: t.topic,
      nameKo: t.nameKo,
      kind: t.kind,
      version: Number(t.version) || 1,
      asOf: t.asOf,
      status: t.status,
      liar: t.liar,
      draw: t.draw,
      timeSec: t.timeSec,
      tags: t.tags ?? [],
      count: t.items.length,
      source: t.source ?? [],
      verify: t.verify ?? null,
      scope: typeof t.scope === 'string' && t.scope.trim() ? t.scope.trim() : null,
      // ★ R090 (0035) — 머리 group(같은 group = 추첨 한 자리) · optIn(방장 주제 고르기 기본 해제)
      group: typeof t.group === 'string' && /^[a-z][a-z0-9-]*$/.test(t.group) ? t.group : null,
      optIn: t.optIn === true,
    });
    t.items.forEach((it, i) => {
      items.push({
        id: it.id,
        topic: t.topic,
        seq: i + 1,
        name: it.name,
        label: typeof it.label === 'string' ? it.label : null,
        variants: it.variants ?? [],
        tags: it.tags ?? [],
        year: Number.isInteger(it.year) ? it.year : null,
        draw: it.draw === true,
        liar: it.liar === true,
        qid: Number.isInteger(it.qid) ? it.qid : null,
        note: typeof it.note === 'string' ? it.note : null,
        fool: Array.isArray(it.fool) && it.fool.length ? it.fool.filter((x) => typeof x === 'string' && x.trim()) : null,
        era: it.era === 'classic' || it.era === 'modern' ? it.era : null,
        sub: typeof it.sub === 'string' && it.sub.trim() ? it.sub.trim() : null,
        diff: Number.isInteger(it.diff) && it.diff >= 1 && it.diff <= 3 ? it.diff : null,
      });
    });
  }
  return { sets, items, skipped };
}

export function readTopics(dir = DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const file = path.join(dir, f);
      return { file, t: JSON.parse(readFileSync(file, 'utf8')) };
    });
}

/** ★ 쓰기(한 트랜잭션) — 넣은 세트 · 항목 · 쉬게 한 세트 · 항목 수
 *  ★ R088 — 0034 칸(fool · era · sub · diff · scope)이 있으면 같이(없는 DB 는 옛 칸만) */
export async function applyPlan(db, plan) {
  const has0034 = ((await db.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'topic_items' AND column_name = 'fool'`)).rowCount ?? 0) > 0;
  const has0035 = ((await db.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'topic_sets' AND column_name = 'opt_in'`)).rowCount ?? 0) > 0;
  await db.query('BEGIN');
  try {
    for (const s of plan.sets) {
      await db.query(
        `INSERT INTO topic_sets (topic, name_ko, kind, version, as_of, status, liar, draw, time_sec, tags, count, source, verify, loaded_at, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,$13::jsonb, now(), true)
         ON CONFLICT (topic) DO UPDATE SET name_ko=EXCLUDED.name_ko, kind=EXCLUDED.kind, version=EXCLUDED.version, as_of=EXCLUDED.as_of,
           status=EXCLUDED.status, liar=EXCLUDED.liar, draw=EXCLUDED.draw, time_sec=EXCLUDED.time_sec, tags=EXCLUDED.tags, count=EXCLUDED.count,
           source=EXCLUDED.source, verify=EXCLUDED.verify, loaded_at=now(), active=true`,
        [s.topic, s.nameKo, s.kind, s.version, s.asOf, s.status, s.liar, s.draw, s.timeSec, JSON.stringify(s.tags), s.count, JSON.stringify(s.source), s.verify === null ? null : JSON.stringify(s.verify)],
      );
    }
    if (has0034) for (const s of plan.sets) await db.query(`UPDATE topic_sets SET scope = $2 WHERE topic = $1`, [s.topic, s.scope ?? null]);
    if (has0035) for (const s of plan.sets) await db.query(`UPDATE topic_sets SET "group" = $2, opt_in = $3 WHERE topic = $1`, [s.topic, s.group ?? null, s.optIn === true]);
    // 항목은 묶어서(2,500 줄을 한 줄씩 보내지 않는다)
    const CH = 400;
    for (let i = 0; i < plan.items.length; i += CH) {
      const part = plan.items.slice(i, i + CH);
      await db.query(
        `INSERT INTO topic_items (id, topic, seq, name, label, variants, tags, year, draw, liar, qid, note, active)
         SELECT x.id, x.topic, x.seq, x.name, x.label, x.variants, x.tags, x.year, x.draw, x.liar, x.qid, x.note, true
           FROM jsonb_to_recordset($1::jsonb) AS x(id text, topic text, seq int, name text, label text, variants jsonb, tags jsonb, year int, draw boolean, liar boolean, qid int, note text)
         ON CONFLICT (id) DO UPDATE SET topic=EXCLUDED.topic, seq=EXCLUDED.seq, name=EXCLUDED.name, label=EXCLUDED.label, variants=EXCLUDED.variants,
           tags=EXCLUDED.tags, year=EXCLUDED.year, draw=EXCLUDED.draw, liar=EXCLUDED.liar, qid=EXCLUDED.qid, note=EXCLUDED.note, active=true`,
        [JSON.stringify(part)],
      );
      if (has0034)
        await db.query(
          `UPDATE topic_items t SET fool = x.fool, era = x.era, sub = x.sub, diff = x.diff
             FROM jsonb_to_recordset($1::jsonb) AS x(id text, fool jsonb, era text, sub text, diff smallint) WHERE t.id = x.id`,
          [JSON.stringify(part.map((x) => ({ id: x.id, fool: x.fool ?? null, era: x.era ?? null, sub: x.sub ?? null, diff: x.diff ?? null })))],
        );
    }
    const offSets = await db.query(`UPDATE topic_sets SET active=false WHERE active AND NOT (topic = ANY($1::text[])) RETURNING topic`, [plan.sets.map((s) => s.topic)]);
    const offItems = await db.query(`UPDATE topic_items SET active=false WHERE active AND NOT (id = ANY($1::text[])) RETURNING id`, [plan.items.map((x) => x.id)]);
    await db.query('COMMIT');
    return { sets: plan.sets.length, items: plan.items.length, offSets: offSets.rowCount ?? 0, offItems: offItems.rowCount ?? 0, has0034 };
  } catch (e) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw e;
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/topics-load.mjs')) {
  const args = process.argv.slice(2);
  const APPLY = args.includes('--apply');
  const ALLOW = args.includes('--allow-candidate');
  const url = process.env.DATABASE_URL ?? DEFAULT_URL;
  const dbName = dbNameOf(url);
  if (ALLOW) {
    const g = candidateGate(url);
    if (!g.ok) {
      console.error(`[topics-load] ★ 거부: ${g.why}`);
      process.exit(2);
    }
  }
  const { checkTopic } = await import('./topics-check.mjs');
  const plan = planLoad(readTopics(), { allowCandidate: ALLOW, checkTopic });
  const byStatus = plan.sets.reduce((m, s) => ((m[s.status] = (m[s.status] ?? 0) + 1), m), {});
  console.log(`[topics-load] ${APPLY ? '★ 쓰기(--apply)' : 'dry-run (DB 를 쓰지 않는다)'} · DB ${dbName}${ALLOW ? ' · candidate 허용' : ''}`);
  console.log(`  넣을 세트 ${plan.sets.length}(${Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join(' · ') || '없음'}) · 항목 ${plan.items.length} · 넣지 않음 ${plan.skipped.length}`);
  const blocked = plan.skipped.filter((s) => s.why.startsWith('형식'));
  for (const s of blocked) console.log(`  ★ ${s.topic}: ${s.why}`);
  if (!APPLY) process.exit(0);
  const pg = (await import('pg')).default;
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    const has = await db.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'topic_sets'`);
    if (!has.rowCount) {
      console.error('[topics-load] ★ topic_sets 표가 없다(0031 미적용) — npm run db:migrate 먼저');
      process.exitCode = 1;
    } else {
      const r = await applyPlan(db, plan);
      const verified = plan.sets.filter((s) => s.status !== 'candidate').length;
      const fool = plan.items.filter((x) => x.fool).length;
      const diff = plan.items.filter((x) => x.diff).length;
      console.log(`주제 세트 ${r.sets}(verified ${verified}) · 항목 ${r.items} · 쉬게 함 ${r.offSets + r.offItems}(세트 ${r.offSets} · 항목 ${r.offItems})${r.has0034 ? ` · fool ${fool} · diff ${diff}` : ' · (0034 전 — 제시어 칸 안 올림)'}`);
    }
  } finally {
    await db.end();
  }
}
