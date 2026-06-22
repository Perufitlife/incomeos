import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const supabase = db();
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  try {
    if (action === 'add_monthly') {
      // { source_id, month: 'YYYY-MM', amount_usd } -> one upsertable row per source per month
      const month = String(body.month);
      const date = month + '-01';
      const amt = Number(body.amount_usd);
      if (amt === 0) {
        // 0 means clear that month
        await supabase.from('income_events').delete()
          .eq('source_id', body.source_id).eq('date', date).eq('external_id', 'manual_month');
        return NextResponse.json({ ok: true });
      }
      const { error } = await supabase.from('income_events').upsert({
        source_id: body.source_id,
        date,
        amount_usd: amt,
        raw_amount: amt,
        currency: 'USD',
        connector: 'manual',
        external_id: 'manual_month',
        description: body.description || `Total ${month}`,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'source_id,date,external_id' });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'add_income') {
      // { source_id, date, amount_usd, description }
      const { error } = await supabase.from('income_events').insert({
        source_id: body.source_id,
        date: body.date,
        amount_usd: Number(body.amount_usd),
        raw_amount: Number(body.amount_usd),
        currency: 'USD',
        connector: 'manual',
        description: body.description || null,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'add_source') {
      // { name, category, connector, status, emoji, color, notes }
      const { data: maxRow } = await supabase.from('income_sources')
        .select('number').order('number', { ascending: false }).limit(1).maybeSingle();
      const nextNum = (maxRow?.number || 0) + 1;
      const { data, error } = await supabase.from('income_sources').insert({
        number: nextNum,
        name: body.name,
        slug: body.slug || slugify(body.name) + '-' + nextNum,
        category: body.category || 'other',
        connector: body.connector || 'manual',
        status: body.status || 'active',
        emoji: body.emoji || '💸',
        color: body.color || '#3ea6ff',
        link: body.link || null,
        config: body.config || {},
        notes: body.notes || null,
      }).select().single();
      if (error) throw error;
      return NextResponse.json({ ok: true, source: data });
    }

    if (action === 'update_source') {
      const { id, ...fields } = body;
      delete fields.action;
      const { error } = await supabase.from('income_sources').update(fields).eq('id', id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete_source') {
      const { error } = await supabase.from('income_sources').delete().eq('id', body.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'add_goal') {
      const { error } = await supabase.from('income_goals').insert({
        name: body.name,
        period: body.period || 'month',
        target_usd: Number(body.target_usd),
        scope: body.scope || 'all',
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete_goal') {
      const { error } = await supabase.from('income_goals').delete().eq('id', body.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message || e) }, { status: 500 });
  }
}
