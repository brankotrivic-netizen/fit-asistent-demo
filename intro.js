/* FIT Varovanje demo — uvodna navodila za vsako aplikacijo. */
(function () {
  var APPS = {
    "asistent": {
      title: "AI prodajni asistent",
      why: "Vsako povpraševanje, ki prispe na prodajni e-mail, asistent prebere, prepozna, za kaj gre — novo naročilo, servis, dograditev, fizično varovanje, večji projekt ali reklamacija — mu določi stopnjo nujnosti in ga razvrsti v pravo mapo, da se nič ne izgubi. Odgovorna oseba samo preveri in pošlje; nič ne gre ven brez nje.",
      steps: [
        "Levi stolpec je nabiralnik, ki ga je asistent že razvrstil po mapah — nujne zadeve so označene rdeče.",
        "Kliknite katerikoli e-mail: vidite izvirno sporočilo, prioriteto, mapo in povzetek.",
        "Spodaj vas čaka osnutek odgovora in vrstica za pregledno tabelo.",
        "Posebej preizkusite nujna primera: »alarm ne dela« (servis) in »varovanje gradbišča« (fizično varovanje)."
      ]
    },
    "teren-index": {
      title: "Terenska ponudba — generator predračunov",
      why: "Tehnik ali komercialist že na ogledu objekta sestavi predračun — brez vračanja v pisarno in brez pretipkavanja. Stranka dobi dokument še isti dan.",
      steps: [
        "Izpolnite podatke stranke in objekta.",
        "Izberite tip varovalnega sistema in dodajte artikle iz cenika.",
        "Generirajte predračun — pripravljen je za tisk ali pošiljanje.",
        "Za hitro oddajo s terena je tu še obrazec »Zahteva za ponudbo« (tehnik.html)."
      ],
      note: "AI predlog konfiguracije v demo različici ni aktiven."
    },
    "teren-tehnik": {
      title: "Zahteva za ponudbo s terena",
      why: "Ko tehnik na terenu nima časa za cel predračun, v minuti odda urejeno zahtevo — pisarna dobi vse podatke na enem mestu in pripravi ponudbo.",
      steps: [
        "Izpolnite podatke stranke in objekta.",
        "Označite, kaj stranka potrebuje.",
        "Oddajte zahtevo — v živem sistemu prispe naravnost v pisarno."
      ]
    },
    "ponudbe": {
      title: "Generator ponudb",
      why: "Vse ponudbe nastanejo iz iste, potrjene predloge — spremenijo se samo podatki. Ni več copy-paste napak iz starih dokumentov in vsaka ponudba izgleda enako profesionalno.",
      steps: [
        "Izpolnite naročnika, objekt in številko ponudbe.",
        "Izberite vzorec storitve in po potrebi prilagodite besedilo.",
        "Generirajte dokument — pripravljen za tisk ali PDF."
      ]
    },
    "pogodbe": {
      title: "Generator pogodb",
      why: "Pogodba o varovanju iz predloge v nekaj minutah — brez tveganja, da se iz stare pogodbe v Wordu podeduje napačen podatek.",
      steps: [
        "Izberite tip pogodbe.",
        "Izpolnite podatke naročnika in objekta ter storitve.",
        "Kontakt in podpis lahko doda pisarna kasneje.",
        "Generirajte pogodbo, pripravljeno za tisk."
      ]
    }
  };

  var path = location.pathname;
  var key =
    path.indexOf("/asistent/") === 0 ? "asistent" :
    path.indexOf("/teren/tehnik") === 0 ? "teren-tehnik" :
    path.indexOf("/teren/") === 0 ? "teren-index" :
    path.indexOf("/ponudbe/") === 0 ? "ponudbe" :
    path.indexOf("/pogodbe/") === 0 ? "pogodbe" : null;
  if (!key || !APPS[key]) return;
  var cfg = APPS[key];
  var seenKey = "fit-intro-" + key;

  function el(tag, css, html) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (html != null) e.innerHTML = html;
    return e;
  }

  var FONT = "font-family:system-ui,'Segoe UI',Roboto,Arial,sans-serif;";
  var overlay, open = false;

  function buildOverlay() {
    overlay = el("div",
      "position:fixed;inset:0;z-index:2147483000;background:rgba(17,17,17,.62);" +
      "display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto;" + FONT);
    var card = el("div",
      "background:#fff;color:#111;max-width:520px;width:100%;border-radius:16px;" +
      "padding:26px 26px 22px;box-shadow:0 20px 60px rgba(0,0,0,.35);line-height:1.55;font-size:14.5px;");

    var h = '<div style="font-size:11px;font-weight:800;letter-spacing:.14em;color:#e8193c;text-transform:uppercase;margin-bottom:8px;">FIT Varovanje · Demo</div>' +
      '<div style="font-size:20px;font-weight:800;margin-bottom:10px;">' + cfg.title + "</div>" +
      '<p style="margin:0 0 14px;color:#444;">' + cfg.why + "</p>" +
      '<div style="font-size:11px;font-weight:800;letter-spacing:.1em;color:#888;text-transform:uppercase;margin-bottom:8px;">Kako preizkusite</div>' +
      '<ol style="margin:0 0 6px;padding-left:20px;color:#333;">' +
      cfg.steps.map(function (s) { return '<li style="margin-bottom:6px;">' + s + "</li>"; }).join("") +
      "</ol>" +
      (cfg.note ? '<p style="margin:8px 0 0;font-size:12.5px;color:#8f5400;background:#fbf0da;border:1px solid #e8cd9a;border-radius:8px;padding:8px 12px;">' + cfg.note + "</p>" : "") +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px;align-items:center;">' +
      '<button id="fitIntroStart" style="border:0;cursor:pointer;background:#e8193c;color:#fff;font:inherit;font-weight:700;padding:11px 22px;border-radius:9px;">Začni z demom</button>' +
      '<a href="/" style="color:#666;font-size:13px;text-decoration:none;">← Vse aplikacije</a>' +
      "</div>";
    card.innerHTML = h;
    overlay.appendChild(card);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) hide(); });
    card.querySelector("#fitIntroStart").addEventListener("click", hide);
    document.body.appendChild(overlay);
  }

  function show() {
    if (!overlay) buildOverlay();
    overlay.style.display = "flex";
    open = true;
  }
  function hide() {
    overlay.style.display = "none";
    open = false;
    try { sessionStorage.setItem(seenKey, "1"); } catch (e) {}
  }

  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) hide(); });

  function init() {
    // plavajoča gumba: navodila + nazaj na portal
    var bar = el("div",
      "position:fixed;bottom:12px;left:12px;z-index:2147482000;display:flex;gap:8px;" + FONT);
    var bInfo = el("button", btnCss(), "ℹ Navodila");
    var bHome = el("a", btnCss() + "text-decoration:none;display:inline-flex;align-items:center;", "⌂ Portal");
    bHome.href = "/";
    bInfo.type = "button";
    bInfo.addEventListener("click", show);
    bar.appendChild(bInfo); bar.appendChild(bHome);
    document.body.appendChild(bar);

    var seen = false;
    try { seen = sessionStorage.getItem(seenKey) === "1"; } catch (e) {}
    if (!seen) show();
  }
  function btnCss() {
    return "border:1px solid rgba(0,0,0,.15);cursor:pointer;background:#fff;color:#111;" +
      "font:600 12px/1 system-ui,'Segoe UI',sans-serif;padding:8px 13px;border-radius:999px;" +
      "box-shadow:0 2px 10px rgba(0,0,0,.18);opacity:.92;";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
