import { NextRequest } from 'next/server';

// Single-user gate: the dashboard sends the shared token as a Bearer header
// (stored in localStorage after the user types the passphrase once).
export function checkAuth(req: NextRequest): boolean {
  const token = process.env.DASHBOARD_TOKEN;
  if (!token) return false;
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.replace(/^Bearer\s+/i, '').trim();
  const headerTok = req.headers.get('x-dash-token') || '';
  return bearer === token || headerTok === token;
}

// Cron / sync routes use a separate secret so they can be triggered by Vercel Cron.
export function checkCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') || '';
  return auth === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret;
}
