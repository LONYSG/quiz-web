// =============================================================================
// 파이프라인 자료형
//
// ★ RawQuestion 이 소스와 이후 단계의 유일한 계약이다 (pipeline/README.md 3장).
//   새 소스를 붙이는 작업 = 이 형식으로 변환하는 함수 하나를 추가하는 것이다.
//   ★ 이후 단계는 소스를 전혀 모른다. OpenTDB 는 어댑터 하나일 뿐이다.
// =============================================================================

/** 소스 원본을 공통 형식으로 옮긴 것 */
export interface RawQuestion {
  sourceId: string;
  /**
   * 소스 내 고유 식별자.
   * ★ OpenTDB 는 안정적인 ID를 주지 않으므로 질문 원문의 해시로 만든다.
   *   그러면 같은 문제를 다시 수확해도 같은 ref 가 나와 중복을 막을 수 있다.
   */
  sourceRef: string;
  lang: 'en' | 'ko' | string;
  question: string;
  correct: string;
  /** 객관식 소스만. 원래 주관식인 소스는 빈 배열 */
  incorrect: string[];
  category: string;
  difficulty: string;
  license: string;
  /** 소스 원본 전체. 나중에 규칙이 바뀌어 재가공할 때 쓴다 */
  raw?: unknown;
}

/** 규칙 필터 결과 */
export interface FilterResult {
  pass: boolean;
  /** 탈락 사유 코드. pass=true 면 빈 배열 */
  reasons: string[];
}

/** Gemini 1차 가공의 판정 부분 */
export interface AiVerdict {
  convertible: boolean;
  uniqueAnswer: boolean;
  /** 한국의 일반 성인이 "알 수도 있겠다" 고 느끼는 수준 1~5. 2 이하 탈락 */
  krAccessible: number;
  koreanTerm: boolean;
  confidence: number;
  /** ★ 거부 시 필수. responseSchema 로 강제한다 */
  rejectReason: string | null;
}

/** Gemini 1차 가공의 생성 부분 */
export interface AiGenerated {
  questionKo: string;
  displayAnswer: string;
  /** ★ 이 파이프라인의 가장 중요한 산출물 */
  answers: string[];
  hintAnswer: string | null;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard' | string;
  explanation: string;
  answerLang: 'ko' | 'en' | 'mixed' | string;
}

/** 역검증 결과 */
export interface BackcheckResult {
  answer: string;
  result: 'pass' | 'mismatch' | 'ambiguous' | 'skipped';
  confidence: number;
  /** ambiguous 일 때 모델이 제시한 다른 가능한 정답들 */
  alternatives: string[];
  note: string | null;
}

/** 규칙 검사 3종 결과 */
export interface RuleCheckResult {
  /** 질문에 정답이 들어 있는가 (들어 있으면 탈락) */
  answerInQuestion: boolean;
  /** 정규화하면 서로 같아지는 정답이 있는가 (중복 표기) */
  normalizedCollision: boolean;
  /** displayAnswer 가 answers 에 들어 있는가 */
  displayAnswerListed: boolean;
  /** 힌트를 만들 수 있는가 (D-004: 길이 1이면 만들지 않는다) */
  hintAvailable: boolean;
  /** 힌트가 정답과 같아지는가 (같으면 정답 노출이다) */
  hintEqualsAnswer: boolean;
  /** 정답 길이·형식이 게임에 적합한가 */
  answerShapeOk: boolean;
  reasons: string[];
  pass: boolean;
}

/** 검수 상태 */
export interface ReviewState {
  status: 'pending' | 'approved' | 'rejected';
  note: string | null;
}

/** processed/ 에 저장되는 항목 하나 */
export interface ProcessedItem {
  sourceId: string;
  sourceRef: string;
  verdict: 'accept' | 'reject';
  /** 어느 단계에서 탈락했는가. accept 면 null */
  rejectedAt: 'filter' | 'ai' | 'backcheck' | 'rules' | null;
  rejectReasons: string[];

  /** 원본. 재가공과 검수 판단에 필요하다 */
  source: {
    question: string;
    correct: string;
    incorrect: string[];
    category: string;
    difficulty: string;
  };

  /** 가공 결과. reject 면 부분적으로만 있거나 null */
  generated: AiGenerated | null;
  ai: AiVerdict | null;
  backcheck: BackcheckResult | null;
  rules: RuleCheckResult | null;
  review: ReviewState;

  /** 재현에 필요한 메타 */
  meta: {
    processModel: string;
    backcheckModel: string | null;
    promptVersion: string;
    processedAt: string;
    /** 이 항목에 쓴 토큰 총량(사고 토큰 포함) */
    totalTokens: number;
  };
}

/** processed/ 파일 하나 */
export interface ProcessedBatch {
  _meta: {
    sourceId: string;
    batch: string;
    processModel: string;
    backcheckModel: string;
    promptVersion: string;
    generatedAt: string;
    counts: {
      input: number;
      filtered: number;
      aiRejected: number;
      backcheckRejected: number;
      rulesRejected: number;
      accepted: number;
    };
    tokens: {
      total: number;
      prompt: number;
      output: number;
      thoughts: number;
      calls: number;
    };
    /** 429 로 중단되었는가 */
    stoppedByRateLimit: boolean;
  };
  items: ProcessedItem[];
}
