import test from "node:test";
import assert from "node:assert/strict";
import { prepareOrderAction } from "../api/order-action.js";

test("approve pogodba loči order, thread in Gmail message ID", () => {
  const action = prepareOrderAction({
    order_id: "fit-row-42",
    thread_id: "gmail-thread-42",
    gmail_message_id: "gmail-message-42",
    action: "approve",
    sender_email: "nabava@example.si",
    subject: "Naročilo kamer",
    draft_reply: "Končni odgovor",
    decision: "review_required",
    status: "review_required",
  });

  assert.equal(action.order_id, "fit-row-42");
  assert.equal(action.thread_id, "gmail-thread-42");
  assert.equal(action.gmail_message_id, "gmail-message-42");
  assert.equal(action.decision, "review_required");
  assert.match(action.idempotency_key, /^[a-f0-9]{64}$/);
});
