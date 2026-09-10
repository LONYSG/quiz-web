// =============================================================================
// Gemini API 클라이언트 (작업 A)
//
// ★★ 비밀값 취급 — 이 파일에서 가장 중요한 규칙
//   · 키는 환경변수 GEMINI_API_KEY 에서만 읽는다. 하드코딩·기본값을 두지 않는다
//   · ★ 키 값을 로그·에러 메시지·반환값 어디에도 넣지 않는다. 앞 4자리도 안 된다
//   · ★ API 응답 본문을 그대로 던지지 않는다. scrub() 으로 키를 지운다.
//     구글이 에러 메시지에 요청 내용을 되돌려주는 경우가 있다
//   · 키를 쿼리스트링이 아니라 x-goog-api-key 헤더로 보낸다.
//     쿼리스트링은 프록시·서버 로그에 남는다
//
// ★ 429 처리 (Q-54 확정: "429 가 나오면 그날 중단")
//   · 429 를 받으면 상태 파일에 rateLimited=true 를 남기고 RateLimitError 를 던진다
//   · 호출자는 그것을 잡아 배치를 중단하고, 지금까지의 결과를 저장한다
//   · ★ 429 를 재시도하지 않는다. 일일 한도라면 재시도가 무의미하고
//     분당 한도라도 그날 중단 규칙이 있으므로 재시도할 이유가 없다
//
// ★ 503 은 다르다
//   "experiencing high demand" 는 일시적이다. R010에서 실측했다.
//   ★ 503 을 "쓸 수 없다" 로 단정하면 잘못된 모델을 고르게 된다. 재시도한다.
// =============================================================================

import { LIMITS } from './config.js';
import {
  closeSegment,
  currentSegment,
  noteCallSucceeded,
  noteRateLimited,
  saveState,
  type DayState,
} from './budget.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** ★ 429 전용 오류. 호출자가 "그날 중단" 을 판단하는 신호다 */
export class RateLimitError extends Error {
  constructor(public readonly detail: string) {
    super(`429 rate limit: ${detail}`);
    this.name = 'RateLimitError';
  }
}

/** 예산 상한에 걸려 더 호출하지 않는 경우 */
export class BudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetError';
  }
}

export interface Usage {
  prompt: number;
  output: number;
  thoughts: number;
  total: number;
}

export interface CallResult<T> {
  value: T;
  usage: Usage;
  model: string;
  attempts: number;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 재시도할 상태 코드. ★ 429 는 여기 없다. 그날 중단이 규칙이다 */
const RETRY_STATUS = new Set([500, 502, 503, 504]);

export interface ClientOptions {
  /** 저장소 루트. 상태 파일 경로 계산에 쓴다 */
  root: string;
  /** 오늘 상태. 토큰·건수 누적을 여기에 쌓는다 */
  state: DayState;
  /** 로그 출력 함수 */
  log?: (message: string) => void;
}

export class GeminiClient {
  private readonly apiKey: string;
  private lastCallAt = 0;

  constructor(private readonly opts: ClientOptions) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error(
        'GEMINI_API_KEY 가 없습니다. 로컬은 .env, Actions 는 Secrets 를 env 로 주입합니다.',
      );
    }
    this.apiKey = key;
  }

  /** ★ 문자열에서 키를 지운다. 로그·에러로 나가는 모든 텍스트가 이것을 지난다 */
  private scrub(text: string): string {
    if (!text) return '';
    return text.split(this.apiKey).join('<REDACTED>');
  }

  private log(message: string): void {
    this.opts.log?.(message);
  }

  /** 분당 요청 한도를 넘지 않도록 호출 간 최소 간격을 지킨다 */
  private async pace(): Promise<void> {
    const since = Date.now() - this.lastCallAt;
    if (since < LIMITS.minIntervalMs) await sleep(LIMITS.minIntervalMs - since);
    this.lastCallAt = Date.now();
  }

  /**
   * 구조화 출력(responseSchema)으로 한 번 호출한다.
   *
   * ★ responseSchema 를 쓰는 이유: rejectReason 같은 필드를 **필수로 강제**할 수 있다.
   *   자유 텍스트로 받으면 모델이 이유를 생략하고, 그러면 필터 품질을 평가할 근거가 없다.
   */
  async generate<T>(
    model: string,
    prompt: string,
    schema: unknown,
    opts: { temperature?: number; maxOutputTokens?: number; maxAttempts?: number } = {},
  ): Promise<CallResult<T>> {
    // ★ 호출 전에 토큰 상한을 확인한다. 상한을 넘겨 호출한 뒤 후회하지 않는다.
    if (this.opts.state.tokens >= LIMITS.dailyTokens) {
      throw new BudgetError(
        `오늘 토큰 상한 도달: ${this.opts.state.tokens}/${LIMITS.dailyTokens}`,
      );
    }

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0,
        maxOutputTokens: opts.maxOutputTokens ?? 8192,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    };

    let attempt = 0;
    for (;;) {
      attempt += 1;
      await this.pace();

      const res = await fetch(`${BASE}/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.apiKey, // ★ 쿼리스트링이 아니라 헤더
        },
        body: JSON.stringify(body),
      });
      const text = this.scrub(await res.text());

      // ── 429: ★ 재시도하지 않는다. 호출자가 대기·재개를 판단한다 (Q-62 (B))
      if (res.status === 429) {
        const detail = this.extractError(text);
        this.opts.state.rateLimited = true;
        this.opts.state.rateLimitedAt = new Date().toISOString();
        this.opts.state.rateLimitHits = (this.opts.state.rateLimitHits ?? 0) + 1;
        // ★★ 재개 직후의 429 인가. 그렇다면 그 재개를 실패로 확정한다 (Q-78).
        //   ★ 그러면 canResume 이 false 가 되어 그날은 더 재개하지 않는다.
        noteRateLimited(this.opts.state);
        // ★ 이 구간을 429 로 닫는다. 구간별 소비량이 한도 측정의 원천 데이터다
        closeSegment(this.opts.state, true);
        await saveState(this.opts.root, this.opts.state);
        this.log(`[gemini] ★ 429 (${this.opts.state.rateLimitHits}번째) — ${detail}`);
        throw new RateLimitError(detail);
      }

      // ── 일시적 오류: 재시도
      if (RETRY_STATUS.has(res.status)) {
        // ★ 상위 모델의 503 은 "낭비된 요청" 이다. R010에서 이것이 429 를 자초했다.
        //   실제로 몇 건인지 세어 보고한다 (R011 작업 A·B).
        if (!this.opts.state.wastedRequests) this.opts.state.wastedRequests = {};
        this.opts.state.wastedRequests[model] =
          (this.opts.state.wastedRequests[model] ?? 0) + 1;
        const maxAttempts = opts.maxAttempts ?? LIMITS.maxRetries;
        if (attempt >= maxAttempts) {
          throw new Error(
            `${model} 호출 실패 (${res.status}, ${attempt}회 시도): ${this.extractError(text)}`,
          );
        }
        const wait = LIMITS.backoffBaseMs * 2 ** (attempt - 1);
        this.log(`[gemini] ${res.status} — ${wait}ms 후 재시도 ${attempt + 1}/${maxAttempts}`);
        await sleep(wait);
        continue;
      }

      if (res.status !== 200) {
        throw new Error(`${model} 호출 실패 (${res.status}): ${this.extractError(text)}`);
      }

      // ── 성공
      const json = JSON.parse(text) as {
        candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          thoughtsTokenCount?: number;
          totalTokenCount?: number;
        };
      };

      const usage: Usage = {
        prompt: json.usageMetadata?.promptTokenCount ?? 0,
        output: json.usageMetadata?.candidatesTokenCount ?? 0,
        thoughts: json.usageMetadata?.thoughtsTokenCount ?? 0,
        total: json.usageMetadata?.totalTokenCount ?? 0,
      };

      // ★★ 호출이 성공했다. 대기 중인 재개가 있으면 성공으로 확정한다 (Q-78 (B)).
      //   ★ 그러면 재개 한도가 돌아오고, 같은 날 다른 스크립트도 돌 수 있다.
      noteCallSucceeded(this.opts.state);

      // ★ 토큰과 호출 수를 즉시 누적한다. 실패해도 소비된 것은 기록한다.
      this.opts.state.tokens += usage.total;
      this.opts.state.calls += 1;
      // ★ 구간에도 누적한다. 429 사이 구간별 소비량이 한도 측정의 원천 데이터다
      const seg = currentSegment(this.opts.state);
      seg.tokens += usage.total;
      seg.calls += 1;

      const raw = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const finish = json.candidates?.[0]?.finishReason;
      if (!raw) {
        throw new Error(
          `${model} 응답이 비어 있다 (finishReason=${finish ?? '?'}). ` +
            `maxOutputTokens 가 부족하거나 안전 필터에 걸렸을 수 있다.`,
        );
      }

      let value: T;
      try {
        value = JSON.parse(raw) as T;
      } catch {
        // ★ 응답 전문을 그대로 던지지 않는다. 앞부분만 보여준다.
        throw new Error(`${model} 응답이 JSON 이 아니다: ${raw.slice(0, 200)}`);
      }
      return { value, usage, model, attempts: attempt };
    }
  }

  /**
   * ★ 모델 체인으로 호출한다. 앞의 것부터 시도하고 재시도 상한까지 실패하면 다음으로 넘어간다.
   *
   * ★ 왜 필요한가 (R010 실측)
   *   상위 모델은 503 "experiencing high demand" 가 자주 난다.
   *   품질 차이가 없는데 한 모델에 매달려 배치를 실패시키는 것은 손해다.
   *   ★ 그러나 어떤 모델이 실제로 답했는지는 반드시 반환한다(CallResult.model).
   *     그 값을 기록하지 않으면 "이 문제는 어떤 모델이 만들었나" 가 거짓이 된다.
   *
   * ★ 429 와 예산 초과는 체인을 타지 않고 즉시 던진다.
   *   그것은 모델 문제가 아니라 한도 문제이므로 다음 모델도 똑같이 막힌다.
   */
  async generateWithChain<T>(
    chain: readonly string[],
    prompt: string,
    schema: unknown,
    opts: { temperature?: number; maxOutputTokens?: number } = {},
  ): Promise<CallResult<T>> {
    let lastError: unknown = null;
    for (let i = 0; i < chain.length; i += 1) {
      const model = chain[i]!;
      const isFinal = i === chain.length - 1;
      // ★ 상위 모델은 한 번만 시도한다. 재시도로 요청을 낭비하면 429 를 자초한다.
      //   마지막 모델은 더 내려갈 곳이 없으므로 끝까지 재시도한다.
      const maxAttempts = isFinal ? LIMITS.maxRetries : LIMITS.attemptsForNonFinalModel;
      try {
        const r = await this.generate<T>(model, prompt, schema, { ...opts, maxAttempts });
        if (i > 0) this.log(`[gemini] ★ ${chain[0]} 대신 ${model} 로 처리했다 (상위 모델 과부하)`);
        return r;
      } catch (err) {
        // ★ 한도 문제는 모델을 바꿔도 해결되지 않는다. 즉시 올린다.
        if (err instanceof RateLimitError || err instanceof BudgetError) throw err;
        lastError = err;
        const next = chain[i + 1];
        this.log(
          `[gemini] ${model} 실패 (${(err as Error).message.slice(0, 80)})` +
            (next ? ` → ${next} 로 내려간다` : ' → 더 내려갈 모델이 없다'),
        );
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(`모델 체인 전부 실패: ${chain.join(', ')}`);
  }

  /** ★ 에러 본문에서 사람이 볼 부분만 짧게 뽑는다. 전문을 그대로 남기지 않는다 */
  private extractError(text: string): string {
    try {
      const j = JSON.parse(text) as { error?: { status?: string; message?: string } };
      return `${j.error?.status ?? ''} ${(j.error?.message ?? '').slice(0, 200)}`.trim();
    } catch {
      return text.slice(0, 200);
    }
  }
}
