import { randomUUID } from 'node:crypto';
import { createSupabaseRestClient } from '../supabase/client.js';
import {
  emptyPersonalizationProfile,
  mergePersonalizationProfile,
  profileForResponse
} from '../../modules/onboarding/profile.js';

export function createRepositories({
  store,
  supabaseClient,
  supabaseUrl = process.env.SUPABASE_URL,
  supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
  fetchImpl,
  adapter = process.env.PERSISTENCE_ADAPTER,
  nodeEnv = process.env.NODE_ENV,
  logger = console
} = {}) {
  const configured = Boolean(supabaseUrl && supabaseServiceRoleKey);
  const requested = adapter?.toLowerCase();

  if (!supabaseClient && (requested === 'supabase' || (nodeEnv === 'production' && !configured))) {
    throw new Error(
      'Supabase persistence is required in production. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  if (supabaseClient || configured) {
    const client = supabaseClient ?? createSupabaseRestClient({
      url: supabaseUrl,
      serviceRoleKey: supabaseServiceRoleKey,
      fetchImpl
    });
    return {
      adapterName: 'supabase',
      profile: createSupabaseProfileRepository(client),
      onboarding: createSupabaseOnboardingRepository(client),
      user: createSupabaseUserRepository({ client, store })
    };
  }

  logger.warn?.('[persistence] adapter=in-memory; set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for persistent onboarding data.');
  return {
    adapterName: 'in-memory',
    profile: createInMemoryProfileRepository(store),
    onboarding: createInMemoryOnboardingRepository(store),
    user: createInMemoryUserRepository(store)
  };
}

export function createInMemoryProfileRepository(store) {
  return {
    async getSelfCareProfile(userId) {
      return store.getSelfCareProfile(userId);
    },
    async setSelfCareProfile(userId, patch) {
      return store.setSelfCareProfile(userId, patch);
    }
  };
}

export function createInMemoryOnboardingRepository(store) {
  return {
    async createOnboardingConversation(input) {
      return store.createOnboardingConversation(input);
    },
    async findOnboardingConversation(id, userId) {
      const conversation = store.findOnboardingConversation(id);
      return conversation && (userId == null || conversation.userId === String(userId)) ? conversation : null;
    },
    async updateOnboardingConversation(id, patch) {
      return store.updateOnboardingConversation(id, patch);
    },
    async addOnboardingMessage(input) {
      return store.addOnboardingMessage(input);
    },
    async listOnboardingMessages(conversationId) {
      return store.listOnboardingMessages(conversationId);
    }
  };
}

export function createInMemoryUserRepository(store) {
  return {
    async setOnboardingCompleted(userId, completed = true) {
      return store.updateUser(userId, { onboardingCompleted: Boolean(completed) });
    }
  };
}

function createSupabaseProfileRepository(client) {
  return {
    async getSelfCareProfile(userId) {
      const rows = await client.select('personalization_profiles', {
        user_id: `eq.${String(userId)}`,
        limit: '1'
      });
      return rows[0] ? fromProfileRow(rows[0]) : null;
    },
    async setSelfCareProfile(userId, patch) {
      const existing = await this.getSelfCareProfile(userId);
      const merged = {
        ...mergePersonalizationProfile(existing, patch),
        userId: String(userId),
        updatedAt: new Date().toISOString()
      };
      const rows = await client.upsert('personalization_profiles', toProfileRow(merged), 'user_id');
      return rows[0] ? fromProfileRow(rows[0]) : profileForResponse(merged);
    }
  };
}

function createSupabaseOnboardingRepository(client) {
  return {
    async createOnboardingConversation({ userId }) {
      const now = new Date().toISOString();
      const row = {
        id: makePersistentId('obc'),
        user_id: String(userId),
        status: 'ACTIVE',
        created_at: now,
        completed_at: null
      };
      const rows = await client.insert('onboarding_conversations', row);
      return fromConversationRow(rows[0] ?? row);
    },
    async findOnboardingConversation(id, userId) {
      const query = { id: `eq.${String(id)}`, limit: '1' };
      if (userId != null) query.user_id = `eq.${String(userId)}`;
      const rows = await client.select('onboarding_conversations', query);
      return rows[0] ? fromConversationRow(rows[0]) : null;
    },
    async updateOnboardingConversation(id, patch) {
      const rows = await client.update(
        'onboarding_conversations',
        { id: `eq.${String(id)}` },
        toConversationPatch(patch)
      );
      return rows[0] ? fromConversationRow(rows[0]) : null;
    },
    async addOnboardingMessage({ conversationId, role, content }) {
      const row = {
        id: makePersistentId('obm'),
        conversation_id: String(conversationId),
        role,
        content,
        created_at: new Date().toISOString()
      };
      const rows = await client.insert('onboarding_messages', row);
      return fromMessageRow(rows[0] ?? row);
    },
    async listOnboardingMessages(conversationId) {
      const rows = await client.select('onboarding_messages', {
        conversation_id: `eq.${String(conversationId)}`,
        order: 'created_at.asc,id.asc'
      });
      return rows.map(fromMessageRow);
    }
  };
}

function createSupabaseUserRepository({ client, store }) {
  return {
    async setOnboardingCompleted(userId, completed = true) {
      const now = new Date().toISOString();
      const row = {
        user_id: String(userId),
        onboarding_completed: Boolean(completed),
        updated_at: now
      };
      const rows = await client.upsert('user_onboarding_states', row, 'user_id');
      // Keep the current auth response consistent for the rest of this process.
      store?.updateUser(userId, { onboardingCompleted: Boolean(completed) });
      return rows[0] ? fromOnboardingStateRow(rows[0]) : { userId: String(userId), onboardingCompleted: Boolean(completed) };
    }
  };
}

function toProfileRow(profile) {
  const source = { ...emptyPersonalizationProfile(), ...(profile ?? {}) };
  return {
    user_id: String(source.userId),
    purpose: source.purpose ?? null,
    weekly_target_count: source.weeklyTargetCount ?? null,
    available_minutes: source.availableMinutes ?? null,
    residential_region: source.residentialRegion ?? null,
    life_region: source.lifeRegion ?? null,
    self_care_goals: source.selfCareGoals ?? [],
    self_care_difficulty_reasons: source.selfCareDifficultyReasons ?? [],
    plan_change_reasons: source.planChangeReasons ?? [],
    difficulty_after_plan_change: source.difficultyAfterPlanChange ?? [],
    available_fallback_min: source.availableFallbackMinutes?.min ?? null,
    available_fallback_max: source.availableFallbackMinutes?.max ?? null,
    preferred_activities: source.preferredActivities ?? [],
    preferred_atmospheres: source.preferredAtmospheres ?? [],
    avoid_atmospheres: source.avoidAtmospheres ?? [],
    preferred_intensity: source.preferredIntensity ?? null,
    social_preference: source.socialPreference ?? null,
    ai_style: source.aiStyle === 'T' ? 'T' : 'F',
    updated_at: source.updatedAt ?? new Date().toISOString()
  };
}

function fromProfileRow(row) {
  return profileForResponse({
    userId: row.user_id,
    purpose: row.purpose ?? null,
    weeklyTargetCount: row.weekly_target_count ?? null,
    availableMinutes: row.available_minutes ?? null,
    residentialRegion: row.residential_region ?? null,
    lifeRegion: row.life_region ?? null,
    selfCareGoals: row.self_care_goals ?? [],
    selfCareDifficultyReasons: row.self_care_difficulty_reasons ?? [],
    planChangeReasons: row.plan_change_reasons ?? [],
    difficultyAfterPlanChange: row.difficulty_after_plan_change ?? [],
    availableFallbackMinutes: row.available_fallback_min == null && row.available_fallback_max == null
      ? null
      : { min: row.available_fallback_min, max: row.available_fallback_max },
    preferredActivities: row.preferred_activities ?? [],
    preferredAtmospheres: row.preferred_atmospheres ?? [],
    avoidAtmospheres: row.avoid_atmospheres ?? [],
    preferredIntensity: row.preferred_intensity ?? null,
    socialPreference: row.social_preference ?? null,
    aiStyle: row.ai_style === 'T' ? 'T' : 'F',
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null
  });
}

function fromConversationRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? null
  };
}

function fromMessageRow(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at
  };
}

function fromOnboardingStateRow(row) {
  return {
    userId: row.user_id,
    onboardingCompleted: Boolean(row.onboarding_completed),
    updatedAt: row.updated_at ?? null
  };
}

function toConversationPatch(patch) {
  const out = {};
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.completedAt !== undefined) out.completed_at = patch.completedAt;
  return out;
}

function makePersistentId(prefix) {
  return `${prefix}_${randomUUID()}`;
}
