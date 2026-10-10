// =============================================================================
// ★★★ 친구 목록 본문 (R043 C-2) — 방 목록 화면의 큰 칸 · 방 안 친구 창이 같은 본문을 쓴다
//
// ★ 줄 모양은 참여자 창(R041)과 같다 — .people-row · 사진 · 닉네임(FitText) · 오른쪽 버튼 (0장 원칙 1 · 통일감)
// ★ 상태: 게임 중 · N명 / 대기실 · N명 / 접속 중 / 오프라인 — 서버가 바뀐 것만 보내 실시간으로 바뀐다
// ★ 방 목록 화면: 방에 있는 친구는 [들어가기] / 방 안: 친구마다 [초대] (접속 중 · 아직 내 방에 없는 친구만)
// ★★ 길어지면 칸 안 스크롤 대신 **쪽 넘기기** (‹ 1/3 ›) — 0장 원칙 3. 순서: 방에 있는 친구 → 접속 중 → 오프라인
// ★ 친구 삭제는 확인 팝업 (A-6 — 돌이키기 힘든 결정)
// ★★ R044 A-2 (버그) — 방 안에서 삭제가 "아무 동작도 안 했다": 삭제 확인을 팝업 저장소(한 번에 하나)로 열어
//   그 순간 **친구 창 자신이 닫히고**, 확인 팝업은 친구 창 안에서 그려지므로 함께 사라졌다(방 목록 화면은 창이 아니라 칸이라 멀쩡했다).
//   → 삭제 확인은 이 목록의 **안쪽 단계**(로컬 상태)로 연다 — 친구 창은 열린 채, 확인이 그 위에 뜬다 (KickFlow 의 두 단계와 같은 생각).
// ★★ R044 A-5 — 나를 초대한 친구 줄: "나를 초대했어요" + [들어가기] (아래 토스트를 놓쳐도 들어갈 수 있게)
// =============================================================================

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, UserMinus } from 'lucide-react';
import Avatar from './Avatar.js';
import BusyButton from './BusyButton.js';
import ConfirmModal from './ConfirmModal.js';
import FitText from './FitText.js';
import Icon from './Icon.js';
import type { FriendStatus, FriendView, Social } from './useSocial.js';

interface Props {
  social: Social;
  mode: 'home' | 'room';
  /** 방 안 — 이미 내 방에 있는 사람 */
  inRoom?: Set<string>;
  /** 친구가 있는 방 · 초대받은 방으로 들어가기 (방 안이면 App 이 "나가고 들어갈까요?" 를 묻는다) */
  onJoin?: (roomId: string) => void;
  pageSize: number;
}

/** ★ 사진이 없을 때 첫 글자 바탕색 — 계정마다 고정 (방 안 색 번호가 없으니 계정 id 로 고른다) */
export const colorOf = (accountId: string) => Number(accountId) % 10;

export function statusText(s?: FriendStatus): string {
  if (!s || s.kind === 'offline') return '오프라인';
  if (s.kind === 'online') return '접속 중';
  return `${s.kind === 'game' ? '게임 중' : '대기실'} · ${s.count ?? 0}명`;
}
const rank = (s?: FriendStatus) => (s?.kind === 'game' || s?.kind === 'lobby' ? 0 : s?.kind === 'online' ? 1 : 2);

export function FriendRow({ f, sub, invited, children }: { f: FriendView; sub: string; invited?: boolean; children?: ReactNode }) {
  return (
    <li data-account={f.accountId} className={f.status?.kind === 'offline' ? 'offline' : undefined}>
      <div className="people-row">
        <Avatar nickname={f.nickname} colorIndex={colorOf(f.accountId)} accountId={f.accountId} avatarV={f.avatarV} />
        <span className="people-name">
          <FitText text={f.nickname} className="nick" minPx={12} />
          <span className={invited ? 'people-sub status-invite' : `people-sub status-${f.status?.kind ?? 'none'}`}>{sub}</span>
        </span>
        {children && <span className="row-actions">{children}</span>}
      </div>
    </li>
  );
}

export default function FriendList({ social, mode, inRoom, onJoin, pageSize }: Props) {
  const [loginId, setLoginId] = useState('');
  const [page, setPage] = useState(0);
  const [delTarget, setDelTarget] = useState<FriendView | null>(null);
  const inviteFrom = (accountId: string) => social.invites.find((n) => n.fromAccountId === accountId);
  const sorted = useMemo(() => [...social.friends].sort((a, b) => rank(a.status) - rank(b.status) || a.nickname.localeCompare(b.nickname)), [social.friends]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => {
    if (page >= pages) setPage(pages - 1);
  }, [page, pages]);
  const shown = sorted.slice(page * pageSize, page * pageSize + pageSize);
  const recent = social.lastResult && Date.now() - social.lastResult.at < 5000 ? social.lastResult : null;
  const busy = (k: string) => social.busy === k;

  return (
    <div className="friend-list">
      <form
        className="field-row friend-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!loginId.trim()) return;
          social.request({ loginId: loginId.trim() });
          setLoginId('');
        }}
      >
        <input value={loginId} placeholder="친구 아이디" autoComplete="off" onChange={(e) => setLoginId(e.target.value)} />
        <BusyButton type="submit" busy={social.busy?.startsWith('request:') ?? false} disabled={!loginId.trim()}>
          신청
        </BusyButton>
      </form>
      {/* ★ R044 A-6 — 안내 자리는 늘 비워 둔다: 나타났다 사라질 때 아래 목록이 출렁이지 않고, 입력칸 · 목록 사이 가운데에 선다 */}
      <p className={recent ? (recent.ok ? 'friend-msg ok' : 'friend-msg form-error') : 'friend-msg'} aria-live="polite">
        {recent?.message ?? ''}
      </p>

      {social.incoming.length > 0 && (
        <>
          <p className="list-head">받은 신청</p>
          <ul className="people-list">
            {social.incoming.map((f) => (
              <FriendRow key={f.accountId} f={f} sub="친구 신청">
                <BusyButton className="primary tiny" busy={busy(`respond:${f.accountId}`)} onClick={() => social.respond(f.accountId, true)}>
                  수락
                </BusyButton>
                <button type="button" className="ghost tiny" onClick={() => social.respond(f.accountId, false)}>
                  거절
                </button>
              </FriendRow>
            ))}
          </ul>
        </>
      )}

      <div className="list-head">
        <span>친구 {social.friends.length}</span>
        {pages > 1 && (
          <span className="pager">
            <button type="button" className="ghost tiny pager-btn" aria-label="앞 쪽" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <Icon icon={ChevronLeft} />
            </button>
            <span className="mono">
              {page + 1}/{pages}
            </span>
            <button type="button" className="ghost tiny pager-btn" aria-label="다음 쪽" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
              <Icon icon={ChevronRight} />
            </button>
          </span>
        )}
      </div>
      {sorted.length === 0 ? (
        <p className="list-empty dim">아직 친구가 없어요. 아이디로 신청하거나 같은 방 사람을 눌러 신청해요.</p>
      ) : (
        <ul className="people-list">
          {shown.map((f) => {
            const inMyRoom = inRoom?.has(f.accountId) ?? false;
            const inSomeRoom = f.status?.kind === 'game' || f.status?.kind === 'lobby';
            const inv = inMyRoom ? undefined : inviteFrom(f.accountId);
            return (
              <FriendRow key={f.accountId} f={f} sub={inMyRoom ? '이 방에 있어요' : inv ? '나를 초대했어요' : statusText(f.status)} invited={Boolean(inv)}>
                {inv ? (
                  <button type="button" className="primary tiny" onClick={() => onJoin?.(inv.roomId!)}>
                    들어가기
                  </button>
                ) : (
                  mode === 'home' &&
                  inSomeRoom &&
                  f.status?.roomId && (
                    <button type="button" className="primary tiny" onClick={() => onJoin?.(f.status!.roomId!)}>
                      들어가기
                    </button>
                  )
                )}
                {mode === 'room' && !inMyRoom && f.status?.kind !== 'offline' && f.status !== undefined && (
                  <BusyButton className="primary tiny" busy={busy(`invite:${f.accountId}`)} onClick={() => social.invite(f.accountId)}>
                    초대
                  </BusyButton>
                )}
                <button
                  type="button"
                  className="ghost tiny icon-only"
                  aria-label={`${f.nickname} 친구 삭제`}
                  onClick={() => setDelTarget(f)}
                >
                  <Icon icon={UserMinus} />
                </button>
              </FriendRow>
            );
          })}
        </ul>
      )}

      {social.outgoing.length > 0 && (
        <>
          <p className="list-head">보낸 신청</p>
          <ul className="people-list">
            {social.outgoing.map((f) => (
              <FriendRow key={f.accountId} f={f} sub="수락을 기다려요">
                <button type="button" className="ghost tiny" onClick={() => social.cancel(f.accountId)}>
                  취소
                </button>
              </FriendRow>
            ))}
          </ul>
        </>
      )}

      {delTarget && (
        <ConfirmModal
          kind="friend-delete"
          title={
            <>
              <strong className="confirm-nick">{delTarget.nickname}</strong> <span className="nowrap">님을 친구에서 지울까요?</span>
            </>
          }
          actions={[
            {
              label: '지우기',
              tone: 'warn',
              onClick: () => {
                social.remove(delTarget.accountId);
                setDelTarget(null);
              },
            },
          ]}
          onCancel={() => setDelTarget(null)}
        />
      )}
    </div>
  );
}
