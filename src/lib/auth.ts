import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';

// Constant-time string compare (avoids leaking the secret via response timing).
function safeEq(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Single-user gate: the dashboard sends the shared token as a Bearer header
// (stored in localStorage after the user types the passphrase once).
// Tokens shorter than 16 chars are refused so a weak password can't gate the app.
export function checkAuth(req: NextRequest): boolean {
  const token = process.env.DASHBOARD_TOKEN;
  if (!token || token.length < 16) return false;
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.replace(/^Bearer\s+/i, '').trim();
  const headerTok = req.headers.get('x-dash-token') || '';
  return safeEq(bearer, token) || safeEq(headerTok, token);
}

// Cron / sync routes use a separate secret so they can be triggered by Vercel Cron.
export function checkCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.replace(/^Bearer\s+/i, '').trim();
  return safeEq(bearer, secret) || safeEq(req.headers.get('x-cron-secret') || '', secret);
}
