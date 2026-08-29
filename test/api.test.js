import test from "node:test";
import assert from "node:assert/strict";
import { safeMissingData, sanitizeInboundEmail } from "../api/live-inbox.js";
import orderActionHandler, {
  prepareOrderAction,
  resetOrderActionCacheForTests,
} from "../api/order-action.js";

function mockResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function approveBody(overrides = {}) {
  return {
    order_id: "42",
    action: "approve",
    sender_email: "nabava@example.si",
    subject: "Naročilo kamer",
    draft_reply: "Potrjen odgovor",
    status: "za_potrditev",
    previous_status: "za_potrditev",
    ...overrides,
  };
}

test("sanitizes a FIT Inbound Emails row and keeps required dashboard fields", () => {
  const row = sanitizeInboundEmail({
    id: 42,
    from_email: "nabava@example.si",
    customer_name: "Maja Novak",
    subject: "Naročilo kamer",
    summary: "Stranka naroča dve kameri.",
    sku: "CAM-01",
    quantity: 2,
    missing_data: '["rok dobave"]',
    priority: "visoka",
    status: "za_potrditev",
    ai_draft: "Pozdravljeni, hvala za naročilo.",
  });

  assert.equal(row.id, "42");
  assert.equal(row.sender_email, "nabava@example.si");
  assert.equal(row.product, "CAM-01");
  assert.equal(row.quantity, 2);
  assert.deepEqual(row.missing_data, ["rok dobave"]);
  assert.equal(row.draft_reply, "Pozdravljeni, hvala za naročilo.");
});

test("accepts object and delimited missing_data values", () => {
  assert.deepEqual(safeMissingData({ naslov: true, telefon: "manjka" }), ["naslov", "telefon: manjka"]);
  assert.deepEqual(safeMissingData("naslov, telefon"), ["naslov", "telefon"]);
});

test("approve action contains the complete n8n payload contract", () => {
  const action = prepareOrderAction(approveBody());
  assert.equal(action.order_id, "42");
  assert.equal(action.action, "approve");
  assert.equal(action.sender_email, "nabava@example.si");
  assert.equal(action.subject, "Naročilo kamer");
  assert.equal(action.draft_reply, "Potrjen odgovor");
  assert.equal(action.status, "za_potrditev");
  assert.equal(action.delivery, "n8n_pending");
  assert.equal(action.email_sent, false);
  assert.match(action.idempotency_key, /^[a-f0-9]{64}$/);
});

test("N8N_TEST_MODE prevents both the n8n call and Gmail delivery", { concurrency: false }, async (t) => {
  const originalFetch = global.fetch;
  const originalTestMode = process.env.N8N_TEST_MODE;
  t.after(() => {
    global.fetch = originalFetch;
    if (originalTestMode === undefined) delete process.env.N8N_TEST_MODE;
    else process.env.N8N_TEST_MODE = originalTestMode;
  });

  process.env.N8N_TEST_MODE = "true";
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    throw new Error("fetch must not run in dry-run mode");
  };

  const res = mockResponse();
  await orderActionHandler({ method: "POST", body: approveBody({ order_id: "dry-run-42" }) }, res);

  assert.equal(calls, 0);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "dry_run");
  assert.equal(res.body.delivery, "dry_run");
  assert.equal(res.body.email_sent, false);
});

test("draft update requires content", () => {
  assert.deepEqual(prepareOrderAction({ order_id: "42", action: "update_draft" }), {
    error: "draft_reply is required",
  });
});

test("approve POST sends the shared secret and required payload to n8n", { concurrency: false }, async (t) => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.N8N_ORDER_ACTION_URL;
  const originalSecret = process.env.N8N_SHARED_SECRET;
  t.after(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.N8N_ORDER_ACTION_URL;
    else process.env.N8N_ORDER_ACTION_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.N8N_SHARED_SECRET;
    else process.env.N8N_SHARED_SECRET = originalSecret;
    resetOrderActionCacheForTests();
  });

  process.env.N8N_ORDER_ACTION_URL = "https://n8n.example/webhook/fit-order-action";
  process.env.N8N_SHARED_SECRET = "test-shared-secret";
  resetOrderActionCacheForTests();
  let captured;
  global.fetch = async (url, init) => {
    captured = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ accepted: true, email_sent: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const res = mockResponse();
  await orderActionHandler({ method: "POST", body: approveBody() }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "sent");
  assert.equal(res.body.email_sent, true);
  assert.equal(captured.url, process.env.N8N_ORDER_ACTION_URL);
  assert.equal(captured.init.headers["x-buma-secret"], "test-shared-secret");
  assert.equal(captured.init.headers["x-idempotency-key"], captured.body.idempotency_key);
  assert.deepEqual(
    Object.fromEntries(["order_id", "action", "sender_email", "subject", "draft_reply", "status"].map((key) => [key, captured.body[key]])),
    {
      order_id: "42",
      action: "approve",
      sender_email: "nabava@example.si",
      subject: "Naročilo kamer",
      draft_reply: "Potrjen odgovor",
      status: "za_potrditev",
    },
  );
});

test("successful n8n acceptance does not claim email was sent without explicit confirmation", { concurrency: false }, async (t) => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.N8N_ORDER_ACTION_URL;
  t.after(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.N8N_ORDER_ACTION_URL;
    else process.env.N8N_ORDER_ACTION_URL = originalUrl;
    resetOrderActionCacheForTests();
  });

  process.env.N8N_ORDER_ACTION_URL = "https://n8n.example/webhook/fit-order-action";
  resetOrderActionCacheForTests();
  global.fetch = async () => new Response(JSON.stringify({ accepted: true }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });

  const res = mockResponse();
  await orderActionHandler({ method: "POST", body: approveBody({ order_id: "43" }) }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "accepted");
  assert.equal(res.body.email_sent, false);
  assert.match(res.body.message, /še ni potrjena kot poslana/i);
});

test("duplicate approve requests call n8n only once", { concurrency: false }, async (t) => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.N8N_ORDER_ACTION_URL;
  t.after(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.N8N_ORDER_ACTION_URL;
    else process.env.N8N_ORDER_ACTION_URL = originalUrl;
    resetOrderActionCacheForTests();
  });

  process.env.N8N_ORDER_ACTION_URL = "https://n8n.example/webhook/fit-order-action";
  resetOrderActionCacheForTests();
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ email_sent: true }), { status: 200 });
  };

  const first = mockResponse();
  const second = mockResponse();
  await Promise.all([
    orderActionHandler({ method: "POST", body: approveBody({ order_id: "44" }) }, first),
    orderActionHandler({ method: "POST", body: approveBody({ order_id: "44" }) }, second),
  ]);

  assert.equal(calls, 1);
  assert.equal(first.body.email_sent, true);
  assert.equal(second.body.email_sent, true);
  assert.equal([first.body.duplicate, second.body.duplicate].filter(Boolean).length, 1);
});
