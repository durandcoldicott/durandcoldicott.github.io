/*
 * Backend for /panana (Panana, the te reo Māori study app): accounts, login sessions,
 * per-user progress sync and the group leaderboard.
 *
 * Storage: Cloudflare KV. Uses Panana's own REO_KV namespace if it's bound,
 * otherwise the site's RATE_LIMIT_KV namespace, with every key under "reo:".
 * When REO_KV is first bound, the existing "reo:" data is copied across
 * automatically (see ensureStore) — the old copy is left in place.
 *
 *   reo:user:<username>      { username, name, salt, hash, iter, created }  + metadata { n, c }
 *   reo:sess:<token>         { u, n }                      (expires after 90 days)
 *   reo:progress:<username>  { state, savedAt }  + metadata = leaderboard summary
 *   reo:fail:<ip>            failed login / invite attempts (expires after 15 min)
 *   reo:config               { invite, closed, max } — admin overrides set from the app
 *   reo:vapid                push-notification signing keys (made on first use)
 *   reo:push:<username>      { subs: [push subscriptions], time, tz, streak, weekly, last… }
 *   reo:fb:<time>-<random>   feedback / corrections from members (+ metadata for the admin list)
 *   reo:group:<id>           { id, name, owner, code, closed, created, members: [usernames] }
 *                            + metadata { n, o, k } (name, owner, member count) for the admin list
 *   reo:gcode:<CODE>         the group id for a join code
 *   reo:ug:<username>        [group ids] the member belongs to
 *   reo:groupsinit           set once the original class has been moved into its own group
 *
 * Configuration (set as *Secrets* in the Cloudflare dashboard so a
 * `wrangler deploy` doesn't wipe them):
 *   REO_INVITE_CODE  the starting invite code (an admin can replace it from the
 *                    app, which then takes precedence)
 *   REO_ADMINS       comma-separated usernames who can see the invite code and
 *                    reset members' passwords
 *   TURNSTILE_SITE_KEY / TURNSTILE_SECRET  optional Cloudflare Turnstile bot
 *                    check on sign-up and login (off until both are set)
 */

const P = "reo:";
const COOKIE = "reo_session";
const SESSION_TTL = 60 * 60 * 24 * 90;
const PBKDF2_ITER = 100000; // the Workers runtime maximum
const MAX_FAILS = 10;
const MAX_STATE_BYTES = 600000;
const DEFAULT_MAX_MEMBERS = 25;
const GROUP_MAX_MEMBERS = 50; // people in one rōpū
const MAX_OWNED_GROUPS = 5;   // rōpū one person can create
const MAX_JOINED_GROUPS = 20; // rōpū one person can be in

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
	"/panana/install",
	"/panana/install.html",
	"/panana/install.js",
	"/panana/privacy",
	"/panana/privacy.html",
]);

function kvOf(env) {
	return env.REO_KV || env.RATE_LIMIT_KV;
}

// First time REO_KV is bound: copy every "reo:" key (with metadata and expiry)
// from the shared namespace, then mark it done. Safe to repeat.
let storeReady = null;
function ensureStore(env) {
	if (!env.REO_KV || !env.RATE_LIMIT_KV) return Promise.resolve();
	if (!storeReady) storeReady = migrateStore(env).catch((e) => { storeReady = null; throw e; });
	return storeReady;
}
async function migrateStore(env) {
	if (await env.REO_KV.get(P + "migrated")) return;
	const keys = await listAll(env.RATE_LIMIT_KV, P);
	const nowSec = Math.floor(Date.now() / 1000);
	for (const k of keys) {
		if (/^reo:(fail|failu|fbcount):/.test(k.name)) continue; // short-lived counters
		if (k.expiration && k.expiration < nowSec + 120) continue;
		if ((await env.REO_KV.get(k.name)) !== null) continue; // never overwrite newer data
		const value = await env.RATE_LIMIT_KV.get(k.name);
		if (value === null) continue;
		const opts = {};
		if (k.metadata) opts.metadata = k.metadata;
		if (k.expiration) opts.expiration = k.expiration;
		await env.REO_KV.put(k.name, value, opts);
	}
	await env.REO_KV.put(P + "migrated", new Date().toISOString());
}

// Security headers for every Panana page and file
const CSP = [
	"default-src 'self'",
	"script-src 'self' https://challenges.cloudflare.com",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data:",
	"connect-src 'self' https://challenges.cloudflare.com",
	"frame-src https://challenges.cloudflare.com",
	"worker-src 'self'",
	"manifest-src 'self'",
	"object-src 'none'",
	"base-uri 'none'",
	"form-action 'self'",
	"frame-ancestors 'none'",
].join("; ");
function secured(res) {
	const out = new Response(res.body, res);
	out.headers.set("Content-Security-Policy", CSP);
	out.headers.set("X-Content-Type-Options", "nosniff");
	out.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
	out.headers.set("X-Frame-Options", "DENY");
	out.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
	return out;
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
async function recordFail(kv, request, username) {
	const key = P + "fail:" + clientIp(request);
	const n = parseInt((await kv.get(key)) || "0", 10);
	await kv.put(key, String(n + 1), { expirationTtl: 900 });
	if (username) {
		const ukey = P + "failu:" + username;
		const m = parseInt((await kv.get(ukey)) || "0", 10);
		await kv.put(ukey, String(m + 1), { expirationTtl: 900 });
	}
}
async function accountLocked(kv, username) {
	return parseInt((await kv.get(P + "failu:" + username)) || "0", 10) >= MAX_FAILS;
}

// Optional Cloudflare Turnstile check (on only when both keys are set)
async function turnstileOk(env, request, token) {
	if (!env.TURNSTILE_SECRET || !env.TURNSTILE_SITE_KEY) return true;
	if (!token) return false;
	try {
		const form = new FormData();
		form.append("secret", env.TURNSTILE_SECRET);
		form.append("response", String(token));
		form.append("remoteip", clientIp(request));
		const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
		const data = await r.json();
		return !!data.success;
	} catch (e) {
		return false;
	}
}

async function getSession(request, env) {
	const token = getCookie(request, COOKIE);
	if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
	const kv = kvOf(env);
	const s = await kv.get(P + "sess:" + token, "json");
	if (!s) return null;
	const user = await kv.get(P + "user:" + s.u, "json");
	// removed member, or signed out everywhere (password change / reset)
	if (!user || (user.epoch || 0) !== (s.e || 0)) {
		await kv.delete(P + "sess:" + token);
		return null;
	}
	return { ...s, token };
}

async function createSession(kv, user) {
	const token = hex(crypto.getRandomValues(new Uint8Array(32)));
	await kv.put(P + "sess:" + token, JSON.stringify({ u: user.username, n: user.name, e: user.epoch || 0 }), { expirationTtl: SESSION_TTL });
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
		dk: date(s.dk),
		dr: num(s.dr),
		g: num(s.g),
		h: !!s.h,
	};
}

// ---------------------------------------------------------------------------
// Rōpū (groups): private leaderboards people make and share with a join code.
// ---------------------------------------------------------------------------
const CODE_WORDS = ["KAHA", "ORA", "PAI", "RAWE", "MAIA", "AROHA", "TAUTOKO", "MANA", "TIKA", "KOHA", "WAIRUA", "HARIKOA"];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I
function cleanCode(c) { return String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function cleanGroupName(s) { return String(s || "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40); }
async function newGroupCode(kv) {
	for (let i = 0; i < 10; i++) {
		const r = crypto.getRandomValues(new Uint8Array(5));
		const code = CODE_WORDS[r[0] % CODE_WORDS.length] + "-" + Array.from(r.slice(1), (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
		if (!(await kv.get(P + "gcode:" + cleanCode(code)))) return code;
	}
	throw new Error("couldn't make a unique code");
}
async function getGroup(kv, id) {
	return /^[a-z0-9]{1,24}$/.test(String(id || "")) ? kv.get(P + "group:" + id, "json") : null;
}
async function putGroup(kv, g) {
	await kv.put(P + "group:" + g.id, JSON.stringify(g), { metadata: { n: g.name, o: g.owner || "", k: g.members.length } });
}
async function groupByCode(kv, code) {
	const c = cleanCode(code);
	if (c.length < 6) return null;
	const id = await kv.get(P + "gcode:" + c);
	return id ? getGroup(kv, id) : null;
}
async function userGroups(kv, username) { return (await kv.get(P + "ug:" + username, "json")) || []; }
async function setUserGroups(kv, username, ids) {
	if (ids.length) await kv.put(P + "ug:" + username, JSON.stringify(ids));
	else await kv.delete(P + "ug:" + username);
}
async function addToGroup(kv, g, username) {
	if (!g.members.includes(username)) { g.members.push(username); await putGroup(kv, g); }
	const ids = await userGroups(kv, username);
	if (!ids.includes(g.id)) { ids.push(g.id); await setUserGroups(kv, username, ids); }
}
async function deleteGroup(kv, g) {
	await Promise.all(g.members.map(async (u) => setUserGroups(kv, u, (await userGroups(kv, u)).filter((x) => x !== g.id))));
	await Promise.all([kv.delete(P + "group:" + g.id), kv.delete(P + "gcode:" + cleanCode(g.code))]);
}
// Take someone out of a group. If they owned it, the longest-standing member
// takes over; an empty group is deleted.
async function removeFromGroup(kv, g, username) {
	g.members = g.members.filter((u) => u !== username);
	await setUserGroups(kv, username, (await userGroups(kv, username)).filter((x) => x !== g.id));
	if (!g.members.length) { await kv.delete(P + "group:" + g.id); await kv.delete(P + "gcode:" + cleanCode(g.code)); return; }
	if (g.owner === username) g.owner = g.members[0];
	await putGroup(kv, g);
}
async function removeFromAllGroups(kv, username) {
	for (const id of await userGroups(kv, username)) {
		const g = await getGroup(kv, id);
		if (g) await removeFromGroup(kv, g, username);
	}
	await kv.delete(P + "ug:" + username);
}
// Once: everyone who joined before groups existed goes into "Our class",
// owned by the first site admin. The site invite code then joins that group.
let groupsReady = false;
async function ensureGroups(env) {
	if (groupsReady) return;
	const kv = kvOf(env);
	if (await kv.get(P + "groupsinit")) { groupsReady = true; return; }
	const users = (await listAll(kv, P + "user:")).map((k) => k.name.slice((P + "user:").length));
	if (users.length) {
		const admins = String(env.REO_ADMINS || "").split(",").map((x) => x.trim().toLowerCase());
		const owner = admins.find((a) => users.includes(a)) || users[0];
		const members = [owner].concat(users.filter((u) => u !== owner));
		const g = { id: "class", name: "Our class", owner, code: await newGroupCode(kv), closed: false, created: new Date().toISOString(), members };
		await putGroup(kv, g);
		await kv.put(P + "gcode:" + cleanCode(g.code), g.id);
		for (const u of members) {
			const ids = await userGroups(kv, u);
			if (!ids.includes(g.id)) await setUserGroups(kv, u, ids.concat(g.id));
		}
	}
	await kv.put(P + "groupsinit", new Date().toISOString());
	groupsReady = true;
}
function groupView(g, username, env) {
	return { id: g.id, name: g.name, owner: g.owner === username, ownerName: g.owner, code: g.code, closed: !!g.closed, count: g.members.length,
		members: g.owner === username || isAdmin(env, username) ? g.members : undefined };
}

async function listGroups(env, session) {
	const kv = kvOf(env);
	const out = [];
	for (const id of await userGroups(kv, session.u)) {
		const g = await getGroup(kv, id);
		if (g && g.members.includes(session.u)) out.push(groupView(g, session.u, env));
	}
	return json({ groups: out, limits: { members: GROUP_MAX_MEMBERS, owned: MAX_OWNED_GROUPS, joined: MAX_JOINED_GROUPS } });
}

async function createGroup(request, env, session) {
	const kv = kvOf(env);
	const body = await readBody(request);
	const name = cleanGroupName(body && body.name);
	if (name.length < 2) return json({ error: "Give your rōpū a name (2–40 characters)." }, 400);
	const ids = await userGroups(kv, session.u);
	if (ids.length >= MAX_JOINED_GROUPS) return json({ error: "You're in " + MAX_JOINED_GROUPS + " rōpū already — leave one first." }, 400);
	let owned = 0;
	for (const id of ids) { const g = await getGroup(kv, id); if (g && g.owner === session.u) owned++; }
	if (owned >= MAX_OWNED_GROUPS) return json({ error: "You can run up to " + MAX_OWNED_GROUPS + " rōpū." }, 400);
	const g = { id: hex(crypto.getRandomValues(new Uint8Array(6))), name, owner: session.u, code: await newGroupCode(kv), closed: false,
		created: new Date().toISOString(), members: [] };
	await kv.put(P + "gcode:" + cleanCode(g.code), g.id);
	await addToGroup(kv, g, session.u);
	return json({ group: groupView(g, session.u, env) });
}

async function joinGroup(request, env, session) {
	const kv = kvOf(env);
	if (await tooManyFails(kv, request)) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
	const body = await readBody(request);
	const g = await groupByCode(kv, body && body.code);
	if (!g) { await recordFail(kv, request); return json({ error: "That rōpū code isn't right." }, 404); }
	if (g.members.includes(session.u)) return json({ group: groupView(g, session.u, env), already: true });
	if (g.closed) return json({ error: "“" + g.name + "” isn't taking new members right now." }, 403);
	if (g.members.length >= GROUP_MAX_MEMBERS) return json({ error: "“" + g.name + "” is full." }, 403);
	if ((await userGroups(kv, session.u)).length >= MAX_JOINED_GROUPS) return json({ error: "You're in " + MAX_JOINED_GROUPS + " rōpū already — leave one first." }, 400);
	await addToGroup(kv, g, session.u);
	return json({ group: groupView(g, session.u, env) });
}

// Owner (or site admin) actions on one group
async function manageGroup(request, env, session, action) {
	const kv = kvOf(env);
	const body = (await readBody(request)) || {};
	const g = await getGroup(kv, body.id);
	if (!g || !g.members.includes(session.u) && !isAdmin(env, session.u)) return json({ error: "Rōpū not found." }, 404);
	if (action === "leave") {
		if (!g.members.includes(session.u)) return json({ error: "You're not in that rōpū." }, 400);
		await removeFromGroup(kv, g, session.u);
		return json({ ok: true });
	}
	if (g.owner !== session.u && !isAdmin(env, session.u)) return json({ error: "Only the rōpū owner can do that." }, 403);
	if (action === "rename") {
		const name = cleanGroupName(body.name);
		if (name.length < 2) return json({ error: "Name must be 2–40 characters." }, 400);
		g.name = name;
	} else if (action === "newcode") {
		await kv.delete(P + "gcode:" + cleanCode(g.code));
		g.code = await newGroupCode(kv);
		await kv.put(P + "gcode:" + cleanCode(g.code), g.id);
	} else if (action === "close") {
		g.closed = !!body.closed;
	} else if (action === "remove") {
		const who = String(body.username || "").toLowerCase();
		if (who === g.owner) return json({ error: "The owner can't be removed — leave or delete the rōpū instead." }, 400);
		if (!g.members.includes(who)) return json({ error: "They're not in this rōpū." }, 404);
		await removeFromGroup(kv, g, who);
		return json({ group: groupView(g, session.u, env) });
	} else if (action === "delete") {
		if (body.confirm !== g.name) return json({ error: "Type the rōpū name to confirm." }, 400);
		await deleteGroup(kv, g);
		return json({ ok: true });
	} else return json({ error: "Unknown action." }, 400);
	await putGroup(kv, g);
	return json({ group: groupView(g, session.u, env) });
}

// Site admins: every rōpū, so abusive ones can be removed
async function adminGroups(env, session) {
	if (!isAdmin(env, session.u)) return json({ error: "Admins only." }, 403);
	const keys = await listAll(kvOf(env), P + "group:");
	return json({ groups: keys.map((k) => ({ id: k.name.slice((P + "group:").length), name: (k.metadata || {}).n || "", owner: (k.metadata || {}).o || "", count: (k.metadata || {}).k || 0 })) });
}

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

async function register(request, env) {
	const kv = kvOf(env);
	const config = await getConfig(kv);
	const code = inviteCode(env, config);
	if (config.closed) return json({ error: "Sign-ups are closed right now. Ask the group organiser." }, 403);
	if (await tooManyFails(kv, request)) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
	const body = await readBody(request);
	if (!body) return json({ error: "Invalid request." }, 400);
	if (!(await turnstileOk(env, request, body.turnstile))) return json({ error: "Please complete the quick check and try again." }, 403);

	const username = String(body.username || "").trim().toLowerCase();
	const name = cleanName(body.name) || username;
	const password = String(body.password || "");
	// Either the site invite code (joins "Our class") or any rōpū's join code
	const given = String(body.invite || "").trim();
	let group = null;
	if (code && safeEqual(given, code)) group = await getGroup(kv, "class");
	else {
		group = await groupByCode(kv, given);
		if (!group) { await recordFail(kv, request); return json({ error: "That invite code isn't right." }, 403); }
		if (group.closed) return json({ error: "“" + group.name + "” isn't taking new members right now." }, 403);
		if (group.members.length >= GROUP_MAX_MEMBERS) return json({ error: "“" + group.name + "” is full." }, 403);
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
	if (group && group.members.length < GROUP_MAX_MEMBERS) await addToGroup(kv, group, username);
	const token = await createSession(kv, user);
	return json({ username, name, admin: isAdmin(env, username), group: group ? group.id : null }, 200, { "Set-Cookie": sessionCookie(token, SESSION_TTL) });
}

async function login(request, env) {
	const kv = kvOf(env);
	if (await tooManyFails(kv, request)) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
	const body = await readBody(request);
	if (!body) return json({ error: "Invalid request." }, 400);
	const username = String(body.username || "").trim().toLowerCase();
	const password = String(body.password || "");
	if (!(await turnstileOk(env, request, body.turnstile))) return json({ error: "Please complete the quick check and try again." }, 403);
	if (USERNAME_RE.test(username) && (await accountLocked(kv, username))) {
		return json({ error: "Too many attempts for this account. Try again in 15 minutes." }, 429);
	}
	const user = USERNAME_RE.test(username) ? await kv.get(P + "user:" + username, "json") : null;
	const ok = user ? await verifyPassword(user, password) : (await hashPassword(password), false);
	if (!ok) {
		await recordFail(kv, request, USERNAME_RE.test(username) ? username : null);
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

async function leaderboard(env, session, url) {
	const kv = kvOf(env);
	const id = url.searchParams.get("group") || "all";
	let only = null;
	if (id !== "all") {
		const g = await getGroup(kv, id);
		if (!g || !g.members.includes(session.u)) return json({ error: "Rōpū not found." }, 404);
		only = new Set(g.members);
	}
	const keys = await listAll(kv, P + "progress:");
	return json({ members: keys.map((k) => k.metadata).filter((m) => m && !m.h && (!only || only.has(m.u))) });
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
	return signOutOthers(kv, user, session);
}

// Bump the account's epoch (every existing session stops working), then give
// this device a fresh session so it stays signed in.
async function signOutOthers(kv, user, session) {
	user.epoch = (user.epoch || 0) + 1;
	await putUser(kv, user);
	await kv.delete(P + "sess:" + session.token);
	const token = await createSession(kv, user);
	return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token, SESSION_TTL) });
}

async function signOutEverywhereElse(env, session) {
	const kv = kvOf(env);
	const user = await kv.get(P + "user:" + session.u, "json");
	if (!user) return json({ error: "Not found." }, 404);
	return signOutOthers(kv, user, session);
}

// Delete my account: needs the password; removes the account, progress,
// reminders and the member's feedback, and signs out every device.
async function deleteAccount(request, env, session) {
	const kv = kvOf(env);
	if (await tooManyFails(kv, request)) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
	const body = await readBody(request);
	if (!body || body.confirm !== "DELETE") return json({ error: "Type DELETE to confirm." }, 400);
	const user = await kv.get(P + "user:" + session.u, "json");
	if (!user || !(await verifyPassword(user, String(body.password || "")))) {
		await recordFail(kv, request);
		return json({ error: "That password isn't right." }, 403);
	}
	if (isAdmin(env, session.u)) {
		return json({ error: "Group admins can't delete their account here — remove your username from REO_ADMINS in Cloudflare first." }, 400);
	}
	await removeFromAllGroups(kv, session.u);
	const fb = (await listAll(kv, P + "fb:")).filter((k) => k.metadata && k.metadata.u === session.u);
	await Promise.all([
		kv.delete(P + "user:" + session.u),
		kv.delete(P + "progress:" + session.u),
		kv.delete(P + "push:" + session.u),
		kv.delete(P + "sess:" + session.token),
		...fb.map((k) => kv.delete(k.name)),
	]);
	return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
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
	user.epoch = (user.epoch || 0) + 1; // signs them out of every device
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
	await removeFromAllGroups(kv, username);
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


// ---------------------------------------------------------------------------
// Push notifications (Web Push: RFC 8291 encryption + RFC 8292 VAPID), all
// with WebCrypto — no libraries. Signing keys are made on first use and kept
// in KV, so there's nothing to configure.
// ---------------------------------------------------------------------------
const enc = new TextEncoder();
function b64u(bytes) { return b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function unb64u(str) {
	str = String(str).replace(/-/g, "+").replace(/_/g, "/");
	while (str.length % 4) str += "=";
	return unb64(str);
}
function concatBytes(...arrs) {
	const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
	let o = 0;
	for (const a of arrs) { out.set(a, o); o += a.length; }
	return out;
}

// only send to the real browser push services
const PUSH_HOSTS = [/\.googleapis\.com$/, /\.mozilla\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/];
function validSubscription(sub) {
	try {
		const u = new URL(sub.endpoint);
		return u.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(u.hostname)) &&
			unb64u(sub.keys.p256dh).length === 65 && unb64u(sub.keys.auth).length === 16;
	} catch (e) {
		return false;
	}
}

async function getVapid(kv) {
	let v = await kv.get(P + "vapid", "json");
	if (v) return v;
	const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
	const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
	v = { publicKey: b64u(pub), privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey) };
	await kv.put(P + "vapid", JSON.stringify(v));
	return v;
}

async function vapidAuth(vapid, endpoint) {
	const header = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
	const claims = b64u(enc.encode(JSON.stringify({
		aud: new URL(endpoint).origin,
		exp: Math.floor(Date.now() / 1000) + 12 * 3600,
		sub: "https://durand.nz/panana",
	})));
	const key = await crypto.subtle.importKey("jwk", vapid.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
	const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(header + "." + claims)));
	return "vapid t=" + header + "." + claims + "." + b64u(sig) + ", k=" + vapid.publicKey;
}

async function hkdf(salt, ikm, info, length) {
	const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
	return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

// RFC 8291: aes128gcm-encrypt a payload for one subscription
async function encryptPayload(sub, text) {
	const uaPublic = unb64u(sub.keys.p256dh);
	const authSecret = unb64u(sub.keys.auth);
	const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
	const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
	const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
	const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
	const ikm = await hkdf(authSecret, shared, concatBytes(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
	const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
	const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
	const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes,
		concatBytes(enc.encode(text), new Uint8Array([2]))));
	const header = new Uint8Array(16 + 4 + 1 + 65);
	header.set(salt, 0);
	new DataView(header.buffer).setUint32(16, 4096);
	header[20] = 65;
	header.set(asPublic, 21);
	return concatBytes(header, cipher);
}

async function sendPush(vapid, sub, data) {
	const body = await encryptPayload(sub, JSON.stringify(data));
	const res = await fetch(sub.endpoint, {
		method: "POST",
		headers: {
			Authorization: await vapidAuth(vapid, sub.endpoint),
			"Content-Encoding": "aes128gcm",
			"Content-Type": "application/octet-stream",
			TTL: "43200",
			Urgency: "normal",
		},
		body,
	});
	return res.status;
}

// Send to every device a member has subscribed; drop subscriptions the push
// service says are gone. Returns how many went through.
async function sendToMember(kv, vapid, key, rec, data) {
	let ok = 0;
	const keep = [];
	for (const sub of rec.subs || []) {
		let status = 0;
		try { status = await sendPush(vapid, sub, data); } catch (e) { status = 0; }
		if (status === 404 || status === 410) continue;
		keep.push(sub);
		if (status >= 200 && status < 300) ok++;
	}
	rec.subs = keep;
	return ok;
}

function cleanTime(t) {
	const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ""));
	if (!m) return "19:30";
	const h = Math.min(23, +m[1]), mm = Math.min(45, Math.floor(+m[2] / 15) * 15);
	return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}
function cleanTz(tz) {
	try { new Intl.DateTimeFormat("en", { timeZone: tz }); return tz; } catch (e) { return "Pacific/Auckland"; }
}

async function pushKey(env) {
	return json({ publicKey: (await getVapid(kvOf(env))).publicKey });
}

async function pushStatus(env, session) {
	const rec = await kvOf(env).get(P + "push:" + session.u, "json");
	if (!rec || !(rec.subs || []).length) return json({ subscribed: false });
	return json({ subscribed: true, devices: rec.subs.length, time: rec.time, tz: rec.tz, streak: !!rec.streak, weekly: !!rec.weekly });
}

async function pushSubscribe(request, env, session) {
	const body = await readBody(request);
	if (!body || !body.subscription || !validSubscription(body.subscription)) return json({ error: "That device can't receive notifications." }, 400);
	const kv = kvOf(env);
	const key = P + "push:" + session.u;
	const rec = (await kv.get(key, "json")) || { subs: [] };
	const sub = { endpoint: body.subscription.endpoint, keys: { p256dh: body.subscription.keys.p256dh, auth: body.subscription.keys.auth } };
	rec.subs = [sub].concat((rec.subs || []).filter((s) => s.endpoint !== sub.endpoint)).slice(0, 3);
	rec.name = session.n;
	rec.time = cleanTime(body.time || rec.time);
	rec.tz = cleanTz(body.tz || rec.tz);
	rec.streak = body.streak !== undefined ? !!body.streak : !!rec.streak;
	rec.weekly = body.weekly !== undefined ? !!body.weekly : !!rec.weekly;
	await kv.put(key, JSON.stringify(rec));
	return json({ ok: true });
}

async function pushPrefs(request, env, session) {
	const body = await readBody(request);
	if (!body) return json({ error: "Invalid request." }, 400);
	const kv = kvOf(env);
	const key = P + "push:" + session.u;
	const rec = await kv.get(key, "json");
	if (!rec) return json({ error: "Reminders aren't on." }, 400);
	if (body.time !== undefined) rec.time = cleanTime(body.time);
	if (body.tz) rec.tz = cleanTz(body.tz);
	if (body.streak !== undefined) rec.streak = !!body.streak;
	if (body.weekly !== undefined) rec.weekly = !!body.weekly;
	await kv.put(key, JSON.stringify(rec));
	return json({ ok: true });
}

async function pushUnsubscribe(request, env, session) {
	const body = (await readBody(request)) || {};
	const kv = kvOf(env);
	const key = P + "push:" + session.u;
	const rec = await kv.get(key, "json");
	if (rec) {
		rec.subs = body.endpoint ? (rec.subs || []).filter((s) => s.endpoint !== body.endpoint) : [];
		if (rec.subs.length) await kv.put(key, JSON.stringify(rec));
		else await kv.delete(key);
	}
	return json({ ok: true });
}

async function pushTest(env, session) {
	const kv = kvOf(env);
	const key = P + "push:" + session.u;
	const rec = await kv.get(key, "json");
	if (!rec || !(rec.subs || []).length) return json({ error: "Turn reminders on first." }, 400);
	const sent = await sendToMember(kv, await getVapid(kv), key, rec,
		{ title: "🍌 Kia ora " + firstName(session.n) + "!", body: "Notifications are working. Ka pai!", tag: "panana-test" });
	await kv.put(key, JSON.stringify(rec));
	return json({ ok: sent > 0, sent });
}

function firstName(n) { return String(n || "").split(" ")[0] || "e hoa"; }

// local date/time for a timezone, as { date: "YYYY-MM-DD", minutes, weekday (0 Sun) }
function localNow(tz, ms) {
	const parts = {};
	new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" })
		.formatToParts(new Date(ms)).forEach((p) => { parts[p.type] = p.value; });
	const days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
	return { date: parts.year + "-" + parts.month + "-" + parts.day, minutes: (+parts.hour % 24) * 60 + +parts.minute, weekday: days[parts.weekday] };
}
function shiftDate(key, n) {
	const [y, m, d] = key.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function weekStartOf(key) {
	const [y, m, d] = key.split("-").map(Number);
	const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
	return shiftDate(key, -dow);
}
function inWindow(minutes, hhmm) {
	const [h, m] = hhmm.split(":").map(Number);
	const t = h * 60 + m;
	return minutes >= t && minutes < t + 15;
}

// Runs every 15 minutes (wrangler.toml [triggers]). Sends each member at most
// one daily reminder (only if their goal isn't met), an optional 9pm
// streak-at-risk nudge, and an optional Monday 9am league result.
export async function runReminders(env, nowMs = Date.now()) {
	const kv = kvOf(env);
	if (!kv) return { sent: 0 };
	await ensureStore(env);
	const subs = await listAll(kv, P + "push:");
	if (!subs.length) return { sent: 0 };
	let meta = null, vapid = null, sent = 0;
	for (const k of subs) {
		const rec = await kv.get(k.name, "json");
		if (!rec || !(rec.subs || []).length) continue;
		const u = k.name.slice((P + "push:").length);
		const L = localNow(rec.tz || "Pacific/Auckland", nowMs);
		const wants = [];
		if (inWindow(L.minutes, rec.time || "19:30") && rec.lastDaily !== L.date) wants.push("daily");
		if (rec.streak && inWindow(L.minutes, "21:00") && rec.lastStreak !== L.date) wants.push("streak");
		if (rec.weekly && L.weekday === 1 && inWindow(L.minutes, "09:00") && rec.lastWeekly !== L.date) wants.push("weekly");
		if (!wants.length) continue;
		if (!meta) {
			meta = {};
			(await listAll(kv, P + "progress:")).forEach((x) => { if (x.metadata) meta[x.metadata.u] = x.metadata; });
			vapid = await getVapid(kv);
		}
		const m = meta[u] || {};
		const metToday = m.lm === L.date;
		const streakAlive = m.lm === shiftDate(L.date, -1) && m.st > 0;
		const goal = m.g || 10;
		const doneToday = m.dk === L.date ? m.dr || 0 : 0;
		const name = firstName(rec.name || m.n);
		for (const w of wants) {
			let data = null;
			if (w === "daily") {
				rec.lastDaily = L.date;
				if (!metToday) {
					const left = Math.max(1, goal - doneToday);
					data = { title: "🍌 Kia ora " + name + "!", tag: "panana-daily",
						body: streakAlive ? plural(left, "more answer") + " keeps your " + m.st + "-day streak going 🔥"
							: doneToday ? plural(left, "more answer") + " to reach today's goal." : "A few minutes of te reo today? Your goal is " + goal + " answers." };
				}
			} else if (w === "streak") {
				rec.lastStreak = L.date;
				if (!metToday && streakAlive) data = { title: "🔥 Streak at risk", tag: "panana-streak", body: "Your " + m.st + "-day streak ends at midnight. A quick lesson saves it!" };
			} else if (w === "weekly") {
				rec.lastWeekly = L.date;
				const wk = weekStartOf(L.date), prev = shiftDate(wk, -7);
				const rows = Object.values(meta).filter((e) => !e.h || e.u === u)
					.map((e) => ({ u: e.u, n: e.n || e.u, last: e.wk === wk ? e.px : e.wk === prev ? e.wx : 0 }))
					.filter((r) => r.last > 0).sort((a, b) => b.last - a.last);
				if (rows.length) {
					const me = rows.findIndex((r) => r.u === u);
					data = { title: "🏆 Last week's league", tag: "panana-weekly",
						body: rows[0].u === u ? "You topped the group with " + rows[0].last + " XP. Tino pai!"
							: firstName(rows[0].n) + " won with " + rows[0].last + " XP." + (me >= 0 ? " You came #" + (me + 1) + "." : "") };
				}
			}
			if (data) sent += await sendToMember(kv, vapid, k.name, rec, Object.assign({ url: "/panana/" }, data));
		}
		if (rec.subs.length) await kv.put(k.name, JSON.stringify(rec));
		else await kv.delete(k.name);
	}
	return { sent };
}
function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

// exposed for tests
export const _push = { encryptPayload, vapidAuth, getVapid, localNow, weekStartOf, validSubscription };


// ---------------------------------------------------------------------------
// Feedback & corrections: any member can send; admins read and resolve.
// ---------------------------------------------------------------------------
const FB_KINDS = { correction: 1, bug: 1, idea: 1 };
const FB_MAX_PER_DAY = 20;

function cleanText(s, max) {
	return typeof s === "string" ? s.replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max) : "";
}

async function sendFeedback(request, env, session) {
	const body = await readBody(request);
	if (!body) return json({ error: "Invalid request." }, 400);
	const message = cleanText(body.message, 1000);
	if (message.length < 3) return json({ error: "Tell us a little more first." }, 400);
	const kind = FB_KINDS[body.kind] ? body.kind : "correction";
	const kv = kvOf(env);
	const countKey = P + "fbcount:" + session.u + ":" + new Date().toISOString().slice(0, 10);
	const count = parseInt((await kv.get(countKey)) || "0", 10);
	if (count >= FB_MAX_PER_DAY) return json({ error: "That's a lot of reports for one day — thank you! Try again tomorrow." }, 429);
	await kv.put(countKey, String(count + 1), { expirationTtl: 172800 });
	const at = new Date().toISOString();
	const id = Date.now().toString(36) + "-" + hex(crypto.getRandomValues(new Uint8Array(4)));
	const item = { id, u: session.u, n: session.n, kind, message, about: cleanText(body.about, 200), card: cleanText(body.card, 80), at, done: false };
	await kv.put(P + "fb:" + id, JSON.stringify(item), { metadata: { id, u: item.u, n: item.n, kind, at, done: false, about: item.about.slice(0, 80), preview: message.slice(0, 160) } });
	// let admins with reminders on know (best effort)
	try {
		const vapid = await getVapid(kv);
		for (const admin of (env.REO_ADMINS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)) {
			if (admin === session.u) continue;
			const key = P + "push:" + admin;
			const rec = await kv.get(key, "json");
			if (!rec || !(rec.subs || []).length) continue;
			await sendToMember(kv, vapid, key, rec, { title: "📝 New " + (kind === "bug" ? "problem report" : kind === "idea" ? "idea" : "correction"),
				body: firstName(session.n) + ": " + message.slice(0, 120), tag: "panana-feedback", url: "/panana/" });
			await kv.put(key, JSON.stringify(rec));
		}
	} catch (e) {}
	return json({ ok: true });
}

async function adminFeedback(env, session) {
	if (!isAdmin(env, session.u)) return json({ error: "Admins only." }, 403);
	const kv = kvOf(env);
	const keys = await listAll(kv, P + "fb:");
	const items = await Promise.all(keys.map(async (k) => (await kv.get(k.name, "json"))));
	return json({ items: items.filter(Boolean).sort((a, b) => (a.done - b.done) || b.at.localeCompare(a.at)) });
}

async function adminFeedbackUpdate(request, env, session) {
	if (!isAdmin(env, session.u)) return json({ error: "Admins only." }, 403);
	const body = await readBody(request);
	const id = String((body && body.id) || "");
	if (!/^[a-z0-9]+-[a-f0-9]{8}$/.test(id)) return json({ error: "Invalid item." }, 400);
	const kv = kvOf(env);
	const key = P + "fb:" + id;
	const item = await kv.get(key, "json");
	if (!item) return json({ error: "Not found." }, 404);
	if (body.action === "delete") { await kv.delete(key); return json({ ok: true }); }
	item.done = body.action === "done";
	await kv.put(key, JSON.stringify(item), { metadata: { id, u: item.u, n: item.n, kind: item.kind, at: item.at, done: item.done, about: item.about.slice(0, 80), preview: item.message.slice(0, 160) } });
	return json({ ok: true });
}

async function publicGroup(request, env) {
	const kv = kvOf(env);
	if (await tooManyFails(kv, request)) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
	const g = await groupByCode(kv, new URL(request.url).searchParams.get("code"));
	if (!g) { await recordFail(kv, request); return json({ error: "That invite link isn't valid any more." }, 404); }
	return json({ name: g.name, open: !g.closed && g.members.length < GROUP_MAX_MEMBERS });
}

async function handleApi(request, env, path) {
	await ensureGroups(env);
	const m = request.method;
	if (m === "POST" && path === "register") return register(request, env);
	if (m === "POST" && path === "login") return login(request, env);
	if (m === "GET" && path === "public/config") return json({ turnstile: env.TURNSTILE_SECRET && env.TURNSTILE_SITE_KEY ? env.TURNSTILE_SITE_KEY : null });
	if (m === "GET" && path === "public/group") return publicGroup(request, env);

	const session = await getSession(request, env);
	if (!session) return json({ error: "Not signed in." }, 401);

	if (m === "GET" && path === "me") return me(env, session);
	if (m === "POST" && path === "logout") return logout(request, env, session);
	if (m === "GET" && path === "progress") return getProgress(env, session);
	if (m === "PUT" && path === "progress") return putProgress(request, env, session);
	if (m === "GET" && path === "leaderboard") return leaderboard(env, session, new URL(request.url));
	if (m === "GET" && path === "groups") return listGroups(env, session);
	if (m === "POST" && path === "groups/create") return createGroup(request, env, session);
	if (m === "POST" && path === "groups/join") return joinGroup(request, env, session);
	if (m === "POST" && path.startsWith("groups/") && ["leave", "rename", "newcode", "close", "remove", "delete"].includes(path.slice(7))) {
		return manageGroup(request, env, session, path.slice(7));
	}
	if (m === "GET" && path === "admin/groups") return adminGroups(env, session);
	if (m === "POST" && path === "password") return changePassword(request, env, session);
	if (m === "POST" && path === "account/signout-others") return signOutEverywhereElse(env, session);
	if (m === "POST" && path === "account/delete") return deleteAccount(request, env, session);
	if (m === "POST" && path === "admin/reset") return adminReset(request, env, session);
	if (m === "GET" && path === "admin/members") return adminMembers(env, session);
	if (m === "POST" && path === "admin/remove") return adminRemove(request, env, session);
	if (m === "POST" && path === "admin/config") return adminConfig(request, env, session);
	if (m === "POST" && path === "feedback") return sendFeedback(request, env, session);
	if (m === "GET" && path === "admin/feedback") return adminFeedback(env, session);
	if (m === "POST" && path === "admin/feedback") return adminFeedbackUpdate(request, env, session);
	if (m === "GET" && path === "push/key") return pushKey(env);
	if (m === "GET" && path === "push/status") return pushStatus(env, session);
	if (m === "POST" && path === "push/subscribe") return pushSubscribe(request, env, session);
	if (m === "POST" && path === "push/prefs") return pushPrefs(request, env, session);
	if (m === "POST" && path === "push/unsubscribe") return pushUnsubscribe(request, env, session);
	if (m === "POST" && path === "push/test") return pushTest(env, session);
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
		await ensureStore(env);
		const res = await handleApi(request, env, path.slice("/api/reo/".length));
		res.headers.set("X-Content-Type-Options", "nosniff");
		return res;
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

	if (path.startsWith("/panana/join/")) {
		const code = cleanCode(decodeURIComponent(path.slice("/panana/join/".length))).slice(0, 20);
		const signedIn = kvOf(env) ? await getSession(request, env) : null;
		return new Response(null, { status: 302, headers: { Location: (signedIn ? "/panana/?join=" : "/panana/login?join=") + code, "Cache-Control": "no-store" } });
	}
	if (path === "/panana" || path.startsWith("/panana/")) {
		if (PUBLIC_PAGES.has(path) || path.startsWith("/panana/icons/")) return secured(await env.ASSETS.fetch(request));
		if (kvOf(env)) await ensureStore(env);
		const session = kvOf(env) ? await getSession(request, env) : null;
		if (session) return secured(await env.ASSETS.fetch(request));
		const accept = request.headers.get("Accept") || "";
		if (request.method === "GET" && accept.includes("text/html")) {
			return new Response(null, { status: 302, headers: { Location: "/panana/login", "Cache-Control": "no-store" } });
		}
		return new Response("Not signed in", { status: 401, headers: { "Cache-Control": "no-store" } });
	}

	return null;
}
