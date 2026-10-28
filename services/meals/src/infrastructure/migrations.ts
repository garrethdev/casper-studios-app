import type { Migration } from '@leanplate/platform';

export const SCHEMA = 'meals';

export const migrations: Migration[] = [
  {
    id: '001_init',
    sql: `
      create table meals.profiles (
        user_id uuid primary key,
        data jsonb not null,
        updated_at timestamptz not null default now()
      );
      create table meals.meals (
        id uuid primary key,
        user_id uuid not null,
        idempotency_key text not null,
        eaten_at timestamptz not null,
        meal_type text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
        items jsonb not null,
        totals jsonb not null,
        verdict jsonb not null,
        feedback jsonb,
        note text,
        created_at timestamptz not null default now(),
        unique (user_id, idempotency_key)
      );
      create index meals_user_time on meals.meals (user_id, eaten_at);
    `,
  },
  {
    id: '002_row_level_security',
    // The service connects with its own role; RLS with no policies blocks Supabase's public API roles from these tables.
    sql: `
      alter table meals.profiles enable row level security;
      alter table meals.meals enable row level security;
    `,
  },
  {
    id: '003_usage',
    // AI analyses cost money. The hourly cap lives here, not in memory, so it holds across serverless instances.
    sql: `
      create table meals.usage (
        user_id uuid not null,
        hour timestamptz not null,
        count integer not null default 0,
        primary key (user_id, hour)
      );
      alter table meals.usage enable row level security;
    `,
  },
];
