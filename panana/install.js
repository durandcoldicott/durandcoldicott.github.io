(function () {
	"use strict";

	var ua = navigator.userAgent;
	var iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
	var android = /Android/.test(ua);
	var device = "ios-safari";
	var label = "";
	if (iOS) {
		if (/CriOS/.test(ua)) { device = "ios-chrome"; label = "iPhone · Chrome"; }
		else { device = "ios-safari"; label = /FxiOS|EdgiOS/.test(ua) ? "iPhone (for best results use Safari)" : "iPhone · Safari"; }
	} else if (android) {
		if (/SamsungBrowser/.test(ua)) { device = "android-samsung"; label = "Android · Samsung Internet"; }
		else { device = "android-chrome"; label = "Android · Chrome"; }
	}

	var standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
	var detected = document.getElementById("detected");
	if (standalone) detected.textContent = "✅ You're already using Panana as an installed app.";
	else if (label) detected.textContent = "Looks like you're on: " + label + ". Steps for other phones are a tap away.";
	else detected.textContent = "Open this page on your phone, or pick your phone below.";

	function show(id) {
		document.querySelectorAll(".device").forEach(function (s) { s.classList.toggle("active", s.id === id); });
		document.querySelectorAll("[data-device]").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-device") === id); });
	}
	document.querySelectorAll("[data-device]").forEach(function (b) {
		b.addEventListener("click", function () { show(b.getAttribute("data-device")); });
	});
	show(device);

	// Android Chrome can offer a one-tap install
	var deferred = null;
	var btn = document.getElementById("install-btn");
	window.addEventListener("beforeinstallprompt", function (e) {
		e.preventDefault();
		deferred = e;
		btn.hidden = false;
	});
	btn.addEventListener("click", function () {
		if (!deferred) return;
		deferred.prompt();
		deferred.userChoice.then(function () { deferred = null; btn.hidden = true; });
	});
	window.addEventListener("appinstalled", function () {
		btn.hidden = true;
		detected.textContent = "✅ Installed! Open Panana from your home screen.";
	});
})();
