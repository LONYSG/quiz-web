import fs from 'node:fs';import {page} from './lib.mjs';
const [l,t]=process.argv.slice(2);const f=`_cache/${l}-${t.replace(/\s/g,'_')}.html`;fs.writeFileSync(f,await page(l,t));console.log(f,fs.statSync(f).size);
