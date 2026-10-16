// =============================================================================
// ★★★ 이모티콘샵 · 뽑기 (R049 / D-231)
//
//   GET  /api/shop            { ok, balance, themes:[{ key, name, price, total, owned:[emoji ids] }] }
//   POST /api/shop/draw       { themeKey } → { ok, emoji:{id,name,themeKey}, balance, owned:[ids], total }
//
// ★ 찬종: "테마는 선택할 수 있지만 원하는 gif 를 고를 수는 없어. 무작위 뽑기." · (설계 권장안 채택) **아직 갖지 않은 것 중에서** 무작위 — 중복이 없다.
//   테마를 다 모으면 409 'complete'. 포인트가 모자라면 409 'insufficient'. 테마 없음 404. 로그인 없음 401.
// ★★ 돈이 걸린 트랜잭션 — 한 트랜잭션 안에서 **계정 행을 잠그고**(SELECT … FOR UPDATE) 잔액을 다시 센 뒤 account_emojis · point_spends 를 넣는다.
//   같은 계정이 동시에 두 번 눌러도 직렬로 처리되어 잔액이 음수가 되지 않는다(봇 shop 이 확인).
// ★ 값: emoji_themes.price. 검사용 덮어쓰기 SHOP_PRICE_OVERRIDE(config.tuning) — 실제 서버에선 0.
// =============================================================================

import { Router } from 'express';
import { randomInt } from 'node:crypto';
import { readSessionToken, resolveSession } from '../auth/session.js';
import { getPool } from '../db/pool.js';
import { config } from '../config.js';
import { POINTS_SQL, pointsFromRow } from '../db/points.js';
import { emojiName, ensureCatalog, getThemes, specialIdsOfTheme, ownedEmojiIds } from './emojiRoutes.js';

export const shopRouter = Router();

const priceOf = (dbPrice: number): number => (config.tuning.shopPriceOverride > 0 ? config.tuning.shopPriceOverride : dbPrice);

shopRouter.get('/', async (req, res) => {
  const session = await resolveSession(readSessionToken(req.headers.cookie));
  if (!session) {
    res.status(401).json({ ok: false });
    return;
  }
  await ensureCatalog();
  const owned = await ownedEmojiIds(session.accountId);
  const bal = await getPool().query<{ correct: string; rewards: string; spent: string }>(POINTS_SQL, [session.accountId]);
  const balance = pointsFromRow(bal.rows[0]).balance;
  const themes = getThemes()
    .filter((t) => t.active)
    .map((t) => {
      const ids = specialIdsOfTheme(t.id);
      return { key: t.key, name: t.name, price: priceOf(t.price), total: ids.length, owned: ids.filter((id) => owned.has(id)) };
    });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, balance, themes });
});

shopRouter.post('/draw', async (req, res) => {
  const session = await resolveSession(readSessionToken(req.headers.cookie));
  if (!session) {
    res.status(401).json({ ok: false });
    return;
  }
  const themeKey = typeof (req.body as { themeKey?: unknown })?.themeKey === 'string' ? (req.body as { themeKey: string }).themeKey : '';
  await ensureCatalog();
  const theme = getThemes().find((t) => t.key === themeKey && t.active);
  if (!theme) {
    res.status(404).json({ ok: false, message: '없는 테마예요.' });
    return;
  }
  const price = priceOf(theme.price);
  const all = specialIdsOfTheme(theme.id);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    // ★ 같은 계정의 동시 뽑기를 직렬로 — 계정 행 잠금
    await client.query(`SELECT id FROM accounts WHERE id = $1 FOR UPDATE`, [session.accountId]);
    // ★ R050 — 포인트 식은 db/points.ts 한 곳 (맞힌 문제 + 미니게임 보상 − 쓴 것)
    const bal = await client.query<{ correct: string; rewards: string; spent: string }>(POINTS_SQL, [session.accountId]);
    const balance = pointsFromRow(bal.rows[0]).balance;
    const ownedRows = await client.query<{ emoji_id: number }>(`SELECT emoji_id FROM account_emojis WHERE account_id = $1`, [session.accountId]);
    const owned = new Set(ownedRows.rows.map((r) => r.emoji_id));
    const pool = all.filter((id) => !owned.has(id));
    if (pool.length === 0) {
      await client.query('ROLLBACK');
      res.status(409).json({ ok: false, reason: 'complete', message: '이 테마는 다 모았어요!', balance, owned: [...owned], total: all.length });
      return;
    }
    if (balance < price) {
      await client.query('ROLLBACK');
      res.status(409).json({ ok: false, reason: 'insufficient', message: `${price - balance}점 모자라요.`, balance, owned: [...owned], total: all.length });
      return;
    }
    const picked = pool[randomInt(pool.length)]!;
    await client.query(`INSERT INTO account_emojis (account_id, emoji_id) VALUES ($1, $2)`, [session.accountId, picked]);
    await client.query(`INSERT INTO point_spends (account_id, amount, reason, ref) VALUES ($1, $2, 'gacha', $3)`, [session.accountId, price, `theme:${theme.key}/emoji:${picked}`]);
    await client.query('COMMIT');
    owned.add(picked);
    res.json({
      ok: true,
      emoji: { id: picked, name: emojiName(picked), themeKey: theme.key },
      balance: balance - price,
      owned: [...owned],
      total: all.length,
      price,
    });
    console.log(`[shop] 뽑기 #${session.accountId} ${theme.key} → ${picked} (${price}P · 남은 ${balance - price})`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[shop] 뽑기 실패:', (err as Error).message);
    res.status(500).json({ ok: false, message: '뽑기에 실패했어요. 다시 해 주세요.' });
  } finally {
    client.release();
  }
});
