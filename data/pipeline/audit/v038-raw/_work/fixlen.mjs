// node fixlen.mjs "고친 질문" → 전체 글자 수 · 문장별 글자 수 (규칙: 전체 240 · 문장 70 · 2~4문장)
const t=process.argv[2]||'';const ss=t.split(/(?<=[.?!])\s+/).filter(Boolean);
console.log('전체',[...t].length,'문장',ss.length,ss.map(s=>[...s].length).join('/'));
