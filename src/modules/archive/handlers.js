import { requireAuth } from '../auth/service.js';

const CATEGORIES = ['WALK', 'EXERCISE', 'DIET', 'RUNNING', 'MENTAL_HEALTH'];

export async function getArchive(context) {
  const user = requireAuth(context);
  const store = context.store;
  const activities = store.listActivities({ userId: user.id });
  const journals = store.listJournals({ userId: user.id });

  return {
    data: {
      statistics: {
        visitedPlaceCount: store.countVisitedPlaces(user.id),
        completedPlanBCount: store.countCompletedPlanB(user.id),
        activityCount: activities.length,
        createdPlaceCount: store.countCreatedPlaces(user.id),
        reviewCount: store.countReviewsByUser(user.id)
      },
      recentActivities: activities.slice(0, 5).map(serializeActivity),
      savedPlacePreview: store.listSavedPlaces(user.id).slice(0, 3).map((p) => ({
        id: p.id,
        name: p.name,
        imageUrl: p.imageUrls?.[0] ?? null
      })),
      journalDates: [...new Set(journals.map((j) => j.date))].sort()
    }
  };
}

export async function getStatistics(context) {
  const user = requireAuth(context);
  const store = context.store;
  const activities = store.listActivities({ userId: user.id });
  const byCategory = {};
  for (const c of CATEGORIES) byCategory[c] = 0;
  for (const a of activities) {
    if (a.category && byCategory[a.category] !== undefined) byCategory[a.category] += 1;
  }
  return {
    data: {
      visitedPlaceCount: store.countVisitedPlaces(user.id),
      completedPlanBCount: store.countCompletedPlanB(user.id),
      activitiesByCategory: byCategory
    }
  };
}

export async function getActivities(context) {
  const user = requireAuth(context);
  const activities = context.store.listActivities({
    userId: user.id,
    startDate: context.query.startDate,
    endDate: context.query.endDate,
    category: context.query.category
  });
  const limit = Math.min(Number(context.query.limit ?? 50) || 50, 100);
  return { data: { activities: activities.slice(0, limit).map(serializeActivity) } };
}

function serializeActivity(a) {
  return {
    id: a.id,
    date: a.date,
    category: a.category,
    placeId: a.placeId,
    durationMinutes: a.durationMinutes,
    source: a.source
  };
}
