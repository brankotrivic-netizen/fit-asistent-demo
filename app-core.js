const API_URL = "/api/live-inbox";
const ACTION_URL = "/api/order-action";
const REFRESH_INTERVAL_MS = 30000;

const state = {
  orders: [],
  selectedId: null,
  editing: false,
  busy: false,
  busyAction: "",
  firstLoad: true,
  activeCategory: "order",
};

const elements = {
  mailList: document.getElementById("mailList"),
  empty: document.getElementById("empty"),
  emptyIcon: document.getElementById("emptyIcon"),
  emptyTitle: document.getElementById("emptyTitle"),
  emptyText: document.getElementById("emptyText"),
  retryButton: document.getElementById("retryButton"),
  result: document.getElementById("result"),
  liveSync: document.getElementById("liveSync"),
  inboxTabs: document.getElementById("inboxTabs"),
};

const priorityMap = {
  nujno: { label: "NUJNO", detail: "🔥 Nujna prioriteta", cls: "danger", rank: 0 },
  visoka: { label: "Visoka", detail: "Visoka prioriteta", cls: "warn", rank: 1 },
  obicajna: { label: "Običajna", detail: "Običajna prioriteta", cls: "conf", rank: 2 },
};

function value(input, fallback = "—") {
  const normalized = String(input ?? "").trim();
  return normalized || fallback;
}

function escapeHtml(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function canonicalPriority(input) {
  const raw = String(input ?? "").trim().toLocaleLowerCase("sl");
  if (["nujno", "urgent", "kritično", "kriticno", "critical"].includes(raw)) return "nujno";
  if (["visoka", "visoko", "high"].includes(raw)) return "visoka";
  return "obicajna";
}

function missingData(input) {
  if (Array.isArray(input)) return input.map((entry) => value(entry, "")).filter(Boolean);
  if (!input) return [];
  if (typeof input === "object") {
    return Object.entries(input).map(([key, entry]) => entry === true ? key : `${key}: ${entry}`);
  }
  try {
    return missingData(JSON.parse(String(input)));
  } catch {
    return String(input).split(/\r?\n|,\s*/).map((entry) => entry.trim()).filter(Boolean);
  }
}

function normalizeOrder(raw) {
  const created = raw.created_at ? new Date(raw.created_at) : null;
  const validDate = created && !Number.isNaN(created.getTime()) ? created : null;
  const senderName = value(raw.sender_name || raw.customer_name, "");
  const senderEmail = value(raw.sender_email, "");
  const senderRaw = value(raw.sender, "");
  return {
    id: value(raw.id, `inbound-${Date.now()}`),
    sender: senderName || senderRaw || senderEmail || "Neznan pošiljatelj",
    senderName,
    senderEmail,
    companyName: value(raw.company_name, ""),
    subject: value(raw.subject, "Brez zadeve"),
    summary: value(raw.summary, "Povzetek še ni pripravljen."),
    product: value(raw.product || raw.description || raw.sku),
    sku: value(raw.sku, ""),
    description: value(raw.description, ""),
    quantity: raw.quantity === 0 ? "0" : value(raw.quantity),
    unit: value(raw.unit, ""),
    missingData: missingData(raw.missing_data),
    priority: canonicalPriority(raw.priority),
    status: value(raw.status, "novo"),
    draftReply: value(raw.draft_reply, ""),
    emailType: value(raw.email_type, "Vhodno naročilo"),
    category: ["order", "installation", "service"].includes(String(raw.category || "").toLowerCase()) ? String(raw.category).toLowerCase() : "manual_review",
    categoryConfidence: Number(raw.category_confidence) || 0,
    body: value(raw.body, ""),
    requestedDate: value(raw.requested_date, ""),
    createdAt: validDate,
    createdAtRaw: value(raw.created_at, ""),
  };
}

function formatDate(date) {
  if (!date) return "Datum ni naveden";
  return new Intl.DateTimeFormat("sl-SI", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function formatTime(date) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("sl-SI", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function statusLabel(status) {
  return value(status, "novo").replaceAll("_", " ");
}

function setEmpty(icon, title, text, canRetry = false) {
  elements.empty.style.display = "flex";
  elements.result.classList.remove("show");
  elements.emptyIcon.textContent = icon;
  elements.emptyTitle.textContent = title;
  elements.emptyText.textContent = text;
  elements.retryButton.hidden = !canRetry;
}

function setSync(text, className = "") {
  elements.liveSync.textContent = text;
  elements.liveSync.className = `live-sync ${className}`.trim();
}

function createOrderButton(order) {
  const priority = priorityMap[order.priority];
  const button = document.createElement("button");
  button.className = `mail${order.id === state.selectedId ? " active" : ""}`;
  button.type = "button";
  button.dataset.orderId = order.id;
  button.setAttribute("aria-pressed", order.id === state.selectedId ? "true" : "false");
  button.innerHTML = `
    <div class="from">
      <span>${escapeHtml(order.sender)}</span>
      ${order.priority === "nujno" ? '<span class="mail-prio">NUJNO</span>' : ""}
      <time datetime="${escapeHtml(order.createdAtRaw)}">${escapeHtml(formatTime(order.createdAt))}</time>
    </div>
    <div class="subj">${escapeHtml(order.subject)}</div>
    <div class="snip">${escapeHtml(order.summary)}</div>
    <div class="mail-meta">
      <span class="mail-status">${escapeHtml(statusLabel(order.status))}</span>
      ${order.priority !== "obicajna" ? `<span class="mail-status">${escapeHtml(priority.label)}</span>` : ""}
    </div>`;
  button.addEventListener("click", () => selectOrder(order.id));
  return button;
}

function renderList() {
  elements.mailList.replaceChildren();
  const visibleOrders = state.orders.filter((order) => order.category === state.activeCategory);
  elements.inboxTabs?.querySelectorAll(".inbox-tab").forEach((button) => {
    const category = button.dataset.category;
    const active = category === state.activeCategory;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    const count = button.querySelector("[data-count]");
    if (count) count.textContent = String(state.orders.filter((order) => order.category === category).length);
  });
  if (!state.orders.length) return;
  const heading = document.createElement("div");
  const urgentCount = visibleOrders.filter((order) => order.priority === "nujno").length;
  heading.className = "folder-head";
  heading.innerHTML = `<span>FIT Inbound Emails</span><span class="cnt">${urgentCount ? `<span class="nuj">${urgentCount} nujno</span> · ` : ""}${visibleOrders.length}</span>`;
  elements.mailList.appendChild(heading);
  visibleOrders.forEach((order) => elements.mailList.appendChild(createOrderButton(order)));
}

function selectedOrder() {
  return state.orders.find((order) => order.id === state.selectedId) || null;
}

function selectOrder(orderId, updateHash = true) {
  state.selectedId = String(orderId);
  state.editing = false;
  renderList();
  renderDetail();
  if (updateHash) history.replaceState(null, "", `#order=${encodeURIComponent(orderId)}`);
}

function draftHtml(input) {
  return escapeHtml(input).replace(
    /\[(TERMIN OGLEDA|TERMIN SERVISA|CENA|TELEFON|ROK MONTAŽE)\]/g,
    '<span class="ph">[$1]</span>',
  );
}

function senderLine(order) {
  if (order.senderEmail && !order.sender.includes(order.senderEmail)) {
    return `${escapeHtml(order.sender)} &lt;${escapeHtml(order.senderEmail)}&gt;`;
  }
  return escapeHtml(order.sender);
}

function detailFields(order) {
  const quantity = order.unit && order.quantity !== "—" ? `${order.quantity} ${order.unit}` : order.quantity;
  return `<div class="tbl-wrap"><table>
    <thead><tr><th>Izdelek</th><th>Šifra</th><th>Količina</th><th>Želeni datum</th></tr></thead>
    <tbody><tr>
      <td><b>${escapeHtml(order.product)}</b>${order.description && order.description !== order.product ? `<br><span class="none">${escapeHtml(order.description)}</span>` : ""}</td>
      <td class="mono">${escapeHtml(value(order.sku))}</td>
      <td class="num"><b>${escapeHtml(quantity)}</b></td>
      <td>${escapeHtml(value(order.requestedDate))}</td>
    </tr></tbody>
  </table></div>`;
}

function approvalUi(order) {
  const sent = order.status === "poslano";
  const accepted = order.status === "sprejeto_v_n8n";
  const dryRun = order.status === "dry_run";
  if (state.busyAction === "approve") return { label: "Pošiljam...", locked: true, pill: "" };
  if (sent) return { label: "Poslano", locked: true, pill: "✓ Poslano" };
  if (dryRun) return { label: "Dry-run potrjen", locked: true, pill: "✓ Dry-run · Gmail ni bil poslan" };
  if (accepted) return { label: "Sprejeto v n8n", locked: true, pill: "✓ Sprejeto v n8n" };
  return { label: "Potrdi", locked: state.busy, pill: "" };
}

function renderDetail(message = "", messageIsError = false) {
  const order = selectedOrder();
  if (!order) {
    setEmpty("←", "Izberite naročilo na levi.", "Prikažejo se pošiljatelj, izdelek, količina, manjkajoči podatki, status in AI osnutek.");
    return;
  }

  elements.empty.style.display = "none";
  const priority = priorityMap[order.priority];
  const approval = approvalUi(order);
  const missing = order.missingData.length
    ? `<ul class="missing-list">${order.missingData.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>`
    : '<div class="summary">Ni manjkajočih podatkov.</div>';
  const draftContent = state.editing
    ? `<textarea class="draft-editor" id="draftEditor" aria-label="Uredi AI osnutek odgovora">${escapeHtml(order.draftReply)}</textarea>`
    : order.draftReply
      ? `<div class="draft-body" id="draftText">${draftHtml(order.draftReply)}</div>`
      : '<div class="no-draft"><b>Osnutek še ni pripravljen.</b> Naročilo lahko označite za ročno obdelavo.</div>';

  elements.result.innerHTML = `
    <article aria-labelledby="orderSubject">
      <div class="sec"><div class="sec-label">Vhodno naročilo</div><div class="draft orig-mail">
        <div class="draft-head"><span>Od: <b>${senderLine(order)}</b></span><span>${escapeHtml(formatDate(order.createdAt))}</span></div>
        <div class="draft-body"><b id="orderSubject">${escapeHtml(order.subject)}</b>${order.body ? `\n\n${escapeHtml(order.body)}` : ""}</div>
      </div></div>

      <div class="sec"><div class="sec-label">Stanje naročila</div><div class="chips">
        <span class="chip ${priority.cls}">${escapeHtml(priority.detail)}</span>
        <span class="chip intent">Status: ${escapeHtml(statusLabel(order.status))}</span>
        <span class="chip folder">${escapeHtml(order.emailType)}</span>
      </div></div>

      <div class="sec"><div class="sec-label">AI povzetek</div><div class="summary">${escapeHtml(order.summary)}</div></div>
      <div class="sec"><div class="sec-label">Izdelek in količina</div>${detailFields(order)}</div>
      <div class="sec"><div class="sec-label">Missing data</div>${missing}</div>

      <div class="sec"><div class="sec-label">AI draft reply</div><div class="draft">
        <div class="draft-head">
          <span>Za: <b>${escapeHtml(order.senderEmail || order.sender)}</b> · Re: ${escapeHtml(order.subject)}</span>
          <span class="draft-badge">Po potrditvi prek n8n</span>
        </div>
        ${draftContent}
        <div class="draft-note">Potrditev pošlje končni osnutek v zaščiten n8n webhook. Stanje »Poslano« se prikaže samo, ko n8n izrecno potrdi pošiljanje e-pošte.</div>
      </div></div>

      <div class="actions">
        <button class="btn ok" id="approveButton" type="button" aria-busy="${state.busyAction === "approve"}" ${approval.locked ? "disabled" : ""}>${approval.label}</button>
        <button class="btn alt" id="editButton" type="button" ${state.busy || approval.locked || !order.draftReply ? "disabled" : ""}>${state.editing ? "Shrani odgovor" : "Uredi odgovor"}</button>
        ${state.editing ? `<button class="btn alt" id="cancelEditButton" type="button" ${state.busy ? "disabled" : ""}>Prekliči</button>` : `<button class="btn alt" id="manualButton" type="button" ${state.busy || approval.locked ? "disabled" : ""}>Ročna obdelava</button>`}
        ${approval.pill ? `<span class="confirmed-pill show">${approval.pill}</span>` : ""}
      </div>
      <div class="toast${message ? " show" : ""}${messageIsError ? " error" : ""}" id="toast" role="status" aria-live="polite">${escapeHtml(message)}</div>
    </article>`;
  elements.result.classList.add("show");

  document.getElementById("approveButton").addEventListener("click", () => submitAction("approve"));
  document.getElementById("editButton").addEventListener("click", () => {
    if (!state.editing) {
      state.editing = true;
      renderDetail();
      document.getElementById("draftEditor")?.focus();
      return;
    }
    submitAction("update_draft", document.getElementById("draftEditor")?.value || "");
  });
  document.getElementById("cancelEditButton")?.addEventListener("click", () => {
    state.editing = false;
    renderDetail();
  });
  document.getElementById("manualButton")?.addEventListener("click", () => submitAction("manual_review"));
}

async function submitAction(action, editedDraft = "") {
  const order = selectedOrder();
  if (!order || state.busy || (action === "approve" && ["poslano", "sprejeto_v_n8n", "dry_run"].includes(order.status))) return;

  state.busy = true;
  state.busyAction = action;
  renderDetail(action === "approve" ? "Pošiljam v n8n..." : "");

  let message = "";
  let messageIsError = false;
  try {
    const finalDraft = action === "update_draft" ? editedDraft.trim() : order.draftReply;
    const response = await fetch(ACTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        order_id: order.id,
        action,
        sender_email: order.senderEmail,
        subject: order.subject,
        draft_reply: finalDraft,
        status: order.status,
        previous_status: order.status,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Akcije ni bilo mogoče izvesti.");

    if (action === "update_draft") {
      order.draftReply = finalDraft;
      order.status = "osnutek_posodobljen";
      state.editing = false;
    } else if (action === "approve") {
      order.status = payload.email_sent === true ? "poslano" : payload.status === "dry_run" ? "dry_run" : "sprejeto_v_n8n";
    } else {
      order.status = "rocna_obdelava_pripravljena";
    }
    message = payload.message || (action === "approve" ? "n8n je potrdil sprejem." : "Akcija je pripravljena.");
  } catch (error) {
    message = error.message || "Akcije ni bilo mogoče izvesti.";
    messageIsError = true;
  } finally {
    state.busy = false;
    state.busyAction = "";
  }

  renderList();
  renderDetail(message, messageIsError);
}

function orderIdFromHash() {
  const match = location.hash.match(/^#order=(.+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function loadOrders({ manual = false } = {}) {
  if (manual || state.firstLoad) {
    setSync("Povezujem …");
    if (state.firstLoad) setEmpty("↻", "Nalagam nova naročila …", "Povezujem se z backendom in berem FIT Inbound Emails.");
  }

  try {
    const response = await fetch(API_URL, { headers: { Accept: "application/json" }, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Backend trenutno ni dosegljiv.");

    state.orders = (Array.isArray(payload.items) ? payload.items : [])
      .map(normalizeOrder)
      .sort((a, b) => priorityMap[a.priority].rank - priorityMap[b.priority].rank || (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    state.firstLoad = false;
    setSync(`Živo · ${state.orders.length}`, "ok");

    if (!state.orders.length) {
      state.selectedId = null;
      renderList();
      setEmpty("✓", "Ni novih vhodnih naročil.", "FIT Inbound Emails je povezan, vendar trenutno ne vsebuje novih zapisov.");
      return;
    }

    const requestedId = orderIdFromHash();
    if (!state.orders.some((order) => order.category === state.activeCategory)) state.activeCategory = state.orders[0].category;
    const currentStillExists = state.orders.some((order) => order.id === state.selectedId);
    const requestedExists = state.orders.some((order) => order.id === requestedId);
    const firstVisible = state.orders.find((order) => order.category === state.activeCategory);
    state.selectedId = requestedExists ? requestedId : currentStillExists && state.orders.find((order) => order.id === state.selectedId)?.category === state.activeCategory ? state.selectedId : firstVisible?.id || null;
    renderList();
    renderDetail();
  } catch (error) {
    state.firstLoad = false;
    setSync("Povezava ni na voljo", "error");
    if (!state.orders.length) setEmpty("!", "Naročil ni bilo mogoče naložiti.", error.message || "Preverite backend povezavo.", true);
  }
}

elements.retryButton.addEventListener("click", () => loadOrders({ manual: true }));
elements.inboxTabs?.addEventListener("click", (event) => {
  const button = event.target.closest(".inbox-tab[data-category]");
  if (!button) return;
  state.activeCategory = button.dataset.category;
  const visible = state.orders.filter((order) => order.category === state.activeCategory);
  if (!visible.some((order) => order.id === state.selectedId)) state.selectedId = visible[0]?.id || null;
  state.editing = false;
  renderList();
  renderDetail();
});
window.addEventListener("hashchange", () => {
  const requestedId = orderIdFromHash();
  if (requestedId && state.orders.some((order) => order.id === requestedId)) selectOrder(requestedId, false);
});

loadOrders();
window.setInterval(loadOrders, REFRESH_INTERVAL_MS);
