import { haversineKm, placeLocation } from './route-provider.js';

export function createDistanceProvider({ maxRadiusKm = 15 } = {}) {
  return {
    name: 'fallback-geodesic-distance',
    getDistanceKm(origin, destination) {
      return haversineKm(origin, destination);
    },
    isWithinRadius(origin, destination) {
      if (!origin) return true;
      return this.getDistanceKm(origin, destination) <= maxRadiusKm;
    },
    getPlaceDistanceKm(origin, place) {
      return this.getDistanceKm(origin, placeLocation(place));
    }
  };
}
