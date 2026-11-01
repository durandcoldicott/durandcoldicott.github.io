/*
 * Offline support for Panana. Serves the app from cache first, then refreshes
 * the cache in the background, so updates appear on the next launch.
 * Bump VERSION when the file list changes.
 */
var VERSION = "panana-v11";
var FILES = [
	"./",
	"index.html",
	"app.css",
	"app.js",
	"deck.js",
	"manifest.webmanifest",
	"icons/icon.svg",
	"icons/icon-192.png",
	"icons/apple-touch-icon.png",
];

self.addEventListener("install", function (e) {
	e.waitUntil(
		caches.open(VERSION).then(function (c) {
			return Promise.all(FILES.map(function (f) {
				return fetch(f, { credentials: "same-origin" }).then(function (res) {
					if (res.ok && !res.redirected) return c.put(f, res);
				}).catch(function () {});
			}));
		}).then(function () { return self.skipWaiting(); })
	);
});

self.addEventListener("activate", function (e) {
	e.waitUntil(
		caches.keys().then(function (keys) {
			return Promise.all(keys.filter(function (k) { return k.indexOf("panana-") === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
		}).then(function () { return self.clients.claim(); })
	);
});

self.addEventListener("fetch", function (e) {
	var req = e.request;
	var url = new URL(req.url);
	if (req.method !== "GET" || url.origin !== self.location.origin) return;
	// Never cache the API (sign-in state, progress, leaderboard) or the login page.
	if (url.pathname.indexOf("/api/") === 0 || url.pathname.indexOf("/panana/login") === 0) return;
	e.respondWith(
		caches.open(VERSION).then(function (cache) {
			return cache.match(req, { ignoreSearch: true }).then(function (hit) {
				var fresh = fetch(req).then(function (res) {
					// a redirect means "not signed in" — don't cache the login page as the app
					if (res && res.ok && !res.redirected) cache.put(req, res.clone());
					return res;
				}).catch(function () { return hit; });
				return hit || fresh;
			});
		})
	);
});

// Practice reminders (sent by the Worker every 15 minutes when due)
self.addEventListener("push", function (e) {
	var d = {};
	try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : "" }; }
	e.waitUntil(self.registration.showNotification(d.title || "Panana 🍌", {
		body: d.body || "",
		icon: "icons/icon-192.png",
		badge: "icons/icon-192.png",
		tag: d.tag || "panana",
		data: { url: d.url || "./" },
	}));
});

self.addEventListener("notificationclick", function (e) {
	e.notification.close();
	var url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
	e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
		for (var i = 0; i < list.length; i++) {
			if (list[i].url.indexOf(self.registration.scope) === 0 && "focus" in list[i]) return list[i].focus();
		}
		return self.clients.openWindow(url);
	}));
});
