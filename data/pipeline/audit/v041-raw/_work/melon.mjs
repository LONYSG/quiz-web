import { writeFileSync, existsSync } from 'node:fs';
for (let y = 2005; y <= 2025; y++) {
  const f = `data/pipeline/audit/v041-raw/melon/${y}.html`;
  if (existsSync(f)) continue;
  const r = await fetch(`https://www.melon.com/chart/age/list.htm?idx=1&chartType=YE&chartGenre=KPOP&chartDate=${y}&moved=Y`, { headers: { 'User-Agent': 'quiz-web-v041/1.0' } });
  writeFileSync(f, await r.text()); console.log(y, r.status);
  await new Promise(r => setTimeout(r, 3000));
}
