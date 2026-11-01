/*
 * Backend for /panana (Panana, the te reo Māori study app): accounts, login sessions,
 * per-user progress sync and the group leaderboard.
 *
 * Storage: Cloudflare KV. Uses a REO_KV binding if one exists, otherwise the
 * site's existing RATE_LIMIT_KV namespace, with every key under "reo:".
 *
 *   reo:user:<username>      { username, name, salt, hash, iter, created }  + metadata { n, c }
 *   reo:sess:<token>         { u, n }                      (expires after 90 days)
 *   reo:progress:<username>  { state, savedAt }  + metadata = leaderboard summary
 *   reo:fail:<ip>            failed login / invite attempts (expires after 15 min)
 *   reo:config               { invite, closed, max } — admin overrides set from the app
 *
 * Configuration (set as *Secrets* in the Cloudflare dashboard so a
 * `wrangler deploy` doesn't wipe them):
 *   REO_INVITE_CODE  the starting invite code (an admin can replace it from the
 *                    app, which then takes precedence)
 *   REO_ADMINS       comma-separated usernames who can see the invite code and
 *                    reset members' passwords
 */

const P = "reo:";
const COOKIE = "reo_session";
const SESSION_TTL = 60 * 60 * 24 * 90;
const PBKDF2_ITER = 100000; // the Workers runtime maximum
const MAX_FAILS = 10;
const MAX_STATE_BYTES = 600000;
const DEFAULT_MAX_MEMBERS = 25;

// Served at the old /reo/sw.js (see handlePanana).
const RETIRE_OLD_SW = `
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
	e.waitUntil(
		caches.keys()
			.then(function (keys) { return Promise.all(keys.filter(function (k) { return k.indexOf("reo-") === 0; }).map(function (k) { return caches.delete(k); })); })
			.then(function () { return self.registration.unregister(); })
			.then(function () { return self.clients.matchAll({ type: "window" }); })
			.then(function (clients) { clients.forEach(function (c) { c.navigate("/panana/"); }); })
	);
});
`;

// Files under /panana/ that load without signing in (the login page and its assets).
const PUBLIC_PAGES = new Set([
	"/panana/login",
	"/panana/login.html",
	"/panana/login.js",
	"/panana/app.css",
	"/panana/manifest.webmanifest",
	"/panana/sw.js",
]);

function kvOf(env) {
	return env.REO_KV || env.RATE_LIMIT_KV;
}

async function getConfig(kv) {
	return (await kv.get(P + "config", "json")) || {};
}

function inviteCode(env, config) {
	return (config.invite || env.REO_INVITE_CODE || "").trim();
}

function maxMembers(config) {
	return config.max || DEFAULT_MAX_MEMBERS;
}

// Always write users through here: KV drops metadata on any put without it.
async function putUser(kv, user) {
	await kv.put(P + "user:" + user.username, JSON.stringify(user), { metadata: { n: user.name, c: user.created } });
}

async function listAll(kv, prefix) {
	const keys = [];
	let cursor;
	do {
		const page = await kv.list({ prefix, cursor });
		keys.push(...page.keys);
		cursor = page.list_complete ? null : page.cursor;
	} while (cursor);
	return keys;
}

function json(body, status = 200, headers = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
	});
}

function getCookie(request, name) {
	const header = request.headers.get("Cookie") || "";
	for (const part of header.split(/;\s*/)) {
		const i = part.indexOf("=");
		if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
	}
	return null;
}

function sessionCookie(token, maxAge) {
	return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function hex(bytes) {
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function b64(bytes) {
	let s = "";
	bytes.forEach((b) => (s += String.fromCharCode(b)));
	return btoa(s);
}
function unb64(str) {
	return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}
function safeEqual(a, b) {
	if (typeof a !== "string" || typeof b !== "string") return false;
	let diff = a.length ^ b.length;
	for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
	return diff === 0;
}

async function hashPassword(password, saltB64, iter = PBKDF2_ITER) {
	const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
	const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256);
	return { salt: b64(salt), hash: b64(new Uint8Array(bits)), iter };
}

async function verifyPassword(user, password) {
	const h = await hashPassword(password, user.salt, user.iter || PBKDF2_ITER);
	return safeEqual(h.hash, user.hash);
}

function isAdmin(env, username) {
	return (env.REO_ADMINS || "")
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean)
		.includes(username);
}

function clientIp(request) {
	return request.headers.get("CF-Connecting-IP") || "unknown";
}

async function tooManyFails(kv, request) {
	const n = parseInt((await kv.get(P + "fail:" + clientIp(request))) || "0", 10);
	return n >= MAX_FAILS;
}
async function recordFail(kv, request) {
	const key = P + "fail:" + clientIp(request);
	const n = parseInt((await kv.get(key)) || "0", 10);
	await kv.put(key, String(n + 1), { expirationTtl: 900 });
}

async function getSession(request, env) {
	const token = getCookie(request, COOKIE);
	if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
	const kv = kvOf(env);
	const s = await kv.get(P + "sess:" + token, "json");
	if (!s) return null;
	if (!(await kv.get(P + "user:" + s.u))) {
		await kv.delete(P + "sess:" + token); // member was removed
		return null;
	}
	return { ...s, token };
}

async function createSession(kv, user) {
	const token = hex(crypto.getRandomValues(new Uint8Array(32)));
	await kv.put(P + "sess:" + token, JSON.stringify({ u: user.username, n: user.name }), { expirationTtl: SESSION_TTL });
	return token;
}

async function readBody(request) {
	const type = request.headers.get("Content-Type") || "";
	if (!type.includes("application/json")) return null; // also blocks cross-site form posts
	const text = await request.text();
	if (text.length > MAX_STATE_BYTES) return null;
	try {
		return JSON.parse(text);
	} catch (e) {
		return null;
	}
}

const USERNAME_RE = /^[a-z0-9_-]{3,20}$/;

function cleanName(s) {
	return typeof s === "string" ? s.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 30) : "";
}

// Leaderboard summary stored as KV metadata (must stay under 1024 bytes).
function cleanSummary(s) {
	s = s && typeof s === "object" ? s : {};
	const num = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1e9, Math.round(v))) : 0);
	const date = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
	return {
		xp: num(s.xp),
		wk: date(s.wk),
		wx: num(s.wx),
		px: num(s.px),
		st: num(s.st),
		lm: date(s.lm),
		lr: num(s.lr),
		la: date(s.la),
		h: !!s.h,
	};
}

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

async function register(request, env) {
	const kv = kvOf(env);
	const config = await getConfig(kv);
	const code = inviteCode(env, config);
	if (!code || config.closed) return json({ error: "Sign-ups are closed right now. Ask the group organiser." }, 403);
	if (await tooManyFails(kv, request)) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
	const body = await readBody(request);
	if (!body) return json({ error: "Invalid request." }, 400);

	const username = String(body.username || "").trim().toLowerCase();
	const name = cleanName(body.name) || username;
	const password = String(body.password || "");
	if (!safeEqual(String(body.invite || "").trim(), code)) {
		await recordFail(kv, request);
		return json({ error: "That invite code isn't right." }, 403);
	}
	if (!USERNAME_RE.test(username)) return json({ error: "Username: 3–20 lowercase letters, numbers, - or _." }, 400);
	if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
	if (await kv.get(P + "user:" + username)) return json({ error: "That username is taken." }, 409);
	if ((await listAll(kv, P + "user:")).length >= maxMembers(config)) {
		return json({ error: "The group is full. Ask the group organiser." }, 403);
	}

	const h = await hashPassword(password);
	const user = { username, name, ...h, created: new Date().toISOString() };
	await putUser(kv, user);
	const token = await createSession(kv, user);
	return json({ username, name, admin: isAdmin(env, username) }, 200, { "Set-Cookie": sessionCookie(token, SESSION_TTL) });
}

async function login(request, env) {
	const kv = kvOf(env);
	if (await tooManyFails(kv, request)) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
	const body = await readBody(request);
	if (!body) return json({ error: "Invalid request." }, 400);
	const username = String(body.username || "").trim().toLowerCase();
	const password = String(body.password || "");
	const user = USERNAME_RE.test(username) ? await kv.get(P + "user:" + username, "json") : null;
	const ok = user ? await verifyPassword(user, password) : (await hashPassword(password), false);
	if (!ok) {
		await recordFail(kv, request);
		return json({ error: "Wrong username or password." }, 403);
	}
	const token = await createSession(kv, user);
	return json({ username: user.username, name: user.name, admin: isAdmin(env, user.username) }, 200, {
		"Set-Cookie": sessionCookie(token, SESSION_TTL),
	});
}

async function logout(request, env, session) {
	await kvOf(env).delete(P + "sess:" + session.token);
	return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
}

async function me(env, session) {
	const out = { username: session.u, name: session.n, admin: isAdmin(env, session.u) };
	if (out.admin) out.invite = inviteCode(env, await getConfig(kvOf(env)));
	return json(out);
}

async function getProgress(env, session) {
	const v = await kvOf(env).get(P + "progress:" + session.u, "json");
	return json(v || { state: null, savedAt: 0 });
}

async function putProgress(request, env, session) {
	const kv = kvOf(env);
	const body = await readBody(request);
	if (!body || !body.state || typeof body.state !== "object" || typeof body.state.cards !== "object" || typeof body.state.days !== "object") {
		return json({ error: "Invalid progress data." }, 400);
	}
	const key = P + "progress:" + session.u;
	const current = await kv.get(key, "json");
	// Another device saved since this one last synced: hand back the newer copy to merge.
	if (current && Number(body.base || 0) < current.savedAt) {
		return json({ error: "conflict", state: current.state, savedAt: current.savedAt }, 409);
	}
	const savedAt = Math.max(Date.now(), current ? current.savedAt + 1 : 0);
	const metadata = { u: session.u, n: session.n, ...cleanSummary(body.summary) };
	await kv.put(key, JSON.stringify({ state: body.state, savedAt }), { metadata });
	return json({ ok: true, savedAt });
}

async function leaderboard(env) {
	const keys = await listAll(kvOf(env), P + "progress:");
	return json({ members: keys.map((k) => k.metadata).filter((m) => m && !m.h) });
}

async function changePassword(request, env, session) {
	const kv = kvOf(env);
	if (await tooManyFails(kv, request)) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
	const body = await readBody(request);
	if (!body) return json({ error: "Invalid request." }, 400);
	const user = await kv.get(P + "user:" + session.u, "json");
	if (!user || !(await verifyPassword(user, String(body.current || "")))) {
		await recordFail(kv, request);
		return json({ error: "Your current password isn't right." }, 403);
	}
	const next = String(body.next || "");
	if (next.length < 8) return json({ error: "New password must be at least 8 characters." }, 400);
	Object.assign(user, await hashPassword(next));
	await putUser(kv, user);
	return json({ ok: true });
}

async function adminReset(request, env, session) {
	if (!isAdmin(env, session.u)) return json({ error: "Admins only." }, 403);
	const kv = kvOf(env);
	const body = await readBody(request);
	if (!body) return json({ error: "Invalid request." }, 400);
	const username = String(body.username || "").trim().toLowerCase();
	const password = String(body.password || "");
	const user = USERNAME_RE.test(username) ? await kv.get(P + "user:" + username, "json") : null;
	if (!user) return json({ error: "No member with that username." }, 404);
	if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
	Object.assign(user, await hashPassword(password));
	await putUser(kv, user);
	return json({ ok: true });
}

// Everyone who has signed up, including people hidden from the leaderboard
// and people who haven't finished a lesson yet.
async function adminMembers(env, session) {
	if (!isAdmin(env, session.u)) return json({ error: "Admins only." }, 403);
	const kv = kvOf(env);
	const [users, progress, config] = await Promise.all([listAll(kv, P + "user:"), listAll(kv, P + "progress:"), getConfig(kv)]);
	const stats = {};
	progress.forEach((k) => { if (k.metadata) stats[k.metadata.u] = k.metadata; });
	const members = await Promise.all(users.map(async (k) => {
		const username = k.name.slice((P + "user:").length);
		let meta = k.metadata;
		if (!meta) {
			// accounts created before metadata existed
			const u = await kv.get(k.name, "json");
			meta = u ? { n: u.name, c: u.created } : {};
		}
		const p = stats[username] || {};
		return {
			username,
			name: meta.n || username,
			joined: meta.c || "",
			admin: isAdmin(env, username),
			lastActive: p.la || p.lm || "",
			lastMet: p.lm || "",
			streak: p.st || 0,
			xp: p.xp || 0,
			words: p.lr || 0,
			hidden: !!p.h,
		};
	}));
	members.sort((a, b) => (b.joined || "").localeCompare(a.joined || ""));
	return json({
		members,
		config: { invite: inviteCode(env, config), closed: !!config.closed, max: maxMembers(config) },
	});
}

// Delete a member's account and progress. Their open sessions stop working
// immediately because getSession() checks the account still exists.
async function adminRemove(request, env, session) {
	if (!isAdmin(env, session.u)) return json({ error: "Admins only." }, 403);
	const body = await readBody(request);
	const username = String((body && body.username) || "").trim().toLowerCase();
	if (!USERNAME_RE.test(username)) return json({ error: "Invalid username." }, 400);
	if (username === session.u || isAdmin(env, username)) return json({ error: "Admins can't be removed here." }, 400);
	const kv = kvOf(env);
	if (!(await kv.get(P + "user:" + username))) return json({ error: "No member with that username." }, 404);
	await Promise.all([kv.delete(P + "user:" + username), kv.delete(P + "progress:" + username)]);
	return json({ ok: true });
}

const INVITE_WORDS = ["kia-kaha", "kia-ora", "ka-pai", "ka-rawe", "tino-pai", "haere-mai", "kia-maia", "nau-mai"];

async function adminConfig(request, env, session) {
	if (!isAdmin(env, session.u)) return json({ error: "Admins only." }, 403);
	const body = await readBody(request);
	if (!body) return json({ error: "Invalid request." }, 400);
	const kv = kvOf(env);
	const config = await getConfig(kv);
	if (typeof body.closed === "boolean") config.closed = body.closed;
	if (body.max !== undefined) {
		const max = Math.round(Number(body.max));
		if (!(max >= 2 && max <= 200)) return json({ error: "Member limit must be between 2 and 200." }, 400);
		config.max = max;
	}
	if (body.newInvite) {
		const n = crypto.getRandomValues(new Uint32Array(1))[0];
		config.invite = INVITE_WORDS[n % INVITE_WORDS.length] + "-" + String(1000 + (n % 9000));
	}
	await kv.put(P + "config", JSON.stringify(config));
	return json({ config: { invite: inviteCode(env, config), closed: !!config.closed, max: maxMembers(config) } });
}

async function handleApi(request, env, path) {
	const m = request.method;
	if (m === "POST" && path === "register") return register(request, env);
	if (m === "POST" && path === "login") return login(request, env);

	const session = await getSession(request, env);
	if (!session) return json({ error: "Not signed in." }, 401);

	if (m === "GET" && path === "me") return me(env, session);
	if (m === "POST" && path === "logout") return logout(request, env, session);
	if (m === "GET" && path === "progress") return getProgress(env, session);
	if (m === "PUT" && path === "progress") return putProgress(request, env, session);
	if (m === "GET" && path === "leaderboard") return leaderboard(env);
	if (m === "POST" && path === "password") return changePassword(request, env, session);
	if (m === "POST" && path === "admin/reset") return adminReset(request, env, session);
	if (m === "GET" && path === "admin/members") return adminMembers(env, session);
	if (m === "POST" && path === "admin/remove") return adminRemove(request, env, session);
	if (m === "POST" && path === "admin/config") return adminConfig(request, env, session);
	return json({ error: "Not found." }, 404);
}

// ---------------------------------------------------------------------------
// Entry point: returns a Response for /reo and /api/reo requests, else null.
// /panana/* only reaches the Worker because wrangler.toml lists it under
// assets.run_worker_first — otherwise static files would bypass this check.
// ---------------------------------------------------------------------------
export async function handlePanana(request, env, url) {
	const path = url.pathname;

	if (path.startsWith("/api/reo/")) {
		if (!kvOf(env)) return json({ error: "Storage isn't configured." }, 503);
		return handleApi(request, env, path.slice("/api/reo/".length));
	}

	// The app used to live at /reo. Old installs have a service worker there
	// serving a cached copy, so /reo/sw.js becomes a clean-up worker that
	// clears that cache, unregisters itself and moves the app to /panana/.
	if (path === "/reo/sw.js") {
		return new Response(RETIRE_OLD_SW, { headers: { "Content-Type": "text/javascript", "Cache-Control": "no-store" } });
	}
	if (path === "/reo" || path.startsWith("/reo/")) {
		return new Response(null, { status: 301, headers: { Location: "/panana" + path.slice(4) + url.search } });
	}

	if (path === "/panana" || path.startsWith("/panana/")) {
		if (PUBLIC_PAGES.has(path) || path.startsWith("/panana/icons/")) return env.ASSETS.fetch(request);
		const session = kvOf(env) ? await getSession(request, env) : null;
		if (session) return env.ASSETS.fetch(request);
		const accept = request.headers.get("Accept") || "";
		if (request.method === "GET" && accept.includes("text/html")) {
			return new Response(null, { status: 302, headers: { Location: "/panana/login", "Cache-Control": "no-store" } });
		}
		return new Response("Not signed in", { status: 401, headers: { "Cache-Control": "no-store" } });
	}

	return null;
}
