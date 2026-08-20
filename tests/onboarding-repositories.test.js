import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepositories } from '../src/data/repositories/index.js';

test('in-memory repository remains the explicit local fallback', () => {
  const logs = [];
  const repositories = createRepositories({
    store: createMemoryStore(),
    logger: { warn(message) { logs.push(message); } }
  });

  assert.equal(repositories.adapterName, 'in-memory');
  assert.equal(logs.length, 1);
});

test('production-like mode cannot silently fall back to memory', () => {
  assert.throws(
    () => createRepositories({ store: createMemoryStore(), nodeEnv: 'production' }),
    /Supabase persistence is required in production/
  );
});

test('supabase repository fresh-reads and merges personalization fields', async () => {
  const client = createFakeSupabaseClient();
  const first = createRepositories({ supabaseClient: client, store: createMemoryStore() });
  await first.profile.setSelfCareProfile('usr_001', {
    purpose: '스트레스 관리',
    weeklyTargetCount: 3,
    availableMinutes: 60,
    residentialRegion: 'GWANAK',
    lifeRegion: 'JONGNO',
    selfCareGoals: ['sleep'],
    planChangeReasons: ['FATIGUE'],
    preferredActivities: ['WALK'],
    availableFallbackMinutes: { min: 20, max: 40 }
  });

  const second = createRepositories({ supabaseClient: client, store: createMemoryStore() });
  const fresh = await second.profile.getSelfCareProfile('usr_001');
  assert.deepEqual(fresh.selfCareGoals, ['sleep']);
  assert.deepEqual(fresh.preferredActivities, ['WALK']);
  assert.equal(fresh.availableMinutes, 60);
  assert.equal(fresh.residentialRegion, 'GWANAK');

  await second.profile.setSelfCareProfile('usr_001', {
    purpose: '기분 전환',
    preferredAtmospheres: ['QUIET'],
    preferredIntensity: null,
    socialPreference: null
  });
  const merged = await first.profile.getSelfCareProfile('usr_001');
  assert.equal(client.tables.personalization_profiles.length, 1);
  assert.equal(merged.purpose, '기분 전환');
  assert.deepEqual(merged.preferredActivities, ['WALK']);
  assert.deepEqual(merged.preferredAtmospheres, ['QUIET']);
  assert.deepEqual(merged.availableFallbackMinutes, { min: 20, max: 40 });
  assert.equal(merged.preferredIntensity, null);
  assert.equal(merged.socialPreference, null);
});

test('supabase repository persists conversation ownership and ordered messages', async () => {
  const client = createFakeSupabaseClient();
  const repositories = createRepositories({ supabaseClient: client, store: createMemoryStore() });
  const conversation = await repositories.onboarding.createOnboardingConversation({ userId: 'usr_001' });

  await repositories.onboarding.addOnboardingMessage({
    conversationId: conversation.id,
    role: 'USER',
    content: '걷고 싶어요'
  });
  await repositories.onboarding.addOnboardingMessage({
    conversationId: conversation.id,
    role: 'ASSISTANT',
    content: '얼마나 시간이 있나요?'
  });

  assert.ok(await repositories.onboarding.findOnboardingConversation(conversation.id, 'usr_001'));
  assert.equal(await repositories.onboarding.findOnboardingConversation(conversation.id, 'usr_999'), null);
  assert.deepEqual(
    (await repositories.onboarding.listOnboardingMessages(conversation.id)).map((message) => message.role),
    ['USER', 'ASSISTANT']
  );
});

test('completion state is persisted separately from the current auth store', async () => {
  const client = createFakeSupabaseClient();
  const store = createMemoryStore();
  const repositories = createRepositories({ supabaseClient: client, store });
  await repositories.user.setOnboardingCompleted('usr_001', true);
  assert.equal(store.user.onboardingCompleted, true);
  assert.equal(client.tables.user_onboarding_states[0].onboarding_completed, true);
});

function createMemoryStore() {
  const user = { id: 'usr_001', onboardingCompleted: false };
  return {
    user,
    getSelfCareProfile() { return null; },
    setSelfCareProfile() { return null; },
    updateUser(_id, patch) { Object.assign(user, patch); return { ...user }; },
    createOnboardingConversation() { throw new Error('not used'); },
    findOnboardingConversation() { return null; },
    updateOnboardingConversation() { return null; },
    addOnboardingMessage() { return null; },
    listOnboardingMessages() { return []; }
  };
}

function createFakeSupabaseClient() {
  const tables = {
    personalization_profiles: [],
    onboarding_conversations: [],
    onboarding_messages: [],
    user_onboarding_states: []
  };
  let messageSequence = 0;

  return {
    tables,
    async select(table, query) {
      let rows = [...tables[table]];
      for (const [key, value] of Object.entries(query)) {
        if (key === 'limit' || key === 'order') continue;
        if (value?.startsWith('eq.')) rows = rows.filter((row) => String(row[key]) === value.slice(3));
      }
      if (query.order) rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      if (query.limit) rows = rows.slice(0, Number(query.limit));
      return rows.map((row) => ({ ...row }));
    },
    async insert(table, row) {
      const saved = { ...row };
      if (table === 'onboarding_messages') saved.created_at = saved.created_at ?? `${++messageSequence}`;
      tables[table].push(saved);
      return [{ ...saved }];
    },
    async upsert(table, row) {
      const key = table === 'personalization_profiles' || table === 'user_onboarding_states' ? 'user_id' : 'id';
      const index = tables[table].findIndex((item) => item[key] === row[key]);
      if (index < 0) tables[table].push({ ...row });
      else tables[table][index] = { ...tables[table][index], ...row };
      return [{ ...(tables[table][index < 0 ? tables[table].length - 1 : index]) }];
    },
    async update(table, query, patch) {
      const id = query.id.slice(3);
      const row = tables[table].find((item) => item.id === id);
      if (!row) return [];
      Object.assign(row, patch);
      return [{ ...row }];
    }
  };
}
