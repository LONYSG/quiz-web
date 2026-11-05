// =============================================================================
// ★★ ⓘ 안내문 (R043 B · 건우: "정말 필요한 정보만. 웹과 모바일이 달라야 한다. 말투 통일, 간략하게.")
//
// ★ 말투 하나 ("~해요") · 한 항목 한 줄 · 모바일은 스크롤 없이 한 화면.
// ★ 출처 표기는 넣지 않는다 (R042 · 건우).
// ★★ R044 C-4 — 모바일 360 에서도 한 줄 (약 22자 이하). 검사: ui-check 가 PC 5 · 모바일 3 크기에서 줄마다 한 줄인지 잰다.
// ★★ R066 (D-287) — 묶음 넷(탭): ① 놀이 ② 포인트 ③ 이모티콘 · 단축키 ④ 제보 · 평가.
// ★★★ R073 (D-320 · 찬종 2026-11-05 "ⓘ 안내문은 새 기능 위주로 다시 · 뻔한 내용 빼고 · 줄바꿈 없게 짧게 · 업적도 짧게") —
//   게임 좀 하면 아는 것("답은 채팅창에 · 먼저 맞힌 1명 · 40초 · 끊겨도 이어져요")은 뺐다 · 모든 줄 ≤22자 · 업적은 한 줄.
//   이모티콘 탭은 😊 안내 카드(EmojiHelp — D-318)와 같은 줄 · 끝에 [안내 다시 보기] · 놀이 탭 끝에 [처음 안내 다시 보기](투어 — D-319).
// =============================================================================

import { useState } from 'react';
import { Award, Bug, Coins, Gamepad2, Link, MessageSquareWarning, SkipForward, Smile } from 'lucide-react';
import { ACHIEVEMENTS, FEEDBACK_ADOPT_POINTS, RATE_POINTS, SIGNUP_GIFT_POINTS } from '@quiz/shared';
import Icon from './Icon.js';
import { EMOJI_HELP_LINES, openEmojiHelp } from './EmojiHelp.js';
import { replayTour } from './Tour.js';

const TABS = [
  { key: 'play', label: '놀이', icon: Gamepad2 },
  { key: 'points', label: '포인트', icon: Coins },
  { key: 'emoji', label: '이모티콘', icon: Smile },
  { key: 'report', label: '제보', icon: MessageSquareWarning },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/** 뽑기 값(테마 값 — 지금 모든 테마 20P · 바뀌면 이 줄도) */
const DRAW_PRICE = 20;

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
          <ul className="info-list" data-info-play>
            <li>난이도는 초급 · 중급 · 고급이에요.</li>
            <li>미니게임 섞기는 방 설정에서 켜요.</li>
            <li className="pc-only">
              <Icon icon={SkipForward} /> 넘기기 단축키는 <kbd>Alt+S</kbd>예요.
            </li>
            <li>
              <Icon icon={Link} /> 초대 링크 · 6자리 코드로 들어와요.
            </li>
            <li>
              <Icon icon={Award} /> 업적 {ACHIEVEMENTS.length}종 — 프로필 → 전적 · 업적
            </li>
          </ul>
          <button type="button" className="link-btn info-guide-btn" data-info-tour onClick={() => replayTour()}>
            처음 안내 다시 보기
          </button>
        </>
      )}
      {tab === 'points' && (
        <ul className="info-list" data-info-points>
          <li>정답 하나에 1P예요.</li>
          <li>정답 공개 평가 {RATE_POINTS}P(세 문제 중 하나)</li>
          <li>미니게임 1~3위는 보너스 P예요.</li>
          <li>가입 선물로 {SIGNUP_GIFT_POINTS}P를 드려요.</li>
          <li>포인트샵 뽑기 한 번 {DRAW_PRICE}P예요.</li>
        </ul>
      )}
      {tab === 'emoji' && (
        <>
          <ul className="info-list pc-only" data-info-emoji>
            {EMOJI_HELP_LINES.pc.map((l) => (
              <li key={l}>{l}</li>
            ))}
            <li>이모티콘은 횟수 제한이 없어요.</li>
          </ul>
          <ul className="info-list mobile-only" data-info-emoji>
            {EMOJI_HELP_LINES.mobile.map((l) => (
              <li key={l}>{l}</li>
            ))}
            <li>이모티콘은 횟수 제한이 없어요.</li>
          </ul>
          <button type="button" className="link-btn info-guide-btn" data-info-guide onClick={() => openEmojiHelp()}>
            안내 다시 보기
          </button>
        </>
      )}
      {tab === 'report' && (
        <ul className="info-list" data-info-report>
          <li className="pc-only">
            <Icon icon={Bug} /> 제보는 ⚙ → 제보 탭 · <kbd>Alt+B</kbd>
          </li>
          <li className="mobile-only">
            <Icon icon={Bug} /> 제보는 ☰ → 제보예요.
          </li>
          <li>최근 문제 · 미니게임을 골라 제보해요.</li>
          <li>정답 공개 때 👍 😐 👎 로 평가해요.</li>
          <li>채택된 제보는 +{FEEDBACK_ADOPT_POINTS}P예요.</li>
        </ul>
      )}
    </>
  );
}
