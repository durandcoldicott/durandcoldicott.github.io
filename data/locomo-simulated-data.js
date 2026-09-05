// SIMULATED / ESTIMATED layer for the /locomo concept page.
//
// EVERY number in this file is fabricated for demonstration — none of it is
// Locomo's real analytics, CRM, or sales data. It exists to illustrate the
// KIND of dashboard and insight that becomes possible once real data is
// connected — not to claim anything about Locomo's actual performance.
//
// This is the single source of truth for both the on-page charts and the
// "Ask Locomo Intelligence" chatbot, so the two can never contradict each
// other. Every exported block carries a `confidence` tag used by the UI's
// confidence-key legend: "simulated" (fabricated for demo) or "hypothesis"
// (an illustrative example of an AI-generated read, not a real finding).

export const CONFIDENCE_LEVELS = {
	verified: { label: "VERIFIED", desc: "Directly observed on locomo.co.nz or a page it links to." },
	estimated: { label: "ESTIMATED", desc: "A plain calculation from verified public data (e.g. counting listed stockists)." },
	simulated: { label: "SIMULATED", desc: "Fabricated for this demo — illustrates what a connected dashboard would show, not Locomo's real numbers." },
	hypothesis: { label: "HYPOTHESIS", desc: "An illustrative example of the kind of question an AI system would surface — not a claim about Locomo's actual business." },
};

// Screen 4 — The Growth Dashboard. A mocked GA4-style analytics view.
//
// UPDATE: Locomo's own job description for this role states outright that
// "Locomo is predominantly a B2B business" — so that half is now VERIFIED,
// not a guess. The specific ~15% DTC-revenue-share figure is still mine —
// the JD doesn't give an exact split — so that stays a labelled estimate.
export const B2B_CONTEXT = {
	estimateLabel: "ESTIMATE",
	b2cShareEstimate: 0.15,
	verifiedText:
		"Locomo's own job description for this role states outright that \"Locomo is predominantly a " +
		"B2B business\" — confirmed by Locomo, not assumed by me.",
	estimateText:
		"How much of that is DTC website revenue isn't stated, so I'm estimating ~15% here as an " +
		"illustrative figure, not a researched one. Either way, a dashboard like this only ever sees " +
		"website behaviour — the wholesale/stockist side runs through completely different systems " +
		"(purchase orders, account reps, invoicing) that a tool like this would never see, regardless " +
		"of the real split.",
};

// Deterministic generator config for the interactive trend chart — see
// generateSeries() in locomo.js. `weekly` is a Mon–Sun multiplier (this is a
// consumer storefront, so weekends are quieter — the opposite pattern to a
// B2B/trade site). `comparisonBaselineFactor` scales the comparison period's
// baseline down, so switching date range/comparison always tells a
// consistent (simulated) modest-growth story rather than random noise.
export const METRICS_CONFIG = {
	confidence: "simulated",
	asOf: "2026-09-04",
	metrics: {
		sessions: { base: 148, weekly: [1.18, 1.04, 0.98, 0.98, 1.06, 0.78, 0.62], trendPerDay: 0.0018, noiseFrac: 0.09, seed: 1201 },
		revenue: { base: 2380, weekly: [1.22, 1.05, 0.97, 0.94, 1.08, 0.72, 0.58], trendPerDay: 0.0026, noiseFrac: 0.15, seed: 4402 },
		conversionRate: { base: 0.021, weekly: [1, 1, 1, 1, 1, 1, 1], trendPerDay: 0.0004, noiseFrac: 0.10, seed: 8803 },
		roas: { base: 4.0, weekly: [1, 1, 1, 1, 1, 1, 1], trendPerDay: 0.0003, noiseFrac: 0.12, seed: 1604 },
	},
	comparisonBaselineFactor: { previous: 0.91, yoy: 0.80 },
};

// Traffic acquisition by channel — last 30 days snapshot.
export const CHANNELS = {
	confidence: "simulated",
	rows: [
		{ key: "organic_search", label: "Organic Search", sessionShare: 0.34, conversionRate: 0.024, isPaid: false },
		{ key: "paid_search", label: "Paid Search", sessionShare: 0.19, conversionRate: 0.031, isPaid: true },
		{ key: "direct", label: "Direct", sessionShare: 0.16, conversionRate: 0.029, isPaid: false },
		{ key: "paid_social", label: "Paid Social", sessionShare: 0.13, conversionRate: 0.012, isPaid: true },
		{ key: "referral", label: "Referral", sessionShare: 0.08, conversionRate: 0.034, isPaid: false },
		{ key: "email_sms", label: "Email / SMS", sessionShare: 0.06, conversionRate: 0.041, isPaid: false },
		{ key: "organic_social", label: "Organic Social", sessionShare: 0.04, conversionRate: 0.009, isPaid: false },
	],
};

// Device category — last 30 days snapshot.
export const DEVICES = {
	confidence: "simulated",
	rows: [
		{ key: "desktop", label: "Desktop", sessionShare: 0.42, conversionRate: 0.028 },
		{ key: "mobile", label: "Mobile", sessionShare: 0.48, conversionRate: 0.014 },
		{ key: "tablet", label: "Tablet", sessionShare: 0.10, conversionRate: 0.024 },
	],
};

// Social tab: follower counts/bios are REAL (see locomo-public-data.js
// SOCIAL_PROFILES) — engagement rate, response time and content-mix
// performance below are simulated. `performanceIndex` is a relative 0–10
// scale, not a real metric.
export const SOCIAL = {
	confidence: "simulated",
	platforms: [
		{ key: "instagram", label: "Instagram", engagementRate: 0.021, avgResponseTimeHours: 14 },
		{ key: "facebook", label: "Facebook", engagementRate: 0.009, avgResponseTimeHours: 22 },
	],
	contentMix: [
		{ type: "Real customer story / testimonial", performanceIndex: 9.1 },
		{ type: "Product demo / feature video", performanceIndex: 8.4 },
		{ type: "Lifestyle / brand photography", performanceIndex: 6.2 },
		{ type: "Trade-show / event coverage", performanceIndex: 5.0 },
	],
	exampleInsight: {
		confidence: "hypothesis",
		text: "Both real profiles are still a modest, early-stage organic base (605 and ~1,200 followers) — " +
			"consistent with Paid Social's weaker ROAS on the Acquisition tab. Example of what this would " +
			"prompt: growing the organic base with the content types that already work best (real customer " +
			"stories) before leaning harder on paid social spend, rather than treating the two as separate " +
			"budgets.",
	},
};

// Paid channel spend/ROI — last 30 days snapshot. Conversions are
// deliberately lower than CHANNELS' implied per-channel totals would give —
// illustrating the normal, realistic gap between a sessions-based funnel and
// a channel-attributed conversions report (different attribution windows),
// not an error to reconcile away.
export const AD_SPEND = {
	confidence: "simulated",
	rows: [
		{ channel: "Google Ads (Paid Search)", spend: 4200, clicks: 2850, conversions: 26, revenue: 23400, deltaVsPrevious: 0.09 },
		{ channel: "Meta Ads (Paid Social)", spend: 3100, clicks: 5400, conversions: 7, revenue: 5950, deltaVsPrevious: -0.04 },
	],
};

// Conversion funnel — last 30 days snapshot. Purchase count is anchored to
// METRICS_CONFIG's sessions × conversionRate base (148 × 30 × 2.1% ≈ 91).
export const FUNNEL_STAGES = {
	confidence: "simulated",
	rows: [
		{ stage: "Sessions", sessions: 4350 },
		{ stage: "Product page view", sessions: 2870 },
		{ stage: "Add to cart", sessions: 540 },
		{ stage: "Checkout started", sessions: 210 },
		{ stage: "Purchase", sessions: 91 },
	],
};

// Top multi-touch conversion paths — illustrative, ties back to the "Hidden
// Customer" ecosystem thesis (research → return → purchase, not one touch).
export const TOP_PATHS = {
	confidence: "simulated",
	rows: [
		{ path: ["Organic Search", "Direct", "Purchase"], share: 0.28 },
		{ path: ["Direct", "Purchase"], share: 0.19 },
		{ path: ["Paid Search", "Purchase"], share: 0.15 },
		{ path: ["Organic Search", "Purchase"], share: 0.13 },
		{ path: ["Paid Social", "Organic Search", "Purchase"], share: 0.10 },
		{ path: ["Referral", "Purchase"], share: 0.08 },
		{ path: ["Other paths", "Purchase"], share: 0.07 },
	],
};

// Screen 5 (Stockist Intelligence): simulated performance per region, laid
// over the REAL 15-region list and REAL stockist counts from
// locomo-public-data.js STOCKISTS.
export const STOCKIST_PERFORMANCE = {
	confidence: "simulated",
	rows: [
		{ region: "Auckland", stockistsReal: 4, leads: 210, sales: 34, conversion: 0.162 },
		{ region: "Christchurch", stockistsReal: 1, leads: 158, sales: 17, conversion: 0.108 },
		{ region: "Lower Hutt", stockistsReal: 1, leads: 96, sales: 15, conversion: 0.156 },
		{ region: "Hamilton", stockistsReal: 1, leads: 88, sales: 19, conversion: 0.216 },
		{ region: "Tauranga", stockistsReal: 1, leads: 74, sales: 12, conversion: 0.162 },
		{ region: "Dunedin", stockistsReal: 1, leads: 52, sales: 6, conversion: 0.115 },
		{ region: "Palmerston North", stockistsReal: 1, leads: 47, sales: 9, conversion: 0.191 },
		{ region: "Nelson and Blenheim", stockistsReal: 2, leads: 44, sales: 8, conversion: 0.182 },
		{ region: "Hastings", stockistsReal: 1, leads: 38, sales: 5, conversion: 0.132 },
		{ region: "Invercargill", stockistsReal: 2, leads: 36, sales: 5, conversion: 0.139 },
		{ region: "Northland", stockistsReal: 2, leads: 33, sales: 4, conversion: 0.121 },
		{ region: "Timaru", stockistsReal: 1, leads: 24, sales: 3, conversion: 0.125 },
		{ region: "Taupo", stockistsReal: 1, leads: 22, sales: 4, conversion: 0.182 },
		{ region: "Ashburton", stockistsReal: 1, leads: 19, sales: 2, conversion: 0.105 },
		{ region: "Paraparaumu", stockistsReal: 1, leads: 18, sales: 3, conversion: 0.167 },
	],
	exampleInsight: {
		confidence: "hypothesis",
		text: "Example of the kind of pattern this view would flag: in this simulated data, " +
			"Christchurch shows high lead volume but a lower conversion rate than similarly-sized " +
			"regions — notable mainly because it's also where Locomo's own NZ warehouse sits. " +
			"Not a finding about the real business — a prompt for the kind of question worth asking " +
			"the regional stockist directly, the same way the tool would surface it once the numbers were real.",
	},
};

// Products tab of the Growth Dashboard: simulated funnel/attach numbers laid
// over REAL products/prices/brands from locomo-public-data.js PRODUCTS.
// `unitsSold` ≈ `views` × `conversionRate` throughout, by construction — kept
// internally consistent even though it's simulated. Revenue isn't stored
// here — it's computed at render time from unitsSold × the product's real
// price, so it can never drift out of sync with the real price data.
export const PRODUCT_SIGNALS = {
	confidence: "simulated",
	rows: [
		{ product: "byACRE Carbon Ultralight", views: 1840, conversionRate: 0.048, unitsSold: 88, attachRate: 0.18, tag: "Popular entry point" },
		{ product: "byACRE Nordic Pioneer", views: 1210, conversionRate: 0.054, unitsSold: 65, attachRate: 0.11, tag: "Accessible price point" },
		{ product: "Rollz Motion", views: 1560, conversionRate: 0.041, unitsSold: 64, attachRate: 0.31, tag: "Flagship 2-in-1" },
		{ product: "Uplivin Trive", views: 1380, conversionRate: 0.051, unitsSold: 70, attachRate: 0.14, tag: "Lowest-priced named walker" },
		{ product: "Dorica", views: 920, conversionRate: 0.062, unitsSold: 57, attachRate: 0.22, tag: "Multi-use household cross-sell", note: "Real testimonial evidence ('who's got the Dorica?!') suggests genuinely high household engagement — the tag reflects that real quote, the numbers are still simulated." },
		{ product: "byACRE Carbon Overland", views: 690, conversionRate: 0.039, unitsSold: 27, attachRate: 0.24, tag: "Outdoor/adventure niche" },
		{ product: "Rollz Flex 2.0", views: 540, conversionRate: 0.032, unitsSold: 17, attachRate: 0.16, tag: "Compact / travel niche" },
		{ product: "Saljol Carbon Rollator", views: 410, conversionRate: 0.030, unitsSold: 12, attachRate: 0.15, tag: "Premium alternative" },
		{ product: "Rollz Performance", views: 380, conversionRate: 0.024, unitsSold: 9, attachRate: 0.27, tag: "Premium upsell from Motion" },
		{ product: "Rollz Rhythm", views: 160, conversionRate: 0.021, unitsSold: 3, attachRate: 0.09, tag: "Specialist / condition-specific" },
	],
	exampleInsight: {
		confidence: "hypothesis",
		text: "Example of what a connected product view could surface: whether the Carbon Ultralight and " +
			"Trive function as lower-cost 'acquisition' products relative to Motion/Performance as higher-value " +
			"upsells — a genuinely useful question for a merchandising or lifecycle-email plan, but one that " +
			"needs real sales data to answer, not simulated numbers.",
	},
};

// Screen 6 (Geographic Opportunity Matrix): simulated relative positioning
// over the REAL 15 stockist regions. Deliberately unitless (no fake dollar
// figures) — this is an illustrative scatter, not a market-sizing model.
export const GEO_OPPORTUNITY = {
	confidence: "simulated",
	axisNote: "Both axes are illustrative 0–10 indices, not calculated from real market-sizing or demographic data.",
	rows: [
		{ region: "Auckland", attractiveness: 9.1, opportunity: 6.4 },
		{ region: "Christchurch", attractiveness: 7.8, opportunity: 7.6 },
		{ region: "Hamilton", attractiveness: 6.9, opportunity: 7.9 },
		{ region: "Wellington / Lower Hutt", attractiveness: 7.4, opportunity: 6.8 },
		{ region: "Tauranga", attractiveness: 6.5, opportunity: 6.9 },
		{ region: "Dunedin", attractiveness: 5.2, opportunity: 5.8 },
		{ region: "Palmerston North", attractiveness: 4.8, opportunity: 6.1 },
		{ region: "Nelson / Blenheim", attractiveness: 4.4, opportunity: 6.3 },
		{ region: "Hastings", attractiveness: 4.1, opportunity: 5.2 },
		{ region: "Invercargill", attractiveness: 3.3, opportunity: 4.9 },
		{ region: "Northland", attractiveness: 3.9, opportunity: 5.4 },
		{ region: "Timaru", attractiveness: 2.6, opportunity: 4.3 },
		{ region: "Taupo", attractiveness: 2.9, opportunity: 5.6 },
		{ region: "Ashburton", attractiveness: 2.2, opportunity: 4.0 },
		{ region: "Paraparaumu", attractiveness: 2.8, opportunity: 5.1 },
	],
};

// Screen 7 (How I'd approach the first 90 days) — process, not Locomo-specific tactical advice. This is presented
// as "how I'd work," which is a legitimate confident claim (about method),
// unlike a claim about what Locomo specifically should do.
export const APPROACH_90_DAY = [
	{ phase: "Weeks 1–4 — Connect & learn", detail: "Sit with the team on what's already running (Locomo is confirmed on Shopify; whatever else is in place I'd learn rather than assume) before proposing anything new." },
	{ phase: "Weeks 4–8 — Build visibility", detail: "The kind of connected view this page illustrates — but built on real data, scoped to whatever the team actually finds useful day to day." },
	{ phase: "Weeks 8+ — Small, testable experiments, continuous improvement", detail: "Pick one or two ideas the team already wants to try, run them properly, and measure them. From here this becomes the ongoing rhythm, not a one-off phase — the weekly AI summary on the Growth Dashboard, earlier on this page, is what that rhythm looks like in practice." },
];
