import fs from 'node:fs';
const T=s=>JSON.parse(fs.readFileSync(`data/minigame/topics/${s}.json`,'utf8'));
const canon=s=>String(s).normalize('NFKC').toLowerCase().replace(/[\s·・\-_.,'’"()\[\]\/:!?&]/g,'');
for(const s of ['kr-municipality','seoul-subway-station','currency','world-capital','constellation','disney-animated-film','sport']){
 const t=T(s);const f=(t.verify.fixes||[]);const res=[];let ap=0,bad=0;
 for(const x of f){ if(!x.applied){res.push('NOAPPLIED '+JSON.stringify(x).slice(0,80));continue}ap++;
  const byName=n=>t.items.find(i=>canon(i.name)===canon(n)||(i.variants||[]).some(v=>canon(v)===canon(n)));
  let ok=true,msg='';
  if(x.op==='add'){const it=t.items.find(i=>canon(i.name)===canon(x.name));ok=!!it&&(x.variants||[]).every(v=>(it.variants||[]).some(w=>canon(w)===canon(v)));msg=it?'':'no item'}
  else if(x.op==='remove'){ok=!t.items.some(i=>i.id===x.id);}
  else if(x.op==='variant'){const it=x.id?t.items.find(i=>i.id===x.id):byName(x.name);ok=!!it&&x.variants.every(v=>canon(it.name)===canon(v)||(it.variants||[]).some(w=>canon(w)===canon(v)));msg=it?'':'no item'}
  else if(x.op==='variant-remove'){const it=t.items.find(i=>i.id===x.id);ok=!!it&&x.variants.every(v=>!(it.variants||[]).some(w=>canon(w)===canon(v)));}
  else if(x.op==='rename'){ok=true;msg='rename?'}
  if(!ok){bad++;res.push('MISMATCH '+JSON.stringify(x).slice(0,160)+' '+msg)}}
 console.log(s,t.status,'items',t.items.length,'fixes',f.length,'applied',ap,'bad',bad,res.join(' ; '));
}
