#!/usr/bin/env node
// =============================================================================
// 기존 문제에 "알 가치" 점수를 매긴다 (R012 작업 E-1)
//
// ★★ 왜 필요한가
//   R011의 257건은 g2 프롬프트로 만들었다. 그때는 worthKnowing 필드가 없었다.
//   ★ 선별 기준(Q-69)이 알 가치를 하한으로 쓰므로, 점수가 없으면 전부 "미평가" 로
//     걸린다. 그러면 건우가 "기준이 맞는가" 를 판단할 자료가 나오지 않는다.
//   → 기존 문제에 알 가치만 따로 매긴다.
//
// ★ 생성에 쓴 모델과 다른 체인으로 평가한다.
//   자기가 만든 문제의 가치를 자기가 매기면 후하게 준다.
//
// ★ 접근성·난이도는 다시 매기지 않는다. 이미 있는 값을 쓴다.
//   ★ 그것까지 바꾸면 R011 실측과 비교할 수 없어진다.
//
// 사용법
//   node scripts/pipeline-score-worth.mjs --files 2026-09-09-gen01.json
//   node scripts/pipeline-score-worth.mjs                 (worthKnowing=0 인 것 전부)
//   node scripts/pipeline-score-worth.mjs --dry-run
// =============================================================================

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATA_DIRS, MODELS } from '../pipeline/dist/config.js';
import { checkGate, closeSegment, loadState, saveState } from '../pipeline/dist/budget.js';
import { BudgetError, GeminiClient, RateLimitError } from '../pipeline/dist/gemini.js';
import { LIMITS } from '../pipeline/dist/config.js';
import { canResume, currentSegment, recordResume } from '../pipeline/dist/budget.js';
import { categoryPath } from '../pipeline/dist/categories.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile?.(path.join(ROOT, '.env'));
} catch {
  /* 환경변수 직접 주입 */
}

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d;
};
const DRY = args.includes('--dry-run');
const ONLY = (opt('--files', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const BATCH = Number(opt('--group', '25'));

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ref: { type: 'string' },
          worthKnowing: { type: 'integer' },
          reason: { type: 'string' },
        },
        required: ['ref', 'worthKnowing', 'reason'],
      },
    },
  },
  required: ['items'],
};

function buildPrompt(rows) {
  const list = rows
    .map((r) => `ref "${r.ref}"  [${r.category}]\n  Q. ${r.question}\n  A. ${r.answer}`)
    .join('\n');

  return `너는 한국어 퀴즈 문제의 가치를 평가하는 검수자다.
아래 문제들에 **알 가치(worthKnowing)** 를 1~5로 매겨라.

★★ 알 가치란 — **맞히지 못한 사람이 답을 듣고 "몰랐는데 알아서 좋았다" 고 느끼는가.**
  5 = 교과 과정에 나오거나 상식으로 통용된다. 몰랐다면 알아두면 좋다
  4 = 알아두면 대화에서 쓸 데가 있다
  3 = 알아두면 쓸 데가 있는 편이다
  2 = 알아도 쓸 데를 찾기 어렵다
  1 = ★ 알아도 아무 쓸모가 없다

★★ 이것은 난이도가 아니다. **정확히 구분하라.**
  어렵지만 알 가치가 높은 문제가 이 게임에 가장 좋은 문제다.

  알 가치가 낮은 유형 (1~2로 매겨라)
    · 특정 연도만 묻는 문제 (그 연도가 역사적 의미를 갖는 경우는 예외)
    · 널리 알려지지 않은 인물의 이름
    · 작품·제품의 내부 수치나 조연 이름
    · 기록·순위의 세부 (몇 위, 몇 승, 타율 등)

  실제 예시로 감을 잡아라
    "1982년 KBO 최고 타율 0.412 선수는?" → 백인천        ★ 알 가치 1
    "1924년 제1회 동계 올림픽 개최 도시는?" → 샤모니       ★ 알 가치 1
    "'결정적 순간' 개념을 제시한 사진가는?" → 브레송        ★ 알 가치 4
    "인체에서 가장 큰 장기는?" → 피부                     ★ 알 가치 5

★ reason 에 한 문장으로 이유를 적어라. 점수만 주지 마라.
★ 후하게 주지 마라. 이 평가의 목적은 알 가치 없는 문제를 걸러내는 것이다.

문제 목록 (${rows.length}건):

${list}`;
}

// ── 1. 대상 수집
const dir = path.join(ROOT, DATA_DIRS.processed);
let files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
if (ONLY.length > 0) files = files.filter((f) => ONLY.includes(f));

const targets = [];
const batches = new Map();
for (const f of files) {
  const d = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
  batches.set(f, d);
  for (const i of d.items ?? []) {
    if (!i.gen || !i.generated?.questionKo) continue;
    if ((i.gen.worthKnowing ?? 0) > 0) continue;
    targets.push({
      ref: i.sourceRef,
      question: i.generated.questionKo,
      answer: i.generated.displayAnswer,
      category: categoryPath(i.gen.midKey, i.gen.sub),
      _item: i,
      _file: f,
    });
  }
}

console.log(`[sw] 파일 ${files.length}개 / 알 가치 미평가 ${targets.length}건`);
if (targets.length === 0) {
  console.log('[sw] 평가할 것이 없다.');
  process.exit(0);
}
if (DRY) {
  console.log('[sw] --dry-run 이므로 호출하지 않는다.');
  process.exit(0);
}

// ── 2. 평가
const state = await loadState(ROOT);
const gate = checkGate(state);
if (!gate.ok) {
  console.error(`[sw] ★ 시작하지 않는다 — ${gate.detail}`);
  process.exit(0);
}
const client = new GeminiClient({ root: ROOT, state, log: (m) => console.log('  ' + m) });
// ★ 생성은 processChain 이 했으므로 평가는 backcheckChain 을 쓴다
const CHAIN = [...MODELS.backcheckChain];

const scores = new Map();
const tokens = { total: 0, calls: 0 };
let stoppedByRateLimit = false;

/**
 * ★★ 한 묶음을 평가한다. 429 면 false 를 돌려준다.
 *
 * ★ R012 실측에서 이 스크립트가 429 를 맞고 **그냥 죽었다.**
 *   이미 평가한 250건을 저장하지 않아 전부 잃었다. ★ 내 실수다.
 *   → 429 를 잡아서 (a) 받은 것을 저장하고 (b) Q-62 규칙대로 재개한다.
 */
async function scoreChunk(chunk, label) {
  try {
    const r = await client.generateWithChain(CHAIN, buildPrompt(chunk), SCHEMA, {
      maxOutputTokens: 8192,
    });
    tokens.total += r.usage.total;
    tokens.calls += 1;
    for (const it of r.value.items ?? []) scores.set(it.ref, it);
    console.log(`[sw] 평가 ${label} [${r.model}] (토큰 ${r.usage.total})`);
    return true;
  } catch (err) {
    if (err instanceof RateLimitError || err instanceof BudgetError) {
      stoppedByRateLimit = err instanceof RateLimitError;
      console.log(`[sw] ★ 중단: ${err.message}`);
      return false;
    }
    throw err;
  }
}

const pendingChunks = [];
for (let i = 0; i < targets.length; i += BATCH) {
  pendingChunks.push({ chunk: targets.slice(i, i + BATCH), label: `${i + 1}~${Math.min(i + BATCH, targets.length)}/${targets.length}` });
}

while (pendingChunks.length > 0) {
  const { chunk, label } = pendingChunks[0];
  const ok = await scoreChunk(chunk, label);
  if (ok) {
    pendingChunks.shift();
    continue;
  }

  // ── ★ 429. Q-62 확정 규칙: 15분 대기 후 1회 재개한다
  if (!stoppedByRateLimit) break;
  if (!canResume(state)) {
    console.log(`[sw] ★ 오늘 재개 한도(${LIMITS.maxResumesPerDay}회)를 이미 썼다. 그날 중단한다 (Q-62).`);
    break;
  }
  const waitMin = Math.round(LIMITS.rateLimitWaitMs / 60000);
  console.log(`[sw] ★ 429 — ${waitMin}분 대기 후 1회 재개한다 (Q-62). 남은 묶음 ${pendingChunks.length}개`);
  console.log(`[sw]   ★ 지금까지 평가한 ${scores.size}건은 이미 확보되어 있다. 잃지 않는다`);
  console.log(`[sw]   재개 예정: ${new Date(Date.now() + LIMITS.rateLimitWaitMs).toISOString()}`);
  await new Promise((r) => setTimeout(r, LIMITS.rateLimitWaitMs));
  recordResume(state);
  currentSegment(state);
  await saveState(ROOT, state);
  stoppedByRateLimit = false;
  console.log(`[sw] ★ 재개한다 (${(state.resumes ?? []).length}번째).`);
}

closeSegment(state, stoppedByRateLimit);
await saveState(ROOT, state);

// ── 3. 반영
let applied = 0;
const missing = [];
const dist = {};
for (const t of targets) {
  const s = scores.get(t.ref);
  if (!s) {
    missing.push(t);
    continue;
  }
  const v = Number(s.worthKnowing) || 0;
  if (v < 1 || v > 5) {
    missing.push(t);
    continue;
  }
  t._item.gen.worthKnowing = v;
  // ★ 누가 언제 매겼는지 남긴다. 생성 때 매긴 것과 구분해야 한다
  t._item.gen.worthScoredBy = 'R012-backcheck-chain';
  t._item.gen.worthReason = s.reason;
  dist[v] = (dist[v] ?? 0) + 1;
  applied += 1;
}

for (const [f, d] of batches) {
  if (!d.items?.some((i) => i.gen?.worthScoredBy === 'R012-backcheck-chain')) continue;
  d._meta.worthScoredAt = new Date().toISOString();
  await writeFile(path.join(dir, f), JSON.stringify(d, null, 2) + '\n', 'utf8');
  console.log(`[sw] 저장: ${f}`);
}

console.log('\n──────────────────────────────────────────');
console.log(`[sw] ★ 평가 반영 ${applied}/${targets.length}건 / 토큰 ${tokens.total} / 호출 ${tokens.calls}회`);
console.log(`[sw] 알 가치 분포: ${[1, 2, 3, 4, 5].map((k) => `${k}:${dist[k] ?? 0}`).join(' ')}`);
if (missing.length > 0) {
  console.log(`[sw] ★ 평가가 오지 않은 항목 ${missing.length}건 (worthKnowing 이 0 으로 남는다):`);
  for (const m of missing.slice(0, 10)) console.log(`   ${m.ref} | ${m.question}`);
}
if (stoppedByRateLimit) {
  console.log('[sw] ★★ 429 로 중단했다. 남은 것은 다시 실행하면 이어서 평가한다');
  console.log('[sw]   (worthKnowing 이 0 인 것만 대상으로 삼으므로 중복 평가하지 않는다)');
}
console.log('[sw] ★ 알 가치 1~2 로 매겨진 것은 R012 보고서 5장에 전부 나열한다.');
