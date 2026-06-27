import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function slugify(s: string) {
  return (s || 'source').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'source';
}

// Only allow http(s) links (blocks javascript:/data: URLs that could run on click).
function safeUrl(u: unknown): string | null {
  if (typeof u !== 'string' || !u.trim()) return null;
  try {
    const url = new URL(u.trim());
    return (url.protocol === 'http:' || url.protocol === 'https:') ? url.toString() : null;
  } catch { return null; }
}

function money(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) < 1e12 ? n : null;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_STATUS = new Set(['active', 'pending', 'future']);
const ALLOWED_PERIOD = new Set(['month', 'year']);

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const supabase = db();
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  try {
    if (action === 'add_monthly') {
      if (!body.source_id || !MONTH_RE.test(String(body.month))) return NextResponse.json({ error: 'bad input' }, { status: 400 });
      const amt = money(body.amount_usd);
      if (amt === null) return NextResponse.json({ error: 'bad amount' }, { status: 400 });
      const date = String(body.month) + '-01';
      if (amt === 0) {
        await supabase.from('income_events').delete()
          .eq('source_id', body.source_id).eq('date', date).eq('external_id', 'manual_month');
        return NextResponse.json({ ok: true });
      }
      const { error } = await supabase.from('income_events').upsert({
        source_id: body.source_id, date, amount_usd: amt, raw_amount: amt,
        currency: 'USD', connector: 'manual', external_id: 'manual_month',
        description: `Total ${body.month}`, synced_at: new Date().toISOString(),
      }, { onConflict: 'source_id,date,external_id' });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'add_income') {
      const amt = money(body.amount_usd);
      if (!body.source_id || !DATE_RE.test(String(body.date)) || amt === null) return NextResponse.json({ error: 'bad input' }, { status: 400 });
      const { error } = await supabase.from('income_events').insert({
        source_id: body.source_id, date: body.date, amount_usd: amt, raw_amount: amt,
        currency: 'USD', connector: 'manual',
        description: typeof body.description === 'string' ? body.description.slice(0, 200) : null,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'add_source') {
      const name = String(body.name || '').trim().slice(0, 80);
      if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
      const { data: maxRow } = await supabase.from('income_sources')
        .select('number').order('number', { ascending: false }).limit(1).maybeSingle();
      const nextNum = (maxRow?.number || 0) + 1;
      const { data, error } = await supabase.from('income_sources').insert({
        number: nextNum, name,
        slug: slugify(name) + '-' + nextNum,
        category: String(body.category || 'other').slice(0, 24),
        connector: String(body.connector || 'manual').slice(0, 24),
        status: ALLOWED_STATUS.has(body.status) ? body.status : 'active',
        emoji: String(body.emoji || '💸').slice(0, 8),
        color: typeof body.color === 'string' ? body.color.slice(0, 16) : '#3ea6ff',
        link: safeUrl(body.link),
        notes: typeof body.notes === 'string' ? body.notes.slice(0, 500) : null,
      }).select().single();
      if (error) throw error;
      return NextResponse.json({ ok: true, source: data });
    }

    if (action === 'update_source') {
      if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      // Whitelist updatable fields (prevents mass-assignment of arbitrary columns).
      const upd: Record<string, unknown> = {};
      if (typeof body.name === 'string') upd.name = body.name.trim().slice(0, 80);
      if (typeof body.emoji === 'string') upd.emoji = body.emoji.slice(0, 8);
      if (ALLOWED_STATUS.has(body.status)) upd.status = body.status;
      if (typeof body.category === 'string') upd.category = body.category.slice(0, 24);
      if (typeof body.color === 'string') upd.color = body.color.slice(0, 16);
      if (typeof body.notes === 'string') upd.notes = body.notes.slice(0, 500);
      if ('link' in body) upd.link = safeUrl(body.link);
      if (!Object.keys(upd).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
      const { error } = await supabase.from('income_sources').update(upd).eq('id', body.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete_source') {
      if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      const { error } = await supabase.from('income_sources').delete().eq('id', body.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'add_goal') {
      const target = money(body.target_usd);
      const name = String(body.name || '').trim().slice(0, 80);
      if (!name || target === null || target <= 0) return NextResponse.json({ error: 'bad input' }, { status: 400 });
      const { error } = await supabase.from('income_goals').insert({
        name, target_usd: target,
        period: ALLOWED_PERIOD.has(body.period) ? body.period : 'month',
        scope: typeof body.scope === 'string' ? body.scope.slice(0, 60) : 'all',
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'update_goal') {
      if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      const upd: Record<string, unknown> = {};
      if (typeof body.name === 'string') upd.name = body.name.trim().slice(0, 80);
      if (body.target_usd !== undefined) { const t = money(body.target_usd); if (t === null || t <= 0) return NextResponse.json({ error: 'bad target' }, { status: 400 }); upd.target_usd = t; }
      if (ALLOWED_PERIOD.has(body.period)) upd.period = body.period;
      if (typeof body.scope === 'string') upd.scope = body.scope.slice(0, 60);
      if (!Object.keys(upd).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
      const { error } = await supabase.from('income_goals').update(upd).eq('id', body.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete_goal') {
      if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      const { error } = await supabase.from('income_goals').delete().eq('id', body.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message || e) }, { status: 500 });
  }
}
