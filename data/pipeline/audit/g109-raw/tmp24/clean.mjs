import fs from 'fs';
for(const f of fs.readdirSync('.').filter(x=>x.startsWith('en_')&&x.endsWith('.txt')&&!x.startsWith('en_c_'))){
 let t=fs.readFileSync(f,'utf8');
 t=t.replace(/<ref[^>]*\/>/g,'').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g,'').replace(/<!--[\s\S]*?-->/g,'');
 for(let i=0;i<4;i++) t=t.replace(/\{\{[^{}]*\}\}/g,'');
 t=t.replace(/\[\[(?:File|Image):[^\]]*\]\]/g,'').replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g,'$1').replace(/\[\[([^\]]*)\]\]/g,'$1').replace(/'{2,}/g,'').replace(/&ndash;/g,'–').replace(/&nbsp;/g,' ');
 fs.writeFileSync('c_'+f,t);
}
