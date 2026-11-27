import fs from 'fs';
import { I } from './items.mjs';
const T = {};
const norm = s => s.replace(/\s+/g, ' ').trim();
const txt = f => (T[f] ??= norm(fs.readFileSync(new URL('./' + f + '.txt', import.meta.url), 'utf8')));
const U = f => 'https://en.wikipedia.org/wiki/' + (f === 'en-Kill_screen' ? 'Glossary_of_video_game_terms' : f.replace(/^en-/, ''));
let bad = 0;
const chk = (f, q, w) => { if (!txt(f).includes(norm(q))) { bad++; console.log('MISS', w, f, q.slice(0, 70)); } };
for (const it of I) { chk(...it.core, it.a + ' core'); it.story.forEach(s => chk(s[0], s[1], it.a + ' story')); if (it.hint) chk(it.hint[0], it.hint[1], it.a + ' hint'); }
console.log('items', I.length, 'bad', bad);
let n = 601;
const items = I.map(it => ({
  key: 'n' + String(n++).padStart(4, '0'), answer: it.a, also: it.also, spelling: '?', major: it.major, mid: it.mid, gradeGuess: it.g,
  core: { text: it.ctext, url: U(it.core[0]), quote: it.core[1] },
  story: it.story.map(s => ({ text: s[2], url: U(s[0]), quote: s[1] })),
  hintIdea: (it.hint && it.a !== '스케르초') ? { text: it.hint[2], url: U(it.hint[0]), quote: it.hint[1] } : null,
  legend: it.legend, care: it.care, why: it.why, dupOff: null,
}));
const out = { done: true, chunk: '새재료-07', lane: 'hard', items, dropped: { dupActive: 45, weakStory: 6, noSource: 2, other: 3 }, opened: 38 };
if (process.argv[2] === 'write') fs.writeFileSync(new URL('../chunk-07.json', import.meta.url), JSON.stringify(out, null, 1));
