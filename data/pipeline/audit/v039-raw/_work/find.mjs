import {UA} from './lib.mjs';
for(const q of process.argv.slice(3)){const r=await fetch(`https://${process.argv[2]}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=4&format=json&formatversion=2`,{headers:UA});const j=await r.json();console.log(q,'=>',(j.query?.search||[]).map(s=>s.title).join(' | '));}
