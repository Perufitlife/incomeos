import { NextRequest, NextResponse } from 'next/server';
import { db, Source, Goal } from '@/lib/db';
import { checkAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Local date honoring TZ_OFFSET_HOURS (default UTC). e.g. -5 for Lima.
function limaDateStr(d = new Date()): string {
  const off = Number(process.env.TZ_OFFSET_HOURS || 0);
  const local = new Date(d.getTime() + off * 3600 * 1000 + d.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

// last N months as ['YYYY-MM', ...] ending at the given month
function lastMonths(endMonth: string, n: number): string[] {
  const [y, m] = endMonth.split('-').map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = db();
  const today = limaDateStr();
  const currentMonth = today.slice(0, 7);
  const currentYear = today.slice(0, 4);

  const [{ data: sources }, { data: events }, { data: goals }, { data: runs }] = await Promise.all([
    supabase.from('income_sources').select('*').order('number', { ascending: true }),
    supabase.from('income_events').select('source_id,date,amount_usd'),
    supabase.from('income_goals').select('*'),
    supabase.from('sync_runs').select('connector,ok,ran_at,total_usd,error').order('ran_at', { ascending: false }).limit(20),
  ]);

  const srcs = (sources || []) as Source[];
  const evs = (events || []) as { source_id: string; date: string; amount_usd: number }[];

  // per source: monthly{YYYY-MM:usd}, daily{YYYY-MM-DD:usd}, all
  const bySource: Record<string, { monthly: Record<string, number>; daily: Record<string, number>; all: number }> = {};
  for (const s of srcs) bySource[s.id] = { monthly: {}, daily: {}, all: 0 };

  const monthTotals: Record<string, number> = {};
  const dailyTotals: Record<string, number> = {};
  for (const e of evs) {
    const amt = Number(e.amount_usd) || 0;
    const b = bySource[e.source_id];
    if (!b) continue;
    const ym = e.date.slice(0, 7);
    b.monthly[ym] = (b.monthly[ym] || 0) + amt;
    b.daily[e.date] = (b.daily[e.date] || 0) + amt;
    b.all += amt;
    monthTotals[ym] = (monthTotals[ym] || 0) + amt;
    dailyTotals[e.date] = (dailyTotals[e.date] || 0) + amt;
  }

  const months = lastMonths(currentMonth, 12);

  let yearTotalAll = 0;
  const sourceOut = srcs.map((s) => {
    const b = bySource[s.id];
    // monthly map limited to last 24 months + this year sum
    const monthly: Record<string, number> = {};
    for (const [ym, v] of Object.entries(b.monthly)) monthly[ym] = round(v);
    const year = round(Object.entries(b.monthly).filter(([ym]) => ym.startsWith(currentYear)).reduce((a, [, v]) => a + v, 0));
    yearTotalAll += year;
    // 12-month sparkline
    const spark = months.map((ym) => round(b.monthly[ym] || 0));
    return {
      id: s.id, number: s.number, name: s.name, slug: s.slug, category: s.category,
      connector: s.connector, status: s.status, emoji: s.emoji, color: s.color, notes: s.notes,
      link: (s as Source & { link?: string }).link ?? null,
      monthly, daily: dailyOf(b.daily), year, all: round(b.all), spark,
    };
  });

  // monthly totals for the last 12 months (for the trend chart)
  const monthlySeries = months.map((ym) => ({ month: ym, usd: round(monthTotals[ym] || 0) }));
  // daily totals last 60 days (for Stripe-style granularity)
  const dailySeries: { date: string; usd: number }[] = [];
  for (let i = 59; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    dailySeries.push({ date: d, usd: round(dailyTotals[d] || 0) });
  }

  const yearTotal = round(yearTotalAll);
  const allTotal = round(sourceOut.reduce((a, s) => a + s.all, 0));

  return NextResponse.json({
    today,
    currentMonth,
    currentYear,
    months,
    sources: sourceOut,
    monthTotals: Object.fromEntries(months.map((m) => [m, round(monthTotals[m] || 0)])),
    monthlySeries,
    dailySeries,
    totals: { year: yearTotal, all: allTotal },
    goals: goals || [] as Goal[],
    syncs: runs || [],
  });
}

function dailyOf(daily: Record<string, number>) {
  // only keep last 60 days to bound payload
  const out: Record<string, number> = {};
  const cut = new Date(Date.now() - 65 * 86400000).toISOString().slice(0, 10);
  for (const [d, v] of Object.entries(daily)) if (d >= cut) out[d] = round(v);
  return out;
}

function round(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }
