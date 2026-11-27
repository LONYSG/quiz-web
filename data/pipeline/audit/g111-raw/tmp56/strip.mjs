import fs from 'fs';
fs.mkdirSync('s', { recursive: true });
for (const f of fs.readdirSync(process.argv[2]||'.').filter(x => x.endsWith('.txt'))) {
  let t = fs.readFileSync((process.argv[2]||'.')+'/'+f, 'utf8');
  if (t.startsWith('<!DOCTYPE')) continue;
  t = t.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  for (let i = 0; i < 5; i++) t = t.replace(/\{\{[^{}]*\}\}/g, '');
  t = t.replace(/\[\[(?:파일|File|분류|Category):[^\]]*\]\]/g, '');
  t = t.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[([^\]]*)\]\]/g, '$1');
  t = t.replace(/'''?/g, '').replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '');
  fs.writeFileSync('s/' + (process.argv[2]?'en_':'') + f, t.split('\n').filter(l => l.trim() && !l.startsWith('|') && !l.startsWith('}}')).join('\n'));
}
