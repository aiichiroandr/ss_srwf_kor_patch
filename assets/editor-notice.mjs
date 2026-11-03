// Shared by both local editors. Only the acknowledgement preference is retained.
const KEY = 'srwf-editor-notice-v1';
let pending = null;

export function requestEditorNotice() {
  try { if (globalThis.localStorage?.getItem(KEY) === 'acknowledged') return Promise.resolve(true); } catch {}
  if (pending) return pending;
  let dialog;
  pending = new Promise(resolve => {
    dialog = document.createElement('dialog');
    dialog.className = 'editor-notice';
    dialog.setAttribute('aria-labelledby', 'editorNoticeTitle');
    dialog.setAttribute('aria-describedby', 'editorNoticeText');
    const title = document.createElement('h2');
    title.id = 'editorNoticeTitle'; title.textContent = '에딧 전 안내';
    const text = document.createElement('p');
    text.id = 'editorNoticeText';
    text.textContent = '에딧하면 게임 밸런스가 달라집니다. 모든 변경 조합의 정상 진행이 검증된 것은 아닙니다.';
    const label = document.createElement('label');
    const remember = document.createElement('input');
    remember.type = 'checkbox'; remember.checked = true;
    label.append(remember, '다시 보지 않기');
    const actions = document.createElement('div'); actions.className = 'editor-notice-actions';
    const cancel = document.createElement('button'), accept = document.createElement('button');
    cancel.type = accept.type = 'button'; cancel.textContent = '취소'; accept.textContent = '확인';
    accept.className = 'is-primary';
    const finish = agreed => {
      if (agreed && remember.checked) {
        try { globalThis.localStorage?.setItem(KEY, 'acknowledged'); } catch {}
      }
      dialog.close(); dialog.remove(); pending = null; resolve(agreed);
    };
    cancel.addEventListener('click', () => finish(false));
    accept.addEventListener('click', () => finish(true));
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    actions.append(cancel, accept); dialog.append(title, text, label, actions);
    document.body.append(dialog); dialog.showModal(); accept.focus();
  }).catch(error => {
    // Failed dialog setup must not pin future entries to a rejected request.
    // Preserve the error and allow the next entry to retry.
    try { dialog?.remove(); } catch {}
    pending = null;
    throw error;
  });
  return pending;
}
