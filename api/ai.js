// Proxy za AI predlog konfiguracije v demo terenske ponudbe.
// Kliče Anthropic API s ključem iz env spremenljivke — ključ nikoli ne pride v brskalnik.
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  // strežniška varovalka: po poteku dema tudi API neha delati
  if (Date.now() >= Date.parse("2026-08-16T00:00:00+02:00")) {
    return res.status(403).json({ error: "Demo je potekel." });
  }

  const body = req.body || {};
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 4) {
    return res.status(400).json({ error: "Neveljavna zahteva." });
  }
  const totalLen = JSON.stringify(body.messages).length;
  if (totalLen > 20000) {
    return res.status(400).json({ error: "Zahteva je prevelika." });
  }

  const payload = {
    model: "claude-haiku-4-5-20251001",
    max_tokens: Math.min(Number(body.max_tokens) || 600, 800),
    messages: body.messages,
  };

  // ključ očistimo morebitnega BOM/presledkov iz env vnosa
  const apiKey = (process.env.ANTHROPIC_API_KEY || "").replace(/\uFEFF/g, "").trim();

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    console.error("ai-proxy error:", e);
    return res.status(502).json({ error: "AI storitev trenutno ni dosegljiva." });
  }
};
