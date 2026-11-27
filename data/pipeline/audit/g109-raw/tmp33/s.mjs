import fs from 'fs';
export function strip(f){let t=fs.readFileSync(f,'utf8');t=t.replace(/<ref[^>]*\/>/g,'').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g,'').replace(/\{\{[^{}]*\}\}/g,'').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g,'$1').replace(/'''?/g,'');return t.replace(/\s+/g,' ');}
