// =============================================================================
// ★★★ 프로필 창 — 닉네임 · 사진 (R034 · R039 · R041 · R045 → R046 D 에서 한 곳으로 꺼냈다)
//
// ★ 건우(R046): "로비뿐 아니라 최초 메인 화면에서도 로그인했다면 닉네임과 프사를 바꿀 수 있게."
//   → 로비 상단 바(✏ 프로필 · 모바일 ☰ → 프로필)와 방 목록 화면(오른쪽 위)이 **같은 창**을 쓴다.
// ★ 닉네임 한도(R041 · nicknameFits) · 사진 편집기(R039 ProfileEditor) · 사진 지우기 확인(R043) 그대로.
// ★ 바꾸면 서버가 지금 방 · 지금 소켓 세션(R045) · 친구들 목록(R046)에 바로 알린다.
// ★ 반드시 거쳐야 하는 창(mustRename — R040): ✕ 없음 · 바깥 · Esc 로 안 닫힌다 (R044 B).
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import { Camera, Pencil } from 'lucide-react';
import { NICKNAME_LIMIT_HINT, NICKNAME_TOO_LONG_MESSAGE, RULES, nicknameFits } from '@quiz/shared';
import Avatar from './Avatar.js';
import BusyButton from './BusyButton.js';
import ConfirmModal from './ConfirmModal.js';
import Icon from './Icon.js';
import PopupClose from './PopupClose.js';
import ProfileEditor from './ProfileEditor.js';
import { changeNickname, deleteAvatar, errorMessage, uploadAvatar } from './api.js';
import { usePopup } from './popup.js';
import { useDismiss } from './useDismiss.js';

interface Props {
  accountId: string;
  nickname: string;
  colorIndex: number;
  avatarV: number | null | undefined;
  /** 닉네임을 바꿔야 게임에 들어갈 수 있다 (로비 — R040). 방 목록 화면에서는 false */
  mustRename?: boolean;
  onNicknameChanged: (nickname: string) => void;
  /** 사진이 바뀌었다 (방 목록 화면은 방 소식이 없으니 App 이 내 사진 버전을 고친다) */
  onAvatarChanged?: (avatarV: number | null) => void;
}

export default function ProfilePanel({ accountId, nickname, colorIndex, avatarV, mustRename = false, onNicknameChanged, onAvatarChanged }: Props) {
  const [open, setOpen] = usePopup('profile');
  const [photoOpen, setPhotoOpen] = usePopup('photo');
  const [photoDelOpen, setPhotoDelOpen] = usePopup('photo-delete');
  const [draft, setDraft] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const close = useCallback(() => setOpen(false), [setOpen]);
  useDismiss(open, close, '.rename', !mustRename);
  // 창을 새로 열면 지난 안내는 지운다 (☰ → 프로필 로 열 때도)
  const [wasOpen, setWasOpen] = useState(false);
  useEffect(() => {
    if (open && !wasOpen) setMsg((m) => (m?.text.includes('사진') ? m : null));
    setWasOpen(open);
  }, [open, wasOpen]);

  const text = draft ?? nickname;
  const fits = nicknameFits(text.trim());
  const doRename = async () => {
    const next = text.trim();
    if (!next || next === nickname || busy) return;
    setBusy(true);
    try {
      const saved = await changeNickname(next);
      setDraft(null);
      setMsg({ ok: true, text: `${saved}(으)로 바꿨습니다.` });
      onNicknameChanged(saved);
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err, '닉네임을 바꿀 수 없습니다.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <span className="rename">
        <button
          type="button"
          id="rename-btn"
          className="ghost tiny"
          aria-expanded={open}
          onClick={() => {
            setOpen((v) => !v);
            setMsg(null);
          }}
        >
          <Icon icon={Pencil} />
          <span className="lbl">프로필</span>
        </button>
        {open && (
          <div className="rename-pop" role="dialog" aria-label="내 프로필">
            <div className="pop-head">
              <p className="pop-title">프로필</p>
              {!mustRename && <PopupClose onClose={close} />}
            </div>
            {mustRename && (
              <p className="rename-must">
                <Icon icon={Pencil} /> 닉네임을 바꿔야 게임에 참여할 수 있어요
                <span>{NICKNAME_LIMIT_HINT}</span>
              </p>
            )}
            {/* ★★ R039 — 프로필 사진: 누르면 사진 고르기 → 원형 편집기 */}
            <div className="profile-row">
              <label className="profile-photo" title="사진 바꾸기">
                <Avatar nickname={nickname} colorIndex={colorIndex} large accountId={accountId} avatarV={avatarV} />
                <span className="profile-cam" aria-hidden="true">
                  <Icon icon={Camera} />
                </span>
                <input
                  id="avatar-file"
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) {
                      setPhotoFile(f);
                      setPhotoOpen(true);
                    }
                  }}
                />
              </label>
              {avatarV ? (
                <button type="button" className="ghost tiny" onClick={() => setPhotoDelOpen(true)}>
                  사진 지우기
                </button>
              ) : (
                <span className="dim profile-tip">
                  <Icon icon={Camera} /> 눌러 사진 넣기
                </span>
              )}
            </div>
            <div className="field-row">
              <input
                id="rename-input"
                className={fits ? undefined : 'nick-input-over'}
                aria-invalid={!fits}
                autoFocus
                value={text}
                maxLength={RULES.NICKNAME_MAX_LENGTH}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setMsg(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void doRename();
                  }
                }}
              />
              <BusyButton onClick={() => void doRename()} busy={busy} disabled={!fits || text.trim() === nickname}>
                바꾸기
              </BusyButton>
            </div>
            {/* ★ R041 — 칸 수 대신: 넘으면 빨갛게 + 떨림 + 안내 */}
            {!fits && <p className="form-error rename-msg nick-over">{NICKNAME_TOO_LONG_MESSAGE}</p>}
            {msg && <p className={msg.ok ? 'note rename-msg' : 'form-error rename-msg'}>{msg.text}</p>}
          </div>
        )}
      </span>

      {photoFile && photoOpen && (
        <ProfileEditor
          file={photoFile}
          onCancel={() => {
            setPhotoFile(null);
            // ★ R041 — 편집기는 프로필 창 자리를 잠깐 빌렸다(팝업 하나) → 닫으면 프로필 창으로 돌아간다
            setOpen(true);
          }}
          onDone={async (blob) => {
            const v = await uploadAvatar(blob);
            setPhotoFile(null);
            onAvatarChanged?.(v);
            setOpen(true);
            setMsg({ ok: true, text: '프로필 사진을 바꿨습니다.' });
          }}
        />
      )}

      {/* ★ R043 A-6 — 사진 지우기도 확인 */}
      {photoDelOpen && (
        <ConfirmModal
          kind="photo-delete"
          title="프로필 사진을 지울까요?"
          actions={[
            {
              label: '지우기',
              tone: 'warn',
              onClick: () => {
                setPhotoDelOpen(false);
                void deleteAvatar()
                  .then(() => onAvatarChanged?.(null))
                  .catch((err) => setMsg({ ok: false, text: errorMessage(err) }));
              },
            },
          ]}
          onCancel={() => setPhotoDelOpen(false)}
        />
      )}
    </>
  );
}
