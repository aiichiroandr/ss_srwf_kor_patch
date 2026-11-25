// Keep rel=noopener. A tab-local identifier and same-origin channel only tell
// the notice whether the originating patcher is still open; no draft is sent.
const bus = typeof BroadcastChannel === 'function' ? new BroadcastChannel('srwf-patcher-notice-return') : null;
const ordinaryClick = event => event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
const link = document.getElementById('noticeReturnToPatcher');

if (!link && bus) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(12)), digit => digit.toString(16).padStart(2, '0')).join('');
  bus.addEventListener('message', ({ data }) => {
    if (data?.kind === 'notice-check' && data.token === token) bus.postMessage({ kind: 'patcher-present', token });
  });
  document.addEventListener('click', event => {
    const entryLink = event.target.closest?.('#siteNoticesLink,#patchNotesTimelineLink');
    if (!entryLink) return;
    const url = new URL(entryLink.href);
    if (url.origin !== location.origin) return;
    url.searchParams.set('patcher-tab', token);
    entryLink.href = url.href;
  }, true);
}
if (link && bus) {
  const token = new URL(window.location.href).searchParams.get('patcher-tab');
  if (/^[a-f0-9]{24}$/.test(token ?? '')) {
    let parentPresent = false;
    bus.addEventListener('message', ({ data }) => {
      if (data?.kind === 'patcher-present' && data.token === token) parentPresent = true;
    });
    bus.postMessage({ kind: 'notice-check', token });
    // Chromium allows an isolated content-opened tab to close with one
    // history entry. Date jumps keep that entry without changing the visible URL.
    for (const dateLink of document.querySelectorAll('a[href^="#day-"]')) {
      dateLink.addEventListener('click', event => {
        if (!parentPresent || !ordinaryClick(event)) return;
        event.preventDefault();
        window.location.replace(dateLink.href);
      });
    }
    link.addEventListener('click', event => {
      if (!parentPresent || !ordinaryClick(event)) return;
      event.preventDefault();
      window.close();
      setTimeout(() => window.location.assign(link.href), 200);
    });
  }
}
