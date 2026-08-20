const EARTH_RADIUS_KM = 6371;

export function distanceKm(fromLat, fromLng, toLat, toLng) {
  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const toRadians = (degree) => (degree * Math.PI) / 180;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
