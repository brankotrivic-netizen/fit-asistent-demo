// Dejanske vhodne podatke vedno bere backend. Lokalni override ohrani rezultat
// n8n akcije med 30-sekundnimi osvežitvami, dokler ga ne vrne FIT Inbound Emails.
const sessionOverrides = new Map();
const liveOrders = new Map();
const nativeFetch = window.fetch.bind(window);
const nativeSetInterval = window.setInterval.bind(window);
window.__FIT_DECISION_ORDERS__ = liveOrders;

function actionBody(init) {
  if (!init?.body) return null;
  try { return JSON.parse(String(init.body)); } catch { return null; }
}

function responseWith(payload, response) {
  return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

function notifyDecisionUi() {
  window.dispatchEvent(new CustomEvent("fit-data-updated"));
}

window.fetch = async (input, init = {}) => {
  const requestUrl = typeof input === "string" ? input : input?.url || "";
  let requestInit = init;
  let body = null;

  if (requestUrl.endsWith("/api/order-action")) {
    body = actionBody(init);
    const order = body?.order_id ? liveOrders.get(String(body.order_id)) : null;
    if (body && order) {
      body = { ...body, thread_id: order.thread_id || "", gmail_message_id: order.inbound_message_id || "", decision: order.decision || "review_required" };
      requestInit = { ...init, body: JSON.stringify(body) };
    }
  }

  const response = await nativeFetch(input, requestInit);

  if (requestUrl.endsWith("/api/order-action") && body?.order_id) {
    const responsePayload = await response.clone().json().catch(() => ({}));
    const id = String(body.order_id);
    const current = sessionOverrides.get(id) || {};
    const order = liveOrders.get(id) || {};
    if (response.ok) {
      if (body.action === "update_draft") {
        current.draft_reply = body.draft_reply;
        current.status = "osnutek_posodobljen";
      } else if (body.action === "approve") {
        current.draft_reply = body.draft_reply;
        current.status = responsePayload.email_sent === true ? "sent" : responsePayload.status === "dry_run" ? "dry_run" : "sprejeto_v_n8n";
        current.sent_at = responsePayload.sent_at || "";
        current.message_id = responsePayload.message_id || "";
        current.send_error = "";
      } else if (body.action === "manual_review") current.status = "manual_required";
    } else if (body.action === "approve") {
      current.status = "send_error";
      current.send_error = responsePayload.send_error || responsePayload.error || "Pošiljanje ni uspelo.";
    }
    sessionOverrides.set(id, current);
    liveOrders.set(id, { ...order, ...current });
    notifyDecisionUi();
  }

  if (requestUrl.endsWith("/api/live-inbox") && response.ok) {
    const payload = await response.clone().json();
    if (Array.isArray(payload.items)) {
      payload.items = payload.items.map((item) => ({ ...item, ...(sessionOverrides.get(String(item.id)) || {}) }));
      liveOrders.clear();
      payload.items.forEach((item) => liveOrders.set(String(item.id), item));
      notifyDecisionUi();
    }
    return responseWith(payload, response);
  }

  return response;
};

// Periodično osveževanje med aktivno akcijo ne sme zamenjati izbranega objekta.
window.setInterval = (callback, delay, ...args) => nativeSetInterval(() => {
  const actionInProgress = document.querySelector('[aria-busy="true"]');
  if (!actionInProgress) callback(...args);
}, delay);

import("./decision-ui.js");
import("./app-core.js");
