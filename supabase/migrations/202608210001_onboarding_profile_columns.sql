-- Repair linked environments where an earlier onboarding migration was recorded
-- but its profile-column additions were not applied to the live table.
-- This is intentionally forward-only and idempotent: existing user rows stay
-- intact and nullable profile values remain valid while onboarding is in flight.

alter table if exists personalization_profiles
  add column if not exists purpose text,
  add column if not exists weekly_target_count integer,
  add column if not exists available_minutes integer,
  add column if not exists residential_region text,
  add column if not exists life_region text;

notify pgrst, 'reload schema';
