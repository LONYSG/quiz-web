// =============================================================================
// ★★ ⓘ 안내문 (R043 B · 건우: "정말 필요한 정보만. 웹과 모바일이 달라야 한다. 말투 통일, 간략하게.")
//
// ★ 말투 하나 ("~해요") · 한 항목 한 줄 · 모바일은 스크롤 없이 한 화면.
// ★ 웹 — 넘기기·이모티콘 단축키 포함 / 모바일 — 단축키 없음, 모바일 조작(👥 · ☰ · 이모티콘 버튼).
// ★ 출처 표기는 넣지 않는다 (R042 · 건우).
// =============================================================================

import { Bell, Link, Menu, SkipForward, Smile, UserPlus, Users } from 'lucide-react';
import Icon from './Icon.js';

export default function InfoText() {
  return (
    <>
      <ul className="info-list pc-only">
        <li>채팅창에 답을 치면 끝 — 가장 먼저 맞힌 1명만 1점이에요.</li>
        <li>문제는 40초 — 30초에 힌트, 15초에 초성이 열려요.</li>
        <li>
          <Icon icon={SkipForward} /> 넘기기는 버튼이나 <kbd>Alt+S</kbd> — 여럿이 누르면 넘어가요.
        </li>
        <li>
          <Icon icon={Smile} /> 이모티콘은 버튼이나 <kbd>Alt+1~0</kbd> — 내 칸에 크게 떠요.
        </li>
        <li>
          <span className="badge exp">경험</span> 이미 푼 문제는 점수가 없고, 내 정답은 가려져요.
        </li>
        <li>
          <Icon icon={Link} /> 초대에서 6자리 방 코드를 불러 주면 바로 들어와요.
        </li>
        <li>
          <Icon icon={UserPlus} /> 친구 · <Icon icon={Bell} /> 알림에서 신청하고, 방에 있는 친구에게 바로 가요.
        </li>
        <li>끊겨도 같은 링크로 돌아오면 이어져요.</li>
      </ul>
      <ul className="info-list mobile-only">
        <li>채팅창에 답을 치면 끝 — 가장 먼저 맞힌 1명만 1점이에요.</li>
        <li>문제는 40초 — 30초에 힌트, 15초에 초성이 열려요.</li>
        <li>
          <Icon icon={SkipForward} /> 넘기기 — 여럿이 누르면 넘어가요.
        </li>
        <li>
          <Icon icon={Smile} /> 이모티콘 — 내 칸에 크게 떠요.
        </li>
        <li>
          <span className="badge exp">경험</span> 이미 푼 문제는 점수가 없고, 내 정답은 가려져요.
        </li>
        <li>
          <Icon icon={Users} /> 참여자 · 점수 / <Icon icon={Menu} /> 초대 · 친구 · 알림 · 설정
        </li>
        <li>끊겨도 같은 링크로 돌아오면 이어져요.</li>
      </ul>
    </>
  );
}
