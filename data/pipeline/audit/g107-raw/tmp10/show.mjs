import {readFileSync} from 'node:fs';
const [f,...kw]=process.argv.slice(2);
let s=readFileSync(f,'utf8');
s=s.replace(/<ref[^>]*\/>/g,'').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g,'').replace(/\{\{[^{}]*\}\}/g,'').replace(/\{\{[^{}]*\}\}/g,'').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g,'$1').replace(/'''?/g,'');
const sents=s.split(/\n+|(?<=[.!?다])\s+/).filter(x=>x.length>30&&!/^[|*=]/.test(x));
const re=new RegExp(kw.join('|'),'i');
let n=0;for(const x of sents){if(re.test(x)){console.log('- '+x.slice(0,420));if(++n>=14)break;}}
