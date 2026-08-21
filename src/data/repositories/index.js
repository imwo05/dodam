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

  if (!supabaseClient && ((requested === 'supabase' || nodeEnv === 'production') && !configured)) {
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
      user: createSupabaseUserRepository({ client, store }),
      place: createSupabasePlaceRepository(client)
    };
  }

  logger.warn?.('[persistence] adapter=in-memory; set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for persistent Place and onboarding data.');
  return {
    adapterName: 'in-memory',
    profile: createInMemoryProfileRepository(store),
    onboarding: createInMemoryOnboardingRepository(store),
    user: createInMemoryUserRepository(store),
    place: createInMemoryPlaceRepository(store)
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

export function createInMemoryPlaceRepository(store) {
  return {
    async getById(id, { includeInactive = false } = {}) {
      const place = store.findPlaceById(id);
      return place && (includeInactive || (place.status ?? 'ACTIVE') === 'ACTIVE') ? place : null;
    },
    async list(filters = {}) {
      let places = store.listPlaces({
        creatorId: filters.creatorId,
        category: filters.category,
        keyword: filters.keyword,
        bbox: filters.bbox,
        maxDurationMinutes: filters.maxDurationMinutes
      });
      if (!filters.includeInactive) places = places.filter((place) => (place.status ?? 'ACTIVE') === 'ACTIVE');
      if (filters.ids) {
        const ids = new Set(filters.ids.map(String));
        places = places.filter((place) => ids.has(place.id));
      }
      return places;
    },
    async search(keyword, options = {}) {
      return this.list({ ...options, keyword });
    },
    async getInBounds(bounds, options = {}) {
      return this.list({ ...options, bbox: bounds });
    },
    async create(input) {
      return store.createPlace(input);
    },
    async update(id, patch) {
      return store.updatePlace(id, { ...patch, updatedAt: new Date().toISOString() });
    },
    async delete(id) {
      return store.deletePlace(id);
    },
    async getByCreator(creatorId, options = {}) {
      return this.list({ ...options, creatorId });
    },
    async savePlace(userId, placeId) {
      store.savePlace(userId, placeId);
      return { userId: String(userId), placeId: String(placeId) };
    },
    async unsavePlace(userId, placeId) {
      store.unsavePlace(userId, placeId);
      return true;
    },
    async isSaved(userId, placeId) {
      return store.isPlaceSaved(userId, placeId);
    },
    async getSavedPlaces(userId) {
      return store.listSavedPlaces(userId);
    },
    async upsertSeed(place) {
      const existing = store.findPlaceBySourceId?.(place.sourceId)
        ?? store.listPlaces({ includeInactive: true }).find((item) => item.sourceId === place.sourceId);
      if (existing) return store.updatePlace(existing.id, place);
      return store.createPlace(place);
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

export function createSupabasePlaceRepository(client) {
  return {
    async getById(id, { includeInactive = false } = {}) {
      const query = { id: `eq.${String(id)}`, limit: '1' };
      if (!includeInactive) query.status = 'eq.ACTIVE';
      const rows = await client.select('places', query);
      return rows[0] ? fromPlaceRow(rows[0]) : null;
    },
    async list(filters = {}) {
      const query = {};
      if (!filters.includeInactive) query.status = 'eq.ACTIVE';
      if (filters.creatorId != null) query.creator_id = `eq.${String(filters.creatorId)}`;
      if (filters.category) query.activity_type = `eq.${String(filters.category)}`;
      if (filters.geometryType) query.geometry_type = `eq.${String(filters.geometryType)}`;
      const rows = await client.select('places', query);
      let places = rows.map(fromPlaceRow);
      if (filters.ids) {
        const ids = new Set(filters.ids.map(String));
        places = places.filter((place) => ids.has(place.id));
      }
      if (filters.keyword) places = filterKeyword(places, filters.keyword);
      if (filters.maxDurationMinutes != null) {
        places = places.filter((place) => place.durationMinutes == null || place.durationMinutes <= Number(filters.maxDurationMinutes));
      }
      if (filters.bbox) places = places.filter((place) => geometryIntersectsBounds(place, filters.bbox));
      return places.sort(sortPlaces);
    },
    async search(keyword, options = {}) {
      return this.list({ ...options, keyword });
    },
    async getInBounds(bounds, options = {}) {
      return this.list({ ...options, bbox: bounds });
    },
    async create(input) {
      const row = toPlaceRow({
        ...input,
        id: input.id ?? makePersistentId('plc'),
        source: input.source ?? 'USER',
        status: input.status ?? 'ACTIVE'
      });
      const rows = await client.insert('places', row);
      return fromPlaceRow(rows[0] ?? row);
    },
    async update(id, patch) {
      const rows = await client.update('places', { id: `eq.${String(id)}` }, toPlacePatch(patch));
      return rows[0] ? fromPlaceRow(rows[0]) : null;
    },
    async delete(id) {
      const rows = await client.update(
        'places',
        { id: `eq.${String(id)}` },
        { status: 'DELETED', updated_at: new Date().toISOString() }
      );
      return rows[0] ? fromPlaceRow(rows[0]) : null;
    },
    async getByCreator(creatorId, options = {}) {
      return this.list({ ...options, creatorId });
    },
    async savePlace(userId, placeId) {
      const rows = await client.upsert(
        'saved_places',
        { user_id: String(userId), place_id: String(placeId) },
        'user_id,place_id'
      );
      return rows[0] ?? { userId: String(userId), placeId: String(placeId) };
    },
    async unsavePlace(userId, placeId) {
      await client.delete('saved_places', {
        user_id: `eq.${String(userId)}`,
        place_id: `eq.${String(placeId)}`
      });
      return true;
    },
    async isSaved(userId, placeId) {
      const rows = await client.select('saved_places', {
        user_id: `eq.${String(userId)}`,
        place_id: `eq.${String(placeId)}`,
        limit: '1'
      });
      return Boolean(rows[0]);
    },
    async getSavedPlaces(userId) {
      const saved = await client.select('saved_places', {
        user_id: `eq.${String(userId)}`,
        order: 'created_at.desc'
      });
      if (!saved.length) return [];
      const places = await this.list({ ids: saved.map((row) => row.place_id) });
      const byId = new Map(places.map((place) => [place.id, place]));
      return saved.map((row) => byId.get(row.place_id)).filter(Boolean);
    },
    async upsertSeed(place) {
      const row = toPlaceRow({
        ...place,
        source: 'SEED',
        status: place.status ?? 'ACTIVE'
      });
      const rows = await client.upsert('places', row, 'source_id');
      return fromPlaceRow(rows[0] ?? row);
    }
  };
}

function toPlaceRow(place) {
  const now = new Date().toISOString();
  return {
    id: String(place.id),
    source_id: place.sourceId ?? null,
    creator_id: place.creatorId ?? null,
    name: place.name,
    description: place.description ?? '',
    tip: place.tip ?? null,
    address: place.address ?? '',
    district: place.district ?? null,
    geometry_type: place.geometryType ?? 'POINT',
    latitude: place.geometryType === 'SEGMENT' ? null : numberOrNull(place.latitude ?? place.pointLatitude),
    longitude: place.geometryType === 'SEGMENT' ? null : numberOrNull(place.longitude ?? place.pointLongitude),
    start_latitude: numberOrNull(place.startLatitude),
    start_longitude: numberOrNull(place.startLongitude),
    end_latitude: numberOrNull(place.endLatitude),
    end_longitude: numberOrNull(place.endLongitude),
    encoded_polyline: place.encodedPolyline ?? null,
    distance_meters: numberOrNull(place.distanceMeters),
    duration_minutes: integerOrNull(place.durationMinutes),
    activity_type: place.activityType ?? place.primaryCategory ?? null,
    experience_categories: [...(place.experienceCategories ?? [])],
    source_wellness_type: place.sourceWellnessType ?? place.wellnessType ?? null,
    atmosphere_tags: [...(place.atmosphereTags ?? place.tags ?? [])],
    intensity: place.intensity ?? null,
    indoor_outdoor: place.indoorOutdoor ?? null,
    recommended_time_bands: [...(place.recommendedTimeBands ?? [])],
    solo_friendly: place.soloFriendly ?? null,
    price_level: place.priceLevel ?? null,
    image_urls: [...(place.imageUrls ?? [])],
    status: place.status ?? 'ACTIVE',
    source: place.source ?? 'USER',
    source_metadata: place.sourceMetadata ?? {},
    created_at: place.createdAt ?? now,
    updated_at: place.updatedAt ?? now
  };
}

function toPlacePatch(patch) {
  const mapping = {
    creatorId: 'creator_id',
    name: 'name',
    description: 'description',
    tip: 'tip',
    address: 'address',
    district: 'district',
    geometryType: 'geometry_type',
    latitude: 'latitude',
    longitude: 'longitude',
    pointLatitude: 'latitude',
    pointLongitude: 'longitude',
    startLatitude: 'start_latitude',
    startLongitude: 'start_longitude',
    endLatitude: 'end_latitude',
    endLongitude: 'end_longitude',
    encodedPolyline: 'encoded_polyline',
    distanceMeters: 'distance_meters',
    durationMinutes: 'duration_minutes',
    activityType: 'activity_type',
    primaryCategory: 'activity_type',
    experienceCategories: 'experience_categories',
    sourceWellnessType: 'source_wellness_type',
    wellnessType: 'source_wellness_type',
    atmosphereTags: 'atmosphere_tags',
    tags: 'atmosphere_tags',
    intensity: 'intensity',
    indoorOutdoor: 'indoor_outdoor',
    recommendedTimeBands: 'recommended_time_bands',
    soloFriendly: 'solo_friendly',
    priceLevel: 'price_level',
    imageUrls: 'image_urls',
    status: 'status',
    sourceMetadata: 'source_metadata'
  };
  const row = {};
  for (const [key, column] of Object.entries(mapping)) {
    if (patch[key] !== undefined) row[column] = patch[key];
  }
  row.updated_at = new Date().toISOString();
  return row;
}

function fromPlaceRow(row) {
  const geometryType = row.geometry_type ?? 'POINT';
  const atmosphereTags = [...(row.atmosphere_tags ?? [])];
  return {
    id: row.id,
    sourceId: row.source_id ?? null,
    creatorId: row.creator_id ?? null,
    name: row.name,
    description: row.description ?? '',
    tip: row.tip ?? null,
    address: row.address ?? '',
    district: row.district ?? null,
    geometryType,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    pointLatitude: row.latitude ?? null,
    pointLongitude: row.longitude ?? null,
    startLatitude: row.start_latitude ?? null,
    startLongitude: row.start_longitude ?? null,
    endLatitude: row.end_latitude ?? null,
    endLongitude: row.end_longitude ?? null,
    encodedPolyline: row.encoded_polyline ?? null,
    distanceMeters: row.distance_meters ?? null,
    durationMinutes: row.duration_minutes ?? null,
    activityType: row.activity_type ?? null,
    primaryCategory: row.activity_type ?? null,
    experienceCategories: [...(row.experience_categories ?? [])],
    sourceWellnessType: row.source_wellness_type ?? null,
    wellnessType: row.source_wellness_type ?? null,
    atmosphereTags,
    moodTags: atmosphereTags,
    tags: atmosphereTags,
    intensity: row.intensity ?? null,
    indoorOutdoor: row.indoor_outdoor ?? null,
    recommendedTimeBands: [...(row.recommended_time_bands ?? [])],
    soloFriendly: row.solo_friendly ?? null,
    priceLevel: row.price_level ?? null,
    imageUrls: [...(row.image_urls ?? [])],
    status: row.status ?? 'ACTIVE',
    source: row.source ?? 'USER',
    sourceMetadata: row.source_metadata ?? {},
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null
  };
}

function filterKeyword(places, keyword) {
  const normalized = String(keyword).toLocaleLowerCase();
  return places.filter((place) => [
    place.name,
    place.address,
    place.description,
    place.district,
    place.sourceWellnessType,
    ...(place.atmosphereTags ?? [])
  ].filter(Boolean).some((value) => String(value).toLocaleLowerCase().includes(normalized)));
}

function geometryIntersectsBounds(place, bounds) {
  const swLat = Number(bounds.swLat);
  const swLng = Number(bounds.swLng);
  const neLat = Number(bounds.neLat);
  const neLng = Number(bounds.neLng);
  if (![swLat, swLng, neLat, neLng].every(Number.isFinite)) return false;
  if (place.geometryType !== 'SEGMENT') {
    return inBounds(place.latitude, place.longitude, swLat, swLng, neLat, neLng);
  }
  const minLat = Math.min(place.startLatitude, place.endLatitude);
  const maxLat = Math.max(place.startLatitude, place.endLatitude);
  const minLng = Math.min(place.startLongitude, place.endLongitude);
  const maxLng = Math.max(place.startLongitude, place.endLongitude);
  return minLat <= neLat && maxLat >= swLat && minLng <= neLng && maxLng >= swLng;
}

function inBounds(latitude, longitude, swLat, swLng, neLat, neLng) {
  return latitude != null && longitude != null
    && latitude >= swLat && latitude <= neLat
    && longitude >= swLng && longitude <= neLng;
}

function sortPlaces(a, b) {
  return String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')) || a.id.localeCompare(b.id);
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}
