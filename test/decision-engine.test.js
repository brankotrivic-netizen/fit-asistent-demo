import test from "node:test";
import assert from "node:assert/strict";
import { DECISIONS, evaluateEmailDecision } from "../lib/decision-engine.js";
import { prepareOrderAction } from "../api/order-action.js";

const safeInquiry = {
  subject: "Povpraševanje za varovanje objekta",
  body: "Zanimajo nas vaše storitve za poslovni prostor.",
  missing_data: ["naslov objekta"],
  draft_reply: "Pozdravljeni, prosimo sporočite naslov objekta, da lahko nadaljujemo obdelavo.",
  confidence: 0.96,
  auto_reply_count: 0,
};

test("navadno povpraševanje z manjkajočim naslovom dovoli auto_clarification", () => {
  const result = evaluateEmailDecision(safeInquiry);
  assert.equal(result.decision, DECISIONS.AUTO);
  assert.equal(result.safe_to_auto_send, true);
});

test("vprašanje po ceni zahteva review_required", () => {
  const result = evaluateEmailDecision({ ...safeInquiry, subject: "Kakšna je cena varovanja?" });
  assert.equal(result.decision, DECISIONS.REVIEW);
  assert.equal(result.safe_to_auto_send, false);
});

test("vprašanje po konkretnem roku izvedbe zahteva review_required", () => {
  const result = evaluateEmailDecision({ ...safeInquiry, body: "Ali lahko montažo izvedete do naslednjega petka?" });
  assert.equal(result.decision, DECISIONS.REVIEW);
});

test("reklamacija vedno zahteva manual_required", () => {
  const result = evaluateEmailDecision({ ...safeInquiry, subject: "Reklamacija nedelujočega sistema" });
  assert.equal(result.decision, DECISIONS.MANUAL);
  assert.equal(result.safe_to_auto_send, false);
});

test("vlom oziroma nujni incident vedno zahteva manual_required", () => {
  const result = evaluateEmailDecision({ ...safeInquiry, body: "Ponoči je bil vlom, potrebujemo nujno intervencijo." });
  assert.equal(result.decision, DECISIONS.MANUAL);
});

test("confidence pod 0.90 onemogoči auto-send", () => {
  const result = evaluateEmailDecision({ ...safeInquiry, confidence: 0.89 });
  assert.equal(result.decision, DECISIONS.MANUAL);
  assert.equal(result.safe_to_auto_send, false);
});

test("auto_reply_count 1 prepreči drugi avtomatski odgovor", () => {
  const result = evaluateEmailDecision({ ...safeInquiry, auto_reply_count: 1 });
  assert.equal(result.decision, DECISIONS.REVIEW);
  assert.equal(result.safe_to_auto_send, false);
});

test("AI predlog auto_clarification brez safe_to_auto_send se zniža v review_required", () => {
  const result = evaluateEmailDecision({ ...safeInquiry, decision: DECISIONS.AUTO, safe_to_auto_send: false });
  assert.equal(result.decision, DECISIONS.REVIEW);
  assert.equal(result.safe_to_auto_send, false);
});

test("manual_required ni mogoče obiti z neposrednim approve zahtevkom", () => {
  const result = prepareOrderAction({
    order_id: "incident-1",
    action: "approve",
    sender_email: "stranka@example.si",
    subject: "Varnostni incident",
    draft_reply: "Interni osnutek",
    status: "manual_required",
    decision: "manual_required",
  });
  assert.equal(result.code, "MANUAL_REVIEW_REQUIRED");
});
