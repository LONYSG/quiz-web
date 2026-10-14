// =============================================================================
// ★★ 특별 이모티콘 가져오기 (R048 / D-230)
//
//   node scripts/emoji-import.mjs --theme chiikawa --name 치이카와 --price 20 [--max 256] [--limit 1048576] [--dry]
//
//   assets/emoji/<theme>/ 의 그림을 sharp 로 ≤max px · ≤limit bytes 로 줄여 emojis(kind='custom' · category='special' · theme_id)에 넣는다.
//   ★ 같은 테마의 같은 파일명(source_name)은 건너뛴다(멱등). 변환본은 파일로 남기지 않는다(DB 가 정본).
//   ★ 움직이는 GIF: sharp 는 animated 입·출력을 지원한다(libvips cgif). 줄여도 1MB 를 넘으면 색을 줄이고(colours) 더 작게 다시 시도한다.
//   ★ DB 를 쓴다 — 돌리기 전 npm run db:backup.
// =============================================================================

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import sharp from 'sharp';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d;
};
const THEME = opt('--theme', null);
const NAME = opt('--name', null);
const PRICE = Number(opt('--price', '20'));
const MAX_PX = Number(opt('--max', '256'));
const LIMIT = Number(opt('--limit', String(1024 * 1024)));
const DRY = args.includes('--dry');
if (!THEME || !/^[a-z0-9-]+$/.test(THEME)) {
  console.error('사용법: node scripts/emoji-import.mjs --theme <key(영문소문자)> --name <한글 이름> --price <포인트>');
  process.exit(1);
}
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'assets', 'emoji', THEME);

/** 파일명의 캐릭터 → 한글 (찬종이 SQL 로 바꿀 수 있다 — DB-ADMIN) */
const KO = {
  chiikawa: '치이카와',
  hachiware: '하치와레',
  usagi: '우사기',
  momonga: '모몽가',
  kurimanju: '쿠리만쥬',
  kani: '카니',
  rakko: '랏코',
  shisa: '시사',
  siren: '세이렌',
  kabutomushi: '카부토무시',
  'kuroi nagareboshi': '쿠로이 나가레보시',
};
function nameFor(file) {
  const base = file.replace(/\.[^.]+$/, '');
  const m = base.match(/^(.*?)[_ ]?(\d+)$/);
  const who = (m ? m[1] : base).trim().toLowerCase();
  const n = m ? m[2] : '';
  const ko = KO[who] ?? who;
  return n ? `${ko} ${n}` : ko;
}
const MIME = { '.gif': 'image/gif', '.png': 'image/png', '.webp': 'image/webp', '.apng': 'image/apng' };

/** 줄이기 — 가로세로 ≤ MAX_PX, 바이트 ≤ LIMIT. GIF 는 색 수를 줄여 가며 다시 시도 */
async function shrink(buf, ext) {
  const meta = await sharp(buf, { animated: true }).metadata();
  const frames = meta.pages ?? 1;
  const w = meta.width ?? 0;
  const h = meta.pageHeight ?? meta.height ?? 0;
  const tries = ext === '.gif'
    ? [
        { px: MAX_PX, colours: 256 },
        { px: MAX_PX, colours: 128 },
        { px: MAX_PX, colours: 64 },
        { px: 192, colours: 64 },
        { px: 160, colours: 64 },
        { px: 128, colours: 48 },
      ]
    : [{ px: MAX_PX }, { px: 192 }, { px: 128 }];
  for (const t of tries) {
    let s = sharp(buf, { animated: true }).resize({ width: t.px, height: t.px, fit: 'inside', withoutEnlargement: true });
    if (ext === '.gif') s = s.gif({ colours: t.colours, effort: 7 });
    else if (ext === '.png' || ext === '.apng') s = s.png();
    else if (ext === '.webp') s = s.webp({ quality: 80 });
    const out = await s.toBuffer();
    const om = await sharp(out, { animated: true }).metadata();
    const ow = om.width ?? 0;
    const oh = om.pageHeight ?? om.height ?? 0;
    if (out.length <= LIMIT && ow <= MAX_PX && oh <= MAX_PX) {
      return { out, w, h, frames, ow, oh, oframes: om.pages ?? 1, try: t };
    }
  }
  return null;
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://quiz:quizlocal@localhost:5434/quizweb' });
await db.connect();
try {
  const files = (await readdir(DIR)).filter((f) => MIME[path.extname(f).toLowerCase()]).sort();
  if (files.length === 0) throw new Error(`${DIR} 에 그림이 없다`);
  let theme = (await db.query(`SELECT id, name_ko, price FROM emoji_themes WHERE key = $1`, [THEME])).rows[0];
  if (!theme) {
    if (!NAME) throw new Error('새 테마에는 --name 이 필요하다');
    if (DRY) theme = { id: 0, name_ko: NAME, price: PRICE };
    else {
      const maxSort = Number((await db.query(`SELECT coalesce(max(sort_order), 0) m FROM emoji_themes`)).rows[0].m);
      theme = (await db.query(`INSERT INTO emoji_themes (key, name_ko, price, sort_order) VALUES ($1, $2, $3, $4) RETURNING id, name_ko, price`, [THEME, NAME, PRICE, maxSort + 1])).rows[0];
      console.log(`[emoji-import] 테마 만듦: ${THEME} "${NAME}" ${PRICE}포인트 (id ${theme.id})`);
    }
  } else console.log(`[emoji-import] 테마 있음: ${THEME} "${theme.name_ko}" ${theme.price}포인트 (id ${theme.id}) — 이름·가격은 그대로`);
  const existing = new Set((await db.query(`SELECT source_name FROM emojis WHERE theme_id = $1`, [theme.id])).rows.map((r) => r.source_name));
  const rows = [];
  let order = Number((await db.query(`SELECT coalesce(max(sort_order), 0) m FROM emojis WHERE theme_id = $1`, [theme.id])).rows[0].m);
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (existing.has(f)) {
      rows.push({ file: f, skip: '이미 있음' });
      continue;
    }
    const buf = await readFile(path.join(DIR, f));
    const before = (await stat(path.join(DIR, f))).size;
    const r = await shrink(buf, ext);
    if (!r) {
      rows.push({ file: f, before, skip: `★ ${LIMIT} 바이트 이하로 못 줄임` });
      continue;
    }
    const name = nameFor(f);
    if (!DRY) {
      order += 1;
      await db.query(
        `INSERT INTO emojis (kind, name_ko, tags, category, sort_order, image, mime, theme_id, source_name)
         VALUES ('custom', $1, $2, 'special', $3, $4, $5, $6, $7)`,
        [name, [THEME, name.split(' ')[0]], order, r.out, MIME[ext], theme.id, f],
      );
    }
    rows.push({ file: f, name, before, after: r.out.length, src: `${r.w}×${r.h}×${r.frames}f`, dst: `${r.ow}×${r.oh}×${r.oframes}f`, how: `${r.try.px}px${r.try.colours ? ` ${r.try.colours}색` : ''}` });
  }
  console.log(`\n${'파일'.padEnd(26)} ${'이름'.padEnd(14)} ${'원본'.padStart(9)} ${'변환'.padStart(9)}  원본 크기        변환 크기        방법`);
  for (const r of rows) {
    if (r.skip) console.log(`${r.file.padEnd(26)} ${''.padEnd(14)} ${String(r.before ?? '').padStart(9)} ${''.padStart(9)}  ${r.skip}`);
    else console.log(`${r.file.padEnd(26)} ${r.name.padEnd(14)} ${String(r.before).padStart(9)} ${String(r.after).padStart(9)}  ${r.src.padEnd(16)} ${r.dst.padEnd(16)} ${r.how}`);
  }
  const done = rows.filter((r) => !r.skip).length;
  console.log(`\n[emoji-import] ${DRY ? '(dry) ' : ''}넣음 ${done} · 건너뜀 ${rows.length - done} · 테마 ${THEME} id ${theme.id}`);
} finally {
  await db.end();
}
