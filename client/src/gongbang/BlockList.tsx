// =============================================================================
// ★★★ R117 (docs/24 3-8) — ☰ → 설정 안 "가린 사람"(개인 차단 목록) · [풀기]
//   공방 스위치를 켰고 가린 사람이 있을 때만 보인다(없으면 칸 자체가 없다 — 설명 문장 없음).
// =============================================================================

import { siteInfo } from '../site.js';
import { unblockPerson, useBlocks } from './store.js';

export default function BlockList() {
  const list = useBlocks();
  if (!siteInfo().gongbang || list.length === 0) return null;
  return (
    <div className="gb-blocks" data-gb-blocks>
      <p className="prefs-title">가린 사람</p>
      <ul>
        {list.map((b) => (
          <li key={b.accountId}>
            <span className="nick">{b.nickname}</span>
            <button type="button" className="ghost tiny" data-unblock={b.accountId} onClick={() => void unblockPerson(b.accountId).catch(() => undefined)}>
              풀기
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
