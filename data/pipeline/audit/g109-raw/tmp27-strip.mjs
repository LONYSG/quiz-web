import fs from 'fs';
for (const f of fs.readdirSync('.').filter(x=>x.endsWith('.txt')&&!x.startsWith('stripped'))) {
 let t=fs.readFileSync(f,'utf8');
 t=t.replace(/<ref[^>]*\/>/g,'').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g,'').replace(/\{\{[^{}]*\}\}/g,'').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g,'$1').replace(/'''|''/g,'');
 fs.writeFileSync('s_'+f,t);
}
