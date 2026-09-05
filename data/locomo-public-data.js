// VERIFIED layer for the /locomo concept page — everything in this file was
// read directly off locomo.co.nz (or a source it links to) on 4 Sept 2026.
// No figures, quotes, or facts are invented here. See locomo-simulated-data.js
// for the clearly-separate SIMULATED layer used for the mock dashboards.
//
// This project is an independent concept piece by Durand Coldicott,
// not affiliated with, endorsed by, or commissioned by Locomo.

export const SOURCE_NOTE =
	"Collected directly from locomo.co.nz (home, product catalogue, buying guide, " +
	"stockists, about, brands, shipping/refund policy and blog pages) on 4 Sept 2026, " +
	"plus the public Locomo case study at digitella.nz/case-studies/locomo/, Locomo's " +
	"own job description for this role, and Locomo's public Instagram/Facebook pages " +
	"(checked 5 Sept 2026 — follower counts move, so treat those as a snapshot).";

// Real, public social profiles — linked directly from locomo.co.nz's own
// footer. Follower counts/bios checked 5 Sept 2026; they'll drift over time,
// engagement-rate/response-time/content-mix figures elsewhere are simulated.
export const SOCIAL_PROFILES = {
	asOf: "5 Sept 2026",
	instagram: {
		handle: "@locomodesign",
		url: "instagram.com/locomodesign",
		followers: 605,
		following: 297,
		bio: "We believe in design-led assistive technology. To rubbish walking aids we say \"No!\" To cool ones we say \"Yo!\"",
	},
	facebook: {
		name: "Locomo",
		url: "facebook.com/locomodesign",
		followers: 1200,
		category: "Shopping & retail",
		rating: "Not yet rated (1 review) as of 5 Sept 2026",
		recentPostExample:
			"A real recent post: \"We're exhibiting at the ATSNZ Disability Expo 2026!\" (2 reactions visible) — " +
			"directly matches the JD's twice-yearly trade-fair support duty; also visible evidence the " +
			"team already treats trade shows as a social-content moment, not just an in-person event.",
	},
	linkInBio: "linktr.ee/locomodesign",
	auContact: { phone: "+61 2 4058 4636", email: "hello@locomo.com.au" },
};

export const COMPANY = {
	name: "Locomo",
	founded: 2015,
	markets: ["New Zealand", "Australia"],
	sites: ["locomo.co.nz", "locomo.com.au"],
	warehouses: [
		{ city: "Christchurch", country: "New Zealand" },
		{ city: "Sydney", country: "Australia" },
	],
	contact: { phone: "0800 616 717", email: "hello@locomo.co.nz" },
	originStory:
		"Founded in 2015 by Anna, who went looking for a walker for her grandmother, " +
		"Nana Irene, and a first-time mum at the time. Not finding anything well-designed " +
		"locally, Anna found the Rollz Motion in the Netherlands — Irene named it 'Rollo' " +
		"and used it enough that Anna left her job to start importing it into New Zealand. " +
		"Locomo has since grown into a NZ/AU importer and distributor for several premium " +
		"mobility brands, sold direct online and through a retail stockist network.",
	team: [
		{ name: "Anna", role: "Co-founder & Director", note: "product sourcing, purchasing, finance, customer support" },
		{ name: "Joe", role: "Co-founder", note: "customers & stockists, comms and marketing, product sourcing, suppliers" },
		{ name: "Renée", role: "Sales Coordinator", note: "first point of phone contact; supports stockists; order processing" },
		{ name: "Abi", role: "Marketing Specialist", note: "marketing across NZ and Australia" },
		{ name: "Mandy", role: "Accounts and Admin" },
		{ name: "Meredith", role: "HR" },
		{ name: "Brent", role: "NZ Warehouse Manager", note: "Christchurch" },
		{ name: "Jack & Perry", role: "Australian Warehouse Captains", note: "Sydney" },
	],
	teamNote:
		"Small team (~9 people, About page). Marketing currently sits with Joe " +
		"(co-founder, split across marketing/comms, sourcing and supplier relationships) " +
		"and Abi (Marketing Specialist) — no dedicated marketing/communications lead role " +
		"is named on the team page as of 4 Sept 2026.",
	professionalPartners:
		"Locomo's own About page states they 'work with occupational therapists, " +
		"physiotherapists and other healthcare professionals who help people find " +
		"mobility products that suit their needs' — a direct, first-party confirmation " +
		"of the professional/advisor channel alongside the retail stockist network.",
};

// The 5 brand blocks shown on locomo.co.nz/pages/brands. Dorica appears as its
// own product line in the catalogue but is not one of the 5 brand blocks.
export const BRANDS = [
	{ name: "byACRE", origin: "Denmark", tagline: "Lightest walkers in the world", note: "Multiple design-award winner." },
	{ name: "Rollz", origin: "Netherlands", tagline: "The 2-in-1 walker-wheelchair experts", note: "Multi-award-winning ergonomics specialists." },
	{ name: "Uplivin", origin: "London, UK", tagline: "Locomo's mid-range brand", note: null },
	{ name: "Saljol", origin: "Germany", tagline: "Family-owned, 20+ years' industry experience", note: null },
	{ name: "Spryly", origin: "England", tagline: "Home & bathroom range", note: null },
];

// Locomo is "the importer and distributor for the Rollz, Trive, Saljol and
// byACRE products in New Zealand" (locomo.co.nz/pages/retailers) — "Trive" is
// Uplivin's walker model name, used interchangeably with the brand on-site.

// Hero products — walkers, walker-wheelchairs and lifestyle range, with real
// prices, descriptions and colourways as shown on locomo.co.nz.
export const PRODUCTS = [
	{ name: "byACRE Carbon Ultralight", brand: "byACRE", category: "Walker", price: 1220, priceType: "fixed", weightKg: 4.8, colours: ["Strawberry Red", "Carbon Black", "Royal Blue", "British Racing Green", "Oyster White", "Morning Blue", "Champagne Gold", "Pale Rose"], description: "At just 4.8kg, marketed as the lightest carbon fibre walker in the world — for an active life and easy lifting." },
	{ name: "byACRE Carbon Overland", brand: "byACRE", category: "Walker", price: 1370, priceType: "fixed", weightKg: 6.7, colours: ["Defender Green", "Bentley Brown", "Midnight Blue", "Rose Gold"], description: "Sturdy, lightweight, mixed-terrain walker with air-filled tyres for off-road use." },
	{ name: "byACRE Nordic Pioneer", brand: "byACRE", category: "Walker", price: 895, priceType: "from", listPrice: 995, onSale: true, colours: ["Glacier Green", "Granite Black"], description: "Bump-proof, scratch-resistant, larger tyres; byACRE's more accessible price point." },
	{ name: "Rollz Motion", brand: "Rollz", category: "Walker-Wheelchair", price: 2265, priceType: "fixed", colours: ["Matt Black", "Dark Purple", "Island Blue", "Pebble White", "Candy Pink"], description: "Award-winning 2-in-1 convertible walker-wheelchair; converts in seconds. Locomo's founding product." },
	{ name: "Rollz Performance", brand: "Rollz", category: "Walker-Wheelchair", price: 2595, priceType: "fixed", colours: ["Jungle Green", "Ruby Red"], description: "Air-filled tyres, extra padding, ergonomic handles — upgraded version of the Motion." },
	{ name: "Rollz Flex 2.0", brand: "Rollz", category: "Walker", price: 1095, priceType: "fixed", colours: ["Pebble White", "Dark Purple"], description: "The 'incognito' walker/rollator — described as a world-first design; folds flat." },
	{ name: "Rollz Air", brand: "Rollz", category: "Walker", price: 1495, priceType: "fixed", colours: ["Coal Black", "Mint Green"], description: "Quality/attention-to-detail positioning within the Rollz range." },
	{ name: "Rollz Flow", brand: "Rollz", category: "Walker", price: 1250, priceType: "fixed", colours: ["Ocean Blue", "Granite Black"], description: "Aluminium version of the Rollz Air with a double bag system." },
	{ name: "Rollz Rhythm", brand: "Rollz", category: "Walker", price: 3435, priceType: "from", colours: ["Matt Black"], description: "Award-winning walker built for Parkinson's, with a cueing feature to help break freezing episodes. Locomo's highest-priced walker." },
	{ name: "Uplivin Trive", brand: "Uplivin", category: "Walker", price: 899, priceType: "fixed", colours: ["Terracotta Red", "British Racing Green", "Metallic Grey"], description: "Double-folding walker; Locomo's lowest-priced named walker." },
	{ name: "Uplivin Gavo", brand: "Uplivin", category: "Walker-Wheelchair", price: 1195, priceType: "fixed", colours: ["Moss Blue", "Moon Black", "British Racing Green"], description: "2-in-1 walker that converts to a wheelchair by flipping the footrests and backrest." },
	{ name: "Saljol Indoor Walker", brand: "Saljol", category: "Walker", price: 1150, priceType: "fixed", colours: ["Champagne Gold", "Velvet Grey"], description: "Indoor-specific walker with double-braking, seat and tray." },
	{ name: "Saljol Carbon Rollator", brand: "Saljol", category: "Walker", price: 1490, priceType: "fixed", colours: ["Matt Black", "British Racing Green", "Midnight Blue", "Gold", "Copper Red"], description: "Saljol's lightweight carbon-fibre walker." },
	{ name: "Saljol Aluminium Rollator", brand: "Saljol", category: "Walker", price: 1220, priceType: "fixed", colours: ["Barolo Red", "Magic Black", "Pearl Grey", "Forest Green"], description: "Larger front wheels; also seen listed as a 2023/2024 sale model at $610." },
	{ name: "Dorica", brand: "Dorica", category: "Lifestyle", price: 289, priceType: "fixed", colours: ["Glacier Green", "Graphite Grey", "Baltic Blue"], description: "Step / seat / shower support multi-use lifestyle piece. Real customer quote: \"who's got the Dorica?!\" — described as constantly borrowed around the house." },
	{ name: "Spryly Raised Toilet Seat", brand: "Spryly", category: "Lifestyle", price: 779, priceType: "fixed", colours: ["Blossom", "Cappuccino", "Sage", "Dusk"], description: "Designed to be easy to clean and blend into the home." },
	{ name: "Spryly Commode", brand: "Spryly", category: "Lifestyle", price: 1099, priceType: "fixed", colours: ["Cappuccino", "Blossom", "Sage", "Dusk"], description: "Designed for an at-home aesthetic rather than a clinical look." },
	{ name: "Spryly Shower/Bathroom Stool", brand: "Spryly", category: "Lifestyle", price: 269, priceType: "fixed", colours: ["Cappuccino", "Blossom", "Sage", "Dusk"], description: "Easy-clean, styled shower seat." },
];

// Accessories & parts captured across the 3-page /collections/all catalogue —
// name and price only (the site doesn't give each one its own description).
export const ACCESSORIES = {
	byACRE: [
		["Carbon Ultralight – Wheel (part)", 54], ["Grocery Bag", 105], ["Nordic Pioneer Mesh Bag", 99],
		["Nordic Pioneer Travel Bag", 235], ["Overland Cane Holder", 95], ["Overland Daypack", 135],
		["Overland Mini Pump", 75], ["Overland Padded Backrest", 99], ["Overland Pocket Bag", 69],
		["Overland Touch-Up Pen", 75], ["Overland Travel Bag", 235], ["Service Kit", 27.3],
		["Ultralight Organiser Bag", 69], ["Ultralight Backrest", 49, { onSale: true, listPrice: 99 }],
		["Ultralight Cane Holder", 95], ["Ultralight Cup Holder", 99], ["Ultralight Padded Backrest", 99],
		["Ultralight Touch-Up Pens", 75], ["Ultralight Travel Bag", 235], ["Weekend Bag", 120],
	],
	Rollz: [
		["Air/Flow Cane Holder", 60], ["Air/Flow Cup Holder", 109], ["Air/Flow Travel Cover", 260],
		["Flex Cane Holder", 89], ["Flex Shopping Hooks", 89], ["Light", 99],
		["Motion/Performance Cup Holder", 99], ["Motion/Performance Seat Belt", 89], ["Motion/Performance Travel Cover", 350],
		["Motion Adjustable Footrests (part)", 184.5], ["Motion Slow Down Brake", 325], ["Motion Wheelchair Seat (part)", 396],
		["Motion 3-in-1 Package Holder", 99], ["Motion Back Support", 129], ["Motion Basket", 99],
		["Motion Locking Hook", 29], ["Motion Touch-Up Pens", 79], ["Shopper", 290], ["Tray", 187],
	],
	Saljol: [["Back Rest", 120], ["Indoor – Padded Seat", 145], ["Padded Seat", 120], ["Transport Bag", 215]],
	Uplivin: [
		["Gavo Underseat Bag", 65], ["Gavo Cane Holder", 49], ["Gavo Cup Holder", 49], ["Gavo Seat Belt", 45],
		["Rechargeable Light", 55], ["Trive Shopping Bag (part)", 50], ["Trive Cup Holder", 49],
		["Trive Travel Bag", 115], ["Trive Underseat Bag", 75],
	],
};

// Full stockist network from the FAQPage JSON-LD on locomo.co.nz/pages/retailers
// (15 regions Locomo lists; ~20 physical/contactable stockist touchpoints).
export const STOCKISTS = [
	{ region: "Northland", businesses: [
		{ name: "Northable", location: "73 John Street, Whangarei", phone: "09 430 0988", stocks: "Rollz Motion only" },
		{ name: "Keri Mobility", location: "Shop 6/84 Kerikeri Road, Kerikeri 0230", phone: "(09) 407 6701", stocks: null },
	]},
	{ region: "Auckland", businesses: [
		{ name: "Independent Living Charitable Trust – Botany", location: "308 Te Irirangi Drive, Botany South, Auckland 2013", phone: "09 281 5027", stocks: "byACRE Ultralight, Rollz Motion", url: "ilsnz.org" },
		{ name: "Independent Living Charitable Trust – Royal Oak", location: "14 Erson Ave, Royal Oak, Auckland 1345", phone: "09 625 0322", stocks: "byACRE Ultralight only", url: "ilsnz.org" },
		{ name: "Independent Living Charitable Trust – Browns Bay", location: "13 Bute Road, Browns Bay", phone: "09 550 3387", stocks: "Rollz Motion, byACRE Ultralight and Overland", url: "ilsnz.org" },
		{ name: "Mobility Centre – Auckland (van/in-home demo)", location: "No physical store — in-home demo by arrangement", phone: "021 547 356", stocks: "Rollz Motion, byACRE Ultralight and Overland", url: "mobilitycentre.co.nz" },
	]},
	{ region: "Hamilton", businesses: [
		{ name: "Mobility Centre – Hamilton", location: "20 Palmerston Street", phone: "07 903 7050", stocks: "Rollz Motion, byACRE Ultralight and Overland", url: "mobilitycentre.co.nz", note: "Described as a North Island chain based in Hamilton." },
	]},
	{ region: "Taupo", businesses: [
		{ name: "MoveSmart", location: "25 Mānuka Street, Taupō", phone: "07 377 0042 / 0800 668 778", stocks: "byACRE Ultralight, Uplivin Trive", url: "movesmart.nz" },
	]},
	{ region: "Tauranga", businesses: [
		{ name: "Mobility Centre – Tauranga", location: "520 Gloucester Road, Papamoa", phone: "07 571 6351", stocks: "Rollz Motion, byACRE Ultralight and Overland", url: "mobilitycentre.co.nz" },
	]},
	{ region: "Hastings", businesses: [
		{ name: "Mobility Centre – Hastings", location: "345 Heretaunga Street West", phone: "06 211 7925", stocks: "Rollz Motion, byACRE Ultralight and Overland", url: "mobilitycentre.co.nz" },
	]},
	{ region: "Palmerston North", businesses: [
		{ name: "Mobility Manawatu", location: "222 Ruahine Street", phone: "06 357 7943", stocks: "Rollz Motion, Rollz Flex, byACRE Ultralight and Overland", url: "mobilitymanawatu.co.nz" },
	]},
	{ region: "Paraparaumu", businesses: [
		{ name: "E-Bikes and Mobility", location: "16 Ihakara Street (rear unit)", phone: "04 298 6626", stocks: null, email: "gaye@ebikesandmobility.co.nz" },
	]},
	{ region: "Lower Hutt", businesses: [
		{ name: "Mobility Centre – Lower Hutt", location: "166 High Street, Hutt Central", phone: "04 577 1188", stocks: "Rollz Motion, byACRE Ultralight and Overland", url: "mobilitycentre.co.nz" },
	]},
	{ region: "Nelson and Blenheim", businesses: [
		{ name: "Access Mobility – Nelson", location: "2 Brock Way, Lower Queen, Richmond 7020", phone: "03 544 7717", stocks: "Rollz Motion, byACRE Ultralight", url: "accessmobility.co.nz" },
		{ name: "Access Mobility – Blenheim", location: "7 Maxwell Road, Blenheim, Marlborough 7210", phone: "03 578 8002", stocks: "Rollz Motion, byACRE Ultralight", url: "accessmobility.co.nz" },
	]},
	{ region: "Christchurch", businesses: [
		{ name: "More Mobility", location: "113 Blenheim Road, Riccarton", phone: "0800 666 222", stocks: "Rollz Motion, Rollz Flex, byACRE Ultralight and Overland", url: "moremobility.co.nz" },
	]},
	{ region: "Ashburton", businesses: [
		{ name: "Heartland Mobility – Ashburton", location: "202 Chalmers Avenue, Hampstead, Ashburton 7700", phone: "03 307 7455", stocks: "byACRE Ultralight only", url: "heartlandmobility.co.nz" },
	]},
	{ region: "Timaru", businesses: [
		{ name: "Heartland Mobility – Timaru", location: "42 Theodosia Street", phone: "03 688 4121", stocks: "byACRE Ultralight, Rollz Motion, Rollz Flex", url: "heartlandmobility.co.nz" },
	]},
	{ region: "Dunedin", businesses: [
		{ name: "LivingWell", location: "10 George Street (cnr Bath Street), Central Dunedin", phone: "03 471 6152", stocks: null, url: "livingwellcentre.nz" },
	]},
	{ region: "Invercargill", businesses: [
		{ name: "Southern Mobility", location: "200 Spey Street", phone: "03 218 1161", stocks: "byACRE Ultralight and Overland, Rollz Motion", url: "southernmobility.co.nz" },
		{ name: "DRC Southland", location: "60 Windsor Street", phone: "03 214 5000", stocks: "byACRE Ultralight only" },
	]},
];

export const POLICIES = {
	shipping: {
		underThreshold: "Orders under $100: $10 delivery.",
		overThreshold: "Orders over $100: delivery from $10 depending on address; walkers typically $60 given size/weight.",
		timeframe: "2–5 working days NZ-wide from dispatch (+2 days for rural); dispatched within 48 hours of payment.",
		warehouse: "Shipped from the Christchurch distribution centre (NZ) / Sydney (AU).",
	},
	returns: {
		window: "7 days' written notice from receiving a walker to start a return.",
		condition: "Must be returned in original packaging, 'as-new' condition (no chips/scratches, unmarked wheels).",
		refundLess: "Full refund less delivery and return freight costs.",
		fundedPurchases: "Refund policy explicitly addresses purchases 'paid for directly by a plan manager' — i.e. some purchases go through third-party disability-support funding, not just direct consumer payment.",
	},
	warranty: {
		Rollz: "2-year manufacturer's warranty on parts (accessories: 1 year). Registerable at rollz.com/registration.",
		byACRE: "Lifetime warranty on the carbon-fibre frame; 2 years on other frame parts (accessories: 1 year). Registerable at byacre.com/register-warranty.",
		Uplivin: "2-year warranty on Trive parts (accessories: 1 year).",
		Saljol: "2-year guarantee against production/material defects (accessories: 1 year).",
		general: "Locomo states it honours all obligations under NZ consumer law; carries spare parts for each walker.",
	},
};

export const BUYING_GUIDE = {
	qaPage: "locomo.co.nz/pages/buying-guides-walkers-and-wheelchairs — sizing Q&A plus separate byACRE and Rollz comparison/spec charts.",
	byacreSizeTool: "locomo.co.nz/pages/what-byacre-is-the-right-size-for-me",
	summary: "A real, existing precedent for a 'which walker is right for me?' interactive tool — currently static comparison charts, not an interactive recommender.",
};

// A representative selection of the 30+ real, first-name-attributed customer
// testimonials shown on the locomo.co.nz homepage — quoted short and verbatim.
export const TESTIMONIALS = [
	{ quote: "Anna at Locomo was a pleasure to deal with; she made the whole process from trial to purchase a breeze.", name: "Anonymous", product: "Rollz Motion" },
	{ quote: "It's super versatile and so light... a new common saying at our place is \"Who's got the Dorica?!\"", name: "Helen", product: "Dorica" },
	{ quote: "I was never comfortable using one until I saw the Nordic Pioneer... I was able to walk for four hours without major pain.", name: "Megan", product: "byACRE Nordic Pioneer" },
	{ quote: "With my new Rollz Motion I am able to walk so much faster... my Apple Watch recognised it as exercise.", name: "Anonymous", product: "Rollz Motion" },
	{ quote: "Thanks to the large wheels, it rides almost effortlessly over bumps... has a smaller turning circle than many other rollators.", name: "Geoff", product: "Saljol Aluminium Rollator" },
	{ quote: "Great Service. Speedy delivery. Love the new walker that collapses like a baby stroller.", name: "Frances", product: "Uplivin Trive" },
	{ quote: "This really has changed my living around for the better... spins on itself for small spaces.", name: "Enid", product: "Saljol Indoor Walker" },
];

// Directly checkable observations used on the "what's visible" screen —
// each one is something anyone can re-verify by visiting the URL.
export const SITE_OBSERVATIONS = {
	blog: { url: "locomo.co.nz/blogs/news", status: "Page exists in the site's sitemap; no visible posts as of 4 Sept 2026 — just related-collection links." },
	stockistLocator: { url: "locomo.co.nz/pages/retailers", status: "Real, detailed stockist directory (region, business, address, phone, products stocked) exists as its own page, separate from product pages." },
	buyingGuide: { url: "locomo.co.nz/pages/buying-guides-walkers-and-wheelchairs", status: "Sizing Q&A and two brand comparison charts exist and are linked from the main nav." },
	robotsTxt: { url: "locomo.co.nz/robots.txt", status: "Shopify storefront; explicitly permits crawling of public product, collection, page, blog and policy content (and names AI-agent catalogue access), while disallowing checkout/account/admin paths." },
	dualMarket: { status: "Operates two markets/storefronts — locomo.co.nz (NZ) and locomo.com.au (AU) — with separate warehouses in Christchurch and Sydney (About page)." },
};

// Screen 3 — "What's visible from the outside": qualitative, sourced signal
// per area. `signal` is one of "visible" | "partial" | "not-visible" and is
// the only thing asserted with confidence — it describes what research
// surfaced, not a judgement of Locomo's strategy or performance. These are
// real observations (not fabricated), so this belongs in the VERIFIED file
// even though it's presented as a structured "scan" rather than a raw fact.
export const VISIBILITY_SCAN = [
	{
		area: "Brand & product presentation",
		signal: "visible",
		evidence: "Rich product photography, colourway detail, 30+ attributed testimonials on the homepage alone, named product-design-award positioning.",
		suggests: "Strong, consistent brand voice and a real base of organic trust signal to work with.",
		question: "How much of that testimonial content is reused beyond the homepage (email, stockist materials, paid social)?",
	},
	{
		area: "Direct-to-consumer experience",
		signal: "visible",
		evidence: "Clear shipping costs/timeframes, a specific 7-day returns process, brand-by-brand warranty terms, NZ + AU stores.",
		suggests: "The DTC policy layer is unusually well documented for a small team.",
		question: null,
	},
	{
		area: "Stockist / retail channel",
		signal: "partial",
		evidence: "A detailed, real stockist directory exists (region, business, address, phone, products stocked) as its own page.",
		suggests: "The directory is thorough, but in the pages sampled it sits separately from product pages rather than surfaced at the point of product research.",
		question: "Would a 'find this near you' prompt on product pages route more research-stage visitors into a stockist relationship?",
	},
	{
		area: "Professional / OT channel",
		signal: "partial",
		evidence: "Locomo's own About page states they work with OTs, physios and other healthcare professionals; the Digitella case study confirms a dedicated product-led creative strategy for that audience.",
		suggests: "The relationship is real and already deliberate — it's the presentation layer for it that isn't obviously separated from the consumer site.",
		question: "Is there (or would it help to have) anything professional-facing — a resource page, referral pad, or clinical spec sheet?",
	},
	{
		area: "Content / education",
		signal: "partial",
		evidence: "A genuine buying guide and two brand comparison charts exist and are linked from the main nav; the blog page exists in the sitemap but shows no visible posts.",
		suggests: "The foundational buying-guide content is there; the blog/content-marketing layer looks dormant.",
		question: null,
	},
	{
		area: "Customer journey visibility",
		signal: "not-visible",
		evidence: "Not something a public website can show from the outside, by definition.",
		suggests: "This is exactly the layer the simulated dashboards on this page stand in for.",
		question: null,
	},
];

// Digitella agency case study (digitella.nz/case-studies/locomo/) — external,
// third-party evidence, not Locomo's own site.
export const EXTERNAL_CASE_STUDY = {
	source: "digitella.nz/case-studies/locomo/",
	summary:
		"Confirms Locomo already runs a deliberate dual-audience marketing strategy: " +
		"lifestyle-led creative for end-users/family/recommenders, and product-led " +
		"creative for occupational therapists, professional advisors and stockists, " +
		"using lookalike audiences built from Locomo's own customer data.",
};
