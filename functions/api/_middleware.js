// Per-IP + global rate limiting for /api/* routes, scoped per-route so one
// endpoint can't starve another's quota.
// Requires a KV namespace bound as RATE_LIMIT_KV (see wrangler.toml).

const DEFAULT_LIMITS = { hourly: 10, daily: 30, globalDaily: 500 };
const ROUTE_LIMITS = {
	"/api/locomo-chat": { hourly: 5, daily: 15, globalDaily: 200 },
};

async function checkAndIncrement(kv, key, limit, ttlSeconds) {
	const current = parseInt((await kv.get(key)) || "0", 10);
	if (current >= limit) return false;
	await kv.put(key, String(current + 1), { expirationTtl: ttlSeconds });
	return true;
}

export async function onRequest(context) {
	const kv = context.env.RATE_LIMIT_KV;

	// If KV isn't bound yet (e.g. first deploy before the namespace is set up),
	// fail open rather than breaking the whole endpoint.
	if (!kv) {
		return context.next();
	}

	const route = new URL(context.request.url).pathname;
	const limits = ROUTE_LIMITS[route] || DEFAULT_LIMITS;

	const ip = context.request.headers.get("CF-Connecting-IP") || "unknown";
	const now = new Date();
	const hourKey = `rl:${route}:ip:${ip}:${now.toISOString().slice(0, 13)}`;
	const dayKey = `rl:${route}:ip:${ip}:${now.toISOString().slice(0, 10)}`;
	const globalKey = `rl:${route}:global:${now.toISOString().slice(0, 10)}`;

	const globalOk = await checkAndIncrement(kv, globalKey, limits.globalDaily, 172800);
	if (!globalOk) {
		return new Response(
			JSON.stringify({ error: "rate_limited", message: "The concierge is taking a short break — please check back later." }),
			{ status: 429, headers: { "Content-Type": "application/json" } }
		);
	}

	const dayOk = await checkAndIncrement(kv, dayKey, limits.daily, 172800);
	const hourOk = dayOk && (await checkAndIncrement(kv, hourKey, limits.hourly, 7200));

	if (!hourOk) {
		return new Response(
			JSON.stringify({ error: "rate_limited", message: "Whoa, one moment — try again in a bit." }),
			{ status: 429, headers: { "Content-Type": "application/json" } }
		);
	}

	return context.next();
}
