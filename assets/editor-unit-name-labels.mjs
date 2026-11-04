// Exact mixed-language source labels only. Do not infer a name from a graphic
// index or overwrite user-authored names. Display metadata never patches ROM.
export function localizeUnitNameFields(fields) {
 if(fields.nameStatus!=='decoded'||fields.name.replace(/[\s\u3000]/gu,'')!=='マグマ수ガルムス')return fields;
 return {...fields,name:'마그마수 가르무스',nameStatus:'localized-source',sourceName:fields.name};
}
