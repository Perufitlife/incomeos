// Normalized daily aggregate produced by a connector.
// The sync route resolves slug -> source_id (auto-creating the source when a
// connector reports a slug that doesn't exist yet), then upserts one row per
// (source, date).
export type DailyAgg = {
  slug: string;          // stable source slug to attribute to (e.g. 'stripe-my-product')
  date: string;          // YYYY-MM-DD (local tz)
  usd: number;           // amount in USD (already converted)
  raw: number;           // amount in original currency
  currency: string;
  count: number;         // number of underlying transactions
  // Optional hints so the sync route can auto-create the source the first time:
  label?: string;        // human name for the source (e.g. the Stripe product name)
  emoji?: string;
  category?: string;
  connector?: string;
};

// Static FX -> USD. Most revenue is already USD; this just guards stray currencies.
const FX: Record<string, number> = {
  usd: 1, pen: 0.27, eur: 1.08, gbp: 1.27, mxn: 0.055, brl: 0.18, cad: 0.73, ars: 0.0011,
  inr: 0.012, aud: 0.66, jpy: 0.0064, chf: 1.12,
};
export function toUsd(amount: number, currency: string): number {
  const rate = FX[(currency || 'usd').toLowerCase()] ?? 1;
  return amount * rate;
}

// Local date string from a unix-seconds timestamp, honoring TZ_OFFSET_HOURS
// (defaults to UTC). Set TZ_OFFSET_HOURS in env, e.g. -5 for Lima.
export function localDate(unixSeconds: number): string {
  const off = Number(process.env.TZ_OFFSET_HOURS || 0);
  const d = new Date(unixSeconds * 1000 + off * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

export function slugify(s: string): string {
  return (s || 'untitled').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'untitled';
}
