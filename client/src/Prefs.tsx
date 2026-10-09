// =============================================================================
// 테마·소리 설정 (R033)
//
// ★ 건우가 **게임 안에서 바로** 테마와 소리를 바꿔 보고 고른다 — 시안을 따로 보여 주지 않는다.
// ★ 어디에 두나 — 화면 맨 아래 푸터의 "🎨 테마 · 🔊 소리" 버튼. 누르면 위로 작은 창이 열린다.
//   ★ 근거: 푸터는 모든 화면에 있고, 위로 여는 창은 **문서 높이를 늘리지 않는다** (한 화면 게이트).
//   ★ 단축키 — Alt+T 테마 바꾸기 / Alt+M 소리 전부 켜기·끄기 (방 안에서는 단축키 목록에도 보인다)
// =============================================================================

import { useEffect, useState } from 'react';
import { usePopup } from './popup.js';
import {
  BGMS,
  getSoundPrefs,
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

interface Props {
  /**
   * ★ R035 — 'gear' = 방 안 상단 바의 ⚙ (아래로 열리고 로그아웃까지 담는다).
   *   기본('footer') = 방 밖 화면 맨 아래 (위로 열린다).
   */
  variant?: 'footer' | 'gear';
  onLogout?: () => void;
}

export default function Prefs({ variant = 'footer', onLogout }: Props) {
  // ★ R041 — 팝업은 한 번에 하나 (popup.ts). 방 밖(footer)도 같은 규칙
  const [open, setOpen] = usePopup('prefs');
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
      // ★ R034 — 자판 위치(e.code)로 본다 (shortcuts.ts codeOf 주석)
      if (e.code === 'KeyT') {
        e.preventDefault();
        cycleTheme();
      } else if (e.code === 'KeyM') {
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
  }, [open, setOpen]);

  const muted = !sound.bgmOn && !sound.sfxOn && !sound.chatOn;

  // ★★ R035 — 창 안의 설명 문장을 지웠다 (건우: "설명은 숨겨라"). 소리 규칙 설명은 방 안 ⓘ 안내에 있다
  return (
    <div className={variant === 'gear' ? 'prefs gear' : 'prefs'}>
      <button
        type="button"
        className={variant === 'gear' ? 'ghost tiny prefs-toggle icon-btn' : 'ghost tiny prefs-toggle'}
        aria-expanded={open}
        aria-label="테마 · 소리 · 로그아웃"
        onClick={() => setOpen((v) => !v)}
        title="테마 · 소리 (Alt+T 테마 · Alt+M 소리)"
      >
        {/* ★ R041 (건우) — 웹은 글자까지 ("초대·안내·나가기는 글자가 있는데 톱니만 아이콘"), 모바일은 아이콘만 (.lbl) */}
        {variant === 'gear' ? (
          <>
            ⚙<span className="lbl"> 설정</span>
          </>
        ) : (
          <>🎨 테마 · {muted ? '🔇' : '🔊'} 소리</>
        )}
      </button>

      {open && (
        <div className="prefs-pop" role="dialog" aria-label="테마와 소리">
          <p className="prefs-title">테마</p>
          <div className="seg">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={theme === t.id ? 'seg-btn active' : 'seg-btn'}
                aria-pressed={theme === t.id}
                onClick={() => setTheme(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <p className="prefs-title">
            소리
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
          {/* ★★ R038 — 채팅 소리: 내 귀에 들리는 것만 (남에게 들리는 것은 끌 수 없다) */}
          <label className="prefs-row">
            <input
              type="checkbox"
              checked={sound.chatOn}
              onChange={(e) => setSoundPrefs({ chatOn: e.target.checked })}
            />
            채팅 소리
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sound.chatVol}
              aria-label="채팅 소리 음량"
              onChange={(e) => setSoundPrefs({ chatVol: Number(e.target.value) })}
            />
          </label>
          {onLogout && (
            <button type="button" className="ghost tiny prefs-logout" onClick={onLogout}>
              로그아웃
            </button>
          )}
        </div>
      )}
    </div>
  );
}
