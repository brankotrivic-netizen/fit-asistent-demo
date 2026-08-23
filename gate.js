/* FIT Varovanje — stalni demo portal. */
(function () {
  var isPublicPage =
    location.pathname.indexOf("vstop") !== -1 ||
    location.pathname.indexOf("potekel") !== -1;

  if (!isPublicPage) {
    fetch("/api/session", { credentials: "same-origin", cache: "no-store" })
      .then(function (response) {
        if (response.ok) return;
        var next = location.pathname + location.search + location.hash;
        location.replace("/vstop.html?next=" + encodeURIComponent(next));
      })
      .catch(function () {
        var next = location.pathname + location.search + location.hash;
        location.replace("/vstop.html?next=" + encodeURIComponent(next));
      });
  }

  // diskretna značka "DEMO"
  document.addEventListener("DOMContentLoaded", function () {
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
