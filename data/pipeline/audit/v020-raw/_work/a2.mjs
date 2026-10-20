import fs from 'node:fs';
const J=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const db=J('db-items.json'); const by=Object.fromEntries(db.map(x=>[x.id,x]));
const list={ // C78 ②
 'name':['price-0018','price-0144'],
 'newImage':['price-0013','estimate-0069','which-0286'],
 'cropped':['price-0030','price-0049','which-0058','which-0118','photo-0214','which-0190','which-0199','which-0272','which-0278','which-0279','which-0292','which-0300'],
 'cv49variants':['photo-0172','photo-0174','photo-0175','photo-0176','photo-0185','photo-0188','photo-0191','photo-0193','photo-0194','photo-0213','photo-0220','photo-0085','photo-0031'],
 'multi':['photo-0207','photo-0141','photo-0213'],
};
const fixed=new Set(Object.values(list).flat()); 
let seed=20261020; const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff};
const sh=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const rand={}; const rset=[];
for(const g of ['price','worldprice','photo','estimate','which']){ const pool=db.filter(x=>x.game===g&&!fixed.has(x.id)).map(x=>x.id); rand[g]=sh(pool).slice(0,8); rset.push(...rand[g]); }
const all=[...fixed,...rset]; 
const missing=all.filter(i=>!by[i]); console.log('missing',missing);
const tag=i=>Object.entries(list).filter(([k,v])=>v.includes(i)).map(([k])=>k).join('+')||'random';
const one=s=>String(s??'').replace(/\s*\n\s*/g,' ').trim();
const src=s=>(s||[]).map(x=>`<${x.url}> «${one(x.note).slice(0,220)}»`).join('  ||  ');
const fmt=i=>{const x=by[i];const p=x.payload;const L=[`### ${i}  [${tag(i)}]`];
 if(x.game==='price') L.push(`상품: ${p.name} (${p.brand||''}) · 분류 ${p.category} · 구간 ${p.bucket}`,`값: ${p.priceKrw}원 · ${p.priceKind} · 기준일 ${p.priceAsOf}`,`note: ${one(p.note)}`,`priceSources: ${(p.priceSources||[]).map(s=>`${s.seller} ${s.priceKrw}원 <${s.url}>`).join(' || ')}`,`sources: ${src(p.sources)}`,`그림: ${p.image?.file} (${p.image?.license} · ${p.image?.attribution})`);
 else if(x.game==='photo') L.push(`정답: ${p.answer}${p.altAnswers?.length?'   altAnswers: '+p.altAnswers.join(' | '):''}${p.variants?.length?'   variants: '+p.variants.join(' | '):''}`,`질문: ${one(p.question||'')}`,`난이도: ${p.difficulty??''}`,`해설: ${one(p.explanation)}`,`sources: ${src(p.sources)}`,`그림: ${p.image?.file} (${p.image?.license} · ${p.image?.attribution} · ${p.image?.sourceUrl})`);
 else if(x.game==='estimate') L.push(`질문: ${p.question}`,`값: ${p.value} ${p.unit} · kind ${p.kind} · asOf ${p.asOf}`,`note: ${one(p.note)}`,`해설: ${one(p.explanation)}`,`sources: ${src(p.sources)}`,p.image?`그림: ${p.image.file} (${p.image.license})`:'그림: 없음');
 else if(x.game==='which') L.push(`stem: ${p.stem} (kind ${p.kind}, margin ${p.margin}, unit ${p.unit||''}, asOf ${p.asOf||''})`,`A: ${p.a.label} = ${p.a.value}   B: ${p.b.label} = ${p.b.value}   정답: ${p.answer}`,`note: ${one(p.note||'')}`,`sources: ${src(p.sources)}`,`그림: ${[p.image,p.a?.image,p.b?.image].filter(Boolean).map(m=>m.file+' ('+m.license+')').join(' ; ')||'없음'}`);
 else if(x.game==='worldprice') L.push(`품목 ${p.productId} · 대상 ${p.targetCc} · 함께 보이는 ${p.shownCc.join(',')}`,`note: ${one(p.note||'')}`,`sources: ${src(p.sources)}`);
 L.push(''); return L.filter(s=>s!=='').join('\n')+'\n'};
const order=[...fixed,...rset]; const half=Math.ceil(order.length/2);
const pieces=[order.slice(0,half),order.slice(half)];
pieces.forEach((a,i)=>{fs.writeFileSync(`a${i+1}.txt`,`## 미니게임 사람 읽기 조각 a${i+1} (${a.length}건)\n\n`+a.map(fmt).join('\n'));fs.writeFileSync(`a${i+1}.keys.json`,JSON.stringify(a));});
fs.writeFileSync('a2-sample.json',JSON.stringify({list,rand,total:order.length},null,1));
console.log(order.length, Object.fromEntries(Object.entries(list).map(([k,v])=>[k,v.length])), 'unique fixed',fixed.size, rand);
