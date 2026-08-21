export function normalizePlanBLocation(location) {
  if (!location || typeof location !== 'object') return null;

  const { latitude, longitude } = location;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return { latitude, longitude };
}
