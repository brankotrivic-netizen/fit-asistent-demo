# Nadgradnja `BUMA Gmail AI Email Intake`

Obstoječega workflow exporta ali neposrednega n8n dostopa ni bilo v delovni mapi, zato sta pripravljena:

- `Intake-Safety-Gate.js`: koda za deterministični Safety Gate za obstoječi intake workflow.
- `BUMA-Gmail-Approve-Webhook.json`: uvozljiv in privzeto neaktiven workflow za človeško potrditev iz FIT dashboarda.

## 1. Structured AI output

V vozlišču `Analyze Email + Decision Engine` zahtevajte veljaven JSON brez markdowna:

```json
{
  "decision": "auto_clarification | review_required | manual_required",
  "safe_to_auto_send": false,
  "decision_reason": "",
  "confidence": 0.0,
  "missing_data": [],
  "draft_reply": ""
}
```

Sistemski prompt mora izrecno prepovedati samodejno obljubo cene, popusta, termina, roka, tehnične rešitve, števila varnostnikov in pogodbenih odločitev. Reklamacije, incidenti, nujne intervencije, alarm/VNC napake, pogodbe in confidence pod `0.90` morajo biti `manual_required`. Ob dvomu mora model izbrati `review_required`.

## 2. Thread state pred AI analizo

Iz Gmail Triggerja preslikajte najmanj `message_id`, `thread_id`, `sender_email`, `subject` in čisto besedilo. Pred analizo preberite trajno stanje po `thread_id` in dodajte `auto_reply_count` (privzeto `0`). Priporočena n8n Data Table `FIT Email Thread State`:

| Polje | Namen |
| --- | --- |
| `thread_id` | unikatni ključ threada |
| `auto_reply_count` | število že poslanih auto clarification odgovorov |
| `last_auto_reply_at` | čas zadnjega auto odgovora |
| `idempotency_key` | ključ zadnje approve akcije |
| `status` | `pending`, `sent` ali `send_error` |
| `sent_at` | Gmail potrjen čas pošiljanja |
| `message_id` | Gmail ID poslanega odgovora |
| `send_error` | opis napake |

## 3. Safety Gate in Switch

Takoj za AI vozlišče dodajte Code node in vanj prilepite celotno vsebino `Intake-Safety-Gate.js`. Nato dodajte Switch na `$json.decision`:

- `auto_clarification`: še en IF mora preveriti `safe_to_auto_send === true`, `confidence >= 0.90`, `missing_data.length > 0` in `auto_reply_count < 1`. Šele nato Gmail Reply.
- `review_required`: zapis samo shranite oziroma posodobite v `FIT Inbound Emails`; ne pošiljajte Gmaila.
- `manual_required`: zapis shranite za ročno obdelavo; ne povežite ga z Gmail Send/Reply.

Po uspešnem Gmail Reply naj naslednji node prebere Gmail rezultat in šele nato shrani:

```json
{
  "status": "sent",
  "sent_at": "={{ $now }}",
  "message_id": "={{ $json.id }}"
}
```

V istem koraku atomarno povečajte `auto_reply_count` za `thread_id`. Ob Gmail napaki shranite `status = send_error` in omejen `send_error`; nikoli ne nastavite `sent` v `continueOnFail` veji.

## 4. Approve webhook

Pred Gmail Reply dodajte obvezen lookup v `FIT Inbound Emails` po `order_id`. Iz tega zaupanja vrednega zapisa preberite `gmail_message_id` oziroma vhodni Gmail `message_id` in ponovno preverite, da shranjeni `decision` ni `manual_required`. Vrednosti `decision` iz browser payloada ne uporabljajte kot edine avtorizacije; končni `draft_reply` pa ostane uporabnikova potrjena vsebina.

1. Uvozite `BUMA-Gmail-Approve-Webhook.json`.
2. V vozlišču `Gmail reply after approval` izberite obstoječi Gmail OAuth credential. Credential ID ni v JSON datoteki.
3. Na n8n strežniku nastavite `N8N_SHARED_SECRET` na isto vrednost kot v Vercelu.
4. Med testiranjem v Vercelu nastavite `N8N_TEST_MODE=true`. Workflow bo izbral dry-run vejo in Gmail node se ne bo izvedel.
5. Produkcijsko pošiljanje omogočite šele po testu tako, da nastavite `N8N_TEST_MODE=false`.
6. Produkcijski URL webhooka vpišite v Vercel kot `N8N_ORDER_ACTION_URL`.

Uvožljivi workflow vsebuje osnovno deduplikacijo s workflow static data. Za več-worker oziroma queue-mode n8n jo pred aktivacijo zamenjajte z atomarnim `get/upsert` v `FIT Email Thread State` po `idempotency_key`; to je trajna zaščita pred ponovljenim webhookom ali različnimi serverless instancami.

## 5. Obvezna polja v `FIT Inbound Emails`

Poleg obstoječih polj shranjujte še `decision`, `safe_to_auto_send`, `decision_reason`, `confidence`, `thread_id`, `auto_reply_count`, `sent_at`, `message_id` in `send_error`. Live inbox jih že posreduje dashboardu.
