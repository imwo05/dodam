-- P0 onboarding persistence boundary.
-- The current Node MVP uses the store abstraction; this migration is the
-- PostgreSQL/Supabase shape for replacing that adapter later.

create table if not exists personalization_profiles (
  user_id text primary key,
  self_care_goals text[] not null default '{}',
  self_care_difficulty_reasons text[] not null default '{}',
  plan_change_reasons text[] not null default '{}',
  difficulty_after_plan_change text[] not null default '{}',
  available_fallback_min integer,
  available_fallback_max integer,
  preferred_activities text[] not null default '{}',
  preferred_atmospheres text[] not null default '{}',
  avoid_atmospheres text[] not null default '{}',
  preferred_intensity text check (preferred_intensity in ('LOW', 'MEDIUM', 'HIGH')),
  social_preference text check (social_preference in ('SOLO', 'SOCIAL', 'ANY')),
  ai_style text not null default 'F' check (ai_style in ('T', 'F')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    available_fallback_min is null
    or available_fallback_max is null
    or (
      available_fallback_min between 1 and 1440
      and available_fallback_max between 1 and 1440
      and available_fallback_min <= available_fallback_max
    )
  )
);

create table if not exists onboarding_conversations (
  id text primary key,
  user_id text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'COMPLETED')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists onboarding_conversations_user_id_idx
  on onboarding_conversations (user_id, created_at desc);

create table if not exists onboarding_messages (
  id text primary key,
  conversation_id text not null,
  role text not null check (role in ('USER', 'ASSISTANT')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists onboarding_messages_conversation_id_idx
  on onboarding_messages (conversation_id, created_at asc);
