import { withDb } from './db.mjs';
await withDb(async (c) => {
  const q = async (s) => (await c.query(s)).rows[0];
  console.log(await q(`select count(*) filter (where is_active) active, count(*) filter (where status='pending_review') pending from questions`));
  console.log(await q(`select count(*) open from games where ended_at is null`));
});
