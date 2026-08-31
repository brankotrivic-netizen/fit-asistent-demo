import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function workflow(name) {
  return JSON.parse(readFileSync(new URL("../n8n/" + name, import.meta.url), "utf8"));
}

function nodeByName(data, name) {
  const node = data.nodes.find((candidate) => candidate.name === name);
  assert.ok(node, "Missing n8n node: " + name);
  return node;
}

function targets(data, source, branch = 0) {
  return (data.connections[source]?.main?.[branch] || []).map((item) => item.node);
}

function assertConnectionsReferenceExistingNodes(data) {
  const names = new Set(data.nodes.map((node) => node.name));
  for (const [source, connections] of Object.entries(data.connections)) {
    assert.ok(names.has(source), "Unknown connection source: " + source);
    for (const outputs of connections.main || []) {
      for (const connection of outputs || []) {
        assert.ok(names.has(connection.node), "Unknown connection target: " + connection.node);
      }
    }
  }
}

test("approve workflow validates secret, trusted lookup, decision and dry-run before Gmail", () => {
  const data = workflow("BUMA-Gmail-Approve-Webhook.json");
  assert.equal(data.active, false);
  assertConnectionsReferenceExistingNodes(data);

  const requestValidation = nodeByName(data, "Validate secret and payload");
  assert.match(requestValidation.parameters.jsCode, /x-buma-secret/);
  assert.match(requestValidation.parameters.jsCode, /N8N_SHARED_SECRET/);

  const lookup = nodeByName(data, "Lookup FIT Inbound Emails");
  assert.equal(lookup.type, "n8n-nodes-base.dataTable");
  assert.equal(lookup.parameters.dataTableId.value, "FIT Inbound Emails");
  assert.equal(lookup.parameters.filters.conditions[0].keyName, "order_id");

  const trustedValidation = nodeByName(data, "Validate trusted order decision");
  assert.match(trustedValidation.parameters.jsCode, /review_required/);
  assert.match(trustedValidation.parameters.jsCode, /gmail_message_id/);

  assert.deepEqual(targets(data, "Valid request?", 0), ["Lookup FIT Inbound Emails"]);
  assert.deepEqual(targets(data, "Trusted order valid?", 0), ["Idempotency gate"]);
  assert.deepEqual(targets(data, "Test mode?", 0), ["Record dry run"]);
  assert.deepEqual(targets(data, "Test mode?", 1), ["Gmail reply after approval"]);
  const approveTestMode = nodeByName(data, "Test mode?").parameters.conditions.conditions[0].leftValue;
  assert.match(approveTestMode, /N8N_TEST_MODE/);
  assert.match(approveTestMode, /N8N_GMAIL_SEND_ENABLED/);

  const dryRun = nodeByName(data, "Record dry run");
  assert.match(dryRun.parameters.jsCode, /status: 'dry_run'/);
  assert.match(dryRun.parameters.jsCode, /email_sent: false/);
  assert.match(dryRun.parameters.jsCode, /lookup_verified/);
  assert.match(dryRun.parameters.jsCode, /decision_validated/);

  const idempotency = nodeByName(data, "Idempotency gate");
  assert.match(idempotency.parameters.jsCode, /item\.test_mode \? 'test' : 'live'/);
});

test("read-only live-inbox workflow rejects an invalid secret before table access", () => {
  const data = workflow("BUMA-FIT-Live-Inbox-Webhook.json");
  assert.equal(data.active, false);
  assertConnectionsReferenceExistingNodes(data);

  const validation = nodeByName(data, "Validate live-inbox secret");
  assert.match(validation.parameters.jsCode, /x-buma-secret/);
  assert.match(validation.parameters.jsCode, /N8N_SHARED_SECRET/);

  const reject = nodeByName(data, "Reject invalid secret");
  assert.match(String(reject.parameters.options.responseCode), /http_status/);
  assert.match(validation.parameters.jsCode, /403/);

  const lookup = nodeByName(data, "Read FIT Inbound Emails");
  assert.equal(lookup.type, "n8n-nodes-base.dataTable");
  assert.equal(lookup.parameters.dataTableId.value, "FIT Inbound Emails");
  assert.deepEqual(targets(data, "Secret valid?", 0), ["Read FIT Inbound Emails"]);
  assert.deepEqual(targets(data, "Secret valid?", 1), ["Reject invalid secret"]);
  assert.equal(data.nodes.some((node) => node.type === "n8n-nodes-base.gmail"), false);
});

test("intake Safety Gate requires a confident category and preserves one-auto-reply limit", () => {
  const source = readFileSync(new URL("../n8n/Intake-Safety-Gate.js", import.meta.url), "utf8");
  assert.match(source, /order.*installation.*service/s);
  assert.match(source, /categoryConfidence < 0\.85/);
  assert.match(source, /category = categoryReviewRequired \? 'manual_review'/);
  assert.match(source, /autoReplyCount >= 1/);
  assert.match(source, /decision = 'manual_required'/);
});

test("Gmail intake workflow classifies, persists and hard-routes test mode away from Gmail", () => {
  const data = workflow("BUMA-Gmail-AI-Email-Intake.json");
  assert.equal(data.active, false);
  assertConnectionsReferenceExistingNodes(data);
  assert.equal(nodeByName(data, "Gmail inbound trigger").type, "n8n-nodes-base.gmailTrigger");
  assert.equal(nodeByName(data, "OpenAI safety model").type, "@n8n/n8n-nodes-langchain.lmChatOpenAi");
  const insert = nodeByName(data, "Insert FIT inbound email");
  assert.equal(insert.parameters.dataTableId.value, "FIT Inbound Emails");
  assert.equal(insert.parameters.columns.mappingMode, "autoMapInputData");
  const safety = nodeByName(data, "Deterministic Safety Gate").parameters.jsCode;
  assert.match(safety, /categoryReviewRequired/);
  assert.match(safety, /autoReplyCount >= 1/);
  const testMode = nodeByName(data, "N8N test mode?");
  assert.match(testMode.parameters.conditions.conditions[0].leftValue, /N8N_TEST_MODE/);
  assert.match(testMode.parameters.conditions.conditions[0].leftValue, /N8N_GMAIL_SEND_ENABLED/);
  assert.deepEqual(targets(data, "N8N test mode?", 0), ["Record intake dry run"]);
  assert.deepEqual(targets(data, "N8N test mode?", 1), ["Gmail auto clarification reply"]);
  assert.equal(nodeByName(data, "Record intake dry run").type, "n8n-nodes-base.code");
});
