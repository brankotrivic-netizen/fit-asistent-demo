# FIT AI prodajni asistent

Dashboard bere dejanske zapise iz `FIT Inbound Emails` prek `GET /api/live-inbox`. Backend nad strukturiranim AI outputom uveljavi tri nivoje odločanja: `auto_clarification`, `review_required` in `manual_required`.

## Vercel environment variables

```text
N8N_LIVE_INBOX_URL=https://.../webhook/fit-live-inbox
N8N_ORDER_ACTION_URL=https://.../webhook/fit-order-action
N8N_SHARED_SECRET=dolg-naključen-skrivni-niz
N8N_TEST_MODE=true
```

`N8N_TEST_MODE=true` mora ostati vključeno med razvojem: backend takrat vrne dry-run rezultat, ne pokliče n8n webhooka in ne izvede Gmail pošiljanja. Produkcijsko pošiljanje omogočite šele po ločenem testu z `N8N_TEST_MODE=false`.

Nobena od teh vrednosti ne sme biti dodana v frontend ali Git. `N8N_SHARED_SECRET` API pošlje samo server-to-server v headerju `x-buma-secret`.

## Live inbox pogodba

n8n inbox endpoint lahko vrne `items`, `data`, `rows`, `records` ali neposreden JSON array. Poleg obstoječih podatkov so podprti:

```text
decision, safe_to_auto_send, decision_reason, confidence,
thread_id, auto_reply_count, sent_at, message_id, send_error
```

Starejši zapisi brez strukturirane odločitve se zaradi varnosti prikažejo kot `review_required`, ne kot samodejni odgovor.

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

## Preverjanje

```bash
npm test
vercel dev
```

Testi uporabljajo samo lokalne funkcije in mockan `fetch`; ne kličejo Gmaila ali dejanskega n8n webhooka.
