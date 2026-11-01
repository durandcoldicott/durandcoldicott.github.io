(function () {
	"use strict";

	// Already signed in? Go straight to the app.
	fetch("/api/reo/me", { credentials: "same-origin" })
		.then(function (r) { if (r.ok) location.replace("/panana/"); })
		.catch(function () {});

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
