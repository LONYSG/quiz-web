import fs from 'fs';
export function strip(t){
 t=t.replace(/<ref[^>]*\/>/g,'').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g,'').replace(/<!--[\s\S]*?-->/g,'');
 for(let i=0;i<4;i++) t=t.replace(/\{\{(?:transliteration|transl|lang|langx|Lang)\|[^|{}]*\|(?:[^|{}]*\|)?([^|{}=]*)\}\}/g,'$1');
 t=t.replace(/\{\{ndash\}\}/g,'–').replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g,'$1').replace(/\[\[|\]\]/g,'').replace(/'{2,}/g,'');
 return t;
}
