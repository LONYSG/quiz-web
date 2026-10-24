// =============================================================================
// ★★ ⓘ 안내문 (R043 B · 건우: "정말 필요한 정보만. 웹과 모바일이 달라야 한다. 말투 통일, 간략하게.")
//
// ★ 말투 하나 ("~해요") · 한 항목 한 줄 · 모바일은 스크롤 없이 한 화면.
// ★ 웹 — 넘기기·이모티콘 단축키 포함 / 모바일 — 단축키 없음, 모바일 조작(👥 · ☰ · 이모티콘 버튼).
// ★ 출처 표기는 넣지 않는다 (R042 · 건우).
// ★★ R044 C-4 (건우: "줄바꿈 안 되도록 더 줄이든지 깔끔하게") — 글을 줄였다: 모바일 360 에서도 한 줄 (약 22자 이하).
//   🔔 알림을 뺐으므로(A-3) 친구 줄도 고쳤다. 검사: ui-check 가 PC 5 · 모바일 3 크기에서 줄마다 한 줄인지 잰다.
// ★★ R066 (D-287 · 찬종 #39 "이런 설명 다 빼버려 … i 아이콘을 만들어놓고 왜 안써? i 안내 이 기회에 다시 재편해") —
//   묶음 넷(탭): ① 놀이 ② 포인트(얻는 길 넷 · 쓰는 곳) ③ 이모티콘 · 단축키 ④ 제보 · 평가. 화면 곳곳의 설명 문장은 여기로만.
// =============================================================================

import { useState } from 'react';
import { Coins, Gamepad2, Link, Menu, MessageSquareWarning, SkipForward, Smile, Users } from 'lucide-react';
import { FEEDBACK_ADOPT_POINTS, SIGNUP_GIFT_POINTS } from '@quiz/shared';
import Icon from './Icon.js';
import { openEmojiGuide } from './EmojiGuide.js';

const TABS = [
  { key: 'play', label: '놀이', icon: Gamepad2 },
  { key: 'points', label: '포인트', icon: Coins },
  { key: 'emoji', label: '이모티콘', icon: Smile },
  { key: 'report', label: '제보', icon: MessageSquareWarning },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function InfoText() {
  const [tab, setTab] = useState<TabKey>('play');
  return (
    <>
      <div className="info-tabs" role="tablist" aria-label="안내">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'info-tab on' : 'info-tab'} data-info-tab={t.key} onClick={() => setTab(t.key)}>
            <Icon icon={t.icon} /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'play' && (
        <>
          <ul className="info-list pc-only">
            <li>답은 채팅창에 — 먼저 맞힌 1명만 1점이에요.</li>
            <li>문제는 40초 — 30초에 힌트, 15초에 초성이 열려요.</li>
            <li>
              <Icon icon={SkipForward} /> 넘기기는 버튼이나 <kbd>Alt+S</kbd> — 여럿이 누르면 넘어가요.
            </li>
            <li>
              <span className="badge exp">경험</span> 푼 문제는 점수가 없고, 내 정답은 가려져요.
            </li>
            <li>
              <Icon icon={Link} /> 초대의 6자리 방 코드로 바로 들어와요.
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
              <span className="badge exp">경험</span> 푼 문제는 점수 없고, 정답은 가려져요.
            </li>
            <li>
              <Icon icon={Users} /> 참여자 · 점수 / <Icon icon={Menu} /> 초대 · 친구 · 설정
            </li>
            <li>끊겨도 같은 링크로 오면 이어져요.</li>
          </ul>
        </>
      )}
      {tab === 'points' && (
        <ul className="info-list" data-info-points>
          <li>문제 하나 맞히면 1P예요.</li>
          <li>미니게임 1~3위는 보너스 P가 있어요.</li>
          <li>제보가 채택되면 {FEEDBACK_ADOPT_POINTS}P예요.</li>
          <li>가입 선물로 {SIGNUP_GIFT_POINTS}P를 드려요.</li>
          <li>포인트는 포인트샵에서 이모티콘에 써요.</li>
        </ul>
      )}
      {tab === 'emoji' && (
        <>
          <ul className="info-list pc-only">
            <li>
              <kbd>Alt+1~0</kbd> 또는 자리를 누르면 바로 보내요.
            </li>
            <li>✎ 또는 숫자 자리를 눌러 자리를 바꿔요.</li>
            <li>Shift+클릭 · 길게 누르면 입력창에 넣어요.</li>
            <li>특별 이모티콘은 크게 떠요 — 5초에 5번까지.</li>
          </ul>
          <ul className="info-list mobile-only">
            <li>자리를 누르면 바로 보내요.</li>
            <li>✎ 또는 숫자 자리로 자리를 바꿔요.</li>
            <li>길게 누르면 입력창에 넣어요.</li>
            <li>특별 이모티콘은 5초에 5번까지예요.</li>
          </ul>
          <button type="button" className="link-btn info-guide-btn" data-info-guide onClick={() => openEmojiGuide()}>
            이모티콘 가이드 다시 보기
          </button>
        </>
      )}
      {tab === 'report' && (
        <ul className="info-list">
          <li>
            <Icon icon={MessageSquareWarning} /> 제보 — 최근 문제 · 미니게임에서 골라요.
          </li>
          <li>일반 제보는 버그 · 어색함 · 제안이에요.</li>
          <li>정답 공개 때 👍/👎 로 문제를 평가해요.</li>
          <li>채택된 제보 · 평가는 {FEEDBACK_ADOPT_POINTS}P예요.</li>
        </ul>
      )}
    </>
  );
}
