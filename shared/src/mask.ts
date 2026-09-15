// =============================================================================
// 경험자 채팅의 정답 마스킹
//
// ★★ R016 (Phase 6) 에서 구현했다. 테스트는 shared/src/mask.test.ts 의 16케이스다 (R002 6-5).
//   ★ 그중 #14~#16 은 서버 파이프라인 조건이라 봇 시나리오가 맡는다 (docs/10-TESTING.md).
//
// 명세 원본: R002 6장 + Q-35(확정) + Q-42(확정) + Q-43(확정) + R003 3-3
// 현재 유효 규칙: docs/01-GAME-RULES.md
//
// 규칙 요약
//   · 대상: 해당 문제를 이미 경험한 플레이어가 QUESTION_ACTIVE 중에 보낸 메시지만
//   · 미경험자의 메시지는 절대 마스킹하지 않는다
//   · 정답이 이미 공개된 뒤(QUESTION_RESOLVED)에는 마스킹하지 않는다
//   · ★ 마스킹은 서버에서 수행한다. 클라이언트에 원문을 보내고 CSS로 가리는 방식은
//     개발자 도구로 즉시 뚫린다
//   · ★ 마스크 길이는 정답 길이와 무관하게 항상 고정이다 (Q-35).
//     "*****" 처럼 길이에 비례하는 마스크는 금지한다. 정답 길이는 힌트보다 강한 정보이며
//     문제 시작 직후부터 노출되면 게임이 망가진다
//   · Q-42 확정: 사용자가 입력할 수 없는 센티널 문자로 치환하고 클라이언트가 배지로 렌더한다
//   · Q-43 확정: 정규화 후 길이 2 이하인 정답은 메시지 전체가 정답과 정확히 같을 때만 마스킹한다
//     (그러지 않으면 정답 "달" 때문에 "달라졌네"가 마스킹되어 정상 대화가 불가능해진다)
//
// ★ 정답 판정과의 분리 (R003 3-3, R002 6-5 케이스 14)
//   마스킹은 "브로드캐스트 직전의 출력 변환"이고 정답 판정은 "수신 직후의 입력 처리"다.
//   판정은 항상 클라이언트가 보낸 원문을 입력으로 받으며, 마스킹 결과를 절대 참조하지 않는다.
//   이 분리가 깨지면 마스킹 판정 실수 하나가 정답 판정까지 망가뜨린다.
// =============================================================================

import { buildNormalizedIndex } from './normalize.js';

/**
 * 마스킹 센티널. 유니코드 사설 사용 영역(Private Use Area)이라 사용자가 키보드로
 * 입력할 수 없다. 따라서 사용자 입력과 절대 혼동되지 않는다. (Q-42)
 *
 * ★ 클라이언트는 이 문자를 만나면 "가려짐" 칩으로 렌더한다.
 *   렌더링에 실패해도 정답 문자열은 이미 서버에서 제거되었으므로 유출되지 않는다.
 */
export const MASK_SENTINEL = '';

/** Q-43: 이 길이 이하의 정답은 메시지 전체 일치일 때만 마스킹한다. */
export const MASK_SHORT_ANSWER_MAX = 2;

export interface MaskResult {
  /** 다른 사람에게 브로드캐스트할 텍스트. 마스킹이 없었다면 rawNfc와 같다. */
  text: string;
  /** 마스킹이 일어났는가. 발신자 본인 화면의 "가려져서 전송됨" 표시에 쓴다. */
  masked: boolean;
}

/**
 * 경험자의 메시지에서 정답에 해당하는 부분을 센티널로 치환한다.
 *
 * 구현 지침 (R003 3-3. 이 프로젝트에서 가장 구현 난도가 높은 부분이다)
 *   1. buildNormalizedIndex(raw) 로 rawNfc / norm / map 을 만든다
 *   2. 정답 후보를 정규화 길이 내림차순으로 정렬한다
 *      ★ 긴 것을 먼저 치환해야 짧은 정답이 긴 정답의 일부를 먼저 먹는 문제를 피한다
 *        (예: 정답이 "태조"와 "태조 이성계" 둘 다일 때)
 *   3. 각 후보를 norm 에서 찾는다
 *      · 후보의 정규화 길이가 MASK_SHORT_ANSWER_MAX 이하면 norm 전체가 후보와 같을 때만 매칭
 *      · 그 외에는 부분 포함 매칭
 *   4. 찾은 [s, e) 구간을 map 으로 rawNfc 의 구간으로 되돌린다
 *   5. 매칭 구간을 모두 수집한 뒤 한 번에 조립한다
 *      ★ 치환하면서 진행하면 인덱스가 어긋난다
 *   6. 한 메시지에 정답이 여러 번 나오면 전부 치환한다
 *
 * 한계 (문서에 명시. docs/01-GAME-RULES.md)
 *   "고무-줄" 처럼 기호를 끼우거나 "ㄱㅁㅈ" 처럼 초성으로 쓰면 막을 수 없다.
 *   완벽한 차단은 fuzzy matching을 요구하는데 guide 16절이 이를 금지한다.
 *   친구들끼리 하는 게임이므로 "무심코 흘리는 것"을 막는 수준으로 설계했다.
 *
 * @param raw            발신자가 보낸 원문
 * @param normalizedAnswers 이 문제의 정규화된 정답 집합 (메모리에 이미 로드되어 있다)
 */
export function maskAnswers(raw: string, normalizedAnswers: readonly string[]): MaskResult {
  const { rawNfc, norm, map, mapEnd } = buildNormalizedIndex(raw);
  if (norm.length === 0) return { text: rawNfc, masked: false };

  // ★ 긴 정답을 먼저 본다. 그러지 않으면 짧은 정답이 긴 정답의 앞부분을 먼저 먹는다.
  //   ★ 예: 정답이 "태조" 와 "태조 이성계" 둘 다일 때 "태조" 를 먼저 치환하면
  //     "[가려짐] 이성계" 가 되어 **나머지 절반이 그대로 남는다.**
  const candidates = [...new Set(normalizedAnswers)]
    .filter((a) => a.length > 0)
    .sort((a, b) => b.length - a.length);

  /** 이미 잡힌 정규화 구간. 겹치는 매칭은 버린다 */
  const takenNorm: { s: number; e: number }[] = [];
  /** 가릴 원문 구간 */
  const spans: { s: number; e: number }[] = [];

  const overlaps = (s: number, e: number): boolean =>
    takenNorm.some((t) => s < t.e && e > t.s);

  const take = (s: number, e: number): void => {
    if (overlaps(s, e)) return;
    takenNorm.push({ s, e });
    // ★★ 끝은 map[e] 가 아니라 mapEnd[e - 1] 이다. 근거는 buildNormalizedIndex 주석에 있다
    spans.push({ s: map[s]!, e: mapEnd[e - 1]! });
  };

  for (const cand of candidates) {
    if (cand.length <= MASK_SHORT_ANSWER_MAX) {
      // ★ Q-43 — 짧은 정답은 **메시지 전체가 정답과 같을 때만** 가린다.
      //   ★ 그러지 않으면 정답 "달" 때문에 "달라졌네" 가 가려져 정상 대화가 불가능해진다.
      if (norm === cand) take(0, norm.length);
      continue;
    }
    // ★ 한 메시지에 여러 번 나오면 전부 가린다
    let from = 0;
    for (;;) {
      const at = norm.indexOf(cand, from);
      if (at < 0) break;
      take(at, at + cand.length);
      from = at + cand.length;
    }
  }

  if (spans.length === 0) return { text: rawNfc, masked: false };

  // ★★ 찾는 중에 치환하지 않는다. 치환하면 그 뒤 인덱스가 전부 어긋난다.
  //   ★ 전부 모은 뒤 원문 순서대로 한 번에 조립한다.
  spans.sort((a, b) => a.s - b.s);
  let out = '';
  let cursor = 0;
  for (const span of spans) {
    if (span.s < cursor) continue; // 방어. 겹침은 위에서 걸렀다
    out += rawNfc.slice(cursor, span.s);
    out += MASK_SENTINEL;
    cursor = span.e;
  }
  out += rawNfc.slice(cursor);

  return { text: out, masked: true };
}
