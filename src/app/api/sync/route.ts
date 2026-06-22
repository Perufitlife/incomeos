import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth, checkCron } from '@/lib/auth';
import { syncStripe } from '@/lib/connectors/stripe';
import { DailyAgg } from '@/lib/connectors/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Each automated connector returns daily aggregates keyed by source slug.
// Connectors may report a slug that doesn't exist yet (e.g. a new Stripe
// product) — the sync auto-creates the source from the agg's hints.
const CONNECTORS: { name: string; run: () => Promise<DailyAgg[]> }[] = [
  { name: 'stripe', run: () => syncStripe() },
];

async function runSync() {
  const supabase = db();
  const { data: sources } = await supabase.from('income_sources').select('id,slug,number');
  const idBySlug = new Map((sources || []).map((s) => [s.slug, s.id as string]));
  let maxNum = Math.max(0, ...(sources || []).map((s) => s.number || 0));

  const results: { connector: string; ok: boolean; rows: number; total: number; error?: string }[] = [];

  for (const c of CONNECTORS) {
    let ok = true, rows = 0, total = 0, error: string | undefined;
    try {
      const aggs = await c.run();

      // Auto-create any source slugs we haven't seen before.
      for (const a of aggs) {
        if (idBySlug.has(a.slug)) continue;
        maxNum += 1;
        const { data: created, error: cErr } = await supabase.from('income_sources').insert({
          number: maxNum,
          name: a.label || a.slug,
          slug: a.slug,
          category: a.category || 'other',
          connector: a.connector || c.name,
          status: 'active',
          emoji: a.emoji || '⚡',
        }).select('id').single();
        if (cErr) throw cErr;
        idBySlug.set(a.slug, created!.id);
      }

      const payload = aggs.map((a) => ({
        source_id: idBySlug.get(a.slug)!,
        date: a.date,
        amount_usd: a.usd,
        raw_amount: a.raw,
        currency: a.currency,
        connector: c.name,
        external_id: c.name,
        description: `${a.count} transaction(s)`,
        meta: { count: a.count },
        synced_at: new Date().toISOString(),
      }));
      if (payload.length) {
        const { error: upErr } = await supabase
          .from('income_events')
          .upsert(payload, { onConflict: 'source_id,date,external_id' });
        if (upErr) throw upErr;
      }
      rows = payload.length;
      total = payload.reduce((s, p) => s + Number(p.amount_usd), 0);
    } catch (e) {
      ok = false; error = String((e as Error).message || e);
    }
    await supabase.from('sync_runs').insert({ connector: c.name, ok, rows, total_usd: total, error: error || null });
    results.push({ connector: c.name, ok, rows, total, error });
  }
  return results;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req) && !checkCron(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const results = await runSync();
  return NextResponse.json({ ok: true, results });
}

// Vercel Cron hits GET with the CRON_SECRET bearer.
export async function GET(req: NextRequest) {
  if (!checkCron(req) && !checkAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const results = await runSync();
  return NextResponse.json({ ok: true, results });
}
