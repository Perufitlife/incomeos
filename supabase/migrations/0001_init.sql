-- IncomeOS schema — passive income tracker
-- All amounts normalized to USD in amount_usd. Reads happen server-side with service role.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Sources of passive income (numbered: #1, #2, ...)
-- ─────────────────────────────────────────────────────────────
create table if not exists income_sources (
  id          uuid primary key default gen_random_uuid(),
  number      int unique,                              -- display order / "#1, #2..."
  name        text not null,
  slug        text unique not null,
  category    text not null default 'other',           -- affiliate | saas | marketplace | ads | service | other
  connector   text not null default 'manual',          -- stripe | apify | apify_affiliate | youtube | amazon | manual
  status      text not null default 'active',          -- active | pending | future
  currency    text not null default 'USD',
  emoji       text default '💸',
  color       text default '#3ea6ff',
  config      jsonb not null default '{}'::jsonb,       -- connector-specific (account label, affiliate id, etc.)
  notes       text,
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Income events. One row per (source, date, external_id).
-- Automated connectors write a single daily-total row per source
-- with a fixed external_id so re-syncs upsert in place.
-- Manual entries leave external_id null (multiple per day allowed).
-- ─────────────────────────────────────────────────────────────
create table if not exists income_events (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references income_sources(id) on delete cascade,
  date         date not null,
  amount_usd   numeric(14,4) not null default 0,
  raw_amount   numeric(14,4),
  currency     text not null default 'USD',
  connector    text,
  external_id  text,                                   -- dedup key (e.g. 'stripe_daily')
  description  text,
  meta         jsonb not null default '{}'::jsonb,
  synced_at    timestamptz not null default now()
);

-- Unique upsert key for automated rows. Two partial indexes:
--  • automated rows (external_id not null): unique per (source, date, external_id)
--  • manual rows (external_id null): no uniqueness, many allowed
create unique index if not exists income_events_auto_uk
  on income_events (source_id, date, external_id)
  where external_id is not null;

create index if not exists income_events_date_idx on income_events (date);
create index if not exists income_events_source_idx on income_events (source_id);

-- ─────────────────────────────────────────────────────────────
-- Goals (motivational targets)
-- ─────────────────────────────────────────────────────────────
create table if not exists income_goals (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  period      text not null default 'month',           -- month | year
  target_usd  numeric(14,2) not null,
  scope       text not null default 'all',             -- 'all' or a source slug
  created_at  timestamptz not null default now()
);

-- Sync run log (so the dashboard can show "last updated" + errors)
create table if not exists sync_runs (
  id          uuid primary key default gen_random_uuid(),
  connector   text not null,
  ok          boolean not null default true,
  rows        int default 0,
  total_usd   numeric(14,4) default 0,
  error       text,
  ran_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Helper view: per-source per-day totals (used by the API)
-- ─────────────────────────────────────────────────────────────
create or replace view income_daily as
  select source_id, date, sum(amount_usd)::numeric(14,4) as usd
  from income_events
  group by source_id, date;

-- Lock everything down: reads/writes go through the service role only.
alter table income_sources enable row level security;
alter table income_events  enable row level security;
alter table income_goals   enable row level security;
alter table sync_runs      enable row level security;
