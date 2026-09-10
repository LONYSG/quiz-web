// =============================================================================
// Gemini 프롬프트와 응답 스키마 (작업 D / E-1)
//
// ★ 출발점은 R002 2-3의 프롬프트 전문이다. 여기에 R005 A-1 실측에서 나온
//   개선 두 가지를 반영했다.
//
//   (1) ★ rejectReason 을 모델이 채우지 않았다
//       → responseSchema 의 required 에 넣어 **스키마로 강제**한다.
//         responseMimeType: application/json 만으로는 형식만 강제되고 필드는 강제되지 않는다.
//         프롬프트에도 한 줄 더 못 박았다.
//
//   (2) ★ 일본 인명의 성만 표기를 빠뜨렸다
//       R005 실측: "코지마 히데오" 에서 "코지마"(성만)를 넣지 않았다.
//       같은 배치의 서양 인명("호손")에서는 넣었으므로 지시를 이해하지 못한 것은 아니다.
//       → "서양 인명이든 동양 인명이든 동일하다" 를 명시하고 일본 인명 예시를 추가했다.
//
// ★ 프롬프트를 고치면 config.ts 의 PROMPT_VERSION 을 올린다.
//   그 값이 결과 파일에 기록되어 "어느 프롬프트가 만든 문제인가" 를 추적할 수 있다.
// =============================================================================

/** ★ 1차 가공 응답 스키마. rejectReason 을 required 에 넣어 강제한다 */
export const PROCESS_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sourceRef: { type: 'string' },
          verdict: { type: 'string', enum: ['accept', 'reject'] },
          // ★ reject 사유. accept 면 빈 문자열을 넣게 한다(null 을 허용하면 생략한다)
          rejectReason: { type: 'string' },
          convertible: { type: 'boolean' },
          uniqueAnswer: { type: 'boolean' },
          krAccessible: { type: 'integer' },
          koreanTerm: { type: 'boolean' },
          questionKo: { type: 'string' },
          displayAnswer: { type: 'string' },
          answers: { type: 'array', items: { type: 'string' } },
          hintAnswer: { type: 'string' },
          category: { type: 'string' },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
          explanation: { type: 'string' },
          answerLang: { type: 'string', enum: ['ko', 'en', 'mixed'] },
          confidence: { type: 'number' },
        },
        required: [
          'sourceRef',
          'verdict',
          'rejectReason', // ★ 이것이 R005 개선 (1)
          'convertible',
          'uniqueAnswer',
          'krAccessible',
          'koreanTerm',
          'confidence',
        ],
      },
    },
  },
  required: ['items'],
} as const;

/**
 * 역검증 응답 스키마.
 *
 * ★★ R013(p3): 세 필드를 추가했다. 근거는 R012 실측이다.
 *
 *   역검증은 "질문만 주고 답을 맞히게" 하고 **정답이 맞으면 통과**시킨다.
 *   그래서 R012에서 아래 4건이 전부 통과했다 —
 *     · "라틴어 '수소(Hydrargyrum)'에서 유래한 …수은의 원소 기호는?" → Hg
 *       ★ Hydrargyrum 은 hydro(물)+argyros(은) = '물 같은 은' 이다. 수소가 아니다
 *     · "교황 그리구리우스 7세" → 그레고리우스 7세의 오타
 *     · "'전사들의 후예'" → 「전사의 후예」
 *     · "가로와 세로 방향의 직선으로 거리 제한 없이 이동할 수 있는 기물은?" → 룩
 *       ★ 퀸도 그렇게 이동한다. "~만" 이 빠져 유일성이 깨졌다
 *
 *   ★★ 이것은 Gemini 만의 문제가 아니다. 같은 구조로 검증하므로
 *     Claude Code 생성분도 똑같이 뚫린다. R012에서 Claude Code 쪽 사실 오류가
 *     0건이었던 것은 **검증이 잡아서가 아니라 자기가 읽고 못 찾은 것**이다.
 *
 * ★ 호출을 늘리지 않는다. 같은 호출에서 함께 받는다 (지시).
 */
export const BACKCHECK_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sourceRef: { type: 'string' },
          answer: { type: 'string' },
          ambiguous: { type: 'boolean' },
          alternatives: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },

          // ── ★★ p3 추가 (R013 작업 A-1)
          /**
           * ★ 질문 문장에 사실과 다른 서술이 있는가.
           *   ★ "있다/없다" 만으로는 판정할 수 없으므로 **무엇이 어떻게 틀렸는지**를 적게 한다.
           *   ★ 정답이 아니라 **질문 문장 자체**를 검토하는 필드다.
           */
          factualIssues: { type: 'array', items: { type: 'string' } },
          /**
           * ★ 이 질문의 조건을 만족하는 다른 답이 현실에 또 있는가.
           *   ★ ambiguous 와 다르다 — ambiguous 는 "내가 답을 못 정하겠다" 이고
           *     이것은 "질문의 한정이 부족하다" 는 **질문 설계의 결함**이다.
           *   있으면 그 답을 적는다 (룩 문제라면 "퀸").
           */
          uniquenessIssue: { type: 'array', items: { type: 'string' } },
          /** ★ 고유명사 표기가 통용 표기와 다른가. 무엇을 무엇으로 고쳐야 하는지 적는다 */
          spellingIssues: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'sourceRef',
          'answer',
          'ambiguous',
          'alternatives',
          'confidence',
          // ★ required 에 넣어 강제한다. R005 교훈 —
          //   responseMimeType 만으로는 필드가 채워지지 않는다.
          'factualIssues',
          'uniquenessIssue',
          'spellingIssues',
        ],
      },
    },
  },
  required: ['items'],
} as const;

/** 카테고리 매핑 대상. DB categories 테이블의 key 와 맞춘다 */
export const CATEGORY_KEYS = [
  '일반상식',
  '역사',
  '지리',
  '과학',
  '수학',
  '자연',
  '예술',
  '음악',
  '영화',
  '문학',
  '스포츠',
  '인물',
  '기술',
  '신화',
  '언어',
  '기타',
] as const;

export interface ProcessInput {
  sourceRef: string;
  question: string;
  correct: string;
  incorrect: string[];
  category: string;
  difficulty: string;
}

/**
 * 1차 가공 프롬프트.
 *
 * ★ "통과시키는 것보다 탈락시키는 것이 안전하다" 를 앞에 둔다.
 *   이 게임은 정확 문자열 일치로만 판정하므로(guide 16절) 애매한 문제 하나가
 *   실전에 나오면 정답을 아는 사람이 계속 오답 처리되어 그 판이 죽는다.
 */
export function buildProcessPrompt(items: ProcessInput[]): string {
  return `너는 영어 4지선다 상식 퀴즈를 한국어 주관식 퀴즈로 변환하는 검수관이다.
변환 결과는 실시간 멀티플레이 퀴즈 게임에서 쓰이며, 이 게임은 정답을
"정확한 문자열 일치"로만 판정한다. 오타 허용이나 유사도 판정을 하지 않는다.
따라서 조금이라도 정답이 애매한 문제는 반드시 탈락시켜야 한다.
통과시키는 것보다 탈락시키는 것이 안전하다. 확신이 없으면 탈락시켜라.

각 문제에 대해 아래 순서로 판정한다.

[판정 1] convertible — 보기 없이 문장이 성립하는가
  다음에 해당하면 false:
  - 질문이 보기 집합을 전제한다 ("다음 중", "이들 중", "~가 아닌 것은")
  - 정답이 문장이거나 서술형이다
  - 정답이 여러 항목의 나열이다

[판정 2] uniqueAnswer — 가장 중요. 보기를 없앴을 때 정답이 유일하게 결정되는가
  다음에 해당하면 false:
  - 조건을 만족하는 답이 현실에 둘 이상 존재한다
    (예: "국기가 빨강과 흰색인 나라는?" → 일본·캐나다·폴란드·오스트리아 …)
  - 질문에 "~중 하나"가 들어 있다
  - 정답이 날짜이고 연·월·일 표기 방식이 여러 가지다
  - 정답이 숫자인데 단위·정밀도·자릿수 표기가 여러 가지다 (근사값, 범위값 포함)
  - 정답이 이유·방법·현상 설명이라 표현이 사람마다 달라진다
  정답이 "연도 하나"이거나 "개수 하나"처럼 표기가 사실상 하나뿐이면 true로 둔다.

[판정 3] krAccessible — 한국의 일반적인 성인이 이 문제를 접했을 때
  "알 수도 있겠다"고 느낄 수준인가. 1~5로 평가한다.
  5 = 한국 교과 과정이나 대중문화에서 널리 알려짐
  3 = 관심 있는 사람은 아는 수준
  1 = 해당 국가·해당 팬덤 밖에서는 사실상 아무도 모름
      (예: 영국 어린이 프로그램 조연의 성, 니치 게임의 내부 수치)
  카테고리로 판단하지 말고 문항 내용으로 판단하라.
  비디오 게임 문제라도 한국에서 유명하면 높게 평가하고,
  일반상식 문제라도 미국 지역 한정이면 낮게 평가하라.

[판정 4] koreanTerm — 정답에 대응하는 한국어 표기가 존재하는가
  - 한국어 고유 표기가 있으면 true
  - 한국에서 외래어 표기로 통용되면 true (예: 미토콘드리아, 이데올로기, 아이러니, 스택)
  - 표기가 정착되지 않아 사람마다 다르게 쓸 수밖에 없으면 false

convertible=false 또는 uniqueAnswer=false 또는 krAccessible<=2 또는 koreanTerm=false 이면
verdict="reject" 로 하고 생성 필드는 빈 문자열/빈 배열로 둔다.

★ verdict="reject" 인 경우 rejectReason 은 필수다. 반드시 채워라.
  값은 다음 중 하나로 시작한다: convertible / uniqueAnswer / krAccessible / koreanTerm
  그 뒤에 한국어로 한 문장 이유를 덧붙인다.
  예: "uniqueAnswer: 조건을 만족하는 나라가 여럿이다"
★ verdict="accept" 인 경우 rejectReason 은 빈 문자열로 둔다.

전부 통과하면 verdict="accept" 로 하고 다음을 생성한다.

[생성 1] questionKo — 한국어 질문.
  원문의 의미를 바꾸지 않는다. 보기 참조 표현을 주관식 어투로 자연스럽게 고친다.
  질문 안에 정답이 드러나지 않게 한다.
  존댓말을 쓰지 않고 "~은?", "~는 무엇인가?" 형태의 간결한 퀴즈 어투로 쓴다.

[생성 2] displayAnswer — 정답 공개 화면에 보여줄 대표 표기 하나.
  가장 표준적이고 널리 쓰이는 표기를 고른다.

[생성 3] answers — 정답 판정에 사용할 표기 변형 배열. 이 필드가 가장 중요하다.
  게임은 정확 문자열 일치로만 판정하므로, 실제 사람이 칠 법한 표기를 최대한 넣어라.
  반드시 포함할 것:
    - displayAnswer 자체
    - 원문 영어 표기 (예: Stack)
    - 한글 음차 표기의 흔한 변형 (예: 반 고흐 / 빈센트 반 고흐 / 고흐 / 반고흐)
    - ★ 인명은 성만 표기도 반드시 넣는다. 서양 인명이든 동양 인명이든 동일하다.
      예: "너새니얼 호손" → "호손" 을 넣는다
      예: "코지마 히데오" → "코지마" 를 넣는다
      예: "빈센트 반 고흐" → "반 고흐", "고흐" 를 넣는다
    - 한자어와 고유어가 함께 쓰이는 경우 양쪽
    - 숫자는 아라비아 숫자와 한글 표기 양쪽 (예: 2 / 둘)
  포함하지 말 것:
    - 명백히 틀린 답
    - 정답보다 범위가 넓은 상위 개념 (예: 정답이 "서울"인데 "한국"을 넣지 않는다)
    - ★ 정답보다 좁은 하위 개념도 넣지 않는다
      (예: 정답이 "영국"인데 "잉글랜드"를 넣지 않는다. 잉글랜드는 영국의 일부다)
    - 오타 변형 (게임이 오타를 허용하지 않는 것이 규칙이다)
  띄어쓰기 차이와 영문 대소문자 차이는 게임 엔진이 알아서 무시하므로
  그 목적만으로 변형을 추가하지 마라.

[생성 4] category — 다음 중 하나: ${CATEGORY_KEYS.join(' / ')}

[생성 5] difficulty — easy / medium / hard.
  원문 난이도를 그대로 쓰지 말고, 한국인 기준으로 다시 매긴다.

[생성 6] explanation — 한 문장 해설. 만들 수 없으면 빈 문자열.

[생성 7] hintAnswer — 힌트 생성 기준으로 삼을 정답 하나.
  보통 displayAnswer와 같지만, 대표 표기가 지나치게 길면 더 짧고 대표적인 것을 고른다.

[생성 8] answerLang — displayAnswer 가 한국어면 "ko", 영문이면 "en", 섞였으면 "mixed".

[생성 9] confidence — 판정 전체에 대한 self-confidence. 0.0~1.0.

입력 문제 목록:
${JSON.stringify(items, null, 1)}`;
}

export interface BackcheckInput {
  sourceRef: string;
  questionKo: string;
}

/**
 * 역검증 프롬프트.
 *
 * ★ 가공된 한국어 질문만 준다. 원본 정답을 절대 보여주지 않는다.
 *   정답을 보여주면 모델이 그것에 맞춰 답하므로 검증이 무의미해진다.
 *
 * ★ 한 번의 추가 호출로 세 가지를 동시에 잡는다 (R002 2-3)
 *   번역 오류 / 정답 비유일성 / 한국어 표현의 애매함
 *
 * ★ answer 값 자체를 신뢰하지 않는다 (R005 실측에서 사실 오류가 나왔다).
 *   쓰는 것은 "answers 집합과 일치하는가" 와 "ambiguous 플래그" 두 가지다.
 */
export function buildBackcheckPrompt(items: BackcheckInput[]): string {
  return `너는 한국어 주관식 퀴즈의 검증자다.
★★ 두 가지 일을 한다. **둘을 섞지 마라.**

  [일 1] 질문만 보고 정답을 맞힌다
  [일 2] ★ **질문 문장 자체를 검토한다** — 사실 오류 / 정답 유일성 / 표기

────────────────────────────────
[일 1] 정답 맞히기
────────────────────────────────
- 질문만 보고 답한다. 다른 정보는 주어지지 않는다
- 정답은 가장 표준적인 한국어 표기 하나로 답한다 (answer)
- ★ 조건을 만족하는 답이 둘 이상 있어 **네가 답을 고를 수 없으면**
  ambiguous=true 로 하고 alternatives 에 가능한 답들을 넣는다
- ★★ alternatives 에는 **서로 다른 대상**만 넣어라.
  같은 답의 표기 변형(띄어쓰기, 단위 유무, 한글/영문, 축약형)은 넣지 마라.
  옳은 예: "국기가 빨강과 흰색인 나라는?" → ["일본", "캐나다", "폴란드"]  (서로 다른 나라)
  틀린 예: "원 한 바퀴는 몇 도인가?" → ["360", "360도"]  (같은 답의 표기 변형이다)
  틀린 예: "알츠하이머는 어느 부위?" → ["뇌", "대뇌"]     (같은 부위를 가리킨다)
  ★ 표기 변형만 있는 경우 alternatives 를 빈 배열로 두고 ambiguous=false 로 한다.
- 답을 모르면 answer 를 빈 문자열로 두고 confidence 를 0 으로 한다.
  모르는 것을 추측해서 채우지 마라
- confidence 는 답에 대한 확신이다. 0.0~1.0

────────────────────────────────
[일 2] ★★ 질문 문장 검토 — 정답을 맞혔어도 반드시 한다
────────────────────────────────
★★ 이것이 이번에 새로 추가된 일이다. **정답이 맞아도 질문이 틀릴 수 있다.**
  실제로 아래 네 건이 "정답은 맞았는데 질문이 틀린" 경우로 그냥 통과했다.
  ★ 무엇을 찾아야 하는지 이 예시로 익혀라.

  ★ factualIssues — 질문 문장에 **사실과 다른 서술**이 있는가

    실패 사례 1 (어원을 틀렸다)
      질문: "라틴어 '수소(Hydrargyrum)'에서 유래한 상온에서 액체 상태인 금속
             '수은'의 원소 기호는?"
      ★ Hydrargyrum 은 그리스어 hydro(물) + argyros(은) = '물 같은 은' 이다.
        **수소가 아니다.** 수소는 Hydrogenium 이다.
      → factualIssues: ["Hydrargyrum 은 '수소'가 아니라 '물 같은 은'(hydro+argyros)을 뜻한다"]
      ★ 정답 Hg 는 맞다. 그래도 질문이 틀렸으므로 반드시 지적해야 한다.

    ★ 무엇을 볼 것인가 — 질문에 나온 다음을 하나씩 확인하라
      · 어원·유래  · 연도·시기  · 인명·지명  · 작품명·곡명·앨범명
      · 수치·단위  · 소속·국적  · 인과 관계 ("~때문에", "~하여")

    ★ 확신이 없으면 지적하되 그 사실을 함께 적어라 —
      예: ["1908년이 맞는지 확인이 필요하다. 1913년일 가능성이 있다"]
      ★ 모르는 것을 "문제없다" 로 넘기지 마라. 그것이 R012에서 놓친 이유다.
    ★ 문제가 없으면 빈 배열로 둔다.

  ★ uniquenessIssue — 이 질문의 **조건을 만족하는 다른 답이 현실에 또 있는가**

    실패 사례 2 (한정어가 빠졌다)
      질문: "체스판에서 가로와 세로 방향의 직선으로 거리 제한 없이 이동할 수 있는 기물은?"
      정답으로 의도된 것: 룩
      ★ **퀸도 가로·세로 직선으로 무제한 이동한다.** 조건을 만족하는 답이 둘이다.
      → uniquenessIssue: ["퀸도 가로·세로 직선으로 무제한 이동한다. '~만' 같은 한정이 필요하다"]
      ★ 참고: 같은 배치의 비숍 문제는 "대각선 방향으로**만**" 이라고 썼다.
        ★ 한정어 하나의 차이다. 그것을 찾는 것이 이 필드의 일이다.

    ★★ ambiguous 와 무엇이 다른가 — **정확히 구분하라**
      ambiguous       = "내가 답을 하나로 고를 수 없다"  (검증자의 상태)
      uniquenessIssue = "질문의 한정이 부족하다"          (★ 질문 설계의 결함)
      ★ 네가 의도된 답을 정확히 맞혔더라도, 조건을 만족하는 다른 답이 있으면
        uniquenessIssue 에 적어야 한다. 두 필드는 독립이다.

    ★ 특히 다음 자리에 한정어가 빠졌는지 보라
      · "~만" / "유일한" / "가장" / "최초의" / "처음으로"
      · 범위 한정 ("정규 5인제" / "국제단위계에서" / "한국에서")
    ★ 문제가 없으면 빈 배열로 둔다.

  ★ spellingIssues — 고유명사 표기가 **통용 표기와 다른가**

    실패 사례 3 (인명 오타)
      질문: "…교황 그리구리우스 7세에게 파문 철회를 요구하며…"
      → spellingIssues: ["'그리구리우스 7세' 는 '그레고리우스 7세' 의 오기다"]

    실패 사례 4 (작품명 오류)
      질문: "1996년 데뷔하여 '전사들의 후예', '캔디' 등을 히트시키며…"
      → spellingIssues: ["곡명은 '전사들의 후예' 가 아니라 '전사의 후예' 다"]

    ★ 인명·지명·작품명·기관명을 하나씩 확인하라.
    ★ 표기 변형이 여러 개 통용되는 경우(오슨/오손 웰스)는 지적하지 마라.
      ★ **틀린 표기**만 지적한다.
    ★ 문제가 없으면 빈 배열로 둔다.

────────────────────────────────
★★ 마지막 당부
────────────────────────────────
★ [일 1]에서 정답을 맞혔다고 [일 2]를 건너뛰지 마라. **그것이 바로 실패한 방식이다.**
★ 반대로 없는 문제를 만들어 내지도 마라. 확신이 없으면 그 사실을 함께 적는다.
★ 세 배열이 모두 빈 배열인 것이 정상이다. 대부분의 문제는 문제가 없다.

질문 목록:
${JSON.stringify(items, null, 1)}`;
}
