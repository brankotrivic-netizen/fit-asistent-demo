import crypto from 'node:crypto';

const COOKIE_NAME = 'fit_demo_session';
const SESSION_SECONDS = 7 * 24 * 60 * 60;

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sessionSecret() {
  return process.env.FIT_SESSION_SECRET || '';
}

function signature(expiresAt) {
  return crypto
    .createHmac('sha256', sessionSecret())
    .update(String(expiresAt))
    .digest('base64url');
}

function cookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=');
        if (separator < 0) return [part, ''];
        return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      }),
  );
}

export function isAuthenticated(req) {
  if (!sessionSecret()) return false;
  const token = cookies(req)[COOKIE_NAME] || '';
  const [expiresRaw, suppliedSignature] = token.split('.');
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  return safeEqual(suppliedSignature, signature(expiresAt));
}

export function validAccessCode(value) {
  const configured = process.env.FIT_DEMO_CODE || '';
  return Boolean(configured) && safeEqual(String(value || '').trim().toUpperCase(), configured.trim().toUpperCase());
}

export function sessionCookie() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const value = `${expiresAt}.${signature(expiresAt)}`;
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
