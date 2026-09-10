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

  // ── ★★ p3 추가 (R013). 질문 문장 자체의 검토 결과
  /**
   * ★ 질문 문장에 사실과 다른 서술이 있는가. 무엇이 어떻게 틀렸는지가 들어 있다.
   *   ★ 정답이 맞아도 이것이 비어 있지 않을 수 있다 — R012에서 그런 4건이 통과했다.
   */
  factualIssues?: string[];
  /**
   * ★ 질문의 조건을 만족하는 다른 답이 현실에 또 있는가.
   *   ★ ambiguous 와 독립이다. ambiguous 는 검증자의 상태, 이것은 질문 설계의 결함이다.
   */
  uniquenessIssue?: string[];
  /** ★ 고유명사 표기가 통용 표기와 다른가 */
  spellingIssues?: string[];
}

/**
 * ★★ 격리 기록 (R013 / Q-75).
 *
 * ★ 건우 확정: **Gemini 는 버리지 않는다. 표시만 한다.**
 *   최종 확정은 Sonnet 이 한다. 그래서 Gemini 가 "탈락" 이라고 본 것은
 *   폐기가 아니라 **격리**다.
 *
 * ★ 근거 (Gemini 오판의 실측)
 *   R010: 역검증 판정이 정상 문제 6건을 **전부** 오탈락시켰다
 *   R012: 탈락 3건 중 2건이 오탈락이었다 (쐐기문자 / 카롤루스 대제)
 *   → Gemini 에게 폐기 권한을 주면 안 된다.
 */
export interface QuarantineRecord {
  /** 어느 단계에서 격리되었는가 */
  stage: 'ai' | 'backcheck' | 'rules' | 'dupe' | 'select';
  /** 격리 사유 코드들 */
  reasons: string[];
  /** ★ 사람이 읽을 상세 사유. "왜 버렸어?" 에 답할 수 있어야 한다 */
  detail: string;
  /** ★ 판정한 모델. 누가 판정했는지 알아야 신뢰도를 판단할 수 있다 */
  judgedBy: string;
  judgedAt: string;
  /** 판정 확신도 (있으면) */
  confidence?: number;
  /** 모델이 낸 대안 (있으면) */
  alternatives?: string[];
}

/**
 * ★★ 최종 확정 기록 (R013 / Q-75).
 *   ★ Sonnet 세션이 채운다. Gemini 도, 생성자인 Opus 도 채우지 않는다.
 */
export interface FinalDecision {
  verdict: 'pass' | 'drop' | 'needsRuleDecision';
  /** 왜 그렇게 판단했는가 */
  reason: string;
  /** 누가 판정했는가 */
  decidedBy: string;
  decidedAt: string;
  /** ★ 살리는 경우 추가할 표기 변형 (역검증이 낸 대안이 옳았던 경우) */
  addAnswers?: string[];
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
  /**
   * ★★ R013: 'quarantine' 을 추가했다 (Q-75).
   *   accept     통과. 적재 대상이다
   *   quarantine ★ Gemini 가 문제를 표시했다. **폐기가 아니다.** Sonnet 확정 대기
   *   reject     ★ 최종 폐기. Sonnet 이 확정한 것만 여기 온다
   *
   * ★ 기존 스크립트들은 verdict === 'accept' 로 필터링한다.
   *   quarantine 은 자동으로 제외되므로 **적재되지 않는다.** 의도한 동작이다.
   */
  verdict: 'accept' | 'quarantine' | 'reject';
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
  /**
   * ★ 생성 문제(source_id='gemini-gen')에만 있다. 가공 문제는 null 이다 (R011).
   *
   * ★ 카테고리는 **우리가 요청한 값**을 기록한다. 모델이 반환한 값이 아니다 (C-2).
   * ★ accessibility(분야)와 difficulty(문항)를 분리한 이유는 gen-prompt.ts 주석에 있다.
   */
  gen: {
    midKey: string;
    majorKey: string;
    sub: string;
    /** 이 분야를 일반적인 한국 성인이 아는가 (1~5) */
    accessibility: number;
    /** 그 분야를 아는 사람에게 이 문항이 어려운가 (1~5) */
    difficultyScore: number;
    /**
     * ★ 답을 듣고 "알아서 좋았다" 고 느끼는가 (1~5). g3 부터 (R012).
     *
     * ★ 건우 검수 결과 걸러야 할 기준이 "어려운가" 가 아니라 "알 가치가 있는가" 로 확정됐다.
     *   난이도로는 걸러내지 않는다. 이 값과 접근성으로 거른다 (Q-69).
     *   ★ g2 이전에 만든 문제에는 없다. 0 이면 미평가다.
     */
    worthKnowing: number;
    /** 모델이 "이 카테고리로는 만들 수 없다" 고 한 경우 */
    offCategory: boolean;
    offCategoryReason: string | null;
    promptVersion: string;
  } | null;
  ai: AiVerdict | null;
  backcheck: BackcheckResult | null;
  rules: RuleCheckResult | null;

  /** ★ 격리 기록 (R013). verdict='quarantine' 이면 반드시 있다 */
  quarantine?: QuarantineRecord | null;
  /** ★ Sonnet 이 채우는 최종 확정. 없으면 아직 확정되지 않았다 */
  finalDecision?: FinalDecision | null;
  /**
   * ★★ 규칙 충돌 표시 (R013 / Q-75 예외 경로).
   *
   * ★ 판정이 갈리는데 그 원인이 **개별 문제가 아니라 규칙에 있는** 경우다.
   *   실측 사례 (R012 1-4) —
   *     정답: 히에로글리프 / 신성문자 / Hieroglyph
   *     역검증 답: "상형 문자" → 집합에 없어 탈락
   *     ★ 그런데 상형문자는 **상위 개념**이다 (한자 초기 문자도 상형문자다).
   *       g3 의 "상위 개념을 넣지 마라" 규칙을 지킨 결과가 탈락이 되었다.
   *   ★★ 규칙과 판정이 충돌한다. 개별 문제를 살리고 죽이는 일이 아니라
   *     **규칙을 고쳐야 하는 신호**다. → Opus 가 봐야 한다.
   *
   * ★ 자동으로 살리거나 버리지 않는다. 규칙이 정해질 때까지 보류다.
   */
  needsRuleDecision?: boolean;
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
