/* FIT Varovanje — stalni demo portal. */
(function () {
  // Zasebna dostopna koda. Stara koda FIT2026 je preklicana.
  // Dostop ostane zaprt, dokler nove kode ne posredujemo naročniku.
  var ACCESS = "BUMA-FIT-9K7M-26QX";
  try {
    if (
      location.pathname.indexOf("vstop") === -1 &&
      location.pathname.indexOf("potekel") === -1 &&
      localStorage.getItem("fit-demo-dostop") !== ACCESS
    ) {
      var next = location.pathname + location.search + location.hash;
      location.replace("/vstop.html?next=" + encodeURIComponent(next));
      return;
    }
  } catch (e) {}

  document.addEventListener("DOMContentLoaded", function () {
    // V demo prikazu ne prikazujemo naslova prodaja@fitvarovanje.si,
    // dokler demo ni povezan z dejanskim FIT nabiralnikom.
    if (location.pathname.indexOf("/asistent/") === 0) {
      var hero = document.querySelector(".hero h1");
      if (hero) hero.textContent = "Vsako povpraševanje, obdelano v minutah.";

      var inboxLabel = document.querySelector(".inbox .pane-label");
      if (inboxLabel) inboxLabel.textContent = "Prejeta pošta";

      document.querySelectorAll(".step span").forEach(function (node) {
        if (node.textContent.indexOf("prodaja@fitvarovanje.si") !== -1) {
          node.textContent = "Asistent spremlja vaš obstoječi e-poštni nabiralnik. Nič se ne seli, nič se ne spreminja.";
        }
      });
    }

    // diskretna značka "DEMO"
    var b = document.createElement("div");
    b.textContent = "STALNI DEMO";
    b.style.cssText =
      "position:fixed;bottom:12px;right:12px;z-index:2147483647;" +
      "background:#111;color:#fff;font:600 11px/1 system-ui,sans-serif;" +
      "padding:7px 12px;border-radius:999px;opacity:.75;pointer-events:none;" +
      "letter-spacing:.4px;";
    document.body.appendChild(b);
  });
})();
