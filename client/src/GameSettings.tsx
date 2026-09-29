// =============================================================================
// 게임 설정 (guide 7절 / docs/01-GAME-RULES.md 4장)
//
// ★ 방장만 바꿀 수 있고, 나머지에게는 읽기 전용으로 보인다.
//   ★ 화면에서 막는 것은 편의일 뿐이다. 권한과 범위는 서버가 다시 검사한다 (guide 44절).
//
// ★ 검증은 shared/validateRoomSettings 하나만 쓴다.
//   화면에만 따로 조건을 쓰면 서버와 어긋나서 "버튼은 눌리는데 서버가 거부하는" 상태가 된다.
//
// ★ 출제 가능 수 안내 (Q-21)
//   시드가 53문제인데 200을 넣고 시작 버튼을 누르면 서버가 거부한다.
//   안내가 없으면 왜 안 되는지 알 수 없으므로, 입력 단계에서 상한을 보여 준다.
// =============================================================================

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  DIFFICULTY_TIERS,
  formatDifficulties,
  RULES,
  validateRoomSettings,
  type DifficultyTier,
} from '@quiz/shared';
import type { RoomSettings } from './useRoom.js';

/** Q-10 확정: UI 에 프리셋을 제공한다 */
const PRESETS = [50, 100, 200] as const;

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
   * ★ 입력 중인 값은 로컬 상태로 둔다.
   *   서버가 보낸 값을 그대로 input 에 묶으면 숫자를 지우는 순간(빈 문자열)
   *   커서가 튀거나 값이 되돌아간다.
   *   ★ 단 정본은 언제나 서버가 보낸 settings 다. 아래 useEffect 가 동기화한다.
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

  const shortage =
    availableQuestionCount !== null && draft.questionCount > availableQuestionCount;

  /**
   * ★ 난이도 켜고 끄기 (R025). 복수 선택이다.
   *
   * ★ **마지막 하나는 끌 수 없다.** 누르면 그대로 두고 안내만 띄운다.
   *   ★ 처음에는 초안을 비워 두고 검증 문구를 띄웠다. 그런데 서버가 보낸 설정으로
   *     초안이 다시 맞춰지면서 문구가 사라졌다 (R025 ui-check 가 잡았다).
   *     ★ 빈 선택이라는 상태 자체를 만들지 않는 편이 단순하고 확실하다.
   *   ★ 서버도 빈 선택을 거부한다 (guide 44절 — 화면을 믿지 않는다).
   */
  const [lastTierHint, setLastTierHint] = useState(false);
  const toggleTier = (tier: DifficultyTier) => {
    const has = draft.difficulties.includes(tier);
    if (has && draft.difficulties.length === 1) {
      setLastTierHint(true);
      return;
    }
    setLastTierHint(false);
    const next = has
      ? draft.difficulties.filter((d) => d !== tier)
      : DIFFICULTY_TIERS.map((i) => i.tier).filter((d) => d === tier || draft.difficulties.includes(d));
    push({ ...draft, difficulties: next });
  };

  if (!editable) {
    // ── 읽기 전용 표시 (참가자 / 설정 잠금 상태)
    return (
      <section className="card">
        <h2>게임 설정</h2>
        <dl className="settings-view">
          <dt>문제 수</dt>
          <dd>{settings.questionCount}개</dd>
          <dt>난이도</dt>
          <dd>{formatDifficulties(settings.difficulties)}</dd>
          <dt>시작 방식</dt>
          <dd>
            {settings.startMode === 'instant'
              ? '즉시 시작'
              : `${settings.countdownSec}초 카운트다운`}
          </dd>
          <dt>출제 가능</dt>
          <dd>
            {availableQuestionCount === null ? '—' : `${availableQuestionCount}개`}
          </dd>
        </dl>
        <p className="note">
          {settingsLocked
            ? '게임이 시작되어 설정을 바꿀 수 없습니다.'
            : '설정은 방장만 바꿀 수 있습니다.'}
        </p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>게임 설정</h2>

      <label className="settings-label">
        문제 수 ({RULES.QUESTION_COUNT_MIN}~{RULES.QUESTION_COUNT_MAX})
        <div className="field-row">
          <input
            type="number"
            inputMode="numeric"
            min={RULES.QUESTION_COUNT_MIN}
            max={RULES.QUESTION_COUNT_MAX}
            value={Number.isFinite(draft.questionCount) ? draft.questionCount : ''}
            onChange={(e) =>
              push({ ...draft, questionCount: Number.parseInt(e.target.value, 10) })
            }
          />
        </div>
      </label>

      {/* ★ Q-10 확정: 50 / 100 / 200 프리셋 */}
      <div className="preset-row">
        {PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            className={draft.questionCount === n ? 'preset active' : 'preset'}
            onClick={() => push({ ...draft, questionCount: n })}
          >
            {n}문제
          </button>
        ))}
        {availableQuestionCount !== null && availableQuestionCount > 0 && (
          <button
            type="button"
            className="preset"
            onClick={() =>
              push({
                ...draft,
                questionCount: Math.min(availableQuestionCount, RULES.QUESTION_COUNT_MAX),
              })
            }
          >
            가능한 최대 ({Math.min(availableQuestionCount, RULES.QUESTION_COUNT_MAX)})
          </button>
        )}
      </div>

      <p className={shortage ? 'form-error' : 'note'}>
        {availableQuestionCount === null
          ? '출제 가능 문제 수를 확인하는 중입니다.'
          : shortage
            ? `★ 지금 출제할 수 있는 문제는 ${availableQuestionCount}개입니다. 이대로 시작할 수 없습니다.`
            : `지금 출제할 수 있는 문제: ${availableQuestionCount}개`}
      </p>

      {/* ★★ 난이도 (R025). 하=1~2 / 중=3 / 상=4~5 (문제별 난이도 점수 기준)
          ★ 켜고 끌 때마다 서버가 출제 가능 수를 다시 센다 (Q-21) */}
      <div className="settings-label">
        난이도
        <div className="preset-row">
          {DIFFICULTY_TIERS.map((info) => (
            <button
              key={info.tier}
              type="button"
              aria-pressed={draft.difficulties.includes(info.tier)}
              className={draft.difficulties.includes(info.tier) ? 'preset active' : 'preset'}
              onClick={() => toggleTier(info.tier)}
            >
              {info.label}
            </button>
          ))}
        </div>
        {lastTierHint ? (
          <span className="form-error">난이도는 하나 이상 선택해야 합니다.</span>
        ) : (
          <span className="note dim">하 = 일상·중학 / 중 = 고교·관심층 / 상 = 대학 교양·전공</span>
        )}
      </div>

      <label className="settings-label">
        시작 방식
        <div className="preset-row">
          <button
            type="button"
            className={draft.startMode === 'instant' ? 'preset active' : 'preset'}
            onClick={() => push({ ...draft, startMode: 'instant' })}
          >
            즉시 시작
          </button>
          <button
            type="button"
            className={draft.startMode === 'countdown' ? 'preset active' : 'preset'}
            onClick={() => push({ ...draft, startMode: 'countdown' })}
          >
            카운트다운
          </button>
        </div>
      </label>

      {draft.startMode === 'countdown' && (
        <label className="settings-label">
          카운트다운 ({RULES.COUNTDOWN_SEC_MIN}~{RULES.COUNTDOWN_SEC_MAX}초)
          <div className="field-row">
            <input
              type="number"
              inputMode="numeric"
              min={RULES.COUNTDOWN_SEC_MIN}
              max={RULES.COUNTDOWN_SEC_MAX}
              value={Number.isFinite(draft.countdownSec) ? draft.countdownSec : ''}
              onChange={(e) =>
                push({ ...draft, countdownSec: Number.parseInt(e.target.value, 10) })
              }
            />
          </div>
        </label>
      )}

      {!valid.ok && <p className="form-error">{valid.message}</p>}
    </section>
  );
}
