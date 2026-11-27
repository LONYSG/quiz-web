const fs=require('fs');let s=fs.readFileSync('build.mjs','utf8');
const bad=String.raw`hit.replace(/^(내용닫기||)s*/,'').trim()`;
const good=String.raw`hit.replace(/^(내용닫기|\|)\s*/,'').trim()`;
if(!s.includes(bad))throw new Error('nf');s=s.replace(bad,()=>good);fs.writeFileSync('build.mjs',s);
