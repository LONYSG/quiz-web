import fs from 'node:fs';import {rows,topic,canon,save} from './lib.mjs';
const r=rows(fs.readFileSync('_cache/ko-대한민국의_기초자치단체_목록.html','utf8')).filter(x=>x.length>=5&&/(시|군|구)$/.test(x[0].replace('틀:나라자료 ',''))||/^틀/.test(x[0]));
const page=r.map(x=>({name:x[0].replace(/^틀:나라자료 \S+ /,''),raw:x[0],metro:x[1],kind:x[2]}));
console.log('page rows',page.length);
const t=topic('kr-municipality');
const byCanon=new Map();for(const it of t.items){byCanon.set(canon(it.name),it);for(const v of it.variants||[])if(!byCanon.has(canon(v)))byCanon.set(canon(v),it);}
const short=m=>m.replace(/(특별시|광역시|특별자치시|특별자치도|통합특별시|도)$/,'').replace(/^전남광주통합$/,'광주').replace(/^충청북$/,'충북').replace(/^충청남$/,'충남').replace(/^경상북$/,'경북').replace(/^경상남$/,'경남').replace(/^전라북$/,'전북').replace(/^전라남$/,'전남');
const used=new Set();const miss=[];
for(const p of page){let hit=byCanon.get(canon(p.name));
  const alt=[p.metro+' '+p.name,short(p.metro)+' '+p.name,p.metro.slice(0,2)+' '+p.name];
  const dupName=page.filter(q=>q.name===p.name).length>1;
  if(dupName||!hit){for(const a of alt){if(byCanon.has(canon(a))){hit=byCanon.get(canon(a));break;}}}
  if(hit&&!used.has(hit.id)){used.add(hit.id);}else miss.push(`${p.raw} (${p.metro}${hit?' dupHit '+hit.name:''})`);}
console.log('unmatched page',miss.length);console.log(miss.join('\n'));
console.log('file unmatched',t.items.filter(i=>!used.has(i.id)).map(i=>i.id+':'+i.name).join(', '));
save('kr-municipality',page.map(p=>p.metro+' '+p.name));
