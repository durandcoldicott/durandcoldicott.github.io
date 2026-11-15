// Loaded synchronously in <head> (no defer/async) so the saved theme is applied
// before first paint. Kept as a file, not inline, so the CSP can stay script-src 'self'.
(function () {
	var saved = null;
	try { saved = localStorage.getItem("theme"); } catch (e) {}
	var theme = saved || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
	document.documentElement.setAttribute("data-theme", theme);
	document.querySelector('meta[name="color-scheme"]').content = theme;
})();
