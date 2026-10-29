const CACHE_NAME = "smile-call-v10";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// 安裝並快取靜態檔案
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn("部分快取檔案失敗（通常為外部圖片）:", err);
      });
    })
  );
  self.skipWaiting();
});

// 啟動並清理舊快取
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 優先使用快取，無快取則走網路 (Cache First with Network Fallback)
self.addEventListener("fetch", (event) => {
  // Jitsi、信號傳遞與 Webhook 相關即時請求直接走網路
  if (
    event.request.url.includes("meet.jit.si") ||
    event.request.url.includes("jitsi.riot.im") ||
    event.request.url.includes("ntfy.sh") ||
    event.request.url.includes("discord.com") ||
    event.request.url.includes("api.telegram.org")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        return networkResponse;
      });
    })
  );
});
