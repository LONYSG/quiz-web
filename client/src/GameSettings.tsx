// =============================================================================
// 게임 설정 (guide 7절 / docs/01-GAME-RULES.md 4장)
//
// ★ 방장만 바꿀 수 있고, 나머지에게는 같은 모양의 읽기 전용으로 보인다.
//   ★ 화면에서 막는 것은 편의일 뿐이다. 권한과 범위는 서버가 다시 검사한다 (guide 44절).
// ★ 검증은 shared/validateRoomSettings 하나만 쓴다 (화면과 서버가 어긋나지 않게).
// ★ 출제 가능 수 안내 (Q-21) — 입력 단계에서 상한을 보여 준다.
//
// ★★★ R057 — 맨 위 "방식" [퀴즈 · 미니게임만](D-249). 미니게임만이면 문제 수 · 난이도 · 분야를 숨기고(값은 남는다)
//   미니게임 수(2~10) + 넣을 미니게임만 남는다.
// ★★ R035 — 카드 테두리를 없앴다. 로비 가운데 **카드 하나**(설정 + 게임 시작) 안에 들어간다 (건우: "칸을 줄여라").
//   ★ 난이도 설명 문구를 지웠다. ★ 게스트에게도 분야 **목록 전체**를 보이고 켜진 것만 진하게 — "전체" 한 단어로는
//     무엇이 들어 있는지 모른다 (건우 지적).
// =============================================================================

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  DIFFICULTY_TIERS,
  GAME_TOPICS,
  MINIGAMES,
  MINIGAME_KEYS,
  MINIGAME_ONLY_ROUNDS,
  minigameSlots,
  type MinigameKey,
  RULES,
  validateRoomSettings,
  type DifficultyTier,
  type GameTopic,
} from '@quiz/shared';
import type { RoomSettings } from './useRoom.js';

/** Q-10 확정: UI 에 프리셋을 제공한다 */
const PRESETS = [50, 100, 200] as const;
/** ★ R057 — 미니게임 수 프리셋 */
const MG_PRESETS = [3, 5, 10] as const;

interface Props {
  socket: Socket;
  settings: RoomSettings;
  settingsLocked: boolean;
  availableQuestionCount: number | null;
  isHost: boolean;
}

export default function GameSettings({
  socket,
  settings,
  settingsLocked,
  availableQuestionCount,
  isHost,
}: Props) {
  /**
   * ★ 입력 중인 값은 로컬 상태로 둔다 (숫자를 지우는 순간 커서가 튀지 않게).
   *   ★ 정본은 언제나 서버가 보낸 settings 다.
   */
  const [draft, setDraft] = useState<RoomSettings>(settings);
  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const editable = isHost && !settingsLocked;
  const valid = validateRoomSettings(draft);

  /** 서버로 보낸다. 통과하지 못하는 값은 보내지 않는다 */
  const push = (next: RoomSettings) => {
    setDraft(next);
    const check = validateRoomSettings(next);
    if (!check.ok) return;
    socket.emit('lobby.updateSettings', check.settings);
  };

  const shown = editable ? draft : settings;
  const shortage = availableQuestionCount !== null && shown.questionCount > availableQuestionCount;

  /** ★ 난이도·분야 모두 **마지막 하나는 끌 수 없다** (빈 선택 상태를 만들지 않는다 — R025 판단) */
  const [lastHint, setLastHint] = useState<'tier' | 'topic' | null>(null);
  const toggleTier = (tier: DifficultyTier) => {
    const has = draft.difficulties.includes(tier);
    if (has && draft.difficulties.length === 1) {
      setLastHint('tier');
      return;
    }
    setLastHint(null);
    const next = has
      ? draft.difficulties.filter((d) => d !== tier)
      : DIFFICULTY_TIERS.map((i) => i.tier).filter((d) => d === tier || draft.difficulties.includes(d));
    push({ ...draft, difficulties: next });
  };
  const toggleTopic = (topic: GameTopic) => {
    const has = draft.topics.includes(topic);
    if (has && draft.topics.length === 1) {
      setLastHint('topic');
      return;
    }
    setLastHint(null);
    const next = has
      ? draft.topics.filter((t) => t !== topic)
      : GAME_TOPICS.map((i) => i.topic).filter((t) => t === topic || draft.topics.includes(t));
    push({ ...draft, topics: next });
  };
  const topics = shown.topics ?? [];
  const allTopics = topics.length === GAME_TOPICS.length;
  const mgOnly = shown.minigameOnly === true;
  const mgRounds = shown.minigameRounds ?? MINIGAME_ONLY_ROUNDS.DEFAULT;
  const keysOf = (s: RoomSettings) => s.minigameKeys ?? [...MINIGAME_KEYS];

  return (
    <div className={editable ? 'settings' : 'settings readonly'}>
      {/* ★★★ R057 — 방식: 퀴즈 / 미니게임만 (기본 퀴즈 · 다시 하기 이어받음) */}
      <div className="set-row mode-row">
        <span className="set-label">방식</span>
        <div className="preset-row">
          {editable ? (
            <>
              <button
                type="button"
                data-mode="quiz"
                aria-pressed={!mgOnly}
                className={!mgOnly ? 'preset active' : 'preset'}
                onClick={() => mgOnly && push({ ...draft, minigameOnly: false })}
              >
                퀴즈
              </button>
              <button
                type="button"
                data-mode="minigame"
                aria-pressed={mgOnly}
                className={mgOnly ? 'preset active' : 'preset'}
                onClick={() => !mgOnly && push({ ...draft, minigameOnly: true, minigameKeys: keysOf(draft), minigameRounds: draft.minigameRounds ?? MINIGAME_ONLY_ROUNDS.DEFAULT })}
              >
                미니게임만
              </button>
            </>
          ) : (
            <span className="chip on">{mgOnly ? '미니게임만' : '퀴즈'}</span>
          )}
        </div>
      </div>

      {mgOnly && (
        <div className="set-row">
          <span className="set-label">미니게임 수</span>
          {editable ? (
            <div className="preset-row">
              <input
                type="number"
                className="count-input mg-rounds-input"
                inputMode="numeric"
                min={MINIGAME_ONLY_ROUNDS.MIN}
                max={MINIGAME_ONLY_ROUNDS.MAX}
                aria-label={`미니게임 수 (${MINIGAME_ONLY_ROUNDS.MIN}~${MINIGAME_ONLY_ROUNDS.MAX})`}
                value={Number.isFinite(draft.minigameRounds) ? draft.minigameRounds : ''}
                onChange={(e) => push({ ...draft, minigameRounds: Number.parseInt(e.target.value, 10) })}
              />
              {MG_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  data-rounds={n}
                  className={draft.minigameRounds === n ? 'preset active' : 'preset'}
                  onClick={() => push({ ...draft, minigameRounds: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          ) : (
            <span className="set-value mono">{mgRounds}개</span>
          )}
        </div>
      )}

      {!mgOnly && (
        <>
          <div className="set-row">
            <span className="set-label">문제 수</span>
            {editable ? (
              <div className="preset-row">
                <input
                  type="number"
                  className="count-input"
                  inputMode="numeric"
                  min={RULES.QUESTION_COUNT_MIN}
                  max={RULES.QUESTION_COUNT_MAX}
                  aria-label={`문제 수 (${RULES.QUESTION_COUNT_MIN}~${RULES.QUESTION_COUNT_MAX})`}
                  value={Number.isFinite(draft.questionCount) ? draft.questionCount : ''}
                  onChange={(e) => push({ ...draft, questionCount: Number.parseInt(e.target.value, 10) })}
                />
                {/* ★ Q-10 확정: 50 / 100 / 200 프리셋 */}
                {PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={draft.questionCount === n ? 'preset active' : 'preset'}
                    onClick={() => push({ ...draft, questionCount: n })}
                  >
                    {n}
                  </button>
                ))}
                {availableQuestionCount !== null && availableQuestionCount > 0 && (
                  <button
                    type="button"
                    className="preset"
                    onClick={() =>
                      push({ ...draft, questionCount: Math.min(availableQuestionCount, RULES.QUESTION_COUNT_MAX) })
                    }
                  >
                    최대 ({Math.min(availableQuestionCount, RULES.QUESTION_COUNT_MAX)})
                  </button>
                )}
              </div>
            ) : (
              <span className="set-value mono">{settings.questionCount}문제</span>
            )}
          </div>

          {/* ★ 출제 가능 수 (Q-21) — 진행에 필요한 알림이다 (부족하면 시작할 수 없다) */}
          <p className={shortage ? 'form-error avail-line' : 'note avail-line'}>
            {availableQuestionCount === null
              ? '출제 가능 문제 수를 확인하는 중입니다.'
              : shortage
                ? `★ 지금 출제할 수 있는 문제는 ${availableQuestionCount}개입니다. 이대로 시작할 수 없습니다.`
                : `이번 설정으로 낼 수 있는 문제 ${availableQuestionCount.toLocaleString('ko-KR')}개`}
          </p>

          {/* ★★ 난이도 (R025) — 하=1~2 / 중=3 / 상=4~5 */}
          <div className="set-row">
            <span className="set-label">난이도</span>
            <div className="preset-row">
              {DIFFICULTY_TIERS.map((info) => {
                const on = shown.difficulties.includes(info.tier);
                return editable ? (
                  <button
                    key={info.tier}
                    type="button"
                    data-tier={info.tier}
                    aria-pressed={on}
                    className={on ? 'preset active' : 'preset'}
                    onClick={() => toggleTier(info.tier)}
                  >
                    {info.label}
                  </button>
                ) : (
                  <span key={info.tier} className={on ? 'chip on' : 'chip'}>
                    {info.label}
                  </span>
                );
              })}
            </div>
          </div>

          {/* ★★ 분야 (R034) — 난이도 × 분야로 출제 가능 수가 바뀐다 */}
          <div className="set-row">
            <span className="set-label">분야</span>
            <div className="preset-row topic-row">
              {editable && (
                <button
                  type="button"
                  aria-pressed={allTopics}
                  className={allTopics ? 'preset active' : 'preset'}
                  onClick={() => {
                    setLastHint(null);
                    if (!allTopics) push({ ...draft, topics: GAME_TOPICS.map((i) => i.topic) });
                  }}
                >
                  전체
                </button>
              )}
              {GAME_TOPICS.map((info) => {
                const on = topics.includes(info.topic);
                return editable ? (
                  <button
                    key={info.topic}
                    type="button"
                    data-topic={info.topic}
                    aria-pressed={on}
                    className={on ? 'preset active' : 'preset'}
                    onClick={() => toggleTopic(info.topic)}
                  >
                    {info.label}
                  </button>
                ) : (
                  <span key={info.topic} data-topic={info.topic} className={on ? 'chip on' : 'chip'}>
                    {info.label}
                  </span>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ★★★ R050 — 미니게임 포함 (기본 꺼짐 · 10문제마다 · 5~9문제는 가운데 한 번 · 마지막 문제 뒤에는 없음 — D-234) */}
      <div className="set-row mg-set-row">
        <span className="set-label">미니게임</span>
        <div className="preset-row">
          {mgOnly ? null : editable ? (
            <label className="mg-check">
              <input
                type="checkbox"
                checked={shown.minigames === true}
                onChange={(e) => push({ ...draft, minigames: e.target.checked, minigameKeys: draft.minigameKeys ?? [...MINIGAME_KEYS] })}
              />
              포함
            </label>
          ) : (
            <span className={shown.minigames ? 'chip on' : 'chip'}>{shown.minigames ? '포함' : '안 함'}</span>
          )}
          {(shown.minigames || mgOnly) &&
            MINIGAMES.map((m) => {
              const keys = shown.minigameKeys ?? [...MINIGAME_KEYS];
              const on = keys.includes(m.key);
              return editable ? (
                <button
                  key={m.key}
                  type="button"
                  data-minigame={m.key}
                  aria-pressed={on}
                  className={on ? 'preset active' : 'preset'}
                  onClick={() => {
                    if (on && keys.length === 1) return; // 마지막 하나는 끌 수 없다
                    const next: MinigameKey[] = on ? keys.filter((k) => k !== m.key) : MINIGAME_KEYS.filter((k) => k === m.key || keys.includes(k));
                    push({ ...draft, minigames: mgOnly ? draft.minigames : true, minigameKeys: next });
                  }}
                >
                  {m.name}
                </button>
              ) : (
                <span key={m.key} className={on ? 'chip on' : 'chip'}>
                  {m.name}
                </span>
              );
            })}
          {mgOnly && <span className="dim mg-set-note">고른 것 중에서 {mgRounds}개 · 겹치지 않게</span>}
          {shown.minigames && !mgOnly && (
            <span className="dim mg-set-note">
              {(() => {
                const n = minigameSlots(Number.isFinite(shown.questionCount) ? shown.questionCount : 0).length;
                return n === 0 ? '문제 5개 이상부터 나와요' : `이번 판 ${n}번`;
              })()}
            </span>
          )}
        </div>
      </div>

      {lastHint && (
        <p className="form-error">
          {lastHint === 'tier' ? '난이도는 하나 이상 선택해야 합니다.' : '분야는 하나 이상 선택해야 합니다.'}
        </p>
      )}
      {editable && !valid.ok && <p className="form-error">{valid.message}</p>}
    </div>
  );
}
