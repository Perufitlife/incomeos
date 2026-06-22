import { createClient } from '@supabase/supabase-js';

// Server-only Supabase client using the service role key.
// Never import this from a client component.
export function db() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type Source = {
  id: string;
  number: number | null;
  name: string;
  slug: string;
  category: string;
  connector: string;
  status: string;
  currency: string;
  emoji: string | null;
  color: string | null;
  config: Record<string, unknown>;
  notes: string | null;
};

export type Goal = {
  id: string;
  name: string;
  period: 'month' | 'year';
  target_usd: number;
  scope: string;
};
