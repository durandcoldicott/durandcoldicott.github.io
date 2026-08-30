// Source-of-truth facts the AI concierge is allowed to draw on.
// Edit this file to strengthen the concierge — add real project specifics,
// dates, and outcomes here rather than in functions/api/chat.js.

export const KNOWLEDGE_BASE = `
- Name: Durand Coldicott. Based in Nelson, New Zealand (Aotearoa).
- 10+ years of experience in eCommerce and digital strategy.
- Core skillset: managing a highly bespoke eCommerce platform end-to-end —
  this is his primary, deepest area of expertise, distinct from off-the-shelf
  SaaS platform work.
- Secondary but strong: SaaS platforms, specifically Shopify (storefronts)
  and Klaviyo. He is an expert email marketer with deep knowledge of Klaviyo,
  including designing and automating lifecycle flows (welcome series,
  abandoned cart, post-purchase, win-back).
- Recently added: AI-assisted development. He uses AI tools (including
  Claude and GitHub Copilot) to design, build, and ship digital solutions
  himself, at a pace legacy processes/dev sprints/agency retainers can't
  match — without cutting corners on security or maintainability. He works
  comfortably across both bespoke, custom-built systems and established SaaS
  platforms. Tools he uses in this space (per his LinkedIn) include Replit
  (AI-assisted coding), IntelliJ IDEA, Gamma (AI-assisted presentations),
  and HubSpot.
- Other core skills: eCommerce strategy & growth, UX optimisation,
  conversion rate optimisation (CRO), SEO, digital operations management,
  cross-functional team leadership, data-driven problem solving, website
  replatforming & integration.
- Creative side: a competent photographer with experience in both studio
  work and on-location lifestyle shoots, plus video production and brand
  storytelling. He has produced campaign and brand content (including the
  mountain biking photography on this site) for Evo Cycles.
- Career history (from LinkedIn, verified, in order):
  - Website Administrator, R&R Sport, Dunedin, Aug 2011 - Jun 2012 (~11
    months). Product content, sales campaign activation, social/community
    content, with SEO/conversion awareness in day-to-day content work.
  - Ecommerce Manager, R&R Sport, Dunedin, Jun 2012 - Oct 2014 (~2 yrs 5
    months). Led online strategic plan and trading performance for what
    was then NZ's leading outdoor adventure multi-channel retailer.
    Increased online sales by over 500% during his tenure. Managed a team
    of 5 direct reports. Led the merger of two large-scale eCommerce
    platforms during R&R Sport's transition into Torpedo7.
  - Ecommerce Manager & Digital Marketing Specialist, Torpedo7, Hamilton,
    Sep 2014 - Apr 2017 (~2 yrs 8 months). Owned the online strategic plan
    for NZ's largest outdoor adventure retailer (torpedo7.co.nz). Managed
    the website product roadmap end-to-end (schedules, scope, budget)
    across development, marketing, merchandising, and customer service.
    Managed a team of 6 direct reports plus multiple external agencies.
  - Ecommerce Manager, Torpedo7 Group, NZ, Apr 2017 - Nov 2017 (~8
    months). Oversaw eCommerce across Torpedo7, No1 Fitness, and Shotgun
    Supplements during a major organisational restructure and agile
    centralisation initiative.
  - Ecommerce Manager, Evo Cycles, Nelson, Jan 2018 - present (8+ years,
    his current role). Leads digital transformation for NZ's largest
    specialist bicycle retailer (evocycles.co.nz): full website
    re-platform project, Net Promoter Score (NPS) tracking introduced
    across 25+ stores, cross-functional campaigns, online strategic
    planning and development roadmaps.
  - Total: 14+ years of continuous eCommerce management experience since
    2011 (the site's "10+ years" framing is a conservative summary of
    this).
  - Education: Bachelor of Commerce (BCom), Marketing & Management,
    University of Otago, 2009-2011; also studied at the University of
    British Columbia, 2011.
  - He has extensive experience in the outdoor industry (cycling and
    outdoor/adventure retail) built up across these roles.
  - His LinkedIn currently shows an "Open to work" status.
- Web build experience for other businesses: has built websites for
  businesses outside of his main eCommerce role, including Avanti
  Ultrasound (avanti-ultrasound.co.nz, a Hamilton ultrasound clinic),
  built on Squarespace.
- Digital strategy advisory: has advised businesses on digital strategy,
  including Good George Brewing (roughly 2016-2017, so this is dated
  experience, not a recent or ongoing engagement) and the Nelson Tasman
  Disc Golf club.
- Governance experience: was Chair of the Nelson Tasman Disc Golf Club
  board for 3 years, finishing in 2024. This is board/governance
  experience, distinct from his day-to-day digital/eCommerce work.
- The eCommerce platform he manages day-to-day (Evo Cycles,
  evocycles.co.nz) is a custom-built storefront rather than an
  off-the-shelf SaaS cart like Shopify or BigCommerce — publicly visible
  signals point to a bespoke build (not Shopify). Around it, the
  observable marketing/tech stack includes Klaviyo (email/SMS
  automation), Google Tag Manager, Meta Pixel, Google Merchant
  Center/Shopping integration, and Mouseflow for session recording and UX
  analysis. He is not a developer himself — his role is managing and
  directing this stack commercially and operationally, not writing the
  underlying code.
- He describes his broader approach as combining commercial acumen, a
  design eye, and deep technical understanding with hands-on delivery —
  the AI-accelerated development is additive to that experience, not a
  replacement for it.
- Contact: durandcoldicott@gmail.com, LinkedIn at
  linkedin.com/in/durand-coldicott, Instagram at instagram.com/durand.nz.
- Outside of work: hiking, mountain biking, and photography in the outdoors
  around Nelson and the wider South Island.

Anything NOT covered above (specific project names, dates, revenue/growth
figures, client names beyond those listed here, or any commercially
sensitive detail about Evo Cycles' business performance or backend
systems) is not known or not to be discussed — do not guess or invent
detail, and do not speculate about business-sensitive specifics even if
asked directly. Point the visitor to LinkedIn or direct contact instead.
`.trim();
