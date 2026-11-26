// G113 분류 55장 — G112 3-2 표의 key · 지금 분류 · 글 (읽기만)
import pg from 'pg'; import { readFileSync } from 'node:fs';
process.loadEnvFile?.(new URL('../../../../.env', import.meta.url));
export const KEYS55 = 'n4806 n4912 n5201 n4413 n3707 n5006 n4803 n3703 n4409 n5408 n5405 n4904 n4001 n4008 n5311 n1802 n5609 n5702 n4111 n5313 n5903 n4107 n4109 n4112 n5104 n5116 n4812 n5105 n4601 n4608 n4609 n4907 n4915 n4905 n4906 n4911 n4715 n4913 n3903 n4910 n5602 n3904 n3905 n3906 n4306 n4815 n3508 n4712 n5001 n5008 n5009 n5010 n4205 n4214 n4706'.split(' ');
export async function rows(db) {
  const u = new URL(process.env.DATABASE_URL); u.pathname = '/' + db;
  const c = new pg.Client({ connectionString: u.toString() }); await c.connect();
  const r = (await c.query(`select q.id::int, split_part(q.source_ref, '#g112-', 2) k, q.display_answer a, q.category_id::int cid, c.name_ko leaf, p.name_ko mid, p.id::int pid, g.name_ko major, t.game_topic topic, q.question_text qt, q.explanation ex
    from questions q join categories c on c.id=q.category_id join categories p on p.id=c.parent_id join categories g on g.id=p.parent_id join category_game_topics t on t.category_id=q.category_id
    where q.source_ref like '%#g112-%'`)).rows.filter((x) => KEYS55.includes(x.k));
  await c.end(); return r;
}
if (process.argv[2]) { const r = await rows(process.argv[2]); console.log(r.length); for (const x of r.sort((a,b)=>KEYS55.indexOf(a.k)-KEYS55.indexOf(b.k))) console.log(`${x.k} #${x.id} ${x.a} [${x.major}>${x.mid}>${x.leaf} · ${x.topic}]\n   Q ${x.qt}\n   E ${x.ex.slice(0,150)}`); }
