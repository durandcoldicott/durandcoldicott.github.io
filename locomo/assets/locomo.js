import { SOURCE_NOTE, STOCKISTS, PRODUCTS, VISIBILITY_SCAN, SOCIAL_PROFILES } from "/data/locomo-public-data.js";
import {
	CONFIDENCE_LEVELS,
	B2B_CONTEXT,
	METRICS_CONFIG,
	CHANNELS,
	DEVICES,
	AD_SPEND,
	FUNNEL_STAGES,
	TOP_PATHS,
	SOCIAL,
	STOCKIST_PERFORMANCE,
	PRODUCT_SIGNALS,
	GEO_OPPORTUNITY,
	APPROACH_90_DAY,
} from "/data/locomo-simulated-data.js";

function tag(confidenceKey) {
	var level = CONFIDENCE_LEVELS[confidenceKey];
	var span = document.createElement("span");
	span.className = "lc-tag lc-tag-" + confidenceKey;
	span.textContent = level.label;
	span.title = level.desc;
	return span;
}

function el(tagName, className, text) {
	var e = document.createElement(tagName);
	if (className) e.className = className;
	if (text !== undefined) e.textContent = text;
	return e;
}

/* ---------- Screen nav rail + scroll-spy ---------- */
(function buildRail() {
	var screens = Array.prototype.slice.call(document.querySelectorAll(".lc-screen"));
	var dotsList = document.getElementById("lc-rail-dots");
	var links = {};

	screens.forEach(function (screen) {
		var li = document.createElement("li");
		var a = document.createElement("a");
		a.href = "#" + screen.id;
		a.textContent = screen.getAttribute("data-num");
		a.title = screen.getAttribute("data-title");
		li.appendChild(a);
		dotsList.appendChild(li);
		links[screen.id] = a;
	});

	if ("IntersectionObserver" in window) {
		var observer = new IntersectionObserver(
			function (entries) {
				entries.forEach(function (entry) {
					if (entry.isIntersecting) {
						Object.keys(links).forEach(function (id) {
							links[id].classList.toggle("active", id === entry.target.id);
						});
					}
				});
			},
			{ rootMargin: "-40% 0px -55% 0px" }
		);
		screens.forEach(function (s) {
			observer.observe(s);
		});
	}
})();

/* ---------- Theme toggle (mirrors the main site's pattern) ---------- */
(function themeToggle() {
	var btn = document.getElementById("lc-theme-toggle");
	if (!btn) return;
	btn.addEventListener("click", function () {
		var current = document.documentElement.getAttribute("data-theme");
		var next = current === "light" ? "dark" : "light";
		document.documentElement.setAttribute("data-theme", next);
		try {
			localStorage.setItem("theme", next);
		} catch (err) {
			/* storage unavailable */
		}
	});
})();

/* ---------- Screen 2: Hidden Customer ecosystem chain ---------- */
(function renderEcosystemChain() {
	var chain = ["End user", "Family / caregiver", "OT / health professional", "Funder / plan manager", "Stockist", "Locomo"];
	var wrap = document.getElementById("lc-ecosystem-chain");
	chain.forEach(function (node, i) {
		wrap.appendChild(el("div", "lc-chain-node", node));
		if (i < chain.length - 1) wrap.appendChild(el("span", "lc-chain-arrow", "→"));
	});
})();

/* ---------- Screen 3: what's visible from the outside ---------- */
(function renderVisibilityScan() {
	var wrap = document.getElementById("lc-visibility-scan");
	var signalMeta = {
		visible: { tagClass: "lc-tag-verified", label: "Visible" },
		partial: { tagClass: "lc-tag-simulated", label: "Partially visible" },
		"not-visible": { tagClass: "lc-tag-notvisible", label: "Not visible externally" },
	};

	VISIBILITY_SCAN.forEach(function (row) {
		var rowEl = el("div", "lc-scan-row");

		var left = el("div");
		left.appendChild(el("div", "lc-scan-area", row.area));
		var signal = signalMeta[row.signal];
		var signalTag = el("span", "lc-tag " + signal.tagClass, signal.label);
		var signalWrap = el("div", "lc-scan-signal");
		signalWrap.appendChild(signalTag);
		left.appendChild(signalWrap);
		rowEl.appendChild(left);

		var right = el("div", "lc-scan-body");
		var evidenceP = el("p");
		evidenceP.appendChild(el("span", "lc-scan-label", "Evidence"));
		evidenceP.appendChild(document.createTextNode(row.evidence));
		right.appendChild(evidenceP);

		var suggestsP = el("p");
		suggestsP.appendChild(el("span", "lc-scan-label", "Suggests"));
		suggestsP.appendChild(document.createTextNode(row.suggests));
		right.appendChild(suggestsP);

		if (row.question) {
			var qP = el("p");
			qP.appendChild(el("span", "lc-scan-label", "Worth exploring"));
			qP.appendChild(el("span", "lc-scan-q", row.question));
			right.appendChild(qP);
		}
		rowEl.appendChild(right);
		wrap.appendChild(rowEl);
	});
})();

/* ================================================================
   Screen 4: The Growth Dashboard
   ================================================================ */
(function growthDashboard() {
	document.getElementById("lc-b2b-verified").textContent = B2B_CONTEXT.verifiedText;
	document.getElementById("lc-b2b-estimate").textContent = B2B_CONTEXT.estimateText;

	/* ---- seeded PRNG + deterministic daily series generator ---- */
	function mulberry32(seed) {
		return function () {
			seed |= 0;
			seed = (seed + 0x6d2b79f5) | 0;
			var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	function generateSeries(metricKey, days, baselineFactor, seedOffset, endDate) {
		var cfg = METRICS_CONFIG.metrics[metricKey];
		var rng = mulberry32(cfg.seed + seedOffset);
		var series = [];
		for (var i = days - 1; i >= 0; i--) {
			var d = new Date(endDate);
			d.setDate(d.getDate() - i);
			var dow = (d.getDay() + 6) % 7; // 0 = Monday
			var trendMult = 1 + cfg.trendPerDay * (days - 1 - i);
			var noise = 1 + (rng() * 2 - 1) * cfg.noiseFrac;
			series.push({ date: d, value: cfg.base * baselineFactor * cfg.weekly[dow] * trendMult * noise });
		}
		return series;
	}

	function getPeriodSeries(metricKey, days, compareMode) {
		var today = new Date(METRICS_CONFIG.asOf + "T00:00:00");
		var current = generateSeries(metricKey, days, 1, 0, today);
		var compFactor = METRICS_CONFIG.comparisonBaselineFactor[compareMode];
		var compEnd = new Date(today);
		if (compareMode === "yoy") {
			compEnd.setFullYear(compEnd.getFullYear() - 1);
		} else {
			compEnd.setDate(compEnd.getDate() - days);
		}
		var comparison = generateSeries(metricKey, days, compFactor, 777, compEnd);
		return { current: current, comparison: comparison };
	}

	var AGGREGATION = { sessions: "sum", revenue: "sum", conversionRate: "avg", roas: "avg" };
	function aggregate(series, metricKey) {
		var sum = series.reduce(function (s, p) { return s + p.value; }, 0);
		return AGGREGATION[metricKey] === "avg" ? sum / series.length : sum;
	}

	var METRIC_META = {
		sessions: { label: "Sessions", format: function (v) { return Math.round(v).toLocaleString(); } },
		revenue: { label: "Revenue", format: function (v) { return "$" + Math.round(v).toLocaleString(); } },
		conversionRate: { label: "Conversion rate", format: function (v) { return (v * 100).toFixed(1) + "%"; } },
		roas: { label: "ROAS", format: function (v) { return v.toFixed(1) + "x"; } },
	};

	var dateFmt = new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short" });

	/* ---- state ---- */
	var state = { range: 30, compare: "previous", metric: "sessions" };

	/* ---- KPI row ---- */
	function sparklinePoints(series, w, h) {
		var vals = series.map(function (p) { return p.value; });
		var min = Math.min.apply(null, vals),
			max = Math.max.apply(null, vals);
		var span = max - min || 1;
		return series
			.map(function (p, i) {
				var x = (i / (series.length - 1)) * w;
				var y = h - ((p.value - min) / span) * h;
				return x.toFixed(1) + "," + y.toFixed(1);
			})
			.join(" ");
	}

	function renderKpiRow() {
		var row = document.getElementById("lc-kpi-row");
		row.innerHTML = "";
		Object.keys(METRIC_META).forEach(function (key) {
			var meta = METRIC_META[key];
			var periods = getPeriodSeries(key, state.range, state.compare);
			var currentAgg = aggregate(periods.current, key);
			var comparisonAgg = aggregate(periods.comparison, key);
			var deltaPct = ((currentAgg - comparisonAgg) / comparisonAgg) * 100;

			var tile = el("button", "lc-kpi-tile" + (key === state.metric ? " active" : ""));
			tile.type = "button";
			tile.appendChild(el("p", "lc-kpi-label", meta.label));
			tile.appendChild(el("div", "lc-kpi-value", meta.format(currentAgg)));
			var deltaEl = el("div", "lc-kpi-delta " + (deltaPct >= 0 ? "lc-up" : "lc-down"), (deltaPct >= 0 ? "▲ " : "▼ ") + Math.abs(deltaPct).toFixed(1) + "%");
			tile.appendChild(deltaEl);

			var svgNs = "http://www.w3.org/2000/svg";
			var svg = document.createElementNS(svgNs, "svg");
			svg.setAttribute("class", "lc-kpi-spark");
			svg.setAttribute("viewBox", "0 0 120 28");
			svg.setAttribute("width", "100%");
			svg.setAttribute("height", "28");
			var poly = document.createElementNS(svgNs, "polyline");
			poly.setAttribute("points", sparklinePoints(periods.current, 120, 28));
			svg.appendChild(poly);
			tile.appendChild(svg);

			tile.addEventListener("click", function () {
				state.metric = key;
				renderKpiRow();
				renderTrendChart();
			});
			row.appendChild(tile);
		});
	}

	/* ---- trend chart (line, current vs comparison, crosshair + tooltip) ---- */
	function renderTrendChart() {
		var meta = METRIC_META[state.metric];
		document.getElementById("lc-trend-title").textContent = meta.label;

		var legend = document.getElementById("lc-trend-legend");
		legend.innerHTML = "";
		var l1 = el("span", "lc-legend-item");
		l1.appendChild(el("span", "lc-legend-swatch"));
		l1.appendChild(document.createTextNode("This period"));
		var l2 = el("span", "lc-legend-item");
		l2.appendChild(el("span", "lc-legend-swatch lc-legend-comparison"));
		l2.appendChild(document.createTextNode(state.compare === "yoy" ? "Same period last year" : "Previous period"));
		legend.appendChild(l1);
		legend.appendChild(l2);

		var periods = getPeriodSeries(state.metric, state.range, state.compare);
		var current = periods.current,
			comparison = periods.comparison;

		var W = 760,
			H = 300,
			PAD_L = 46,
			PAD_R = 16,
			PAD_T = 16,
			PAD_B = 30;
		var plotW = W - PAD_L - PAD_R,
			plotH = H - PAD_T - PAD_B;

		var allVals = current.concat(comparison).map(function (p) { return p.value; });
		var maxVal = Math.max.apply(null, allVals) * 1.1;
		var minVal = 0;

		function xFor(i) {
			return PAD_L + (i / (current.length - 1)) * plotW;
		}
		function yFor(v) {
			return PAD_T + plotH - ((v - minVal) / (maxVal - minVal)) * plotH;
		}
		function yTickFormat(v) {
			if (state.metric === "revenue") return "$" + Math.round(v / 1000) + "K";
			if (state.metric === "conversionRate") return (v * 100).toFixed(1) + "%";
			if (state.metric === "roas") return v.toFixed(1) + "x";
			return Math.round(v).toLocaleString();
		}

		var svgNs = "http://www.w3.org/2000/svg";
		var svg = document.createElementNS(svgNs, "svg");
		svg.setAttribute("viewBox", "0 0 " + W + " " + H);
		svg.setAttribute("role", "img");
		svg.setAttribute("aria-label", meta.label + " trend, this period vs " + (state.compare === "yoy" ? "same period last year" : "previous period"));

		// gridlines + y ticks (4 steps)
		for (var g = 0; g <= 4; g++) {
			var gv = (maxVal / 4) * g;
			var gy = yFor(gv);
			var line = document.createElementNS(svgNs, "line");
			line.setAttribute("class", "lc-trend-gridline");
			line.setAttribute("x1", PAD_L);
			line.setAttribute("x2", W - PAD_R);
			line.setAttribute("y1", gy);
			line.setAttribute("y2", gy);
			svg.appendChild(line);
			var label = document.createElementNS(svgNs, "text");
			label.setAttribute("class", "lc-trend-axis-label");
			label.setAttribute("x", PAD_L - 8);
			label.setAttribute("y", gy + 3);
			label.setAttribute("text-anchor", "end");
			label.textContent = yTickFormat(gv);
			svg.appendChild(label);
		}

		// x-axis date labels (sparse)
		var labelEvery = Math.ceil(current.length / 6);
		current.forEach(function (p, i) {
			if (i % labelEvery !== 0 && i !== current.length - 1) return;
			var t = document.createElementNS(svgNs, "text");
			t.setAttribute("class", "lc-trend-axis-label");
			t.setAttribute("x", xFor(i));
			t.setAttribute("y", H - 8);
			t.setAttribute("text-anchor", "middle");
			t.textContent = dateFmt.format(p.date);
			svg.appendChild(t);
		});

		function pathFor(series) {
			return series.map(function (p, i) { return (i === 0 ? "M" : "L") + xFor(i).toFixed(1) + "," + yFor(p.value).toFixed(1); }).join(" ");
		}

		// area under current
		var area = document.createElementNS(svgNs, "path");
		area.setAttribute("class", "lc-trend-area");
		area.setAttribute("d", pathFor(current) + " L" + xFor(current.length - 1) + "," + yFor(0) + " L" + xFor(0) + "," + yFor(0) + " Z");
		svg.appendChild(area);

		var compPath = document.createElementNS(svgNs, "path");
		compPath.setAttribute("class", "lc-trend-line-comparison");
		compPath.setAttribute("d", pathFor(comparison));
		svg.appendChild(compPath);

		var curPath = document.createElementNS(svgNs, "path");
		curPath.setAttribute("class", "lc-trend-line-current");
		curPath.setAttribute("d", pathFor(current));
		svg.appendChild(curPath);

		// end labels
		var endLabel = document.createElementNS(svgNs, "text");
		endLabel.setAttribute("class", "lc-trend-endlabel");
		endLabel.setAttribute("x", xFor(current.length - 1) - 4);
		endLabel.setAttribute("y", yFor(current[current.length - 1].value) - 8);
		endLabel.setAttribute("text-anchor", "end");
		endLabel.textContent = meta.format(current[current.length - 1].value);
		svg.appendChild(endLabel);

		// hover layer: crosshair + dots (hidden until move), one shared hit rect
		var crosshair = document.createElementNS(svgNs, "line");
		crosshair.setAttribute("class", "lc-trend-crosshair");
		crosshair.setAttribute("y1", PAD_T);
		crosshair.setAttribute("y2", H - PAD_B);
		crosshair.style.opacity = "0";
		svg.appendChild(crosshair);

		var dotCur = document.createElementNS(svgNs, "circle");
		dotCur.setAttribute("class", "lc-trend-dot");
		dotCur.setAttribute("r", 4);
		dotCur.style.opacity = "0";
		svg.appendChild(dotCur);

		var dotComp = document.createElementNS(svgNs, "circle");
		dotComp.setAttribute("class", "lc-trend-dot-comparison");
		dotComp.setAttribute("r", 4);
		dotComp.style.opacity = "0";
		svg.appendChild(dotComp);

		var hit = document.createElementNS(svgNs, "rect");
		hit.setAttribute("class", "lc-trend-hit");
		hit.setAttribute("x", PAD_L);
		hit.setAttribute("y", PAD_T);
		hit.setAttribute("width", plotW);
		hit.setAttribute("height", plotH);
		svg.appendChild(hit);

		var container = document.getElementById("lc-trend-chart");
		container.innerHTML = "";
		container.appendChild(svg);

		var tooltip = el("div");
		tooltip.id = "lc-trend-tooltip";
		container.appendChild(tooltip);

		function nearestIndex(clientX, clientY) {
			var pt = svg.createSVGPoint();
			pt.x = clientX;
			pt.y = clientY;
			var loc = pt.matrixTransform(svg.getScreenCTM().inverse());
			var i = Math.round(((loc.x - PAD_L) / plotW) * (current.length - 1));
			return Math.max(0, Math.min(current.length - 1, i));
		}

		function showAt(i) {
			var x = xFor(i);
			crosshair.setAttribute("x1", x);
			crosshair.setAttribute("x2", x);
			crosshair.style.opacity = "1";
			dotCur.setAttribute("cx", x);
			dotCur.setAttribute("cy", yFor(current[i].value));
			dotCur.style.opacity = "1";
			dotComp.setAttribute("cx", x);
			dotComp.setAttribute("cy", yFor(comparison[i].value));
			dotComp.style.opacity = "1";

			tooltip.innerHTML = "";
			tooltip.appendChild(el("div", "lc-tt-date", dateFmt.format(current[i].date)));
			var r1 = el("div", "lc-tt-row");
			r1.appendChild(el("span", "lc-tt-key"));
			r1.firstChild.style.background = "var(--accent)";
			r1.appendChild(document.createTextNode("This period"));
			r1.appendChild(el("span", "lc-tt-val", meta.format(current[i].value)));
			var r2 = el("div", "lc-tt-row");
			var key2 = el("span", "lc-tt-key");
			key2.style.borderTop = "2px dashed var(--border-strong)";
			r2.appendChild(key2);
			r2.appendChild(document.createTextNode(state.compare === "yoy" ? "Last year" : "Previous"));
			r2.appendChild(el("span", "lc-tt-val", meta.format(comparison[i].value)));
			tooltip.appendChild(r1);
			tooltip.appendChild(r2);

			var pct = (x / W) * 100;
			tooltip.style.left = pct > 65 ? "auto" : x + 12 + "px";
			tooltip.style.right = pct > 65 ? W - x + 12 + "px" : "auto";
			tooltip.style.top = "8px";
			tooltip.style.opacity = "1";
		}

		function hide() {
			crosshair.style.opacity = "0";
			dotCur.style.opacity = "0";
			dotComp.style.opacity = "0";
			tooltip.style.opacity = "0";
		}

		hit.addEventListener("pointermove", function (e) {
			showAt(nearestIndex(e.clientX, e.clientY));
		});
		hit.addEventListener("pointerleave", hide);
	}

	/* ---- overview sub-grid: channel & device mini breakdowns ---- */
	function renderMiniBreakdown(containerId, rows, sortKey) {
		var wrap = document.getElementById(containerId);
		wrap.innerHTML = "";
		var sorted = rows.slice().sort(function (a, b) { return b[sortKey] - a[sortKey]; });
		var max = Math.max.apply(null, sorted.map(function (r) { return r[sortKey]; }));
		sorted.forEach(function (r, i) {
			var row = el("div", "lc-mini-row");
			var label = el("div", "lc-mini-label");
			var swatch = el("span", "lc-mini-swatch lc-cat-" + (i + 1));
			label.appendChild(swatch);
			label.appendChild(document.createTextNode(r.label));
			row.appendChild(label);
			var track = el("div", "lc-mini-bar-track");
			var fill = el("div", "lc-mini-bar-fill-cat lc-cat-" + (i + 1));
			fill.style.width = Math.round((r[sortKey] / max) * 100) + "%";
			track.appendChild(fill);
			row.appendChild(track);
			row.appendChild(el("div", "lc-mini-value", Math.round(r[sortKey] * 100) + "%"));
			wrap.appendChild(row);
		});
	}

	/* ---- Acquisition & Ad Spend tab (static — last 30 days) ---- */
	function renderAcquisitionTab() {
		var totalSpend = AD_SPEND.rows.reduce(function (s, r) { return s + r.spend; }, 0);
		var totalRevenue = AD_SPEND.rows.reduce(function (s, r) { return s + r.revenue; }, 0);
		var blendedRoas = totalRevenue / totalSpend;

		var hero = document.getElementById("lc-roas-hero");
		hero.innerHTML = "";
		[
			{ label: "Blended ROAS", value: blendedRoas.toFixed(1) + "x" },
			{ label: "Total ad spend", value: "$" + totalSpend.toLocaleString() },
			{ label: "Revenue from paid", value: "$" + totalRevenue.toLocaleString() },
		].forEach(function (s) {
			var stat = el("div", "lc-roas-stat");
			stat.appendChild(el("p", "lc-kpi-label", s.label));
			stat.appendChild(el("div", "lc-hero-value", s.value));
			hero.appendChild(stat);
		});

		var adTableWrap = el("div", "lc-table-wrap");
		var adTable = el("table", "lc-table");
		var adHead = el("thead");
		var adHeadRow = el("tr");
		["Channel", "Spend", "Clicks", "Conversions", "Revenue", "ROAS", "CPA", "vs previous"].forEach(function (h) {
			adHeadRow.appendChild(el("th", null, h));
		});
		adHead.appendChild(adHeadRow);
		adTable.appendChild(adHead);
		var adBody = el("tbody");
		AD_SPEND.rows.forEach(function (r) {
			var tr = el("tr");
			tr.appendChild(el("td", null, r.channel));
			tr.appendChild(el("td", "lc-num", "$" + r.spend.toLocaleString()));
			tr.appendChild(el("td", "lc-num", r.clicks.toLocaleString()));
			tr.appendChild(el("td", "lc-num", String(r.conversions)));
			tr.appendChild(el("td", "lc-num", "$" + r.revenue.toLocaleString()));
			tr.appendChild(el("td", "lc-num", (r.revenue / r.spend).toFixed(1) + "x"));
			tr.appendChild(el("td", "lc-num", "$" + Math.round(r.spend / r.conversions)));
			var deltaTd = el("td", "lc-num");
			var pill = el("span", "lc-pill" + (r.deltaVsPrevious < 0 ? " lc-pill-bad" : ""), (r.deltaVsPrevious >= 0 ? "▲" : "▼") + " " + Math.abs(r.deltaVsPrevious * 100).toFixed(0) + "%");
			deltaTd.appendChild(pill);
			tr.appendChild(deltaTd);
			adBody.appendChild(tr);
		});
		adTable.appendChild(adBody);
		adTableWrap.appendChild(adTable);
		document.getElementById("lc-adspend-table").appendChild(adTableWrap);

		var chTableWrap = el("div", "lc-table-wrap");
		var chTable = el("table", "lc-table");
		var chHead = el("thead");
		var chHeadRow = el("tr");
		["Channel", "Sessions share", "Conversion rate", "Paid?"].forEach(function (h) {
			chHeadRow.appendChild(el("th", null, h));
		});
		chHead.appendChild(chHeadRow);
		chTable.appendChild(chHead);
		var chBody = el("tbody");
		CHANNELS.rows.forEach(function (r, i) {
			var tr = el("tr");
			var labelTd = el("td");
			labelTd.appendChild(el("span", "lc-mini-swatch lc-cat-" + (i + 1)));
			labelTd.appendChild(document.createTextNode(" " + r.label));
			tr.appendChild(labelTd);
			tr.appendChild(el("td", "lc-num", Math.round(r.sessionShare * 100) + "%"));
			tr.appendChild(el("td", "lc-num", (r.conversionRate * 100).toFixed(1) + "%"));
			tr.appendChild(el("td", null, r.isPaid ? "Paid" : "Organic"));
			chBody.appendChild(tr);
		});
		chTable.appendChild(chBody);
		chTableWrap.appendChild(chTable);
		document.getElementById("lc-channel-table").appendChild(chTableWrap);
	}

	/* ---- Products tab (static — last 30 days) ---- */
	function renderProductsTab() {
		var tableWrap = el("div", "lc-table-wrap");
		var table = el("table", "lc-table");
		var thead = el("thead");
		var headRow = el("tr");
		["Product (real)", "Price (real)", "Views", "Conv. rate", "Units sold", "Revenue", "Attach rate", "Tag"].forEach(function (h) {
			headRow.appendChild(el("th", null, h));
		});
		thead.appendChild(headRow);
		table.appendChild(thead);

		var tbody = el("tbody");
		PRODUCT_SIGNALS.rows.forEach(function (r) {
			var product = PRODUCTS.filter(function (p) {
				return p.name.indexOf(r.product) !== -1 || r.product.indexOf(p.name) !== -1;
			})[0];
			var tr = el("tr");
			tr.appendChild(el("td", null, r.product));
			var priceText = product ? (product.priceType === "from" ? "from $" : "$") + product.price.toLocaleString() : "—";
			tr.appendChild(el("td", "lc-num", priceText));
			tr.appendChild(el("td", "lc-num", r.views.toLocaleString()));
			tr.appendChild(el("td", "lc-num", (r.conversionRate * 100).toFixed(1) + "%"));
			tr.appendChild(el("td", "lc-num", String(r.unitsSold)));
			var revenue = product ? r.unitsSold * product.price : null;
			tr.appendChild(el("td", "lc-num", revenue ? "$" + Math.round(revenue).toLocaleString() : "—"));
			tr.appendChild(el("td", "lc-num", Math.round(r.attachRate * 100) + "%"));
			tr.appendChild(el("td", null, r.tag));
			tbody.appendChild(tr);
		});
		table.appendChild(tbody);
		tableWrap.appendChild(table);
		document.getElementById("lc-product-table").appendChild(tableWrap);

		var card = document.getElementById("lc-product-insight");
		card.appendChild(tag(PRODUCT_SIGNALS.exampleInsight.confidence));
		card.appendChild(el("p", null, PRODUCT_SIGNALS.exampleInsight.text));
	}

	/* ---- Conversion Paths tab: funnel + top paths (static — last 30 days) ---- */
	function renderPathsTab() {
		var funnelWrap = document.getElementById("lc-funnel");
		var rows = FUNNEL_STAGES.rows;
		var max = rows[0].sessions;
		rows.forEach(function (r, i) {
			var row = el("div", "lc-funnel-row");
			row.appendChild(el("div", "lc-funnel-label", r.stage));
			var track = el("div", "lc-funnel-track");
			var fill = el("div", "lc-funnel-fill");
			var widthPct = Math.max(4, Math.round((r.sessions / max) * 100));
			fill.style.width = widthPct + "%";
			// ordinal single-hue ramp: narrower stages get a lighter step of the same accent hue
			var lightness = 100 - i * 15;
			fill.style.background = "color-mix(in srgb, var(--accent) " + lightness + "%, var(--bg-elevated))";
			track.appendChild(fill);
			row.appendChild(track);
			row.appendChild(el("div", "lc-funnel-value", r.sessions.toLocaleString()));
			funnelWrap.appendChild(row);

			if (i < rows.length - 1) {
				var dropPct = Math.round((1 - rows[i + 1].sessions / r.sessions) * 100);
				var dropRow = el("div", "lc-funnel-row");
				var dropCell = el("div", "lc-funnel-drop", "↓ " + dropPct + "% drop-off");
				dropRow.appendChild(el("div"));
				dropRow.appendChild(dropCell);
				dropRow.appendChild(el("div"));
				funnelWrap.appendChild(dropRow);
			}
		});

		var pathsWrap = document.getElementById("lc-paths-table");
		TOP_PATHS.rows.forEach(function (r) {
			var row = el("div", "lc-paths-row");
			r.path.forEach(function (step, i) {
				if (i > 0) row.appendChild(el("span", "lc-path-arrow", "→"));
				row.appendChild(el("span", "lc-path-step", step));
			});
			row.appendChild(el("span", "lc-path-share", Math.round(r.share * 100) + "%"));
			pathsWrap.appendChild(row);
		});
	}

	/* ---- Social tab: real follower counts/bios, simulated engagement ---- */
	function renderSocialTab() {
		document.getElementById("lc-social-note").textContent =
			"Follower counts and bios are real (checked " + SOCIAL_PROFILES.asOf + "); engagement rate, response time and content-mix performance are simulated.";

		var cardsWrap = document.getElementById("lc-social-cards");

		var igMeta = SOCIAL.platforms.filter(function (p) { return p.key === "instagram"; })[0];
		var igCard = el("div", "lc-social-card");
		var igHead = el("div", "lc-social-head");
		igHead.appendChild(el("h4", null, "Instagram"));
		var igLink = el("a", null, SOCIAL_PROFILES.instagram.handle);
		igLink.href = "https://" + SOCIAL_PROFILES.instagram.url;
		igLink.target = "_blank";
		igLink.rel = "noopener";
		igHead.appendChild(igLink);
		igCard.appendChild(igHead);
		igCard.appendChild(tag("verified"));
		igCard.appendChild(el("div", "lc-social-followers", SOCIAL_PROFILES.instagram.followers.toLocaleString()));
		igCard.appendChild(el("div", "lc-social-followers-label", "followers"));
		igCard.appendChild(el("p", "lc-social-bio", "“" + SOCIAL_PROFILES.instagram.bio + "”"));
		var igMetrics = el("div", "lc-social-metrics");
		var igEng = el("div");
		igEng.appendChild(el("strong", null, (igMeta.engagementRate * 100).toFixed(1) + "%"));
		igEng.appendChild(document.createTextNode("engagement rate"));
		var igResp = el("div");
		igResp.appendChild(el("strong", null, igMeta.avgResponseTimeHours + "h"));
		igResp.appendChild(document.createTextNode("avg. response time"));
		igMetrics.appendChild(igEng);
		igMetrics.appendChild(igResp);
		igCard.appendChild(igMetrics);
		cardsWrap.appendChild(igCard);

		var fbMeta = SOCIAL.platforms.filter(function (p) { return p.key === "facebook"; })[0];
		var fbCard = el("div", "lc-social-card");
		var fbHead = el("div", "lc-social-head");
		fbHead.appendChild(el("h4", null, "Facebook"));
		var fbLink = el("a", null, SOCIAL_PROFILES.facebook.name);
		fbLink.href = "https://" + SOCIAL_PROFILES.facebook.url;
		fbLink.target = "_blank";
		fbLink.rel = "noopener";
		fbHead.appendChild(fbLink);
		fbCard.appendChild(fbHead);
		fbCard.appendChild(tag("verified"));
		fbCard.appendChild(el("div", "lc-social-followers", SOCIAL_PROFILES.facebook.followers.toLocaleString()));
		fbCard.appendChild(el("div", "lc-social-followers-label", "followers · " + SOCIAL_PROFILES.facebook.category));
		var fbMetrics = el("div", "lc-social-metrics");
		var fbEng = el("div");
		fbEng.appendChild(el("strong", null, (fbMeta.engagementRate * 100).toFixed(1) + "%"));
		fbEng.appendChild(document.createTextNode("engagement rate"));
		var fbResp = el("div");
		fbResp.appendChild(el("strong", null, fbMeta.avgResponseTimeHours + "h"));
		fbResp.appendChild(document.createTextNode("avg. response time"));
		fbMetrics.appendChild(fbEng);
		fbMetrics.appendChild(fbResp);
		fbCard.appendChild(fbMetrics);
		fbCard.appendChild(el("p", "lc-social-example", SOCIAL_PROFILES.facebook.recentPostExample));
		cardsWrap.appendChild(fbCard);

		var mixWrap = document.getElementById("lc-social-content-mix");
		var maxMix = Math.max.apply(null, SOCIAL.contentMix.map(function (c) { return c.performanceIndex; }));
		SOCIAL.contentMix.slice().sort(function (a, b) { return b.performanceIndex - a.performanceIndex; }).forEach(function (c, i) {
			var row = el("div", "lc-mini-row");
			var label = el("div", "lc-mini-label");
			label.appendChild(el("span", "lc-mini-swatch lc-cat-" + (i + 1)));
			label.appendChild(document.createTextNode(c.type));
			row.appendChild(label);
			var track = el("div", "lc-mini-bar-track");
			var fill = el("div", "lc-mini-bar-fill-cat lc-cat-" + (i + 1));
			fill.style.width = Math.round((c.performanceIndex / maxMix) * 100) + "%";
			track.appendChild(fill);
			row.appendChild(track);
			row.appendChild(el("div", "lc-mini-value", c.performanceIndex.toFixed(1)));
			mixWrap.appendChild(row);
		});

		var socialInsight = document.getElementById("lc-social-insight");
		socialInsight.appendChild(tag(SOCIAL.exampleInsight.confidence));
		socialInsight.appendChild(el("p", null, SOCIAL.exampleInsight.text));
	}

	/* ---- Weekly AI summary — always visible, independent of the tab/range state.
	   Fixed to a 7-day-vs-previous-7-day window (that's what "weekly" means),
	   computed live from the same generator and data as the rest of the
	   dashboard so it can never contradict what's shown elsewhere. ---- */
	function renderWeeklySummary() {
		var movers = Object.keys(METRIC_META)
			.map(function (key) {
				var periods = getPeriodSeries(key, 7, "previous");
				var cur = aggregate(periods.current, key);
				var prev = aggregate(periods.comparison, key);
				return { key: key, label: METRIC_META[key].label, current: cur, deltaPct: ((cur - prev) / prev) * 100, format: METRIC_META[key].format };
			})
			.sort(function (a, b) { return Math.abs(b.deltaPct) - Math.abs(a.deltaPct); });
		var top = movers[0],
			second = movers[1];

		var googleAd = AD_SPEND.rows.filter(function (r) { return r.channel.indexOf("Google") !== -1; })[0];
		var metaAd = AD_SPEND.rows.filter(function (r) { return r.channel.indexOf("Meta") !== -1; })[0];

		function dirWord(pct) { return pct >= 0 ? "up" : "down"; }
		function dirIcon(pct) { return pct >= 0 ? "▲" : "▼"; }
		function dirClass(pct) { return pct >= 0 ? "lc-up" : "lc-down"; }

		var callouts = [
			{
				icon: dirIcon(top.deltaPct),
				iconClass: dirClass(top.deltaPct),
				confidence: "simulated",
				text: top.label + " is " + dirWord(top.deltaPct) + " " + Math.abs(top.deltaPct).toFixed(1) + "% week-over-week (now " + top.format(top.current) + ") — the biggest mover of the four headline metrics this week.",
			},
			{
				icon: dirIcon(second.deltaPct),
				iconClass: dirClass(second.deltaPct),
				confidence: "simulated",
				text: second.label + " is " + dirWord(second.deltaPct) + " " + Math.abs(second.deltaPct).toFixed(1) + "% over the same week.",
			},
			{
				icon: "▲",
				iconClass: "lc-flag",
				confidence: "simulated",
				text: "Meta Ads ROAS (" + (metaAd.revenue / metaAd.spend).toFixed(1) + "x) is trending " + dirWord(metaAd.deltaVsPrevious) + " against last period while Google Ads (" + (googleAd.revenue / googleAd.spend).toFixed(1) + "x) trends " + dirWord(googleAd.deltaVsPrevious) + " — a gap worth watching before shifting budget between them.",
			},
			{
				icon: "▲",
				iconClass: "lc-flag",
				confidence: "hypothesis",
				text: STOCKIST_PERFORMANCE.exampleInsight.text,
			},
		];

		var wrap = document.getElementById("lc-weekly-callouts");
		callouts.forEach(function (c) {
			var row = el("div", "lc-weekly-callout");
			row.appendChild(el("span", "lc-weekly-icon " + c.iconClass, c.icon));
			var body = el("div", "lc-weekly-callout-body");
			body.appendChild(tag(c.confidence));
			body.appendChild(el("p", null, c.text));
			row.appendChild(body);
			wrap.appendChild(row);
		});

		var actions = [
			"Example prompt: check whether the " + top.label.toLowerCase() + " move traces back to one channel or landing page before reacting to it.",
			"Example prompt: compare Meta Ads creative and targeting against whatever's working on Google Ads right now.",
			"Example prompt: ask the Christchurch stockist about their in-store follow-up process (see the Stockist Intelligence screen).",
		];
		var actionsList = document.getElementById("lc-weekly-actions-list");
		actions.forEach(function (a) {
			actionsList.appendChild(el("li", null, a));
		});
	}

	/* ---- tabs ---- */
	function wireTabs() {
		var tabs = document.querySelectorAll(".lc-dash-tab");
		tabs.forEach(function (btn) {
			btn.addEventListener("click", function () {
				tabs.forEach(function (b) {
					b.classList.remove("active");
					b.setAttribute("aria-selected", "false");
				});
				btn.classList.add("active");
				btn.setAttribute("aria-selected", "true");
				document.querySelectorAll(".lc-dash-panel").forEach(function (panel) {
					panel.hidden = panel.getAttribute("data-panel") !== btn.getAttribute("data-tab");
				});
			});
		});
	}

	/* ---- filter row: date range + comparison ---- */
	function wireControls() {
		document.querySelectorAll(".lc-range-btn").forEach(function (btn) {
			btn.addEventListener("click", function () {
				document.querySelectorAll(".lc-range-btn").forEach(function (b) { b.classList.remove("active"); });
				btn.classList.add("active");
				state.range = parseInt(btn.getAttribute("data-range"), 10);
				renderKpiRow();
				renderTrendChart();
			});
		});
		document.querySelectorAll(".lc-compare-btn").forEach(function (btn) {
			btn.addEventListener("click", function () {
				document.querySelectorAll(".lc-compare-btn").forEach(function (b) { b.classList.remove("active"); });
				btn.classList.add("active");
				state.compare = btn.getAttribute("data-compare");
				renderKpiRow();
				renderTrendChart();
			});
		});
	}

	wireTabs();
	wireControls();
	renderKpiRow();
	renderTrendChart();
	renderMiniBreakdown("lc-channel-mini", CHANNELS.rows, "sessionShare");
	renderMiniBreakdown("lc-device-mini", DEVICES.rows, "sessionShare");
	renderAcquisitionTab();
	renderProductsTab();
	renderPathsTab();
	renderSocialTab();
	renderWeeklySummary();
})();

/* ---------- Screen 5: stockist intelligence ---------- */
(function renderStockistSection() {
	var regionCount = STOCKISTS.length;
	var businessCount = STOCKISTS.reduce(function (sum, r) {
		return sum + r.businesses.length;
	}, 0);
	document.getElementById("lc-stockist-lead").textContent =
		"Locomo lists real stockists across " + regionCount + " regions (" + businessCount +
		" stockist touchpoints) nationwide. The region and stockist names below are real — " +
		"the leads/sales/conversion numbers are simulated.";

	var tableWrap = el("div", "lc-table-wrap");
	var table = el("table", "lc-table");
	var thead = el("thead");
	var headRow = el("tr");
	["Region", "Real stockists", "Simulated leads", "Simulated sales", "Simulated conversion"].forEach(function (h) {
		headRow.appendChild(el("th", null, h));
	});
	thead.appendChild(headRow);
	table.appendChild(thead);

	var tbody = el("tbody");
	var maxLeads = Math.max.apply(null, STOCKIST_PERFORMANCE.rows.map(function (r) { return r.leads; }));
	STOCKIST_PERFORMANCE.rows.forEach(function (r) {
		var tr = el("tr");
		tr.appendChild(el("td", null, r.region));
		tr.appendChild(el("td", "lc-num", String(r.stockistsReal)));
		tr.appendChild(el("td", "lc-num", String(r.leads)));
		tr.appendChild(el("td", "lc-num", String(r.sales)));

		var convTd = el("td");
		var barCell = el("div", "lc-bar-cell");
		var track = el("div", "lc-mini-bar-track");
		var fill = el("div", "lc-mini-bar-fill");
		fill.style.width = Math.round((r.leads / maxLeads) * 100) + "%";
		track.appendChild(fill);
		barCell.appendChild(track);
		barCell.appendChild(el("span", "lc-pill", Math.round(r.conversion * 1000) / 10 + "%"));
		convTd.appendChild(barCell);
		tr.appendChild(convTd);

		tbody.appendChild(tr);
	});
	table.appendChild(tbody);
	tableWrap.appendChild(table);
	document.getElementById("lc-stockist-table").appendChild(tableWrap);

	var card = document.getElementById("lc-stockist-insight");
	card.appendChild(tag(STOCKIST_PERFORMANCE.exampleInsight.confidence));
	card.appendChild(el("p", null, STOCKIST_PERFORMANCE.exampleInsight.text));
})();

/* ---------- Screen 6: geographic opportunity scatter ---------- */
(function renderGeoChart() {
	document.getElementById("lc-geo-lead").textContent = GEO_OPPORTUNITY.axisNote;

	var W = 640,
		H = 420,
		PAD = 44;
	var xFor = function (v) {
		return PAD + (v / 10) * (W - PAD * 2);
	};
	var yFor = function (v) {
		return H - PAD - (v / 10) * (H - PAD * 2);
	};

	var svgParts = [];
	svgParts.push('<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Simulated geographic opportunity chart">');

	[0, 2.5, 5, 7.5, 10].forEach(function (v) {
		svgParts.push('<line class="lc-geo-gridline" x1="' + xFor(v) + '" y1="' + PAD + '" x2="' + xFor(v) + '" y2="' + (H - PAD) + '" />');
		svgParts.push('<line class="lc-geo-gridline" x1="' + PAD + '" y1="' + yFor(v) + '" x2="' + (W - PAD) + '" y2="' + yFor(v) + '" />');
	});

	svgParts.push('<text class="lc-geo-axis-label" x="' + W / 2 + '" y="' + (H - 8) + '" text-anchor="middle">Simulated market attractiveness →</text>');
	svgParts.push(
		'<text class="lc-geo-axis-label" x="14" y="' + H / 2 + '" text-anchor="middle" transform="rotate(-90 14 ' + H / 2 + ')">Simulated opportunity →</text>'
	);

	GEO_OPPORTUNITY.rows.forEach(function (r) {
		var x = xFor(r.attractiveness);
		var y = yFor(r.opportunity);
		svgParts.push('<circle class="lc-geo-dot" cx="' + x + '" cy="' + y + '" r="6" />');
		svgParts.push('<text class="lc-geo-dot-label" x="' + (x + 9) + '" y="' + (y + 3) + '">' + r.region + "</text>");
	});

	svgParts.push("</svg>");
	document.getElementById("lc-geo-chart").innerHTML = svgParts.join("");
})();

/* ---------- Screen 7: 90-day approach ---------- */
(function renderRoadmap() {
	var wrap = document.getElementById("lc-roadmap");
	APPROACH_90_DAY.forEach(function (phase) {
		var card = el("div", "lc-phase");
		card.appendChild(el("h3", null, phase.phase));
		card.appendChild(el("p", null, phase.detail));
		wrap.appendChild(card);
	});
})();

/* ---------- Footer source note ---------- */
(function renderFooterNote() {
	document.getElementById("lc-source-note").textContent = "Sources: " + SOURCE_NOTE;
})();

/* ---------- Screen 8: Ask Locomo Intelligence chat widget ---------- */
(function chatWidget() {
	var chat = {
		form: document.getElementById("lc-chat-form"),
		input: document.getElementById("lc-chat-input"),
		send: document.getElementById("lc-chat-send"),
		thread: document.getElementById("lc-chat-thread"),
		suggestions: document.querySelectorAll(".lc-chat-suggestions button"),
		suggestionsWrap: document.querySelector(".lc-chat-suggestions"),
		limit: document.getElementById("lc-chat-limit"),
	};

	var MAX_QUESTIONS = 8;
	var QUESTION_COUNT_KEY = "locomo_chat_question_count";

	function getQuestionCount() {
		try {
			return parseInt(localStorage.getItem(QUESTION_COUNT_KEY), 10) || 0;
		} catch (err) {
			return 0;
		}
	}

	function incrementQuestionCount() {
		try {
			localStorage.setItem(QUESTION_COUNT_KEY, String(getQuestionCount() + 1));
		} catch (err) {
			/* storage unavailable, cap just won't persist across reloads */
		}
	}

	function showLimitReached() {
		chat.form.hidden = true;
		if (chat.suggestionsWrap) chat.suggestionsWrap.hidden = true;
		chat.limit.hidden = false;
	}

	if (getQuestionCount() >= MAX_QUESTIONS) {
		showLimitReached();
	}

	function addMessage(text, cls) {
		var e = document.createElement("div");
		e.className = "lc-msg " + cls;
		e.textContent = text;
		chat.thread.appendChild(e);
		chat.thread.scrollTop = chat.thread.scrollHeight;
		return e;
	}

	function addTyping() {
		var e = document.createElement("div");
		e.className = "lc-msg lc-msg-assistant lc-msg-typing";
		e.innerHTML = "<span></span><span></span><span></span>";
		chat.thread.appendChild(e);
		chat.thread.scrollTop = chat.thread.scrollHeight;
		return e;
	}

	function ask(question) {
		if (!question || !question.trim()) return;
		if (getQuestionCount() >= MAX_QUESTIONS) {
			showLimitReached();
			return;
		}

		incrementQuestionCount();
		addMessage(question, "lc-msg-user");
		chat.input.value = "";
		chat.send.disabled = true;
		var typingEl = addTyping();

		fetch("/api/locomo-chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ message: question }),
		})
			.then(function (response) {
				return response
					.json()
					.catch(function () {
						return { error: "upstream_unavailable", message: "The demo is having a moment — try again shortly." };
					})
					.then(function (data) {
						return { ok: response.ok, data: data };
					});
			})
			.then(function (result) {
				typingEl.remove();
				if (result.ok && result.data.reply) {
					addMessage(result.data.reply, "lc-msg-assistant");
				} else {
					var msg = (result.data && result.data.message) || "The demo is having a moment — try again shortly.";
					addMessage(msg, "lc-msg-error");
				}
			})
			.catch(function () {
				typingEl.remove();
				addMessage("The demo is having a moment — try again shortly.", "lc-msg-error");
			})
			.finally(function () {
				chat.send.disabled = false;
				if (getQuestionCount() >= MAX_QUESTIONS) {
					showLimitReached();
				}
			});
	}

	if (chat.form) {
		chat.form.addEventListener("submit", function (e) {
			e.preventDefault();
			ask(chat.input.value);
		});
	}

	chat.suggestions.forEach(function (btn) {
		btn.addEventListener("click", function () {
			ask(btn.getAttribute("data-q"));
		});
	});
})();
