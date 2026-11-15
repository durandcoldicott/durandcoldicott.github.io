import {
	END_DAY, fmtDate, windowOf, sumOf, compareEnd, repeatRate, dayDate,
	CHANNELS, SOURCES, PRODUCTS, STATUS_LABEL, COHORTS, SUBSCRIBERS, SUBSCRIPTION_AVG_ORDER,
	ACCOUNTS, ACCOUNT_STATUS_LABEL, ageing, FLOWS,
} from "./demo-data.js";

/* ============================== helpers ============================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const nzd0 = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 });
const intFmt = new Intl.NumberFormat("en-NZ", { maximumFractionDigits: 0 });
const money = (v) => nzd0.format(v);
const compact = (v) => (Math.abs(v) >= 1000 ? "$" + (v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k" : "$" + Math.round(v));
const pct0 = (v) => Math.round(v * 100) + "%";
const pct1 = (v) => (v * 100).toFixed(1) + "%";
const signedPct = (v) => (v >= 0 ? "+" : "−") + Math.abs(v * 100).toFixed(1) + "%";
// Arrow + sign + number, so direction never depends on colour alone. Anything that rounds to zero reads as "no change".
// `isPts`: v is already in percentage points; otherwise v is a fraction (0.05 = 5%).
function deltaView(v, isPts) {
	const mag = (isPts ? Math.abs(v) : Math.abs(v * 100)).toFixed(1);
	if (mag === "0.0") return { cls: "", txt: "No change" };
	return { cls: v >= 0 ? "up" : "down", txt: (v >= 0 ? "▲ +" : "▼ −") + mag + (isPts ? " pts" : "%") };
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rangeLabel = (endNum, days) => fmtDate(endNum - days + 1) + " – " + fmtDate(endNum);
const CHANNEL_COLOURS = { online: "var(--cat-1)", subs: "var(--cat-3)", wholesale: "var(--cat-2)", markets: "var(--cat-4)" };

function niceTicks(lo, hi, count) {
	const span = hi - lo || 1;
	const raw = span / count;
	const mag = Math.pow(10, Math.floor(Math.log10(raw)));
	const norm = raw / mag;
	const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
	const out = [];
	for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step / 2; v += step) out.push(+v.toFixed(10));
	return out;
}

// A table that mirrors a chart, for people who can't use (or prefer not to use) the picture.
function altTable(summary, caption, headers, rows) {
	return (
		'<details class="data-alt"><summary>' + esc(summary) + '</summary>' +
		'<div class="table-wrap" tabindex="0" role="region" aria-label="' + esc(caption) + '"><table class="plain"><caption class="visually-hidden">' + esc(caption) + "</caption>" +
		"<thead><tr>" + headers.map((h) => '<th scope="col">' + esc(h) + "</th>").join("") + "</tr></thead><tbody>" +
		rows.map((r) => "<tr><th scope=\"row\">" + esc(r[0]) + "</th>" + r.slice(1).map((c) => "<td>" + esc(c) + "</td>").join("") + "</tr>").join("") +
		"</tbody></table></div></details>"
	);
}

// Redraw a chart whenever its box changes size. Also fires when a hidden tab panel is revealed (0 -> real width).
function whenSized(host, draw) {
	let last = 0;
	const run = () => {
		const w = Math.floor(host.clientWidth);
		if (w > 0 && w !== last) { last = w; draw(); }
	};
	if ("ResizeObserver" in window) new ResizeObserver(run).observe(host);
	window.addEventListener("resize", run);
	run();
	return () => { last = 0; run(); }; // force a redraw (e.g. after the data changes)
}

/* ============================== theme toggle ============================== */

(function initTheme() {
	const btn = $("#theme-toggle");
	if (!btn) return;
	const root = document.documentElement;
	const dark = matchMedia("(prefers-color-scheme: dark)");
	const rendered = () => root.getAttribute("data-theme") || (dark.matches ? "dark" : "light");
	btn.addEventListener("click", () => {
		const target = rendered() === "dark" ? "light" : "dark";
		const system = dark.matches ? "dark" : "light";
		try {
			if (target === system) { root.removeAttribute("data-theme"); localStorage.removeItem("theme"); } // back to following the system
			else { root.setAttribute("data-theme", target); localStorage.setItem("theme", target); }
		} catch (e) {
			if (target === system) root.removeAttribute("data-theme"); else root.setAttribute("data-theme", target);
		}
	});
	window.addEventListener("storage", (e) => {
		if (e.key !== "theme") return;
		if (e.newValue === "light" || e.newValue === "dark") root.setAttribute("data-theme", e.newValue); else root.removeAttribute("data-theme");
	});
})();

/* ============================== tabs ============================== */

(function initTabs() {
	const tablist = $(".tablist");
	const tabs = $$('[role="tab"]', tablist);
	const panels = $$('.tabs > [role="tabpanel"]');
	const panelFor = (tab) => panels.find((p) => p.getAttribute("aria-labelledby") === tab.id);
	const tabFor = (panel) => tabs.find((t) => t.id === panel.getAttribute("aria-labelledby"));
	const nativeFocusgroup = Object.hasOwn(HTMLElement.prototype, "focusGroup");

	function select(tab) {
		tabs.forEach((t) => {
			const on = t === tab;
			t.setAttribute("aria-selected", String(on));
			t.toggleAttribute("focusgroupstart", on);
			if (!nativeFocusgroup) t.tabIndex = on ? 0 : -1;
			const p = panelFor(t);
			if (on) p.removeAttribute("hidden"); else p.setAttribute("hidden", "until-found");
		});
		tab.scrollIntoView({ block: "nearest", inline: "nearest", container: "nearest" });
	}

	tabs.forEach((t) => t.addEventListener("click", () => select(t)));
	// Find-in-page reveals a hidden panel: keep the tab state in sync.
	panels.forEach((p) => p.addEventListener("beforematch", () => select(tabFor(p))));

	if (!nativeFocusgroup) {
		// Fallback for browsers without `focusgroup`: roving focus with the arrow keys; Enter/Space (native button click) selects.
		tabs.forEach((t) => (t.tabIndex = t.getAttribute("aria-selected") === "true" ? 0 : -1));
		tablist.addEventListener("keydown", (e) => {
			const i = tabs.indexOf(document.activeElement);
			if (i < 0) return;
			let next = -1;
			if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
			else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
			else if (e.key === "Home") next = 0;
			else if (e.key === "End") next = tabs.length - 1;
			if (next < 0) return;
			e.preventDefault();
			tabs.forEach((t, j) => (t.tabIndex = j === next ? 0 : -1));
			tabs[next].focus();
		});
	}
})();

/* ============================== sortable tables ============================== */

const sortStatus = document.createElement("div");
sortStatus.setAttribute("role", "status");
sortStatus.className = "visually-hidden";
document.body.appendChild(sortStatus);

/*
  columns: [{ label, num?, value(row) -> sortable value, render(row) -> html string }]; first column becomes the row header.
  `sort` = { index, dir } is the starting order (rows are pre-sorted to match, and aria-sort is set on that header).
*/
function buildSortableTable(table, columns, rows, sort) {
	const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
	const cmp = (a, b, col) => {
		const x = col.value(a), y = col.value(b);
		return typeof x === "number" && typeof y === "number" ? x - y : collator.compare(String(x), String(y));
	};
	const ordered = rows.slice().sort((a, b) => (sort.dir === "ascending" ? 1 : -1) * cmp(a, b, columns[sort.index]));

	const head = "<thead><tr>" + columns.map((c, i) =>
		'<th scope="col"' + (c.num ? ' class="num"' : "") + (i === sort.index ? ' aria-sort="' + sort.dir + '"' : "") + ">" +
		'<button type="button" commandfor="' + table.id + '" command="--sort">' + esc(c.label) + "</button></th>").join("") + "</tr></thead>";
	const body = "<tbody>" + ordered.map((r) => {
		const cells = columns.map((c, i) => {
			const v = c.value(r);
			if (i === 0) return '<th scope="row" data-value="' + esc(v) + '">' + c.render(r) + "</th>";
			return '<td data-label="' + esc(c.label) + '" data-value="' + esc(v) + '"' + (c.num ? ' class="num"' : "") + ">" + c.render(r) + "</td>";
		}).join("");
		return "<tr>" + cells + "</tr>";
	}).join("") + "</tbody>";
	const caption = table.querySelector("caption");
	table.innerHTML = "";
	if (caption) table.appendChild(caption);
	table.insertAdjacentHTML("beforeend", head + body);

	const tbody = table.tBodies[0];
	const numericCols = columns.map((c) => typeof c.value(rows[0]) === "number");

	function sortBy(th) {
		const idx = th.cellIndex;
		const dir = th.getAttribute("aria-sort") === "ascending" ? "descending" : "ascending";
		$$("th", table.tHead).forEach((h) => h.removeAttribute("aria-sort"));
		th.setAttribute("aria-sort", dir);
		const factor = dir === "ascending" ? 1 : -1;
		const read = (row) => { const el = row.cells[idx]; const v = el.dataset.value; return numericCols[idx] ? parseFloat(v) : v; };
		const sorted = Array.from(tbody.rows).sort((a, b) => {
			const x = read(a), y = read(b);
			return factor * (typeof x === "number" ? x - y : collator.compare(x, y));
		});
		// Move the existing rows (don't rebuild them) so focus and hover state survive; moveBefore keeps state where supported.
		sorted.forEach((row) => (tbody.moveBefore ? tbody.moveBefore(row, null) : tbody.appendChild(row)));
		sortStatus.textContent = "Sorted by " + th.textContent.trim() + ", " + dir + ", " + sorted.length + " rows";
	}

	if ("CommandEvent" in window) {
		table.addEventListener("command", (e) => { if (e.command === "--sort") sortBy(e.source.closest("th")); });
	} else {
		$$("th > button", table.tHead).forEach((b) => b.addEventListener("click", () => sortBy(b.closest("th"))));
	}
}

/* ============================== charts ============================== */

function drawLine(host) {
	const cfg = host._cfg;
	const w = Math.floor(host.clientWidth);
	if (!cfg || w < 50) return;
	const h = Math.round(Math.min(320, Math.max(220, w * 0.36)));
	const m = { t: 10, r: 10, b: 28, l: 50 };
	const iw = w - m.l - m.r, ih = h - m.t - m.b;
	const n = cfg.cur.length;
	const all = cfg.cur.concat(cfg.cmp);
	let lo = cfg.zero ? 0 : Math.min.apply(null, all), hi = Math.max.apply(null, all);
	if (!cfg.zero) { const pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad; }
	const ticks = niceTicks(lo, hi, 4);
	lo = ticks[0]; hi = ticks[ticks.length - 1];
	const X = (i) => m.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
	const Y = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;
	const path = (arr) => arr.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join("");

	let svg = '<svg viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" aria-hidden="true">';
	ticks.forEach((t) => {
		svg += '<line class="axis-line" x1="' + m.l + '" x2="' + (w - m.r) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/>' +
			'<text class="axis-text" x="' + (m.l - 8) + '" y="' + (Y(t) + 4) + '" text-anchor="end">' + esc(cfg.tick(t)) + "</text>";
	});
	const narrow = w < 480;
	const labelIdx = n <= 7
		? cfg.cur.map((_, i) => i).filter((i) => !narrow || i % 2 === 0)
		: Array.from(new Set((narrow ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map((f) => Math.round(f * (n - 1)))));
	labelIdx.forEach((i, k) => {
		const anchor = k === 0 ? "start" : i === n - 1 ? "end" : "middle";
		svg += '<text class="axis-text" x="' + X(i) + '" y="' + (h - 8) + '" text-anchor="' + anchor + '">' + esc(fmtDate(cfg.dates[i])) + "</text>";
	});
	if (cfg.zero) svg += '<path class="ln-area" d="' + path(cfg.cur) + "L" + X(n - 1) + " " + Y(lo) + "L" + X(0) + " " + Y(lo) + 'Z"/>'; // an area only reads honestly from a zero baseline
	svg += '<path class="ln-cmp" d="' + path(cfg.cmp) + '"/><path class="ln-cur" d="' + path(cfg.cur) + '"/>';
	svg += '<line class="hover-line" x1="0" x2="0" y1="' + m.t + '" y2="' + (m.t + ih) + '" visibility="hidden"/>' +
		'<circle class="dot-cmp" r="4.5" visibility="hidden"/><circle class="dot-cur" r="5" visibility="hidden"/>' +
		'<rect class="hit" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '" fill="transparent"/></svg>';
	host.innerHTML = svg + '<div class="tooltip" hidden></div>';

	const el = $("svg", host), vline = $(".hover-line", host), dCur = $(".dot-cur", host), dCmp = $(".dot-cmp", host), tip = $(".tooltip", host), hit = $(".hit", host);
	function show(evt) {
		const r = el.getBoundingClientRect();
		const i = Math.max(0, Math.min(n - 1, Math.round(((evt.clientX - r.left - m.l) / iw) * (n - 1))));
		const x = X(i);
		vline.setAttribute("x1", x); vline.setAttribute("x2", x); vline.setAttribute("visibility", "visible");
		dCur.setAttribute("cx", x); dCur.setAttribute("cy", Y(cfg.cur[i])); dCur.setAttribute("visibility", "visible");
		dCmp.setAttribute("cx", x); dCmp.setAttribute("cy", Y(cfg.cmp[i])); dCmp.setAttribute("visibility", "visible");
		const d = cfg.cmp[i] ? (cfg.cur[i] - cfg.cmp[i]) / cfg.cmp[i] : 0;
		tip.innerHTML = "<b>" + esc(fmtDate(cfg.dates[i], { weekday: "short" })) + "</b>" +
			'<div class="tt-row"><span>This period</span><span>' + esc(cfg.fmt(cfg.cur[i])) + "</span></div>" +
			'<div class="tt-row"><span>' + esc(fmtDate(cfg.cmpDates[i], { year: "numeric" })) + "</span><span>" + esc(cfg.fmt(cfg.cmp[i])) + "</span></div>" +
			(cfg.showDelta ? '<div class="tt-row"><span>Change</span><span>' + signedPct(d) + "</span></div>" : "");
		tip.hidden = false;
		const tw = tip.offsetWidth;
		tip.style.top = m.t + 6 + "px";
		tip.style.left = (x + 14 + tw > w ? x - tw - 14 : x + 14) + "px";
	}
	function hide() { tip.hidden = true; vline.setAttribute("visibility", "hidden"); dCur.setAttribute("visibility", "hidden"); dCmp.setAttribute("visibility", "hidden"); }
	hit.addEventListener("pointermove", show);
	hit.addEventListener("pointerdown", show);
	hit.addEventListener("pointerleave", hide);
}

function drawScatter(host) {
	const cfg = host._cfg;
	const w = Math.floor(host.clientWidth);
	if (!cfg || w < 50) return;
	const h = Math.round(Math.min(420, Math.max(300, w * 0.5)));
	const m = { t: 16, r: 16, b: 40, l: 52 };
	const iw = w - m.l - m.r, ih = h - m.t - m.b;
	const pts = cfg.points;
	const xTicks = niceTicks(0, Math.max.apply(null, pts.map((p) => p.x)), 5);
	const yMin = Math.min.apply(null, pts.map((p) => p.y)), yMax = Math.max.apply(null, pts.map((p) => p.y));
	const yTicks = niceTicks(yMin - 3, yMax + 3, 4);
	const x0 = xTicks[0], x1 = xTicks[xTicks.length - 1], y0 = yTicks[0], y1 = yTicks[yTicks.length - 1];
	const X = (v) => m.l + ((v - x0) / (x1 - x0)) * iw;
	const Y = (v) => m.t + ih - ((v - y0) / (y1 - y0)) * ih;
	const maxRev = Math.max.apply(null, pts.map((p) => p.rev));

	let svg = '<svg viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" aria-hidden="true">';
	yTicks.forEach((t) => {
		svg += '<line class="axis-line" x1="' + m.l + '" x2="' + (w - m.r) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/><text class="axis-text" x="' + (m.l - 8) + '" y="' + (Y(t) + 4) + '" text-anchor="end">' + t + "%</text>";
	});
	xTicks.forEach((t) => {
		svg += '<text class="axis-text" x="' + X(t) + '" y="' + (h - 18) + '" text-anchor="middle">' + intFmt.format(t) + "</text>";
	});
	svg += '<text class="axis-text" x="' + (m.l + iw / 2) + '" y="' + (h - 2) + '" text-anchor="middle">Units sold, last 30 days</text>';
	svg += '<text class="axis-text" transform="translate(12 ' + (m.t + ih / 2) + ') rotate(-90)" text-anchor="middle">Gross margin</text>';

	const placed = [];
	const items = pts.map((p) => ({ p: p, x: X(p.x), y: Y(p.y), r: 5 + 10 * Math.sqrt(p.rev / maxRev) }));
	const dotBox = (it) => ({ l: it.x - it.r - 1, r: it.x + it.r + 1, t: it.y - it.r - 1, b: it.y + it.r + 1 });
	const clash = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
	items.slice().sort((a, b) => b.r - a.r).forEach((it) => {
		const tw = it.p.label.length * 6.8 + 6, th = 13; // generous: the real text width varies with the font
		const opts = [
			{ x: it.x + it.r + 5, y: it.y + 4, a: "start" }, { x: it.x - it.r - 5, y: it.y + 4, a: "end" },
			{ x: it.x, y: it.y - it.r - 6, a: "middle" }, { x: it.x, y: it.y + it.r + 15, a: "middle" },
		];
		const box = (o) => { const l = o.a === "start" ? o.x : o.a === "end" ? o.x - tw : o.x - tw / 2; return { l: l, r: l + tw, t: o.y - th, b: o.y + 3 }; };
		const free = (o) => {
			const b = box(o);
			return b.l >= 0 && b.r <= w && b.t >= 0 && !placed.some((q) => clash(b, q)) && !items.some((other) => other !== it && clash(b, dotBox(other)));
		};
		const ok = opts.find(free) || opts[0];
		placed.push(box(ok));
		it.label = ok;
	});
	items.forEach((it, i) => {
		svg += '<circle class="sc-dot' + (it.p.flag ? " flag" : "") + '" data-i="' + i + '" cx="' + it.x + '" cy="' + it.y + '" r="' + it.r + '"/>' +
			'<text class="sc-label" x="' + it.label.x + '" y="' + it.label.y + '" text-anchor="' + it.label.a + '">' + esc(it.p.label) + "</text>";
	});
	svg += "</svg>";
	host.innerHTML = svg + '<div class="tooltip" hidden></div>';

	const tip = $(".tooltip", host);
	$$(".sc-dot", host).forEach((c) => {
		const it = items[+c.dataset.i];
		c.addEventListener("pointerenter", () => {
			tip.innerHTML = "<b>" + esc(it.p.name) + "</b>" + it.p.rows.map((r) => '<div class="tt-row"><span>' + esc(r[0]) + "</span><span>" + esc(r[1]) + "</span></div>").join("");
			tip.hidden = false;
			const tw = tip.offsetWidth;
			tip.style.top = Math.max(0, it.y - it.r - tip.offsetHeight - 6) + "px";
			tip.style.left = Math.min(Math.max(0, it.x - tw / 2), w - tw) + "px";
		});
		c.addEventListener("pointerleave", () => (tip.hidden = true));
	});
}

/* ============================== 1. overview ============================== */

const overview = { range: 30, compare: "prev", metric: "revenue" };

function totalsOf(arr) {
	const revenue = sumOf(arr, (x) => x.revenue), orders = sumOf(arr, (x) => x.orders), cogs = sumOf(arr, (x) => x.cogs);
	return { revenue: revenue, orders: orders, aov: revenue / orders, margin: (revenue - cogs) / revenue };
}

function renderOverview() {
	const days = overview.range;
	const cur = windowOf(END_DAY, days);
	const cEnd = compareEnd(overview.compare, days);
	const cmp = windowOf(cEnd, days);
	const tc = totalsOf(cur), tp = totalsOf(cmp);
	const vs = overview.compare === "yoy" ? "vs same dates last year" : "vs previous " + days + " days";

	/* KPI tiles */
	const spark = (vals) => {
		const lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
		const pts = vals.map((v, i) => ((i / (vals.length - 1)) * 120).toFixed(1) + "," + (26 - ((v - lo) / (hi - lo || 1)) * 24).toFixed(1)).join(" ");
		return '<svg class="kpi-spark" viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts + '"/></svg>';
	};
	const rc = repeatRate(END_DAY, days, "cur"), rp = repeatRate(cEnd, days, overview.compare === "yoy" ? "yoy" : "prev");
	const tiles = [
		{ label: "Revenue", value: money(tc.revenue), delta: (tc.revenue - tp.revenue) / tp.revenue, spark: cur.map((x) => x.revenue) },
		{ label: "Orders", value: intFmt.format(tc.orders), delta: (tc.orders - tp.orders) / tp.orders, spark: cur.map((x) => x.orders) },
		{ label: "Average order value", value: "$" + tc.aov.toFixed(2), delta: (tc.aov - tp.aov) / tp.aov, spark: cur.map((x) => x.revenue / x.orders) },
		{ label: "Gross margin", value: pct1(tc.margin), pts: (tc.margin - tp.margin) * 100, spark: cur.map((x) => (x.revenue - x.cogs) / x.revenue) },
		{ label: "Repeat customers", value: pct1(rc), pts: (rc - rp) * 100 },
	];
	$("#kpis").innerHTML = tiles.map((t) => {
		const isPts = t.pts !== undefined;
		const dv = deltaView(isPts ? t.pts : t.delta, isPts);
		return '<div class="kpi"><p class="kpi-label">' + t.label + '</p><p class="kpi-value">' + t.value + '</p><p class="kpi-delta"><span class="' + dv.cls + '">' + dv.txt + "</span> " + vs + "</p>" + (t.spark ? spark(t.spark) : "") + "</div>";
	}).join("");

	/* trend chart */
	const metrics = {
		revenue: { label: "Revenue", pick: (x) => x.revenue, fmt: money, tick: compact, zero: true, delta: true },
		orders: { label: "Orders", pick: (x) => x.orders, fmt: (v) => intFmt.format(v), tick: (v) => intFmt.format(v), zero: true, delta: true },
		margin: { label: "Gross margin", pick: (x) => ((x.revenue - x.cogs) / x.revenue) * 100, fmt: (v) => v.toFixed(1) + "%", tick: (v) => Math.round(v) + "%", zero: false, delta: false },
	};
	const M = metrics[overview.metric];
	// Longer ranges plot a 7-day average: both periods then compare like with like despite their weekly rhythm.
	const smooth = days >= 30;
	const seriesFor = (endNum) => {
		const v = windowOf(endNum, days + (smooth ? 6 : 0)).map(M.pick);
		return smooth ? v.slice(6).map((_, i) => v.slice(i, i + 7).reduce((a, b) => a + b, 0) / 7) : v;
	};
	const curVals = seriesFor(END_DAY), cmpVals = seriesFor(cEnd);
	const host = $("#trend-chart");
	host._cfg = { cur: curVals, cmp: cmpVals, dates: cur.map((x) => x.n), cmpDates: cmp.map((x) => x.n), fmt: M.fmt, tick: M.tick, zero: M.zero && !smooth, showDelta: M.delta };
	const cmpName = overview.compare === "yoy" ? "Same dates last year" : "Previous " + days + " days";
	host.setAttribute("aria-label", M.label + (smooth ? " (7-day average)" : " by day") + " for the last " + days + " days compared with " + cmpName.toLowerCase() + ". The same numbers are in the table below.");
	$("#trend-legend").innerHTML = '<span><i></i>Last ' + days + " days (" + rangeLabel(END_DAY, days) + ')</span><span><i class="dashed"></i>' + cmpName + " (" + rangeLabel(cEnd, days) + ")</span>" + (smooth ? "<span>Each point is a 7-day average, so weekly ups and downs don't swamp the trend.</span>" : "");
	drawLine(host);
	const avgNote = smooth ? " (7-day average)" : "";
	$("#trend-th-cur").textContent = M.label + avgNote + ", this period";
	$("#trend-th-cmp").textContent = M.label + avgNote + ", " + cmpName.toLowerCase();
	$("#trend-tbody").innerHTML = cur.map((x, i) => "<tr><th scope=\"row\">" + esc(fmtDate(x.n, { weekday: "short" })) + "</th><td>" + esc(M.fmt(curVals[i])) + "</td><td>" + esc(M.fmt(cmpVals[i])) + "</td></tr>").join("");

	/* channel mix */
	const rows = CHANNELS.map((c) => {
		const a = sumOf(cur, (x) => x.ch[c.key].revenue), b = sumOf(cmp, (x) => x.ch[c.key].revenue);
		return { c: c, rev: a, share: a / tc.revenue, delta: (a - b) / b };
	}).sort((x, y) => y.rev - x.rev);
	const maxRev = rows[0].rev;
	$("#channel-bars").innerHTML = '<div class="bars">' + rows.map((r) =>
		'<div class="bar-row"><div class="bar-top"><span>' + r.c.label + '</span><span class="bar-val">' + money(r.rev) + " · " + pct0(r.share) + "</span></div>" +
		'<div class="bar-track"><div class="bar-fill" style="--w:' + ((r.rev / maxRev) * 100).toFixed(1) + "%;--c:" + CHANNEL_COLOURS[r.c.key] + '"></div></div>' +
		'<div class="bar-sub"><span class="' + deltaView(r.delta).cls + '">' + deltaView(r.delta).txt + "</span> " + vs + "</div></div>").join("") + "</div>";

	/* weekly rhythm */
	const order = [1, 2, 3, 4, 5, 6, 0];
	const names = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 0: "Sun" };
	const avg = order.map((dow) => {
		const sel = cur.filter((x) => dayDate(x.n).getUTCDay() === dow);
		return sel.length ? sumOf(sel, (x) => x.revenue) / sel.length : 0;
	});
	const peak = Math.max.apply(null, avg);
	$("#weekday-note").textContent = "Average revenue for each day of the week, over the last " + days + " days.";
	$("#weekday-bars").innerHTML = '<div class="week-cols" role="img" aria-label="Average revenue by day of week: ' + order.map((d, i) => names[d] + " " + compact(avg[i])).join(", ") + '">' +
		order.map((d, i) => '<div class="week-col"><b>' + compact(avg[i]) + '</b><div class="wc-bar' + (avg[i] === peak ? " peak" : "") + '" style="--h:' + ((avg[i] / peak) * 100).toFixed(1) + '%"></div><span>' + names[d] + "</span></div>").join("") + "</div>";
}

(function wireOverview() {
	const setPressed = (group, attr, value) => $$("button", group).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[attr] === String(value))));
	$("#range-seg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; overview.range = +b.dataset.range; setPressed($("#range-seg"), "range", overview.range); renderOverview(); });
	$("#compare-seg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; overview.compare = b.dataset.compare; setPressed($("#compare-seg"), "compare", overview.compare); renderOverview(); });
	$("#metric-seg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; overview.metric = b.dataset.metric; setPressed($("#metric-seg"), "metric", overview.metric); renderOverview(); });
	whenSized($("#trend-chart"), () => drawLine($("#trend-chart")));
	renderOverview();
})();

/* ============================== 2. products & stock ============================== */

(function products() {
	const flagged = PRODUCTS.filter((p) => p.status !== "ok").sort((a, b) => a.cover - b.cover);
	const top = PRODUCTS.slice().sort((a, b) => b.revenue - a.revenue)[0];
	const thin = PRODUCTS.slice().sort((a, b) => a.margin - b.margin)[0];
	const now = PRODUCTS.filter((p) => p.status === "now");
	$("#stock-callouts").innerHTML =
		'<div class="callout' + (now.length ? " bad" : flagged.length ? " warn" : "") + '"><span class="tagline">Stock</span><b>' + flagged.length + " of " + PRODUCTS.length + " products</b> are inside their reorder window" +
		(flagged.length ? ": " + flagged.slice(0, 3).map((p) => esc(p.short) + " (" + Math.round(p.cover) + " days left)").join(", ") + "." : ".") + "</div>" +
		'<div class="callout"><span class="tagline">Biggest earner</span><b>' + esc(top.name) + "</b> brings in " + money(top.revenue) + " at a " + pct0(top.margin) + " margin.</div>" +
		'<div class="callout"><span class="tagline">Thinnest margin</span><b>' + esc(thin.name) + "</b> keeps " + pct0(thin.margin) + " of each sale, the lowest in the range.</div>";

	const pill = (s) => '<span class="pill ' + s + '">' + STATUS_LABEL[s] + "</span>";
	const rank = { now: 0, soon: 1, ok: 2 };
	buildSortableTable($("#products-table"), [
		{ label: "Product", value: (p) => p.name, render: (p) => esc(p.name) },
		{ label: "Units sold", num: true, value: (p) => p.units30, render: (p) => intFmt.format(p.units30) },
		{ label: "Revenue", num: true, value: (p) => Math.round(p.revenue), render: (p) => money(p.revenue) },
		{ label: "Margin", num: true, value: (p) => +(p.margin * 100).toFixed(2), render: (p) => pct1(p.margin) },
		{ label: "Stock cover", num: true, value: (p) => +p.cover.toFixed(1), render: (p) => Math.round(p.cover) + " days" },
		{ label: "Status", value: (p) => rank[p.status], render: (p) => pill(p.status) },
	], PRODUCTS, { index: 2, dir: "descending" });

	const host = $("#scatter-chart");
	const pts = PRODUCTS.map((p) => ({
		x: p.units30, y: +(p.margin * 100).toFixed(1), rev: p.revenue, label: p.short + (p.status === "ok" ? "" : " ↻"), name: p.name, flag: p.status !== "ok",
		rows: [["Units", intFmt.format(p.units30)], ["Revenue", money(p.revenue)], ["Margin", pct1(p.margin)], ["Stock cover", Math.round(p.cover) + " days"], ["Status", STATUS_LABEL[p.status]]],
	}));
	host._cfg = { points: pts };
	whenSized(host, () => drawScatter(host));
	host.insertAdjacentHTML("afterend", altTable("View the chart's data as a table", "Units sold and gross margin for each product", ["Product", "Units sold", "Gross margin"], PRODUCTS.map((p) => [p.name, intFmt.format(p.units30), pct1(p.margin)])));
})();

/* ============================== 3. customers ============================== */

(function customers() {
	const last = SUBSCRIBERS[SUBSCRIBERS.length - 1], prev = SUBSCRIBERS[SUBSCRIBERS.length - 2];
	const churn = last.churned / prev.active, churnPrev = prev.churned / SUBSCRIBERS[SUBSCRIBERS.length - 3].active;
	const rc = repeatRate(END_DAY, 30, "cur"), rp = repeatRate(END_DAY - 30, 30, "prev");
	const tile = (label, value, d, unit, goodWhenUp) => {
		const dv = deltaView(d, true); // d is already a plain number (% or points)
		const good = goodWhenUp ? d >= 0 : d <= 0;
		return '<div class="kpi"><p class="kpi-label">' + label + '</p><p class="kpi-value">' + value + '</p><p class="kpi-delta"><span class="' + (dv.cls ? (good ? "up" : "down") : "") + '">' + dv.txt.replace(" pts", unit) + "</span> vs last month</p></div>";
	};
	$("#cust-kpis").innerHTML =
		tile("Active subscribers", intFmt.format(last.active), ((last.active - prev.active) / prev.active) * 100, "%", true) +
		tile("Monthly cancellations", pct1(churn), (churn - churnPrev) * 100, " pts", false) +
		tile("Subscription revenue / month", money(last.active * SUBSCRIPTION_AVG_ORDER), ((last.active - prev.active) / prev.active) * 100, "%", true) +
		tile("Repeat customers (30 days)", pct1(rc), (rc - rp) * 100, " pts", true);

	const maxK = COHORTS.length - 1;
	let html = '<thead><tr><th scope="col">First ordered</th>';
	for (let k = 0; k <= maxK; k++) html += '<th scope="col">' + (k === 0 ? "Start" : "+" + k + " mo") + "</th>";
	html += "</tr></thead><tbody>";
	COHORTS.forEach((c) => {
		html += '<tr><th scope="row">' + esc(c.label) + '<span class="cohort-size">' + c.size + " customers</span></th>";
		for (let k = 0; k <= maxK; k++) {
			const v = c.retention[k];
			html += v === undefined ? '<td class="empty"></td>' : '<td class="' + (k === 0 ? "k0" : "") + '" style="--v:' + v + '">' + Math.round(v) + "%</td>";
		}
		html += "</tr>";
	});
	$("#cohort-table").insertAdjacentHTML("beforeend", html + "</tbody>");

	const maxVal = Math.max.apply(null, SUBSCRIBERS.map((s) => Math.max(s.added, s.churned)));
	$("#subs-chart").innerHTML =
		'<div class="subs-cols" role="img" aria-label="New subscribers and cancellations for each of the last 12 months. The same numbers are in the table below.">' +
		SUBSCRIBERS.map((s) =>
			'<div class="subs-col"><div class="up-bar" style="--h:' + ((s.added / maxVal) * 82).toFixed(1) + 'px"><em>+' + s.added + "</em></div>" +
			'<div class="mlabel">' + esc(s.label.split(" ")[0]) + "<span> " + esc(s.label.split(" ")[1] || "") + "</span></div>" +
			'<div class="down-bar" style="--h:' + ((s.churned / maxVal) * 40).toFixed(1) + 'px"><em>−' + s.churned + "</em></div></div>").join("") + "</div>" +
		altTable("View the chart's data as a table", "Subscriber movement by month", ["Month", "New", "Cancelled", "Active at month end"], SUBSCRIBERS.map((s) => [s.label, "+" + s.added, "−" + s.churned, intFmt.format(s.active)]));
})();

/* ============================== 4. wholesale & cash ============================== */

(function wholesale() {
	const owing = sumOf(ACCOUNTS, (a) => a.owing);
	const late = ACCOUNTS.filter((a) => a.overdueDays > 0);
	const lateTotal = sumOf(late, (a) => a.owing);
	const quiet = ACCOUNTS.filter((a) => a.status === "quiet");
	const tile = (label, value, sub) => '<div class="kpi"><p class="kpi-label">' + label + '</p><p class="kpi-value">' + value + '</p><p class="kpi-delta">' + sub + "</p></div>";
	$("#ws-kpis").innerHTML =
		tile("Café accounts", ACCOUNTS.length, "ordered in the last 6 weeks") +
		tile("Invoices outstanding", money(owing), "across " + ACCOUNTS.filter((a) => a.owing).length + " accounts") +
		tile("Overdue", money(lateTotal), '<span class="' + (late.length ? "down" : "up") + '">' + late.length + " invoice" + (late.length === 1 ? "" : "s") + " late</span>") +
		tile("Gone quiet", String(quiet.length), '<span class="' + (quiet.length ? "down" : "up") + '">' + (quiet.length ? quiet.map((a) => esc(a.name)).join(", ") : "none") + "</span>");

	const buckets = ageing();
	const total = sumOf(buckets, (b) => b.amount) || 1;
	const colours = ["var(--accent)", "var(--cat-4)", "var(--cat-2)", "var(--bad)"];
	$("#ageing-bar").innerHTML =
		'<div class="stack" role="img" aria-label="Outstanding invoices by lateness: ' + buckets.map((b) => b.label + " " + money(b.amount)).join(", ") + '">' +
		buckets.map((b, i) => '<span style="--w:' + ((b.amount / total) * 100).toFixed(2) + "%;--c:" + colours[i] + '"></span>').join("") + "</div>" +
		'<ul class="stack-legend">' + buckets.map((b, i) => '<li><i style="--c:' + colours[i] + '"></i><span>' + b.label + ": <b>" + money(b.amount) + "</b></span></li>").join("") + "</ul>";

	const rank = { quiet: 0, watch: 1, regular: 2 };
	const pill = (s) => '<span class="pill ' + s + '">' + ACCOUNT_STATUS_LABEL[s] + "</span>";
	const rows = ACCOUNTS.slice().sort((a, b) => rank[a.status] - rank[b.status] || b.ratio - a.ratio);
	buildSortableTable($("#accounts-table"), [
		{ label: "Café", value: (a) => a.name, render: (a) => esc(a.name) },
		{ label: "Usual gap", num: true, value: (a) => a.intervalDays, render: (a) => "every " + a.intervalDays + " days" },
		{ label: "Last order", num: true, value: (a) => a.since, render: (a) => a.since + " days ago" },
		{ label: "Typical order", num: true, value: (a) => a.orderValue, render: (a) => money(a.orderValue) },
		{ label: "Owing", num: true, value: (a) => a.owing, render: (a) => (a.owing ? money(a.owing) : "–") },
		{ label: "Days late", num: true, value: (a) => a.overdueDays, render: (a) => (a.overdueDays > 0 ? '<span class="pill late">' + a.overdueDays + " days</span>" : "–") },
		{ label: "Status", value: (a) => rank[a.status], render: (a) => pill(a.status) },
	], rows, { index: 6, dir: "ascending" });
})();

/* ============================== 5. email ============================== */

(function email() {
	const flows = FLOWS.filter((f) => f.kind === "flow"), camps = FLOWS.filter((f) => f.kind === "campaign");
	const revF = sumOf(flows, (f) => f.revenue), revC = sumOf(camps, (f) => f.revenue);
	const sendF = sumOf(flows, (f) => f.recipients), sendC = sumOf(camps, (f) => f.recipients);
	const share = (a, b) => (a / (a + b)) * 100;
	const bar = (label, a, b, fmtv) =>
		'<p class="bar-top" style="margin:14px 0 6px"><span>' + label + '</span><span class="bar-val">Flows ' + fmtv(a) + " · Campaigns " + fmtv(b) + "</span></p>" +
		'<div class="stack" role="img" aria-label="' + label + ': flows ' + share(a, b).toFixed(0) + '%, campaigns ' + share(b, a).toFixed(0) + '%"><span style="--w:' + share(a, b).toFixed(1) + '%;--c:var(--accent)"></span><span style="--w:' + share(b, a).toFixed(1) + '%;--c:var(--cat-4)"></span></div>';
	$("#email-split").innerHTML =
		bar("Share of emails sent", sendF, sendC, intFmt.format) + bar("Share of revenue", revF, revC, money) +
		'<ul class="stack-legend"><li><i style="--c:var(--accent)"></i><span>Automated flows</span></li><li><i style="--c:var(--cat-4)"></i><span>One-off campaigns</span></li></ul>' +
		'<p class="card-note" style="margin-top:14px">Flows made <b>' + pct0(revF / (revF + revC)) + "</b> of email revenue from <b>" + pct0(sendF / (sendF + sendC)) + "</b> of the emails sent.</p>";

	buildSortableTable($("#flows-table"), [
		{ label: "Email", value: (f) => f.name, render: (f) => esc(f.name) },
		{ label: "Type", value: (f) => f.kind, render: (f) => '<span class="pill plain">' + (f.kind === "flow" ? "Flow" : "Campaign") + "</span>" },
		{ label: "Sent", num: true, value: (f) => f.recipients, render: (f) => intFmt.format(f.recipients) },
		{ label: "Opened", num: true, value: (f) => f.open, render: (f) => pct1(f.open) },
		{ label: "Clicked", num: true, value: (f) => f.click, render: (f) => pct1(f.click) },
		{ label: "Bought", num: true, value: (f) => f.conv, render: (f) => pct1(f.conv) },
		{ label: "Revenue", num: true, value: (f) => f.revenue, render: (f) => money(f.revenue) },
		{ label: "Per email sent", num: true, value: (f) => +f.perRecipient.toFixed(3), render: (f) => "$" + f.perRecipient.toFixed(2) },
	], FLOWS, { index: 6, dir: "descending" });
})();

/* ============================== automations: the Monday briefing ============================== */

(function briefing() {
	const dow = dayDate(END_DAY).getUTCDay();
	const sunday = END_DAY - dow; // last complete Mon–Sun week ends on the most recent Sunday
	const wk = windowOf(sunday, 7), prevWk = windowOf(sunday - 7, 7);
	const rev = sumOf(wk, (x) => x.revenue), revP = sumOf(prevWk, (x) => x.revenue);
	const ord = sumOf(wk, (x) => x.orders), ordP = sumOf(prevWk, (x) => x.orders);
	const ch = CHANNELS.map((c) => {
		const a = sumOf(wk, (x) => x.ch[c.key].revenue), b = sumOf(prevWk, (x) => x.ch[c.key].revenue);
		return { c: c, a: a, d: (a - b) / b };
	}).sort((x, y) => y.d - x.d);
	const best = ch[0], worst = ch[ch.length - 1];
	const stockNow = PRODUCTS.filter((p) => p.status === "now"), stockSoon = PRODUCTS.filter((p) => p.status === "soon");
	const quiet = ACCOUNTS.filter((a) => a.status === "quiet");
	const late = ACCOUNTS.filter((a) => a.overdueDays > 0).sort((a, b) => b.overdueDays - a.overdueDays);
	const lateTotal = sumOf(late, (a) => a.owing);
	const mon = fmtDate(sunday - 6), sun = fmtDate(sunday);
	const names = (list, f) => list.map(f).join(", ");

	const stockLine = stockNow.length
		? "<b>" + stockNow.length + " product" + (stockNow.length > 1 ? "s need" : " needs") + " a reorder now</b> (" + names(stockNow, (p) => esc(p.short)) + ")" + (stockSoon.length ? ", and " + stockSoon.length + " more soon (" + names(stockSoon, (p) => esc(p.short)) + ")." : ".")
		: stockSoon.length ? stockSoon.length + " product" + (stockSoon.length > 1 ? "s are" : " is") + " inside the reorder window (" + names(stockSoon, (p) => esc(p.short)) + ")." : "Nothing is close to running out.";

	const actions = [];
	if (stockNow.length) actions.push("Schedule a roast for <b>" + esc(stockNow[0].name) + "</b>: it has about " + Math.round(stockNow[0].cover) + " days of stock and takes " + stockNow[0].leadDays + " to replace.");
	if (quiet.length) actions.push("Check in with <b>" + esc(quiet[0].name) + "</b>. It's been " + quiet[0].since + " days since their last order; they usually order every " + quiet[0].intervalDays + ".");
	if (late.length) actions.push("Approve the reminder draft for <b>" + esc(late[0].name) + "</b> (" + money(late[0].owing) + ", " + late[0].overdueDays + " days late).");

	$("#briefing").innerHTML =
		'<div class="mail-head"><div><b>From:</b> Fernbird Reports &lt;reports@fernbird.example&gt;</div><div><b>To:</b> owner@fernbird.example</div><div><b>Subject:</b> Monday briefing: week of ' + esc(mon) + " – " + esc(sun) + "</div></div>" +
		'<div class="mail-body"><h4>Good morning. Here\'s last week at a glance.</h4>' +
		"<p>Revenue was <b>" + money(rev) + '</b>, <b class="' + (rev >= revP ? "up" : "down") + '">' + (rev >= revP ? "up " : "down ") + Math.abs(((rev - revP) / revP) * 100).toFixed(1) + "%</b> on the week before. There were " + intFmt.format(ord) + " orders (" + signedPct((ord - ordP) / ordP) + ").</p>" +
		"<ul>" +
		"<li><b>Strongest channel:</b> " + best.c.label + " (" + signedPct(best.d) + " on the week before).</li>" +
		"<li><b>Softest channel:</b> " + worst.c.label + " (" + signedPct(worst.d) + ").</li>" +
		"<li><b>Stock:</b> " + stockLine + "</li>" +
		"<li><b>Cafés:</b> " + (quiet.length ? quiet.length + " have gone quiet: " + names(quiet, (a) => esc(a.name) + " (" + a.since + " days since their last order, usually every " + a.intervalDays + ")") + "." : "Everyone is ordering as usual.") + "</li>" +
		"<li><b>Cash:</b> " + (late.length ? money(lateTotal) + " is overdue across " + late.length + " invoice" + (late.length > 1 ? "s" : "") + "; the oldest is " + late[0].overdueDays + " days late (" + esc(late[0].name) + ")." : "No invoices are overdue.") + "</li>" +
		"</ul>" +
		(actions.length ? "<p><b>Suggested for this week</b></p><ol>" + actions.map((a) => "<li>" + a + "</li>").join("") + "</ol>" : "") +
		'<p class="sig">Generated automatically from the simulated data in the dashboards above.</p></div>';
})();

/* ============================== scenario diagram ============================== */

$("#pipe-sources").innerHTML = SOURCES.map((s) => '<li><i class="fas ' + s.icon + '" aria-hidden="true"></i><span>' + esc(s.label) + "<small>" + esc(s.note) + "</small></span></li>").join("");
