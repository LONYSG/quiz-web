// =============================================================================
// 채팅 한 줄의 본문 렌더 (Phase 6 / Q-42 확정)
//
// ★★ 서버가 경험자의 정답을 **센티널 문자**로 치환해서 보낸다.
//   ★ 클라이언트는 그 문자를 만나면 "가려짐" 칩으로 그린다.
//   ★★ 렌더에 실패하더라도 **정답 문자열은 이미 서버에서 제거되어** 있다.
//     ★ 그것이 "서버에서 가린다" 는 규칙의 핵심이다 — 개발자 도구로도 원문이 나오지 않는다.
//
// ★ 센티널은 유니코드 사설 사용 영역(U+E000)이라 사용자가 키보드로 입력할 수 없다.
//   ★ 즉 사용자가 이 칩을 위조해 "가려진 척" 할 수 없다.
//
// ★ 마스크 길이는 정답 길이와 무관하게 **항상 칩 하나**다 (Q-35).
//   ★ 근거: 정답 길이는 힌트보다 강한 정보이고, 문제 시작 직후부터 노출되면 게임이 망가진다.
// =============================================================================

import { MASK_SENTINEL } from '@quiz/shared';

interface Props {
  text: string;
  /** 내가 보낸 메시지인가. 본인에게는 원문이 오고, 가려져 나갔다는 사실만 알린다 */
  mine: boolean;
  /** 남에게 가려져서 전송됐는가 */
  masked: boolean;
}

export default function ChatText({ text, mine, masked }: Props) {
  // ★ 본인 화면: 원문을 그대로 보여주고 옆에 표시만 붙인다 (테스트 케이스 #16)
  if (mine) {
    return (
      <span className="chat-text">
        {text}
        {masked && (
          <span className="masked-note" title="이미 풀어본 문제라 다른 사람에게는 가려져서 전송되었습니다">
            가려져서 전송됨
          </span>
        )}
      </span>
    );
  }

  if (!masked) return <span className="chat-text">{text}</span>;

  // ★ 남의 메시지: 센티널을 칩으로 바꾼다. 나머지 문자는 그대로 둔다
  const parts = text.split(MASK_SENTINEL);
  return (
    <span className="chat-text">
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && (
            <span className="masked-chip" title="이미 이 문제를 풀어본 사람이 쓴 정답이라 가렸습니다">
              가려짐
            </span>
          )}
          {part}
        </span>
      ))}
    </span>
  );
}
