(function () {
	"use strict";

	// Theme toggle
	var themeToggle = document.getElementById("theme-toggle");
	if (themeToggle) {
		themeToggle.addEventListener("click", function () {
			var current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
			var next = current === "light" ? "dark" : "light";
			document.documentElement.setAttribute("data-theme", next);
			try {
				localStorage.setItem("theme", next);
			} catch (err) {
				/* storage unavailable, theme just won't persist */
			}
		});
	}

	// Mobile nav toggle
	var navToggle = document.getElementById("nav-toggle");
	var navList = document.querySelector("#site-nav ul");
	if (navToggle && navList) {
		navToggle.addEventListener("click", function () {
			var open = navList.style.display === "flex";
			navList.style.display = open ? "none" : "flex";
			navList.style.flexDirection = "column";
			navList.style.position = "absolute";
			navList.style.top = "62px";
			navList.style.right = "20px";
			navList.style.background = "var(--bg-elevated)";
			navList.style.border = "1px solid var(--border-strong)";
			navList.style.borderRadius = "10px";
			navList.style.padding = "14px 20px";
			navList.style.gap = "14px";
		});
	}

	// Scroll reveal
	var revealEls = document.querySelectorAll(".reveal");
	if ("IntersectionObserver" in window && revealEls.length) {
		var observer = new IntersectionObserver(
			function (entries) {
				entries.forEach(function (entry) {
					if (entry.isIntersecting) {
						entry.target.classList.add("is-visible");
						observer.unobserve(entry.target);
					}
				});
			},
			{ threshold: 0.15 }
		);
		revealEls.forEach(function (el) { observer.observe(el); });
	} else {
		revealEls.forEach(function (el) { el.classList.add("is-visible"); });
	}

	// Contact form
	var form = document.getElementById("contact-form");
	var thankYou = document.getElementById("thank-you-message");
	var formContainer = document.getElementById("form-container");

	if (form) {
		form.addEventListener("submit", function (e) {
			e.preventDefault();
			var formData = new FormData(form);

			fetch(form.action, {
				method: form.method,
				body: formData,
				headers: { Accept: "application/json" },
			})
				.then(function (response) {
					if (response.ok) {
						formContainer.style.display = "none";
						thankYou.style.display = "block";
					} else {
						alert("Oops! Something went wrong.");
					}
				})
				.catch(function () {
					alert("There was a problem submitting your form.");
				});
		});
	}

	// AI concierge
	var concierge = {
		form: document.getElementById("concierge-form"),
		input: document.getElementById("concierge-input"),
		send: document.getElementById("concierge-send"),
		thread: document.getElementById("concierge-thread"),
		suggestions: document.querySelectorAll(".concierge-suggestions button"),
		suggestionsWrap: document.querySelector(".concierge-suggestions"),
		limit: document.getElementById("concierge-limit"),
	};

	var MAX_QUESTIONS = 5;
	var QUESTION_COUNT_KEY = "concierge_question_count";

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
		concierge.form.hidden = true;
		if (concierge.suggestionsWrap) concierge.suggestionsWrap.hidden = true;
		concierge.limit.hidden = false;
	}

	if (getQuestionCount() >= MAX_QUESTIONS) {
		showLimitReached();
	}

	function addMessage(text, cls) {
		var el = document.createElement("div");
		el.className = "msg " + cls;
		el.textContent = text;
		concierge.thread.appendChild(el);
		concierge.thread.scrollTop = concierge.thread.scrollHeight;
		return el;
	}

	function addTyping() {
		var el = document.createElement("div");
		el.className = "msg msg-assistant msg-typing";
		el.innerHTML = "<span></span><span></span><span></span>";
		concierge.thread.appendChild(el);
		concierge.thread.scrollTop = concierge.thread.scrollHeight;
		return el;
	}

	function askConcierge(question) {
		if (!question || !question.trim()) return;
		if (getQuestionCount() >= MAX_QUESTIONS) {
			showLimitReached();
			return;
		}

		incrementQuestionCount();
		addMessage(question, "msg-user");
		concierge.input.value = "";
		concierge.send.disabled = true;
		var typingEl = addTyping();

		fetch("/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ message: question }),
		})
			.then(function (response) {
				return response
					.json()
					.catch(function () {
						return { error: "upstream_unavailable", message: "The concierge is having a moment — try again shortly." };
					})
					.then(function (data) {
						return { ok: response.ok, data: data };
					});
			})
			.then(function (result) {
				typingEl.remove();
				if (result.ok && result.data.reply) {
					addMessage(result.data.reply, "msg-assistant");
				} else {
					var msg = (result.data && result.data.message) || "The concierge is having a moment — try again shortly.";
					addMessage(msg, "msg-error");
				}
			})
			.catch(function () {
				typingEl.remove();
				addMessage("The concierge is having a moment — try again shortly.", "msg-error");
			})
			.finally(function () {
				concierge.send.disabled = false;
				if (getQuestionCount() >= MAX_QUESTIONS) {
					showLimitReached();
				}
			});
	}

	if (concierge.form) {
		concierge.form.addEventListener("submit", function (e) {
			e.preventDefault();
			askConcierge(concierge.input.value);
		});
	}

	concierge.suggestions.forEach(function (btn) {
		btn.addEventListener("click", function () {
			askConcierge(btn.getAttribute("data-q"));
		});
	});
})();
