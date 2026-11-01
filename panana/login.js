(function () {
	"use strict";

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

	function wire(form, endpoint) {
		form.addEventListener("submit", function (e) {
			e.preventDefault();
			var data = {};
			new FormData(form).forEach(function (v, k) { data[k] = String(v); });
			if (data.username) data.username = data.username.trim().toLowerCase();
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
						location.replace("/panana/");
					});
				})
				.catch(function (x) {
					err.textContent = x.message === "Failed to fetch" ? "Can't reach the server. Are you online?" : x.message;
					btn.disabled = false;
				});
		});
	}

	wire(forms.login, "login");
	wire(forms.join, "register");
})();
