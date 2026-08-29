import http from "node:http";

const items = [
  {
    id: "auto-1",
    message_id: "mock-auto-sent-message",
    thread_id: "thread-auto",
    sender_name: "Ana Kovač",
    sender_email: "ana@example.si",
    subject: "Varovanje poslovnega prostora",
    body: "Zanimajo nas vaše storitve za poslovni prostor.",
    summary: "Splošno povpraševanje, manjka naslov objekta.",
    product: "Fizično varovanje",
    quantity: 1,
    missing_data: ["naslov objekta"],
    priority: "običajna",
    status: "sent",
    decision: "auto_clarification",
    safe_to_auto_send: true,
    decision_reason: "AI sprašuje samo po naslovu objekta.",
    confidence: 0.96,
    auto_reply_count: 1,
    draft_reply: "Pozdravljeni, prosimo sporočite naslov objekta.",
    sent_at: "2026-08-27T18:15:00.000Z",
    created_at: "2026-08-27T18:10:00.000Z"
  },
  {
    id: "review-1",
    thread_id: "thread-review",
    sender_name: "Miha Zupan",
    sender_email: "miha@example.si",
    subject: "Cena tehničnega varovanja",
    summary: "Stranka sprašuje po ceni in izvedbi.",
    product: "Tehnično varovanje",
    quantity: 1,
    missing_data: [],
    priority: "visoka",
    status: "review_required",
    decision: "review_required",
    safe_to_auto_send: false,
    decision_reason: "Vprašanje po ceni zahteva človeško potrditev.",
    confidence: 0.97,
    auto_reply_count: 0,
    draft_reply: "Pozdravljeni, hvala za povpraševanje. Za pripravo ponudbe vas bomo kontaktirali.",
    created_at: "2026-08-27T18:20:00.000Z"
  },
  {
    id: "manual-1",
    thread_id: "thread-manual",
    sender_name: "Nina Horvat",
    sender_email: "nina@example.si",
    subject: "Reklamacija alarma",
    body: "Alarm se sproža brez razloga in smo nezadovoljni.",
    summary: "Reklamacija zaradi napake alarma.",
    product: "Alarmni sistem",
    priority: "nujno",
    status: "manual_required",
    decision: "manual_required",
    safe_to_auto_send: false,
    decision_reason: "Reklamacija in napaka alarma zahtevata ročno obravnavo.",
    confidence: 0.98,
    auto_reply_count: 0,
    draft_reply: "Interni osnutek za odgovorno osebo.",
    created_at: "2026-08-27T18:30:00.000Z"
  }
];

http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.headers["x-buma-secret"] !== "browser-test-secret") {
    res.statusCode = 403;
    return res.end(JSON.stringify({ error: "Invalid shared secret" }));
  }
  if (req.method === "GET" && req.url === "/inbox") return res.end(JSON.stringify({ items }));
  if (req.method === "POST" && req.url === "/action") {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      if (body.test_mode !== true) {
        res.statusCode = 409;
        return res.end(JSON.stringify({ error: "Fixture permits dry-run requests only", email_sent: false }));
      }
      return setTimeout(() => res.end(JSON.stringify({ status: "dry_run", test_mode: true, email_sent: false })), 650);
    });
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: "Not found" }));
}).listen(4174, "127.0.0.1");
