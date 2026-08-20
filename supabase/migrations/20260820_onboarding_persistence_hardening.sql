-- Forward-only additions for the onboarding persistence adapter.
-- IDs intentionally remain text so the current Node auth IDs (for example
-- usr_001) can be persisted without a silent UUID migration.

alter table if exists personalization_profiles
  add column if not exists purpose text,
  add column if not exists weekly_target_count integer,
  add column if not exists available_minutes integer,
  add column if not exists residential_region text,
  add column if not exists life_region text;

create table if not exists user_onboarding_states (
  user_id text primary key,
  onboarding_completed boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists personalization_profiles_updated_at_idx
  on personalization_profiles (updated_at desc);

create index if not exists onboarding_messages_conversation_created_id_idx
  on onboarding_messages (conversation_id, created_at asc, id asc);

-- The backend uses the Supabase service-role key and therefore bypasses RLS.
-- No anon/authenticated policies are created: these onboarding records are not
-- directly readable or writable from a frontend Supabase client.
alter table if exists personalization_profiles enable row level security;
alter table if exists onboarding_conversations enable row level security;
alter table if exists onboarding_messages enable row level security;
alter table user_onboarding_states enable row level security;
