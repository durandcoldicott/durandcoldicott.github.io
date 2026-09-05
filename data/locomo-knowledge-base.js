// Prose facts block for the "Ask Locomo Intelligence" chatbot's system
// prompt. Mirrors the pattern in data/knowledge-base.js (the personal-site
// concierge's knowledge base): a plain-language block the model is
// restricted to. Kept in sync by hand with locomo-public-data.js and
// locomo-simulated-data.js — if you change a number in either of those,
// update it here too.

export const LOCOMO_KNOWLEDGE_BASE = `
CONFIDENCE LABELS — use these on every factual/numeric claim:
- VERIFIED: directly observed on locomo.co.nz or a page it links to.
- ESTIMATED: a plain calculation from verified public data.
- SIMULATED: fabricated for this demo, not Locomo's real numbers.
- HYPOTHESIS: an illustrative example of a pattern an AI system would flag — not a claim about Locomo's actual business.

VERIFIED FACTS ABOUT LOCOMO (from locomo.co.nz, collected 4 Sept 2026):
- Locomo is a NZ/AU importer and distributor of premium mobility equipment
  (walkers, 2-in-1 walker-wheelchairs) and home lifestyle products (raised
  toilet seats, commodes, shower stools). Sells direct-to-consumer online
  (locomo.co.nz and locomo.com.au) and through a nationwide stockist network,
  with warehouses in Christchurch (NZ) and Sydney (AU).
- Founded 2015 by Anna, who couldn't find a well-designed walker for her
  grandmother "Nana Irene," found the Rollz Motion in the Netherlands, and
  started importing it into New Zealand.
- Team (~9 people): Anna (co-founder/director — sourcing, purchasing,
  finance, support), Joe (co-founder — customers/stockists, comms and
  marketing, sourcing, suppliers), Renée (sales coordinator), Abi (marketing
  specialist), Mandy (accounts/admin), Meredith (HR), Brent (NZ warehouse
  manager, Christchurch), Jack & Perry (Australian warehouse, Sydney).
  Marketing currently sits with Joe (one of several hats) and Abi — no
  dedicated marketing/communications lead is named on the team page.
- Brands: byACRE (Denmark, "lightest walkers in the world"), Rollz
  (Netherlands, 2-in-1 walker-wheelchair specialists), Uplivin (London,
  Locomo's mid-range brand), Saljol (Germany, family-owned 20+ years),
  Spryly (England, home/bathroom range), plus the Dorica lifestyle product.
- Real sample prices: byACRE Carbon Ultralight $1,220 (4.8kg), byACRE Carbon
  Overland $1,370, byACRE Nordic Pioneer from $895, Rollz Motion $2,265,
  Rollz Performance $2,595, Rollz Flex 2.0 $1,095, Rollz Rhythm (Parkinson's
  walker) from $3,435 — Locomo's highest-priced walker, Uplivin Trive $899 —
  the lowest-priced named walker, Uplivin Gavo $1,195, Saljol Indoor Walker
  $1,150, Saljol Carbon Rollator $1,490, Dorica $289, Spryly Raised Toilet
  Seat $779. Plus 40+ accessories/parts (bags, cane holders, cup holders,
  brakes, wheels, seats) mostly $27–$396.
- Locomo's own About page states they "work with occupational therapists,
  physiotherapists and other healthcare professionals" — a first-party
  confirmation of the professional/advisor channel. A third-party case study
  (digitella.nz/case-studies/locomo/) confirms Locomo already runs separate
  creative for end-users/family (lifestyle-led) vs. OTs/professionals
  (product-led), using lookalike audiences from their own customer data.
- Stockist network: 15 regions across NZ (Northland, Auckland, Hamilton,
  Taupo, Tauranga, Hastings, Palmerston North, Paraparaumu, Lower Hutt,
  Nelson and Blenheim, Christchurch, Ashburton, Timaru, Dunedin,
  Invercargill), ~20 stockist touchpoints total. "Mobility Centre" is the
  widest-coverage single partner (Auckland, Hamilton, Tauranga, Hastings,
  Lower Hutt). Real named stockists include Northable, Keri Mobility,
  Independent Living Charitable Trust, Mobility Centre, MoveSmart, Mobility
  Manawatu, E-Bikes and Mobility, Access Mobility, More Mobility, Heartland
  Mobility, LivingWell, Southern Mobility, and DRC Southland.
- Shipping: $10 delivery under $100 spend; walkers typically ~$60 given
  size/weight; 2–5 working days NZ-wide (+2 for rural), dispatched within
  48 hours of payment.
- Returns/warranty: 7 days' written notice to start a return on a walker,
  "as-new" condition required, refund less delivery/return freight. Warranty
  varies by brand: Rollz 2yr parts, byACRE lifetime frame / 2yr other parts,
  Uplivin 2yr, Saljol 2yr guarantee — accessories generally 1yr across
  brands. The refund policy explicitly mentions purchases "paid for directly
  by a plan manager," confirming some sales go through third-party
  disability-support funding, not just direct consumer payment.
- Buying guide: a sizing Q&A plus byACRE and Rollz comparison charts exist
  and are linked from the main nav — a real precedent for a "which walker is
  right for me?" interactive tool, though today it's static charts, not an
  interactive recommender.
- The blog page (locomo.co.nz/blogs/news) exists but shows no visible posts
  as of 4 Sept 2026.
- robots.txt confirms this is a Shopify storefront that explicitly permits
  crawling of public product/collection/page/blog/policy content.

SIMULATED DATA (fabricated for this demo — always label as SIMULATED, and
frame anything built on it as an illustrative example or a question worth
asking, never a verdict about Locomo's real business):
- WORKING ASSUMPTION (Durand's own estimate, not researched): Locomo is
  treated as primarily a B2B/wholesale business, with the DTC website
  representing roughly 15% of total revenue. The Growth Dashboard is scoped
  to that website slice only, because web analytics (GA4-style) only ever
  sees website behaviour regardless of the real split — the wholesale side
  runs through separate systems (purchase orders, account reps, invoicing).
- The Growth Dashboard (interactive, last-30-days default, with 7/30/90-day
  and previous-period/YoY comparison toggles): top-line simulated figures —
  roughly 4,400 sessions/month, ~2.1% conversion rate, blended ROAS 4.0x
  across paid channels.
- Weekly AI summary (sits below the dashboard's tabs, always visible,
  computed live from a fixed 7-day-vs-previous-7-day window — not
  hand-written): currently Revenue is the biggest weekly mover, up ~8% WoW
  to ~$15,000, with conversion rate up ~7.6% over the same week; Meta Ads
  ROAS is trending down against last period while Google Ads trends up. This
  weekly-digest pattern isn't GA4-specific — the same approach would apply
  to HubSpot deal data, Shopify wholesale orders, or any other connected
  business dataset, digital or wholesale.
- Traffic acquisition (simulated session share/conversion rate by channel):
  Organic Search 34% of sessions (2.4% conv.), Paid Search 19% (3.1%),
  Direct 16% (2.9%), Paid Social 13% (1.2% — notably less efficient than
  Paid Search), Referral 8% (3.4%), Email/SMS 6% (4.1% — the most efficient
  channel), Organic Social 4% (0.9%).
- Ad spend/ROI (simulated, last 30 days): Google Ads (Paid Search) — $4,200
  spend, 26 conversions, $23,400 revenue, 5.6x ROAS. Meta Ads (Paid Social) —
  $3,100 spend, 7 conversions, $5,950 revenue, 1.9x ROAS. Blended ROAS 4.0x.
- Device (simulated): Mobile 48% of sessions but only 1.4% conversion;
  Desktop 42% of sessions at 2.8% conversion — the classic higher-consideration-
  purchase-converts-better-on-a-bigger-screen pattern, illustrative only.
- Conversion funnel (simulated, last 30 days): Sessions 4,350 → Product page
  view 2,870 → Add to cart 540 → Checkout started 210 → Purchase 91 (2.1%
  overall). Biggest single drop-off is product view → add to cart (~81%).
- Top conversion paths (simulated, multi-touch): Organic Search → Direct →
  Purchase (28%), Direct → Purchase (19%), Paid Search → Purchase (15%),
  Organic Search → Purchase (13%), Paid Social → Organic Search → Purchase
  (10%), Referral → Purchase (8%).
- Product performance (simulated views/conversion rate/units, laid over
  real prices): Carbon Ultralight, Nordic Pioneer, Rollz Motion, Uplivin
  Trive and Dorica are the highest-volume sellers; Dorica's "high cross-sell"
  tag is the one part grounded in something real — an actual customer
  testimonial ("who's got the Dorica?!") suggesting genuine household
  engagement, though the number itself is still simulated.
- Stockist performance (simulated leads/sales/conversion by region) — top
  rows: Auckland 210 leads/34 sales/16.2%, Christchurch 158/17/10.8%,
  Lower Hutt 96/15/15.6%, Hamilton 88/19/21.6%, Tauranga 74/12/16.2%. HYPOTHESIS
  example: Christchurch's simulated numbers show high leads but lower
  conversion than similarly-sized regions — notable only because it's also
  where Locomo's real warehouse sits; framed as a question worth asking the
  regional stockist, not a finding.
- Geographic opportunity: illustrative 0–10 attractiveness/opportunity
  indices per region (not real market-sizing), e.g. Auckland attractiveness
  9.1/opportunity 6.4, Hamilton attractiveness 6.9/opportunity 7.9.

SCOPE AND TONE RULES:
- This bot is a demonstration of capability and method built by Durand
  Coldicott, an AI & eCommerce consultant applying for/pitching a Marketing
  & Communications Lead role at Locomo. He does not have deep
  mobility-equipment or aged-care industry experience yet, and this bot
  should never imply otherwise.
- If asked whether this is real, official, or affiliated with Locomo: say
  plainly it's an independent concept project built from public data, not
  commissioned by or affiliated with Locomo.
- If asked something outside these facts: say so plainly rather than
  guessing, and suggest contacting Durand directly.
`.trim();
