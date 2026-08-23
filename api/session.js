import {
  clearSessionCookie,
  isAuthenticated,
  sessionCookie,
  validAccessCode,
} from './_auth.js';

function body(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(isAuthenticated(req) ? 200 : 401).json({
      authenticated: isAuthenticated(req),
    });
  }

  if (req.method === 'POST') {
    if (!validAccessCode(body(req).code)) {
      return res.status(401).json({ authenticated: false, error: 'Napačna dostopna koda.' });
    }
    res.setHeader('Set-Cookie', sessionCookie());
    return res.status(200).json({ authenticated: true });
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', clearSessionCookie());
    return res.status(200).json({ authenticated: false });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
