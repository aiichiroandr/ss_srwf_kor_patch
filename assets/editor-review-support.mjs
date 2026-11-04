import {localEditorReview} from './editor-local-config.mjs';
import * as publicGlyphs from './editor-glyphs.mjs?v=20261105-part2';
import {createPreviewResources} from './editor-preview-resources.mjs?v=20261105-part2';

// Accepted releases remain usable when the optional local review workspace is
// absent. Its path is fixed here, never supplied by a URL or user input.
const publicSupport = Object.freeze({
  rows:Object.freeze([]), isCompatible:()=>false, isReviewRow:()=>false,
  isTarget:()=>false, glyphTools:()=>publicGlyphs, runtimeManifest:()=>null,
  releaseForTarget:()=>null, workerUrls:Object.freeze([]), createPreviewResources,
});
let support=publicSupport;
if(localEditorReview===true){
  const reviewPath='../editor-review/editor-support.mjs';
  support=(await import(new URL(reviewPath,import.meta.url).href)).editorReviewSupport;
}
export const editorReviewSupport=support;
