import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path';
const R='C:/work/quiz-web'; const J=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const db=Object.fromEntries(J('db-items.json').map(x=>[x.id,x])); const dbi=Object.fromEntries(J('db-images.json').map(x=>[x.id,x])); const dbp=Object.fromEntries(J('db-products.json').map(x=>[x.id,x]));
const canon=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const diffs=[]; let n=0, loaded=0; const byGame={}; const imgChecked=new Set(); const fileStatus={};
for(const g of ['price','worldprice','photo','estimate','which']) for(const f of ['items.json','items-2.json']){
  const j=J(`${R}/data/minigame/${g}/${f}`);
  for(const it of j.items){ fileStatus[it.status]=(fileStatus[it.status]||0)+1; if(it.status!=='loaded') continue; loaded++; byGame[g]=(byGame[g]||0)+1;
    const d=db[it.id]; if(!d){diffs.push({id:it.id,kind:'DB 없음'});continue;}
    const {verify,...payload}=it;
    const dp={...d.payload}; 
    // status 칸: 파일 loaded ↔ payload (적재 때 verified)
    const pStatusDiff = dp.status!==payload.status ? [dp.status,payload.status] : null; delete dp.status; const p2={...payload}; delete p2.status;
    if(canon(dp)!==canon(p2)){ const ks=[...new Set([...Object.keys(dp),...Object.keys(p2)])].filter(k=>canon(dp[k])!==canon(p2[k])); diffs.push({id:it.id,kind:'payload',keys:ks}); }
    if(pStatusDiff) (diffs.statusOnly??=[]).push(it.id);
    if(d.status!=='loaded'||!d.active) diffs.push({id:it.id,kind:'status/active',s:d.status,a:d.active});
    if(canon(d.tags)!==canon(it.tags||[])) diffs.push({id:it.id,kind:'tags'});
    // 그림
    const imgs=[]; const im=it.image; const list=Array.isArray(im)?im:(im?[im]:[]); 
    for(const k of Object.keys(it)) if(/^images$|image[A-Z]/.test(k)) {} 
    const files=[...(it.image?[it.image]:[]),...(it.images||[]),it.a?.image,it.b?.image].filter(Boolean);
    const ids=files.map(x=>path.basename(x.file||'').replace(/\.[^.]+$/,''));
    if(canon(ids)!==canon(d.image_ids)) diffs.push({id:it.id,kind:'image_ids',file:ids,db:d.image_ids});
    for(const x of files){ const id=path.basename(x.file).replace(/\.[^.]+$/,''); if(imgChecked.has(id)) continue; imgChecked.add(id);
      const fp=`${R}/${x.file}`; if(!fs.existsSync(fp)){diffs.push({id:it.id,kind:'그림 파일 없음',file:x.file});continue;}
      const buf=fs.readFileSync(fp); const md5=crypto.createHash('md5').update(buf).digest('hex'); const di=dbi[id];
      if(!di) diffs.push({id:it.id,kind:'DB 그림 없음',image:id}); else { if(di.md5!==md5) diffs.push({id:it.id,kind:'md5',image:id}); if(di.license!==x.license||di.attribution!==x.attribution||di.src!==x.sourceUrl) diffs.push({id:it.id,kind:'license/attribution/source',image:id}); if(di.w!==x.width||di.h!==x.height) diffs.push({id:it.id,kind:'w/h(파일 칸)',image:id,db:[di.w,di.h],file:[x.width,x.height]}); }
    }
  }
}
// 반대: DB 에 있는데 파일 loaded 아님
const fileLoaded=new Set(); 
for(const g of ['price','worldprice','photo','estimate','which']) for(const f of ['items.json','items-2.json']) for(const it of J(`${R}/data/minigame/${g}/${f}`).items) if(it.status==='loaded') fileLoaded.add(it.id);
const extra=Object.keys(db).filter(k=>!fileLoaded.has(k));
// products
const pj=J(`${R}/data/minigame/worldprice/products.json`).products; const pd=[];
for(const p of pj){ const {image,...pl}=p; const d=dbp[p.productId]; if(!d){pd.push({id:p.productId,kind:'DB 없음'});continue;} if(canon(d.payload)!==canon(pl)) pd.push({id:p.productId,kind:'payload'}); const imId=p.image?path.basename(p.image.file).replace(/\.[^.]+$/,''):null; if(d.image_id!==imId) pd.push({id:p.productId,kind:'image_id'}); if(imId){const buf=fs.readFileSync(`${R}/${p.image.file}`); if(dbi[imId]?.md5!==crypto.createHash('md5').update(buf).digest('hex')) pd.push({id:p.productId,kind:'md5'});} }
const unusedDbImgs=Object.keys(dbi).filter(k=>!imgChecked.has(k)&&!pj.some(p=>p.image&&p.image.file.includes('/'+k+'.')));
console.log(JSON.stringify({fileStatus,loaded,byGame,dbItems:Object.keys(db).length,dbImages:Object.keys(dbi).length,dbProducts:Object.keys(dbp).length,imagesChecked:imgChecked.size,diffN:diffs.length,diffKinds:diffs.reduce((m,x)=>{m[x.kind]=(m[x.kind]||0)+1;return m},{}),statusOnly:(diffs.statusOnly||[]).length,extraInDbNotLoaded:extra,productDiffs:pd,unusedDbImgs:unusedDbImgs.length},null,1));
fs.writeFileSync('a1-diffs.json',JSON.stringify({diffs,statusOnly:diffs.statusOnly||[],pd,extra},null,1));
