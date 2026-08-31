import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = new URL("./", import.meta.url);
const safetyGate = readFileSync(new URL("Intake-Safety-Gate.js", here), "utf8");
let idIndex = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++idIndex).padStart(12, "0")}`;
const code = (name, jsCode, position) => ({ parameters: { jsCode }, id: nextId(), name, type: "n8n-nodes-base.code", typeVersion: 2, position });
const ifNode = (name, leftValue, position) => ({
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
      conditions: [{ id: nextId(), leftValue, rightValue: true, operator: { type: "boolean", operation: "true", singleValue: true } }],
      combinator: "and",
    },
    options: {},
  },
  id: nextId(), name, type: "n8n-nodes-base.if", typeVersion: 2.2, position,
});
const table = (name, operation, position, extra = {}) => ({
  parameters: {
    resource: "row",
    operation,
    dataTableId: { __rl: true, value: "FIT Inbound Emails", mode: "name" },
    ...extra,
  },
  id: nextId(), name, type: "n8n-nodes-base.dataTable", typeVersion: 1.1, position,
});

const normalizeCode = String.raw`const mail = $input.first().json || {};
const headerValue = (name) => {
  const headers = mail.payload?.headers || mail.headers || [];
  if (Array.isArray(headers)) return String(headers.find((h) => String(h.name || '').toLowerCase() === name)?.value || '');
  return String(headers[name] || headers[name.toLowerCase()] || '');
};
const fromRaw = mail.from?.value?.[0] || mail.from || headerValue('from');
const fromText = typeof fromRaw === 'object' ? String(fromRaw.address || fromRaw.text || '') : String(fromRaw || '');
const senderEmail = String(fromRaw?.address || fromText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '').trim();
const senderName = String(fromRaw?.name || fromText.replace(/<[^>]+>/g, '').trim());
const body = String(mail.textPlain || mail.text || mail.snippet || mail.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 12000);
const gmailMessageId = String(mail.id || mail.messageId || mail.message_id || '').trim();
const threadId = String(mail.threadId || mail.thread_id || '').trim();
return [{ json: {
  order_id: gmailMessageId,
  gmail_message_id: gmailMessageId,
  thread_id: threadId,
  sender_email: senderEmail,
  customer_name: senderName,
  subject: String(mail.subject || headerValue('subject') || 'Brez zadeve').slice(0, 300),
  body,
  created_at: new Date(Number(mail.internalDate || Date.now())).toISOString(),
  email_type: 'inbound_email'
} }];`;

const threadContextCode = String.raw`const email = $('Normalize Gmail email').first().json;
const rows = $input.all().map((item) => item.json || {}).filter((row) => Object.keys(row).length > 0);
const sameMessage = rows.some((row) => String(row.gmail_message_id || row.order_id || '') === email.gmail_message_id);
const autoReplyCount = rows.reduce((max, row) => Math.max(max, Math.trunc(Number(row.auto_reply_count) || 0)), 0);
return [{ json: { ...email, duplicate: sameMessage, auto_reply_count: autoReplyCount } }];`;

const mergeAiCode = String.raw`const context = $('Build thread context').first().json;
const raw = String($input.first().json.output || $input.first().json.text || '{}').replace(/^\s*\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60\s*$/gi, '');
let ai = {};
try { ai = JSON.parse(raw); } catch { ai = { decision: 'manual_required', decision_reason: 'AI ni vrnil veljavnega strukturiranega JSON-a.', confidence: 0, category: 'manual_review', category_confidence: 0 }; }
return [{ json: { ...context, ...ai, auto_reply_count: context.auto_reply_count } }];`;

const prepareRowCode = String.raw`const item = $input.first().json;
const text = (value, max = 12000) => String(value ?? '').trim().slice(0, max);
return [{ json: {
  order_id: text(item.order_id, 120), email_type: 'inbound_email', sender_email: text(item.sender_email, 320),
  customer_name: text(item.customer_name, 180), company_name: text(item.company_name, 180), subject: text(item.subject, 300),
  body: text(item.body), summary: text(item.summary, 2500), sku: text(item.sku, 160), description: text(item.description, 800),
  quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : null, unit: text(item.unit, 80), requested_date: text(item.requested_date, 100),
  priority: text(item.priority, 80) || 'običajna', status: text(item.status, 80), created_at: item.created_at || new Date().toISOString(),
  missing_data: JSON.stringify(Array.isArray(item.missing_data) ? item.missing_data : []), draft_reply: text(item.draft_reply),
  category: text(item.category, 80), category_confidence: Number(item.category_confidence) || 0, category_review_required: item.category_review_required === true,
  decision: text(item.decision, 80), safe_to_auto_send: item.safe_to_auto_send === true, decision_reason: text(item.decision_reason, 2000), confidence: Number(item.confidence) || 0,
  thread_id: text(item.thread_id, 240), gmail_message_id: text(item.gmail_message_id, 240), auto_reply_count: Math.max(0, Math.trunc(Number(item.auto_reply_count) || 0)),
  approved_at: null, sent_at: null, message_id: '', send_error: ''
} }];`;

const dryRunCode = String.raw`const item = $input.first().json;
return [{ json: { ...item, status: 'dry_run_auto_clarification', sent_at: null, message_id: '', send_error: '', auto_reply_count: Math.max(0, Math.trunc(Number(item.auto_reply_count) || 0)) } }];`;
const sentCode = String.raw`const row = $('Insert FIT inbound email').first().json;
const gmail = $input.first().json || {};
return [{ json: { ...row, status: 'sent', sent_at: new Date().toISOString(), message_id: String(gmail.id || gmail.messageId || gmail.message_id || ''), send_error: '', auto_reply_count: Math.max(0, Math.trunc(Number(row.auto_reply_count) || 0)) + 1 } }];`;

const aiPrompt = `=Analiziraj vhodni FIT e-mail in vrni IZKLJUČNO veljaven JSON.\n\nFrom: {{ $json.sender_email }}\nSubject: {{ $json.subject }}\nBody: {{ $json.body }}\nDosedanji auto_reply_count v threadu: {{ $json.auto_reply_count }}\n\nObvezna polja: category (order|installation|service), category_confidence (0..1), decision (auto_clarification|review_required|manual_required), safe_to_auto_send (boolean), decision_reason, confidence (0..1), summary, missing_data (array stringov), draft_reply, customer_name, company_name, sku, description, quantity, unit, requested_date, priority.\n\nČe nisi vsaj 85 % prepričan v kategorijo, še vedno izberi najbližjo dovoljeno category, vendar nastavi category_confidence pod 0.85; Safety Gate bo zapis poslal v Ročni pregled.`;
const systemMessage = `Si varnostno konservativen FIT e-mail asistent.\n- order = naročilo/povpraševanje za izdelek ali storitev; installation = montaža, vgradnja ali ogled za montažo; service = servis, vzdrževanje ali tehnična težava.\n- Če manjkajo samo osnovni nevtralni podatki (lokacija, velikost, kontakt, tip objekta, opis potrebe), pripravi auto_clarification in vprašaj IZKLJUČNO po teh podatkih. Brez cen, terminov, obljub ali tehničnih odločitev.\n- Če so podatki zbrani ali so potrebne cena, rok, ponudba ali tehnična odločitev, vrni review_required in celoten profesionalen osnutek za človeka.\n- Reklamacije, nujni primeri, vlomi, alarm/VNC napake, pogodbe, pravne ali občutljive varnostne zadeve so manual_required.\n- Če je auto_reply_count >= 1, auto_clarification ni dovoljen.\n- Nikoli ne izmišljaj podatkov. Vrni samo JSON brez markdowna.`;

const nodes = [
  { parameters: { pollTimes: { item: [{ mode: "everyMinute" }] }, simple: false, filters: { readStatus: "unread" }, options: {} }, id: nextId(), name: "Gmail inbound trigger", type: "n8n-nodes-base.gmailTrigger", typeVersion: 1.3, position: [-1280, 0] },
  code("Normalize Gmail email", normalizeCode, [-1060, 0]),
  table("Lookup Gmail thread", "get", [-840, 0], { filters: { conditions: [{ keyName: "thread_id", keyValue: "={{ $json.thread_id }}" }] }, returnAll: true }),
  code("Build thread context", threadContextCode, [-620, 0]),
  ifNode("New Gmail message?", "={{ $json.duplicate === false }}", [-400, 0]),
  { parameters: { promptType: "define", text: aiPrompt, options: { systemMessage } }, id: nextId(), name: "Analyze email and category", type: "@n8n/n8n-nodes-langchain.agent", typeVersion: 2.2, position: [-180, -80] },
  { parameters: { model: { __rl: true, value: "gpt-4.1-mini", mode: "list", cachedResultName: "gpt-4.1-mini" }, options: { temperature: 0.1 } }, id: nextId(), name: "OpenAI safety model", type: "@n8n/n8n-nodes-langchain.lmChatOpenAi", typeVersion: 1.2, position: [-180, 180] },
  code("Merge AI structured output", mergeAiCode, [40, -80]),
  code("Deterministic Safety Gate", safetyGate, [260, -80]),
  code("Prepare FIT Inbound Emails row", prepareRowCode, [480, -80]),
  table("Insert FIT inbound email", "insert", [700, -80], { columns: { mappingMode: "autoMapInputData", value: null }, options: {} }),
  ifNode("Auto clarification allowed?", "={{ $json.decision === 'auto_clarification' && $json.safe_to_auto_send === true && Number($json.auto_reply_count || 0) < 1 }}", [920, -80]),
  ifNode("N8N test mode?", "={{ !(String($env.N8N_TEST_MODE || 'true').toLowerCase() === 'false' && String($env.N8N_GMAIL_SEND_ENABLED || 'false').toLowerCase() === 'true') }}", [1140, -160]),
  code("Record intake dry run", dryRunCode, [1360, -240]),
  table("Update dry-run audit", "update", [1580, -240], { filters: { conditions: [{ keyName: "order_id", keyValue: "={{ $json.order_id }}" }] }, columns: { mappingMode: "autoMapInputData", value: null }, options: {} }),
  { parameters: { resource: "message", operation: "reply", messageId: "={{ $json.gmail_message_id }}", emailType: "text", message: "={{ $json.draft_reply }}", options: {} }, id: nextId(), name: "Gmail auto clarification reply", type: "n8n-nodes-base.gmail", typeVersion: 2.1, position: [1360, -60], onError: "stopWorkflow" },
  code("Mark auto clarification sent", sentCode, [1580, -60]),
  table("Update sent auto clarification", "update", [1800, -60], { filters: { conditions: [{ keyName: "order_id", keyValue: "={{ $json.order_id }}" }] }, columns: { mappingMode: "autoMapInputData", value: null }, options: {} }),
];

const main = (node) => ({ node, type: "main", index: 0 });
const connections = {
  "Gmail inbound trigger": { main: [[main("Normalize Gmail email")]] },
  "Normalize Gmail email": { main: [[main("Lookup Gmail thread")]] },
  "Lookup Gmail thread": { main: [[main("Build thread context")]] },
  "Build thread context": { main: [[main("New Gmail message?")]] },
  "New Gmail message?": { main: [[main("Analyze email and category")], []] },
  "OpenAI safety model": { ai_languageModel: [[{ node: "Analyze email and category", type: "ai_languageModel", index: 0 }]] },
  "Analyze email and category": { main: [[main("Merge AI structured output")]] },
  "Merge AI structured output": { main: [[main("Deterministic Safety Gate")]] },
  "Deterministic Safety Gate": { main: [[main("Prepare FIT Inbound Emails row")]] },
  "Prepare FIT Inbound Emails row": { main: [[main("Insert FIT inbound email")]] },
  "Insert FIT inbound email": { main: [[main("Auto clarification allowed?")]] },
  "Auto clarification allowed?": { main: [[main("N8N test mode?")], []] },
  "N8N test mode?": { main: [[main("Record intake dry run")], [main("Gmail auto clarification reply")]] },
  "Record intake dry run": { main: [[main("Update dry-run audit")]] },
  "Gmail auto clarification reply": { main: [[main("Mark auto clarification sent")]] },
  "Mark auto clarification sent": { main: [[main("Update sent auto clarification")]] },
};

const workflow = {
  name: "BUMA Gmail AI Email Intake",
  nodes,
  connections,
  pinData: {},
  active: false,
  settings: { executionOrder: "v1", saveManualExecutions: true, saveExecutionProgress: true },
  versionId: nextId(),
  meta: { templateCredsSetupCompleted: false },
  tags: [],
};

writeFileSync(fileURLToPath(new URL("BUMA-Gmail-AI-Email-Intake.json", here)), JSON.stringify(workflow, null, 2) + "\n", "utf8");
