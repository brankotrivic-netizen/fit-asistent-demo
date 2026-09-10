// Read-only adaptation of the safe branch proxy. Decisions remain owned by n8n.
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const url = process.env.N8N_LIVE_INBOX_URL;
  const secret = (process.env.N8N_SHARED_SECRET || '').trim();
  if (!url) return res.status(503).json({ code: 'LIVE_INBOX_NOT_CONFIGURED' });
  if (!secret) return res.status(503).json({ code: 'N8N_SHARED_SECRET_NOT_CONFIGURED' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const upstream = await fetch(url, {
      method: 'GET', headers: { Accept: 'application/json', 'x-buma-secret': secret },
      signal: controller.signal, cache: 'no-store', redirect: 'error',
    });
    if (!upstream.ok) throw new Error('Upstream failed');
    const payload = await upstream.json();
    const rows = Array.isArray(payload) ? payload :
      ['items', 'data', 'rows', 'records'].map(key => payload?.[key]).find(Array.isArray);
    if (!rows || payload?.success === false) throw new Error('Invalid upstream response');
    const fields = 'id order_id email_type sender_email customer_name company_name subject summary sku description quantity unit requested_date priority status created_at missing_data draft_reply category category_confidence category_review_required decision safe_to_auto_send decision_reason confidence thread_id gmail_message_id auto_reply_count approved_at sent_at message_id send_error'.split(' ');
    const items = rows.slice(0, 100).map(row => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid row');
      return Object.fromEntries(fields.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]));
    });
    return res.status(200).json({ success: true, source: 'FIT Inbound Emails', count: items.length, items });
  } catch (error) {
    return res.status(502).json({ error: 'Live inbox is temporarily unavailable', code: error?.name === 'AbortError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE' });
  } finally { clearTimeout(timer); }
};
