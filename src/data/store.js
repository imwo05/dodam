import { placesSeed, seedUsers } from './seed.js';

// 문자열 ID 생성기 (usr_001, plc_002 ...)
function makeId(prefix, n) {
  return `${prefix}_${String(n).padStart(3, '0')}`;
}

export function createStore() {
  const seq = {
    user: 0,
    place: 0,
    schedule: 0,
    planB: 0,
    stop: 0,
    review: 0,
    journal: 0,
    activity: 0
  };

  const state = {
    users: new Map(),
    usersByUsername: new Map(),
    usersByEmail: new Map(),
    selfCareProfiles: new Map(), // userId -> profile
    concerns: new Map(), // userId -> { content, analysis }
    schedules: new Map(),
    places: new Map(),
    savedPlaces: new Map(), // userId -> Set(placeId)
    planBSessions: new Map(),
    reviews: new Map(),
    journals: new Map(),
    activities: new Map(),
    neighbors: new Map(), // userId -> Set(neighborUserId)
    passwordResetTokens: new Map(), // token -> { userId, expiresAt }
    refreshTokens: new Map()
  };

  // ---- 시드 유저(장소 등록자 겸 기본 이웃) 로드 ----
  const SEED_NEIGHBOR_IDS = [];
  for (const u of seedUsers) {
    state.users.set(u.id, { ...u });
    if (u.username) state.usersByUsername.set(u.username.toLowerCase(), u.id);
    if (u.email) state.usersByEmail.set(u.email.toLowerCase(), u.id);
    if (u.isNeighborSeed) SEED_NEIGHBOR_IDS.push(u.id);
  }

  // ---- 시드 장소 로드 ----
  for (const place of placesSeed) {
    state.places.set(place.id, { ...place, imageUrls: [...(place.imageUrls ?? [])] });
  }

  const store = {
    // ================= User =================
    createUser(input) {
      seq.user += 1;
      const now = new Date().toISOString();
      const user = {
        id: makeId('usr', seq.user),
        name: input.name,
        username: input.username,
        email: input.email,
        passwordHash: input.passwordHash,
        age: input.age ?? null,
        profileImageUrl: null,
        onboardingCompleted: false,
        createdAt: now,
        updatedAt: now
      };
      state.users.set(user.id, user);
      state.usersByUsername.set(user.username.toLowerCase(), user.id);
      state.usersByEmail.set(user.email.toLowerCase(), user.id);
      // 신규 유저에게 기본 이웃(시드 유저) 자동 연결 — 데모에서 이웃 목록이 비지 않게
      if (SEED_NEIGHBOR_IDS.length) {
        state.neighbors.set(user.id, new Set(SEED_NEIGHBOR_IDS));
      }
      return clone(user);
    },
    findUserById(id) {
      const u = state.users.get(String(id));
      return u ? clone(u) : null;
    },
    findUserByUsername(username) {
      const id = state.usersByUsername.get(String(username).toLowerCase());
      return id ? clone(state.users.get(id)) : null;
    },
    findUserByEmail(email) {
      const id = state.usersByEmail.get(String(email).toLowerCase());
      return id ? clone(state.users.get(id)) : null;
    },
    isUsernameTaken(username) {
      return state.usersByUsername.has(String(username).toLowerCase());
    },
    isEmailTaken(email) {
      return state.usersByEmail.has(String(email).toLowerCase());
    },
    updateUser(id, patch) {
      const u = state.users.get(String(id));
      if (!u) return null;
      Object.assign(u, patch, { updatedAt: new Date().toISOString() });
      return clone(u);
    },

    // ================= SelfCareProfile =================
    setSelfCareProfile(userId, profile) {
      const existing = state.selfCareProfiles.get(String(userId)) ?? {};
      const merged = { ...existing, ...profile, userId: String(userId), updatedAt: new Date().toISOString() };
      state.selfCareProfiles.set(String(userId), merged);
      return clone(merged);
    },
    getSelfCareProfile(userId) {
      const p = state.selfCareProfiles.get(String(userId));
      return p ? clone(p) : null;
    },

    setConcern(userId, concern) {
      state.concerns.set(String(userId), { ...concern });
      return clone(concern);
    },
    getConcern(userId) {
      const c = state.concerns.get(String(userId));
      return c ? clone(c) : null;
    },

    // ================= Schedule =================
    createSchedule(input) {
      seq.schedule += 1;
      const now = new Date().toISOString();
      const schedule = {
        id: makeId('sch', seq.schedule),
        userId: String(input.userId),
        date: input.date,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        title: input.title,
        isFixed: Boolean(input.isFixed),
        selfCareCategory: input.selfCareCategory ?? null,
        placeId: input.placeId ?? null,
        source: input.source ?? 'MANUAL',
        createdAt: now
      };
      state.schedules.set(schedule.id, schedule);
      return clone(schedule);
    },
    findScheduleById(id) {
      const s = state.schedules.get(String(id));
      return s ? clone(s) : null;
    },
    listSchedules({ userId, date, from, to } = {}) {
      let items = [...state.schedules.values()];
      if (userId !== undefined) items = items.filter((s) => s.userId === String(userId));
      if (date) items = items.filter((s) => s.date === date);
      if (from) items = items.filter((s) => s.date >= from);
      if (to) items = items.filter((s) => s.date <= to);
      items.sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')));
      return items.map(clone);
    },
    updateSchedule(id, patch) {
      const s = state.schedules.get(String(id));
      if (!s) return null;
      Object.assign(s, patch);
      return clone(s);
    },
    deleteSchedule(id) {
      return state.schedules.delete(String(id));
    },

    // ================= Place =================
    createPlace(input) {
      seq.place += 1;
      const now = new Date().toISOString();
      const place = {
        id: makeId('plc', 100 + seq.place), // 시드와 안 겹치게 100번대부터
        creatorId: String(input.creatorId),
        name: input.name,
        address: input.address,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        activityType: input.activityType,
        durationMinutes: input.durationMinutes ?? null,
        description: input.description ?? '',
        tip: input.tip ?? null,
        imageUrls: [...(input.imageUrls ?? [])],
        createdAt: now
      };
      state.places.set(place.id, place);
      return clone(place);
    },
    findPlaceById(id) {
      const p = state.places.get(String(id));
      return p ? clone(p) : null;
    },
    listPlaces(filters = {}) {
      let items = [...state.places.values()];
      if (filters.creatorId) items = items.filter((p) => p.creatorId === String(filters.creatorId));
      if (filters.category) items = items.filter((p) => p.activityType === filters.category);
      if (filters.keyword) {
        const kw = String(filters.keyword).toLowerCase();
        items = items.filter(
          (p) => p.name.toLowerCase().includes(kw) || (p.address ?? '').toLowerCase().includes(kw)
        );
      }
      if (filters.bbox) {
        const { swLat, swLng, neLat, neLng } = filters.bbox;
        items = items.filter(
          (p) =>
            p.latitude != null &&
            p.longitude != null &&
            p.latitude >= swLat &&
            p.latitude <= neLat &&
            p.longitude >= swLng &&
            p.longitude <= neLng
        );
      }
      if (filters.maxDurationMinutes != null) {
        items = items.filter(
          (p) => p.durationMinutes == null || p.durationMinutes <= filters.maxDurationMinutes
        );
      }
      return items.map(clone);
    },
    updatePlace(id, patch) {
      const p = state.places.get(String(id));
      if (!p) return null;
      Object.assign(p, patch);
      return clone(p);
    },
    deletePlace(id) {
      return state.places.delete(String(id));
    },

    // ================= SavedPlace =================
    savePlace(userId, placeId) {
      const key = String(userId);
      if (!state.savedPlaces.has(key)) state.savedPlaces.set(key, new Set());
      state.savedPlaces.get(key).add(String(placeId));
    },
    unsavePlace(userId, placeId) {
      state.savedPlaces.get(String(userId))?.delete(String(placeId));
    },
    isPlaceSaved(userId, placeId) {
      return Boolean(state.savedPlaces.get(String(userId))?.has(String(placeId)));
    },
    listSavedPlaces(userId) {
      const set = state.savedPlaces.get(String(userId));
      if (!set) return [];
      return [...set].map((id) => state.places.get(id)).filter(Boolean).map(clone);
    },

    // ================= PlanB =================
    createPlanBSession(input) {
      seq.planB += 1;
      const now = new Date().toISOString();
      const session = {
        id: makeId('pb', seq.planB),
        userId: String(input.userId),
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        availableMinutes: input.availableMinutes,
        selfCareCategory: input.selfCareCategory ?? null,
        customCategory: input.customCategory ?? null,
        condition: input.condition ?? null,
        continuityMode: input.continuityMode ?? null,
        latitude: input.location?.latitude ?? null,
        longitude: input.location?.longitude ?? null,
        status: 'RECOMMENDED',
        summary: input.summary ?? '',
        recommendedPlaces: input.recommendedPlaces ?? [], // [{placeId, score, reason}]
        stops: [], // course stops
        currentStopOrder: null,
        createdAt: now
      };
      state.planBSessions.set(session.id, session);
      return clone(session);
    },
    findPlanBSession(id) {
      const s = state.planBSessions.get(String(id));
      return s ? clone(s) : null;
    },
    updatePlanBSession(id, patch) {
      const s = state.planBSessions.get(String(id));
      if (!s) return null;
      Object.assign(s, patch);
      return clone(s);
    },
    _rawPlanBSession(id) {
      return state.planBSessions.get(String(id));
    },
    nextStopId() {
      seq.stop += 1;
      return makeId('stop', seq.stop);
    },

    // ================= Review =================
    createReview(input) {
      seq.review += 1;
      const now = new Date().toISOString();
      const review = {
        id: makeId('rev', seq.review),
        userId: String(input.userId),
        placeId: String(input.placeId),
        planBSessionId: input.planBSessionId ?? null,
        reaction: input.reaction,
        content: input.content ?? '',
        createdAt: now,
        updatedAt: now
      };
      state.reviews.set(review.id, review);
      return clone(review);
    },
    findReviewById(id) {
      const r = state.reviews.get(String(id));
      return r ? clone(r) : null;
    },
    listReviewsByPlace(placeId) {
      return [...state.reviews.values()]
        .filter((r) => r.placeId === String(placeId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(clone);
    },
    listReviewsByUser(userId) {
      return [...state.reviews.values()]
        .filter((r) => r.userId === String(userId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(clone);
    },
    findUserReviewForPlace(userId, placeId) {
      const r = [...state.reviews.values()].find(
        (item) => item.userId === String(userId) && item.placeId === String(placeId)
      );
      return r ? clone(r) : null;
    },
    updateReview(id, patch) {
      const r = state.reviews.get(String(id));
      if (!r) return null;
      Object.assign(r, patch, { updatedAt: new Date().toISOString() });
      return clone(r);
    },
    deleteReview(id) {
      return state.reviews.delete(String(id));
    },
    getPlaceReviewSummary(placeId) {
      const reviews = [...state.reviews.values()].filter((r) => r.placeId === String(placeId));
      return {
        recommendCount: reviews.filter((r) => r.reaction === 'RECOMMEND').length,
        disappointedCount: reviews.filter((r) => r.reaction === 'DISAPPOINTED').length
      };
    },

    // ================= Journal =================
    createJournal(input) {
      seq.journal += 1;
      const now = new Date().toISOString();
      const journal = {
        id: makeId('jnl', seq.journal),
        userId: String(input.userId),
        date: input.date ?? now.slice(0, 10),
        placeId: input.placeId ?? null,
        planBSessionId: input.planBSessionId ?? null,
        content: input.content,
        imageUrls: [...(input.imageUrls ?? [])],
        tags: [...(input.tags ?? [])],
        createdAt: now,
        updatedAt: now
      };
      state.journals.set(journal.id, journal);
      return clone(journal);
    },
    findJournalById(id) {
      const j = state.journals.get(String(id));
      return j ? clone(j) : null;
    },
    listJournals({ userId, date, year, month } = {}) {
      let items = [...state.journals.values()];
      if (userId !== undefined) items = items.filter((j) => j.userId === String(userId));
      if (date) items = items.filter((j) => j.date === date);
      if (year && month) {
        const prefix = `${year}-${String(month).padStart(2, '0')}`;
        items = items.filter((j) => j.date.startsWith(prefix));
      }
      items.sort((a, b) => b.date.localeCompare(a.date));
      return items.map(clone);
    },
    updateJournal(id, patch) {
      const j = state.journals.get(String(id));
      if (!j) return null;
      Object.assign(j, patch, { updatedAt: new Date().toISOString() });
      return clone(j);
    },
    deleteJournal(id) {
      return state.journals.delete(String(id));
    },

    // ================= Activity (완료 기록) =================
    createActivity(input) {
      seq.activity += 1;
      const activity = {
        id: makeId('act', seq.activity),
        userId: String(input.userId),
        date: input.date ?? new Date().toISOString().slice(0, 10),
        category: input.category ?? null,
        placeId: input.placeId ?? null,
        durationMinutes: input.durationMinutes ?? null,
        source: input.source ?? 'PLAN_B',
        createdAt: new Date().toISOString()
      };
      state.activities.set(activity.id, activity);
      return clone(activity);
    },
    listActivities({ userId, startDate, endDate, category } = {}) {
      let items = [...state.activities.values()];
      if (userId !== undefined) items = items.filter((a) => a.userId === String(userId));
      if (startDate) items = items.filter((a) => a.date >= startDate);
      if (endDate) items = items.filter((a) => a.date <= endDate);
      if (category) items = items.filter((a) => a.category === category);
      items.sort((a, b) => b.date.localeCompare(a.date));
      return items.map(clone);
    },
    countCompletedActivities(userId) {
      return [...state.activities.values()].filter((a) => a.userId === String(userId)).length;
    },

    // ================= Neighbors / Garden =================
    seedNeighbors(userId, neighborIds) {
      state.neighbors.set(String(userId), new Set(neighborIds.map(String)));
    },
    listNeighbors(userId) {
      const set = state.neighbors.get(String(userId));
      if (!set) return [];
      return [...set].map((id) => state.users.get(id)).filter(Boolean).map(clone);
    },
    countNeighbors(userId) {
      return state.neighbors.get(String(userId))?.size ?? 0;
    },
    getGarden(userId) {
      const completed = this.countCompletedActivities(userId);
      const level = Math.floor(completed / 3) + 1;
      return {
        level,
        completedActivityCount: completed,
        completedCount: completed,
        nextLevelAt: level * 3,
        imageUrl: `https://placehold.co/300x300?text=garden+lv${level}`
      };
    },
    countCreatedPlaces(userId) {
      return [...state.places.values()].filter((p) => p.creatorId === String(userId)).length;
    },
    countReviewsByUser(userId) {
      return [...state.reviews.values()].filter((r) => r.userId === String(userId)).length;
    },
    countVisitedPlaces(userId) {
      const set = new Set(
        [...state.activities.values()].filter((a) => a.userId === String(userId) && a.placeId).map((a) => a.placeId)
      );
      return set.size;
    },
    countCompletedPlanB(userId) {
      return [...state.planBSessions.values()].filter(
        (s) => s.userId === String(userId) && s.status === 'COMPLETED'
      ).length;
    },

    // ================= Password reset =================
    createPasswordResetToken(userId, token, expiresAt) {
      state.passwordResetTokens.set(token, { userId: String(userId), expiresAt });
    },
    consumePasswordResetToken(token) {
      const record = state.passwordResetTokens.get(token);
      if (!record) return null;
      state.passwordResetTokens.delete(token);
      return record;
    },

    // ================= Refresh tokens (auth/service.js 호환) =================
    addRefreshToken(rec) {
      state.refreshTokens.set(rec.jti, { ...rec });
    },
    findRefreshToken(jti) {
      const t = state.refreshTokens.get(jti);
      return t ? { ...t } : null;
    },
    revokeRefreshToken(jti) {
      const t = state.refreshTokens.get(jti);
      if (t) t.revokedAt = new Date().toISOString();
    },
    revokeRefreshTokensForUser(userId) {
      const now = new Date().toISOString();
      for (const t of state.refreshTokens.values()) {
        if (t.userId === String(userId) && !t.revokedAt) t.revokedAt = now;
      }
    }
  };

  return store;
}

function clone(obj) {
  if (obj == null) return obj;
  return JSON.parse(JSON.stringify(obj));
}
