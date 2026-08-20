-- Forward-only repair for onboarding indexes.
-- This migration is lexically after onboarding_personalization and therefore
-- runs after personalization_profiles and onboarding_messages exist.

create index if not exists personalization_profiles_updated_at_idx
  on personalization_profiles (updated_at desc);

create index if not exists onboarding_messages_conversation_created_id_idx
  on onboarding_messages (conversation_id, created_at asc, id asc);
