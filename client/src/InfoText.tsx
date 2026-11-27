// =============================================================================
// ★★ ⓘ 안내문 (R043 B · 건우: "정말 필요한 정보만. 웹과 모바일이 달라야 한다. 말투 통일, 간략하게.")
//
// ★ 말투 하나 ("~해요") · 한 항목 한 줄 · 모바일은 스크롤 없이 한 화면.
// ★ 출처 표기는 넣지 않는다 (R042 · 건우).
// ★★ R044 C-4 — 모바일 360 에서도 한 줄 (약 22자 이하). 검사: ui-check 가 PC 5 · 모바일 3 크기에서 줄마다 한 줄인지 잰다.
// ★★ R066 (D-287) — 묶음 넷(탭): ① 놀이 ② 포인트 ③ 이모티콘 · 단축키 ④ 제보(★ R099 평가 줄 뺌 — 찬종 "평가는 나만 · 제보로").
// ★★★ R073 (D-320 · 찬종 2026-11-05 "ⓘ 안내문은 새 기능 위주로 다시 · 뻔한 내용 빼고 · 줄바꿈 없게 짧게 · 업적도 짧게") —
//   게임 좀 하면 아는 것("답은 채팅창에 · 먼저 맞힌 1명 · 40초 · 끊겨도 이어져요")은 뺐다 · 모든 줄 ≤22자 · 업적은 한 줄.
//   이모티콘 탭은 😊 안내 카드(EmojiHelp — D-318)와 같은 줄 · 끝에 [안내 다시 보기] · 놀이 탭 끝에 [처음 안내 다시 보기](투어 — D-319).
// =============================================================================

import { useState } from 'react';
import { Award, Bug, Coins, Gamepad2, Link, MessageSquareWarning, SkipForward, Smile } from 'lucide-react';
import { ACHIEVEMENTS, DRAW, FEEDBACK_ADOPT_POINTS, LIAR, RULES, SIGNUP_GIFT_POINTS, SONG_MODE, creditLinesFor, type RoomMode } from '@quiz/shared';
import { siteInfo } from './site.js';
import Icon from './Icon.js';
import { EMOJI_HELP_EXTRA, EMOJI_HELP_LINES, openEmojiHelp } from './EmojiHelp.js';
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

// ★ R123 (찬종 "설명하는 공간은 '안내' 메뉴에") — 방 설정에서 뺀 규칙 줄을 게임마다 짧게. 숫자는 상수에서 · 한 줄 ≤22자
const sec = (ms: number) => ms / 1000;
const GAME_RULES: readonly { mode: RoomMode; label: string; lines: readonly string[] }[] = [
  {
    mode: 'quiz',
    label: '퀴즈',
    lines: [
      '답은 채팅창에 쳐요.',
      '제일 먼저 맞힌 사람만 +1점이에요.',
      `한 문제는 ${sec(RULES.QUESTION_DURATION_MS)}초예요.`,
      `${sec(RULES.HINT_REVEAL_AT_MS)}초 남으면 초성 힌트가 나와요.`,
      '팀전은 짝수 인원일 때 시작해요.',
      '팀 점수는 팀원 점수를 더한 거예요.',
      '미니게임을 켜면 문제 사이에 나와요.',
    ],
  },
  {
    mode: 'draw',
    label: '캐치마인드',
    lines: [
      '출제자가 돌아가며 그려요.',
      `한 그림에 ${sec(DRAW.ROUND_MS)}초, 먼저 맞히면 끝나요.`,
      `맞힌 사람 +${DRAW.SCORE_SOLVER}점, 그린 사람 +${DRAW.SCORE_DRAWER}점이에요.`,
      `제시어는 선 긋기 전 ${sec(DRAW.REROLL_MS)}초 안에 바꿔요.`,
      `한 번은 무료, 그 뒤엔 ${DRAW.REROLL_PAID_COST}P씩(${DRAW.REROLL_PAID_MAX}번까지)`,
      `${DRAW.MIN_PLAYERS}명부터 할 수 있어요.`,
    ],
  },
  {
    mode: 'liar',
    label: '라이어',
    lines: [
      '한 명이 라이어, 키워드를 몰라요.',
      '차례로 키워드를 한 줄씩 설명해요.',
      `${sec(LIAR.DISCUSS_MS)}초 토론하고 라이어를 투표해요.`,
      '지목되면 변론하고, 죽일지 정해요.',
      `살리면 다시 투표, ${LIAR.VOTE_BOUTS}바퀴까지예요.`,
      '라이어는 끝에 키워드를 맞혀 볼 수 있어요.',
      '바보형은 라이어도 비슷한 단어를 받아요.',
      '그래서 자기가 라이어인 줄 몰라요.',
      `${LIAR.MIN_PLAYERS}명부터 할 수 있어요.`,
    ],
  },
  {
    mode: 'song',
    label: '노래',
    lines: [
      `${sec(SONG_MODE.PLAY_MS)}초 듣고 채팅으로 제목을 쳐요.`,
      `제일 먼저 맞힌 사람이 +${SONG_MODE.POINT}점이에요.`,
      `${sec(SONG_MODE.HINT_AT_MS)}초 남으면 초성 힌트가 나와요.`,
      '모르면 넘기기 투표를 해요.',
      '방 사람들이 덜 들은 곡부터 나와요.',
    ],
  },
];

export default function InfoText() {
  const [tab, setTab] = useState<TabKey>('play');
  // ★★★ R109 (D-369) — 맨 아래 작은 글 한 줄 "출처 · 라이선스" → 이 자리에서 열린다(새 창 없이 · 내용은 자리에 따라 — shared/credits.ts 정본)
  const [credits, setCredits] = useState(false);
  const [rules, setRules] = useState(false);
  const games = GAME_RULES.filter((g) => !siteInfo().hidden.modes.includes(g.mode));
  const [game, setGame] = useState<RoomMode>('quiz');
  if (rules) {
    const cur = games.find((g) => g.mode === game) ?? games[0]!;
    return (
      <div className="credits" data-rules>
        <div className="credits-head">
          <strong>게임 규칙</strong>
          <button type="button" className="link-btn" data-rules-back onClick={() => setRules(false)}>
            안내로
          </button>
        </div>
        <div className="info-tabs" role="tablist" aria-label="게임 규칙">
          {games.map((g) => (
            <button key={g.mode} type="button" role="tab" aria-selected={cur.mode === g.mode} className={cur.mode === g.mode ? 'info-tab on' : 'info-tab'} data-rules-tab={g.mode} onClick={() => setGame(g.mode)}>
              {g.label}
            </button>
          ))}
        </div>
        <ul className="info-list" data-rules-list={cur.mode}>
          {cur.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (credits) {
    return (
      <div className="credits" data-credits>
        <div className="credits-head">
          <strong>출처와 라이선스</strong>
          <button type="button" className="link-btn" data-credits-back onClick={() => setCredits(false)}>
            안내로
          </button>
        </div>
        <ul className="credit-list">
          {creditLinesFor(siteInfo().site).map((l) => (
            <li key={l.what} data-credit={l.friendOnly ? 'friend' : 'all'}>
              <span className="credit-what">{l.what}</span>
              <span className="credit-text">{l.text}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
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
            <li>난이도는 초급, 중급, 고급이에요.</li>
            <li>미니게임 섞기는 방 설정에서 켜요.</li>
            <li className="pc-only">
              <Icon icon={SkipForward} /> 넘기기 단축키는 <kbd>Alt+S</kbd>예요.
            </li>
            <li>
              <Icon icon={Link} /> 초대 링크나 6자리 코드로 들어와요.
            </li>
            <li>
              <Icon icon={Award} /> 업적 {ACHIEVEMENTS.length}종 — 프로필 → 전적과 업적
            </li>
          </ul>
          <button type="button" className="link-btn info-guide-btn" data-info-rules onClick={() => setRules(true)}>
            게임 규칙 보기
          </button>
          &emsp;
          <button type="button" className="link-btn info-guide-btn" data-info-tour onClick={() => replayTour()}>
            처음 안내 다시 보기
          </button>
        </>
      )}
      {tab === 'points' && (
        <ul className="info-list" data-info-points>
          <li>정답 하나에 1P예요.</li>
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
            <li>{EMOJI_HELP_EXTRA.pc}</li>
            <li>이모티콘은 횟수 제한이 없어요.</li>
          </ul>
          <ul className="info-list mobile-only" data-info-emoji>
            {EMOJI_HELP_LINES.mobile.map((l) => (
              <li key={l}>{l}</li>
            ))}
            <li>{EMOJI_HELP_EXTRA.mobile}</li>
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
            <Icon icon={Bug} /> 제보는 ⚙ → 제보 탭이나 <kbd>Alt+B</kbd>
          </li>
          <li className="mobile-only">
            <Icon icon={Bug} /> 제보는 ☰ → 제보예요.
          </li>
          <li>최근 문제나 미니게임을 골라 제보해요.</li>
          <li>채택된 제보는 +{FEEDBACK_ADOPT_POINTS}P예요.</li>
        </ul>
      )}
      <button type="button" className="link-btn info-credit" data-credits-open onClick={() => setCredits(true)}>
        출처와 라이선스
      </button>
    </>
  );
}
