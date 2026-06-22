import Stripe from 'stripe';
import { DailyAgg, toUsd, localDate, slugify } from './types';

// Generic Stripe connector: groups net (after-fee) revenue by Stripe PRODUCT,
// auto-creating one income source per product. Works for any Stripe account,
// zero configuration. Set STRIPE_SINCE (YYYY-MM-DD) to bound history.
export async function syncStripe(): Promise<DailyAgg[]> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY');
  const stripe = new Stripe(key);
  const since = process.env.STRIPE_SINCE || '2024-01-01';

  // productId -> name
  const prodName = new Map<string, string>();
  for await (const p of stripe.products.list({ limit: 100 })) prodName.set(p.id, p.name);

  // customer -> product name (covers renewal charges with a generic description)
  const custProduct = new Map<string, string>();
  for await (const s of stripe.subscriptions.list({ status: 'all', limit: 100, expand: ['data.items.data.price'] })) {
    const price = s.items.data[0]?.price as Stripe.Price | undefined;
    const pid = typeof price?.product === 'string' ? price.product : (price?.product as Stripe.Product | undefined)?.id;
    const name = (pid && prodName.get(pid)) || price?.nickname || '';
    if (typeof s.customer === 'string' && name) custProduct.set(s.customer, name);
  }

  const gte = Math.floor(new Date(since).getTime() / 1000);
  const agg = new Map<string, DailyAgg>();

  for await (const ch of stripe.charges.list({
    created: { gte }, limit: 100, expand: ['data.balance_transaction', 'data.invoice'],
  })) {
    if (ch.status !== 'succeeded' || !ch.paid) continue;
    if (ch.refunded && (ch.amount_refunded || 0) >= (ch.amount || 0)) continue;

    const bt = ch.balance_transaction as Stripe.BalanceTransaction | null;
    const currency = bt?.currency || ch.currency || 'usd';
    const minor = bt ? bt.net : (ch.amount_captured ?? ch.amount) - (ch.amount_refunded ?? 0);
    if (!minor) continue;
    const amount = minor / 100;

    const productName = resolveProduct(ch, prodName, custProduct);
    const slug = 'stripe-' + slugify(productName);
    const date = localDate(ch.created);
    const usd = toUsd(amount, currency);

    const k = `${slug}|${date}`;
    const cur = agg.get(k) || {
      slug, date, usd: 0, raw: 0, currency: 'USD', count: 0,
      label: productName, emoji: '⚡', category: 'saas', connector: 'stripe',
    };
    cur.usd += usd; cur.raw += amount; cur.count += 1;
    agg.set(k, cur);
  }

  return [...agg.values()].map((a) => ({ ...a, usd: round(a.usd), raw: round(a.raw) }));
}

function resolveProduct(
  ch: Stripe.Charge,
  prodName: Map<string, string>,
  custProduct: Map<string, string>,
): string {
  // 1) invoice line -> price.product -> product name
  const inv = (ch as unknown as { invoice?: Stripe.Invoice | string | null }).invoice;
  if (inv && typeof inv === 'object' && inv.lines?.data?.length) {
    const line = inv.lines.data[0] as unknown as {
      description?: string; price?: { product?: string | { id?: string }; nickname?: string };
    };
    const pid = typeof line.price?.product === 'string' ? line.price?.product : line.price?.product?.id;
    if (pid && prodName.has(pid)) return prodName.get(pid)!;
    if (line.price?.nickname) return line.price.nickname;
    if (line.description && !/^subscription /i.test(line.description)) return line.description;
  }
  // 2) charge description (payment links set it to the product name)
  const desc = ch.description || '';
  if (desc && !/^subscription (update|creation|cycle)|^invoice/i.test(desc)) return desc;
  // 3) the customer's subscription product
  if (typeof ch.customer === 'string' && custProduct.has(ch.customer)) return custProduct.get(ch.customer)!;
  // 4) fallback bucket
  return 'Stripe (other)';
}

function round(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }
