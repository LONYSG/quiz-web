// =============================================================================
// 정답 표기 규칙 — 프롬프트에만 있던 것을 **코드로 옮긴 것**
//
// ★★ 왜 만들었는가 (R020)
//   R019 감사에서 `gemini-gen` 253건 중 220건(87%)에 외국어·한자 변형이 붙어 있었다.
//   프롬프트 v1·v2 는 그것을 **명시적으로 금지**하는데도 그랬다.
//   ★ 그 변형들이 실제로 해를 끼쳤다 — 질문에 정답이 노출된 6건 중 4건이 변형 때문이었다.
//
//   ★★★ 원인은 **규칙이 프롬프트에만 있었다는 것**이다.
//     프롬프트는 생성 시점의 부탁일 뿐이고, 적재는 그것을 한 번도 확인하지 않았다.
//     → 프롬프트가 바뀌거나 다른 경로(수동 입력·외부 수확)로 들어오면 또 샌다.
//
//   ★ 그래서 판정을 여기 한 곳에 두고, 감사(db-rule-audit)와 적재(pipeline-load)가 함께 쓴다.
//     ★★ 두 곳에 따로 두면 언젠가 갈라진다. R019 에서 감사기만 고치고 적재는 그대로였던 것이 그 예다.
// =============================================================================

const HANGUL = /[가-힣]/;
const LATIN = /[A-Za-z]/;
const HANJA = /[㐀-䶿一-鿿]/;
const KANA = /[぀-ヿ]/;

/**
 * ★ 낱말 경계 문자. 정답이 다른 낱말 **안에** 우연히 들어간 것과
 *   정답이 낱말로 들어간 것을 가른다.
 */
const BOUNDARY = /[\s.,!?'"()[\]{}·~:;/‘’“”–—-]/;

/**
 * ★★ 한국어 조사. 정답 뒤에 조사가 붙으면 **낱말 경계로 본다.**
 *
 * ★ 왜 필요한가 (R020) — `무궁화의 학명에 쓰이는 … 국화 이름은?` → 정답 `무궁화`.
 *   사람이 보면 명백한 노출인데 `무궁화` 뒤가 `의` 라서
 *   경계 문자로만 보면 **`substring` 으로 내려가 경고에 그친다.**
 *
 * ★ 실측으로 확인했다 — DB 1,390건 + R020 656건을 다시 재니
 *   새로 잡히는 것은 `db:33` 하나뿐이고 **오탐은 0건**이었다.
 *   ★★ 조사 뒤가 다시 경계여야 한다 — `금속은` 의 `속` 같은 것은 그래서 걸리지 않는다.
 *
 * ★ 긴 것을 먼저 둔다. `으로` 가 `로` 보다 먼저 맞아야 한다.
 */
const JOSA = [
  '으로', '에서', '에게', '이라', '부터', '까지', '처럼', '보다', '마다',
  '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '로', '도', '만', '라',
];

/**
 * 질문에 정답이 들어 있는가.
 *
 * ★★ 원문에서 판정한다. 정규화는 공백을 지워 낱말 경계를 볼 수 없게 만든다.
 *
 * @returns {'word'|'substring'|'none'}
 *   word       낱말 경계를 갖추고 들어갔다 → ★ 실제 노출. 질문을 베끼면 이긴다
 *   substring  문자열로는 있으나 낱말 경계가 아니다 → ★ 격리. 사람이 본다
 *              (예: 정답 '금' 이 '귀금속' 안에 들어간 것 — 오탐이다)
 *   none       없다
 */
export function findAnswerInQuestion(question, answer) {
  const q = (question ?? '').normalize('NFC');
  const a = (answer ?? '').normalize('NFC').trim();
  if (a.length === 0) return 'none';
  let from = 0;
  let sawSubstring = false;
  for (;;) {
    const i = q.indexOf(a, from);
    if (i < 0) break;
    sawSubstring = true;
    const before = i === 0 ? '' : q[i - 1];
    const rest = q.slice(i + a.length);
    const okBefore = before === '' || BOUNDARY.test(before);
    let okAfter = rest === '' || BOUNDARY.test(rest[0]);
    // ★ 경계 문자가 아니면 조사가 붙은 것인지 본다
    if (!okAfter) {
      for (const j of JOSA) {
        if (!rest.startsWith(j)) continue;
        const next = rest[j.length];
        if (next === undefined || BOUNDARY.test(next)) { okAfter = true; break; }
      }
    }
    if (okBefore && okAfter) return 'word';
    from = i + 1;
  }
  return sawSubstring ? 'substring' : 'none';
}

/**
 * ★ 약어·기호로 보이는가. 이런 것은 **지우지 않는다.**
 *
 * ★★ 근거: 프롬프트가 금지한 것은 "영문 **원어 표기**"(빈센트 반 고흐 → Vincent van Gogh)이지
 *   약어가 아니다. 오히려 프롬프트는 "국제 보건을 담당하는 UN 전문기구는? → WHO / 세계보건기구"를
 *   **정당한 복수 정답의 예**로 든다.
 * ★ 실제로 `VAR` `CPR` `AED` `DDoS` 는 R017~R019 가 억울함 방지로 일부러 넣은 것이다.
 */
function looksLikeAbbrev(text) {
  if (/^[A-Z0-9.\- ]+$/.test(text)) return true; // 전부 대문자
  const letters = text.replace(/[^A-Za-z]/g, '');
  const caps = (text.match(/[A-Z]/g) ?? []).length;
  if (letters.length <= 5 && caps >= 2) return true; // DDoS · LoL 같은 혼합 약어
  return letters.length <= 3; // ★ 짧은 것은 기호일 수 있다. 애매하면 지우지 않는다
}

/**
 * 표기 변형 하나를 판정한다.
 *
 * @param {string} display 대표 정답
 * @param {string} variant 변형
 * @returns {{verdict:'ok'|'drop', kind:string, why:string}}
 *
 * ★★ 세 가지를 반드시 지킨다 —
 *   (1) 대표 정답에 **한글이 없으면** 손대지 않는다.
 *       `H2O ← H₂O` / `A·B ← A*B` / `V2 ← V-2` 는 원어 표기가 아니라 **표기 방식**이다.
 *   (2) 변형에 **한글이 섞여 있으면** 손대지 않는다.
 *       ★ R020 실측 — `모델 T ← 포드 모델 T` 가 'T' 때문에 라틴으로 잡혔다. 한국어 변형이다.
 *   (3) 약어·기호는 손대지 않는다.
 */
export function classifyVariant(display, variant) {
  const d = (display ?? '').normalize('NFC');
  const v = (variant ?? '').normalize('NFC');
  if (!HANGUL.test(d)) return { verdict: 'ok', kind: 'none', why: '대표 정답이 한글이 아니다 — 표기 방식이지 원어 표기가 아니다' };
  if (HANGUL.test(v)) return { verdict: 'ok', kind: 'korean', why: '한국어 변형이다' };
  if (HANJA.test(v)) return { verdict: 'drop', kind: 'hanja', why: '한자 표기 — 프롬프트가 금지한다' };
  if (KANA.test(v)) return { verdict: 'drop', kind: 'kana', why: '가나 표기 — 프롬프트가 금지한다' };
  if (!LATIN.test(v)) return { verdict: 'ok', kind: 'none', why: '외국 문자가 아니다' };
  if (looksLikeAbbrev(v)) return { verdict: 'ok', kind: 'abbrev', why: '약어·기호로 보인다 — 애매해서 남긴다' };
  return { verdict: 'drop', kind: 'latin', why: '영문 원어 표기 — 프롬프트가 금지한다' };
}

/**
 * 문제 하나의 정답 묶음을 검사한다. 적재 게이트가 쓴다.
 *
 * ★ 반환의 뜻 —
 *   blocked  ★★ 적재하면 안 된다. 질문에 정답이 낱말로 들어 있다
 *   dropped  ★ 이 변형만 빼고 적재한다. 문제 자체는 멀쩡하다
 *   warned   ★ 통과시키되 알린다 (낱말 경계가 아닌 부분 일치 — 오탐이 많다)
 */
export function checkAnswerSet(questionText, display, variants, normalize) {
  const blocked = [];
  const dropped = [];
  const warned = [];

  // ★★ R021 — 정규화하면 대표 정답과 같아지는 변형은 죽은 행이다.
  //   ★ 정지관도 ← 정지 관도 처럼 띄어쓰기만 다른 것은 normalizeAnswer 가 이미 공백을 지우므로
  //     넣어도 판정에 영향이 없고 question_answers 행만 늘어난다.
  //   ★ R021 실측: 422개 변형 가운데 27개(6.4%)가 이것이었다. ★★ DB 에는 0개였다.
  //   ★ normalize 를 넘기지 않으면 이 검사를 건너뛰다 — 이 파일이 shared 에 의존하지 않게 하려는 것이다.
  if (typeof normalize === 'function') {
    const seen = new Set([normalize(display)]);
    const kept = [];
    for (const v of variants) {
      const nv = normalize(v);
      if (seen.has(nv)) {
        dropped.push({ answer: v, kind: 'redundant', why: '정규화하면 이미 있는 표기와 같아진다 — 넣어도 판정이 바뀜지 않는다' });
        continue;
      }
      seen.add(nv);
      kept.push(v);
    }
    variants = kept;
  }

  for (const cand of [display, ...variants]) {
    const kind = findAnswerInQuestion(questionText, cand);
    if (kind === 'word') blocked.push({ answer: cand, why: '질문에 정답이 낱말로 들어 있다' });
    else if (kind === 'substring') warned.push({ answer: cand, why: '질문에 문자열로 들어 있다 (낱말 경계는 아니다)' });
  }

  for (const v of variants) {
    const c = classifyVariant(display, v);
    if (c.verdict === 'drop') dropped.push({ answer: v, kind: c.kind, why: c.why });
  }

  return { blocked, dropped, warned };
}
