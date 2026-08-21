-- Forward-only repair for onboarding persistence shape and indexes.
-- This migration is lexically after onboarding_personalization and therefore
-- runs after personalization_profiles and onboarding_messages exist.

-- The earlier hardening migration intentionally uses `if exists` because it
-- may run before personalization_profiles on a clean replay. Apply those
-- profile columns again here so both clean and already-populated databases
-- converge on the same persistence shape.
alter table if exists personalization_profiles
  add column if not exists purpose text,
  add column if not exists weekly_target_count integer,
  add column if not exists available_minutes integer,
  add column if not exists residential_region text,
  add column if not exists life_region text;

create index if not exists personalization_profiles_updated_at_idx
  on personalization_profiles (updated_at desc);

create index if not exists onboarding_messages_conversation_created_id_idx
  on onboarding_messages (conversation_id, created_at asc, id asc);
