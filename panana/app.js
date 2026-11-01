/*
 * Panana 🍌 — a te reo Māori study app for our class.
 * (Named for panana, banana: the first word many of us mastered.)
 * Plain JS, no build step. Progress is kept in this browser (localStorage) so
 * it works offline, and synced to your account via /api/reo (worker/reo.js).
 */
(function () {
	"use strict";

	// ---------------------------------------------------------------------
	// Deck
	// ---------------------------------------------------------------------
	var DECK = window.REO_DECK;
	var TOPICS = [];
	var CARDS = [];
	var CARD_BY_ID = {};

	function slug(s) {
		return s.toLowerCase().replace(/_+/g, "x").replace(/[^a-z0-9āēīōū]+/g, "-").replace(/^-|-$/g, "");
	}

	DECK.topics.forEach(function (t) {
		var topic = { id: t.id, mi: t.mi, en: t.en, icon: t.icon, group: t.group || "path", source: t.source || "", term: t.term || 0, cards: [] };
		t.cards.forEach(function (raw) {
			if (raw && typeof raw === "object" && !Array.isArray(raw) && raw.gen) {
				var g = { id: t.id + "-gen-" + raw.gen, mi: raw.mi, en: raw.en, alt: [], note: raw.note || "", lookup: "",
					ex: raw.ex || "", exEn: raw.exEn || "", pic: "", topic: t.id, pattern: true, gen: raw.gen };
				CARD_BY_ID[g.id] = g;
				CARDS.push(g);
				topic.cards.push(g);
				return;
			}
			if (typeof raw === "string" && raw.charAt(0) === "@") {
				// shared with an earlier topic: same card, same progress
				var shared = CARD_BY_ID[raw.slice(1)];
				if (!shared) throw new Error("Unknown shared card " + raw);
				topic.cards.push(shared);
				return;
			}
			var extra = raw[2] || {};
			var card = {
				id: t.id + "-" + slug(raw[0]),
				mi: raw[0],
				en: raw[1],
				alt: extra.alt || [],
				note: extra.note || "",
				lookup: extra.lookup || raw[0].replace(/_+/g, "").replace(/[?!.,]/g, "").replace(/\s+/g, " ").trim(),
				ex: extra.ex || "",
				exEn: extra.exEn || "",
				pic: extra.pic || "",
				topic: t.id,
				pattern: raw[0].indexOf("___") !== -1,
			};
			if (CARD_BY_ID[card.id]) card.id += "-2";
			CARD_BY_ID[card.id] = card;
			CARDS.push(card);
			topic.cards.push(card);
		});
		TOPICS.push(topic);
	});
	// A picture can be a question ("What's this in te reo?") only if no other
	// word in the deck uses the same picture — otherwise two answers would fit.
	var PIC_USES = {};
	CARDS.forEach(function (c) { if (c.pic) PIC_USES[c.pic] = (PIC_USES[c.pic] || 0) + 1; });
	CARDS.forEach(function (c) { c.picQuiz = !!c.pic && PIC_USES[c.pic] === 1 && !c.pattern; });

	var TOPIC_BY_ID = {};
	TOPICS.forEach(function (t) { TOPIC_BY_ID[t.id] = t; });

	function teAkaUrl(card) {
		return "https://maoridictionary.co.nz/search?keywords=" + encodeURIComponent(card.lookup);
	}

	// ---------------------------------------------------------------------
	// Dates (local time, YYYY-MM-DD keys compare correctly as strings)
	// ---------------------------------------------------------------------
	function dateKey(d) {
		return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
	}
	function todayKey() { return dateKey(new Date()); }
	function addDays(key, n) {
		var p = key.split("-").map(Number);
		return dateKey(new Date(p[0], p[1] - 1, p[2] + n));
	}
	function dayOfWeek(key) { // 0 = Monday
		var p = key.split("-").map(Number);
		return (new Date(p[0], p[1] - 1, p[2]).getDay() + 6) % 7;
	}

	// ---------------------------------------------------------------------
	// State
	// ---------------------------------------------------------------------
	var STORE_KEY = "reo.v1"; // becomes "reo.v1.<username>" once signed in

	function defaultState() {
		return {
			version: 1,
			created: todayKey(),
			cards: {},       // id -> { reps, interval, ease, due, lapses, right, wrong, first }
			days: {},        // date -> { reviews, xp, right, wrong, newCount, met }
			xp: 0,
			freezes: 0,
			frozen: [],      // dates covered by a streak freeze
			freezeAwardedOn: "",
			achievements: {}, // id -> date earned
			proverbs: [],    // indexes unlocked
			settings: { goal: 10, newPerDay: 5, hideFromBoard: false },
			stats: { sessions: 0, perfect: 0, typedPerfect: 0, bestStreak: 0, answers: 0, right: 0, weeksWon: 0, wonWeek: "" },
		};
	}

	function load() {
		var s = null;
		try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { s = null; }
		var d = defaultState();
		if (!s || typeof s !== "object") return d;
		// shallow-merge so new fields appear after updates
		Object.keys(d).forEach(function (k) {
			if (s[k] === undefined) s[k] = d[k];
		});
		s.settings = Object.assign({}, d.settings, s.settings);
		s.stats = Object.assign({}, d.stats, s.stats);
		return s;
	}

	var storageOk = true;
	function saveLocal() {
		try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); storageOk = true; }
		catch (e) { storageOk = false; }
	}
	// Every change: save on this device now, sync to the server soon.
	function save() {
		state.savedAt = Date.now();
		saveLocal();
		dirty = true;
		schedulePush();
	}

	var state = defaultState(); // replaced in boot() once we know who's signed in

	function today() {
		var k = todayKey();
		if (!state.days[k]) state.days[k] = { reviews: 0, xp: 0, right: 0, wrong: 0, newCount: 0, met: false };
		return state.days[k];
	}

	// ---------------------------------------------------------------------
	// Streaks & freezes
	// ---------------------------------------------------------------------
	function isCovered(k) {
		return !!(state.days[k] && state.days[k].met) || state.frozen.indexOf(k) !== -1;
	}

	function currentStreak() {
		var k = todayKey();
		if (!isCovered(k)) k = addDays(k, -1);
		var n = 0;
		var guard = 0;
		while (isCovered(k) && guard++ < 5000) {
			if (state.days[k] && state.days[k].met) n++;
			k = addDays(k, -1);
		}
		return n;
	}

	// On open: if days were missed since the last practised day, spend freezes
	// to cover them — but only if there are enough to save the streak.
	var freezeMessage = "";
	function reconcileFreezes() {
		var t = todayKey();
		var k = addDays(t, -1);
		var gap = [];
		while (k >= state.created && !isCovered(k)) {
			gap.push(k);
			k = addDays(k, -1);
		}
		if (k < state.created || gap.length === 0) return;
		if (gap.length <= state.freezes) {
			state.frozen = state.frozen.concat(gap);
			state.freezes -= gap.length;
			freezeMessage = "❄️ A streak freeze covered " + (gap.length === 1 ? "yesterday" : gap.length + " missed days") + ". Your streak is safe!";
			save();
		}
	}

	// ---------------------------------------------------------------------
	// Levels & XP
	// ---------------------------------------------------------------------
	var LEVELS = [
		{ xp: 0, mi: "Pīpī", en: "Fledgling" },
		{ xp: 300, mi: "Tauira", en: "Student" },
		{ xp: 1000, mi: "Kaikōrero", en: "Speaker" },
		{ xp: 2500, mi: "Pūkenga", en: "Skilled one" },
		{ xp: 5000, mi: "Mātanga", en: "Expert" },
		{ xp: 10000, mi: "Kaitiaki o te reo", en: "Guardian of the language" },
	];
	function levelInfo(xp) {
		var i = 0;
		while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++;
		var next = LEVELS[i + 1];
		return {
			n: i + 1,
			lvl: LEVELS[i],
			next: next,
			pct: next ? (xp - LEVELS[i].xp) / (next.xp - LEVELS[i].xp) : 1,
		};
	}

	// ---------------------------------------------------------------------
	// Card status
	// ---------------------------------------------------------------------
	var LEARNED_DAYS = 7;   // "learned" = scheduled at least a week out
	var MASTERED_DAYS = 21;

	function cardStatus(card) {
		var cs = state.cards[card.id];
		if (!cs) return "new";
		if (cs.interval >= MASTERED_DAYS) return "mastered";
		if (cs.interval >= LEARNED_DAYS) return "learned";
		return "learning";
	}
	function counts(cards) {
		var c = { new: 0, learning: 0, learned: 0, mastered: 0, total: cards.length };
		cards.forEach(function (card) { c[cardStatus(card)]++; });
		c.seen = c.total - c.new;
		c.solid = c.learned + c.mastered;
		return c;
	}
	function isDue(card) {
		var cs = state.cards[card.id];
		return !!cs && cs.due <= todayKey();
	}
	function knows(card) { // "got it" — answered right at least twice in a row
		var cs = state.cards[card.id];
		return !!cs && cs.reps >= 2;
	}

	// ---------------------------------------------------------------------
	// Spaced repetition (SM-2 style)
	// grade: 0 again, 1 hard, 2 good, 3 easy
	// ---------------------------------------------------------------------
	function schedule(cardId, grade) {
		var cs = state.cards[cardId];
		if (!cs) {
			cs = state.cards[cardId] = { reps: 0, interval: 0, ease: 2.5, due: todayKey(), lapses: 0, right: 0, wrong: 0, first: todayKey() };
		}
		if (grade === 0) {
			if (cs.reps > 0) cs.lapses++;
			cs.reps = 0;
			cs.interval = 0;
			cs.ease = Math.max(1.3, cs.ease - 0.2);
			cs.due = todayKey();
			cs.wrong++;
			return;
		}
		cs.right++;
		var iv;
		if (grade === 1) {
			iv = Math.max(1, Math.round(cs.interval * 1.2));
			cs.ease = Math.max(1.3, cs.ease - 0.15);
		} else {
			if (cs.reps === 0) iv = 1;
			else if (cs.reps === 1) iv = 3;
			else iv = Math.round(cs.interval * cs.ease);
			if (grade === 3) {
				iv = Math.round(Math.max(iv, 1) * 1.3) + 1;
				cs.ease += 0.15;
			}
		}
		cs.reps++;
		cs.interval = Math.min(iv, 365);
		cs.due = addDays(todayKey(), cs.interval);
	}

	// ---------------------------------------------------------------------
	// Achievements
	// ---------------------------------------------------------------------
	function topicKnown(id) { return TOPIC_BY_ID[id].cards.every(knows); }
	function solidCount() { return CARDS.filter(function (c) { var s = cardStatus(c); return s === "learned" || s === "mastered"; }).length; }

	var ACHIEVEMENTS = [
		{ id: "first", icon: "🌱", mi: "Te Tīmatanga", en: "Finish your first lesson", test: function () { return state.stats.sessions >= 1; } },
		{ id: "panana", icon: "🍌", mi: "Panana!", en: "Learn your first word, like the class did with panana", test: function () { return solidCount() >= 1; } },
		{ id: "streak3", icon: "🔥", mi: "Toru rā", en: "3-day streak", test: function () { return state.stats.bestStreak >= 3; } },
		{ id: "streak7", icon: "🔥", mi: "Kotahi wiki", en: "7-day streak", test: function () { return state.stats.bestStreak >= 7; } },
		{ id: "streak30", icon: "🌕", mi: "Kotahi marama", en: "30-day streak", test: function () { return state.stats.bestStreak >= 30; } },
		{ id: "mihi", icon: "👋", mi: "Kia ora!", en: "Know all the greetings", test: function () { return topicKnown("mihi"); } },
		{ id: "pepeha", icon: "⛰️", mi: "Taku pepeha", en: "Know all the pepeha patterns — now write yours", test: function () { return topicKnown("pepeha"); } },
		{ id: "count", icon: "🔢", mi: "Tatau", en: "Know all the numbers", test: function () { return topicKnown("tau"); } },
		{ id: "days", icon: "📅", mi: "Ngā rā", en: "Know all the days and time words", test: function () { return topicKnown("wa"); } },
		{ id: "kare", icon: "😊", mi: "Kare-ā-roto", en: "Know all the Tākaro! feelings words", test: function () { return topicKnown("kare"); } },
		{ id: "tta", icon: "🔺", mi: "Tau, Tae, Āhua", en: "Know all the Tākaro! numbers, colours and shapes", test: function () { return topicKnown("tta"); } },
		{ id: "bits", icon: "🛋️", mi: "Ngā Taputapu", en: "Know all the Tākaro! Bits + Bobs words", test: function () { return topicKnown("bits"); } },
		{ id: "orig", icon: "🥝", mi: "Kupu Taketake", en: "Know all the Tākaro! Original words", test: function () { return topicKnown("orig"); } },
		{ id: "wild", icon: "🐋", mi: "Te Taiao", en: "Know all the Tākaro! Into the Wild words", test: function () { return topicKnown("wild"); } },
		{ id: "rerenga", icon: "💬", mi: "Kaikōrero", en: "Answer 25 sentence questions correctly", test: function () { return (state.stats.sentences || 0) >= 25; } },
		{ id: "term1", icon: "🎓", mi: "Wāhanga tuatahi", en: "Know every Term 1 revision topic", test: function () { return ["tikanga", "pehea", "hua", "tau1", "ahua"].every(topicKnown); } },
		{ id: "term2", icon: "🎓", mi: "Wāhanga tuarua", en: "Know every Term 2 revision topic", test: function () { return ["mihi2", "tangata", "tuahua", "tuwahi"].every(topicKnown); } },
		{ id: "ahua", icon: "🔷", mi: "Āhua, Tae, Tatau", en: "Know all the course words and patterns for shapes, colours and counting", test: function () { return topicKnown("ahua"); } },
		{ id: "words25", icon: "📗", mi: "Rua tekau mā rima", en: "25 words learned", test: function () { return solidCount() >= 25; } },
		{ id: "words100", icon: "📚", mi: "Kotahi rau", en: "100 words learned", test: function () { return solidCount() >= 100; } },
		{ id: "perfect", icon: "💎", mi: "Tika rawa", en: "A perfect lesson (10+ answers, no mistakes)", test: function () { return state.stats.perfect >= 1; } },
		{ id: "typed", icon: "⌨️", mi: "Ringa tohunga", en: "Type 10 answers perfectly, macrons and all", test: function () { return state.stats.typedPerfect >= 10; } },
		{ id: "xp1000", icon: "⭐", mi: "Kotahi mano", en: "Earn 1,000 XP", test: function () { return state.xp >= 1000; } },
		{ id: "champion", icon: "🏆", mi: "Toa o te wiki", en: "Finish a week top of your group", test: function () { return state.stats.weeksWon >= 1; } },
		{ id: "proverbs7", icon: "📜", mi: "Whakataukī", en: "Collect 7 whakataukī", test: function () { return state.proverbs.length >= 7; } },
	];

	function checkAchievements() {
		var earned = [];
		ACHIEVEMENTS.forEach(function (a) {
			if (!state.achievements[a.id] && a.test()) {
				state.achievements[a.id] = todayKey();
				earned.push(a);
			}
		});
		return earned;
	}

	// ---------------------------------------------------------------------
	// Proverb of the day
	// ---------------------------------------------------------------------
	function proverbIndex(key) {
		var p = key.split("-").map(Number);
		var dayNum = Math.floor(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000);
		return dayNum % DECK.proverbs.length;
	}

	// ---------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------
	function esc(s) {
		return String(s).replace(/[&<>"']/g, function (c) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
		});
	}
	function blanks(s) { return esc(s).replace(/_{3,}/g, '<span class="blank">___</span>'); }
	function shuffle(a) {
		for (var i = a.length - 1; i > 0; i--) {
			var j = Math.floor(Math.random() * (i + 1));
			var t = a[i]; a[i] = a[j]; a[j] = t;
		}
		return a;
	}
	function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
	function normalise(s) {
		return s.toLowerCase().replace(/[?!.,;:"“”'‘’]/g, "").replace(/\s+/g, " ").trim();
	}
	function stripMacrons(s) {
		return s.replace(/ā/g, "a").replace(/ē/g, "e").replace(/ī/g, "i").replace(/ō/g, "o").replace(/ū/g, "u");
	}
	function ago(t) {
		var m = Math.round((Date.now() - t) / 60000);
		return m < 1 ? "just now" : m < 60 ? m + " min ago" : Math.round(m / 60) + " h ago";
	}
	function plural(n, one, many) { return n + " " + (n === 1 ? one : many || one + "s"); }

	// ---------------------------------------------------------------------
	// Rerenga: sentence patterns. Each review builds a fresh sentence from
	// words the learner already knows (answered right at least once), so the
	// sentences grow with their vocabulary. Grammar stays correct because
	// every frame only swaps words of one kind into a fixed structure.
	// ---------------------------------------------------------------------
	function known(id) { var cs = state.cards[id]; return !!cs && cs.right > 0; }

	var NUM_WORDS = ["", "tahi", "rua", "toru", "whā", "rima", "ono", "whitu", "waru", "iwa", "tekau"];
	var NUM_EN = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
		"eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
	var NUM_IDS = ["", "tau-tahi", "tau-rua", "tau-toru", "tau-whā", "tau-rima", "tau-ono", "tau-whitu", "tau-waru", "tau-iwa", "tau-tekau"];
	for (var nn = 1; nn <= 9; nn++) { NUM_WORDS[10 + nn] = "tekau mā " + NUM_WORDS[nn]; NUM_IDS[10 + nn] = "tau-tekau-mā-" + NUM_WORDS[nn]; }
	NUM_WORDS[20] = "rua tekau"; NUM_IDS[20] = "tau-rua-tekau";
	function knownNumbers() { var out = []; for (var n = 1; n <= 20; n++) if (CARD_BY_ID[NUM_IDS[n]] && known(NUM_IDS[n])) out.push(n); return out; }

	var COLOUR_IDS = ["tae-whero", "tae-karaka", "tae-kōwhai", "tae-kākāriki", "tae-kikorangi", "tta-waiporoporo", "tae-parauri", "tae-pango", "tae-mā", "tae-māwhero"];
	// [picture, shape card, colour card, shape in English]
	var COLOUR_SHAPES = [];
	(function () {
		var circles = ["🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "🟤", "⚫", "⚪"];
		var squares = ["🟥", "🟧", "🟨", "🟩", "🟦", "🟪", "🟫", "⬛", "⬜"];
		var hearts = ["❤️", "🧡", "💛", "💚", "💙", "💜", "🤎", "🖤", "🤍"];
		var cols = COLOUR_IDS.slice(0, 9);
		cols.forEach(function (c, i) {
			COLOUR_SHAPES.push([circles[i], "ahua-porowhita", c, "circle"]);
			COLOUR_SHAPES.push([squares[i], "ahua-tapawhā", c, "square"]);
			COLOUR_SHAPES.push([hearts[i], "tta-manawa", c, "heart"]);
		});
		COLOUR_SHAPES.push(["🔶", "ahua-taimana", "tae-karaka", "diamond"], ["🔷", "ahua-taimana", "tae-kikorangi", "diamond"],
			["🔺", "tta-tapatoru", "tae-whero", "triangle"], ["⭐", "tta-whetū", "tae-kōwhai", "star"]);
	})();

	// Words that work in "He ___ tēnei" / "E hia ngā ___": concrete things with a unique picture.
	var THING_TOPICS = { tinana: 1, kai: 1, wahi: 1, tta: 1, bits: 1, orig: 1, wild: 1, ahua: 1, whanau: 1, hua: 1, tuwahi: 1 };
	var NOT_THINGS = { "inu": 1, "pakipaki": 1, "hongi": 1, "iti": 1, "āhua": 1, "Aotearoa": 1, "waiporoporo": 1, "mangu": 1, "kōrero": 1,
		"tēnei": 1, "tēnā": 1, "tērā": 1, "runga": 1, "raro": 1, "roto": 1, "waho": 1, "mua": 1, "muri": 1, "waenganui": 1,
		"taha matau": 1, "taha mauī": 1 };
	function knownThings(noPeople) {
		return CARDS.filter(function (c) {
			return THING_TOPICS[c.topic] && c.picQuiz && !c.gen && !NOT_THINGS[c.mi] && c.mi.indexOf("?") === -1 &&
				!(noPeople && c.topic === "whanau") && known(c.id);
		});
	}
	var PEOPLE = [
		["whanau-tama", "tama", "tama", "boys"], ["whanau-tamaiti", "tamaiti", "tamariki", "children"],
		["whanau-pēpi", "pēpi", "pēpi", "babies"], ["whanau-kuia", "kuia", "kuia", "elderly women"],
		["whanau-koroua", "koroua", "koroua", "elderly men"], ["whanau-wahine", "wahine", "wāhine", "women"],
		["whanau-tāne", "tāne", "tāne", "men"], ["whanau-tangata", "tangata", "tāngata", "people"],
		["whanau-tamāhine", "tamāhine", "tamāhine", "daughters"], ["tangata-kaumātua", "kaumātua", "kaumātua", "elders"],
		["tangata-pākeke", "pākeke", "pākeke", "adults"], ["tangata-kōtiro", "kōtiro", "kōtiro", "girls"],
		["tangata-rangatahi", "rangatahi", "rangatahi", "teenagers"]];

	function firstGloss(en) { return en.split(" / ")[0]; }

	// Paku mihi lines: [card id, Māori with ___, English with ___]
	var INTRO_LINES = [
		["mihi2-nō-x-ōku-tūpuna", "Nō ___ ōku tūpuna.", "My ancestors are from ___."],
		["pepeha-nō-x-ahau", "Nō ___ ahau.", "I am from ___."],
		["mihi2-i-whānau-mai-au-i-x", "I whānau mai au i ___.", "I was born in ___."],
		["mihi2-i-tipu-ake-au-i-x", "I tipu ake au i ___.", "I grew up in ___."],
		["mihi2-kei-x-au-e-noho-ana", "Kei ___ au e noho ana.", "I live in ___."]];
	var PLACE_IDS = ["mihi2-whakatū", "mihi2-ōmaio", "mihi2-waimeha", "mihi2-waimārama", "orig-aotearoa"];

	// Describing words and things they sensibly describe (He [word] te/ngā [thing]).
	var DESCRIBE = {
		"tuahua-reka": ["kai-panana", "kai-āporo", "hua-rōpere", "hua-pītiti", "hua-merengi", "hua-tiere", "hua-kerepi", "orig-tiakarete", "kai-huka", "kai-kūmara", "orig-ārani"],
		"tuahua-kawa": ["hua-rēmana"],
		"tuahua-haunga": ["bits-tōkena", "bits-wharepaku", "kai-ika"],
		"tuahua-newanewa": ["wild-ngeru", "orig-hipi", "wild-rāpeti", "bits-moenga", "bits-hōpa", "wild-kurī"],
		"tuahua-ātaahua": ["tta-whetū", "wild-puāwai-kōwhai", "wild-puāwai-pōhutukawa", "wahi-maunga", "wahi-moana", "orig-tātahi"],
		"tuahua-nui": ["wahi-whare", "wahi-maunga", "wild-tohorā", "orig-kau", "orig-taraka", "bits-pahi", "tuahua-arewhana"],
		"ahua-iti": ["orig-pī", "hua-tiere", "wild-noke", "wild-pūpū-rangi", "orig-kī"],
		"tuahua-roa": ["orig-tuna", "wahi-awa", "tinana-makawe", "bits-tereina", "wild-noke"],
		"tuahua-teitei": ["wahi-maunga", "wild-ponga", "tuwahi-rākau"],
		"tuahua-taumaha": ["ahua-pouaka", "orig-taraka", "orig-kau", "bits-piana", "tuahua-arewhana"],
		"tuahua-koi": ["orig-naihi", "bits-pene-rākau", "wild-mangō"],
		"tuahua-hōhonu": ["wahi-moana", "wahi-awa", "wahi-roto"],
		"tuahua-māmā": ["bits-pepa"] };
	var NO_PLURAL = { "wahi-moana": 1, "wahi-awa": 1, "wahi-roto": 1, "kai-huka": 1, "orig-tiakarete": 1, "tinana-makawe": 1 };
	function describePairs() {
		var out = [];
		Object.keys(DESCRIBE).forEach(function (adj) {
			if (!CARD_BY_ID[adj] || !known(adj)) return;
			DESCRIBE[adj].forEach(function (n) { if (CARD_BY_ID[n] && known(n)) out.push([adj, n]); });
		});
		return out;
	}

	// Tūwahi: locative words and how they join to the place
	var LOCS = [
		["tuwahi-runga", "runga", "i", "on"], ["tuwahi-raro", "raro", "i", "under"], ["tuwahi-roto", "roto", "i", "inside"],
		["tuwahi-waho", "waho", "i", "outside"], ["tuwahi-mua", "mua", "i", "in front of"], ["tuwahi-muri", "muri", "i", "behind"],
		["tuwahi-taha-matau", "te taha matau", "o", "to the right of"], ["tuwahi-taha-mauī", "te taha mauī", "o", "to the left of"]];
	var WHERE_THINGS = ["wild-ngeru", "wild-kurī", "orig-pukapuka", "orig-pene", "bits-kapu", "tuwahi-pōro", "kai-āporo", "kai-hēki", "orig-pōtae", "tuwahi-manu", "orig-paihikara"];
	var WHERE_PLACES = ["orig-tūru", "bits-tēpu", "ahua-pouaka", "tuwahi-pēke", "bits-moenga", "bits-hōpa", "tuwahi-kāpata", "tuwahi-rūma", "wahi-whare", "tuwahi-rākau"];
	// only pair each place word with places where it makes sense
	var LOC_PLACES = {
		"tuwahi-runga": ["orig-tūru", "bits-tēpu", "bits-moenga", "bits-hōpa", "ahua-pouaka", "tuwahi-rākau"],
		"tuwahi-raro": ["orig-tūru", "bits-tēpu", "bits-moenga", "tuwahi-rākau", "bits-hōpa"],
		"tuwahi-roto": ["ahua-pouaka", "tuwahi-pēke", "tuwahi-kāpata", "tuwahi-rūma", "wahi-whare"],
		"tuwahi-waho": ["tuwahi-rūma", "wahi-whare"],
		"tuwahi-mua": ["wahi-whare", "orig-tūru", "bits-tēpu", "tuwahi-rākau", "bits-hōpa", "ahua-pouaka"],
		"tuwahi-muri": ["wahi-whare", "orig-tūru", "bits-tēpu", "tuwahi-rākau", "bits-hōpa", "ahua-pouaka"],
		"tuwahi-taha-matau": ["orig-tūru", "bits-tēpu", "ahua-pouaka", "bits-moenga", "bits-hōpa", "wahi-whare"],
		"tuwahi-taha-mauī": ["orig-tūru", "bits-tēpu", "ahua-pouaka", "bits-moenga", "bits-hōpa", "wahi-whare"] };
	function locOptions() {
		return LOCS.filter(function (l) { return known(l[0]) && knownIds(LOC_PLACES[l[0]]).length; });
	}
	function knownIds(ids) { return ids.filter(function (id) { return CARD_BY_ID[id] && known(id); }); }
	function feelings() { return CARDS.filter(function (c) { return c.topic === "kare" && c.picQuiz && known(c.id); }); }
	var SWATCHES = { "tae-whero": "🟥", "tae-karaka": "🟧", "tae-kōwhai": "🟨", "tae-kākāriki": "🟩", "tae-kikorangi": "🟦",
		"tta-waiporoporo": "🟪", "tae-parauri": "🟫", "tae-pango": "⬛", "tae-mā": "⬜" };
	var SWATCH_IDS = Object.keys(SWATCHES);
	var DEMS = [
		{ w: "tēnei", pl: "ēnei", cue: "👇 here, by me", en: "this", enPl: "these", where: "by me" },
		{ w: "tēnā", pl: "ēnā", cue: "👉 there, by you", en: "that", enPl: "those", where: "by you" },
		{ w: "tērā", pl: "ērā", cue: "🔭 over there", en: "that", enPl: "those", where: "over there" }];
	function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
	function words(sentence) { return sentence.replace(/[.?!]$/, "").split(" "); }

	// Counting answers follow the course's rule: 1 → Kotahi te …, 2–9 → E/Toko + number ngā …, 10 → Tekau ngā …
	function countAnswer(n, sg, pl, people) {
		if (n === 1) return "Kotahi te " + sg + ".";
		if (n >= 10) return cap(NUM_WORDS[n]) + " ngā " + pl + ".";
		return (people ? "Toko" + NUM_WORDS[n] : "E " + NUM_WORDS[n]) + " ngā " + pl + ".";
	}

	function genAvailable(card) {
		var nums = knownNumbers().length;
		switch (card.gen) {
			case "whatIsThis": return { ok: knownThings().length >= 4, need: "Learn 4 words with pictures (e.g. in Kupu) first." };
			case "colourOfShape":
				var colours = COLOUR_IDS.filter(known).length;
				var shapes = COLOUR_SHAPES.some(function (x) { return known(x[1]) && known(x[2]); });
				return { ok: colours >= 3 && shapes, need: "Learn 3 colours and a shape (porowhita, tapawhā, manawa…) first." };
			case "eHia": return { ok: nums >= 3 && knownThings(true).length >= 2, need: "Learn 3 numbers and a few objects first." };
			case "feeling": return { ok: feelings().length >= 3, need: "Learn 3 Kare-ā-roto (feelings) words first." };
			case "demonstrative": return { ok: knownThings(true).length >= 3, need: "Learn 3 words with pictures (e.g. fruit) first." };
			case "list": return { ok: knownThings(true).length >= 6, need: "Learn 6 words with pictures (e.g. fruit) first." };
			case "coloursOf":
				return { ok: SWATCH_IDS.filter(known).length >= 3 && knownThings(true).length >= 2, need: "Learn 3 colours and 2 objects first." };
			case "intro":
				return { ok: INTRO_LINES.filter(function (l) { return known(l[0]); }).length >= 2 && knownIds(PLACE_IDS).length >= 2,
					need: "Learn 2 paku mihi lines and 2 place names first." };
			case "describe":
				return { ok: describePairs().length >= 2, need: "Learn some describing words and things they describe (e.g. reka + fruit) first." };
			case "where":
				return { ok: locOptions().length >= 2 && knownIds(WHERE_THINGS).length >= 1 && knownIds(WHERE_PLACES).length >= 2,
					need: "Learn 2 place words (runga, raro…), a thing and 2 places (tūru, tēpu…) first." };
			case "tokohia":
				var ppl = PEOPLE.filter(function (x) { return known(x[0]); }).length;
				return { ok: nums >= 3 && ppl >= 2, need: "Learn 3 numbers and 2 people words (Te Whānau) first." };
		}
		return { ok: false, need: "" };
	}

	function optionSet(correct, wrongs) {
		var opts = [correct];
		shuffle(wrongs).forEach(function (w) { if (opts.length < 4 && opts.indexOf(w) === -1) opts.push(w); });
		return shuffle(opts);
	}
	function tileSet(correct, wrongs) {
		var t = words(correct);
		// one distractor tile, taken from a wrong answer, that isn't in the right sentence
		var extra = null;
		shuffle(wrongs.slice()).some(function (w) {
			return words(w).some(function (x) { if (t.indexOf(x) === -1) { extra = x; return true; } return false; });
		});
		return extra ? t.concat([extra]) : t;
	}

	function generate(card) {
		if (!genAvailable(card).ok) return null;
		var q = null;
		if (card.gen === "whatIsThis") {
			var things = knownThings(), c = pick(things);
			var ans = "He " + c.mi + " tēnei.";
			var wrong = shuffle(things.filter(function (x) { return x.id !== c.id && x.en !== c.en; })).slice(0, 5).map(function (x) { return "He " + x.mi + " tēnei."; });
			wrong.push("He tēnei " + c.mi + ".");
			q = { visual: c.pic, ask: "He aha tēnei?", answer: ans, wrong: wrong, en: "What is this? This is: " + firstGloss(c.en) + "." };
		} else if (card.gen === "colourOfShape") {
			var combos = COLOUR_SHAPES.filter(function (x) { return known(x[1]) && known(x[2]); });
			var x = pick(combos), shape = CARD_BY_ID[x[1]], colour = CARD_BY_ID[x[2]];
			var ansC = "He " + colour.mi + " te tae o te " + shape.mi + ".";
			var others = shuffle(COLOUR_IDS.filter(function (id) { return id !== x[2]; }))
				.sort(function (a, b) { return (known(b) ? 1 : 0) - (known(a) ? 1 : 0); }).slice(0, 4)
				.map(function (id) { return "He " + CARD_BY_ID[id].mi + " te tae o te " + shape.mi + "."; });
			others.push("He " + shape.mi + " te tae o te " + colour.mi + ".");
			q = { visual: x[0], ask: "He aha te tae o te " + shape.mi + "?", answer: ansC, wrong: others,
				en: "What colour is the " + x[3] + "? The " + x[3] + " is " + firstGloss(colour.en) + "." };
		} else if (card.gen === "eHia" || card.gen === "tokohia") {
			var people = card.gen === "tokohia";
			var nums = knownNumbers(), n = pick(nums);
			var sg, pl, pic, enNoun;
			if (people) {
				var who = pick(PEOPLE.filter(function (p) { return known(p[0]); }));
				sg = who[1]; pl = who[2]; pic = CARD_BY_ID[who[0]].pic; enNoun = who[3];
			} else {
				var th = pick(knownThings(true));
				sg = pl = th.mi; pic = th.pic; enNoun = firstGloss(th.en);
			}
			var ansN = countAnswer(n, sg, pl, people);
			var wrongN = [];
			// other numbers…
			var near = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].filter(function (m) { return m !== n && Math.abs(m - n) <= (n > 10 ? 4 : 9); });
			shuffle(near).slice(0, 3).forEach(function (m) { wrongN.push(countAnswer(m, sg, pl, people)); });
			if (n > 10) wrongN.unshift("E " + NUM_WORDS[n] + " ngā " + pl + ".", (people ? "Toko" : "E ") + NUM_WORDS[n - 10] + " ngā " + pl + ".");
			// …and the classic mix-up: the other counter (E rua for people, Toko- for things)
			if (n >= 2 && n <= 9) wrongN.unshift(countAnswer(n, sg, pl, !people));
			var visual = n <= 10 ? new Array(n + 1).join(pic) : pic + pic + pic + " … × " + n;
			q = { visual: visual, many: true, ask: (people ? "Tokohia" : "E hia") + " ngā " + pl + "?", answer: ansN, wrong: wrongN,
				en: "How many " + (people ? enNoun : "(" + enNoun + ")") + "? " + (n === 1 ? "There is one." : "There are " + NUM_EN[n] + ".") };
		}
		if (card.gen === "feeling") {
			var fs = feelings(), f = pick(fs);
			var wrongF = shuffle(fs.filter(function (x) { return x.id !== f.id; })).slice(0, 4).map(function (x) { return "Kei te " + x.mi + " ahau."; });
			wrongF.push("Kei te ahau " + f.mi + ".", "Kei " + f.mi + " te ahau.");
			q = { visual: f.pic, ask: "Kei te pēhea koe?", answer: "Kei te " + f.mi + " ahau.", wrong: wrongF, en: "How are you? I am " + firstGloss(f.en) + "." };
		} else if (card.gen === "demonstrative") {
			var thingsD = knownThings(true), td = pick(thingsD), dem = pick(DEMS), plural = Math.random() < 0.4;
			var w = plural ? dem.pl : dem.w;
			var ansD = "He " + td.mi + " " + w + ".";
			var wrongD = [];
			DEMS.forEach(function (d) { var x = plural ? d.pl : d.w; if (x !== w) wrongD.push("He " + td.mi + " " + x + "."); });
			wrongD.push("He " + td.mi + " " + (plural ? dem.w : dem.pl) + ".");
			shuffle(thingsD.filter(function (x) { return x.id !== td.id && x.en !== td.en; })).slice(0, 2).forEach(function (x) { wrongD.push("He " + x.mi + " " + w + "."); });
			q = { visual: plural ? td.pic + td.pic + (Math.random() < 0.5 ? td.pic : "") : td.pic, many: plural, cue: dem.cue + (plural ? " · more than one" : ""),
				ask: "He aha " + w + "?", answer: ansD, wrong: wrongD,
				en: "What " + (plural ? "are " + dem.enPl : "is " + dem.en) + " (" + dem.where + ")? " + cap(plural ? dem.enPl + " are: " : dem.en + " is: ") + firstGloss(td.en) + "." };
		} else if (card.gen === "list") {
			var pool = shuffle(knownThings(true).filter(function (x, i, arr) { return arr.findIndex(function (y) { return y.en === x.en; }) === i; }));
			var k = Math.min(pool.length - 3, Math.random() < 0.5 ? 3 : 4), items = pool.slice(0, k);
			var lastMany = Math.random() < 0.5;
			var head = items.slice(0, -1).map(function (x) { return "he " + x.mi; });
			var last = items[k - 1];
			var build = function (heads, art, lastWord) { var t = heads.join(", ") + " me " + art + " " + lastWord + "."; return cap(t); };
			var ansL = build(head, lastMany ? "ngā" : "te", last.mi);
			// wrong options are genuinely wrong: the te/ngā flipped for the last item, or a thing that isn't in the picture
			var wrongL = [build(head, lastMany ? "te" : "ngā", last.mi)];
			var others = pool.slice(k);
			if (others.length) {
				wrongL.push(build(head, lastMany ? "ngā" : "te", others[0].mi));
				var swapIdx = Math.floor(Math.random() * (k - 1));
				wrongL.push(build(head.map(function (h, i) { return i === swapIdx ? "he " + (others[1] || others[0]).mi : h; }), lastMany ? "ngā" : "te", last.mi));
				if (others[2]) wrongL.push(build(head.map(function (h, i) { return i === (swapIdx + 1) % (k - 1) ? "he " + others[2].mi : h; }), lastMany ? "te" : "ngā", last.mi));
			}
			var vis = items.map(function (x, i) { var many = i === k - 1 ? lastMany : Math.random() < 0.4; return '<span class="grp">' + (many ? x.pic + x.pic : x.pic) + "</span>"; }).join("");
			var enL = items.slice(0, -1).map(function (x) { return firstGloss(x.en); }).join(", ") + " and " + (lastMany ? "the " + firstGloss(last.en) + " (more than one)" : "the " + firstGloss(last.en));
			q = { visual: vis, many: true, ask: "Name them all", answer: ansL, wrong: wrongL, en: enL + "." };
		} else if (card.gen === "coloursOf") {
			var objs = knownThings(true), ob = pick(objs);
			var cols = shuffle(SWATCH_IDS.filter(known)), c1 = CARD_BY_ID[cols[0]], c2 = CARD_BY_ID[cols[1]];
			var tail = " ngā tae o te " + ob.mi + ".";
			var ansM = "He " + c1.mi + ", he " + c2.mi + tail;
			var spare = shuffle(SWATCH_IDS.filter(function (id) { return id !== cols[0] && id !== cols[1]; })).map(function (id) { return CARD_BY_ID[id].mi; });
			var wrongM = ["He " + spare[0] + ", he " + c2.mi + tail, "He " + c1.mi + ", he " + spare[1] + tail,
				"He " + c1.mi + ", he " + c2.mi + " te tae o te " + ob.mi + ".", "He " + c1.mi + " " + c2.mi + tail];
			q = { visual: ob.pic + "  " + SWATCHES[cols[0]] + SWATCHES[cols[1]], ask: "He aha ngā tae o te " + ob.mi + "?", answer: ansM, wrong: wrongM,
				en: "What are the colours of the " + firstGloss(ob.en) + "? " + cap(firstGloss(c1.en)) + " and " + firstGloss(c2.en) + "." };
		}
		if (card.gen === "intro") {
			var lines = INTRO_LINES.filter(function (l) { return known(l[0]); });
			var places = knownIds(PLACE_IDS).map(function (id) { return CARD_BY_ID[id]; });
			var line = pick(lines), place = pick(places);
			var fill = function (tpl, pl) { return tpl.replace("___", pl.mi); };
			var placeEn = place.mi === "Aotearoa" ? "Aotearoa" : place.mi + " (" + place.en + ")";
			var wrongI = INTRO_LINES.filter(function (l) { return l !== line; }).map(function (l) { return fill(l[1], place); });
			places.filter(function (p2) { return p2.id !== place.id; }).forEach(function (p2) { wrongI.push(fill(line[1], p2)); });
			q = { visual: "📍", ask: line[2].replace("___", placeEn), answer: fill(line[1], place), wrong: wrongI,
				en: line[2].replace("___", placeEn) };
		} else if (card.gen === "describe") {
			var pr = pick(describePairs()), adj = CARD_BY_ID[pr[0]], noun = CARD_BY_ID[pr[1]];
			var many = !NO_PLURAL[noun.id] && Math.random() < 0.45;
			var art = many ? "ngā" : "te";
			var ansDs = "He " + adj.mi + " " + art + " " + noun.mi + ".";
			var otherAdj = shuffle(Object.keys(DESCRIBE).filter(function (a) { return a !== adj.id && CARD_BY_ID[a] && DESCRIBE[a].indexOf(noun.id) === -1; }))
				.sort(function (a, b) { return (known(b) ? 1 : 0) - (known(a) ? 1 : 0); });
			var wrongDs = ["He " + adj.mi + " " + (many ? "te" : "ngā") + " " + noun.mi + ".", "He " + noun.mi + " " + art + " " + adj.mi + "."];
			otherAdj.slice(0, 3).forEach(function (a) { wrongDs.push("He " + CARD_BY_ID[a].mi + " " + art + " " + noun.mi + "."); });
			var pic = noun.pic || "❓";
			q = { visual: many ? pic + pic + (Math.random() < 0.5 ? pic : "") : pic, many: many, cue: firstGloss(adj.en) + (many ? " · more than one" : ""),
				ask: "Describe " + (many ? "them" : "it") + " in te reo", answer: ansDs, wrong: wrongDs,
				en: (many ? "The " + firstGloss(noun.en) + " (more than one) are " : "The " + firstGloss(noun.en) + " is ") + firstGloss(adj.en) + "." };
		} else if (card.gen === "where") {
			var loc = pick(locOptions());
			var thing = CARD_BY_ID[pick(knownIds(WHERE_THINGS))];
			var placesW = knownIds(LOC_PLACES[loc[0]]), plc = CARD_BY_ID[pick(placesW)];
			var sayW = function (l, place, th) { return "Kei " + l[1] + " " + l[2] + " te " + place.mi + " te " + th.mi + "."; };
			var ansW = sayW(loc, plc, thing);
			// the course also teaches: Kei runga te pukapuka i te tēpu
			var altW = "Kei " + loc[1] + " te " + thing.mi + " " + loc[2] + " te " + plc.mi + ".";
			var wrongW = [];
			shuffle(LOCS.filter(function (l) { return l !== loc; })).sort(function (a, b) { return (known(b[0]) ? 1 : 0) - (known(a[0]) ? 1 : 0); })
				.slice(0, 2).forEach(function (l) { wrongW.push(sayW(l, plc, thing)); });
			wrongW.push("Kei " + loc[1] + " " + (loc[2] === "i" ? "o" : "i") + " te " + plc.mi + " te " + thing.mi + ".");
			var otherPlace = shuffle(placesW.filter(function (id) { return id !== plc.id; }))[0];
			if (otherPlace) wrongW.push(sayW(loc, CARD_BY_ID[otherPlace], thing));
			q = { visual: (thing.pic || "") + " " + (plc.pic || ""), ask: "Kei hea te " + thing.mi + "?",
				cue: "(" + loc[3] + " the " + firstGloss(plc.en) + ")", answer: ansW, alts: loc[2] === "i" ? [altW] : [], wrong: wrongW,
				en: "Where is the " + firstGloss(thing.en) + "? It's " + loc[3] + " the " + firstGloss(plc.en) + "." };
		}
		if (!q) return null;
		q.options = optionSet(q.answer, q.wrong);
		q.tiles = tileSet(q.answer, q.wrong);
		return q;
	}

	// ---------------------------------------------------------------------
	// Session building
	// ---------------------------------------------------------------------
	var MAX_REVIEWS = 20;

	function dueCards(topicId) {
		return CARDS.filter(function (c) { return isDue(c) && (!topicId || c.topic === topicId); })
			.sort(function (a, b) { return state.cards[a.id].due < state.cards[b.id].due ? -1 : 1; });
	}
	function newCards(topicId) {
		var list = [];
		var topics = topicId ? [TOPIC_BY_ID[topicId]] : TOPICS;
		topics.forEach(function (t) {
			t.cards.forEach(function (c) { if (!state.cards[c.id] && (!c.gen || genAvailable(c).ok) && list.indexOf(c) === -1) list.push(c); });
		});
		return list;
	}
	function newAllowance() {
		return Math.max(0, state.settings.newPerDay - today().newCount);
	}

	function buildQueue(mode, topicId) {
		var reviews = [];
		var fresh = [];
		if (mode === "practice") {
			var seen = CARDS.filter(function (c) { return state.cards[c.id] && (!topicId || c.topic === topicId); });
			// favour cards you get wrong
			seen.sort(function (a, b) {
				var sa = state.cards[a.id], sb = state.cards[b.id];
				return (sb.wrong - sb.right * 0.3) - (sa.wrong - sa.right * 0.3) + (Math.random() - 0.5) * 2;
			});
			return shuffle(seen.slice(0, 10)).map(function (c) { return { id: c.id, kind: "practice" }; });
		}
		reviews = dueCards(topicId).slice(0, MAX_REVIEWS);
		var nNew = mode === "more" ? 5 : newAllowance();
		if (mode === "topic") nNew = Math.max(nNew, 3);
		fresh = newCards(topicId).slice(0, nNew);

		var q = shuffle(reviews.map(function (c) { return { id: c.id, kind: "review" }; }));
		// spread new words through the reviews
		var step = fresh.length ? Math.max(1, Math.floor(q.length / fresh.length)) : 0;
		fresh.forEach(function (c, i) {
			var pos = Math.min(q.length, i * (step + 1) + (q.length ? 1 : 0));
			q.splice(pos, 0, { id: c.id, kind: "intro" });
		});
		return q;
	}

	function pickExercise(card, item) {
		if (item.kind === "intro") return "intro";
		if (card.gen) return "gen";
		if (item.fresh) return "mc_mi";
		if (item.drill) return "mc_en";
		var cs = state.cards[card.id] || { reps: 0 };
		var opts = ["mc_mi", "mc_en"];
		if (card.picQuiz) opts.push("pic", "pic");
		if (cs.reps >= 1 || item.kind === "practice") opts.push("flash");
		if ((cs.reps >= 2 || item.kind === "practice") && !card.pattern) opts.push("type", "type");
		return pick(opts);
	}

	function distractors(card, field) {
		// never offer a synonym (same English, e.g. pango/mangu) or a homograph (same
		// Māori, e.g. karaka = clock / orange) as a wrong answer — both would be right
		var ok = function (c) { return c.id !== card.id && !c.gen && c.en !== card.en && c.mi !== card.mi && c.pattern === card.pattern; };
		var pool = TOPIC_BY_ID[card.topic].cards.filter(ok);
		if (pool.length < 3) {
			pool = pool.concat(CARDS.filter(function (c) { return c.topic !== card.topic && ok(c); }));
		}
		var out = [];
		shuffle(pool.slice()).forEach(function (c) {
			if (out.length < 3 && out.indexOf(c[field]) === -1) out.push(c[field]);
		});
		return out;
	}

	// ---------------------------------------------------------------------
	// Session state
	// ---------------------------------------------------------------------
	var session = null;

	function startSession(mode, topicId) {
		var q = buildQueue(mode, topicId);
		if (!q.length) {
			toast(mode === "topic" ? "Nothing due in this topic — try extra practice." : "All caught up!");
			return;
		}
		session = {
			mode: mode,
			topicId: topicId || null,
			queue: q,
			pos: 0,
			total: q.length,
			done: 0,
			xp: 0,
			right: 0,
			wrong: 0,
			goalWasMet: today().met,
			goalJustMet: false,
			newWords: 0,
			current: null,
		};
		nextItem();
	}

	function nextItem() {
		if (session.pos >= session.queue.length) return finishSession();
		var item = session.queue[session.pos];
		var card = CARD_BY_ID[item.id];
		if (!card) { session.pos++; return nextItem(); }
		var ex = pickExercise(card, item);
		var cur = { item: item, card: card, ex: ex, answered: false };
		if (ex === "mc_mi") {
			cur.options = shuffle([card.en].concat(distractors(card, "en")));
			cur.answer = card.en;
		} else if (ex === "mc_en" || ex === "pic") {
			cur.options = shuffle([card.mi].concat(distractors(card, "mi")));
			cur.answer = card.mi;
		} else if (ex === "gen") {
			cur.q = generate(card);
			if (!cur.q) { session.pos++; return nextItem(); } // not enough known words yet
			cur.tiles = Math.random() < 0.45;
			if (cur.tiles) { cur.bank = shuffle(cur.q.tiles.slice()); cur.built = []; }
		}
		session.current = cur;
		render();
		if (ex === "type") {
			var input = document.getElementById("type-input");
			if (input) input.focus();
		}
	}

	function award(xp) {
		session.xp += xp;
		state.xp += xp;
		today().xp += xp;
	}

	// record a graded answer
	function record(correct, grade, xp) {
		var cur = session.current;
		var d = today();
		if (cur.item.kind !== "practice") schedule(cur.card.id, grade);
		d.reviews++;
		state.stats.answers++;
		if (correct) { d.right++; session.right++; state.stats.right++; }
		else { d.wrong++; session.wrong++; }
		award(xp);
		session.done++;

		if (!correct) {
			// try again a little later in this lesson
			var retry = { id: cur.card.id, kind: cur.item.kind === "practice" ? "practice" : "review", retry: true };
			session.queue.splice(Math.min(session.queue.length, session.pos + 4), 0, retry);
			session.total++;
		}

		if (!d.met && d.reviews >= state.settings.goal) {
			d.met = true;
			session.goalJustMet = true;
			award(20);
			var s = currentStreak();
			if (s > state.stats.bestStreak) state.stats.bestStreak = s;
			if (s > 0 && s % 7 === 0 && state.freezeAwardedOn !== todayKey() && state.freezes < 2) {
				state.freezes++;
				state.freezeAwardedOn = todayKey();
				session.earnedFreeze = true;
			}
			var pi = proverbIndex(todayKey());
			if (state.proverbs.indexOf(pi) === -1) state.proverbs.push(pi);
		}
		cur.answered = true;
		cur.correct = correct;
		save();
	}

	function finishIntro() {
		var cur = session.current;
		var d = today();
		d.newCount++;
		session.newWords++;
		award(5);
		schedule(cur.card.id, 0); // creates the card state, due today
		state.cards[cur.card.id].wrong = 0;
		// quiz it a couple of items later (Māori → English, scheduled), then
		// drill it once more the other way near the end (practice only, so
		// the same-day repeat doesn't over-advance the schedule)
		session.queue.splice(Math.min(session.queue.length, session.pos + 3), 0, { id: cur.card.id, kind: "review", fresh: true });
		session.queue.push({ id: cur.card.id, kind: "practice", drill: true });
		session.total += 2;
		save();
		advance();
	}

	function advance() {
		session.pos++;
		nextItem();
	}

	function finishSession() {
		state.stats.sessions++;
		if (session.wrong === 0 && session.done >= 10) state.stats.perfect++;
		var s = currentStreak();
		if (s > state.stats.bestStreak) state.stats.bestStreak = s;
		session.newAchievements = checkAchievements();
		session.finished = true;
		save();
		pushNow();
		render();
	}

	function quitSession() {
		if (session && session.done > 0) {
			state.stats.sessions++;
			checkAchievements();
			save();
			pushNow();
		}
		session = null;
		render();
	}

	// ---------------------------------------------------------------------
	// UI: navigation
	// ---------------------------------------------------------------------
	var view = "home";
	var topicView = null;
	var root = document.getElementById("app");

	function toast(msg) {
		var el = document.createElement("div");
		el.className = "toast";
		el.textContent = msg;
		document.body.appendChild(el);
		setTimeout(function () { el.classList.add("show"); }, 10);
		setTimeout(function () { el.classList.remove("show"); setTimeout(function () { el.remove(); }, 300); }, 3200);
	}

	function render(keepScroll) {
		if (session) {
			root.innerHTML = session.finished ? renderSummary() : renderSession();
			document.body.classList.add("in-session");
		} else {
			document.body.classList.remove("in-session");
			var html = "";
			if (view === "home") html = renderHome();
			else if (view === "topics") html = topicView ? renderTopic(topicView) : renderTopics();
			else if (view === "ropu") html = renderRopu();
			else if (view === "progress") html = renderProgress();
			else if (view === "more") html = renderMore();
			root.innerHTML = html + renderTabs();
		}
		if (!keepScroll) window.scrollTo(0, 0);
		// leave room under the content for the pinned feedback panel
		var fb = root.querySelector(".feedback"), body = root.querySelector(".s-body");
		if (fb && body) body.style.paddingBottom = (fb.offsetHeight + 16) + "px";
	}

	function renderTabs() {
		var tabs = [
			["home", "🏠", "Kāinga"],
			["topics", "🗺️", "Kaupapa"],
			["ropu", "🏅", "Rōpū"],
			["progress", "🏆", "Ahunga"],
			["more", "⚙️", "Ētahi atu"],
		];
		return '<nav class="tabs">' + tabs.map(function (t) {
			return '<button class="tab' + (view === t[0] ? " active" : "") + '" data-action="tab" data-tab="' + t[0] + '"><span class="tab-icon">' + t[1] + '</span><span class="tab-label">' + t[2] + "</span></button>";
		}).join("") + "</nav>";
	}

	// ---------------------------------------------------------------------
	// UI: home
	// ---------------------------------------------------------------------
	// Full Māori day names, Monday first (the deck teaches these in Te Wā).
	var DAY_NAMES = ["Rāhina", "Rātū", "Rāapa", "Rāpare", "Rāmere", "Rāhoroi", "Rātapu"];
	var DAY_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

	function ring(pct, label, sub) {
		var r = 52, c = 2 * Math.PI * r;
		var off = c * (1 - Math.min(1, pct));
		return '<svg class="ring" viewBox="0 0 120 120" aria-hidden="true">' +
			'<circle cx="60" cy="60" r="' + r + '" class="ring-bg"/>' +
			'<circle cx="60" cy="60" r="' + r + '" class="ring-fg" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/>' +
			'<text x="60" y="58" class="ring-label">' + label + "</text>" +
			'<text x="60" y="78" class="ring-sub">' + sub + "</text></svg>";
	}

	function weekRow() {
		var t = todayKey();
		var start = addDays(t, -dayOfWeek(t));
		var out = "";
		for (var i = 0; i < 7; i++) {
			var k = addDays(start, i);
			var cls = "day";
			var mark = "";
			if (state.days[k] && state.days[k].met) { cls += " met"; mark = "✓"; }
			else if (state.frozen.indexOf(k) !== -1) { cls += " frozen"; mark = "❄"; }
			if (k === t) cls += " today";
			if (k > t) cls += " future";
			out += '<div class="' + cls + '" title="' + DAY_NAMES[i] + " — " + DAY_EN[i] + '"><span class="day-dot">' + mark + '</span><span class="day-name">' + DAY_NAMES[i] + "</span></div>";
		}
		return '<div class="week">' + out + "</div>";
	}

	function renderHome() {
		var d = today();
		var streak = currentStreak();
		var lv = levelInfo(state.xp);
		var due = dueCards().length;
		var nNew = Math.min(newAllowance(), newCards().length);
		var c = counts(CARDS);
		var goal = state.settings.goal;
		var pi = proverbIndex(todayKey());
		var prov = DECK.proverbs[pi];

		var html = '<main class="page">';
		html += '<header class="home-head"><div><div class="app-name">Panana 🍌</div><h1>Kia ora!</h1><p class="muted">' + greetingLine(d, streak) + "</p></div>" +
			'<div class="level-chip" title="Level ' + lv.n + '"><span>' + esc(lv.lvl.mi) + "</span><small>" + state.xp + " XP</small></div></header>";

		if (freezeMessage) {
			html += '<div class="banner">' + esc(freezeMessage) + "</div>";
			freezeMessage = "";
		}
		if (offline) html += '<div class="banner warn">Offline — your progress is saved on this device and will sync when you reconnect.</div>';
		if (!storageOk) html += '<div class="banner warn">This browser isn\'t saving progress (private mode?). Export a backup from More.</div>';

		html += '<section class="card streak-card">' +
			'<div class="streak-top"><div class="streak-num' + (streak ? " lit" : "") + '">🔥 <strong>' + streak + "</strong> " + (streak === 1 ? "day" : "days") + "</div>" +
			'<div class="freezes" title="Streak freezes: earn one every 7 days in a row (max 2)">' + (state.freezes ? "❄️".repeat(state.freezes) : '<span class="muted">no freezes</span>') + "</div></div>" +
			weekRow() + "</section>";

		html += '<section class="card goal-card">' + ring(d.reviews / goal, Math.min(d.reviews, goal) + "/" + goal, d.met ? "done!" : "today") +
			'<div class="goal-side">';
		if (due || nNew) {
			html += "<h2>" + (d.met ? "Keep going?" : "Today's lesson") + "</h2>" +
				'<p class="muted">' + plural(due, "review") + " · " + plural(nNew, "new word") + "</p>" +
				'<button class="btn primary big" data-action="start" data-mode="daily">' + (d.reviews ? "Continue" : "Start") + "</button>";
		} else {
			html += "<h2>All caught up 🎉</h2><p class=\"muted\">Nothing due. Want more?</p>" +
				'<div class="btn-col"><button class="btn primary" data-action="start" data-mode="practice">Extra practice</button>' +
				(newCards().length ? '<button class="btn" data-action="start" data-mode="more">Learn 5 more words</button>' : "") + "</div>";
		}
		html += "</div></section>";

		html += standing();

		html += '<section class="card proverb ' + (d.met ? "open" : "locked") + '"><div class="eyebrow">Whakataukī o te rā</div>';
		if (d.met) {
			html += '<p class="proverb-mi">' + esc(prov[0]) + '</p><p class="proverb-en">' + esc(prov[1]) + "</p>";
		} else {
			html += '<p class="muted">🔒 Reach today\'s goal to reveal the proverb of the day.</p>';
		}
		html += "</section>";

		html += '<section class="stat-row">' +
			stat(c.seen, "introduced") + stat(c.solid, "learned") + stat(c.mastered, "mastered") + "</section>";

		html += "</main>";
		return html;
	}

	function greetingLine(d, streak) {
		if (d.met) return "Goal done for today. Ka pai!";
		if (streak > 0) return "Keep your " + streak + "-day streak alive.";
		return "A few minutes a day adds up.";
	}

	function stat(n, label) {
		return '<div class="stat"><strong>' + n + "</strong><span>" + label + "</span></div>";
	}

	// ---------------------------------------------------------------------
	// UI: topics
	// ---------------------------------------------------------------------
	function topicNode(t, i) {
		var c = counts(t.cards);
		var pct = c.total ? (c.seen + c.solid) / (2 * c.total) : 0;
		var done = c.solid === c.total;
		return '<button class="node' + (done ? " done" : c.seen ? " started" : "") + (i % 2 ? " right" : "") + '" data-action="topic" data-topic="' + t.id + '">' +
			'<span class="node-ring" style="--p:' + Math.round(pct * 100) + '"><span class="node-icon">' + t.icon + "</span></span>" +
			'<span class="node-text"><strong>' + esc(t.mi) + "</strong><span>" + esc(t.en) + "</span>" +
			'<small>' + c.seen + "/" + c.total + " introduced · " + c.solid + " learned</small></span></button>";
	}

	function renderTopics() {
		var path = TOPICS.filter(function (t) { return t.group === "path"; });
		var kupu = TOPICS.filter(function (t) { return t.group === "kupu"; });
		var course = TOPICS.filter(function (t) { return t.group === "course"; });
		var html = '<main class="page"><h1>Kaupapa <span class="muted small">Topics</span></h1>';
		if (course.length) {
			html += '<h2 class="section-title first">Akoranga <span class="muted small">Our course · NMIT Te Reo Level 1</span></h2>' +
				'<p class="muted small">Revision of what we\'ve been taught, term by term. Sentences unlock as you learn the words they use.</p>';
			var TERM_NAMES = ["", "Wāhanga tuatahi · Term 1", "Wāhanga tuarua · Term 2", "Wāhanga tuatoru · Term 3", "Wāhanga tuawhā · Term 4"];
			[1, 2, 3, 4].forEach(function (term) {
				var ts = course.filter(function (t) { return t.term === term; });
				if (!ts.length) return;
				html += '<h3 class="term-title">' + TERM_NAMES[term] + '</h3><div class="path">';
				ts.forEach(function (t, i) { html += topicNode(t, i); });
				html += "</div>";
			});
		}
		html += '<h2 class="section-title">Learning path</h2>' +
			'<p class="muted small">New words come from the first unfinished topic, or tap a topic to focus on it.</p><div class="path">';
		path.forEach(function (t, i) { html += topicNode(t, i); });
		html += "</div>";
		if (kupu.length) {
			html += '<h2 class="section-title">Kupu <span class="muted small">Common words · from Tākaro!</span></h2>' +
				'<p class="muted small">Word sets from the Tākaro! game\'s reference cards. Tap one and choose "Study this topic".</p><div class="path">';
			kupu.forEach(function (t, i) { html += topicNode(t, i); });
			html += "</div>";
		}
		html += "</main>";
		return html;
	}

	function renderTopic(id) {
		var t = TOPIC_BY_ID[id];
		var c = counts(t.cards);
		var due = dueCards(id).length;
		var fresh = newCards(id).length;
		var html = '<main class="page"><button class="back" data-action="back">‹ Topics</button>' +
			'<h1>' + t.icon + " " + esc(t.mi) + ' <span class="muted small">' + esc(t.en) + "</span></h1>" +
			(t.source ? '<p class="source small">Source: ' + esc(t.source) + "</p>" : "") +
			'<p class="muted">' + c.seen + "/" + c.total + " introduced · " + c.solid + " learned · " + c.mastered + " mastered</p>" +
			'<div class="btn-row">' +
			((due || fresh) ? '<button class="btn primary" data-action="start" data-mode="topic" data-topic="' + id + '">Study this topic</button>' : "") +
			(c.seen ? '<button class="btn" data-action="start" data-mode="practice" data-topic="' + id + '">Practise</button>' : "") +
			"</div><ul class=\"word-list\">";
		var hasPics = t.cards.some(function (c) { return c.pic; });
		t.cards.forEach(function (card) {
			var st = cardStatus(card);
			var lock = card.gen ? genAvailable(card) : null;
			if (lock && !lock.ok && st === "new") {
				html += '<li class="word locked"><span class="status-dot"></span>' + (hasPics ? '<span class="word-pic">🔒</span>' : "") +
					'<div class="word-main"><span class="word-mi muted">' + blanks(card.mi) + '</span><span class="word-en">' + esc(lock.need) + "</span></div></li>";
				return;
			}
			html += '<li class="word ' + st + '"><span class="status-dot" title="' + st + '"></span>' +
				(card.pic ? '<span class="word-pic">' + card.pic + "</span>" : card.gen ? '<span class="word-pic">💬</span>' : hasPics ? '<span class="word-pic"></span>' : "") +
				'<div class="word-main"><span class="word-mi">' + (st === "new" ? '<span class="muted">' + blanks(card.mi) + "</span>" : blanks(card.mi)) + "</span>" +
				'<span class="word-en">' + blanks(card.en) + "</span></div>" +
				(card.gen ? "" : '<a class="teaka" href="' + teAkaUrl(card) + '" target="_blank" rel="noopener" title="Look up in Te Aka">Te Aka ↗</a>') + "</li>";
		});
		html += '</ul><p class="legend"><span class="status-dot new"></span>new <span class="status-dot learning"></span>learning <span class="status-dot learned"></span>learned <span class="status-dot mastered"></span>mastered</p></main>';
		return html;
	}

	// ---------------------------------------------------------------------
	// UI: progress
	// ---------------------------------------------------------------------
	function renderProgress() {
		var lv = levelInfo(state.xp);
		var c = counts(CARDS);
		var acc = state.stats.answers ? Math.round(100 * state.stats.right / state.stats.answers) : 0;
		var html = '<main class="page"><h1>Ahunga <span class="muted small">Progress</span></h1>';
		html += '<section class="card level-card"><div class="eyebrow">Level ' + lv.n + "</div><h2>" + esc(lv.lvl.mi) + ' <span class="muted small">' + esc(lv.lvl.en) + "</span></h2>" +
			'<div class="bar"><span style="width:' + Math.round(lv.pct * 100) + '%"></span></div>' +
			'<p class="muted small">' + (lv.next ? state.xp + " / " + lv.next.xp + " XP to " + esc(lv.next.mi) + " (" + esc(lv.next.en) + ")" : state.xp + " XP — top level reached. Tino pai!") + "</p></section>";
		html += '<section class="stat-grid">' +
			stat(currentStreak(), "day streak") + stat(state.stats.bestStreak, "best streak") +
			stat(c.solid, "words learned") + stat(c.mastered, "mastered") +
			stat(state.stats.answers, "answers") + stat(acc + "%", "accuracy") + "</section>";

		html += '<h2 class="section-title">Ngā tohu <span class="muted small">Achievements</span></h2><div class="badges">';
		ACHIEVEMENTS.forEach(function (a) {
			var got = state.achievements[a.id];
			html += '<div class="badge' + (got ? " got" : "") + '"><span class="badge-icon">' + (got ? a.icon : "🔒") + "</span><strong>" + esc(a.mi) + "</strong><span>" + esc(a.en) + "</span></div>";
		});
		html += "</div>";

		html += '<h2 class="section-title">Whakataukī collected <span class="muted small">' + state.proverbs.length + "/" + DECK.proverbs.length + "</span></h2>";
		if (!state.proverbs.length) html += '<p class="muted">Hit your daily goal to collect one each day.</p>';
		html += '<div class="proverb-list">';
		state.proverbs.slice().reverse().forEach(function (i) {
			var p = DECK.proverbs[i];
			if (p) html += '<div class="card proverb open"><p class="proverb-mi">' + esc(p[0]) + '</p><p class="proverb-en">' + esc(p[1]) + "</p></div>";
		});
		html += "</div></main>";
		return html;
	}

	// ---------------------------------------------------------------------
	// UI: more (settings, guide, sources)
	// ---------------------------------------------------------------------
	function choice(name, values, current, suffix) {
		return '<div class="choices">' + values.map(function (v) {
			return '<button class="chip' + (v === current ? " active" : "") + '" data-action="setting" data-name="' + name + '" data-value="' + v + '">' + v + (suffix || "") + "</button>";
		}).join("") + "</div>";
	}

	function renderMore() {
		var s = state.settings;
		var synced = offline ? "Offline — will sync when you reconnect" : lastSync ? "Synced " + ago(lastSync) : "Not synced yet";
		var account = '<section class="card"><h2>Kia ora, ' + esc(user ? user.name : "") + '</h2>' +
			'<p class="muted small">Signed in as @' + esc(user ? user.username : "") + " · " + synced + "</p>" +
			'<div class="toggle-row"><span>Show me on the group leaderboard</span><button class="chip' + (state.settings.hideFromBoard ? "" : " active") + '" data-action="toggle-board">' + (state.settings.hideFromBoard ? "Hidden" : "Shown") + "</button></div>" +
			'<details><summary>Change password</summary><form id="password-form" class="mini-form">' +
			'<input name="current" type="password" autocomplete="current-password" placeholder="Current password" required>' +
			'<input name="next" type="password" autocomplete="new-password" minlength="8" placeholder="New password (8+ characters)" required>' +
			'<button class="btn" type="submit">Change password</button></form></details>' +
			'<button class="btn" data-action="logout">Sign out</button></section>';
		if (user && user.admin) account += renderAdmin();
		return '<main class="page"><h1>Ētahi atu <span class="muted small">More</span></h1>' + account +
			'<section class="card"><h2>Daily goal</h2><p class="muted small">Answers per day to keep your streak.</p>' + choice("goal", [5, 10, 20, 30], s.goal) +
			'<h2>New words per day</h2>' + choice("newPerDay", [3, 5, 8, 12], s.newPerDay) + "</section>" +

			'<section class="card"><h2>Pronunciation</h2><table class="pron">' +
			"<tr><td><b>a</b></td><td>like the u in <i>cut</i>; <b>ā</b> like <i>car</i></td></tr>" +
			"<tr><td><b>e</b></td><td>like <i>egg</i>; <b>ē</b> held longer</td></tr>" +
			"<tr><td><b>i</b></td><td>like the ee in <i>eat</i></td></tr>" +
			"<tr><td><b>o</b></td><td>like <i>or</i>, short; <b>ō</b> held longer</td></tr>" +
			"<tr><td><b>u</b></td><td>like the oo in <i>zoo</i></td></tr>" +
			"<tr><td><b>wh</b></td><td>usually like <i>f</i> (varies by region)</td></tr>" +
			"<tr><td><b>ng</b></td><td>like the ng in <i>singer</i>, also at the start of a word</td></tr>" +
			"<tr><td><b>r</b></td><td>a soft tap of the tongue, close to the d in <i>ladder</i></td></tr></table>" +
			'<p class="muted small">Every syllable ends in a vowel: wha-nau, Ao-te-a-ro-a. A macron (ā) means hold the vowel longer — it can change the meaning.</p>' +
			'<p class="muted small">For audio, tap "Te Aka ↗" on any word to hear it spoken in Te Aka Māori Dictionary.</p></section>' +

			'<section class="card"><h2>Your progress</h2><p class="muted small">Your progress syncs to your account automatically. You can also keep a backup file.</p>' +
			'<div class="btn-row"><button class="btn" data-action="export">Export backup</button>' +
			'<label class="btn">Import backup<input type="file" accept="application/json,.json" id="import-file" hidden></label></div>' +
			'<button class="btn danger" data-action="reset">Reset all progress</button></section>' +

			'<section class="card"><h2>About the words</h2><p class="small">This deck is a hand-curated draft, not machine translation. Each word links to <a href="https://maoridictionary.co.nz" target="_blank" rel="noopener">Te Aka Māori Dictionary</a>, the authority. If something here disagrees with Te Aka, trust Te Aka. Spelling follows <a href="https://www.tetaurawhiri.govt.nz" target="_blank" rel="noopener">Te Taura Whiri i te Reo Māori</a> (Māori Language Commission) conventions.</p>' +
			'<p class="muted small">' + CARDS.length + " cards · " + TOPICS.length + " topics · " + DECK.proverbs.length + " whakataukī</p></section>" +
			'<p class="install-hint muted small">Tip: use "Add to Home Screen" in your phone\'s browser menu to install Panana like an app. It keeps working offline and syncs when you\'re back online.</p>' +
			"</main>";
	}

	// ---------------------------------------------------------------------
	// UI: session
	// ---------------------------------------------------------------------
	function sessionHeader() {
		var pct = session.total ? session.pos / session.total : 0;
		return '<header class="s-head"><button class="icon-btn" data-action="quit" aria-label="End lesson">✕</button>' +
			'<div class="bar"><span style="width:' + Math.round(pct * 100) + '%"></span></div>' +
			'<span class="s-xp">+' + session.xp + " XP</span></header>";
	}

	function detailBlock(card) {
		var html = '<div class="detail">';
		if (card.pic && !(session && session.current && session.current.ex === "intro")) html += '<div class="pic small-pic" aria-hidden="true">' + card.pic + "</div>";
		if (card.note) html += '<p class="note">' + esc(card.note) + "</p>";
		if (card.ex) html += '<p class="ex"><b>' + esc(card.ex) + "</b><br><span class=\"muted\">" + esc(card.exEn) + "</span></p>";
		if (!card.gen) html += '<a class="teaka" href="' + teAkaUrl(card) + '" target="_blank" rel="noopener">Look up “' + esc(card.lookup) + '” in Te Aka ↗</a>';
		html += "</div>";
		return html;
	}

	function renderSession() {
		var cur = session.current;
		var card = cur.card;
		var topic = TOPIC_BY_ID[card.topic];
		var html = sessionHeader() + '<main class="s-body">';
		var tag = '<div class="s-tag">' + topic.icon + " " + esc(topic.mi) + (cur.item.retry ? ' · <span class="retry">try again</span>' : "") + "</div>";

		if (cur.ex === "intro") {
			html += tag + '<div class="s-kicker new-kicker">✨ New word</div>' +
				(card.pic ? '<div class="pic" aria-hidden="true">' + card.pic + "</div>" : "") +
				'<div class="big-word">' + blanks(card.mi) + "</div>" +
				'<div class="big-en">' + blanks(card.en) + "</div>" + detailBlock(card) +
				'<div class="s-foot"><button class="btn primary big" data-action="intro-ok">Got it</button></div>';
		} else if (cur.ex === "mc_mi" || cur.ex === "mc_en" || cur.ex === "pic") {
			var prompt = cur.ex === "mc_mi" ? card.mi : card.en;
			var kicker = cur.ex === "mc_mi" ? "What does this mean?" : cur.ex === "pic" ? "What's this in te reo?" : "How do you say this in te reo?";
			html += tag + '<div class="s-kicker">' + kicker + "</div>" +
				(cur.ex === "pic" ? '<div class="pic quiz-pic" role="img" aria-label="picture">' + card.pic + "</div>" :
					'<div class="big-word' + (cur.ex === "mc_en" ? " en" : "") + '">' + blanks(prompt) + "</div>") +
				'<div class="options">';
			cur.options.forEach(function (o, i) {
				var cls = "option";
				if (cur.answered) {
					if (o === cur.answer) cls += " correct";
					else if (o === cur.chosen) cls += " wrong";
					else cls += " dim";
				}
				html += '<button class="' + cls + '" data-action="mc" data-i="' + i + '"' + (cur.answered ? " disabled" : "") + ">" + blanks(o) + "</button>";
			});
			html += "</div>";
			if (cur.answered) html += feedback(cur);
		} else if (cur.ex === "flash") {
			html += tag + '<div class="s-kicker">Do you remember?</div>' +
				'<div class="big-word">' + blanks(card.mi) + "</div>";
			if (!cur.revealed) {
				html += '<div class="s-foot"><button class="btn primary big" data-action="reveal">Show answer</button></div>';
			} else if (!cur.answered) {
				html += '<div class="big-en">' + blanks(card.en) + "</div>" + detailBlock(card) +
					'<div class="s-foot"><p class="muted small center">How well did you know it?</p><div class="grades">' +
					'<button class="grade g0" data-action="grade" data-g="0">Forgot</button>' +
					'<button class="grade g1" data-action="grade" data-g="1">Hard</button>' +
					'<button class="grade g2" data-action="grade" data-g="2">Good</button>' +
					'<button class="grade g3" data-action="grade" data-g="3">Easy</button></div></div>';
			}
		} else if (cur.ex === "gen") {
			var q = cur.q;
			html += tag + '<div class="s-kicker">' + (cur.tiles ? "Build the answer" : "Choose the answer") + "</div>" +
				'<div class="gen-visual' + (q.many ? " many" : "") + '" aria-hidden="true">' + q.visual + "</div>" +
				(q.cue ? '<div class="gen-cue">' + esc(q.cue) + "</div>" : "") +
				'<div class="gen-ask">' + esc(q.ask) + "</div>";
			if (!cur.tiles) {
				html += '<div class="options">';
				q.options.forEach(function (o, i) {
					var cls = "option";
					if (cur.answered) cls += o === q.answer ? " correct" : o === cur.chosen ? " wrong" : " dim";
					html += '<button class="' + cls + '" data-action="gmc" data-i="' + i + '"' + (cur.answered ? " disabled" : "") + ">" + esc(o) + "</button>";
				});
				html += "</div>";
			} else {
				html += '<div class="tile-line' + (cur.answered ? (cur.correct ? " good" : " bad") : "") + '">' +
					(cur.built.length ? cur.built.map(function (bi, k) {
						return '<button class="tile placed" data-action="untile" data-k="' + k + '"' + (cur.answered ? " disabled" : "") + ">" + esc(cur.bank[bi]) + "</button>";
					}).join("") : '<span class="muted small">Tap the words in order</span>') + "</div>" +
					(cur.answered ? "" : '<div class="tile-bank">' + cur.bank.map(function (w, i) {
						var used = cur.built.indexOf(i) !== -1;
						return '<button class="tile' + (used ? " used" : "") + '" data-action="tile" data-i="' + i + '"' + (used ? " disabled" : "") + ">" + esc(w) + "</button>";
					}).join("") + "</div>");
				if (!cur.answered) html += '<div class="s-foot"><button class="btn primary big" data-action="tiles-check"' + (cur.built.length ? "" : " disabled") + ">Check</button></div>";
			}
			if (cur.answered) html += genFeedback(cur);
		} else if (cur.ex === "type") {
			html += tag + '<div class="s-kicker">Type it in te reo</div>' +
				'<div class="big-word en">' + blanks(card.en) + "</div>" +
				'<form class="type-form" data-action="type-submit"><input id="type-input" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" lang="mi" placeholder="Type your answer"' +
				(cur.answered ? ' disabled value="' + esc(cur.typed) + '"' : "") + ">" +
				(cur.answered ? "" : '<div class="macrons">' + ["ā", "ē", "ī", "ō", "ū"].map(function (m) { return '<button type="button" class="chip" data-action="macron" data-m="' + m + '">' + m + "</button>"; }).join("") + "</div>" +
					'<div class="s-foot"><button class="btn primary big" type="submit">Check</button><button type="button" class="btn ghost" data-action="type-skip">I don\'t know</button></div>') +
				"</form>";
			if (cur.answered) html += feedback(cur);
		}
		html += "</main>";
		return html;
	}

	// Answer feedback is a panel pinned to the bottom of the screen, so
	// Continue is always in reach without scrolling.
	function genFeedback(cur) {
		var q = cur.q;
		var msg = cur.correct ? (cur.praise || (cur.praise = pick(["Ka pai!", "Tika!", "Tino pai!", "Ka rawe!"]))) : "Not quite. The answer:";
		return '<div class="feedback ' + (cur.correct ? "good" : "bad") + '" role="status">' +
			'<div class="fb-top"><div class="fb-msg">' + msg + "</div></div>" +
			'<div class="fb-answer"><span><b>' + esc(q.ask) + " " + esc(q.answer) + "</b></span></div>" +
			'<p class="fb-note">' + esc(q.en) + "</p>" +
			(q.alts && q.alts.length ? '<p class="fb-note">Also correct: ' + esc(q.alts[0]) + "</p>" : "") +
			(cur.correct ? "" : '<p class="fb-note">Pattern: ' + esc(cur.card.mi) + "</p>") +
			'<button class="btn primary big" data-action="next">Continue</button></div>';
	}

	function feedback(cur) {
		var card = cur.card;
		var msg;
		if (cur.correct && cur.macronSlip) msg = "Almost! Watch the macrons:";
		else if (cur.correct) msg = cur.praise || (cur.praise = pick(["Ka pai!", "Tika!", "Tino pai!", "Ka rawe!", "Koia kei a koe!"]));
		else msg = "Not quite. The answer:";
		return '<div class="feedback ' + (cur.correct ? (cur.macronSlip ? "almost" : "good") : "bad") + '" role="status">' +
			'<div class="fb-top"><div class="fb-msg">' + msg + "</div>" +
			'<a class="teaka" href="' + teAkaUrl(card) + '" target="_blank" rel="noopener">Te Aka ↗</a></div>' +
			'<div class="fb-answer">' + (card.pic ? '<span class="fb-pic" aria-hidden="true">' + card.pic + "</span>" : "") +
			"<span><b>" + blanks(card.mi) + "</b> — " + blanks(card.en) + "</span></div>" +
			(card.note ? '<p class="fb-note">' + esc(card.note) + "</p>" : "") +
			(card.ex ? '<p class="fb-note"><b>' + esc(card.ex) + "</b> — " + esc(card.exEn) + "</p>" : "") +
			'<button class="btn primary big" data-action="next">Continue</button></div>';
	}

	function renderSummary() {
		var acc = session.done ? Math.round(100 * session.right / session.done) : 0;
		var d = today();
		var html = '<main class="s-body summary">';
		html += '<div class="celebrate">' + (session.wrong === 0 && session.done >= 10 ? "💎" : session.goalJustMet ? "🎉" : "🌿") + "</div>" +
			"<h1>" + (session.goalJustMet ? "Daily goal done!" : "Lesson done!") + "</h1>" +
			'<div class="stat-row">' + stat("+" + session.xp, "XP") + stat(acc + "%", "accuracy") + stat(session.newWords, "new words") + "</div>";
		if (session.goalJustMet) {
			html += '<div class="banner">🔥 Streak: ' + plural(currentStreak(), "day") + (session.earnedFreeze ? " · ❄️ You earned a streak freeze!" : "") + "</div>";
			var p = DECK.proverbs[proverbIndex(todayKey())];
			html += '<section class="card proverb open reveal"><div class="eyebrow">Whakataukī o te rā — unlocked</div><p class="proverb-mi">' + esc(p[0]) + '</p><p class="proverb-en">' + esc(p[1]) + "</p></section>";
		} else if (!d.met) {
			html += '<p class="muted center">' + (state.settings.goal - d.reviews) + " more answers to reach today's goal.</p>";
		}
		(session.newAchievements || []).forEach(function (a) {
			html += '<div class="card achievement-pop"><span class="badge-icon">' + a.icon + "</span><div><div class=\"eyebrow\">Achievement unlocked</div><strong>" + esc(a.mi) + "</strong><br><span class=\"muted\">" + esc(a.en) + "</span></div></div>";
		});
		html += '<div class="s-foot"><button class="btn primary big" data-action="done">Done</button></div></main>';
		return html;
	}

	// ---------------------------------------------------------------------
	// Events
	// ---------------------------------------------------------------------
	function onMc(i) {
		var cur = session.current;
		if (cur.answered) return;
		cur.chosen = cur.options[i];
		var correct = cur.chosen === cur.answer;
		record(correct, correct ? 2 : 0, correct ? 10 : 2);
		render();
	}

	function onType(skip) {
		var cur = session.current;
		if (cur.answered) return;
		var input = document.getElementById("type-input");
		var typed = skip ? "" : (input ? input.value : "");
		if (!skip && !typed.trim()) { if (input) input.focus(); return; }
		cur.typed = typed;
		var t = normalise(typed);
		var answers = [cur.card.mi].concat(cur.card.alt).map(normalise);
		var exact = answers.indexOf(t) !== -1;
		var loose = !exact && answers.map(stripMacrons).indexOf(stripMacrons(t)) !== -1;
		if (exact) {
			state.stats.typedPerfect++;
			record(true, 2, 15);
		} else if (loose) {
			cur.macronSlip = true;
			record(true, 1, 8);
		} else {
			record(false, 0, 2);
		}
		render();
	}

	function exportData() {
		var blob = new Blob([JSON.stringify(state, null, 1)], { type: "application/json" });
		var a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = "panana-backup-" + todayKey() + ".json";
		document.body.appendChild(a);
		a.click();
		setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
	}

	function importData(file) {
		var reader = new FileReader();
		reader.onload = function () {
			try {
				var s = JSON.parse(reader.result);
				if (!s || typeof s !== "object" || !s.cards || !s.days) throw new Error("bad");
				if (!confirm("Replace your current progress with this backup?")) return;
				localStorage.setItem(STORE_KEY, JSON.stringify(s));
				state = load();
				save();
				pushNow();
				toast("Backup restored.");
				render();
			} catch (e) {
				toast("That file isn't a Panana backup.");
			}
		};
		reader.readAsText(file);
	}

	root.addEventListener("click", function (e) {
		var el = e.target.closest("[data-action]");
		if (!el || el.tagName === "FORM") return;
		var a = el.getAttribute("data-action");
		switch (a) {
			case "tab":
				view = el.getAttribute("data-tab");
				topicView = null;
				render();
				if (view === "ropu" || view === "home") refreshBoard();
				if (view === "more" && user && user.admin) loadAdmin();
				break;
			case "board": boardMetric = el.getAttribute("data-metric"); render(true); break;
			case "toggle-board":
				state.settings.hideFromBoard = !state.settings.hideFromBoard;
				save();
				pushNow();
				render(true);
				break;
			case "logout": logout(); break;
			case "admin-newcode":
				if (confirm("Make a new invite code? The current one stops working straight away (existing members aren't affected).")) adminConfig({ newInvite: true }, "New invite code ready.");
				break;
			case "admin-closed": {
				var closing = !adminData.config.closed;
				adminConfig({ closed: closing }, closing ? "Sign-ups closed." : "Sign-ups open.");
				break;
			}
			case "admin-max": adminConfig({ max: +el.getAttribute("data-max") }, "Member limit updated."); break;
			case "admin-remove": {
				var who = el.getAttribute("data-u");
				if (confirm("Remove @" + who + "? This deletes their account and all their progress, and signs them out. It can't be undone.")) adminRemove(who);
				break;
			}
			case "topic": topicView = el.getAttribute("data-topic"); render(); break;
			case "back": topicView = null; render(); break;
			case "start": startSession(el.getAttribute("data-mode"), el.getAttribute("data-topic")); break;
			case "quit": quitSession(); break;
			case "done": session = null; render(); break;
			case "intro-ok": finishIntro(); break;
			case "mc": onMc(+el.getAttribute("data-i")); break;
			case "reveal": session.current.revealed = true; render(); break;
			case "grade": {
				var g = +el.getAttribute("data-g");
				record(g > 0, g, [2, 5, 10, 10][g]);
				advance();
				break;
			}
			case "next": advance(); break;
			case "gmc": {
				var gq = session.current;
				if (gq.answered) break;
				gq.chosen = gq.q.options[+el.getAttribute("data-i")];
				var gok = gq.chosen === gq.q.answer;
				if (gok) state.stats.sentences = (state.stats.sentences || 0) + 1;
				record(gok, gok ? 2 : 0, gok ? 12 : 2);
				render(true);
				break;
			}
			case "tile": session.current.built.push(+el.getAttribute("data-i")); render(true); break;
			case "untile": session.current.built.splice(+el.getAttribute("data-k"), 1); render(true); break;
			case "tiles-check": {
				var tq = session.current;
				if (tq.answered) break;
				var made = tq.built.map(function (i) { return tq.bank[i]; }).join(" ");
				var tok = [tq.q.answer].concat(tq.q.alts || []).some(function (a) { return made === words(a).join(" "); });
				if (tok) state.stats.sentences = (state.stats.sentences || 0) + 1;
				record(tok, tok ? 2 : 0, tok ? 15 : 2);
				render(true);
				break;
			}
			case "type-skip": onType(true); break;
			case "macron": {
				var input = document.getElementById("type-input");
				if (input) {
					var s = input.selectionStart || input.value.length, en = input.selectionEnd || s;
					input.value = input.value.slice(0, s) + el.getAttribute("data-m") + input.value.slice(en);
					input.focus();
					input.setSelectionRange(s + 1, s + 1);
				}
				break;
			}
			case "setting":
				state.settings[el.getAttribute("data-name")] = +el.getAttribute("data-value");
				save();
				pushNow();
				render(true);
				break;
			case "export": exportData(); break;
			case "reset":
				if (confirm("Delete ALL progress, streaks and achievements? This can't be undone.") && confirm("Really? Consider exporting a backup first.")) {
					state = defaultState();
					save();
					pushNow();
					toast("Progress reset.");
					render();
				}
				break;
		}
	});

	root.addEventListener("submit", function (e) {
		e.preventDefault();
		var form = e.target;
		if (form.id === "password-form") changePassword(form);
		else if (form.id === "admin-form") adminReset(form);
		else onType(false);
	});

	root.addEventListener("change", function (e) {
		if (e.target.id === "import-file" && e.target.files[0]) importData(e.target.files[0]);
	});

	// Enter to continue after answering
	document.addEventListener("keydown", function (e) {
		if (!session || session.finished || !session.current) return;
		var cur = session.current;
		if (e.key === "Enter" && cur.answered && cur.ex !== "flash") {
			e.preventDefault();
			advance();
		} else if (!cur.answered && (cur.ex === "mc_mi" || cur.ex === "mc_en" || cur.ex === "pic") && /^[1-4]$/.test(e.key)) {
			onMc(+e.key - 1);
		}
	});

	// Re-check the date when the app comes back to the foreground (phones keep
	// PWAs alive for days).
	var lastDay = todayKey();
	document.addEventListener("visibilitychange", function () {
		if (document.visibilityState === "hidden") {
			if (dirty) pushNow(true);
			return;
		}
		// back in the foreground: pick up progress from other devices
		pull().then(function () {
			if (todayKey() !== lastDay) {
				lastDay = todayKey();
				reconcileFreezes();
			}
			if (!session) render(true);
			refreshBoard();
		});
	});
	window.addEventListener("online", function () { offline = false; pull().then(function () { if (!session) render(true); }); });

	// ---------------------------------------------------------------------
	// Account & sync
	// Progress is kept on this device (works offline) and synced to the
	// server under your account. If two devices both changed, the copies are
	// merged rather than one overwriting the other.
	// ---------------------------------------------------------------------
	var API = "/api/reo/";
	var user = null;
	var offline = false;
	var dirty = false;
	var serverSavedAt = 0;
	var lastSync = 0;
	var pushTimer = null;
	var pushing = false;
	var pushAgain = false;

	function AuthError() { this.message = "auth"; }

	function api(method, path, body, keepalive) {
		var opts = { method: method, credentials: "same-origin", headers: {} };
		if (body !== undefined) {
			opts.headers["Content-Type"] = "application/json";
			opts.body = JSON.stringify(body);
			if (keepalive && opts.body.length < 60000) opts.keepalive = true;
		}
		return fetch(API + path, opts).then(function (r) {
			return r.json().catch(function () { return {}; }).then(function (data) {
				if (r.status === 401) { location.href = "/panana/login"; throw new AuthError(); }
				return { status: r.status, ok: r.ok, data: data };
			});
		});
	}

	function mergeStates(a, b) {
		if (!a) return b;
		if (!b) return a;
		var newer = (a.savedAt || 0) >= (b.savedAt || 0) ? a : b;
		var older = newer === a ? b : a;
		var m = JSON.parse(JSON.stringify(newer));
		var oc = older.cards || {};
		Object.keys(oc).forEach(function (id) {
			var o = oc[id], n = m.cards[id];
			if (!n || (o.right + o.wrong) > (n.right + n.wrong)) m.cards[id] = o;
		});
		var od = older.days || {};
		Object.keys(od).forEach(function (k) {
			var o = od[k], n = m.days[k];
			if (!n || o.reviews > n.reviews) m.days[k] = o;
			else if (o.met) n.met = true;
		});
		m.xp = Math.max(a.xp || 0, b.xp || 0);
		m.created = (a.created || "9") < (b.created || "9") ? a.created : b.created;
		(older.frozen || []).forEach(function (k) { if (m.frozen.indexOf(k) === -1) m.frozen.push(k); });
		(older.proverbs || []).forEach(function (k) { if (m.proverbs.indexOf(k) === -1) m.proverbs.push(k); });
		var oa = older.achievements || {};
		Object.keys(oa).forEach(function (k) { if (!m.achievements[k] || oa[k] < m.achievements[k]) m.achievements[k] = oa[k]; });
		var os = older.stats || {};
		Object.keys(os).forEach(function (k) {
			if (typeof os[k] === "number") m.stats[k] = Math.max(m.stats[k] || 0, os[k]);
			else if (os[k] > (m.stats[k] || "")) m.stats[k] = os[k];
		});
		return m;
	}

	function weekStart(key) { return addDays(key, -dayOfWeek(key)); }

	// What the group leaderboard shows about you.
	function summary() {
		var t = todayKey(), wk = weekStart(t), pk = addDays(wk, -7);
		var wx = 0, px = 0;
		for (var i = 0; i < 7; i++) {
			var d = state.days[addDays(wk, i)], e = state.days[addDays(pk, i)];
			if (d) wx += d.xp;
			if (e) px += e.xp;
		}
		var lm = "";
		Object.keys(state.days).forEach(function (k) { if (state.days[k].met && k > lm) lm = k; });
		var la = "";
		Object.keys(state.days).forEach(function (k) { if (state.days[k].reviews > 0 && k > la) la = k; });
		return { xp: state.xp, wk: wk, wx: wx, px: px, st: currentStreak(), lm: lm, lr: solidCount(), la: la, h: !!state.settings.hideFromBoard };
	}

	function stripped(s) {
		var c = JSON.parse(JSON.stringify(s));
		delete c.savedAt;
		return JSON.stringify(c);
	}

	function pull() {
		if (!user) return Promise.resolve();
		return api("GET", "progress").then(function (r) {
			if (!r.ok) return;
			offline = false;
			var remote = r.data.state;
			serverSavedAt = r.data.savedAt || 0;
			if (!remote) {
				if (state.xp || Object.keys(state.cards).length) return push();
				return;
			}
			if (session) return; // don't swap state mid-lesson; the next push will merge
			var merged = mergeStates(state, remote);
			state = merged;
			saveLocal();
			lastSync = Date.now();
			if (stripped(merged) !== stripped(remote)) return push();
			dirty = false;
		}).catch(function (e) {
			if (!(e instanceof AuthError)) offline = true;
		});
	}

	function push(keepalive) {
		if (!user) return Promise.resolve();
		if (pushing) { pushAgain = true; return Promise.resolve(); }
		pushing = true;
		clearTimeout(pushTimer);
		var attempt = function (tries) {
			return api("PUT", "progress", { state: state, base: serverSavedAt, summary: summary() }, keepalive).then(function (r) {
				if (r.status === 409 && tries > 0) {
					state = mergeStates(state, r.data.state);
					serverSavedAt = r.data.savedAt;
					saveLocal();
					return attempt(tries - 1);
				}
				if (r.ok) {
					serverSavedAt = r.data.savedAt;
					state.savedAt = state.savedAt || serverSavedAt;
					dirty = false;
					offline = false;
					lastSync = Date.now();
				}
			});
		};
		return attempt(2).catch(function (e) {
			if (!(e instanceof AuthError)) offline = true;
		}).then(function () {
			pushing = false;
			if (pushAgain) { pushAgain = false; return push(); }
		});
	}
	function pushNow(keepalive) { return push(keepalive); }
	// While you're answering questions, sync a minute after the last change.
	function schedulePush() {
		clearTimeout(pushTimer);
		pushTimer = setTimeout(push, 60000);
	}

	function logout() {
		var go = function () {
			api("POST", "logout", {}).catch(function () {}).then(function () {
				try {
					localStorage.removeItem(STORE_KEY);
					localStorage.removeItem("reo.lastUser");
				} catch (e) {}
				location.href = "/panana/login";
			});
		};
		if (dirty) push().then(go); else go();
	}

	function formData(form) {
		var d = {};
		new FormData(form).forEach(function (v, k) { d[k] = String(v); });
		return d;
	}

	function changePassword(form) {
		var d = formData(form);
		api("POST", "password", { current: d.current, next: d.next }).then(function (r) {
			toast(r.ok ? "Password changed." : r.data.error || "Couldn't change password.");
			if (r.ok) form.reset();
		}).catch(function () { toast("Can't reach the server."); });
	}

	function adminReset(form) {
		var d = formData(form);
		api("POST", "admin/reset", { username: d.username.trim().toLowerCase(), password: d.password }).then(function (r) {
			toast(r.ok ? "Password reset for " + d.username + "." : r.data.error || "Couldn't reset.");
			if (r.ok) form.reset();
		}).catch(function () { toast("Can't reach the server."); });
	}

	// ---------------------------------------------------------------------
	// Group admin (only shown to usernames listed in REO_ADMINS)
	// ---------------------------------------------------------------------
	var adminData = null; // { members, config }
	var adminError = "";

	function loadAdmin() {
		api("GET", "admin/members").then(function (r) {
			if (!r.ok) { adminError = r.data.error || "Couldn't load members."; }
			else { adminData = r.data; adminError = ""; user.invite = r.data.config.invite; }
			if (!session && view === "more") render(true);
		}).catch(function () { adminError = "Can't reach the server."; if (view === "more") render(true); });
	}

	function adminConfig(change, okMsg) {
		api("POST", "admin/config", change).then(function (r) {
			if (!r.ok) return toast(r.data.error || "Couldn't save.");
			adminData.config = r.data.config;
			user.invite = r.data.config.invite;
			toast(okMsg);
			render(true);
		}).catch(function () { toast("Can't reach the server."); });
	}

	function adminRemove(username) {
		api("POST", "admin/remove", { username: username }).then(function (r) {
			if (!r.ok) return toast(r.data.error || "Couldn't remove.");
			toast("Removed @" + username + ".");
			if (board) board = board.filter(function (e) { return e.u !== username; });
			loadAdmin();
		}).catch(function () { toast("Can't reach the server."); });
	}

	function daysAgo(key) {
		if (!key) return "never";
		var t = todayKey();
		if (key === t) return "today";
		if (key === addDays(t, -1)) return "yesterday";
		var n = 0, k = key;
		while (k < t && n < 400) { k = addDays(k, 1); n++; }
		return n >= 400 ? "over a year ago" : n + " days ago";
	}

	function renderAdmin() {
		var html = '<section class="card admin"><h2>Group admin</h2>';
		if (!adminData) {
			html += '<p class="muted small">' + (adminError ? esc(adminError) : "Loading members…") + "</p></section>";
			return html;
		}
		var c = adminData.config, m = adminData.members;
		html += '<div class="admin-row"><div><div class="eyebrow">Invite code</div>' +
			(c.closed ? '<span class="muted">Sign-ups closed</span>' : c.invite ? '<code class="invite">' + esc(c.invite) + "</code>" : '<span class="muted">None set</span>') + "</div>" +
			'<button class="btn" data-action="admin-newcode">New code</button></div>' +
			'<p class="muted small">Friends sign up at durand.nz/panana with this code. If it gets shared too widely, make a new one — the old code stops working, and existing members keep their accounts.</p>' +
			'<div class="toggle-row"><span>Allow new sign-ups</span><button class="chip' + (c.closed ? "" : " active") + '" data-action="admin-closed">' + (c.closed ? "Closed" : "Open") + "</button></div>" +
			'<div class="toggle-row"><span>Member limit</span><span class="choices tight">' + [10, 25, 50].map(function (n) {
				return '<button class="chip' + (c.max === n ? " active" : "") + '" data-action="admin-max" data-max="' + n + '">' + n + "</button>";
			}).join("") + (([10, 25, 50].indexOf(c.max) === -1) ? '<button class="chip active">' + c.max + "</button>" : "") + "</span></div>";

		html += '<h3 class="members-title">Members <span class="muted small">' + m.length + " of " + c.max + "</span></h3>";
		if (m.length >= c.max) html += '<p class="banner warn small">The group is full — new sign-ups are blocked until you remove someone or raise the limit.</p>';
		html += '<ul class="members">';
		m.forEach(function (x) {
			var active = x.lastActive === todayKey();
			html += '<li class="member">' +
				'<span class="avatar">' + esc((x.name || x.username).charAt(0).toUpperCase()) + "</span>" +
				'<div class="member-main"><strong>' + esc(x.name) + "</strong> <span class=\"muted small\">@" + esc(x.username) + "</span>" +
				(x.admin ? ' <span class="pill">admin</span>' : "") + (x.hidden ? ' <span class="pill warn">hidden</span>' : "") +
				'<div class="muted small">Joined ' + (x.joined ? esc(x.joined.slice(0, 10)) : "?") + " · Last practised " + (active ? '<b class="good-text">today</b>' : daysAgo(x.lastActive)) + "</div>" +
				'<div class="muted small">' + x.xp + " XP · " + x.words + " words · 🔥 " + (x.lastMet >= addDays(todayKey(), -1) ? x.streak : 0) + "</div></div>" +
				(x.admin || x.username === user.username ? "" : '<button class="btn danger-sm" data-action="admin-remove" data-u="' + esc(x.username) + '">Remove</button>') +
				"</li>";
		});
		html += "</ul>";
		html += '<details><summary>Reset a member\'s password</summary><form id="admin-form" class="mini-form">' +
			'<input name="username" autocapitalize="none" autocorrect="off" placeholder="Their username" required>' +
			'<input name="password" type="text" minlength="8" placeholder="New password (8+ characters)" required>' +
			'<button class="btn" type="submit">Reset password</button></form></details></section>';
		return html;
	}

	// ---------------------------------------------------------------------
	// Group leaderboard
	// ---------------------------------------------------------------------
	var board = null;      // other members' summaries from the server
	var boardAt = 0;
	var boardMetric = "week";

	function refreshBoard(force) {
		if (!user || (!force && Date.now() - boardAt < 60000)) return;
		boardAt = Date.now();
		api("GET", "leaderboard").then(function (r) {
			if (!r.ok) return;
			board = r.data.members || [];
			checkWeekWin();
			if (!session && (view === "home" || view === "ropu")) render(true);
		}).catch(function () {});
	}

	function boardRows() {
		var t = todayKey(), wk = weekStart(t), pwk = addDays(wk, -7), yest = addDays(t, -1);
		var mine = summary();
		mine.u = user.username;
		mine.n = user.name;
		var all = (board || []).filter(function (e) { return e.u !== user.username; }).concat([mine]);
		return all.map(function (e) {
			return {
				u: e.u,
				n: e.n || e.u,
				me: e.u === user.username,
				week: e.wk === wk ? e.wx : 0,
				last: e.wk === wk ? e.px : e.wk === pwk ? e.wx : 0,
				streak: e.lm && e.lm >= yest ? e.st : 0,
				words: e.lr || 0,
				xp: e.xp || 0,
				today: e.lm === t,
			};
		});
	}

	function ranked(metric) {
		return boardRows().sort(function (a, b) { return b[metric] - a[metric] || (a.me ? -1 : b.me ? 1 : 0); });
	}

	function lastWeekWinner() {
		var rows = ranked("last");
		if (rows.length < 2 || !rows[0].last || rows[0].last === rows[1].last) return null;
		return rows[0];
	}

	function checkWeekWin() {
		var w = lastWeekWinner();
		var pwk = addDays(weekStart(todayKey()), -7);
		if (w && w.me && state.stats.wonWeek !== pwk) {
			state.stats.weeksWon++;
			state.stats.wonWeek = pwk;
			checkAchievements();
			save();
			toast("🏆 You topped the group last week!");
		}
	}

	// One line for the home screen: where you stand this week.
	function standing() {
		if (!board) return "";
		var rows = ranked("week");
		if (rows.length < 2) return "";
		var i = 0;
		while (!rows[i].me) i++;
		var me = rows[i];
		var line;
		if (i === 0) {
			var gap = me.week - rows[1].week;
			line = gap > 0 ? "You're leading by " + gap + " XP over " + esc(rows[1].n) : "You're tied for first with " + esc(rows[1].n);
		} else {
			var ahead = rows[i - 1];
			line = "#" + (i + 1) + " of " + rows.length + " · " + (ahead.week - me.week || "a few") + " XP behind " + esc(ahead.n);
		}
		return '<button class="card standing" data-action="tab" data-tab="ropu"><span class="standing-icon">' + (i === 0 ? "🥇" : "🏅") + '</span><span><span class="eyebrow">Rōpū this week</span><br>' + line + '</span><span class="chev">›</span></button>';
	}

	function renderRopu() {
		var metrics = [["week", "This week"], ["streak", "Streaks"], ["words", "Words"], ["xp", "All-time"]];
		var units = { week: "XP", streak: "days", words: "words", xp: "XP" };
		var html = '<main class="page"><h1>Rōpū <span class="muted small">Your group</span></h1>';
		var w = lastWeekWinner();
		if (w) html += '<div class="banner">🏆 Last week: <b>' + esc(w.n) + "</b> won with " + w.last + " XP" + (w.me ? " — that's you!" : "") + "</div>";
		html += '<div class="choices">' + metrics.map(function (m) {
			return '<button class="chip' + (boardMetric === m[0] ? " active" : "") + '" data-action="board" data-metric="' + m[0] + '">' + m[1] + "</button>";
		}).join("") + "</div>";

		if (!board) {
			html += '<p class="muted">' + (offline ? "You're offline — the leaderboard will load when you reconnect." : "Loading…") + "</p>";
		} else {
			var rows = ranked(boardMetric);
			html += '<ol class="board">';
			rows.forEach(function (r, i) {
				var rank = r[boardMetric] > 0 && i < 3 ? ["🥇", "🥈", "🥉"][i] : String(i + 1);
				html += '<li class="row' + (r.me ? " me" : "") + '"><span class="rank">' + rank + "</span>" +
					'<span class="avatar">' + esc(r.n.charAt(0).toUpperCase()) + "</span>" +
					'<span class="who"><strong>' + esc(r.n) + (r.me ? ' <span class="muted small">(you)</span>' : "") + "</strong>" +
					(r.today ? '<span class="pill">✓ practised today</span>' : r.streak ? '<span class="pill warn">🔥 streak at risk</span>' : "") + "</span>" +
					'<span class="score"><strong>' + r[boardMetric] + "</strong><small>" + units[boardMetric] + "</small></span></li>";
			});
			html += "</ol>";
			if (rows.length < 2) html += '<p class="muted">It\'s just you so far. Share the invite code and durand.nz/panana with friends to get a league going.</p>';
			if (boardMetric === "week") {
				var left = 7 - dayOfWeek(todayKey());
				html += '<p class="muted small center">The weekly league resets on Monday · ' + (left === 1 ? "last day!" : left + " days left") + "</p>";
			}
		}
		if (state.settings.hideFromBoard) html += '<p class="muted small center">You\'re hidden from others (change in More).</p>';
		html += "</main>";
		return html;
	}

	// ---------------------------------------------------------------------
	// Start-up: who's signed in, load their progress, then sync.
	// ---------------------------------------------------------------------
	function boot() {
		api("GET", "me").then(function (r) {
			if (!r.ok) throw new Error("server");
			return r.data;
		}).catch(function (e) {
			if (e instanceof AuthError) throw e;
			offline = true; // no connection: carry on with what's on this device
			var cached = null;
			try { cached = JSON.parse(localStorage.getItem("reo.lastUser")); } catch (x) {}
			if (!cached) throw new Error("offline");
			return cached;
		}).then(function (me) {
			user = me;
			try { localStorage.setItem("reo.lastUser", JSON.stringify(me)); } catch (x) {}
			STORE_KEY = "reo.v1." + me.username;
			try {
				// adopt progress saved before accounts existed
				if (!localStorage.getItem(STORE_KEY) && localStorage.getItem("reo.v1")) {
					localStorage.setItem(STORE_KEY, localStorage.getItem("reo.v1"));
					localStorage.removeItem("reo.v1");
				}
			} catch (x) {}
			state = load();
			return offline ? null : pull();
		}).then(function () {
			reconcileFreezes();
			render();
			refreshBoard(true);
		}).catch(function (e) {
			if (e instanceof AuthError) return;
			root.innerHTML = '<main class="page"><h1>Panana</h1><p>You\'re offline and haven\'t signed in on this device yet. Connect to the internet and try again.</p></main>';
		});
	}

	// ---------------------------------------------------------------------
	// Boot
	// ---------------------------------------------------------------------
	boot();

	if ("serviceWorker" in navigator && location.protocol !== "file:") {
		window.addEventListener("load", function () {
			navigator.serviceWorker.register("sw.js").catch(function () {});
		});
	}

	// test hook
	window.__reo = { state: function () { return state; }, generate: function (id) { return generate(CARD_BY_ID[id]); }, genAvailable: function (id) { return genAvailable(CARD_BY_ID[id]); }, pickExercise: function (id, item) { return pickExercise(CARD_BY_ID[id], item || { kind: "review" }); }, distractors: function (id, f) { return distractors(CARD_BY_ID[id], f); }, mergeStates: mergeStates, summary: summary, pushNow: pushNow, CARDS: CARDS, schedule: schedule, addDays: addDays, currentStreak: currentStreak };
})();
