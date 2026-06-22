#!/usr/bin/env node
/**
 * IncomeOS MCP server.
 * Lets an AI agent (Claude, Cursor, etc.) read — and optionally log — your
 * income across every stream tracked in your IncomeOS dashboard.
 *
 * Config (env):
 *   INCOMEOS_URL    e.g. https://your-incomeos.vercel.app
 *   INCOMEOS_TOKEN  your DASHBOARD_TOKEN
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE = (process.env.INCOMEOS_URL || '').replace(/\/$/, '');
const TOKEN = process.env.INCOMEOS_TOKEN || '';

async function api(path, opts = {}) {
  if (!BASE || !TOKEN) throw new Error('Set INCOMEOS_URL and INCOMEOS_TOKEN environment variables.');
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(`IncomeOS API ${r.status}: ${await r.text().catch(() => '')}`);
  return r.json();
}

const usd = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const daysInMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };

const server = new McpServer({ name: 'incomeos', version: '0.1.0' });

server.tool(
  'get_income_summary',
  'Get a summary of total passive income: average per day, this month, this year, all-time, plus the top sources and goal progress.',
  {},
  async () => {
    const d = await api('/api/data');
    const cm = d.currentMonth;
    const monthTotal = d.monthTotals?.[cm] || 0;
    const dayBasis = Number(d.today.slice(8, 10)) || daysInMonth(cm);
    const top = [...d.sources].sort((a, b) => (b.monthly?.[cm] || 0) - (a.monthly?.[cm] || 0)).slice(0, 6)
      .map((s) => `  ${s.emoji || '•'} ${s.name}: ${usd(s.monthly?.[cm] || 0)} this month, ${usd(s.year)} this year`);
    const goals = (d.goals || []).map((g) => {
      const cur = g.scope === 'all' ? (g.period === 'year' ? d.totals.year : monthTotal)
        : (() => { const s = d.sources.find((x) => x.slug === g.scope); return g.period === 'year' ? (s?.year || 0) : (s?.monthly?.[cm] || 0); })();
      const pct = Math.round((cur / Number(g.target_usd)) * 100);
      return `  🎯 ${g.name}: ${usd(cur)} / ${usd(g.target_usd)} (${pct}%)`;
    });
    const text =
      `Passive income summary (${cm}):\n` +
      `• Average/day: ${usd(monthTotal / dayBasis)}\n` +
      `• This month: ${usd(monthTotal)}\n` +
      `• This year: ${usd(d.totals.year)}\n` +
      `• All-time: ${usd(d.totals.all)}\n\n` +
      `Top sources this month:\n${top.join('\n')}\n` +
      (goals.length ? `\nGoals:\n${goals.join('\n')}` : '');
    return { content: [{ type: 'text', text }] };
  },
);

server.tool(
  'get_sources',
  'List all income sources with their amount this month, this year, and all-time.',
  {},
  async () => {
    const d = await api('/api/data');
    const cm = d.currentMonth;
    const rows = [...d.sources]
      .sort((a, b) => (a.number ?? 99) - (b.number ?? 99))
      .map((s) => `#${s.number} ${s.emoji || ''} ${s.name} [${s.status}] — month ${usd(s.monthly?.[cm] || 0)}, year ${usd(s.year)}, all-time ${usd(s.all)}`);
    return { content: [{ type: 'text', text: rows.join('\n') }] };
  },
);

server.tool(
  'get_month',
  'Get the income breakdown for a specific month (YYYY-MM): total and per-source.',
  { month: z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM') },
  async ({ month }) => {
    const d = await api('/api/data');
    const total = d.monthTotals?.[month] || 0;
    const rows = [...d.sources]
      .map((s) => ({ s, v: s.monthly?.[month] || 0 }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v)
      .map((x) => `  ${x.s.emoji || '•'} ${x.s.name}: ${usd(x.v)}`);
    const text = `Income for ${month}: ${usd(total)}\n` + (rows.length ? rows.join('\n') : '  (no income recorded)');
    return { content: [{ type: 'text', text }] };
  },
);

server.tool(
  'log_monthly_income',
  'Log (or overwrite) the income total for a source for a given month. Use 0 to clear it.',
  {
    source: z.string().describe('Source name (case-insensitive) or slug'),
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM'),
    amount_usd: z.number().describe('Total earned that month in USD'),
  },
  async ({ source, month, amount_usd }) => {
    const d = await api('/api/data');
    const q = source.toLowerCase();
    const s = d.sources.find((x) => x.name.toLowerCase() === q || x.slug === q)
      || d.sources.find((x) => x.name.toLowerCase().includes(q));
    if (!s) throw new Error(`No source matching "${source}". Existing: ${d.sources.map((x) => x.name).join(', ')}`);
    await api('/api/manual', { method: 'POST', body: JSON.stringify({ action: 'add_monthly', source_id: s.id, month, amount_usd }) });
    return { content: [{ type: 'text', text: `Logged ${usd(amount_usd)} for ${s.emoji || ''} ${s.name} in ${month}.` }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
