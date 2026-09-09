// =============================================================================
// 중복 판정을 LLM 에게 맡긴다 (Q-70 확정 / R012 작업 D-2)
//
// ★★ 왜 LLM 인가
//   R011에서 문자 2-그램 자카드로 "같은 정답 다른 문제" 를 구분하려 했고 실패했다.
//     실제 중복 쌍의 유사도  0.13 ~ 0.50
//     실제로 다른 문제인 쌍   0.00
//   ★ 모델이 같은 내용을 완전히 다른 문장으로 쓰기 때문에 문자열로는 갈리지 않는다.
//   ★ 건우 판단: "이 정도는 LLM 모델이 DB에 붙어서 내용 확인해서 중복 제거할 수 있다."
//
// ★★ 비용이 문제되지 않는 이유
//   후보 추리기가 압도적으로 효과가 좋다 — 실측 32,896쌍 → 12쌍 (0.036%).
//   ★ 한 호출에 여러 쌍을 묶어 물으므로 257건 검사가 호출 1회로 끝난다.
//
// ★★ 자동 폐기하지 않는다. 검수 대기다.
//   근거: R010에서 내가 만든 판정 로직이 정상 문제 6건을 **전부** 오탈락시켰다.
//   판정은 틀린다. 버리면 회복에 토큰이 들고, 남기면 사람이 한 번 보면 된다.
//
// ★ 어느 것을 남길지도 LLM 에게 묻는다 (건우 지시).
//   두 문제 중 나은 쪽을 고르게 하고, 그 이유를 남긴다.
//
// ★ 부수 이득: 중복 쌍의 정답 표기를 합치면 표기 변형이 늘어난다.
//   R010에서 "드럼 세트"/"드럼킷" 을 그렇게 얻었다.
// =============================================================================

import type { DupePair } from './dedupe.js';

/** LLM 에게 물을 한 쌍 */
export interface DupeQuestionPair {
  pairId: string;
  a: { ref: string; question: string; answer: string; category: string; accessibility: number; worthKnowing: number; answerCount: number };
  b: { ref: string; question: string; answer: string; category: string; accessibility: number; worthKnowing: number; answerCount: number };
  /** 규칙 기반 후보 추리기가 붙인 의심 강도 */
  level: DupePair['level'];
  sharedAnswer: string;
}

/** ★ 응답 스키마. required 로 필드를 강제한다 (R005 교훈) */
export const DUPE_JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pairId: { type: 'string' },
          // ★ 세 값만 허용한다. "판단 불가" 를 반드시 남긴다 —
          //   억지로 둘 중 하나를 고르게 하면 틀린 판정이 늘어난다.
          verdict: { type: 'string', enum: ['same', 'different', 'unsure'] },
          reason: { type: 'string' },
          /**
           * verdict='same' 일 때 남길 쪽.
           * ★ 빈 문자열을 enum 에 넣을 수 없다 (Gemini 가 400 을 낸다. R012 실측).
           *   그래서 "해당 없음" 을 'none' 으로 표현한다.
           */
          keep: { type: 'string', enum: ['a', 'b', 'none'] },
          keepReason: { type: 'string' },
          /**
           * ★ 부수 이득 — 두 문제의 정답 표기를 합쳤을 때
           *   남기는 쪽에 **추가할 만한 표기**가 있으면 알려준다.
           */
          mergeAnswers: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
        },
        required: ['pairId', 'verdict', 'reason', 'keep', 'confidence'],
      },
    },
  },
  required: ['items'],
} as const;

export interface DupeJudgeItem {
  pairId: string;
  verdict: 'same' | 'different' | 'unsure';
  reason: string;
  keep: 'a' | 'b' | 'none';
  keepReason?: string;
  mergeAnswers?: string[];
  confidence: number;
}

export function buildDupeJudgePrompt(pairs: readonly DupeQuestionPair[]): string {
  const list = pairs
    .map(
      (p) => `pairId "${p.pairId}"  (정답 "${p.sharedAnswer}" 가 겹친다 / 관계: ${p.level})
  A. [${p.a.category}] ${p.a.question}
     정답: ${p.a.answer}  (표기 변형 ${p.a.answerCount}개 / 접근성 ${p.a.accessibility} / 알 가치 ${p.a.worthKnowing})
  B. [${p.b.category}] ${p.b.question}
     정답: ${p.b.answer}  (표기 변형 ${p.b.answerCount}개 / 접근성 ${p.b.accessibility} / 알 가치 ${p.b.worthKnowing})`,
    )
    .join('\n\n');

  return `너는 한국어 퀴즈 문제 데이터베이스의 중복 검사자다.
아래는 **정답이 겹치는 문제 쌍**들이다. 각 쌍이 같은 문제인지 판정해라.

★★ 판정 기준 — 문장이 닮았는지가 아니다
  문장은 얼마든지 다르게 쓸 수 있다. **묻는 대상과 알아야 하는 지식이 같은가**를 본다.

  "same" (같은 문제)
    묻는 대상이 같고, 맞히기 위해 알아야 하는 지식이 같다.
    ★ 문장이 전혀 달라도 같은 문제일 수 있다. 그것이 이 판정의 핵심이다.
    예: "우디와 버즈가 나오는 픽사 애니메이션은?" 과
        "1995년 세계 최초의 3D 장편 애니메이션은?"
        → 둘 다 토이 스토리를 묻는다. **same**
    예: "9개의 교향곡을 남긴 청각 장애 작곡가는?" 과
        "교향곡 9번 '합창'을 작곡한 독일 작곡가는?"
        → 둘 다 베토벤을 묻는다. **same**

  "different" (다른 문제)
    정답이 같더라도 묻는 대상과 필요한 지식이 다르다.
    예: "한국어 '빵'은 어느 나라 언어에서 왔는가?" (어원 지식) 과
        "브라질의 공용어는?" (지리 지식)
        → 둘 다 답이 포르투갈어지만 **different**
    예: "가장 넓은 대양은?" 과 "태평양에 접한 대륙이 아닌 것은?"
        → 묻는 것이 다르다

  "unsure" (판단 불가)
    ★ 억지로 고르지 마라. 애매하면 unsure 로 두고 이유를 적어라.
    사람이 확인할 것이므로 unsure 가 틀린 판정보다 낫다.

★★ verdict="same" 이면 **어느 쪽을 남길지** 고르고 이유를 적어라 (keep: "a" 또는 "b")
  ★ verdict 가 "different" 나 "unsure" 면 keep 을 "none" 으로 둔다.
  남길 쪽을 고르는 기준, 중요한 순서대로 —
    1. ★ 정답이 유일하게 결정되는가. 조건이 더 분명한 쪽을 남긴다
    2. ★ 알 가치가 높은 쪽 (답을 듣고 "알아서 좋았다" 고 느끼는 쪽)
    3. 접근성이 높은 쪽 (더 많은 사람이 아는 분야)
    4. 표기 변형이 많은 쪽 (이 게임은 정확 문자열 일치로만 판정한다)
    5. 질문이 간결한 쪽 (30초 안에 읽어야 한다)

★ mergeAnswers — 버리는 쪽의 정답 표기 중 **남기는 쪽에 추가하면 좋을 것**이 있으면 넣어라.
  ★ 같은 대상의 다른 표기만 넣는다. 다른 대상이나 상위·하위 개념은 넣지 마라.
  없으면 빈 배열로 둔다.

★ confidence 는 판정에 대한 자기 확신이다. 0.0~1.0

문제 쌍 목록 (${pairs.length}쌍):

${list}`;
}

/** DupePair 를 LLM 질문 형태로 바꾼다 */
export function toDupeQuestionPairs(
  pairs: readonly DupePair[],
  lookup: (ref: string) => {
    question: string;
    answer: string;
    category: string;
    accessibility: number;
    worthKnowing: number;
    answerCount: number;
  } | undefined,
): DupeQuestionPair[] {
  const out: DupeQuestionPair[] = [];
  for (const [i, p] of pairs.entries()) {
    const a = lookup(p.a);
    const b = lookup(p.b);
    if (!a || !b) continue;
    out.push({
      pairId: `p${i + 1}`,
      a: { ref: p.a, ...a },
      b: { ref: p.b, ...b },
      level: p.level,
      sharedAnswer: p.sharedAnswer,
    });
  }
  return out;
}
