// =============================================================================
// 테마·소리 설정 (R033)
//
// ★ 건우가 **게임 안에서 바로** 테마와 소리를 바꿔 보고 고른다 — 시안을 따로 보여 주지 않는다.
// ★ 어디에 두나 — 화면 맨 아래 푸터의 "🎨 테마 · 🔊 소리" 버튼. 누르면 위로 작은 창이 열린다.
//   ★ 근거: 푸터는 모든 화면에 있고, 위로 여는 창은 **문서 높이를 늘리지 않는다** (한 화면 게이트).
//   ★ 단축키 — Alt+T 테마 바꾸기 / Alt+M 소리 전부 켜기·끄기 (방 안에서는 단축키 목록에도 보인다)
// =============================================================================

import { useEffect, useState } from 'react';
import {
  BGMS,
  CORRECTS,
  getSoundPrefs,
  previewCorrect,
  setSoundPrefs,
  toggleMuteAll,
  type SoundPrefs,
} from './sound.js';
import { cycleTheme, getTheme, setTheme, THEMES, type ThemeId } from './theme.js';

/**
 * ★ 방 안에서는 Lobby 의 단축키 목록이 Alt+T / Alt+M 을 맡는다 (목록에 보이게 하려고).
 *   그때 여기 전역 키는 쉰다 — 두 곳이 같이 받으면 한 번 누를 때 두 번 바뀐다.
 */
let roomOwnsKeys = false;
export function setRoomOwnsKeys(v: boolean): void {
  roomOwnsKeys = v;
}

export default function Prefs() {
  const [open, setOpen] = useState(false);
  const [theme, setThemeState] = useState<ThemeId>(getTheme());
  const [sound, setSound] = useState<SoundPrefs>(getSoundPrefs());

  // 다른 곳(단축키)에서 바꿔도 이 창이 따라온다
  useEffect(() => {
    const onTheme = (e: Event) => setThemeState((e as CustomEvent<ThemeId>).detail);
    const onSound = (e: Event) => setSound({ ...(e as CustomEvent<SoundPrefs>).detail });
    window.addEventListener('qw:theme', onTheme);
    window.addEventListener('qw:sound', onSound);
    return () => {
      window.removeEventListener('qw:theme', onTheme);
      window.removeEventListener('qw:sound', onSound);
    };
  }, []);

  // ★ 방 밖(로그인·방 목록)에서도 단축키가 먹게 한다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (roomOwnsKeys || e.isComposing || !e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === 't') {
        e.preventDefault();
        cycleTheme();
      } else if (k === 'm') {
        e.preventDefault();
        toggleMuteAll();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ★ 창 밖을 누르거나 Esc 면 닫는다
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.prefs')) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const muted = !sound.bgmOn && !sound.sfxOn;

  return (
    <div className="prefs">
      <button
        type="button"
        className="ghost tiny prefs-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="테마·소리 (Alt+T 테마 바꾸기 · Alt+M 소리 끄기)"
      >
        🎨 테마 · {muted ? '🔇' : '🔊'} 소리
      </button>

      {open && (
        <div className="prefs-pop" role="dialog" aria-label="테마와 소리">
          <p className="prefs-title">테마 <kbd>Alt+T</kbd></p>
          <div className="seg">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={theme === t.id ? 'seg-btn active' : 'seg-btn'}
                aria-pressed={theme === t.id}
                onClick={() => setTheme(t.id)}
                title={t.desc}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="prefs-desc">{THEMES.find((t) => t.id === theme)?.desc}</p>

          <p className="prefs-title">
            소리 <kbd>Alt+M</kbd>
          </p>
          <label className="prefs-row">
            <input
              type="checkbox"
              checked={sound.bgmOn}
              onChange={(e) => setSoundPrefs({ bgmOn: e.target.checked })}
            />
            배경음악
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sound.bgmVol}
              aria-label="배경음악 음량"
              onChange={(e) => setSoundPrefs({ bgmVol: Number(e.target.value) })}
            />
          </label>
          <div className="seg">
            {BGMS.map((b) => (
              <button
                key={b.id}
                type="button"
                className={sound.bgm === b.id ? 'seg-btn active' : 'seg-btn'}
                aria-pressed={sound.bgm === b.id}
                onClick={() => setSoundPrefs({ bgm: b.id, bgmOn: true })}
              >
                {b.label}
              </button>
            ))}
          </div>

          <label className="prefs-row">
            <input
              type="checkbox"
              checked={sound.sfxOn}
              onChange={(e) => setSoundPrefs({ sfxOn: e.target.checked })}
            />
            효과음
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sound.sfxVol}
              aria-label="효과음 음량"
              onChange={(e) => setSoundPrefs({ sfxVol: Number(e.target.value) })}
            />
          </label>
          <p className="prefs-sub">정답 효과음</p>
          <div className="seg">
            {CORRECTS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={sound.correct === c.id ? 'seg-btn active' : 'seg-btn'}
                aria-pressed={sound.correct === c.id}
                onClick={() => {
                  setSoundPrefs({ correct: c.id, sfxOn: true });
                  previewCorrect();
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="prefs-desc">
            오답에는 소리가 나지 않습니다. 소리는 화면을 한 번 누르거나 키를 친 뒤부터 나옵니다.
          </p>
        </div>
      )}
    </div>
  );
}
