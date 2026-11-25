// =============================================================================
// ★★★ R109 (D-369) — 자리(공개 · 베타) 판별 · 자리별 숨김
//   정본 목록 = shared/src/site.ts · 문서 docs/01 "두 자리" · docs/21 4-1
//
// 판별 — siteOf(req) 한 함수(HTTP 요청 · 소켓 핸드셰이크 둘 다):
//   1) SITE_FORCE=public|friend → 그 자리(검사용)
//   2) PUBLIC_HOSTNAME 이 없다 → 지인(임시 주소 · localhost — 오늘까지의 쓰임 · 자리를 가르지 않는다)
//   3) Host = FRIEND_HOSTNAME → 지인 / Host = PUBLIC_HOSTNAME(www. 포함) → 공개
//   4) 이 PC 자신(루프백 · CF 헤더 없음)이 localhost 로 → 지인(찬종 PC 의 브라우저 · 오늘과 같다)
//   5) 그 밖(모르는 Host · 임시 주소로 열렸을 때) → 공개(안전한 쪽)
//   ★ 터널은 설정 파일(ops/cloudflared.example.yml)의 httpHostHeader 로 주소마다 Host 를 고정한다.
// =============================================================================

import type { IncomingMessage } from 'node:http';
import {
  FRIEND_ONLY_MINIGAMES,
  FRIEND_ONLY_MODES,
  MINIGAMES,
  NO_SITE_HIDDEN,
  PUBLIC_MIN_ITEMS,
  QUIZ_MINIGAME_KEYS,
  type MinigameKey,
  type QuizMinigameKey,
  type Site,
  type SiteHidden,
} from '@quiz/shared';
import { config } from './config.js';
import { publicQuizData, setOnQuizDataLoaded, type QuizData } from './db/minigameItems.js';
import { clientIp } from './security/http.js';

export interface SiteConfig {
  publicHostname: string | null;
  friendHostname: string | null;
  siteForce: Site | null;
  /** ★ R111 — 공개 자리를 여는가(없으면 닫힘으로 본다) */
  publicOpen?: boolean;
  /** ★★★ R119 — 한 주소 운영(SITE_ONE=1): 어느 Host 든 한 자리(숨김 없음 · 계정 문 열림 · 닫힘 없음) · beta 화면 요청은 메인으로 301 */
  siteOne?: boolean;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Host 머리말에서 이름만(포트 · 대소문자 뺌) */
export function hostOnly(host: string | undefined): string {
  const h = (host ?? '').trim().toLowerCase();
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1);
  return h.split(':')[0] ?? '';
}

/** 순수 판별(단위 테스트) */
export function siteOfHost(host: string | undefined, local: boolean, c: SiteConfig): Site {
  // ★★★ R119 — 한 주소 운영: 늘 한 자리(지금 베타가 보이는 것과 같다 — 숨김 없음). SITE_FORCE 보다 먼저.
  if (c.siteOne) return 'friend';
  if (c.siteForce) return c.siteForce;
  if (!c.publicHostname) return 'friend';
  const h = hostOnly(host);
  if (c.friendHostname && h === c.friendHostname) return 'friend';
  if (h === c.publicHostname || h === `www.${c.publicHostname}`) return 'public';
  if (local && LOCAL_HOSTS.has(h)) return 'friend';
  return 'public';
}

/** 자리를 가르는가(아니면 오늘과 같다 — 계정 검사 · 가입 막기 없음) */
export function siteSplit(c: SiteConfig = config): boolean {
  // ★★★ R119 — 한 주소 운영이면 가르지 않는다 → 계정 검사 · 가입 막기 · 준비 중 · noindex 가 다 꺼진다(R109 · R111 코드는 그대로 남는다)
  if (c.siteOne) return false;
  return Boolean(c.siteForce || c.publicHostname);
}

/**
 * ★★★ R119 — 한 주소 운영에서 beta 주소의 화면 요청 → 메인으로 보낼 주소(순수 · 단위 테스트). 보내지 않으면 null.
 *   /healthz · /api · 소켓(/socket.io)은 그대로 받는다(이미 열린 탭이 끊기지 않게 — 새로 고치면 화면 요청이 메인으로 간다).
 */
export function betaRedirectFor(host: string | undefined, url: string, method: string, c: SiteConfig): string | null {
  if (!c.siteOne || !c.publicHostname || !c.friendHostname) return null;
  if (hostOnly(host) !== c.friendHostname) return null;
  if (method !== 'GET' && method !== 'HEAD') return null;
  const path = url.split('?')[0] ?? '';
  if (path === '/healthz' || path === '/api' || path.startsWith('/api/') || path.startsWith('/socket.io')) return null;
  return `https://${c.publicHostname}${url.startsWith('/') ? url : `/${url}`}`;
}

export function siteOf(req: IncomingMessage): Site {
  return siteOfHost(req.headers.host, clientIp(req).local, config);
}

/**
 * ★★ R111 (D-371) — 닫힌 공개 자리인가(순수 · 단위 테스트). 자리를 가를 때 · 공개 자리 · PUBLIC_OPEN 이 아닐 때만 true.
 *   자리를 안 가르면(PUBLIC_HOSTNAME 없음 · 임시 주소 · 로컬) 늘 false — 오늘과 같다.
 */
export function publicClosedFor(site: Site, c: SiteConfig): boolean {
  return siteSplit(c) && site === 'public' && !c.publicOpen;
}
export function publicClosed(site: Site): boolean {
  return publicClosedFor(site, config);
}

/** 공개 주소(안내 링크 — 베타 자리 화면에서만 쓴다 · 공개 화면에는 베타 주소를 두지 않는다) · ★ R111 — 닫힌 동안은 없음(눌러 봐야 준비 중) */
export function publicUrl(): string | null {
  if (config.siteOne) return null; // ★ R119 — 한 주소 운영: 다른 주소로 가라는 안내가 없다
  return config.publicHostname && config.publicOpen ? `https://${config.publicHostname}` : null;
}

/** 지인 자리의 계정 검사를 하는가 — 자리를 가를 때의 지인 자리만 */
export function friendGate(site: Site, c: SiteConfig = config): boolean {
  return site === 'friend' && siteSplit(c);
}

// -----------------------------------------------------------------------------
// 자리별 숨김 — 공개 쪽은 적재본을 읽을 때마다 다시 센다
// -----------------------------------------------------------------------------
let publicHiddenNow: SiteHidden = { modes: [...FRIEND_ONLY_MODES], minigames: [...FRIEND_ONLY_MINIGAMES] };
/** 잰 값(보고 · /api/site 에는 싣지 않는다) */
export const publicCounts: Partial<Record<MinigameKey, { all: number; left: number }>> = {};

export function computePublicHidden(d: QuizData): SiteHidden {
  const pub = publicQuizData(d);
  const minigames: MinigameKey[] = [...FRIEND_ONLY_MINIGAMES];
  for (const m of MINIGAMES) {
    if (!(QUIZ_MINIGAME_KEYS as readonly string[]).includes(m.key) || minigames.includes(m.key)) continue;
    const k = m.key as QuizMinigameKey;
    const all = d.items[k]?.length ?? 0;
    const left = pub.items[k]?.length ?? 0;
    publicCounts[m.key] = { all, left };
    // 지인 전용 항목이 하나라도 있어 줄어든 게임만 본다(원래 적은 게임은 오늘과 같게)
    if (left < all && left < PUBLIC_MIN_ITEMS) minigames.push(m.key);
  }
  return { modes: [...FRIEND_ONLY_MODES], minigames };
}

setOnQuizDataLoaded((d) => {
  publicHiddenNow = computePublicHidden(d);
});

export function hiddenFor(site: Site): SiteHidden {
  return site === 'public' ? publicHiddenNow : NO_SITE_HIDDEN;
}

/** 방 자리에 맞는 퀴즈류 적재본 */
export function quizDataFor(site: Site, d: QuizData): QuizData {
  return site === 'public' ? publicQuizData(d) : d;
}
