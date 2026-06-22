# 💰 IncomeOS — the open-source passive income dashboard

**One screen for every dollar you make.** Self-hosted, privacy-first revenue
tracker that aggregates **all** your income streams — Stripe, affiliates,
marketplaces, ads, and manual entries — into a single real-time dashboard, in
USD, by **day / month / year**.

A free, self-hostable **Baremetrics alternative** for indie hackers who run a
*portfolio* of small income streams, not just one SaaS.

<p align="center">
  <img alt="MIT" src="https://img.shields.io/badge/license-MIT-3ba55d">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Postgres-3ecf8e">
  <img alt="Deploy" src="https://img.shields.io/badge/deploy-Vercel-black">
</p>

> Your revenue data lives in **your own** Supabase project. No third party ever
> sees your numbers. Connect your own keys, deploy free on Vercel in ~5 minutes.

---

## Why IncomeOS?

Tools like Baremetrics or ProfitWell are great — if you have **one** Stripe
account and $129+/mo to spare. But modern indie hackers earn from a dozen tiny
places: a SaaS on Stripe, an Amazon affiliate link, a marketplace actor, some
AdSense, a Gumroad template, a sponsorship. **Nobody aggregates the long tail.**

IncomeOS does:

- 🔢 **Numbered income sources** — `#1 SaaS`, `#2 Amazon`, `#3 Sponsorship`…
- 📅 **Day / month / year** views, with **averages (pro-rated)** so even
  monthly-only sources show an "avg per day".
- ⚡ **Stripe on autopilot** — net (after-fee) revenue, auto-grouped per product.
- ✍️ **Everything else by hand in 10 seconds** — type a monthly total per source.
- 📈 **Month-over-month trend** so you watch each stream grow.
- 🎯 **Goals** with live "you need $X more" progress.
- 🔗 **Click a source → open its dashboard** (where you read the affiliate numbers).
- 🔒 **Single-password access**, your data in your own database.

## Quickstart (~5 min)

1. **Create a Supabase project** (free) and run `supabase/migrations/0001_init.sql`
   in the SQL editor.
2. **Deploy to Vercel** (or `npm run dev` locally). Set the env vars from
   [`.env.example`](./.env.example):
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `DASHBOARD_TOKEN` (your login password), `CRON_SECRET`
   - `STRIPE_SECRET_KEY` (optional — a read-only restricted key is recommended)
3. **Open the app**, type your `DASHBOARD_TOKEN`, hit **Sync**. Stripe products
   appear as sources automatically; add the rest with **➕ Add source**.

A daily Vercel Cron (`vercel.json`) keeps Stripe fresh; the **Sync** button
pulls on demand.

## Connectors

| Source | Status | How |
| --- | --- | --- |
| **Stripe** | ✅ automatic | Net revenue, grouped per product, zero config |
| Amazon / affiliates | ✍️ manual | Enter the monthly total (one click) |
| Marketplaces, ads, sponsorships | ✍️ manual | Same — numbered sources |
| Gumroad, LemonSqueezy, AdSense, Plaid (bank) | 🛠️ roadmap | PRs welcome |

Each source can hold a **link** to its own dashboard — clicking the card opens it.

## 🤖 Ask your AI (MCP)

IncomeOS ships an **MCP server** so any AI agent (Claude, Cursor…) can read your
income on demand — *"how much did I make this month across everything?"*

```json
{
  "mcpServers": {
    "incomeos": {
      "command": "npx",
      "args": ["-y", "incomeos-mcp"],
      "env": { "INCOMEOS_URL": "https://your-incomeos.vercel.app", "INCOMEOS_TOKEN": "your-token" }
    }
  }
}
```

Tools: `get_income_summary`, `get_sources`, `get_month`, `log_monthly_income`.
See [`mcp/`](./mcp). Your data stays in your own instance — the MCP just calls
its API with your token.

## Tech

Next.js 16 (App Router) · Supabase (Postgres) · Recharts · Tailwind v4 · Vercel.
No multi-tenant server, no SaaS lock-in — it's just your data and your keys.

## Roadmap

- [x] **Income MCP** — ask your AI agent *"how much did I make this month?"* ✅
- [ ] More connectors (Gumroad, LemonSqueezy, AdSense, PayPal, Plaid)
- [ ] Weekly email digest
- [ ] CSV import/export

## License

MIT — see [LICENSE](./LICENSE). Built for indie hackers, by indie hackers.
