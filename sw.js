"use strict";

const root = self.registration.scope;
const prefix = "stromverbrauch:" + root + ":";
const cacheName = prefix + "1";
const index = new URL("index.html", root).href;
const shell = [
  "./", "./index.html", "./styles.css", "./modell.js", "./speicher.js", "./app.js",
  "./manifest.webmanifest", "./icons/icon-180.png", "./icons/icon-192.png", "./icons/icon-512.png",
].map(path => new URL(path, root).href);

self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(prefix) && key !== cacheName).map(key => caches.delete(key)),
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  url.search = "";
  if (!shell.includes(url.href)) return;
  const path = event.request.mode === "navigate" ? index : url.href;
  event.respondWith(caches.open(cacheName).then(cache => cache.match(path))
    .then(response => response ?? fetch(event.request)));
});
