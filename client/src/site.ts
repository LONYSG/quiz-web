// =============================================================================
// ★★★ R109 (D-369) — 이 페이지의 자리(공개 · 베타) · 숨기는 방식/미니게임 — 첫 렌더 전에 /api/site 를 한 번 읽는다
//   한 페이지 = 한 자리(방은 만든 주소의 자리를 물려받고 다른 자리 방에는 못 들어간다). 서버가 다시 막는다(정본은 서버).
//   site 는 나중에 광고 코드를 공개 쪽에만 넣을 자리다.
// =============================================================================
import { setSiteHiddenMinigames, TRIM, type Site, type SiteHidden, type TrimFlags } from '@quiz/shared';

export interface SiteInfo {
  site: Site;
  /** 자리를 가르는가(PUBLIC_HOSTNAME · SITE_FORCE) — 아니면 오늘과 같다 */
  split: boolean;
  /** ★ R111 — 닫힌 공개 자리만 false(그때는 서버가 준비 중 한 장을 내므로 화면이 이 값을 볼 일은 거의 없다) */
  open: boolean;
  hidden: SiteHidden;
  /** 베타 자리 안내의 공개 주소 링크(공개 자리에서는 null) */
  publicUrl: string | null;
  /** ★ R117 — 공방 스위치(GONGBANG=1 · 서버가 gongbang:true 를 실을 때만) — 끄면 오늘 화면 그대로 */
  gongbang: boolean;
  /** ★★★ R118 — 혼자 하기 · 띠 스위치(SOLO=1 · BELT=1 · 서버가 solo:true · belt:true 를 실을 때만) */
  solo: boolean;
  belt: boolean;
  /** ★ R123 — 콘텐츠 줄이기(서버 config.trim · shared TRIM) */
  trim: TrimFlags;
}

let info: SiteInfo = { site: 'friend', split: false, open: true, hidden: { modes: [], minigames: [] }, publicUrl: null, gongbang: false, solo: false, belt: false, trim: TRIM };

/** ★ R123 — 서버의 콘텐츠 줄이기(없거나 이상하면 shared 기본값) */
function readTrim(v: unknown): TrimFlags {
  if (!v || typeof v !== 'object') return TRIM;
  const o = v as Record<string, unknown>;
  return { minigameOnly: o.minigameOnly !== false, minigamePick: o.minigamePick !== false, topicPick: o.topicPick !== false, songFilters: o.songFilters !== false };
}

export function siteInfo(): SiteInfo {
  return info;
}

/** 첫 렌더 전에 — 못 읽으면(옛 서버 · 네트워크) 오늘과 같게(아무것도 숨기지 않는다 · 서버가 막는다) */
export async function loadSiteInfo(): Promise<void> {
  try {
    const r = await fetch('/api/site', { credentials: 'same-origin', signal: AbortSignal.timeout(4000) });
    if (!r.ok) return;
    const j = (await r.json()) as Partial<SiteInfo> & { ok?: boolean };
    if (j.site !== 'public' && j.site !== 'friend') return;
    info = {
      site: j.site,
      split: j.split === true,
      open: j.open !== false,
      hidden: { modes: j.hidden?.modes ?? [], minigames: j.hidden?.minigames ?? [] },
      publicUrl: typeof j.publicUrl === 'string' ? j.publicUrl : null,
      gongbang: (j as { gongbang?: unknown }).gongbang === true,
      solo: (j as { solo?: unknown }).solo === true,
      belt: (j as { belt?: unknown }).belt === true,
      trim: readTrim((j as { trim?: unknown }).trim),
    };
    setSiteHiddenMinigames(info.hidden.minigames);
    document.documentElement.dataset.site = info.site;
  } catch {
    /* 오늘과 같게 */
  }
}
