// =============================================================================
// 질문 기계 검사 — R031 (V004 6절의 반복 오류)
//
//   blankCheck(question, answer)      질문의 빈칸(○) 개수가 정답 글자 수와 맞는가
//                                     ★ V004: '현대의 ○○○○○' 5칸 ↔ 프로메테우스 6글자 — 빈칸이 답을 잘못 가리킨다
//   roundDupCheck(items, normalize)   같은 라운드 안에서 서로 같은 소재를 묻는가
//                                     (1) 정답이 같다  (2) 한 문항의 정답이 다른 문항의 질문에 낱말로 들어 있고 **두 문항의 글이 많이 겹친다**
//                                         ★ (2) 의 겹침 기준 — 질문+해설의 한글 2글자 조각이 작은 쪽의 30% 이상
//                                           R030 실측: 정답이 다른 질문에 나오는 것만 보면 177건이 걸렸다(물고기·디즈니·날개 …) — 대부분 그냥 언급이다.
//                                           겹침 30% 이상은 5건(오일러 0.49 · 전주 · 조선왕조실록 · 갈릴레이 · 명왕성 0.29 제외)
//                                     ★ V004: 오일러 ↔ 쾨니히스베르크의 다리 문제 · 8월 아우구스투스 · 루이 14세 발레
//                                     ★ 사람이 "다른 지식" 으로 판정한 짝은 question.roundDupOk 에 이유를 적어 통과시킨다
//   assertiveWords(text)              확인한 출처 없이 쓰면 위험한 단정어 (처음·마지막·모두·평생·유일 …) — 경고만
//                                     ★ V004 의 사실 오류(칸트 평생 · 몽골 두 번 모두 태풍 · 패러데이 시작)가 전부 이 꼴
// =============================================================================
import { findAnswerInQuestion } from './answer-rules.mjs';

const BLANK = /[○◯]+/g;
const strip = (s) => (s ?? '').replace(/[\s·.\-'"]/g, '');

/** 빈칸 덩어리를 모두 이은 길이 = 정답(공백 뺀) 글자 수 여야 한다. 빈칸이 없으면 검사하지 않는다 */
export function blankCheck(question, answer) {
  const runs = (question ?? '').match(BLANK);
  if (!runs) return { ok: true, blanks: 0 };
  const blanks = runs.join('').length;
  const len = [...strip(answer)].length;
  // 빈칸이 여러 덩어리면(띄어쓰기) 덩어리 합으로 본다 — '○○ ○○○' = 악의 평범성
  return { ok: blanks === len, blanks, answerLength: len };
}

/** ★ G019 (기준서 3-1 QLEN — R055 A79): 질문은 200자를 넘지 않는다 (360 폭 정답 공개에서 넘친다)
 *  ★ G025 (15 §3-1 · R069 D-309 좁은 칸 글자 규칙): 200 → 240자 */
export const QUESTION_MAX = 240;
export function lengthCheck(question) {
  const len = [...(question ?? '')].length;
  return { ok: len <= QUESTION_MAX, length: len };
}

/**
 * items: [{ ref, question, answer, explanation? }]
 * 반환: [{ kind: 'same-answer' | 'answer-in-question', a, b, detail }]
 */
const grams2 = (s) => { const t = (s ?? '').replace(/[^가-힣]/g, ''); const o = new Set(); for (let i = 0; i + 2 <= t.length; i++) o.add(t.slice(i, i + 2)); return o; };
export function textOverlap(a, b) {
  const A = grams2(a), B = grams2(b); if (!A.size || !B.size) return 0;
  let n = 0; for (const x of A) if (B.has(x)) n++;
  return n / Math.min(A.size, B.size);
}
export const OVERLAP_MIN = 0.3;

export function roundDupCheck(items, normalize) {
  const out = [];
  const byNorm = new Map();
  for (const it of items) {
    const n = normalize(it.answer);
    if (!byNorm.has(n)) byNorm.set(n, []);
    byNorm.get(n).push(it);
  }
  for (const [, group] of byNorm) {
    if (group.length < 2) continue;
    for (let i = 1; i < group.length; i++) out.push({ kind: 'same-answer', a: group[0].ref, b: group[i].ref, detail: group[0].answer });
  }
  for (const a of items) {
    for (const b of items) {
      if (a === b) continue;
      // a 의 정답이 b 의 질문에 낱말로 들어 있다 — 한 사람이 둘 다 거저 맞힌다
      if ([...strip(a.answer)].length < 2) continue;
      if (findAnswerInQuestion(b.question, a.answer) !== 'word') continue;
      const ov = textOverlap(`${a.question} ${a.explanation ?? ''}`, `${b.question} ${b.explanation ?? ''}`);
      if (ov >= OVERLAP_MIN) out.push({ kind: 'answer-in-question', a: a.ref, b: b.ref, detail: `${a.answer} → ${b.ref} 질문 (겹침 ${ov.toFixed(2)})` });
    }
  }
  return out;
}

const ASSERTIVE = /(처음|최초|마지막|모두|평생|유일|단 하나|가장 먼저|가장 오래|끝까지)/g;
const HEDGE = /(전한다|전합니다|전하는|알려져|알려진|꼽힌|꼽는|라고 한|라고 합니다|라는 설|설이 있|이야기가|으로 보는|으로 봅니다|흔히)/;

/** 단정어 — 문장 단위로 보고, 같은 문장에 완충 표현이 있으면 넘어간다 */
export function assertiveWords(text) {
  const hits = [];
  for (const sent of (text ?? '').split(/(?<=[.?!])\s+/)) {
    const m = sent.match(ASSERTIVE);
    if (m && !HEDGE.test(sent)) hits.push({ words: [...new Set(m)], sentence: sent });
  }
  return hits;
}

/**
 * ★ G001 (V005 6절 3번) — 정답을 이루는 조각(한글 2글자 이상)이 질문에 그대로 있는가. 경고만
 *   findAnswerInQuestion 은 정답 **전체**만 본다 — 귀검사('귀신의 팔' + '검사 직업') · 한상궁('상궁' 2회)이 그래서 통과했다
 *   정답(공백·기호 뺀 한글)의 연속 조각 가운데 질문에 있는 것을 긴 것부터 모은다 (긴 조각에 들어 있는 짧은 조각은 뺀다)
 *   ★ 거성('큰 별') 같은 뜻풀이는 글자로 잡을 수 없다 — 사람이 본다
 * 반환: [{ frag, at }]  (at = 질문 안 위치)
 */
export function answerFragments(question, answer) {
  const q = (question ?? '').normalize('NFC').replace(/\s/g, '');
  const a = (answer ?? '').normalize('NFC').replace(/[^가-힣]/g, '');
  const n = a.length;
  if (n < 3) return []; // 두 글자 정답의 2글자 조각은 정답 전체 — findAnswerInQuestion 몫
  const hits = [];
  for (let k = n - 1; k >= 2; k--) {
    for (let i = 0; i + k <= n; i++) {
      const frag = a.slice(i, i + k);
      if (hits.some((h) => h.frag.includes(frag))) continue;
      const at = q.indexOf(frag);
      if (at >= 0) hits.push({ frag, at });
    }
  }
  return hits;
}

// 직접 실행하면 스스로 검사한다
if (process.argv[1]?.replace(/\\/g, '/').endsWith('pipeline/lib/question-checks.mjs')) {
  const n = (s) => s.toLowerCase().replace(/\s/g, '');
  const t = [
    ['빈칸 5 ↔ 프로메테우스 6', !blankCheck("부제 '현대의 ○○○○○'", '프로메테우스').ok],
    ['빈칸 6 ↔ 프로메테우스 6', blankCheck("부제 '현대의 ○○○○○○'", '프로메테우스').ok],
    ['빈칸 덩어리 합 ○○ ○○○ ↔ 악의 평범성', blankCheck("'○○ ○○○에 대한 보고서'", '악의 평범성').ok],
    ['빈칸 없음', blankCheck('빈칸이 없는 질문', '아무거나').ok],
    ['질문 240자 통과 (G025)', lengthCheck('가'.repeat(240)).ok],
    ['질문 241자 막힘 (G025)', !lengthCheck('가'.repeat(241)).ok],
    ['같은 정답', roundDupCheck([{ ref: 'a', question: 'x', answer: '루이 14세' }, { ref: 'b', question: 'y', answer: '루이 14세' }], n).some((d) => d.kind === 'same-answer')],
    ['정답이 다른 질문에 + 글이 겹친다', roundDupCheck([{ ref: 'a', question: '쾨니히스베르크의 일곱 다리를 한 번씩만 건너는 길이 없음을 보인 수학자는?', answer: '오일러' }, { ref: 'b', question: '오일러가 일곱 다리를 한 번씩만 건너는 길이 없음을 보인 문제는?', answer: '쾨니히스베르크의 다리 문제' }], n).some((d) => d.kind === 'answer-in-question')],
    ['정답이 다른 질문에 나오기만 한다 (통과)', !roundDupCheck([{ ref: 'a', question: '다이너마이트를 발명한 사람은?', answer: '노벨' }, { ref: 'b', question: '노벨상 시상식이 열리는 도시는?', answer: '스톡홀름' }], n).some((d) => d.kind === 'answer-in-question')],
    ['단정어 — 칸트가 평생을 산', assertiveWords('철학자 칸트가 평생을 산 곳이기도 하다.').length === 1],
    ['단정어 — 완충 있음', assertiveWords('칸트가 평생 떠나지 않았다고 전한다.').length === 0],
    ['정답 조각 — 귀검사 (V005)', answerFragments("'던전앤파이터'에서 한쪽 팔이 귀신의 팔 '귀수(鬼手)'로 변해 버린 검사 직업은?", '귀검사').some((h) => h.frag === '검사')],
    ['정답 조각 — 한상궁 (V005)', answerFragments('양미경이 연기한 수라간 상궁은 … 이 상궁을 부르던 이름은?', '한상궁').some((h) => h.frag === '상궁')],
    ['정답 조각 — 고친 귀검사 질문 (통과)', answerFragments("'던전앤파이터'의 한 기본 직업은 한쪽 팔이 붉게 뒤틀린 저주받은 손을 지닌 설정입니다.", '귀검사').length === 0],
    ['정답 조각 — 두 글자 정답은 보지 않는다', answerFragments('거성 같은 별명', '거성').length === 0],
  ];
  let ok = 0; for (const [name, pass] of t) { console.log(`${pass ? 'ok  ' : '★실패'} ${name}`); if (pass) ok++; }
  console.log(`[question-checks] ${ok}/${t.length}`); if (ok !== t.length) process.exit(1);
}
