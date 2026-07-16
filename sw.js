/*
 * 旧PWAキャッシュ停止用 Service Worker
 *
 * 以前の weather-extreme-shell-v2 は index.html / style.css / app.js を
 * cache-first で返すため、UI更新後も古いJavaScriptが残ることがありました。
 * 現行版ではオフラインキャッシュを使用せず、既存登録と専用キャッシュを破棄します。
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith("weather-extreme-"))
        .map((name) => caches.delete(name))
    );

    await self.registration.unregister();
    await self.clients.claim();
  })());
});
