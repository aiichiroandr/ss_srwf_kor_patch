import { SCENARIO_CHAPTER_BINDINGS } from './editor-scenario-chapter-data.mjs?v=20261113-froster1';
import { decodeEditorText } from './editor-text-codec.mjs?v=20261113-froster1';
export function saveHeroName(row,field='heroName',{glyphMap=row.glyphMap}={}){
  const bytes=row[field+'Bytes']??[];
  if(!bytes.length)return '이름 미기록';
  const text=decodeEditorText(bytes,{gameId:row.gameId,kind:'save',faceId:row.heroFaceIds?.[field==='partnerName'?302:303],glyphMap});
  return text===null?'이름 해독 불가':text||'이름 미기록';
}
export function saveDateLabel(minutes){
  if(!Number.isInteger(minutes)||minutes<=0)return '저장 일시 미기록';
  const date=new Date(Date.UTC(1980,0,1)+minutes*60000);
  if(date.getUTCFullYear()>2107)return '저장 일시 확인 불가';
  return date.toISOString().slice(0,16).replace('T',' ');
}
export function saveSummary(row,titles=[],textOptions={}){
  const title=titles.find(t=>t.titleIndex===row.completedTitleIndex&&t.status==='decoded');
  const known=SCENARIO_CHAPTER_BINDINGS.filter(b=>b.gameId==='srwf-f'&&b.titleIndex===row.completedTitleIndex);
  const mismatch=row.completedEpisode!==null&&row.completedTitleIndex<100&&known.length&&!known.some(b=>b.episodes.includes(row.completedEpisode));
  return {progress:mismatch?`화수·제목 불일치 (저장값 ${row.completedEpisode}화)`:row.completedEpisode===null?'진행 정보 미확인':row.completedEpisode===0?'클리어 기록 없음':`제${row.completedEpisode}화 클리어`,
    title:title?.text?.trim()||'시나리오 제목 미확인',hero:saveHeroName(row,'heroName',textOptions),date:saveDateLabel(row.dateMinutes)};
}
