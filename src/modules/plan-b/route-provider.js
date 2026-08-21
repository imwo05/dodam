const EARTH_RADIUS_KM = 6371;

// Replaceable route/travel-time boundary. The fallback is deliberately kept here
// so Plan B scheduling does not depend on a hardcoded travel constant.
export function createRouteProvider({ minutesPerKm = 4 } = {}) {
  return {
    name: 'fallback-geodesic-estimator',
    getTravelTime(from, to) {
      if (!from || !to) return 0;
      const distanceKm = haversineKm(from, to);
      if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
      return Math.max(2, Math.ceil(distanceKm * minutesPerKm));
    }
  };
}

export function placeLocation(place) {
  if (!place) return null;
  if (place.geometryType === 'SEGMENT' && place.startLatitude != null) {
    return { latitude: Number(place.startLatitude), longitude: Number(place.startLongitude) };
  }
  const latitude = place.pointLatitude ?? place.latitude;
  const longitude = place.pointLongitude ?? place.longitude;
  if (latitude == null || longitude == null) return null;
  return { latitude: Number(latitude), longitude: Number(longitude) };
}

export function haversineKm(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const lat1 = Number(a.latitude);
  const lng1 = Number(a.longitude);
  const lat2 = Number(b.latitude);
  const lng2 = Number(b.longitude);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}
