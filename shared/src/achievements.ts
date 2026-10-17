// =============================================================================
// ★★ 업적 정의 (R054 · D-243) — 표시만(포인트 · 꾸미기 보상 없음 — docs/17 2절 · 찬종 결정 전)
//
// ★ 찬종(17 3절 후보): 첫 정답 · 연속 정답 · 분야별 N문제 · 미니게임 1위 N회 · 케이크 0.01초 이내 · 갓챠 테마 완성.
// ★ 모두 **기존 표로 판정 가능한 것만**(answer_events · minigame_* · account_emojis) — 판정 SQL 은 server/src/db/achievementsSql.ts 한 곳.
//   달성 기록은 achievements(account_id, key) UNIQUE — 같은 업적은 한 번만. 소급 scripts/achievements-backfill.mjs.
// ★ 등급 없음 · 순서 = 표시 순서.
// =============================================================================

import { GAME_TOPICS } from './settings.js';

export interface AchievementDef {
  key: string;
  /** 이름(토스트 · 채팅 한 줄 · 프로필) */
  name: string;
  /** 얻는 조건(못 얻은 것은 흐리게 + 이 글) */
  desc: string;
  group: 'quiz' | 'topic' | 'minigame' | 'collect';
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { key: 'first-correct', name: '첫 정답', desc: '퀴즈 문제를 처음 맞혔다', group: 'quiz' },
  { key: 'streak-3', name: '연속 정답 3', desc: '한 판에서 문제를 3개 연달아 맞혔다', group: 'quiz' },
  { key: 'streak-5', name: '연속 정답 5', desc: '한 판에서 문제를 5개 연달아 맞혔다', group: 'quiz' },
  { key: 'streak-10', name: '연속 정답 10', desc: '한 판에서 문제를 10개 연달아 맞혔다', group: 'quiz' },
  ...GAME_TOPICS.flatMap((t) => [
    { key: `topic-${t.topic}-10`, name: `${t.label} 10`, desc: `${t.label} 분야 문제를 10개 맞혔다`, group: 'topic' as const },
    { key: `topic-${t.topic}-50`, name: `${t.label} 50`, desc: `${t.label} 분야 문제를 50개 맞혔다`, group: 'topic' as const },
  ]),
  { key: 'mg-win-1', name: '미니게임 첫 1위', desc: '미니게임에서 최종 1위를 했다(2명 이상 · 연습 제외)', group: 'minigame' },
  { key: 'mg-win-10', name: '미니게임 1위 10번', desc: '미니게임에서 최종 1위를 10번 했다', group: 'minigame' },
  { key: 'cake-50ms', name: '케이크 장인', desc: '케이크 기다리기에서 오차 0.05초(50ms) 이내', group: 'minigame' },
  { key: 'circle-95', name: '컴퍼스 손', desc: '완벽한 원에서 95% 이상', group: 'minigame' },
  { key: 'reaction-200', name: '번개', desc: '번개손에서 200ms 미만', group: 'minigame' },
  { key: 'typing-10s', name: '타자왕', desc: '타자에서 문장을 10초 안에 정확히 완성', group: 'minigame' },
  { key: 'theme-chiikawa', name: '치이카와 완성', desc: '치이카와 테마 이모티콘을 모두 모았다', group: 'collect' },
];

/** 키 → 정의 (테마는 새 테마가 생겨도 이름이 나오게) */
export function achievementDef(key: string): AchievementDef {
  const d = ACHIEVEMENTS.find((a) => a.key === key);
  if (d) return d;
  if (key.startsWith('theme-')) return { key, name: '테마 완성', desc: '한 테마의 이모티콘을 모두 모았다', group: 'collect' };
  return { key, name: key, desc: '', group: 'quiz' };
}
