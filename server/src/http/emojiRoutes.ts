// =============================================================================
// ★★ 이모티콘 (R039 / D-187)
//
//   GET /api/emoji             목록 (표준 + 직접 등록, 사용 중인 것만) + 기본 10칸 번호
//                              ★ R048 — 특별 이모티콘(theme_id 있음)은 가진 사람에게만 내려보냈다 — D-230
//                              ★★ R049 개정 (D-231) — **메타는 전원에게**(다른 사람이 보낸 특별 이모티콘을 그리려면 필요) + `ownedSpecial`(내가 가진 것)
//                                  + `themes`. 고르기 창 "특별" 탭 · 10칸은 owned 만, 그리기는 전부. 보내기 차단(미보유)은 소켓이 그대로.
//   GET /api/emoji/:id/image   직접 등록 이모티콘 그림 (DB 에 저장된 것)
//   (표준 그림은 index.ts 가 /emoji/<code>.svg 로 낸다 — Twemoji)
//
// ★ 이모티콘은 **번호(id)** 로 주고받는다. 메모리에 목록을 들고 있어 소켓 `emoji.send` 가 번호를 바로 확인한다.
//   ★ 목록을 다시 읽는 때: 서버 시작 · GET /api/emoji (DB 로 직접 등록한 것이 다음 접속부터 보이게)
// =============================================================================

import { Router } from 'express';
import { query } from '../db/pool.js';
import { readSessionToken, resolveSession } from '../auth/session.js';

export const emojiRouter = Router();

/** ★ 기본 10칸 (Alt+1 ~ Alt+0) — 건우 지정. Twemoji 코드로 적고 번호는 DB 에서 찾는다 */
export const DEFAULT_EMOJI_CODES = ['1f44d', '1f602', '1f62e', '1f62d', '1f621', '1f44f', '1f525', '1f914', '1f389', '2620'];

export interface EmojiMeta {
  id: number;
  kind: 'standard' | 'custom';
  code: string | null;
  char: string | null;
  name: string;
  tags: string[];
  category: string;
  /** ★ R048 — 특별 이모티콘의 테마 (없으면 null = 누구나) */
  themeId: number | null;
}

export interface EmojiThemeMeta {
  id: number;
  key: string;
  name: string;
  price: number;
  active: boolean;
}

let catalog = new Map<number, EmojiMeta>();
let themes: EmojiThemeMeta[] = [];
let defaults: number[] = [];
let loadedAt = 0;
/** ★ R057 — 유니코드 글자 → 번호 (변형 선택자 FE0F 는 빼고 맞춘다) */
let byChar = new Map<string, number>();
const charKey = (s: string) => s.replace(/\uFE0F/g, '');

export async function loadEmojiCatalog(): Promise<void> {
  try {
    const r = await query<{
      id: number;
      kind: 'standard' | 'custom';
      code: string | null;
      char: string | null;
      name_ko: string;
      tags: string[];
      category: string;
      theme_id: number | null;
    }>(`SELECT id, kind, code, char, name_ko, tags, category, theme_id FROM emojis WHERE active ORDER BY
          CASE category WHEN 'custom' THEN 0 WHEN 'smileys' THEN 1 WHEN 'people' THEN 2 WHEN 'animals' THEN 3
            WHEN 'food' THEN 4 WHEN 'activities' THEN 5 WHEN 'travel' THEN 6 WHEN 'objects' THEN 7
            WHEN 'symbols' THEN 8 ELSE 9 END, sort_order, id`);
    const next = new Map<number, EmojiMeta>();
    for (const x of r.rows) {
      next.set(x.id, { id: x.id, kind: x.kind, code: x.code, char: x.char, name: x.name_ko, tags: x.tags ?? [], category: x.category, themeId: x.theme_id ?? null });
    }
    catalog = next;
    byChar = new Map([...next.values()].filter((e) => e.char).map((e) => [charKey(e.char!), e.id]));
    try {
      const t = await query<{ id: number; key: string; name_ko: string; price: number; active: boolean }>(`SELECT id, key, name_ko, price, active FROM emoji_themes ORDER BY sort_order, id`);
      themes = t.rows.map((x) => ({ id: x.id, key: x.key, name: x.name_ko, price: x.price, active: x.active }));
    } catch {
      themes = []; // 0016 미적용
    }
    const byCode = new Map([...next.values()].filter((e) => e.code).map((e) => [e.code!, e.id]));
    defaults = DEFAULT_EMOJI_CODES.map((c) => byCode.get(c)).filter((x): x is number => typeof x === 'number');
    loadedAt = Date.now();
  } catch (err) {
    // ★ 0013 미적용이어도 서버는 뜬다 — 이모티콘만 비어 있다
    console.warn('[emoji] ★ 목록을 읽지 못했다 (npm run db:migrate):', (err as Error).message);
  }
}

/** 소켓이 쓴다 — 사용 중인 이모티콘 번호인가 */
export function isEmojiId(id: number): boolean {
  return catalog.has(id);
}

/** ★ R057 — 유니코드 이모지 글자의 번호(목록에 없으면 null) */
export function emojiIdOfChar(char: string): number | null {
  return byChar.get(charKey(char)) ?? null;
}

/** ★ R048 — 특별 이모티콘인가 (theme_id 있음) */
export function isSpecialEmoji(id: number): boolean {
  return (catalog.get(id)?.themeId ?? null) !== null;
}

/** ★ R049 — 테마 목록 (메모리) · 테마의 특별 이모티콘 번호 · 이름 */
export function getThemes(): EmojiThemeMeta[] {
  return themes;
}
export function specialIdsOfTheme(themeId: number): number[] {
  return [...catalog.values()].filter((e) => e.themeId === themeId).map((e) => e.id);
}
export function emojiName(id: number): string {
  return catalog.get(id)?.name ?? '';
}
export async function ensureCatalog(): Promise<void> {
  if (Date.now() - loadedAt > 30_000) await loadEmojiCatalog();
}

/** ★ R048 — 계정이 가진 특별 이모티콘 (account_emojis). 소켓 emoji.send 가 막을 때 쓴다 */
export async function ownedEmojiIds(accountId: string): Promise<Set<number>> {
  try {
    const r = await query<{ emoji_id: number }>(`SELECT emoji_id FROM account_emojis WHERE account_id = $1`, [accountId]);
    const ids = new Set(r.rows.map((x) => x.emoji_id));
    ownedCache.set(accountId, { ids, at: Date.now() });
    return ids;
  } catch {
    return new Set(); // 0016 미적용
  }
}

/**
 * ★ R057 — 가진 특별 이모티콘의 메모리 사본(60초). 채팅 판정 경로가 기다리지 않게(채팅 속 `:sp:` 토큰).
 *   GET /api/emoji · emoji.send 가 채운다 · 뽑기 뒤 forgetOwned. 없으면 null(부르는 쪽이 한 번 읽는다)
 */
const ownedCache = new Map<string, { ids: Set<number>; at: number }>();
export function ownedEmojiIdsCached(accountId: string): Set<number> | null {
  const c = ownedCache.get(accountId);
  return c && Date.now() - c.at < 60_000 ? c.ids : null;
}
export function forgetOwned(accountId: string): void {
  ownedCache.delete(accountId);
}

emojiRouter.get('/', async (req, res) => {
  if (Date.now() - loadedAt > 30_000) await loadEmojiCatalog();
  res.setHeader('Cache-Control', 'no-cache');
  // ★★ R049 (D-231) — 메타는 전원에게(남이 보낸 특별 이모티콘을 그려야 한다) · 내가 가진 특별 번호는 ownedSpecial 로 따로
  const session = await resolveSession(readSessionToken(req.headers.cookie));
  const owned = session ? await ownedEmojiIds(session.accountId) : new Set<number>();
  res.json({ ok: true, emojis: [...catalog.values()], defaults, ownedSpecial: [...owned], themes: themes.filter((t) => t.active) });
});

emojiRouter.get('/:id/image', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).end();
    return;
  }
  const r = await query<{ image: Buffer; mime: string }>(`SELECT image, mime FROM emojis WHERE id = $1 AND kind = 'custom' AND active`, [id]);
  const row = r.rows[0];
  if (!row) {
    res.status(404).end();
    return;
  }
  res.setHeader('Content-Type', row.mime);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(row.image);
});
