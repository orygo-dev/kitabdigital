const SHELL = "kitab-shell-v1",
  META = "kitab-metadata-v1",
  BOOKS = "kitab-downloads-v1";
const PRECACHE = [];
async function cacheBranding(settings) {
  const cache = await caches.open(META);
  await Promise.all(
    ["logo", "splash_logo", "splash_background"].map(async (key) => {
      if (!settings[key]) return;
      const url = "/api/files/" + settings[key];
      if (await cache.match(url)) return;
      try {
        const response = await fetch(url, { credentials: "omit" });
        if (response.ok) await cache.put(url, response);
      } catch {
        /* A previously saved logo remains available offline. */
      }
    }),
  );
}
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) =>
        c.addAll([
          "/",
          "/icon.svg",
          "/icon-192.png",
          "/icon-512.png",
          ...PRECACHE,
        ]),
      )
      .then(async () => {
        try {
          const response = await fetch("/api/settings");
          if (response.ok) {
            await (
              await caches.open(META)
            ).put("/api/settings", response.clone());
            await cacheBranding(await response.json());
          }
        } catch {
          /* Branding must not prevent installation. */
        }
        await self.skipWaiting();
      }),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("kitab-shell-") && k !== SHELL)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const req = event.request,
    url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith("/api/admin") ||
    url.pathname.startsWith("/api/auth")
  )
    return;
  if (url.pathname.startsWith("/api/files/books/") && !url.search) {
    event.respondWith(
      caches.open(BOOKS).then(async (c) => (await c.match(req)) || fetch(req)),
    );
    return;
  }
  if (url.pathname === "/api/settings") {
    let branding;
    const response = fetch(req)
      .then(async (res) => {
        if (res.ok) {
          branding = cacheBranding(await res.clone().json()).catch(() => {});
          try {
            await (await caches.open(META)).put(req, res.clone());
          } catch {}
        }
        return res;
      })
      .catch(() => caches.match(req));
    event.respondWith(response);
    event.waitUntil(response.then(() => branding).catch(() => {}));
    return;
  }
  if (url.pathname.startsWith("/api/files/images/")) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(async (r) => {
          if (r.ok) {
            try {
              await (await caches.open(SHELL)).put("/", r.clone());
            } catch {}
          }
          return r;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }
  if (url.pathname.startsWith("/assets/") || url.pathname === "/icon.svg") {
    event.respondWith(
      caches.open(SHELL).then(async (c) => {
        const cached = await c.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) {
          try {
            await c.put(req, res.clone());
          } catch {}
        }
        return res;
      }),
    );
    return;
  }
  if (
    url.pathname.startsWith("/api/public/") ||
    url.pathname === "/api/settings" ||
    url.pathname === "/api/manifest.webmanifest"
  ) {
    event.respondWith(
      fetch(req)
        .then(async (res) => {
          if (res.ok) {
            try {
              await (await caches.open(META)).put(req, res.clone());
            } catch {}
          }
          return res;
        })
        .catch(() => caches.match(req)),
    );
  }
});
