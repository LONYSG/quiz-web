// =============================================================================
// 토스트 알림 (서버 에러 / 로컬 안내)
//
// ★★ 왜 이 컴포넌트가 따로 있는가 (docs/07-DECISIONS.md D-027 → D-032)
//
//   R008에서 "서버가 거부했는데 화면에 아무것도 뜨지 않는" 결함을 고치며
//   표시 경로를 한 곳으로 모았다. 그때는 문서 흐름 맨 위에 배너로 넣었다.
//
//   ★ R009에서 그것이 절반만 이룬 것임이 드러났다.
//     로비는 채팅·참가자 목록 때문에 스크롤이 길다. 아래쪽을 보고 있으면
//     배너가 화면 밖이어서, **스크롤을 최상단까지 올려야 보였다.**
//     "표시 경로를 만들었다" 는 달성했지만 "사람 눈에 도달한다" 는 미완이었다.
//
//   → 화면 고정(fixed) 토스트로 바꿨다. 스크롤 위치와 무관하게 보인다.
//
// ★ 위치를 아래(bottom)로 정한 근거 — D-032
//   1. ★ Phase 3의 문제 지문과 남은 시간은 화면 **위쪽**에 온다.
//      아래에 두면 그것을 절대 가리지 않는다. 30초 승부의 핵심 정보다
//   2. 페이지가 이미 아래쪽 64px 를 비워 두고 있어(.wrap padding-bottom),
//      겹치는 것은 진단용 표시(시계 오프셋)뿐이다. 조작 대상은 그 위에 있다
//   3. 사용자의 시선과 손이 이미 아래(입력창)에 있다
//   ★ 한계: iOS 에서 소프트 키보드가 열리면 fixed 요소가 키보드 뒤로 갈 수 있다.
//     지금은 다루지 않는다(09-BACKLOG). 에러는 대부분 버튼을 누를 때 나고,
//     그때는 키보드가 닫혀 있다.
//
// ★ 뒤쪽 조작을 막지 않는다
//   레이어는 pointer-events:none 이고 토스트 자신만 auto 다.
//   시각적으로 겹쳐도 그 아래 버튼을 누를 수 있다.
//
// ★ 단순하게 유지한다 (지시)
//   에러 중요도별 분류 / 호버 시 타이머 정지 / 여러 개 쌓기 — 만들지 않는다.
//   한 번에 하나만 보여주고, 같은 것이 다시 오면 타이머만 다시 시작한다.
// =============================================================================

import { useEffect } from 'react';

/**
 * 자동 만료 시간.
 *
 * ★ 근거: 최악의 경우 세 줄 합계가 약 70~90자다.
 *   "출제할 수 있는 문제가 부족합니다." (18자)
 *   "출제할 수 있는 문제가 53개뿐입니다. 문제 수를 53개 이하로 줄여 주세요. (요청 200개)" (약 55자)
 *   "NOT_ENOUGH_QUESTIONS" (진단용. 읽지 않아도 된다)
 *   한국어를 초당 10~13자로 읽으면 6~9초가 필요하다. 그 중간인 7초로 잡았다.
 * ★ 부족하면 닫기 없이 다시 시도하면 같은 토스트가 다시 뜬다(타이머도 다시 시작된다).
 *   그래서 짧게 잡아도 정보가 영구히 사라지지 않는다.
 */
export const TOAST_DURATION_MS = 7000;

export interface ToastContent {
  /** 사람에게 보여줄 한 줄 */
  message: string;
  /** 구체적인 사유. 서버 에러의 detail 이 여기 온다 */
  detail?: string | null;
  /** 서버 에러 코드. 진단용으로 작게 표시한다 */
  code?: string | null;
}

interface Props {
  content: ToastContent | null;
  onDismiss: () => void;
}

export default function Toast({ content, onDismiss }: Props) {
  /**
   * 자동 만료.
   *
   * ★ 같은 에러가 연달아 와도 쌓이지 않는 이유가 여기 있다.
   *   App 이 에러마다 **새 객체**를 넣으므로 content 의 identity 가 바뀌고,
   *   이 effect 가 다시 실행되면서 이전 타이머를 정리하고 새로 건다.
   *   즉 "같은 코드면 기존 것의 타이머만 갱신" 이 별도 장치 없이 성립한다.
   *   ★ 표시 슬롯이 하나뿐이라 개수 상한도 자동으로 1개다.
   */
  useEffect(() => {
    if (!content) return undefined;
    const timer = setTimeout(onDismiss, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [content, onDismiss]);

  if (!content) return null;

  return (
    <div className="toast-layer">
      <div className="toast" role="status">
        <div className="toast-body">
          <p className="toast-message">{content.message}</p>
          {/* ★ detail 에 실제 숫자와 해야 할 일이 있다. 이것을 빼면
              "왜 안 되는지 모른다" 는 원래 결함으로 되돌아간다. */}
          {content.detail && <p className="toast-detail">{content.detail}</p>}
          {content.code && <p className="toast-code mono">{content.code}</p>}
        </div>
        <button type="button" className="ghost tiny" onClick={onDismiss}>
          닫기
        </button>
      </div>
    </div>
  );
}
