// Search display text only. Matching never grants animation/write admission.
const compact=value=>value.normalize('NFKC').toLowerCase().replace(/[\s\-－・·]+/gu,'');
export function matchesBattleLibrarySearch({id,text},query){
 const value=String(query??'').normalize('NFKC').trim();
 if(!value)return true;
 // A record number selects exactly that record, rather than matching its
 // digits inside unrelated names or longer record numbers.
 if(/^#?\d+$/u.test(value))return Number(value.replace(/^#/,''))===Number(id);
 const label=compact(String(text??''));
 return value.split(/\s+/u).every(term=>label.includes(compact(term)));
}
