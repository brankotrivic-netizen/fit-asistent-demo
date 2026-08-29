export const DECISIONS = Object.freeze({
  AUTO: "auto_clarification",
  REVIEW: "review_required",
  MANUAL: "manual_required",
});

const DECISION_VALUES = new Set(Object.values(DECISIONS));
const MANUAL_PATTERNS = [
  /reklamac|prito(?:z|ž)b|nezadovoljn|razo(?:c|č)aran/iu,
  /vlom|vdr(?:l|li)|varnostn(?:i|ega)? incident|napad|gro(?:z|ž)nj/iu,
  /nujn(?:a|o|e)? intervenc|takoj(?:šnja|snja)? intervenc|spro(?:z|ž)i.*alarm/iu,
  /napak(?:a|e)?.{0,30}(?:alarm|vnc)|(?:alarm|vnc).{0,30}napak/iu,
  /pogodb|odpoved|odvet|to(?:z|ž)b|pravn|od(?:s|š)kodnin/iu,
  /ob(?:c|č)utljiv.{0,30}varnost|varnostn.{0,30}(?:koda|na(?:c|č)rt|ranljivost)/iu,
];
const REVIEW_PATTERNS = [
  /(?:cen|cena|cenik|popust|predra(?:c|č)un|ponudb)/iu,
  /(?:konkretn|to(?:c|č)n).{0,35}(?:rok|termin)|(?:rok izvedbe|rok monta(?:z|ž)e|termin izvedbe)/iu,
  /(?:ali|kdaj).{0,35}(?:izvedete|montirate|pridete)|(?:potrdite|zagotovite).{0,25}(?:rok|termin)/iu,
  /(?:tehni(?:c|č)n|varnostn).{0,30}(?:re(?:s|š)itev|na(?:c|č)rt)|koliko varnostnikov/iu,
  /(?:izberite|dolo(?:c|č)ite|priporo(?:c|č)ite).{0,30}(?:sistem|opremo|re(?:s|š)itev)/iu,
];
const UNSAFE_DRAFT_PATTERNS = [
  /(?:€|eur|evr|cena (?:je|bo|zna(?:s|š)a)|popust (?:je|bo|odobren)|ponujamo vam)/iu,
  /(?:potrjujemo|zagotavljamo|obljubljamo).{0,45}(?:termin|rok|izvedbo|ceno|popust)/iu,
  /(?:izvedli|montirali|pri(?:s|š)li) bomo.{0,35}(?:do|dne|ob|v roku)/iu,
  /(?:potrebujete|dolo(?:c|č)ili smo|predlagamo).{0,25}(?:varnostnikov|konkretno re(?:s|š)itev|sistem)/iu,
  /(?:pogodba je|odpoved je|pravno vam svetujemo)/iu,
];
const SAFE_MISSING_PATTERNS = [
  /naslov|lokacij/iu,
  /velikost|povr(?:s|š)in|kvadratur/iu,
  /kontaktna oseba|ime in priimek|kontakt/iu,
  /telefon|telefonska|mobiln/iu,
  /tip objekta|vrsta objekta|namembnost/iu,
  /opis potrebe|opis (?:objekta|situacije)|kaj potrebujete/iu,
  /tip storitve|vrsta storitve|(?:z|ž)elena storitev/iu,
];

const text = (value, max = 12000) => String(value ?? "").trim().slice(0, max);
const confidenceNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
};

export function normalizeMissingData(value) {
  if (Array.isArray(value)) return value.map((entry) => {
    if (typeof entry === "string") return text(entry, 300);
    if (entry && typeof entry === "object") return text(entry.text ?? entry.label ?? entry.field ?? JSON.stringify(entry), 300);
    return text(entry, 300);
  }).filter(Boolean).slice(0, 20);
  if (value && typeof value === "object") {
    return Object.entries(value).map(([key, entry]) => text(entry === true ? key : `${key}: ${entry}`, 300)).filter(Boolean).slice(0, 20);
  }
  const raw = text(value, 5000);
  if (!raw) return [];
  try { return normalizeMissingData(JSON.parse(raw)); }
  catch { return raw.split(/\r?\n|,\s*/).map((entry) => text(entry, 300)).filter(Boolean).slice(0, 20); }
}

export function isSafeClarificationDraft(draftReply) {
  const draft = text(draftReply);
  return Boolean(draft) && !UNSAFE_DRAFT_PATTERNS.some((pattern) => pattern.test(draft));
}

function allMissingDataIsSafe(entries) {
  return entries.length > 0 && entries.every((entry) => SAFE_MISSING_PATTERNS.some((pattern) => pattern.test(entry)));
}

function result(decision, safeToAutoSend, reason, confidence, missingData, draftReply) {
  return { decision, safe_to_auto_send: safeToAutoSend, decision_reason: reason, confidence, missing_data: missingData, draft_reply: draftReply };
}

export function evaluateEmailDecision(input = {}) {
  const subject = text(input.subject, 500);
  const body = text(input.body || input.email_body || input.message);
  const draftReply = text(input.draft_reply);
  const combined = `${subject}\n${body}`;
  const missingData = normalizeMissingData(input.missing_data);
  const confidence = confidenceNumber(input.confidence, 0);
  const autoReplyCount = Math.max(0, Math.trunc(Number(input.auto_reply_count) || 0));
  const proposedDecision = DECISION_VALUES.has(text(input.decision, 80)) ? text(input.decision, 80) : "";

  if (MANUAL_PATTERNS.some((pattern) => pattern.test(combined))) {
    return result(DECISIONS.MANUAL, false, "Zaznana je reklamacija, varnostni incident, nujna ali pravno občutljiva zadeva.", confidence, missingData, draftReply);
  }
  if (confidence < 0.9) {
    return result(DECISIONS.MANUAL, false, "AI confidence je nižji od 0,90, zato je potrebna ročna obdelava.", confidence, missingData, draftReply);
  }
  if (proposedDecision === DECISIONS.MANUAL) {
    return result(DECISIONS.MANUAL, false, text(input.decision_reason, 1000) || "AI je zahteval ročno obdelavo.", confidence, missingData, draftReply);
  }
  if (autoReplyCount >= 1) {
    return result(DECISIONS.REVIEW, false, "V tem e-mail threadu je bil samodejni clarification odgovor že poslan.", confidence, missingData, draftReply);
  }
  if (REVIEW_PATTERNS.some((pattern) => pattern.test(combined))) {
    return result(DECISIONS.REVIEW, false, "Vsebina zahteva odločitev o ceni, terminu, izvedbi ali tehnični rešitvi.", confidence, missingData, draftReply);
  }
  if (proposedDecision === DECISIONS.REVIEW) {
    return result(DECISIONS.REVIEW, false, text(input.decision_reason, 1000) || "AI je pripravil osnutek za človeško potrditev.", confidence, missingData, draftReply);
  }
  if (!allMissingDataIsSafe(missingData)) {
    return result(DECISIONS.REVIEW, false, "Manjkajoči podatki niso omejeni na varna, nevtralna pojasnila.", confidence, missingData, draftReply);
  }
  if (!isSafeClarificationDraft(draftReply)) {
    return result(DECISIONS.REVIEW, false, "Osnutek ni prestal varnostnega pregleda za samodejno pošiljanje.", confidence, missingData, draftReply);
  }
  if (proposedDecision === DECISIONS.AUTO && input.safe_to_auto_send !== true) {
    return result(DECISIONS.REVIEW, false, "AI ni izrecno potrdil safe_to_auto_send, zato je potrebna človeška potrditev.", confidence, missingData, draftReply);
  }
  if (proposedDecision && proposedDecision !== DECISIONS.AUTO) {
    return result(DECISIONS.REVIEW, false, "Če obstaja dvom, je potrebna človeška potrditev.", confidence, missingData, draftReply);
  }
  return result(DECISIONS.AUTO, true, text(input.decision_reason, 1000) || "AI sprašuje samo po manjkajočih nevtralnih podatkih; tveganih obljub ali odločitev ni.", confidence, missingData, draftReply);
}

export function decisionLabel(decision) {
  return { [DECISIONS.AUTO]: "Samodejno dopolnjevanje", [DECISIONS.REVIEW]: "Čaka potrditev", [DECISIONS.MANUAL]: "Ročna obdelava" }[decision] || "Čaka potrditev";
}
