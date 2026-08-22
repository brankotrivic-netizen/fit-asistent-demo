/* FIT Varovanje — stalni demo portal. */
(function () {
  // dostopna koda — demo vidi samo, kdor ima kodo
  var ACCESS = "FIT2026";
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
