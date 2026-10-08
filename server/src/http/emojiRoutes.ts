// =============================================================================
// ★★ 이모티콘 (R039 / D-187)
//
//   GET /api/emoji             목록 (표준 + 직접 등록, 사용 중인 것만) + 기본 10칸 번호
//   GET /api/emoji/:id/image   직접 등록 이모티콘 그림 (DB 에 저장된 것)
//   (표준 그림은 index.ts 가 /emoji/<code>.svg 로 낸다 — Twemoji)
//
// ★ 이모티콘은 **번호(id)** 로 주고받는다. 메모리에 목록을 들고 있어 소켓 `emoji.send` 가 번호를 바로 확인한다.
//   ★ 목록을 다시 읽는 때: 서버 시작 · GET /api/emoji (DB 로 직접 등록한 것이 다음 접속부터 보이게)
// =============================================================================

import { Router } from 'express';
import { query } from '../db/pool.js';

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
}

let catalog = new Map<number, EmojiMeta>();
let defaults: number[] = [];
let loadedAt = 0;

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
    }>(`SELECT id, kind, code, char, name_ko, tags, category FROM emojis WHERE active ORDER BY
          CASE category WHEN 'custom' THEN 0 WHEN 'smileys' THEN 1 WHEN 'people' THEN 2 WHEN 'animals' THEN 3
            WHEN 'food' THEN 4 WHEN 'activities' THEN 5 WHEN 'travel' THEN 6 WHEN 'objects' THEN 7
            WHEN 'symbols' THEN 8 ELSE 9 END, sort_order, id`);
    const next = new Map<number, EmojiMeta>();
    for (const x of r.rows) {
      next.set(x.id, { id: x.id, kind: x.kind, code: x.code, char: x.char, name: x.name_ko, tags: x.tags ?? [], category: x.category });
    }
    catalog = next;
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

emojiRouter.get('/', async (_req, res) => {
  if (Date.now() - loadedAt > 30_000) await loadEmojiCatalog();
  res.setHeader('Cache-Control', 'no-cache');
  res.json({ ok: true, emojis: [...catalog.values()], defaults });
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
