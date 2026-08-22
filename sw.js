// DesiMall customer v0.31.1
// Tracking page uses inline assets to avoid stale cache during testing.
self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
