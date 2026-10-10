// =============================================================================
// ★★ ⓘ 안내문 (R043 B · 건우: "정말 필요한 정보만. 웹과 모바일이 달라야 한다. 말투 통일, 간략하게.")
//
// ★ 말투 하나 ("~해요") · 한 항목 한 줄 · 모바일은 스크롤 없이 한 화면.
// ★ 웹 — 넘기기·이모티콘 단축키 포함 / 모바일 — 단축키 없음, 모바일 조작(👥 · ☰ · 이모티콘 버튼).
// ★ 출처 표기는 넣지 않는다 (R042 · 건우).
// ★★ R044 C-4 (건우: "줄바꿈 안 되도록 더 줄이든지 깔끔하게") — 글을 줄였다: 모바일 360 에서도 한 줄 (약 22자 이하).
//   🔔 알림을 뺐으므로(A-3) 친구 줄도 고쳤다. 검사: ui-check 가 PC 5 · 모바일 3 크기에서 줄마다 한 줄인지 잰다.
// =============================================================================

import { Link, Menu, SkipForward, Smile, UserPlus, Users } from 'lucide-react';
import Icon from './Icon.js';

export default function InfoText() {
  return (
    <>
      <ul className="info-list pc-only">
        <li>답은 채팅창에 — 먼저 맞힌 1명만 1점이에요.</li>
        <li>문제는 40초 — 30초에 힌트, 15초에 초성이 열려요.</li>
        <li>
          <Icon icon={SkipForward} /> 넘기기는 버튼이나 <kbd>Alt+S</kbd> — 여럿이 누르면 넘어가요.
        </li>
        <li>
          <Icon icon={Smile} /> 이모티콘은 버튼이나 <kbd>Alt+1~0</kbd> — 내 칸에 떠요.
        </li>
        <li>
          <span className="badge exp">경험</span> 푼 문제는 점수가 없고, 내 정답은 가려져요.
        </li>
        <li>
          <Icon icon={Link} /> 초대의 6자리 방 코드로 바로 들어와요.
        </li>
        <li>
          <Icon icon={UserPlus} /> 친구에서 신청 · 수락 · 초대를 해요.
        </li>
        <li>끊겨도 같은 링크로 오면 이어져요.</li>
      </ul>
      <ul className="info-list mobile-only">
        <li>답은 채팅창에 — 먼저 맞힌 1명만 1점이에요.</li>
        <li>40초 문제 — 30초 힌트 · 15초 초성이 열려요.</li>
        <li>
          <Icon icon={SkipForward} /> 넘기기 — 여럿이 누르면 넘어가요.
        </li>
        <li>
          <Icon icon={Smile} /> 이모티콘 — 내 칸에 떠요.
        </li>
        <li>
          <span className="badge exp">경험</span> 푼 문제는 점수 없고, 정답은 가려져요.
        </li>
        <li>
          <Icon icon={Users} /> 참여자 · 점수 / <Icon icon={Menu} /> 초대 · 친구 · 설정
        </li>
        <li>끊겨도 같은 링크로 오면 이어져요.</li>
      </ul>
    </>
  );
}
