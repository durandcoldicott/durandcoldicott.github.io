// SIMULATED DATA for the /demo/ page — "Fernbird Coffee Co." is a fictional company.
//
// Every number, product, café and customer here is invented. Nothing comes from a real
// business, employer or client. Figures are generated deterministically from the calendar
// date (not Math.random), so they're identical on every page load and simply roll forward
// as time passes — which is what lets the dashboards behave like live ones.

const DAY_MS = 86400000;

/* ---------- dates ---------- */

export function toDayNum(date) {
	return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}
export const dayDate = (n) => new Date(n * DAY_MS); // UTC midnight of that day
export const END_DAY = toDayNum(new Date()) - 1; // "yesterday" — the last complete day of data

export function fmtDate(n, opts) {
	return dayDate(n).toLocaleDateString("en-NZ", Object.assign({ day: "numeric", month: "short", timeZone: "UTC" }, opts));
}

/* ---------- deterministic randomness ---------- */

// Hash (seed, n) -> [0, 1). Same inputs always give the same output.
function rand(seed, n) {
	let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(n + 0x7f4a7c15, 0xc2b2ae35);
	h ^= h >>> 15;
	h = Math.imul(h, 0x2c1b3c6d);
	h ^= h >>> 12;
	h = Math.imul(h, 0x297a2d39);
	h ^= h >>> 15;
	return (h >>> 0) / 4294967296;
}
const wobble = (seed, n) => rand(seed, n) * 2 - 1; // [-1, 1)

/* ---------- the company ---------- */

export const COMPANY = {
	name: "Fernbird Coffee Co.",
	blurb: "A small specialty coffee roaster. Sells online (one-off orders and subscriptions), supplies local cafés, and runs a weekend market stall.",
};

export const SOURCES = [
	{ icon: "fa-store", label: "Online store export", note: "orders, products, customers" },
	{ icon: "fa-envelope", label: "Email platform export", note: "flows and campaigns" },
	{ icon: "fa-file-invoice-dollar", label: "Accounting export", note: "invoices and payments" },
	{ icon: "fa-table", label: "Wholesale orders sheet", note: "a shared spreadsheet" },
	{ icon: "fa-truck", label: "Courier CSV", note: "shipments, delivery times" },
];

/* ---------- daily sales model ---------- */

// week[] is indexed by getUTCDay(): Sun, Mon, Tue, Wed, Thu, Fri, Sat.
export const CHANNELS = [
	{ key: "online", label: "Online store", seed: 101, base: 1250, aov: 47, margin: 0.58, noise: 0.14, growth: 1.3, week: [0.95, 1.12, 1.02, 0.97, 0.98, 1.04, 0.96] },
	{ key: "subs", label: "Subscriptions", seed: 202, base: 800, aov: 38, margin: 0.55, noise: 0.05, growth: 1.5, week: [0.7, 1.45, 1.1, 0.95, 0.9, 0.95, 0.95] },
	{ key: "wholesale", label: "Wholesale cafés", seed: 303, base: 1250, aov: 285, margin: 0.38, noise: 0.32, growth: 1.2, week: [0.04, 1.45, 1.35, 1.25, 1.1, 0.78, 0.03] },
	{ key: "markets", label: "Markets & events", seed: 404, base: 150, aov: 26, margin: 0.62, noise: 0.2, growth: 1.12, week: [1.9, 0, 0, 0, 0, 0.6, 3.4] },
];

const dayCache = new Map();

export function dayData(n) {
	if (dayCache.has(n)) return dayCache.get(n);
	const date = dayDate(n);
	const dow = date.getUTCDay();
	const m = date.getUTCMonth();
	const d = date.getUTCDate();
	const doy = Math.floor((Date.UTC(date.getUTCFullYear(), m, d) - Date.UTC(date.getUTCFullYear(), 0, 0)) / DAY_MS);
	// Southern-hemisphere winter bump, peaking around mid-July.
	const season = 1 + 0.045 * Math.cos((2 * Math.PI * (doy - 196)) / 365);
	const gifting = (m === 10 && d >= 20) || (m === 11 && d <= 22);
	const blackFriday = m === 10 && dow === 5 && d >= 23 && d <= 29;
	const quietBreak = (m === 11 && d >= 24) || (m === 0 && d <= 3);

	const out = { n: n, revenue: 0, orders: 0, cogs: 0, ch: {} };
	CHANNELS.forEach((c) => {
		let f = c.week[dow] * season * Math.pow(c.growth, (n - END_DAY) / 365);
		if (c.key === "online") f *= blackFriday ? 2.5 : gifting ? 1.4 : quietBreak ? 0.6 : 1;
		if (c.key === "subs") f *= gifting ? 1.1 : quietBreak ? 0.9 : 1;
		if (c.key === "wholesale") f *= m === 11 && d <= 23 ? 1.15 : quietBreak ? 0.4 : 1;
		if (c.key === "markets") f *= m === 11 && d <= 23 ? 1.5 : 1;
		const rev = c.base * f * (1 + c.noise * wobble(c.seed, n));
		const orders = Math.round((rev / c.aov) * (1 + 0.08 * wobble(c.seed + 7, n)));
		const cogs = rev * (1 - c.margin * (1 + 0.05 * wobble(c.seed + 9, n)));
		out.ch[c.key] = { revenue: rev, orders: orders, cogs: cogs };
		out.revenue += rev;
		out.orders += orders;
		out.cogs += cogs;
	});
	dayCache.set(n, out);
	return out;
}

// `days` complete days ending on `endNum` (inclusive), oldest first.
export function windowOf(endNum, days) {
	const arr = [];
	for (let i = days - 1; i >= 0; i--) arr.push(dayData(endNum - i));
	return arr;
}

export const sumOf = (arr, pick) => arr.reduce((a, x) => a + pick(x), 0);

// A comparison window for the same number of days: the period just before, or the same dates last year (364 days back keeps weekdays aligned).
export const compareEnd = (mode, days) => (mode === "yoy" ? END_DAY - 364 : END_DAY - days);

// Share of orders from returning customers — a smoothly-varying simulated figure.
export function repeatRate(endNum, days, mode) {
	const shift = mode === "cur" ? 0 : mode === "yoy" ? -0.045 : -0.011;
	return 0.372 + shift + 0.004 * wobble(909, endNum + days);
}

/* ---------- products & stock ---------- */

// price/cost per unit; units30 = units sold in the last 30 days; leadDays = how long a restock takes.
const PRODUCT_DEFS = [
	{ sku: "HB-250", name: "House Blend 250g", short: "House 250g", price: 19.5, cost: 7.9, units30: 1180, stock: 1650, leadDays: 12, realise: 0.91 },
	{ sku: "HB-1K", name: "House Blend 1kg", short: "House 1kg", price: 64, cost: 25, units30: 410, stock: 520, leadDays: 12, realise: 0.8 },
	{ sku: "DC-250", name: "Dawn Chorus Espresso 250g", short: "Dawn 250g", price: 21, cost: 8.6, units30: 940, stock: 380, leadDays: 12, realise: 0.92 },
	{ sku: "DC-1K", name: "Dawn Chorus Espresso 1kg", short: "Dawn 1kg", price: 68, cost: 27.5, units30: 365, stock: 610, leadDays: 12, realise: 0.8 },
	{ sku: "SO-COL", name: "Single Origin — Huila, Colombia 250g", short: "Huila 250g", price: 24, cost: 10.4, units30: 470, stock: 560, leadDays: 21, realise: 0.94 },
	{ sku: "SO-ETH", name: "Single Origin — Yirgacheffe, Ethiopia 250g", short: "Yirg 250g", price: 26, cost: 12.1, units30: 330, stock: 250, leadDays: 21, realise: 0.95 },
	{ sku: "DEC-250", name: "Decaf (Swiss Water) 250g", short: "Decaf 250g", price: 23, cost: 11.8, units30: 210, stock: 470, leadDays: 21, realise: 0.93 },
	{ sku: "CB-500", name: "Cold Brew Blend 500g", short: "Cold brew", price: 34, cost: 14.2, units30: 255, stock: 140, leadDays: 12, realise: 0.9 },
	{ sku: "GIFT-3", name: "Gift Box (3 × 100g)", short: "Gift box", price: 49, cost: 24.5, units30: 175, stock: 90, leadDays: 18, realise: 0.97 },
	{ sku: "DRIP-10", name: "Drip Bags × 10", short: "Drip bags", price: 18, cost: 9.6, units30: 295, stock: 700, leadDays: 14, realise: 0.96 },
];

export const REORDER_BUFFER_DAYS = 10;

export const PRODUCTS = PRODUCT_DEFS.map((p) => {
	const revenue = p.units30 * p.price * p.realise;
	const margin = (revenue - p.units30 * p.cost) / revenue;
	const cover = p.stock / (p.units30 / 30); // days of stock left at the current sales rate
	const status = cover < p.leadDays ? "now" : cover < p.leadDays + REORDER_BUFFER_DAYS ? "soon" : "ok";
	return Object.assign({}, p, { revenue: revenue, margin: margin, cover: cover, status: status });
});

export const STATUS_LABEL = { ok: "OK", soon: "Reorder soon", now: "Reorder now" };

/* ---------- customers: cohorts & subscribers ---------- */

function monthStart(offset) {
	const e = dayDate(END_DAY);
	return new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + offset, 1));
}
export const monthLabel = (date) => date.toLocaleDateString("en-NZ", { month: "short", year: "numeric", timeZone: "UTC" });

// Nine monthly cohorts. retention[k] = % of the cohort who ordered again in month k after their first order.
export const COHORTS = (function () {
	const rows = [];
	const count = 9;
	for (let i = 0; i < count; i++) {
		const offset = i - (count - 1); // oldest first, newest = current month (offset 0)
		const monthsOld = -offset; // how many full months of follow-up exist
		const size = Math.round(150 + i * 11 + 20 * wobble(31, i));
		const retention = [100];
		for (let k = 1; k <= monthsOld; k++) {
			const r = 0.18 + 0.55 * Math.exp(-0.9 * k) + 0.004 * i + 0.025 * wobble(77 + i, k);
			retention.push(Math.round(r * 1000) / 10);
		}
		rows.push({ label: monthLabel(monthStart(offset)), size: size, retention: retention });
	}
	return rows;
})();

// Twelve months of subscriber movement.
export const SUBSCRIBERS = (function () {
	const rows = [];
	let active = 392;
	for (let i = 0; i < 12; i++) {
		const offset = i - 11;
		const added = Math.round(46 + i * 2 + 9 * wobble(55, i));
		const churned = Math.round(active * (0.042 + 0.008 * wobble(66, i)));
		active = active + added - churned;
		rows.push({ label: monthLabel(monthStart(offset)), added: added, churned: churned, active: active });
	}
	return rows;
})();

export const SUBSCRIPTION_AVG_ORDER = 38;

/* ---------- wholesale accounts ---------- */

// All café names are invented. intervalDays = how often they usually reorder; since = days since their last order.
export const ACCOUNTS = [
	{ name: "Little Kiln Café", orderValue: 420, intervalDays: 7, since: 4, owing: 0, overdueDays: 0 },
	{ name: "Paddock & Pour", orderValue: 560, intervalDays: 7, since: 6, owing: 560, overdueDays: 0 },
	{ name: "Saltbush Eatery", orderValue: 310, intervalDays: 10, since: 9, owing: 310, overdueDays: 0 },
	{ name: "Marlow Bakehouse", orderValue: 690, intervalDays: 7, since: 5, owing: 0, overdueDays: 0 },
	{ name: "Quarry Lane Café", orderValue: 380, intervalDays: 14, since: 27, owing: 380, overdueDays: 19 },
	{ name: "Bluebell Deli", orderValue: 240, intervalDays: 14, since: 12, owing: 240, overdueDays: 4 },
	{ name: "Orchard Row Kitchen", orderValue: 515, intervalDays: 10, since: 8, owing: 515, overdueDays: 0 },
	{ name: "Foundry Coffee Bar", orderValue: 780, intervalDays: 5, since: 3, owing: 780, overdueDays: 0 },
	{ name: "Ridgeline Lodge", orderValue: 910, intervalDays: 21, since: 38, owing: 910, overdueDays: 34 },
	{ name: "Summit Sports Club", orderValue: 330, intervalDays: 14, since: 18, owing: 330, overdueDays: 8 },
	{ name: "Wharf Road Diner", orderValue: 465, intervalDays: 7, since: 7, owing: 465, overdueDays: 0 },
	{ name: "Kiln & Co. Pantry", orderValue: 295, intervalDays: 21, since: 28, owing: 0, overdueDays: 0 },
].map((a) => {
	const ratio = a.since / a.intervalDays;
	return Object.assign({}, a, {
		ratio: ratio,
		status: ratio >= 1.8 ? "quiet" : ratio >= 1.2 ? "watch" : "regular",
		perYear: Math.round(365 / a.intervalDays),
	});
});

export const ACCOUNT_STATUS_LABEL = { regular: "Ordering as usual", watch: "Slightly late", quiet: "Gone quiet" };

export function ageing() {
	const buckets = [
		{ key: "current", label: "Not yet due", amount: 0 },
		{ key: "d30", label: "1–30 days late", amount: 0 },
		{ key: "d60", label: "31–60 days late", amount: 0 },
		{ key: "d60p", label: "60+ days late", amount: 0 },
	];
	ACCOUNTS.forEach((a) => {
		if (!a.owing) return;
		const b = a.overdueDays <= 0 ? 0 : a.overdueDays <= 30 ? 1 : a.overdueDays <= 60 ? 2 : 3;
		buckets[b].amount += a.owing;
	});
	return buckets;
}

/* ---------- email ---------- */

export const FLOWS = [
	{ name: "Welcome series", kind: "flow", recipients: 1240, open: 0.58, click: 0.095, conv: 0.062, revenue: 5840 },
	{ name: "Abandoned cart", kind: "flow", recipients: 860, open: 0.49, click: 0.088, conv: 0.108, revenue: 3920 },
	{ name: "Post-purchase & cross-sell", kind: "flow", recipients: 1920, open: 0.52, click: 0.061, conv: 0.034, revenue: 2860 },
	{ name: "Win-back (90 days lapsed)", kind: "flow", recipients: 640, open: 0.37, click: 0.041, conv: 0.019, revenue: 1260 },
	{ name: "Subscription: next roast ships", kind: "flow", recipients: 1105, open: 0.64, click: 0.052, conv: 0.027, revenue: 1480 },
	{ name: "Weekly newsletter", kind: "campaign", recipients: 9800, open: 0.41, click: 0.027, conv: 0.0048, revenue: 3980 },
	{ name: "Seasonal / launch campaigns", kind: "campaign", recipients: 7400, open: 0.44, click: 0.036, conv: 0.0071, revenue: 4620 },
].map((f) => Object.assign({}, f, { perRecipient: f.revenue / f.recipients }));
