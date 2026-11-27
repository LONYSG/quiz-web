import fs from 'fs';
for (const f of fs.readdirSync('.').filter(f=>f.endsWith('.raw'))) {
 let s=fs.readFileSync(f,'utf8');
 s=s.replace(/<ref[^>]*\/>/g,'').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g,'').replace(/<!--[\s\S]*?-->/g,'');
 for(let i=0;i<6;i++) s=s.replace(/\{\{[^{}]*\}\}/g,'');
 s=s.replace(/\[\[(?:File|Image|Category):[^\]]*\]\]/g,'').replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g,'$1').replace(/\[\[([^\]]*)\]\]/g,'$1').replace(/'''?/g,'').replace(/<[^>]+>/g,'');
 fs.writeFileSync(f.replace('.raw','.txt'),s);
 console.log(f,s.length);
}
