// V120 판정 묶음 만들기 — 대상 = 받은것 status ready 268 (키 순서 = 팩 순서)
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url)); const R='C:/work/quiz-web/web-desk/tone/';
const diff=JSON.parse(fs.readFileSync(path.join(HERE,'diff.json'),'utf8'));
const sent=new Map(), got=new Map();
for(let i=1;i<=8;i++){const p='p0'+i;
 JSON.parse(fs.readFileSync(`${R}보낼것/기존-고침-01-${p}.json`,'utf8').replace(/^\uFEFF/,'')).items.forEach(x=>sent.set(String(x.key),x));
 JSON.parse(fs.readFileSync(`${R}받은것/기존-고침-01-${p}.json`,'utf8').replace(/^\uFEFF/,'')).cards.forEach(x=>got.set(String(x.key),x));}
const keys=[...got.keys()].filter(k=>got.get(k).status==='ready');
const CH=20; const nm=(i)=>'j'+String(i+1).padStart(2,'0');
const lines=(s)=>String(s??'').split('\n').join(' ');
function block(k){
 const s=sent.get(k), g=got.get(k), c=s.card, m=s.material, real=diff.cards[k].real;
 const o=[`### ${k}${/^n/.test(k)?'  (새 카드 — 재료는 core · story · hintIdea · extra)':''}`];
 o.push(`정답: ${c.answer}${c.also?.length?'  (인정 답: '+c.also.join(' / ')+')':''}`);
 o.push('-- 고칠 까닭(보낸 지시) --');
 for(const w of s.why){ if(w.kind==='fix') o.push(`· [fix ${w.field}] 구절: ${lines(w.span)} / 까닭: ${w.why} / 재료: ${w.material}`);
  else if(w.kind==='read') o.push(`· [read ${w.what}] ${w.note??''}`);
  else if(w.kind==='wide') o.push(`· [wide] ${lines(JSON.stringify(w))}`);
  else o.push(`· [${w.kind}] ${lines(w.note??w.why??JSON.stringify(w))}`); }
 o.push('-- 고치기 전 --');
 o.push(`질문: ${c.question}`); o.push(`힌트: ${c.hint}`); o.push(`해설: ${c.explanation}`);
 o.push(`-- 고친 뒤 (바뀐 칸: ${real.length?real.join(' · '):'없음'}) --`);
 o.push(`질문: ${real.includes('q')?g.question:'(그대로)'}`); o.push(`힌트: ${real.includes('hint')?g.hint:'(그대로)'}`); o.push(`해설: ${real.includes('exp')?g.explanation:'(그대로)'}`);
 o.push(`-- 재료 (${m.state??'새 카드 재료'}) --`);
 if(/^n/.test(k)){
  const t=(x)=>x?`${lines(x.text)}  ⟨${lines(x.quote)}⟩`:'';
  o.push(`core: ${t(m.core)}`); (m.story||[]).forEach((x,i)=>o.push(`story${i+1}: ${t(x)}`)); o.push(`hintIdea: ${t(m.hintIdea)}`);
  (m.extra||[]).forEach((x,i)=>o.push(`extra${i+1}: ${t(x)}`)); if(m.why) o.push(`why: ${m.why}`); if(m.care) o.push(`care: ${m.care}`); if(m.hintRisk) o.push(`hintRisk: ${lines(JSON.stringify(m.hintRisk))}`);
 } else {
  if(m.core&&m.core!=='원문 질문 그대로') o.push(`core: ${lines(typeof m.core==='string'?m.core:m.core.text)}`);
  for(const f of m.facts??[]) o.push(`${f.id} [${f.where}] ${f.check}: ${lines(f.text)}${f.fixed?'  ★판정 후 고친 값: '+lines(f.fixed):''}${f.quote?'  ⟨'+lines(f.quote)+'⟩':''}`);
  for(const f of m.extra??[]) o.push(`${f.id} [extra] ${lines(f.text)}${f.quote?'  ⟨'+lines(f.quote)+'⟩':''}`);
  if(m.note) o.push(`재료 메모: ${lines(m.note)}`);
 }
 o.push(''); return o.join('\n');
}
const n=Math.ceil(keys.length/CH); const metas=[];
for(let i=0;i<n;i++){ const ks=keys.slice(i*CH,(i+1)*CH); const f=path.join(HERE,nm(i)+'.txt');
 fs.writeFileSync(f,`## V120 ${nm(i)} (${ks.length}건)\n\n`+ks.map(block).join('\n')); fs.writeFileSync(path.join(HERE,nm(i)+'.meta.json'),JSON.stringify({chunk:nm(i),order:ks})); metas.push([nm(i),ks.length]); }
console.log(keys.length,n,JSON.stringify(metas));
