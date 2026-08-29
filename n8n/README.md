# Nadgradnja BUMA Gmail AI Email Intake

Repo vsebuje tri varnostne artefakte:

- Intake-Safety-Gate.js: deterministični Safety Gate za obstoječi intake workflow.
- BUMA-FIT-Live-Inbox-Webhook.json: read-only webhook za varen prikaz FIT Inbound Emails.
- BUMA-Gmail-Approve-Webhook.json: webhook za človeško potrditev, z obveznim trusted lookupom in dry-run vejo.

Oba workflowa sta v JSON izvozu namenoma neaktivna (active: false). Gmail credentialov in skrivnosti ni v repozitoriju.

## 1. Structured AI output

V vozlišču Analyze Email + Decision Engine zahtevajte veljaven JSON brez markdowna:

~~~json
{
  "decision": "auto_clarification | review_required | manual_required",
  "safe_to_auto_send": false,
  "decision_reason": "",
  "confidence": 0.0,
  "missing_data": [],
  "draft_reply": ""
}
~~~

Sistemski prompt mora prepovedati samodejno obljubo cene, popusta, termina, roka, tehnične rešitve, števila varnostnikov in pogodbenih odločitev. Reklamacije, incidenti, nujne intervencije, alarm/VNC napake, pogodbe in confidence pod 0.90 morajo biti manual_required. Ob dvomu mora model izbrati review_required.

## 2. Thread state pred AI analizo

Iz Gmail Triggerja preslikajte najmanj message_id, thread_id, sender_email, subject in čisto besedilo. Pred analizo preberite trajno stanje po thread_id in dodajte auto_reply_count (privzeto 0). Priporočena n8n Data Table FIT Email Thread State:

| Polje | Namen |
| --- | --- |
| thread_id | unikatni ključ threada |
| auto_reply_count | število že poslanih auto clarification odgovorov |
| last_auto_reply_at | čas zadnjega auto odgovora |
| idempotency_key | ključ zadnje approve akcije |
| status | pending, sent ali send_error |
| sent_at | Gmail potrjen čas pošiljanja |
| message_id | Gmail ID poslanega odgovora |
| send_error | opis napake |

## 3. Safety Gate in Switch

Takoj za AI vozlišče dodajte Code node in vanj prilepite celotno vsebino Intake-Safety-Gate.js. Nato dodajte Switch na decision:

- auto_clarification: IF mora preveriti safe_to_auto_send === true, confidence >= 0.90, missing_data.length > 0 in auto_reply_count < 1. Šele nato Gmail Reply.
- review_required: zapis samo shranite oziroma posodobite v FIT Inbound Emails; ne pošiljajte Gmaila.
- manual_required: zapis shranite za ročno obdelavo; ne povežite ga z Gmail Send/Reply.

Po uspešnem Gmail Reply shranite status = sent, sent_at in Gmail message_id ter atomarno povečajte auto_reply_count za thread_id. Ob napaki shranite status = send_error; nikoli ne nastavite sent v error veji.

## 4. Read-only live inbox webhook

1. Uvozite BUMA-FIT-Live-Inbox-Webhook.json.
2. V node-u Read FIT Inbound Emails izberite dejansko n8n Data Table FIT Inbound Emails.
3. Na n8n strežniku nastavite N8N_SHARED_SECRET.
4. Aktivirajte workflow in njegov production webhook URL vnesite v Vercel kot N8N_LIVE_INBOX_URL.

Tok je: GET webhook → primerjava headerja x-buma-secret z n8n spremenljivko N8N_SHARED_SECRET → ob napačni vrednosti HTTP 403 → ob pravilni vrednosti read-only Data Table lookup → JSON response. Workflow nima Gmail node-a.

## 5. Approve webhook in varni test

1. Uvozite BUMA-Gmail-Approve-Webhook.json.
2. V node-u Lookup FIT Inbound Emails izberite dejansko tabelo FIT Inbound Emails.
3. Preverite, da je ključ naročila v tabeli poimenovan order_id. Če uporabljate id, ustrezno spremenite samo filter v lookup node-u.
4. Na n8n strežniku nastavite N8N_SHARED_SECRET na isto vrednost kot v Vercelu.
5. Aktivirajte workflow in njegov production webhook URL vnesite v Vercel kot N8N_ORDER_ACTION_URL.
6. V Vercel Preview nastavite N8N_TEST_MODE=true.

V testnem načinu backend webhook še vedno pokliče in pošlje test_mode: true. Celoten tok je:

FIT dashboard → /api/order-action → secret validation → FIT Inbound Emails lookup → stored decision validation → idempotency → dry-run response

Node Test mode? uporablja strogo boolean primerjavo. Njegova true veja gre samo v Record dry run in vrne status: dry_run ter email_sent: false; Gmail node je povezan izključno na false vejo. Zato ob test_mode === true Gmail ni dosegljiv.

Approve workflow dovoljuje pošiljanje samo za trusted zapis s shranjeno odločitvijo review_required, ki še ni poslan in ima vhodni Gmail message ID. Končni draft_reply ostane uporabnikova potrjena oziroma urejena vsebina. Odločitvi ali Gmail ID-ju iz browser payloada ne zaupa.

Osnovna deduplikacija uporablja workflow static data in ločena namespace-a test: in live:. Za več-worker oziroma queue-mode n8n jo pred produkcijo zamenjajte z atomarnim get/upsert v FIT Email Thread State.

Gmail credential izberite šele za kasnejši, posebej odobren produkcijski test. Med preview testom pustite N8N_TEST_MODE=true; Gmail node se ne izvede. Ne aktivirajte realnega Gmail pošiljanja in ne nastavljajte N8N_TEST_MODE=false, dokler preview tok ni potrjen.

## 6. Obvezna polja v FIT Inbound Emails

Poleg obstoječih polj shranjujte še order_id, decision, safe_to_auto_send, decision_reason, confidence, thread_id, gmail_message_id oziroma vhodni message_id, auto_reply_count, sent_at in send_error. Live inbox jih posreduje dashboardu.
