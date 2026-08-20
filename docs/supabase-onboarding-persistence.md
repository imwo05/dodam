# Supabase onboarding persistence

The backend selects the persistence adapter from environment variables:

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` select the Supabase/PostgREST adapter.
- Without both values, local development and tests use the in-memory adapter.
- `NODE_ENV=production` or `PERSISTENCE_ADAPTER=supabase` fails fast when Supabase credentials are missing.

The service-role key is backend-only. It must never be included in frontend code, Vite variables, or browser requests.

The migrations enable RLS on `personalization_profiles`, `onboarding_conversations`, `onboarding_messages`, and `user_onboarding_states` without adding public policies. The Node backend accesses these tables through the service-role key; direct anon/authenticated client access is denied by default. User ownership is also checked in the repository/handler path.

The repository stores the current application user IDs as `text`; it does not convert `usr_*` IDs to UUIDs. `user_onboarding_states` is intentionally separate from the existing users table so this change does not assume or rewrite the teammate-owned user schema.

The onboarding message/profile writes are ordered as user message, assistant message, then validated profile patch. They are separate PostgREST requests, not a database transaction. A later database failure can therefore leave the conversation messages present while returning an error; invalid AI output is rejected before any profile update.
