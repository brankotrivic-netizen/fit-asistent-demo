// n8n Code node: postavite ga takoj za "Analyze Email + Decision Engine".
// Node ne pošilja e-pošte; samo uveljavi strožja pravila nad AI outputom.
const manualPatterns = [
  /reklamac|prito(?:z|ž)b|nezadovoljn/iu,
  /vlom|varnostn(?:i|ega)? incident|napad|gro(?:z|ž)nj/iu,
  /nujn(?:a|o|e)? intervenc|napak(?:a|e)?.{0,30}(?:alarm|vnc)|(?:alarm|vnc).{0,30}napak/iu,
  /pogodb|odpoved|odvet|to(?:z|ž)b|pravn/iu,
];
const reviewPatterns = [
  /cen|cena|cenik|popust|predra(?:c|č)un|ponudb/iu,
  /rok izvedbe|rok monta(?:z|ž)e|termin izvedbe|kdaj.{0,30}(?:izvedete|montirate)/iu,
  /tehni(?:c|č)n.{0,30}re(?:s|š)itev|koliko varnostnikov/iu,
];
const unsafeDraftPatterns = [
  /€|eur|evr|cena (?:je|bo)|popust (?:je|bo|odobren)/iu,
  /(?:potrjujemo|zagotavljamo|obljubljamo).{0,45}(?:termin|rok|izvedbo|ceno|popust)/iu,
  /(?:izvedli|montirali|pri(?:s|š)li) bomo.{0,35}(?:do|dne|ob|v roku)/iu,
  /(?:potrebujete|dolo(?:c|č)ili smo).{0,25}(?:varnostnikov|konkretno re(?:s|š)itev|sistem)/iu,
];
const safeMissingPatterns = [
  /naslov|lokacij/iu,
  /velikost|povr(?:s|š)in|kvadratur/iu,
  /kontaktna oseba|ime in priimek|kontakt/iu,
  /telefon|mobiln/iu,
  /tip objekta|vrsta objekta|namembnost/iu,
  /opis potrebe|opis objekta|kaj potrebujete/iu,
  /tip storitve|vrsta storitve|(?:z|ž)elena storitev/iu,
];

function asObject(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(String(value || '{}').replace(/^```json\s*|\s*```$/g, '')); }
  catch { return {}; }
}

return $input.all().map((item) => {
  const input = item.json;
  const ai = asObject(input.output || input.ai_output || input.analysis || input);
  const missing = Array.isArray(ai.missing_data) ? ai.missing_data.map(String).filter(Boolean) : [];
  const confidence = Math.max(0, Math.min(1, Number(ai.confidence) || 0));
  const autoReplyCount = Math.max(0, Math.trunc(Number(input.auto_reply_count ?? ai.auto_reply_count) || 0));
  const content = `${input.subject || ''}\n${input.body || input.text || ''}`;
  const draft = String(ai.draft_reply || '');
  let decision = ['auto_clarification', 'review_required', 'manual_required'].includes(ai.decision) ? ai.decision : 'review_required';
  let reason = String(ai.decision_reason || 'Če obstaja dvom, je potrebna človeška potrditev.');
  let safe = ai.safe_to_auto_send === true;

  if (manualPatterns.some((pattern) => pattern.test(content)) || confidence < 0.90) {
    decision = 'manual_required';
    safe = false;
    reason = confidence < 0.90 ? 'AI confidence je nižji od 0,90.' : 'Zaznana je reklamacija, incident, nujna ali pravno občutljiva zadeva.';
  } else if (decision === 'auto_clarification') {
    const allMissingSafe = missing.length > 0 && missing.every((entry) => safeMissingPatterns.some((pattern) => pattern.test(entry)));
    const draftSafe = draft && !unsafeDraftPatterns.some((pattern) => pattern.test(draft));
    const contentSafe = !reviewPatterns.some((pattern) => pattern.test(content));
    if (!safe || !allMissingSafe || !draftSafe || !contentSafe || autoReplyCount >= 1) {
      decision = 'review_required';
      safe = false;
      reason = autoReplyCount >= 1 ? 'V threadu je bil samodejni clarification že poslan.' : 'Samodejni odgovor ni prestal vseh determinističnih varnostnih preverjanj.';
    }
  } else {
    safe = false;
  }

  return { json: { ...input, ...ai, decision, safe_to_auto_send: decision === 'auto_clarification' && safe, decision_reason: reason, confidence, missing_data: missing, draft_reply: draft, thread_id: String(input.thread_id || ai.thread_id || ''), auto_reply_count: autoReplyCount, status: decision } };
});
