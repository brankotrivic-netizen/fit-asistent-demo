# FIT AI prodajni asistent

Dashboard bere dejanske zapise iz `FIT Inbound Emails` prek `GET /api/live-inbox`. Backend nad strukturiranim AI outputom uveljavi tri nivoje odločanja: `auto_clarification`, `review_required` in `manual_required`.

Vsak nov zapis ima tudi `category`: `order`, `installation` ali `service`. Kategorija z zanesljivostjo pod `0.85` se prisilno spremeni v `manual_review`, odločitev pa v `manual_required`, zato se v aplikaciji prikaže v zavihku **Ročni pregled**.

## Vercel environment variables

```text
N8N_LIVE_INBOX_URL=https://.../webhook/fit-live-inbox
N8N_ORDER_ACTION_URL=https://.../webhook/fit-order-action
N8N_SHARED_SECRET=dolg-naključen-skrivni-niz
N8N_TEST_MODE=true
```

`N8N_TEST_MODE=true` mora ostati vključeno med razvojem. Backend tudi v tem načinu pokliče `N8N_ORDER_ACTION_URL`, pošlje `test_mode: true` ter počaka, da n8n izvede secret validation, lookup in validacijo shranjene odločitve. n8n mora nato obvezno vrniti dry-run rezultat, ne da bi dosegel Gmail node. Produkcijsko pošiljanje omogočite šele po ločenem testu z `N8N_TEST_MODE=false`.

Nobena od teh vrednosti ne sme biti dodana v frontend ali Git. `N8N_SHARED_SECRET` oba API-ja pošljeta samo server-to-server v headerju `x-buma-secret`: approve webhooku in read-only live-inbox webhooku.

## Live inbox pogodba

n8n inbox endpoint lahko vrne `items`, `data`, `rows`, `records` ali neposreden JSON array. Poleg obstoječih podatkov so podprti:

```text
decision, safe_to_auto_send, decision_reason, confidence,
category, category_confidence, category_review_required,
thread_id, auto_reply_count, sent_at, message_id, send_error
```

Starejši zapisi brez strukturirane odločitve ali zanesljive kategorije se zaradi varnosti prikažejo v **Ročnem pregledu**, ne kot samodejni odgovor.

Read-only n8n webhook mora pred branjem `FIT Inbound Emails` primerjati header `x-buma-secret` z n8n environment variable `N8N_SHARED_SECRET` in ob napačni vrednosti vrniti `401` ali `403`. Uvozljiv primer je `n8n/BUMA-FIT-Live-Inbox-Webhook.json`.

## Človeška potrditev

`POST /api/order-action` za `review_required` sprejme:

```json
{
  "order_id": "42",
  "thread_id": "gmail-thread-id",
  "action": "approve",
  "sender_email": "nabava@example.si",
  "subject": "Naročilo kamer",
  "draft_reply": "Končni, po potrebi urejeni odgovor",
  "decision": "review_required",
  "status": "review_required"
}
```

Backend zavrne `approve` za `manual_required`. Za dvojno pošiljanje uporablja UI zaklep, cache sočasnih zahtev in deterministični `x-idempotency-key`; n8n mora isti ključ trajno deduplicirati. API vrne `status: sent` samo po izrecni Gmail/n8n potrditvi. Ob napaki vrne `status: send_error` in `email_sent: false`.

## n8n

Navodila za spremembo obstoječega `BUMA Gmail AI Email Intake`, Safety Gate in uvozljiv approve workflow so v [n8n/README.md](./n8n/README.md). JSON ne vsebuje Gmail credentialov ali skrivnosti in je privzeto neaktiven.

Lokalni n8n mora med varnim testom imeti:

```text
N8N_TEST_MODE=true
N8N_GMAIL_SEND_ENABLED=false
N8N_SHARED_SECRET=...
```

Intake Gmail node je fail-closed: dosegljiv je samo, če sta hkrati izrecno nastavljena `N8N_TEST_MODE=false` in `N8N_GMAIL_SEND_ENABLED=true`. Javni naslov novega namenskega tunela je `https://n8n.getbuma.com`; stari tunnel `bm-cistilniservis` ni del te rešitve.

## Preverjanje

```bash
npm test
vercel dev
```

Testi uporabljajo samo lokalne funkcije in mockan `fetch`; ne kličejo Gmaila ali dejanskega n8n webhooka.
