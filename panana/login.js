(function () {
	"use strict";

	var ua = navigator.userAgent;
	var IOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
	var ANDROID = /Android/.test(ua);
	var INSTALLED = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;

	// Android Chrome may offer a one-tap install; keep the offer for the sign-up step
	var installPrompt = null;
	window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installPrompt = e; });
	// the service worker helps the browser treat Panana as installable
	if ("serviceWorker" in navigator) navigator.serviceWorker.register("/panana/sw.js").catch(function () {});

	// Already signed in? Go straight to the app.
	fetch("/api/reo/me", { credentials: "same-origin" })
		.then(function (r) { if (r.ok) location.replace("/panana/"); })
		.catch(function () {});

	// "Save as a web app" strip (same rule and dismissal as inside the app)
	(function () {
		var KEY = "panana.installStripDismissed";
		var mobile = /iPhone|iPad|iPod|Android/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
		var installed = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
		var dismissed = false;
		try { dismissed = localStorage.getItem(KEY) === "1"; } catch (e) {}
		if (!mobile || installed || dismissed) return;
		var strip = document.createElement("div");
		strip.className = "install-strip";
		strip.setAttribute("role", "note");
		strip.innerHTML = '<span>📲 <b>Save as a web app</b> for the best experience. <a href="/panana/install">Learn more</a></span><button class="strip-close" aria-label="Dismiss">✕</button>';
		strip.querySelector("button").addEventListener("click", function () {
			try { localStorage.setItem(KEY, "1"); } catch (e) {}
			strip.remove();
		});
		document.body.insertBefore(strip, document.body.firstChild);
	})();

	var forms = { login: document.getElementById("login-form"), join: document.getElementById("join-form") };

	document.querySelectorAll("[data-tab]").forEach(function (btn) {
		btn.addEventListener("click", function () {
			var tab = btn.getAttribute("data-tab");
			document.querySelectorAll("[data-tab]").forEach(function (b) { b.classList.toggle("active", b === btn); });
			forms.login.hidden = tab !== "login";
			forms.join.hidden = tab !== "join";
		});
	});

	// After deleting an account
	if (/[?&]deleted=1/.test(location.search)) {
		var note = document.createElement("p");
		note.className = "card center";
		note.textContent = "Your account and progress have been deleted. Ka kite anō!";
		document.querySelector(".auth-tabs").before(note);
	}

	// Optional Cloudflare Turnstile bot check — only when the server has keys
	var tsKey = null;
	var tsWidgets = {};
	fetch("/api/reo/public/config", { credentials: "same-origin" })
		.then(function (r) { return r.json(); })
		.then(function (cfg) {
			if (!cfg || !cfg.turnstile) return;
			tsKey = cfg.turnstile;
			var s = document.createElement("script");
			s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
			s.async = true;
			s.onload = function () {
				document.querySelectorAll(".auth-form").forEach(function (form) {
					var slot = form.querySelector(".ts-slot");
					if (slot && window.turnstile) tsWidgets[form.id] = window.turnstile.render(slot, { sitekey: tsKey, size: "flexible", appearance: "interaction-only" });
				});
			};
			document.head.appendChild(s);
		})
		.catch(function () {});

	function wire(form, endpoint) {
		form.addEventListener("submit", function (e) {
			e.preventDefault();
			var data = {};
			new FormData(form).forEach(function (v, k) { data[k] = String(v); });
			if (data.username) data.username = data.username.trim().toLowerCase();
			if (tsKey && window.turnstile && tsWidgets[form.id] !== undefined) data.turnstile = window.turnstile.getResponse(tsWidgets[form.id]) || "";
			delete data["cf-turnstile-response"];
			var err = form.querySelector(".auth-error");
			var btn = form.querySelector("button[type=submit]");
			err.textContent = "";
			btn.disabled = true;
			fetch("/api/reo/" + endpoint, {
				method: "POST",
				credentials: "same-origin",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(data),
			})
				.then(function (r) {
					return r.json().catch(function () { return {}; }).then(function (body) {
						if (!r.ok) throw new Error(body.error || "Something went wrong. Try again.");
						try { localStorage.setItem("reo.lastUser", JSON.stringify(body)); } catch (x) {}
						// new members on a phone: offer to add Panana to the home screen first
						if (endpoint === "register" && (IOS || ANDROID) && !INSTALLED) showInstallStep(body.username);
						else location.replace("/panana/");
					});
				})
				.catch(function (x) {
					err.textContent = x.message === "Failed to fetch" ? "Can't reach the server. Are you online?" : x.message;
					if (tsKey && window.turnstile && tsWidgets[form.id] !== undefined) window.turnstile.reset(tsWidgets[form.id]);
					btn.disabled = false;
				});
		});
	}

	// ---- sign-up step: add to home screen -------------------------------
	var SHARE = '<span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11v9h12v-9"/></svg></span>';
	var DOTS = '<span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg></span>';
	var LINES = '<span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg></span>';

	function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

	function showInstallStep(username) {
		var steps;
		if (IOS && /CriOS/.test(ua)) steps = ["Tap " + SHARE + " <b>Share</b> in the address bar (top-right).", "Tap <b>Add to Home Screen</b> (you may need <b>More</b>).", "Tap <b>Add</b>."];
		else if (IOS) steps = ["Tap " + SHARE + " <b>Share</b> at the bottom of Safari.", "Scroll down and tap <b>Add to Home Screen</b>.", "Tap <b>Add</b> (top-right)."];
		else if (/SamsungBrowser/.test(ua)) steps = ["Tap " + LINES + " <b>menu</b> (bottom-right).", "Tap <b>Add page to</b> → <b>Home screen</b>.", "Tap <b>Add</b>."];
		else steps = ["Tap " + DOTS + " <b>menu</b> (top-right).", "Tap <b>Install app</b> or <b>Add to Home screen</b>.", "Tap <b>Install</b>."];

		var strip = document.querySelector(".install-strip");
		if (strip) strip.remove(); // this step says the same thing, in more detail
		var main = document.querySelector("main.auth");
		main.innerHTML =
			'<img class="auth-logo" src="/panana/icons/icon.svg" alt="" width="72" height="72" />' +
			"<h1>Nau mai, haere mai! 🎉</h1>" +
			'<p class="muted">Your account <b>@' + esc(username) + "</b> is ready. One last step for the best experience:</p>" +
			'<section class="card auth-form onboard">' +
			"<h2>📲 Add Panana to your home screen</h2>" +
			'<p class="small muted">It then opens like an app — full screen, works offline' + (IOS ? ", and can send practice reminders" : "") + ".</p>" +
			'<button class="btn primary big" id="install-now" hidden>📲 Install Panana</button>' +
			'<ol class="onboard-steps" id="install-steps">' + steps.map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ol>" +
			(IOS ? '<p class="tip">After adding it, <b>open Panana from the new 🍌 icon</b> and sign in as <b>@' + esc(username) + "</b> — the home-screen app keeps its own sign-in.</p>" : "") +
			'<button class="btn primary big" id="install-done">I\'ve added it</button>' +
			'<a class="btn ghost" href="/panana/" id="install-skip">Continue in the browser for now</a>' +
			'<p class="small center"><a href="/panana/install">Need more help? See the full guide</a></p>' +
			"</section>";

		var now = document.getElementById("install-now");
		if (installPrompt) {
			now.hidden = false;
			now.addEventListener("click", function () {
				installPrompt.prompt();
				installPrompt.userChoice.then(function (c) {
					installPrompt = null;
					now.hidden = true;
					if (c && c.outcome === "accepted") done();
				});
			});
		}
		document.getElementById("install-done").addEventListener("click", done);
		function done() {
			main.querySelector(".onboard").innerHTML =
				"<h2>✅ Ka pai!</h2>" +
				"<p>Now open <b>Panana</b> from the 🍌 icon on your home screen" + (IOS ? " and sign in as <b>@" + esc(username) + "</b>" : "") + ".</p>" +
				'<p class="small muted">You can close this browser tab.</p>' +
				'<a class="btn ghost" href="/panana/">Or keep going here</a>';
		}
		window.scrollTo(0, 0);
	}

	wire(forms.login, "login");
	wire(forms.join, "register");
})();
