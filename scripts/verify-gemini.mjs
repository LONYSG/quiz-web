#!/usr/bin/env node
// =============================================================================
// Gemini API 키 검증 스크립트
//
// ★ 비밀값 취급 원칙 (docs/02-ARCHITECTURE.md "비밀값 관리" 절)
//   · 키는 환경변수 GEMINI_API_KEY 에서만 읽는다. 하드코딩·기본값을 두지 않는다
//   · ★ 키 값을 로그·에러 메시지·표준 출력 어디에도 출력하지 않는다.
//     앞 4자리도 찍지 않는다. 존재 여부와 길이만 보고한다
//   · 키를 URL 쿼리스트링이 아니라 x-goog-api-key 헤더로 보낸다.
//     쿼리스트링은 프록시·서버 로그에 남을 수 있다
//
// 사용법
//   node scripts/verify-gemini.mjs              전체 (모델 목록 + 샘플 가공)
//   node scripts/verify-gemini.mjs --models     모델 목록만
//   node scripts/verify-gemini.mjs --minimal    최소 호출 1회만 (CI용)
// =============================================================================

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

try {
  process.loadEnvFile?.(path.join(ROOT, '.env'));
} catch {
  /* .env 가 없어도 환경변수로 주입될 수 있다 */
}

const API_KEY = process.env.GEMINI_API_KEY;
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

const MODELS_ONLY = process.argv.includes('--models');
const MINIMAL = process.argv.includes('--minimal');
/** 복수 정답 배열 품질만 집중 검증한다 (Track D의 최대 리스크) */
const VARIANTS = process.argv.includes('--variants');
/** 역검증 프롬프트 검증 */
const BACKCHECK = process.argv.includes('--backcheck');

if (!API_KEY) {
  console.error('[verify] GEMINI_API_KEY 환경변수가 없습니다.');
  console.error('[verify]   로컬:   .env 에 GEMINI_API_KEY 를 넣습니다');
  console.error('[verify]   Actions: Secrets 의 GEMINI_API_KEY 를 env 로 주입합니다');
  process.exit(1);
}
// ★ 길이만 보고한다. 값은 출력하지 않는다.
console.log(`[verify] 키 확인: 설정됨 (길이 ${API_KEY.length})`);

/** 응답에서 rate limit 관련 헤더만 뽑는다 (Q-54 조사용) */
function rateLimitHeaders(res) {
  const out = {};
  for (const [k, v] of res.headers.entries()) {
    if (/ratelimit|retry-after|quota/i.test(k)) out[k] = v;
  }
  return out;
}

/**
 * ★ 에러 메시지에서 키가 새어 나가지 않게 정리한다.
 * Google API 에러 본문에 요청 URL이 포함되는 경우가 있어, 키 문자열을 무조건 지운다.
 */
function scrub(text) {
  if (typeof text !== 'string') return String(text);
  return text.split(API_KEY).join('[REDACTED]');
}

async function call(pathname, init = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: {
      'x-goog-api-key': API_KEY, // ★ 쿼리스트링이 아니라 헤더로 보낸다
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  return { res, text };
}

function classify(status) {
  if (status === 200) return 'OK';
  if (status === 400) return 'BAD_REQUEST (요청 형식 오류)';
  if (status === 401) return 'UNAUTHENTICATED (키가 없거나 형식이 잘못됨)';
  if (status === 403) return 'PERMISSION_DENIED (키가 무효하거나 API가 활성화되지 않음)';
  if (status === 404) return 'NOT_FOUND (모델명이 잘못됨)';
  if (status === 429) return 'RESOURCE_EXHAUSTED (rate limit / 할당량 초과)';
  if (status >= 500) return 'SERVER_ERROR';
  return `UNEXPECTED (${status})`;
}

// -----------------------------------------------------------------------------
// 1. 모델 목록
// -----------------------------------------------------------------------------
async function listModels() {
  const { res, text } = await call('/models?pageSize=200');
  console.log(`\n[verify] GET /models → ${res.status} ${classify(res.status)}`);
  const rl = rateLimitHeaders(res);
  if (Object.keys(rl).length) console.log('[verify] rate limit 헤더:', rl);

  if (res.status !== 200) {
    console.error('[verify] 응답:', scrub(text).slice(0, 500));
    return null;
  }

  const json = JSON.parse(text);
  const models = (json.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m) => ({
      name: m.name.replace(/^models\//, ''),
      inputTokenLimit: m.inputTokenLimit,
      outputTokenLimit: m.outputTokenLimit,
    }));

  console.log(`[verify] generateContent 지원 모델 ${models.length}개`);
  return models;
}

// -----------------------------------------------------------------------------
// 2. 최소 호출 (CI용)
// -----------------------------------------------------------------------------
async function minimalCall(model) {
  const { res, text } = await call(`/models/${model}:generateContent`, {
    method: 'POST',
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'OK 라고만 답해.' }] }],
      generationConfig: { maxOutputTokens: 16, temperature: 0 },
    }),
  });
  console.log(`[verify] POST ${model}:generateContent → ${res.status} ${classify(res.status)}`);
  const rl = rateLimitHeaders(res);
  if (Object.keys(rl).length) console.log('[verify] rate limit 헤더:', rl);
  if (res.status !== 200) {
    console.error('[verify] 응답:', scrub(text).slice(0, 600));
    return false;
  }
  const json = JSON.parse(text);
  const reply = json.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '(빈 응답)';
  console.log(`[verify] 응답 내용: ${reply.trim().slice(0, 80)}`);
  return true;
}

// -----------------------------------------------------------------------------
// 3. 샘플 가공 (R002 2-3 프롬프트)
// -----------------------------------------------------------------------------
const SYSTEM_PROMPT = `너는 영어 4지선다 상식 퀴즈를 한국어 주관식 퀴즈로 변환하는 검수관이다.
변환 결과는 실시간 멀티플레이 퀴즈 게임에서 사용되며, 이 게임은 정답을
"정확한 문자열 일치"로만 판정한다. 오타 허용이나 유사도 판정을 하지 않는다.
따라서 조금이라도 정답이 애매한 문제는 반드시 탈락시켜야 한다.
통과시키는 것보다 탈락시키는 것이 안전하다. 확신이 없으면 탈락시켜라.

입력으로 문제 배열을 받는다. 각 문제에 대해 아래 순서로 판정하고 결과를 JSON으로 출력한다.

[판정 1] convertible - 보기 없이 문장이 성립하는가
  다음에 해당하면 false:
  - 질문이 보기 집합을 전제한다 ("다음 중", "이들 중", "~가 아닌 것은")
  - 정답이 문장이거나 서술형이다
  - 정답이 여러 항목의 나열이다

[판정 2] uniqueAnswer - 가장 중요. 보기를 없앴을 때 정답이 유일하게 결정되는가
  다음에 해당하면 false:
  - 조건을 만족하는 답이 현실에 둘 이상 존재한다
    (예: "국기가 빨강과 흰색인 나라는?" -> 일본/캐나다/폴란드/오스트리아 ...)
  - 질문에 "~중 하나"가 들어 있다
  - 정답이 날짜이고 연/월/일 표기 방식이 여러 가지다
  - 정답이 숫자인데 단위/정밀도/자릿수 표기가 여러 가지다 (근사값, 범위값 포함)
  - 정답이 이유/방법/현상 설명이라 표현이 사람마다 달라진다
  정답이 "연도 하나"이거나 "개수 하나"처럼 표기가 사실상 하나뿐이면 true로 둔다.

[판정 3] krAccessible - 한국의 일반적인 성인이 이 문제를 접했을 때
  "알 수도 있겠다"고 느낄 수준인가. 1~5로 평가한다.
  5 = 한국 교과 과정이나 대중문화에서 널리 알려짐
  3 = 관심 있는 사람은 아는 수준
  1 = 해당 국가/해당 팬덤 밖에서는 사실상 아무도 모름
  카테고리로 판단하지 말고 문항 내용으로 판단하라.

[판정 4] koreanTerm - 정답에 대응하는 한국어 표기가 존재하는가
  - 한국어 고유 표기가 있으면 true
  - 한국에서 외래어 표기로 통용되면 true (예: 미토콘드리아, 이데올로기, 스택)
  - 표기가 정착되지 않아 사람마다 다르게 쓸 수밖에 없으면 false

위 판정 중 convertible=false 또는 uniqueAnswer=false 또는 krAccessible<=2 또는
koreanTerm=false 이면 verdict="reject"로 하고 나머지 생성 필드는 비운다.

전부 통과하면 verdict="accept"로 하고 다음을 생성한다.

[생성 1] question_ko - 한국어 질문. 원문의 의미를 바꾸지 않는다.
  보기 참조 표현을 주관식 어투로 자연스럽게 고친다.
  질문 안에 정답이 드러나지 않게 한다.
  존댓말을 쓰지 않고 "~은?", "~는 무엇인가?" 형태의 간결한 퀴즈 어투로 쓴다.

[생성 2] displayAnswer - 정답 공개 화면에 보여줄 대표 표기 하나.

[생성 3] answers - 정답 판정에 사용할 표기 변형 배열. 이 필드가 가장 중요하다.
  게임은 정확 문자열 일치로만 판정하므로, 실제 사람이 칠 법한 표기를 최대한 넣어라.
  반드시 포함할 것:
    - displayAnswer 자체
    - 원문 영어 표기
    - 한글 음차 표기의 흔한 변형 (예: 반 고흐 / 빈센트 반 고흐 / 고흐 / 반고흐)
    - 성만 / 이름 전체 등 인명의 통용 축약형
    - 숫자는 아라비아 숫자와 한글 표기 양쪽
  포함하지 말 것:
    - 명백히 틀린 답
    - 정답보다 범위가 넓은 상위 개념
    - 오타 변형
  띄어쓰기 차이와 영문 대소문자 차이는 게임 엔진이 알아서 무시하므로
  그 목적만으로 변형을 추가하지 마라.

[생성 4] category - 다음 중 하나로 매핑한다:
  general / history / geography / science / math / nature / art / music / movie /
  literature / sports / person / tech / myth / language / etc

[생성 5] difficulty - easy / medium / hard. 한국인 기준으로 다시 매긴다.

[생성 6] explanation - 한 문장 해설. 만들 수 없으면 null.

[생성 7] hintAnswer - 힌트 생성 기준으로 삼을 정답 하나.

[생성 8] confidence - 위 판정 전체에 대한 self-confidence. 0.0~1.0.

출력은 JSON 배열만 낸다. 설명 문장을 덧붙이지 마라.`;

/** R002 2-2의 실측 샘플. 의도적으로 accept/reject가 섞여 있다. */
const SAMPLES = [
  {
    sourceRef: 'otdb-sample-01',
    question: 'Which is the capital of Spain?',
    correct: 'Madrid',
    incorrect: ['Paris', 'Barcelona', 'Lisboa'],
    category: 'General Knowledge',
    difficulty: 'easy',
    _expect: 'accept (쉬운 지리. 한국에서도 통한다)',
  },
  {
    sourceRef: 'otdb-sample-02',
    question: 'In most traditions, who was the wife of Zeus?',
    correct: 'Hera',
    incorrect: ['Aphrodite', 'Athena', 'Hestia'],
    category: 'Mythology',
    difficulty: 'easy',
    _expect: 'accept (음차 변형 확보가 관건)',
  },
  {
    sourceRef: 'otdb-sample-03',
    question: 'When was Pong released?',
    correct: 'November 29, 1972',
    incorrect: ['1975', '1969', '1981'],
    category: 'General Knowledge',
    difficulty: 'medium',
    _expect: 'reject (uniqueAnswer=false. 날짜 표기 변형 무한)',
  },
  {
    sourceRef: 'otdb-sample-04',
    question: 'Which of the following is NOT one of Aesop’s fables?',
    correct: 'The Fox and the Hound',
    incorrect: ['The Tortoise and the Hare', 'The Boy Who Cried Wolf', 'The Ant and the Grasshopper'],
    category: 'Entertainment: Books',
    difficulty: 'medium',
    _expect: 'reject (convertible=false. 보기 참조형 + NOT)',
  },
  {
    sourceRef: 'otdb-sample-05',
    question: 'In the videogame Bully, what is the protagonist’s last name?',
    correct: 'Hopkins',
    incorrect: ['Jimmy', 'Gary', 'Petey'],
    category: 'Entertainment: Video Games',
    difficulty: 'medium',
    _expect: 'reject (krAccessible 낮음. 니치 게임)',
  },
  {
    sourceRef: 'otdb-sample-06',
    question: 'What cell organelle is known as "the powerhouse of the cell"?',
    correct: 'Mitochondria',
    incorrect: ['Nucleus', 'Golgi apparatus', 'Endoplasmic reticulum'],
    category: 'Science & Nature',
    difficulty: 'medium',
    _expect: 'accept (외래어 표기 통용)',
  },
];

async function sampleProcess(model) {
  const input = SAMPLES.map(({ _expect, ...rest }) => rest);
  const { res, text } = await call(`/models/${model}:generateContent`, {
    method: 'POST',
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: JSON.stringify(input) }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    }),
  });

  console.log(`\n[verify] 샘플 가공: POST ${model} → ${res.status} ${classify(res.status)}`);
  const rl = rateLimitHeaders(res);
  if (Object.keys(rl).length) console.log('[verify] rate limit 헤더:', rl);

  if (res.status !== 200) {
    console.error('[verify] 응답:', scrub(text).slice(0, 800));
    return null;
  }

  const json = JSON.parse(text);
  const usage = json.usageMetadata ?? {};
  console.log(
    `[verify] 토큰: 입력 ${usage.promptTokenCount ?? '?'} / 출력 ${usage.candidatesTokenCount ?? '?'} / 합계 ${usage.totalTokenCount ?? '?'}`,
  );
  const raw = json.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';

  let items;
  try {
    items = JSON.parse(raw);
  } catch (err) {
    console.error('[verify] ★ JSON 파싱 실패:', err.message);
    console.error('[verify] 원본 앞부분:', raw.slice(0, 400));
    return null;
  }

  await mkdir(path.join(ROOT, 'tmp'), { recursive: true });
  const outPath = path.join(ROOT, 'tmp', 'gemini-sample-result.json');
  await writeFile(outPath, JSON.stringify({ model, usage, items }, null, 2), 'utf8');
  console.log(`[verify] 결과 저장: tmp/gemini-sample-result.json (tmp/ 는 git 제외)`);

  // 스키마 검증
  const REQUIRED = ['sourceRef', 'verdict'];
  const ACCEPT_REQUIRED = [
    'question_ko', 'displayAnswer', 'answers', 'category', 'difficulty', 'hintAnswer', 'confidence',
  ];
  console.log('\n[verify] ── 결과 요약 ──');
  let schemaOk = true;
  for (const item of items) {
    const expect = SAMPLES.find((s) => s.sourceRef === item.sourceRef)?._expect ?? '?';
    const missing = REQUIRED.filter((k) => item[k] === undefined);
    if (item.verdict === 'accept') {
      missing.push(...ACCEPT_REQUIRED.filter((k) => item[k] === undefined));
    }
    if (missing.length) schemaOk = false;

    console.log(`\n  ${item.sourceRef}  verdict=${item.verdict}`);
    console.log(`    기대: ${expect}`);
    if (item.verdict === 'reject') {
      console.log(`    사유: ${item.rejectReason ?? '(없음)'}`);
      console.log(
        `    판정: convertible=${item.convertible} uniqueAnswer=${item.uniqueAnswer} krAccessible=${item.krAccessible} koreanTerm=${item.koreanTerm}`,
      );
    } else {
      console.log(`    질문: ${item.question_ko}`);
      console.log(`    대표: ${item.displayAnswer}   힌트기준: ${item.hintAnswer}`);
      console.log(`    정답 배열(${item.answers?.length ?? 0}): ${JSON.stringify(item.answers)}`);
      console.log(`    분류: ${item.category} / ${item.difficulty} / conf=${item.confidence}`);
      console.log(`    해설: ${item.explanation ?? 'null'}`);
    }
    if (missing.length) console.log(`    ★ 누락 필드: ${missing.join(', ')}`);
  }
  console.log(`\n[verify] 스키마 검증: ${schemaOk ? '통과' : '★ 누락 필드 있음'}`);
  return items;
}

// -----------------------------------------------------------------------------
// 4. 복수 정답 배열 품질 집중 검증
//
// ★ 왜 따로 보는가
//   R002는 answers(복수 정답 배열)를 "이 파이프라인의 가장 중요한 산출물"로 규정했다.
//   게임이 fuzzy matching을 금지(guide 16절)하므로, 표기 변형을 확보하지 못하면
//   정답을 아는 사람이 계속 오답 처리되어 게임이 죽는다.
//   그런데 1차 샘플(마드리드/헤라/미토콘드리아)은 원래 변형이 적은 정답들이라
//   프롬프트의 실력이 드러나지 않았다. 변형이 많은 정답으로 따로 확인한다.
// -----------------------------------------------------------------------------
const VARIANT_SAMPLES = [
  {
    sourceRef: 'var-01',
    question: 'Which Dutch painter is famous for cutting off his own ear?',
    correct: 'Vincent van Gogh',
    incorrect: ['Rembrandt', 'Johannes Vermeer', 'Piet Mondrian'],
    category: 'Art',
    difficulty: 'easy',
    _need: '반 고흐 / 빈센트 반 고흐 / 고흐 / 반고흐 / van gogh',
  },
  {
    sourceRef: 'var-02',
    question: 'Who wrote "The Scarlet Letter", published in 1850?',
    correct: 'Nathaniel Hawthorne',
    incorrect: ['Washington Irving', 'James Fenimore Cooper', 'Herman Melville'],
    category: 'Entertainment: Books',
    difficulty: 'medium',
    _need: '너새니얼 호손 / 나다니엘 호손 / 호손',
  },
  {
    sourceRef: 'var-03',
    question: 'The Hagia Sophia was commissioned by which emperor of the Byzantine Empire?',
    correct: 'Justinian I',
    incorrect: ['Constantine IV', 'Arcadius', 'Theodosius the Great'],
    category: 'History',
    difficulty: 'hard',
    _need: '유스티니아누스 1세 / 유스티니아누스 / 유스티니아누스1세',
  },
  {
    sourceRef: 'var-04',
    question: 'Which country do the White Cliffs of Dover belong to?',
    correct: 'United Kingdom',
    incorrect: ['France', 'Ireland', 'Netherlands'],
    category: 'Geography',
    difficulty: 'medium',
    _need: '영국 / United Kingdom / UK  (★ 잉글랜드는 오답이므로 넣으면 안 된다)',
  },
  {
    sourceRef: 'var-05',
    question: 'How many countries does the United States share a land border with?',
    correct: '2',
    incorrect: ['1', '3', '4'],
    category: 'Geography',
    difficulty: 'medium',
    _need: '2 / 2개 / 둘  (숫자의 한글 표기)',
  },
  {
    sourceRef: 'var-06',
    question: 'Who created the "Metal Gear" series?',
    correct: 'Hideo Kojima',
    incorrect: ['Hiroshi Yamauchi', 'Shigeru Miyamoto', 'Gunpei Yokoi'],
    category: 'Entertainment: Video Games',
    difficulty: 'medium',
    _need: '코지마 히데오 / 히데오 코지마 / 코지마  (일본 인명 어순 변형)',
  },
];

async function variantCheck(model) {
  const input = VARIANT_SAMPLES.map(({ _need, ...rest }) => rest);
  const { res, text } = await call(`/models/${model}:generateContent`, {
    method: 'POST',
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: JSON.stringify(input) }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    }),
  });
  console.log(`\n[verify] 복수 정답 검증: ${model} → ${res.status} ${classify(res.status)}`);
  if (res.status !== 200) {
    console.error('[verify] 응답:', scrub(text).slice(0, 600));
    return null;
  }
  const json = JSON.parse(text);
  const u = json.usageMetadata ?? {};
  console.log(
    `[verify] 토큰: 입력 ${u.promptTokenCount} / 출력 ${u.candidatesTokenCount} / 합계 ${u.totalTokenCount}` +
      ` (사고 토큰 약 ${(u.totalTokenCount ?? 0) - (u.promptTokenCount ?? 0) - (u.candidatesTokenCount ?? 0)})`,
  );
  const items = JSON.parse(json.candidates[0].content.parts.map((p) => p.text).join(''));

  let total = 0;
  console.log('\n[verify] ── 복수 정답 배열 품질 ──');
  for (const item of items) {
    const need = VARIANT_SAMPLES.find((s) => s.sourceRef === item.sourceRef)?._need ?? '?';
    const n = item.answers?.length ?? 0;
    total += n;
    console.log(`\n  ${item.sourceRef}  verdict=${item.verdict}  (표기 ${n}개)`);
    console.log(`    필요: ${need}`);
    if (item.verdict === 'accept') {
      console.log(`    생성: ${JSON.stringify(item.answers)}`);
      console.log(`    대표: ${item.displayAnswer}  힌트기준: ${item.hintAnswer}`);
    } else {
      console.log(
        `    판정: convertible=${item.convertible} uniqueAnswer=${item.uniqueAnswer} krAccessible=${item.krAccessible} koreanTerm=${item.koreanTerm}`,
      );
    }
  }
  const accepted = items.filter((i) => i.verdict === 'accept').length;
  console.log(
    `\n[verify] accept ${accepted}/${items.length}, 표기 평균 ${accepted ? (total / accepted).toFixed(1) : 0}개`,
  );
  await mkdir(path.join(ROOT, 'tmp'), { recursive: true });
  await writeFile(
    path.join(ROOT, 'tmp', 'gemini-variants-result.json'),
    JSON.stringify({ model, usage: u, items }, null, 2),
    'utf8',
  );
  return items;
}

// -----------------------------------------------------------------------------
// 5. 역검증 프롬프트 (R002 2-3)
// -----------------------------------------------------------------------------
const BACKCHECK_PROMPT = `아래는 한국어 상식 퀴즈 질문이다. 보기는 없다.
각 질문에 대해 네가 생각하는 정답을 답하라.
- 정답은 가능한 한 짧은 명사구로 답한다.
- 확실하지 않으면 confidence를 낮게 준다.
- 답이 여러 개일 수 있다고 판단되면 ambiguous를 true로 하고
  가능한 답을 alternatives에 전부 나열한다.
출력은 JSON 배열만 낸다.
[{"id":"...","answer":"...","alternatives":["..."],"ambiguous":true|false,"confidence":0.0-1.0}]`;

const BACKCHECK_SAMPLES = [
  { id: 'bc-01', question: '스페인의 수도는?', _expect: '마드리드 / ambiguous=false' },
  { id: 'bc-02', question: '그리스 신화에서 제우스의 아내는 누구인가?', _expect: '헤라 / ambiguous=false' },
  { id: 'bc-03', question: '국기가 빨강과 흰색으로만 이루어진 나라는?', _expect: '★ ambiguous=true 여야 한다 (일본/캐나다/폴란드…)' },
  { id: 'bc-04', question: '안도라의 공동 영주 중 한 명은 누구인가?', _expect: '★ ambiguous=true 여야 한다 (프랑스 대통령 / 우르헬 주교)' },
  { id: 'bc-05', question: '세포의 발전소라고 불리는 세포 소기관은 무엇인가?', _expect: '미토콘드리아 / ambiguous=false' },
];

async function backcheck(model) {
  const input = BACKCHECK_SAMPLES.map(({ _expect, ...rest }) => rest);
  const { res, text } = await call(`/models/${model}:generateContent`, {
    method: 'POST',
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: BACKCHECK_PROMPT }] },
      contents: [{ parts: [{ text: JSON.stringify(input) }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: 'application/json' },
    }),
  });
  console.log(`\n[verify] 역검증: ${model} → ${res.status} ${classify(res.status)}`);
  if (res.status !== 200) {
    console.error('[verify] 응답:', scrub(text).slice(0, 600));
    return null;
  }
  const json = JSON.parse(text);
  const items = JSON.parse(json.candidates[0].content.parts.map((p) => p.text).join(''));
  console.log('\n[verify] ── 역검증 결과 ──');
  for (const item of items) {
    const expect = BACKCHECK_SAMPLES.find((s) => s.id === item.id)?._expect ?? '?';
    console.log(`\n  ${item.id}  ambiguous=${item.ambiguous}  conf=${item.confidence}`);
    console.log(`    기대: ${expect}`);
    console.log(`    답변: ${item.answer}`);
    if (item.alternatives?.length) console.log(`    대안: ${JSON.stringify(item.alternatives)}`);
  }
  return items;
}

// -----------------------------------------------------------------------------
async function main() {
  const models = await listModels();
  if (!models) process.exit(1);

  const available = new Set(models.map((m) => m.name));

  // ★ 중요: GET /models 목록에 있어도 generateContent 가 404 인 모델이 있다.
  //   R002는 gemini-2.5-flash / gemini-2.5-flash-lite 를 전제로 설계했으나,
  //   두 모델 모두 목록에는 나오지만 실제 호출 시 404 를 반환한다.
  //   "This model is no longer available to new users. Please update your code to use
  //    models/gemini-3.6-flash" (R005 1-2 실측, 2026-09-07)
  //   → 따라서 목록 존재 여부만으로 판단하면 안 되고 실제 호출로 확인해야 한다.
  const R002_ASSUMED = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  console.log('\n[verify] ── R002 전제 모델명 (목록 존재 여부) ──');
  for (const w of R002_ASSUMED) {
    console.log(`  ${w.padEnd(28)} ${available.has(w) ? '목록에 있음 (★ 호출은 별도 확인 필요)' : '목록에 없음'}`);
  }
  console.log('\n[verify] ── flash 계열 사용 가능 모델 ──');
  for (const m of models.filter((m) => /flash|pro/.test(m.name)).slice(0, 30)) {
    console.log(`  ${m.name.padEnd(40)} in=${m.inputTokenLimit} out=${m.outputTokenLimit}`);
  }

  if (MODELS_ONLY) return;

  // 실제로 쓸 모델. 앞에서부터 호출을 시도해 첫 번째로 성공하는 것을 쓴다.
  // ★ gemini-flash-latest 같은 별칭은 쓰지 않는다. 별칭은 예고 없이 가리키는 모델이 바뀌어
  //   같은 프롬프트가 다른 결과를 내게 되고, review_queue.ai_model 기록의 의미가 사라진다.
  const CANDIDATES = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];
  let model = null;
  for (const c of CANDIDATES) {
    if (!available.has(c)) continue;
    const { res } = await call(`/models/${c}:generateContent`, {
      method: 'POST',
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 8, temperature: 0 },
      }),
    });
    if (res.status === 200) {
      model = c;
      break;
    }
    console.log(`[verify] ${c} → ${res.status} ${classify(res.status)} (다음 후보로)`);
  }
  if (!model) {
    console.error('[verify] 사용 가능한 후보 모델을 찾지 못했습니다.');
    process.exit(1);
  }
  console.log(`\n[verify] 사용 모델: ${model}`);

  const ok = await minimalCall(model);
  if (!ok) process.exit(1);
  if (MINIMAL) {
    console.log('\n[verify] --minimal 모드이므로 샘플 가공은 건너뜁니다.');
    return;
  }

  if (VARIANTS) {
    await variantCheck(model);
    return;
  }
  if (BACKCHECK) {
    // 역검증은 1차 가공과 다른 모델을 쓴다 (상관관계 완화. R002 2-3)
    const bcModel = available.has('gemini-3.5-flash-lite') ? 'gemini-3.5-flash-lite' : model;
    console.log(`[verify] 역검증 모델: ${bcModel}`);
    await backcheck(bcModel);
    return;
  }

  await sampleProcess(model);
}

main().catch((err) => {
  console.error('[verify] 오류:', scrub(err?.message ?? String(err)));
  process.exit(1);
});
