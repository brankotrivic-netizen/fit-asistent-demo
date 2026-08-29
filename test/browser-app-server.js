import http from "node:http";
import { readFile } from "node:fs/promises";
import liveInboxHandler from "../api/live-inbox.js";
import orderActionHandler from "../api/order-action.js";

process.env.N8N_LIVE_INBOX_URL = "http://127.0.0.1:4174/inbox";
process.env.N8N_ORDER_ACTION_URL = "http://127.0.0.1:4174/action";
process.env.N8N_SHARED_SECRET = "browser-test-secret";
process.env.N8N_TEST_MODE = "true";

const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/decision-styles.css", ["decision-styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/app-core.js", ["app-core.js", "text/javascript; charset=utf-8"]],
  ["/decision-ui.js", ["decision-ui.js", "text/javascript; charset=utf-8"]],
]);

function apiResponse(res) {
  return {
    setHeader(name, value) { res.setHeader(name, value); },
    status(code) { res.statusCode = code; return this; },
    json(payload) { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(payload)); return this; },
  };
}

async function body(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/live-inbox") return liveInboxHandler({ method: req.method }, apiResponse(res));
    if (req.url === "/api/order-action") return orderActionHandler({ method: req.method, body: await body(req) }, apiResponse(res));
    const staticFile = files.get(req.url);
    if (!staticFile) { res.statusCode = 404; return res.end("Not found"); }
    res.setHeader("Content-Type", staticFile[1]);
    res.end(await readFile(new URL(`../${staticFile[0]}`, import.meta.url)));
  } catch (error) {
    res.statusCode = 500;
    res.end(String(error?.message || error));
  }
}).listen(4173, "127.0.0.1");
