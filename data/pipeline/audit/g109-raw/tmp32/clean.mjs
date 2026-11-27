import fs from 'fs';
export function clean(x){
 x=x.replace(/<ref[^>]*\/>/g,'').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g,'');
 for(let i=0;i<4;i++)x=x.replace(/\{\{[^{}]*\}\}/g,'');
 x=x.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g,'$1').replace(/'''?/g,'').replace(/<[^>]+>/g,'');
 return x;
}
if(process.argv[2]){const x=clean(fs.readFileSync(process.argv[2],'utf8'));fs.writeFileSync(process.argv[2].replace('.txt','.clean'),x);}
