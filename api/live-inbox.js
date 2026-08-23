import { isAuthenticated } from './_auth.js';

const text = (value, max = 4000) => String(value ?? '').slice(0, max);

function safeMissingData(value) {
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => text(entry, 300));
  try {
    const parsed = JSON.parse(text(value, 5000) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 20).map((entry) => text(entry, 300)) : [];
  } catch {
    return [];
  }
}

function sanitize(row) {
  return {
    id: Number(row.id) || text(row.id, 80),
    email_type: text(row.email_type, 80),
    customer_name: text(row.customer_name, 160),
    company_name: text(row.company_name, 160),
    subject: text(row.subject, 300),
    summary: text(row.summary, 2000),
    sku: text(row.sku, 160),
    description: text(row.description, 500),
    quantity: row.quantity ?? '',
    unit: text(row.unit, 80),
    requested_date: text(row.requested_date, 80),
    priority: text(row.priority, 80),
    missing_data: safeMissingData(row.missing_data),
    draft_reply: text(row.draft_reply, 8000),
    status: text(row.status || 'novo', 80),
    created_at: text(row.created_at, 100),
    draft_generated_at: text(row.draft_generated_at, 100),
    approved_at: text(row.approved_at, 100),
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Authentication required' });

  const sourceUrl = process.env.N8N_LIVE_INBOX_URL;
  if (!sourceUrl) return res.status(503).json({ error: 'Live inbox is not configured' });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const upstream = await fetch(sourceUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!upstream.ok) throw new Error(`Upstream returned ${upstream.status}`);
    const payload = await upstream.json();
    const rows = Array.isArray(payload.items) ? payload.items.slice(0, 20).map(sanitize) : [];
    return res.status(200).json({ success: true, count: rows.length, items: rows });
  } catch {
    return res.status(502).json({ error: 'Live inbox is temporarily unavailable' });
  } finally {
    clearTimeout(timeout);
  }
}
