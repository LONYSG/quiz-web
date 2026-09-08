// =============================================================================
// 안내 배너 (서버 에러 / 로컬 안내)
//
// ★★ 왜 이 컴포넌트가 따로 있는가 (docs/07-DECISIONS.md D-027)
//
//   R008에서 이런 결함이 있었다.
//     문제 수를 출제 가능 수보다 크게 두고 "게임 시작" 을 누르면
//     서버가 NOT_ENOUGH_QUESTIONS 로 옳게 거부하는데, **화면에는 아무것도 뜨지 않았다.**
//     버튼은 눌렸고, 요청도 갔고, 서버도 답했다. 표시 경로만 없었다.
//
//   원인은 안내 문구를 화면마다 각자 그리고 있었기 때문이다.
//   방이 없는 화면에는 안내가 있었고 로비 화면에는 없었다.
//
//   ★ 그래서 표시 경로를 **한 곳으로 모았다.**
//     App 이 화면을 무엇으로 그리든 이 배너는 항상 같은 자리에 렌더된다.
//     개별 화면이 에러 표시를 각자 처리하지 않는다.
//     새 화면(Phase 3의 문제 화면 등)을 만들어도 표시를 빼먹을 수 없다.
// =============================================================================

export interface NoticeContent {
  /** 사람에게 보여줄 한 줄 */
  message: string;
  /** 구체적인 사유. 서버 에러의 detail 이 여기 온다 */
  detail?: string | null;
  /** 서버 에러 코드. 진단용으로 작게 표시한다 */
  code?: string | null;
}

interface Props {
  content: NoticeContent | null;
  onDismiss: () => void;
}

export default function Notice({ content, onDismiss }: Props) {
  if (!content) return null;
  return (
    <div className="notice" role="status">
      <div className="notice-body">
        <p className="notice-message">{content.message}</p>
        {/* ★ detail 에 실제 숫자가 들어 있다.
            "출제할 수 있는 문제가 53개뿐입니다. 문제 수를 53개 이하로 줄여 주세요."
            message 만 보여주면 사용자가 무엇을 해야 하는지 알 수 없다. */}
        {content.detail && <p className="notice-detail">{content.detail}</p>}
        {content.code && <p className="notice-code mono">{content.code}</p>}
      </div>
      <button type="button" className="ghost tiny" onClick={onDismiss}>
        닫기
      </button>
    </div>
  );
}
