#!/usr/bin/env node
// =============================================================================
// Gemini 모델 실측 확인 (Q-59 / A-0)
//
// ★★ 목록에 있다고 쓸 수 있는 것이 아니다.
//   R005 실측에서 gemini-2.5-flash / gemini-2.5-flash-lite 가 GET /models 목록에는
//   나오는데 generateContent 를 호출하면 404 였다
//   ("no longer available to new users. Please update your code to use …").
//   ★ 그래서 반드시 실제로 호출해서 확인한다.
//
// ★ 비밀값 취급 (docs/02-ARCHITECTURE.md)
//   · 키는 환경변수에서만 읽는다. 값을 로그·에러·응답 어디에도 출력하지 않는다.
//     앞 4자리도 찍지 않는다. 존재 여부와 길이만 보고한다
//   · 키를 쿼리스트링이 아니라 x-goog-api-key 헤더로 보낸다
//
// 확인 항목
//   1. generateContent 호출이 성공하는가 (상태 코드)
//   2. responseSchema(구조화 출력)를 지원하는가  ← 작업 D가 이것에 의존한다
//   3. 토큰 사용량 (★ 사고 토큰 포함. 지능이 높으면 더 클 수 있다)
//
// 사용법
//   node scripts/pipeline-models.mjs             호출 가능 여부 + responseSchema
//   node scripts/pipeline-models.mjs --list      GET /models 목록도 함께
// =============================================================================

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile?.(path.join(ROOT, '.env'));
} catch {
  /* 환경변수로 직접 주입될 수 있다 */
}

const API_KEY = process.env.GEMINI_API_KEY;
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const WITH_LIST = process.argv.includes('--list');

if (!API_KEY) {
  console.error('[models] GEMINI_API_KEY 가 없습니다.');
  process.exit(1);
}
// ★ 길이만 보고한다.
console.log(`[models] 키 확인: 설정됨 (길이 ${API_KEY.length})`);

/** ★ 에러 문구에 키가 섞여 나가지 않게 지운다 */
function scrub(text) {
  if (!text) return '';
  return text.split(API_KEY).join('<REDACTED>');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ★ 503 과 404 를 구분해야 한다.
 *   404 "no longer available to new users" = 영구히 못 쓴다 (R005에서 겪은 것)
 *   503 "experiencing high demand"        = 일시적이다. 재시도하면 될 수 있다
 *   ★ 한 번 실패한 것을 "쓸 수 없다" 로 단정하면 잘못된 모델을 고르게 된다.
 *   그래서 503/429 는 재시도한다. 상한 3회, 지수 백오프.
 */
const RETRY_STATUS = new Set([429, 500, 503]);

async function callOnce(pathname, body) {
  const res = await fetch(`${BASE}${pathname}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': API_KEY, // ★ 쿼리스트링이 아니라 헤더
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const rl = {};
  for (const [k, v] of res.headers.entries()) {
    if (/ratelimit|retry-after|quota/i.test(k)) rl[k] = v;
  }
  return { status: res.status, text: scrub(text), rateLimit: rl };
}

async function call(pathname, body, attempts = 3) {
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    last = await callOnce(pathname, body);
    if (!RETRY_STATUS.has(last.status)) return { ...last, attempts: i + 1 };
    if (i < attempts - 1) {
      const wait = 2000 * 2 ** i;
      console.log(`        (${last.status} → ${wait}ms 후 재시도 ${i + 2}/${attempts})`);
      await sleep(wait);
    }
  }
  return { ...last, attempts };
}

/** 후보 목록. ★ 높은 것부터. 별칭(-latest)은 쓰지 않는다 */
const CANDIDATES = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
];

/** responseSchema 지원 확인용 최소 스키마 */
const PROBE_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    answer: { type: 'string' },
    variants: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'answer', 'variants'],
};

async function probe(model) {
  const out = { model };

  // ── 1. 평문 호출
  const plain = await call(`/models/${model}:generateContent`, {
    contents: [{ parts: [{ text: '한 단어로만 답하라: 대한민국의 수도는?' }] }],
    generationConfig: { maxOutputTokens: 512, temperature: 0 },
  });
  out.plainStatus = plain.status;
  out.plainAttempts = plain.attempts;
  if (plain.status !== 200) {
    // ★ 에러 유형만 뽑는다. 전문을 그대로 찍지 않는다(길고 키가 섞일 여지도 있다)
    try {
      const j = JSON.parse(plain.text);
      out.error = { status: j.error?.status, message: (j.error?.message ?? '').slice(0, 180) };
    } catch {
      out.error = { message: plain.text.slice(0, 180) };
    }
    if (Object.keys(plain.rateLimit).length) out.rateLimit = plain.rateLimit;
    return out;
  }

  const pj = JSON.parse(plain.text);
  out.plainText = (pj.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim().slice(0, 40);
  out.plainUsage = pj.usageMetadata;

  // ── 2. responseSchema 호출 (★ 작업 D가 이것에 의존한다)
  const structured = await call(`/models/${model}:generateContent`, {
    contents: [
      {
        parts: [
          {
            text:
              '다음 문제의 정답과 그 정답의 한국어 표기 변형을 답하라.\n' +
              '문제: Who painted "The Starry Night"?  정답: Vincent van Gogh',
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
      responseSchema: PROBE_SCHEMA,
    },
  });
  out.schemaStatus = structured.status;
  out.schemaAttempts = structured.attempts;
  if (structured.status === 200) {
    const sj = JSON.parse(structured.text);
    const raw = sj.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    out.schemaUsage = sj.usageMetadata;
    try {
      const parsed = JSON.parse(raw);
      out.schemaOk =
        typeof parsed.ok === 'boolean' &&
        typeof parsed.answer === 'string' &&
        Array.isArray(parsed.variants);
      out.schemaSample = { answer: parsed.answer, variants: parsed.variants?.slice(0, 6) };
    } catch {
      out.schemaOk = false;
      out.schemaSample = raw.slice(0, 120);
    }
  } else {
    try {
      const j = JSON.parse(structured.text);
      out.schemaError = (j.error?.message ?? '').slice(0, 180);
    } catch {
      out.schemaError = structured.text.slice(0, 180);
    }
  }
  return out;
}

// -----------------------------------------------------------------------------
if (WITH_LIST) {
  const r = await call('/models');
  if (r.status === 200) {
    const models = (JSON.parse(r.text).models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m) => m.name.replace('models/', ''));
    console.log(`\n[models] 목록에 있는 generateContent 지원 모델 ${models.length}개`);
    console.log('  ' + models.join(', '));
    console.log('  ★ 목록에 있다고 쓸 수 있는 것이 아니다. 아래 실제 호출 결과를 본다.');
  } else {
    console.log(`[models] 목록 조회 실패: ${r.status}`);
  }
}

console.log('\n[models] 실제 호출 확인');
const results = [];
for (const model of CANDIDATES) {
  const r = await probe(model);
  results.push(r);
  const usage = r.plainUsage
    ? `prompt=${r.plainUsage.promptTokenCount} out=${r.plainUsage.candidatesTokenCount} total=${r.plainUsage.totalTokenCount}`
    : '';
  if (r.plainStatus === 200) {
    console.log(
      `  OK    ${model}  평문=200 "${r.plainText}" / schema=${r.schemaStatus}${r.schemaOk ? ' 구조 준수' : ''}`,
    );
    if (usage) console.log(`        토큰(평문): ${usage}`);
    if (r.schemaUsage) {
      console.log(
        `        토큰(schema): prompt=${r.schemaUsage.promptTokenCount} out=${r.schemaUsage.candidatesTokenCount} total=${r.schemaUsage.totalTokenCount}` +
          (r.schemaUsage.thoughtsTokenCount
            ? ` thoughts=${r.schemaUsage.thoughtsTokenCount}`
            : ''),
      );
    }
    if (r.schemaSample) console.log(`        schema 표본: ${JSON.stringify(r.schemaSample)}`);
  } else {
    console.log(`  FAIL  ${model}  ${r.plainStatus} ${r.error?.status ?? ''}`);
    if (r.error?.message) console.log(`        ${r.error.message}`);
    if (r.rateLimit) console.log(`        rate limit 헤더: ${JSON.stringify(r.rateLimit)}`);
  }
  // 연속 호출 간 간격. 한도를 아낀다
  await sleep(1200);
}

console.log('\n[models] 요약');
for (const r of results) {
  const total = r.schemaUsage?.totalTokenCount ?? r.plainUsage?.totalTokenCount ?? '-';
  console.log(
    `  ${r.model.padEnd(24)} 호출=${r.plainStatus === 200 ? '가능' : '불가(' + r.plainStatus + ')'}` +
      `  responseSchema=${r.schemaStatus === 200 && r.schemaOk ? '지원' : r.plainStatus === 200 ? '확인 필요' : '-'}` +
      `  schema총토큰=${total}`,
  );
}
