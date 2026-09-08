#!/usr/bin/env node
// =============================================================================
// 모델 품질 비교 (A-0-2)
//
// ★★ "호출된다" 와 "우리 작업을 잘한다" 는 다르다.
//   A-0-1(pipeline-models.mjs)은 호출 가능 여부와 responseSchema 지원만 봤다.
//   여기서는 **실제 프로덕션 프롬프트로 같은 샘플을 돌려** 비교한다.
//
// 비교 기준 (지시)
//   · 복수 정답 배열의 개수와 품질 (표기 변형이 충분한가)
//   · ★ 함정 회피 — 정답보다 좁은 하위 개념을 넣지 않는가
//     R005 실측: United Kingdom 이 정답인 문제에 "영국/United Kingdom/UK" 를 넣고
//     "잉글랜드" 는 넣지 않았다. 잉글랜드는 영국의 일부라 틀린 답이기 때문이다
//   · 정답 유일성 판정의 정확도
//   · 한국인 난이도 판정의 타당성
//   · 토큰 사용량 (★ 사고 토큰 포함)
//
// 사용법
//   npm run pipeline:compare -- --count 8
// =============================================================================

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProcessPrompt, PROCESS_SCHEMA } from '../pipeline/dist/prompts.js';
import { GeminiClient } from '../pipeline/dist/gemini.js';
import { loadState } from '../pipeline/dist/budget.js';
import { DATA_DIRS } from '../pipeline/dist/config.js';

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
const COUNT = Number(opt('--count', '8'));

/** ★ 후보. 높은 것부터 */
const CANDIDATES = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'];

/**
 * ★ 고정 샘플 — 재현 가능해야 한다.
 *   무작위로 뽑으면 실행마다 다른 결과가 나와 모델을 비교할 수 없다.
 *   ★ 함정 문제를 의도적으로 섞었다.
 */
const FIXED = [
  {
    sourceRef: 'cmp-uk',
    question: 'Which country has a flag consisting of a red cross on a white background?',
    correct: 'England',
    incorrect: ['Denmark', 'Switzerland', 'Georgia'],
    category: 'Geography',
    difficulty: 'medium',
    note: '★ 함정: 조건을 만족하는 나라가 여럿(잉글랜드/조지아 등) → uniqueAnswer=false 여야 한다',
  },
  {
    sourceRef: 'cmp-gogh',
    question: 'Who painted "The Starry Night"?',
    correct: 'Vincent van Gogh',
    incorrect: ['Claude Monet', 'Pablo Picasso', 'Paul Cezanne'],
    category: 'Art',
    difficulty: 'easy',
    note: '★ 인명 표기 변형(성만 포함)이 나와야 한다',
  },
  {
    sourceRef: 'cmp-kojima',
    question: 'Who created the "Metal Gear" series?',
    correct: 'Hideo Kojima',
    incorrect: ['Shigeru Miyamoto', 'Hironobu Sakaguchi', 'Yuji Naka'],
    category: 'Entertainment: Video Games',
    difficulty: 'medium',
    note: '★ R005 미흡점: 일본 인명의 성만("코지마")을 넣는가',
  },
  {
    sourceRef: 'cmp-pong',
    question: 'When was Pong released?',
    correct: 'November 29, 1972',
    incorrect: ['1975', '1968', '1980'],
    category: 'Entertainment: Video Games',
    difficulty: 'medium',
    note: '★ 함정: 날짜 전체 표기 → uniqueAnswer=false 여야 한다',
  },
  {
    sourceRef: 'cmp-rabbit',
    question: 'What is the average lifespan of a domestic rabbit?',
    correct: '8-12 years',
    incorrect: ['2-3 years', '20-25 years', '1 year'],
    category: 'Animals',
    difficulty: 'easy',
    note: '★ 함정: 범위형 정답 → uniqueAnswer=false 여야 한다',
  },
  {
    sourceRef: 'cmp-spoon',
    question: 'Which type of cutlery is most suited for eating soup?',
    correct: 'Spoon',
    incorrect: ['Fork', 'Knife', 'Chopsticks'],
    category: 'General Knowledge',
    difficulty: 'easy',
    note: '★ 정상 문제. 이것을 버리면 과잉 거부다',
  },
  {
    sourceRef: 'cmp-mito',
    question: 'What is the powerhouse of the cell?',
    correct: 'Mitochondria',
    incorrect: ['Nucleus', 'Ribosome', 'Golgi apparatus'],
    category: 'Science & Nature',
    difficulty: 'easy',
    note: '★ 외래어 표기 그대로 통용 → koreanTerm=true 여야 한다',
  },
  {
    sourceRef: 'cmp-hannibal',
    question: 'Who was Hannibal?',
    correct: 'Carthaginian general',
    incorrect: ['Roman senator', 'Greek philosopher', 'Egyptian pharaoh'],
    category: 'History',
    difficulty: 'medium',
    note: '★ 함정: 서술형 정답 → convertible=false 또는 uniqueAnswer=false 여야 한다',
  },
];

/** raw/ 에서 실제 문제도 몇 개 섞는다 (합성 샘플만으로 판단하지 않기 위함) */
async function realSamples(n) {
  const dir = path.join(ROOT, DATA_DIRS.raw, 'opentdb');
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.jsonl')).sort();
    if (!files.length) return [];
    const text = await readFile(path.join(dir, files[0]), 'utf8');
    const lines = text.split('\n').filter((l) => l.trim());
    // ★ 앞에서부터 고정으로 뽑는다. 무작위면 실행마다 비교 대상이 달라진다
    return lines.slice(0, n).map((l) => {
      const q = JSON.parse(l);
      return {
        sourceRef: q.sourceRef,
        question: q.question,
        correct: q.correct,
        incorrect: q.incorrect,
        category: q.category,
        difficulty: q.difficulty,
      };
    });
  } catch {
    return [];
  }
}

const samples = [...FIXED.slice(0, COUNT), ...(await realSamples(Math.max(0, COUNT - FIXED.length)))];
const inputs = samples.map(({ note, ...rest }) => {
  void note;
  return rest;
});

console.log(`[compare] 샘플 ${inputs.length}건으로 후보 ${CANDIDATES.length}개 비교`);
console.log('[compare] ★ 프로덕션 프롬프트를 그대로 쓴다\n');

const state = await loadState(ROOT);
const client = new GeminiClient({ root: ROOT, state, log: (m) => console.log('  ' + m) });
const prompt = buildProcessPrompt(inputs);

const report = { generatedAt: new Date().toISOString(), samples, models: {} };

for (const model of CANDIDATES) {
  console.log(`── ${model}`);
  try {
    const r = await client.generate(model, prompt, PROCESS_SCHEMA, { maxOutputTokens: 16384 });
    const items = r.value.items ?? [];
    const byRef = new Map(items.map((i) => [i.sourceRef, i]));

    const accepted = items.filter((i) => i.verdict === 'accept');
    const variantCounts = accepted.map((i) => (i.answers ?? []).length);
    const avgVariants = variantCounts.length
      ? (variantCounts.reduce((a, b) => a + b, 0) / variantCounts.length).toFixed(1)
      : '0';
    const withReason = items.filter((i) => i.verdict === 'reject' && (i.rejectReason ?? '').trim());

    console.log(`   accept ${accepted.length} / reject ${items.length - accepted.length}`);
    console.log(`   복수 정답 평균 ${avgVariants}개 (범위 ${Math.min(...variantCounts, 0)}~${Math.max(...variantCounts, 0)})`);
    console.log(
      `   rejectReason 채움 ${withReason.length}/${items.length - accepted.length}` +
        ` (★ responseSchema 로 강제한 필드)`,
    );
    console.log(
      `   토큰 총 ${r.usage.total} (프롬프트 ${r.usage.prompt} / 출력 ${r.usage.output} / 사고 ${r.usage.thoughts})`,
    );

    // ★ 함정 문제별 판정 확인
    const traps = [
      ['cmp-uk', '여럿인 나라', (i) => i.uniqueAnswer === false],
      ['cmp-pong', '날짜 전체', (i) => i.uniqueAnswer === false],
      ['cmp-rabbit', '범위형', (i) => i.uniqueAnswer === false],
      ['cmp-hannibal', '서술형', (i) => i.convertible === false || i.uniqueAnswer === false],
      ['cmp-spoon', '정상(통과해야 함)', (i) => i.verdict === 'accept'],
      ['cmp-mito', '외래어 통용', (i) => i.koreanTerm === true],
    ];
    let trapOk = 0;
    const trapDetail = [];
    for (const [ref, label, test] of traps) {
      const item = byRef.get(ref);
      const ok = item ? test(item) : false;
      if (ok) trapOk += 1;
      trapDetail.push(`${ok ? 'O' : 'X'} ${label}`);
    }
    console.log(`   ★ 함정 회피 ${trapOk}/${traps.length}: ${trapDetail.join(' / ')}`);

    // 인명 성만 표기 확인
    const gogh = byRef.get('cmp-gogh');
    const kojima = byRef.get('cmp-kojima');
    const goghHasSurname = (gogh?.answers ?? []).some((a) => /^(반\s?고흐|고흐)$/.test(a.trim()));
    const kojimaHasSurname = (kojima?.answers ?? []).some((a) => /^코지마$/.test(a.trim()));
    console.log(
      `   ★ 인명 성만 표기: 반고흐 ${goghHasSurname ? 'O' : 'X'} / 코지마 ${kojimaHasSurname ? 'O' : 'X'}`,
    );
    if (gogh?.answers) console.log(`      반고흐 answers: ${JSON.stringify(gogh.answers)}`);
    if (kojima?.answers) console.log(`      코지마 answers: ${JSON.stringify(kojima.answers)}`);

    report.models[model] = {
      accepted: accepted.length,
      rejected: items.length - accepted.length,
      avgVariants: Number(avgVariants),
      rejectReasonFilled: withReason.length,
      trapOk,
      trapTotal: traps.length,
      trapDetail,
      goghHasSurname,
      kojimaHasSurname,
      usage: r.usage,
      items,
    };
  } catch (err) {
    console.log(`   ★ 실패: ${err.message}`);
    report.models[model] = { error: err.message };
  }
  console.log('');
}

const outDir = path.join(ROOT, 'tmp');
await mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, 'model-compare.json');
await writeFile(outFile, JSON.stringify(report, null, 2), 'utf8');
console.log(`[compare] 상세 결과: ${path.relative(ROOT, outFile)}`);
console.log(`[compare] 누적 토큰(오늘): ${state.tokens} / 호출 ${state.calls}회`);
