const { test } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/live-inbox.js');
test('read-only live inbox contract and fail-closed errors', async () => {
  const original = global.fetch;
  const saved = { ...process.env };
  const call = async (method = 'GET') => {
    const res = { headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(n) { this.code=n; return this; }, json(body) { this.body=body; return this; } };
    await handler({ method }, res); return res;
  };
  try {
    process.env.N8N_LIVE_INBOX_URL = 'https://example.invalid/inbox';
    process.env.N8N_SHARED_SECRET = 'test-only-secret';
    let calls = 0;
    global.fetch = async (url, options) => {
      calls++;
      assert.equal(options.method, 'GET');
      assert.equal(options.headers['x-buma-secret'], 'test-only-secret');
      assert.equal(options.redirect, 'error');
      return new Response(JSON.stringify({ items: [{ id: 1, subject: 'Test', status: 'review_required', decision: 'review_required', private_secret: 'not returned' }] }));
    };
    assert.equal((await call('POST')).code, 405);
    assert.equal(calls, 0);
    const ok = await call();
    assert.equal(ok.code, 200);
    assert.deepEqual(ok.body.items, [{ id: 1, subject: 'Test', status: 'review_required', decision: 'review_required' }]);
    assert.match(ok.headers['Cache-Control'], /no-store/);
    delete process.env.N8N_SHARED_SECRET;
    assert.equal((await call()).code, 503);
    assert.equal(calls, 1);
    process.env.N8N_SHARED_SECRET = 'test-only-secret';
    for (const response of [new Response(''), new Response('{}'), new Response('denied', {status:403})]) {
      global.fetch = async () => response;
      assert.equal((await call()).code, 502);
    }
    global.fetch = async () => { const e = new Error('timeout'); e.name = 'AbortError'; throw e; };
    assert.equal((await call()).body.code, 'UPSTREAM_TIMEOUT');
  } finally { global.fetch = original; process.env = saved; }
});
