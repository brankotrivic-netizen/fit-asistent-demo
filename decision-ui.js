const decisions = {
  auto_clarification: "Samodejno dopolnjevanje",
  review_required: "Čaka potrditev",
  manual_required: "Ročna obdelava",
};

let scheduled = false;
let observer;

function selectedOrder() {
  const hashMatch = location.hash.match(/^#order=(.+)$/);
  const id = hashMatch ? decodeURIComponent(hashMatch[1]) : document.querySelector(".mail.active")?.dataset.orderId;
  return id ? window.__FIT_DECISION_ORDERS__?.get(String(id)) : null;
}

function displayStatus(order) {
  const status = String(order?.status || "").toLowerCase();
  if (["sent", "poslano", "email_sent"].includes(status)) return "Poslano";
  if (status === "dry_run") return "Dry-run potrjen";
  if (["send_error", "napaka_pri_posiljanju"].includes(status)) return "Napaka pri pošiljanju";
  return decisions[order?.decision] || "Čaka potrditev";
}

function dateLabel(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Še ni poslano";
  return new Intl.DateTimeFormat("sl-SI", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function row(label, value) {
  const item = document.createElement("div");
  item.className = "decision-row";
  const key = document.createElement("span");
  key.textContent = label;
  const content = document.createElement("b");
  content.textContent = value || "—";
  item.append(key, content);
  return item;
}

function makeDecisionSection(order) {
  const section = document.createElement("div");
  section.className = `sec decision-section decision-${order.decision || "review_required"}`;
  const label = document.createElement("div");
  label.className = "sec-label";
  label.textContent = "Odločitev AI in varnostni pregled";
  const card = document.createElement("div");
  card.className = "decision-card";
  const title = document.createElement("div");
  title.className = "decision-title";
  title.textContent = displayStatus(order);
  const reason = document.createElement("p");
  reason.textContent = order.decision_reason || "Razlog še ni na voljo.";
  const meta = document.createElement("div");
  meta.className = "decision-meta";
  meta.append(
    row("Confidence", Number.isFinite(Number(order.confidence)) ? `${Math.round(Number(order.confidence) * 100)} %` : "—"),
    row("Thread", order.thread_id || "Ni naveden"),
    row("Samodejni odgovori", String(order.auto_reply_count ?? 0)),
  );
  card.append(title, reason, meta);

  if (order.decision === "auto_clarification") {
    const auto = document.createElement("div");
    auto.className = "auto-audit";
    auto.append(row("Kaj je AI vprašal", order.draft_reply || "Osnutek ni na voljo"), row("Čas pošiljanja", dateLabel(order.sent_at)));
    card.append(auto);
  } else if (order.decision === "manual_required") {
    const block = document.createElement("div");
    block.className = "manual-block";
    block.textContent = "Samodejno pošiljanje je blokirano. Primer mora obravnavati odgovorna oseba.";
    card.append(block);
  }

  if (order.message_id && ["sent", "poslano", "email_sent"].includes(String(order.status).toLowerCase())) card.append(row("Gmail message ID", order.message_id));
  if (order.send_error) {
    const error = document.createElement("div");
    error.className = "send-error";
    error.textContent = order.send_error;
    card.append(error);
  }
  section.append(label, card);
  return section;
}

function decorateList() {
  document.querySelectorAll(".mail[data-order-id]").forEach((button) => {
    const order = window.__FIT_DECISION_ORDERS__?.get(String(button.dataset.orderId));
    const status = button.querySelector(".mail-status");
    if (order && status) status.textContent = displayStatus(order);
  });
}

function decorateDetail() {
  const order = selectedOrder();
  const article = document.querySelector("#result article");
  if (!order || !article) return;
  article.querySelector(".decision-section")?.remove();
  const statusSection = article.querySelector(".chips")?.closest(".sec");
  statusSection?.insertAdjacentElement("afterend", makeDecisionSection(order));

  const statusChip = article.querySelector(".chip.intent");
  if (statusChip) statusChip.textContent = `Status: ${displayStatus(order)}`;
  const approve = document.getElementById("approveButton");
  const edit = document.getElementById("editButton");
  const manual = document.getElementById("manualButton");
  const canReview = order.decision === "review_required";
  const finalStatus = ["sent", "poslano", "email_sent", "dry_run", "sprejeto_v_n8n"].includes(String(order.status).toLowerCase());
  if (approve) {
    approve.hidden = !canReview;
    if (canReview && !finalStatus && approve.getAttribute("aria-busy") !== "true") approve.textContent = "Potrdi in pošlji";
  }
  if (edit) edit.hidden = !canReview;
  if (manual) {
    manual.hidden = order.decision === "auto_clarification" || finalStatus;
    if (order.decision === "manual_required") manual.textContent = "Označi za ročno obdelavo";
  }

  const badge = article.querySelector(".draft-badge");
  if (badge) badge.textContent = order.decision === "auto_clarification" ? "Samodejno po varnostnem pregledu" : order.decision === "manual_required" ? "Samo za ročno obdelavo" : "Po človeški potrditvi prek n8n";
  const note = article.querySelector(".draft-note");
  if (note) note.textContent = order.decision === "auto_clarification"
    ? "n8n sme poslati samo prvo varno pojasnilo v threadu in šele po vseh varnostnih preverjanjih."
    : order.decision === "manual_required"
      ? "Ta vsebina je informativna. Dashboard in backend ne dovolita avtomatskega pošiljanja."
      : "Končni odgovor se pošlje prek zaščitenega n8n webhooka šele po človeški potrditvi.";
}

function decorate() {
  scheduled = false;
  observer?.disconnect();
  decorateList();
  decorateDetail();
  observer?.observe(document.body, { childList: true, subtree: true });
}

function scheduleDecorate() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(decorate);
}

observer = new MutationObserver(scheduleDecorate);
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener("fit-data-updated", scheduleDecorate);
window.addEventListener("hashchange", scheduleDecorate);
scheduleDecorate();
