import type { Migration } from '@leanplate/platform';

/**
 * Plain SQL that runs on embedded Postgres (PGlite) locally and on Postgres in
 * production. Row level security is switched on with no policies so the
 * database's public API roles can read nothing; this service connects as the
 * table owner, which is exempt.
 */
export const M001_INITIAL = `
create table identity.users (
  id uuid primary key,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  constraint users_email_lowercase check (email = lower(email))
);

create table identity.sessions (
  id uuid primary key,
  user_id uuid not null references identity.users(id) on delete cascade,
  family_id uuid not null,
  token_hash text not null unique,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz
);
create index sessions_family_idx on identity.sessions (family_id);
create index sessions_user_idx on identity.sessions (user_id);

create table identity.audit_log (
  id serial primary key,
  at timestamptz not null,
  user_id uuid,
  event text not null,
  detail jsonb not null default '{}'::jsonb
);
create index audit_log_user_idx on identity.audit_log (user_id);

alter table identity.users enable row level security;
alter table identity.sessions enable row level security;
alter table identity.audit_log enable row level security;
`;

export const identityMigrations: Migration[] = [{ id: '001_initial', sql: M001_INITIAL }];
