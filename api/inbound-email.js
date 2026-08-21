// Public test endpoint used by n8n to deliver structured inbound email data.
export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

  return res.status(200).json({
    success: true,
    message: 'FIT AI Assistant received the payload.',
    received: body,
  });
}
