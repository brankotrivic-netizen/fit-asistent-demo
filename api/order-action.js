import { createHash, randomUUID } from "node:crypto";
import { DECISIONS } from "../lib/decision-engine.js";

const ALLOWED_ACTIONS = new Set(["approve", "update_draft", "manual_review"]);
const DELIVERY_CACHE_MS = 15 * 60 * 1000;
const deliveryCache = new Map();
const text = (value, max = 4000) => String(value ?? "").trim().slice(0, max);

function idempotencyKey(orderId, threadId) {
  return createHash("sha256").update(`fit-asistent-demo:approve:${orderId}:${threadId || "no-thread"}`).digest("hex");
}

export function prepareOrderAction(body = {}) {
  const orderId = text(body.order_id, 120);
  const threadId = text(body.thread_id, 240);
  const gmailMessageId = text(body.gmail_message_id, 240);
  const action = text(body.action, 40);
  if (!orderId) return { error: "order_id is required" };
  if (!ALLOWED_ACTIONS.has(action)) return { error: "Unsupported action" };

  const draftReply = text(body.draft_reply, 12000);
  const senderEmail = text(body.sender_email, 320);
  const subject = text(body.subject, 300);
  const status = text(body.status || body.previous_status, 80);
  const decision = text(body.decision, 80);
  if (action === "update_draft" && !draftReply) return { error: "draft_reply is required" };
  if (action === "approve") {
    if (decision === DECISIONS.MANUAL) return { error: "manual_required cannot be approved automatically", code: "MANUAL_REVIEW_REQUIRED" };
    if (!senderEmail) return { error: "sender_email is required" };
    if (!subject) return { error: "subject is required" };
    if (!draftReply) return { error: "draft_reply is required" };
    if (!status) return { error: "status is required" };
  }

  return {
    action_id: randomUUID(),
    idempotency_key: action === "approve" ? idempotencyKey(orderId, threadId) : "",
    source: "fit-asistent-demo",
    table: "FIT Inbound Emails",
    order_id: orderId,
    thread_id: threadId,
    gmail_message_id: gmailMessageId,
    action,
    sender_email: senderEmail,
    subject,
    draft_reply: draftReply,
    decision: decision || DECISIONS.REVIEW,
    status,
    previous_status: text(body.previous_status, 80),
    requested_at: new Date().toISOString(),
    delivery: action === "approve" ? "n8n_pending" : "prepared_only",
    email_sent: false,
  };
}

function pruneDeliveryCache() {
  const cutoff = Date.now() - DELIVERY_CACHE_MS;
  for (const [key, entry] of deliveryCache) if (entry.createdAt < cutoff) deliveryCache.delete(key);
}

function n8nResult(payload = {}) {
  const nested = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const status = text(payload.status || nested.status, 40).toLowerCase();
  const emailSent = payload.email_sent === true || payload.emailSent === true || nested.email_sent === true || ["sent", "poslano", "email_sent"].includes(status);
  const testMode = payload.test_mode === true || nested.test_mode === true || status === "dry_run";
  return {
    email_sent: emailSent,
    status: emailSent ? "sent" : status === "send_error" || status === "error" ? "send_error" : testMode ? "dry_run" : "accepted",
    test_mode: testMode,
    sent_at: text(payload.sent_at || nested.sent_at, 100),
    message_id: text(payload.message_id || nested.message_id, 240),
    send_error: text(payload.send_error || payload.error || nested.send_error, 2000),
  };
}

async function postApproveToN8n(action) {
  const webhookUrl = text(process.env.N8N_ORDER_ACTION_URL, 2000);
  if (!webhookUrl) { const error = new Error("N8N_ORDER_ACTION_URL is not configured"); error.code = "N8N_ORDER_ACTION_NOT_CONFIGURED"; error.httpStatus = 503; throw error; }
  try { const parsedUrl = new URL(webhookUrl); if (!new Set(["http:", "https:"]).has(parsedUrl.protocol)) throw new Error("Unsupported protocol"); }
  catch { const error = new Error("N8N_ORDER_ACTION_URL is invalid"); error.code = "N8N_ORDER_ACTION_INVALID_URL"; error.httpStatus = 503; throw error; }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const sharedSecret = text(process.env.N8N_SHARED_SECRET, 1000);
  const payload = {
    order_id: action.order_id,
    thread_id: action.thread_id,
    gmail_message_id: action.gmail_message_id,
    action: "approve",
    sender_email: action.sender_email,
    subject: action.subject,
    draft_reply: action.draft_reply,
    decision: action.decision,
    status: action.status,
    action_id: action.action_id,
    idempotency_key: action.idempotency_key,
    requested_at: action.requested_at,
    test_mode: String(process.env.N8N_TEST_MODE || "").toLowerCase() === "true",
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "x-idempotency-key": action.idempotency_key, ...(sharedSecret ? { "x-buma-secret": sharedSecret } : {}) },
      body: JSON.stringify(payload), signal: controller.signal,
    });
    const raw = await response.text();
    let responsePayload = {};
    if (raw) { try { responsePayload = JSON.parse(raw); } catch { responsePayload = {}; } }
    if (!response.ok) {
      const error = new Error(`n8n returned ${response.status}`); error.code = "N8N_ORDER_ACTION_REJECTED"; error.httpStatus = 502; error.sendError = text(responsePayload.send_error || responsePayload.error, 2000); throw error;
    }
    return { delivery: "n8n", accepted: true, upstream_status: response.status, ...n8nResult(responsePayload) };
  } catch (cause) {
    if (cause?.code) throw cause;
    const error = new Error(cause?.name === "AbortError" ? "n8n timed out" : "n8n is unavailable");
    error.code = cause?.name === "AbortError" ? "N8N_ORDER_ACTION_TIMEOUT" : "N8N_ORDER_ACTION_UNAVAILABLE";
    error.httpStatus = cause?.name === "AbortError" ? 504 : 502;
    throw error;
  } finally { clearTimeout(timeout); }
}

async function deliverApproveOnce(action) {
  pruneDeliveryCache();
  const key = action.idempotency_key;
  const existing = deliveryCache.get(key);
  if (existing?.state === "fulfilled") return { ...existing.result, duplicate: true };
  if (existing?.state === "pending") return { ...(await existing.promise), duplicate: true };
  const promise = postApproveToN8n(action);
  deliveryCache.set(key, { state: "pending", promise, createdAt: Date.now() });
  try {
    const result = await promise;
    deliveryCache.set(key, { state: "fulfilled", result, createdAt: Date.now() });
    return { ...result, duplicate: false };
  } catch (error) { deliveryCache.delete(key); throw error; }
}

export function resetOrderActionCacheForTests() { deliveryCache.clear(); }

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  let body = req.body || {};
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON" }); } }
  const preparedAction = prepareOrderAction(body);
  if (preparedAction.error) return res.status(preparedAction.code === "MANUAL_REVIEW_REQUIRED" ? 409 : 400).json(preparedAction);
  if (preparedAction.action !== "approve") return res.status(202).json({ success: true, status: "prepared", message: "Akcija je pripravljena. E-pošta ni bila poslana.", prepared_action: preparedAction });

  try {
    const result = await deliverApproveOnce(preparedAction);
    if (result.status === "send_error") {
      return res.status(502).json({ success: false, status: "send_error", error: result.send_error || "Gmail pošiljanje ni uspelo.", send_error: result.send_error, email_sent: false, duplicate: result.duplicate, idempotency_key: preparedAction.idempotency_key });
    }
    return res.status(200).json({
      success: true,
      status: result.status,
      delivery: result.delivery,
      email_sent: result.email_sent,
      test_mode: result.test_mode === true,
      sent_at: result.sent_at,
      message_id: result.message_id,
      duplicate: result.duplicate,
      message: result.email_sent
        ? "Poslano."
        : result.status === "dry_run"
          ? "n8n je zaključil varnostna preverjanja v dry-run načinu. Gmail ni bil kontaktiran."
          : "n8n je potrdil sprejem. E-pošta še ni potrjena kot poslana.",
      action_id: preparedAction.action_id,
      idempotency_key: preparedAction.idempotency_key,
    });
  } catch (error) {
    return res.status(error.httpStatus || 502).json({ success: false, status: "send_error", error: error.sendError || "Potrditve ni bilo mogoče poslati v n8n.", code: error.code || "N8N_ORDER_ACTION_FAILED", send_error: error.sendError || "", email_sent: false });
  }
}
