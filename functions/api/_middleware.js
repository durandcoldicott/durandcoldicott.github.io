// Per-IP + global rate limiting for /api/* routes.
// Requires a KV namespace bound as RATE_LIMIT_KV (see wrangler.toml).

const PER_IP_HOURLY_LIMIT = 10;
const PER_IP_DAILY_LIMIT = 30;
const GLOBAL_DAILY_LIMIT = 500;

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

	const ip = context.request.headers.get("CF-Connecting-IP") || "unknown";
	const now = new Date();
	const hourKey = `rl:ip:${ip}:${now.toISOString().slice(0, 13)}`;
	const dayKey = `rl:ip:${ip}:${now.toISOString().slice(0, 10)}`;
	const globalKey = `rl:global:${now.toISOString().slice(0, 10)}`;

	const globalOk = await checkAndIncrement(kv, globalKey, GLOBAL_DAILY_LIMIT, 172800);
	if (!globalOk) {
		return new Response(
			JSON.stringify({ error: "rate_limited", message: "The concierge is taking a short break — please check back later." }),
			{ status: 429, headers: { "Content-Type": "application/json" } }
		);
	}

	const dayOk = await checkAndIncrement(kv, dayKey, PER_IP_DAILY_LIMIT, 172800);
	const hourOk = dayOk && (await checkAndIncrement(kv, hourKey, PER_IP_HOURLY_LIMIT, 7200));

	if (!hourOk) {
		return new Response(
			JSON.stringify({ error: "rate_limited", message: "Whoa, one moment — try again in a bit." }),
			{ status: 429, headers: { "Content-Type": "application/json" } }
		);
	}

	return context.next();
}
