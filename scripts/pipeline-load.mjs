#!/usr/bin/env node
// =============================================================================
// 승인된 문제를 DB에 적재한다 (작업 F-2)
//
// ★ 컴파일 산출물을 실행한다 (D-020). pipeline/dist 와 shared/dist 에서 import 한다.
//
// ★★ 자동으로 서비스 DB에 투입하지 않는다.
//   `approved/` 에 있고 review.status === 'approved' 인 것만 적재한다.
//   ★ 이상한 문제 하나가 실전에 나오면 그 판이 망가진다. 사람의 승인이 반드시 필요하다.
//
// ★ 적재해도 곧바로 출제되지 않는다.
//   questions.status 를 'pending_review' 로 넣고 is_active=false 로 둔다.
//   ★ 게임의 출제 조건은 status='approved' AND is_active 다.
//     즉 DB에 들어가는 것과 출제되는 것이 분리되어 있다.
//     --approve 를 주면 승인 상태로 넣는다(검수를 이미 사람이 했으므로 기본값으로 한다).
//
// ★ 중복 적재 방지 (세 겹, pipeline/README.md 4장)
//   1. 적재 전 DB 조회로 이미 있는 source_ref 를 건너뛴다
//   2. questions 의 부분 UNIQUE (source_id, source_ref)
//   3. question_answers 의 answer_norm UNIQUE
//   ★ 두 번 돌려도 안전해야 한다.
//
// 사용법
//   npm run pipeline:load                      approved/ 전체를 적재
//   npm run pipeline:load -- --dry-run         무엇이 적재될지만 보여준다
//   npm run pipeline:load -- --pending         승인 대기 상태로 넣는다 (기본은 승인)
//
// ★★ R018: 소재 기반 파이프라인(generated/<round>/)도 읽을 수 있게 했다.
//   npm run pipeline:load -- --round r017 --dry-run
//   npm run pipeline:load -- --round r017,r018 --dry-run
//   ★ --round 를 주면 approved/ 대신 data/pipeline/generated/<round>/ 를 읽는다.
//   ★★ 이 경로에는 review.status 가 없다. 대신 아래 조건을 코드가 강제한다 —
//        question.ok === true / question.discarded 가 없다 / 정답이 있다
//      사람의 승인은 **--round 를 직접 치는 행위 자체**로 본다.
//      ★ 그래서 --round 는 기본값이 없고, 주지 않으면 옛 경로로만 동작한다.
// =============================================================================

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { normalizeAnswer, NORMALIZE_VERSION } from '../shared/dist/index.js';
import { dedupeAnswers } from '../pipeline/dist/rules.js';
import { DATA_DIRS } from '../pipeline/dist/config.js';
import { findMid, findMajor } from '../pipeline/dist/categories.js';
import { resolveSubId } from '../pipeline/lib/subid.mjs';
import { generatedDir } from '../pipeline/lib/seedstore.mjs';
import { checkAnswerSet } from '../pipeline/lib/answer-rules.mjs';

/**
 * ★ 소분류 이름 → categories 테이블의 리프 key.
 *   0003 마이그레이션이 만든 key 형식과 **정확히 같아야 한다** —
 *   `L3:{midKey}#{순번}`. 형식이 어긋나면 카테고리를 찾지 못한다.
 */
function leafKeyFor(midKey, sub) {
  const mid = findMid(midKey);
  if (!mid) return null;
  const idx = mid.subs.indexOf(sub);
  if (idx < 0) return null;
  return `L3:${midKey}#${idx + 1}`;
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile?.(path.join(ROOT, '.env'));
} catch {
  /* 기본값으로 동작 */
}

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const AS_PENDING = args.includes('--pending');
/**
 * ★★ R020: 정답 표기 게이트. 기본으로 켠다.
 *   ★ 근거 — 규칙은 프롬프트에만 있었고 적재는 그것을 한 번도 확인하지 않았다.
 *     그래서 `gemini-gen` 253건 중 220건(87%)에 금지된 외국어·한자 변형이 들어왔고,
 *     그 가운데 넷이 **질문에 정답을 노출**시켰다 (R019 감사).
 *   ★ --no-gate 로 끌 수 있다. 다만 끄면 무엇을 지나치는지 반드시 눈으로 보라.
 */
const NO_GATE = args.includes('--no-gate');
const roundIdx = args.indexOf('--round');
const ROUNDS = roundIdx >= 0 ? args[roundIdx + 1].split(',').map((r) => r.trim()) : [];
/** ★ 소재 기반 파이프라인의 source_id. 0005 마이그레이션이 이 행을 넣는다 */
const SEED_SOURCE_ID = 'seed-gen';

/**
 * ★ 1~5 점수를 questions.difficulty 의 세 단계로 옮긴다.
 *   ★ 근거: 컬럼이 enum 세 값이라 그대로 넣을 수 없다. 경계는 임의가 아니라
 *     R017/R018 실측 분포(평균 3.0~3.2, 4 이상이 29~40%)를 보고 잡았다 —
 *     2 이하를 easy, 3 을 medium, 4 이상을 hard 로 두면 세 구간이 고르게 나뉜다.
 */
function difficultyBand(score) {
  if (score <= 2) return 'easy';
  if (score === 3) return 'medium';
  return 'hard';
}
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb';

// ── 1. approved/ 읽기
const approvedRoot = path.join(ROOT, DATA_DIRS.approved);
const files = [];
async function walk(dir) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full);
    else if (e.name.endsWith('.json')) files.push(full);
  }
}
// ★★ --round 를 주면 옛 approved/ 경로는 읽지 않는다.
//   ★ 근거: 두 경로를 섞으면 "무엇을 적재하려는지" 가 한눈에 보이지 않는다.
//     (source_id, source_ref) UNIQUE 가 이중 적재는 막아 주지만, 의도하지 않은 것이
//     함께 들어가는 사고는 막지 못한다. 한 번에 한 경로만 다룬다.
if (ROUNDS.length === 0) await walk(approvedRoot);

// ★ --round 로 들어온 경우에는 approved/ 가 비어 있는 것이 정상이다. 여기서 끊지 않는다.
if (ROUNDS.length === 0 && files.length === 0) {
  console.log(`[load] ${path.relative(ROOT, approvedRoot)} 에 승인 파일이 없다.`);
  console.log('[load]   검수 절차는 docs/11-DEPLOY.md 를 본다.');
  console.log('[load]   ★ 소재 기반 파이프라인을 적재하려면 --round r018 처럼 지정한다.');
  process.exit(0);
}

const items = [];

// ── 1-b. ★★ R018: generated/<round>/ 읽기 (소재 기반 파이프라인)
for (const round of ROUNDS) {
  const dir = generatedDir(round);
  let names = [];
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.json') && !n.startsWith('_')).sort();
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log(`[load] ★ ${round} 라운드 디렉터리가 없다: ${path.relative(ROOT, dir)}`);
      continue;
    }
    throw err;
  }
  let ok = 0;
  let skippedDiscarded = 0;
  let skippedPending = 0;
  for (const n of names) {
    const doc = JSON.parse(await readFile(path.join(dir, n), 'utf8'));
    const r = resolveSubId(doc._meta.subId);
    for (const it of doc.items) {
      const q = it.question ?? {};
      if (q.status === 'pending') {
        skippedPending += 1;
        continue;
      }
      if (q.ok !== true) continue;
      // ★★ 격리된 문항은 절대 적재하지 않는다. 중복으로 판정된 것이 여기로 들어온다
      if (q.discarded) {
        skippedDiscarded += 1;
        continue;
      }
      items.push({
        sourceId: SEED_SOURCE_ID,
        // ★ seedId 가 그대로 source_ref 다. 소분류·순번이 들어 있어 사람이 읽을 수 있고,
        //   (source_id, source_ref) UNIQUE 로 두 번 적재가 막힌다
        sourceRef: it.seedId,
        verdict: 'accept',
        generated: {
          questionKo: q.question,
          displayAnswer: q.answer,
          answers: q.acceptedAnswers ?? [],
          // ★ 힌트는 서버가 display_answer 로 만든다. 따로 저장하지 않는다
          hintAnswer: null,
          answerLang: 'ko',
          explanation: q.explanation ?? null,
          difficulty: difficultyBand(q.difficulty),
          category: r.path,
        },
        gen: {
          midKey: r.midKey,
          sub: r.subName,
          accessibility: q.accessibility,
          difficultyScore: q.difficulty,
          worthKnowing: q.worthKnowing,
          seedSubject: it.seed?.subject ?? null,
          seedAspect: it.seed?.aspect ?? null,
        },
        meta: {
          processModel: doc._meta.questionGenerator ?? doc._meta.generator ?? null,
          seedPrompt: doc._meta.seedPrompt ?? null,
          questionPrompt: doc._meta.questionPrompt ?? null,
          round,
        },
        ai: { selfCheck: q.selfCheck ?? null },
        rules: { answerRevision: q.answerRevision ?? null },
        review: {
          status: 'approved',
          note:
            `소재 기반 파이프라인 ${round} / 소재 "${it.seed?.subject ?? '?'} + ${it.seed?.aspect ?? '?'}" ` +
            `/ 프롬프트 ${doc._meta.seedPrompt ?? '?'} + ${doc._meta.questionPrompt ?? '?'}`,
        },
        _file: path.relative(ROOT, path.join(dir, n)),
      });
      ok += 1;
    }
  }
  console.log(
    `[load] ${round}: 적재 대상 ${ok}건 (★ 격리 ${skippedDiscarded}건 / 문제 없는 소재 ${skippedPending}건 제외)`,
  );
}

for (const f of files) {
  const batch = JSON.parse(await readFile(f, 'utf8'));
  for (const item of batch.items ?? []) {
    // ★ approved/ 에 있어도 review.status 를 다시 확인한다.
    //   파일만 옮기고 상태를 바꾸지 않은 경우를 막는다.
    if (item.review?.status !== 'approved') continue;
    if (item.verdict !== 'accept') continue;
    if (!item.generated) continue;
    items.push({ ...item, _file: path.relative(ROOT, f) });
  }
}
console.log(`[load] 승인 파일 ${files.length}개 / 적재 후보 ${items.length}건`);
if (items.length === 0) {
  console.log('[load] ★ review.status 가 "approved" 인 항목이 없다.');
  console.log('[load]   검수에서 상태를 바꿨는지 확인한다.');
  process.exit(0);
}

// ── 2. 카테고리 매핑
//   ★ DB의 categories.key 는 영문 키다. 가공 결과는 한국어 이름으로 온다.
//
// ★★ R012: R011의 "대분류 → 기존 key 임시 매핑" 을 **제거했다.**
//   0003 마이그레이션으로 categories 에 계층이 들어갔으므로
//   ★ 생성 문제는 **소분류(리프)** 를 직접 가리킨다. 정보를 잃지 않는다.
//
//   소분류 리프의 key 는 `L3:{midKey}#{소분류 순번}` 이다.
//   ★ 순번으로 만든 이유: 소분류 이름이 바뀌어도 과거 통계가 깨지지 않는다.
//     (R002 categories 주석의 "문자열로 박아두면 이름을 바꿀 때 통계가 깨진다" 와 같은 이유)
//
// ★ 아래 CATEGORY_MAP 은 OpenTDB 가공 문제(R010)용으로 남긴다.
//   그 문제들은 16개 플랫 카테고리(level 0)를 참조한다.
const CATEGORY_MAP = {
  일반상식: 'general',
  역사: 'history',
  지리: 'geography',
  과학: 'science',
  수학: 'math',
  자연: 'nature',
  예술: 'art',
  음악: 'music',
  영화: 'movie',
  문학: 'literature',
  스포츠: 'sports',
  인물: 'people',
  기술: 'tech',
  신화: 'myth',
  언어: 'language',
  기타: 'etc',
};

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  // ★★ R011: 라이선스를 소스별로 읽는다. 하드코딩을 없앴다.
  //   근거: 생성 문제(gemini-gen)에는 CC BY-SA 의무가 없다.
  //   지금은 두 소스 모두 CC-BY-SA-4.0 이지만(판단 근거는 0002 마이그레이션 주석),
  //   ★ 값을 코드에 박아두면 소스별로 달라지는 순간 조용히 틀린 라이선스가 기록된다.
  const srcRows = await client.query('SELECT id, license FROM sources');
  const licenseBySource = new Map(srcRows.rows.map((r) => [r.id, r.license]));

  // 카테고리 id 조회
  const catRows = await client.query('SELECT id, key FROM categories');
  const catByKey = new Map(catRows.rows.map((r) => [r.key, r.id]));
  const fallbackId = catByKey.get('general') ?? catRows.rows[0]?.id;
  if (!fallbackId) throw new Error('categories 테이블이 비어 있다. 먼저 마이그레이션을 적용한다.');

  // ── 3. 이미 있는 source_ref 조회
  //   ★★ R011 수정: 전에는 items[0].sourceId 하나로만 조회했다.
  //     소스가 하나일 때는 맞았지만, 이제 OpenTDB 문제와 생성 문제가 함께 있다.
  //     ★ 그러면 두 번째 소스의 중복을 못 걸러 UNIQUE 위반으로 트랜잭션이 죽는다.
  //     (세 겹 방어의 첫 겹이 새는 것이므로 조용히 틀리지는 않는다. 그래도 고친다.)
  //     → (source_id, source_ref) 쌍으로 조회한다.
  const existing = await client.query(
    `SELECT source_id, source_ref FROM questions
      WHERE (source_id, source_ref) IN (
        SELECT * FROM unnest($1::text[], $2::text[])
      )`,
    [items.map((i) => i.sourceId), items.map((i) => i.sourceRef)],
  );
  // ★ 소스가 등록되어 있지 않으면 FK 오류로 죽는다. 먼저 알아듣게 알린다.
  const unknownSources = [...new Set(items.map((i) => i.sourceId))].filter(
    (s) => !licenseBySource.has(s),
  );
  if (unknownSources.length > 0) {
    console.error(`[load] ★ sources 테이블에 없는 소스: ${unknownSources.join(', ')}`);
    console.error('[load]   npm run db:migrate 를 먼저 실행한다 (gemini-gen → 0002 / seed-gen → ★ 0005_seed_gen_source.sql).');
    process.exit(1);
  }

  const known = new Set(existing.rows.map((r) => `${r.source_id}|${r.source_ref}`));
  const todo = items.filter((i) => !known.has(`${i.sourceId}|${i.sourceRef}`));
  console.log(`[load] 이미 적재됨 ${known.size}건 / 새로 적재할 것 ${todo.length}건`);

  if (DRY) {
    console.log('\n[dry-run] 적재 예정 목록');
    for (const i of todo) {
      console.log(`  ${i.sourceRef}  ${i.generated.questionKo}`);
      console.log(`     정답: ${i.generated.displayAnswer}  변형 ${i.generated.answers.length}개`);
      const path = i.gen?.midKey ? `${i.gen.midKey} > ${i.gen.sub}` : i.generated.category;
      console.log(`     카테고리: ${path} / 난이도: ${i.generated.difficulty}`);
      if (i.gen) {
        console.log(
          `     접근성 ${i.gen.accessibility} / 난이도 ${i.gen.difficultyScore} / 알가치 ${i.gen.worthKnowing}`,
        );
      }
    }
    process.exit(0);
  }

  if (todo.length === 0) {
    console.log('[load] 적재할 새 문제가 없다. (두 번 돌려도 안전하다)');
    process.exit(0);
  }

  // ── 4. 적재
  const status = AS_PENDING ? 'pending_review' : 'approved';
  const isActive = !AS_PENDING;
  let inserted = 0;
  let answerRows = 0;
  const skipped = [];
  const gatedVariants = [];
  const gateWarnings = [];

  for (const item of todo) {
    const g = item.generated;
    // ★★ 생성 문제는 소분류 리프를 가리킨다 (R012).
    //   gen.midKey 와 gen.sub 로 리프 key 를 만든다.
    let categoryId = null;
    if (item.gen?.midKey && item.gen?.sub) {
      const leafKey = leafKeyFor(item.gen.midKey, item.gen.sub);
      if (leafKey) categoryId = catByKey.get(leafKey) ?? null;
      if (!categoryId) {
        // ★ 조용히 fallback 으로 넘기지 않는다. 카테고리가 틀리면 통계가 틀린다.
        skipped.push({
          ref: item.sourceRef,
          reason: `카테고리 리프를 찾지 못했다: ${item.gen.midKey} > ${item.gen.sub}`,
        });
        continue;
      }
    } else {
      // OpenTDB 가공 문제: 기존 플랫 카테고리를 쓴다
      categoryId = catByKey.get(CATEGORY_MAP[g.category] ?? '') ?? fallbackId;
    }
    // ★★ R020 정답 표기 게이트 — 프롬프트의 규칙을 적재에서도 확인한다
    let variants = g.answers ?? [];
    if (!NO_GATE) {
      const gate = checkAnswerSet(g.questionText, g.displayAnswer, variants);
      if (gate.blocked.length) {
        // ★★ 질문에 정답이 낱말로 들어 있다. 채팅으로 답하는 게임이라 질문을 베끼면 이긴다.
        //   ★ 이것은 변형을 빼서 고칠 수 없다. 문제 자체를 다시 써야 한다
        skipped.push({
          ref: item.sourceRef,
          reason: `★ 질문에 정답이 노출됐다 — "${gate.blocked.map((b) => b.answer).join(', ')}"`,
        });
        continue;
      }
      if (gate.dropped.length) {
        // ★ 문제는 멀쩡하다. 금지된 변형만 떨어뜨리고 적재한다
        const drop = new Set(gate.dropped.map((d) => d.answer));
        variants = variants.filter((v) => !drop.has(v));
        gatedVariants.push(
          ...gate.dropped.map((d) => ({ ref: item.sourceRef, answer: d.answer, kind: d.kind })),
        );
      }
      for (const w of gate.warned) gateWarnings.push({ ref: item.sourceRef, answer: w.answer });
    }

    // ★ 정규화해서 같아지는 표기를 합친다. DB의 answer_norm UNIQUE 를 만족시켜야 한다.
    const answers = dedupeAnswers([g.displayAnswer, ...variants]);
    if (answers.length === 0) {
      skipped.push({ ref: item.sourceRef, reason: 'no_answers' });
      continue;
    }

    // ★ 문제 하나와 그 정답들을 한 트랜잭션으로 넣는다.
    //   정답 없는 문제가 남으면 게임에서 아무도 맞힐 수 없다.
    await client.query('BEGIN');
    try {
      const res = await client.query(
        `INSERT INTO questions
           (question_text, display_answer, hint_answer, answer_lang, category_id,
            difficulty, explanation, source_id, source_ref, license, status, is_active,
            approved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, CASE WHEN $11 = 'approved' THEN now() ELSE NULL END)
         RETURNING id`,
        [
          g.questionKo,
          g.displayAnswer,
          g.hintAnswer,
          g.answerLang || 'ko',
          categoryId,
          g.difficulty || 'medium',
          g.explanation || null,
          item.sourceId,
          item.sourceRef,
          // ★ sources 테이블의 값을 쓴다. 없으면 넣지 않는다 —
          //   틀린 라이선스를 기록하는 것보다 비어 있는 것이 낫다.
          licenseBySource.get(item.sourceId) ?? null,
          status,
          isActive,
        ],
      );
      const questionId = res.rows[0].id;

      for (const a of answers) {
        // ★ answer_norm 은 shared 의 normalizeAnswer 로 계산한다.
        //   ★ 런타임 판정과 같은 함수여야 한다. 다르면 정답이 조용히 오답 처리된다.
        await client.query(
          `INSERT INTO question_answers (question_id, answer_text, answer_norm, is_primary)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT DO NOTHING`,
          [questionId, a, normalizeAnswer(a), a === g.displayAnswer],
        );
        answerRows += 1;
      }

      // ★ 검수 이력을 review_queue 에 남긴다.
      await client.query(
        `INSERT INTO review_queue
           (question_id, ai_model, ai_confidence, ai_flags, backcheck_answer,
            backcheck_result, rule_flags, reviewer_note, reviewed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
         ON CONFLICT (question_id) DO NOTHING`,
        [
          questionId,
          // ★ 실제로 쓴 모델을 넣는다. 체인 때문에 항목마다 다를 수 있다.
          item.meta?.processModel ?? null,
          item.ai?.confidence ?? null,
          JSON.stringify(item.ai ?? {}),
          item.backcheck?.answer ?? null,
          item.backcheck?.result ?? 'skipped',
          JSON.stringify(item.rules ?? {}),
          item.review?.note ?? null,
        ],
      );

      await client.query('COMMIT');
      inserted += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      skipped.push({ ref: item.sourceRef, reason: err.message.slice(0, 120) });
    }
  }

  console.log('');
  console.log(`[load] 적재 완료: 문제 ${inserted}건 / 정답 표기 ${answerRows}행`);
  console.log(`[load] status=${status} / is_active=${isActive}`);
  console.log(`[load] normalizeAnswer 버전 ${NORMALIZE_VERSION}`);
  if (gatedVariants.length) {
    const byKind = {};
    for (const gv of gatedVariants) byKind[gv.kind] = (byKind[gv.kind] ?? 0) + 1;
    console.log(`[게이트] ★ 금지된 표기 변형 ${gatedVariants.length}개를 빼고 적재했다 ${JSON.stringify(byKind)}`);
    for (const gv of gatedVariants.slice(0, 20)) console.log(`  ${gv.ref}: ${gv.answer} (${gv.kind})`);
    if (gatedVariants.length > 20) console.log(`  … 외 ${gatedVariants.length - 20}개`);
  }
  if (gateWarnings.length) {
    console.log(`[게이트] 질문에 정답이 문자열로만 들어간 것 ${gateWarnings.length}건 (낱말 경계가 아니라 통과시켰다)`);
    for (const w of gateWarnings.slice(0, 10)) console.log(`  ${w.ref}: ${w.answer}`);
  }
  if (skipped.length) {
    console.log(`[load] ★ 건너뛴 것 ${skipped.length}건`);
    for (const s of skipped) console.log(`  ${s.ref}: ${s.reason}`);
  }

  const total = await client.query(
    `SELECT count(*)::int AS n FROM questions WHERE status='approved' AND is_active`,
  );
  console.log(`[load] 현재 출제 가능 문제 수: ${total.rows[0].n}건`);
} finally {
  await client.end();
}
