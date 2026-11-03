// Retirement worker for the ended WEB PORT trial (2026-11-03).
// Browsers that registered the old header-only isolation worker fetch this
// script on their next visit. It replaces the old worker, intercepts nothing,
// and removes its own registration so web-port/ is served normally again.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.registration.unregister());
});
