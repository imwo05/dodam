import { requireAuth } from '../auth/service.js';

export async function getHome(context) {
  const user = requireAuth(context);
  const store = context.store;
  const date = context.query.date ? String(context.query.date) : new Date().toISOString().slice(0, 10);
  const lat = context.query.lat ? Number(context.query.lat) : null;
  const lng = context.query.lng ? Number(context.query.lng) : null;

  const dailySchedules = store.listSchedules({ userId: user.id, date }).map((s) => ({
    id: s.id,
    startTime: s.startTime,
    endTime: s.endTime,
    title: s.title,
    selfCareCategory: s.selfCareCategory
  }));

  let places = store.listPlaces({});
  if (lat != null && lng != null) {
    places = places
      .map((p) => ({
        p,
        d: Math.hypot(
          lat - (p.pointLatitude ?? p.startLatitude ?? p.latitude ?? 999),
          lng - (p.pointLongitude ?? p.startLongitude ?? p.longitude ?? 999)
        )
      }))
      .sort((a, b) => a.d - b.d)
      .map((x) => x.p);
  }

  const garden = store.getGarden(user.id);

  return {
    data: {
      date,
      user: { name: user.name },
      dailySchedules,
      realtimeRecommendedPlaces: places.slice(0, 5).map((p) => ({
        id: p.id,
        name: p.name,
        category: p.activityType,
        imageUrl: p.imageUrls?.[0] ?? null,
        durationMinutes: p.durationMinutes
      })),
      savedPlaces: store.listSavedPlaces(user.id).map((p) => ({
        id: p.id,
        name: p.name,
        imageUrl: p.imageUrls?.[0] ?? null
      })),
      garden
    }
  };
}
