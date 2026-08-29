import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeInboundEmail } from "../api/live-inbox.js";

test("že poslani prvi auto clarification ostane označen kot auto_clarification", () => {
  const row = sanitizeInboundEmail({
    id: "auto-history-1",
    subject: "Varovanje prostora",
    body: "Zanimajo nas vaše storitve.",
    decision: "auto_clarification",
    safe_to_auto_send: true,
    confidence: 0.97,
    missing_data: ["naslov objekta"],
    draft_reply: "Prosimo sporočite naslov objekta.",
    auto_reply_count: 1,
    status: "sent",
    sent_at: "2026-08-27T18:00:00.000Z",
    message_id: "sent-message-1",
  });

  assert.equal(row.decision, "auto_clarification");
  assert.equal(row.safe_to_auto_send, true);
  assert.equal(row.auto_reply_count, 1);
  assert.equal(row.status, "sent");
});
