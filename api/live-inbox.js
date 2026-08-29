import { DECISIONS, evaluateEmailDecision, normalizeMissingData } from "../lib/decision-engine.js";

const text = (value, max = 4000) => String(value ?? "").trim().slice(0, max);

function first(row, keys, max = 4000) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") return text(row[key], max);
  }
  return "";
}

export function safeMissingData(value) {
  return normalizeMissingData(value);
}

export function sanitizeInboundEmail(row = {}) {
  const id = first(row, ["id", "record_id", "email_id", "message_id"], 120);
  const inboundMessageId = first(row, ["inbound_message_id", "gmail_message_id", "message_id"], 240);
  const senderEmail = first(row, ["sender_email", "from_email", "reply_to", "customer_email", "email"], 320);
  const senderName = first(row, ["sender_name", "customer_name", "from_name", "contact_name"], 180);
  const sender = first(row, ["sender", "from"], 320) || senderEmail || senderName;
  const subject = first(row, ["subject", "email_subject"], 300);
  const body = first(row, ["body", "email_body", "original_body", "message"], 12000);
  const missingData = safeMissingData(row.missing_data ?? row.missing);
  const draftReply = first(row, ["draft_reply", "ai_draft_reply", "ai_draft", "draft"], 12000);
  const rawDecision = first(row, ["decision", "ai_decision"], 80);
  const rawConfidence = row.confidence ?? row.ai_confidence;
  const hasDecisionOutput = Boolean(rawDecision || String(rawConfidence ?? "").trim());
  const decisionOutput = hasDecisionOutput
    ? evaluateEmailDecision({ subject, body, missing_data: missingData, draft_reply: draftReply, decision: rawDecision, safe_to_auto_send: row.safe_to_auto_send === true, decision_reason: row.decision_reason, confidence: rawConfidence, auto_reply_count: rawDecision === DECISIONS.AUTO && ["sent", "poslano", "email_sent"].includes(first(row, ["status", "workflow_status"], 80).toLowerCase()) ? Math.max(0, (Number(row.auto_reply_count) || 0) - 1) : row.auto_reply_count })
    : { decision: DECISIONS.REVIEW, safe_to_auto_send: false, decision_reason: "Obstoječi zapis še nima novega strukturiranega AI odločanja, zato zahteva človeško potrditev.", confidence: 0, missing_data: missingData, draft_reply: draftReply };
  const rawStatus = first(row, ["status", "workflow_status"], 80);

  return {
    id: id || `inbound-${Date.now()}`,
    inbound_message_id: inboundMessageId,
    thread_id: first(row, ["thread_id", "gmail_thread_id", "threadId"], 240),
    sender,
    sender_name: senderName,
    sender_email: senderEmail,
    customer_name: first(row, ["customer_name", "sender_name", "contact_name"], 180),
    company_name: first(row, ["company_name", "company"], 180),
    subject,
    summary: first(row, ["summary", "ai_summary"], 2500),
    email_type: first(row, ["email_type", "type", "category"], 100),
    product: first(row, ["product", "product_name", "description", "sku"], 500),
    sku: first(row, ["sku", "product_code"], 160),
    description: first(row, ["description", "product_description", "product"], 800),
    quantity: row.quantity ?? row.qty ?? "",
    unit: first(row, ["unit", "quantity_unit"], 80),
    requested_date: first(row, ["requested_date", "delivery_date"], 100),
    missing_data: decisionOutput.missing_data,
    priority: first(row, ["priority", "urgency"], 80) || "običajna",
    status: rawStatus || decisionOutput.decision,
    decision: decisionOutput.decision,
    safe_to_auto_send: decisionOutput.safe_to_auto_send,
    decision_reason: decisionOutput.decision_reason,
    confidence: decisionOutput.confidence,
    auto_reply_count: Math.max(0, Math.trunc(Number(row.auto_reply_count) || 0)),
    draft_reply: decisionOutput.draft_reply,
    body,
    created_at: first(row, ["created_at", "received_at", "date"], 100),
    draft_generated_at: first(row, ["draft_generated_at"], 100),
    approved_at: first(row, ["approved_at"], 100),
    sent_at: first(row, ["sent_at"], 100),
    message_id: first(row, ["message_id", "sent_message_id"], 240),
    send_error: first(row, ["send_error", "error_message"], 2000),
  };
}

function rowsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["items", "data", "rows", "records"]) if (Array.isArray(payload?.[key])) return payload[key];
  return [];
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  const sourceUrl = process.env.N8N_LIVE_INBOX_URL;
  if (!sourceUrl) return res.status(503).json({ error: "Live inbox is not configured", code: "LIVE_INBOX_NOT_CONFIGURED" });
  const sharedSecret = text(process.env.N8N_SHARED_SECRET, 1000);
  if (!sharedSecret) return res.status(503).json({ error: "Live inbox authentication is not configured", code: "N8N_SHARED_SECRET_NOT_CONFIGURED" });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const upstream = await fetch(sourceUrl, { method: "GET", headers: { Accept: "application/json", "x-buma-secret": sharedSecret }, signal: controller.signal, cache: "no-store" });
    if (!upstream.ok) throw new Error(`Upstream returned ${upstream.status}`);
    const rows = rowsFromPayload(await upstream.json()).slice(0, 100).map(sanitizeInboundEmail);
    return res.status(200).json({ success: true, source: "FIT Inbound Emails", count: rows.length, items: rows });
  } catch (error) {
    const code = error?.name === "AbortError" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE";
    return res.status(502).json({ error: "Live inbox is temporarily unavailable", code });
  } finally { clearTimeout(timeout); }
}
