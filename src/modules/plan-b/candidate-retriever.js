import { placeLocation } from './route-provider.js';

const LOW_INTENSITY_CATEGORIES = new Set(['WALK', 'MENTAL_HEALTH', 'DIET']);
const HIGH_INTENSITY_CATEGORIES = new Set(['RUNNING', 'EXERCISE']);

export function retrieveCandidates({ store, planContext, routeProvider, distanceProvider, excludePlaceIds = [] }) {
  const excluded = new Set(excludePlaceIds.map(String));
  const currentLocation = planContext.currentLocation;
  const requestedCategory = planContext.selfCareCategory;
  const usableMinutes = planContext.availableWindow.usableMinutes;

  const candidates = store.listPlaces({})
    .filter((place) => (place.status ?? 'ACTIVE') === 'ACTIVE')
    .filter((place) => !excluded.has(place.id))
    .filter((place) => isRelevantCategory(place, requestedCategory))
    .filter((place) => isIntensityCompatible(place, planContext.condition))
    .map((place) => {
      const location = placeLocation(place);
      const travelFromCurrentMinutes = routeProvider.getTravelTime(currentLocation, location);
      const durationMinutes = Number(place.durationMinutes ?? 30);
      const requiredMinutes = travelFromCurrentMinutes + durationMinutes;
      return {
        id: place.id,
        name: place.name,
        categories: place.experienceCategories?.length ? place.experienceCategories : [place.activityType],
        category: place.activityType,
        durationMinutes,
        intensity: place.intensity ?? inferredIntensity(place.activityType),
        indoorOutdoor: place.indoorOutdoor ?? null,
        tags: place.tags ?? [],
        travelFromCurrentMinutes,
        requiredMinutes,
        distanceKm: currentLocation ? distanceProvider.getDistanceKm(currentLocation, location) : null,
        place,
        score: scoreCandidate(place, planContext, travelFromCurrentMinutes, requiredMinutes)
      };
    })
    .filter((candidate) => candidate.durationMinutes <= usableMinutes)
    .filter((candidate) => !currentLocation || distanceProvider.isWithinRadius(currentLocation, candidate.place))
    .filter((candidate) => candidate.requiredMinutes <= usableMinutes)
    .sort((a, b) => b.score - a.score);

  return candidates.slice(0, 20);
}

export function maxStopsFor(availableMinutes) {
  if (availableMinutes < 30) return 1;
  if (availableMinutes < 90) return 2;
  return 3;
}

function isRelevantCategory(place, requestedCategory) {
  if (!requestedCategory || requestedCategory === 'CUSTOM') return true;
  return place.activityType === requestedCategory || place.experienceCategories?.includes(requestedCategory);
}

function isIntensityCompatible(place, condition) {
  if (!place.intensity || !condition) return true;
  if ((condition === 'TIRED' || condition === 'VERY_TIRED') && place.intensity === 'HIGH') return false;
  return true;
}

function inferredIntensity(category) {
  if (LOW_INTENSITY_CATEGORIES.has(category)) return 'LOW';
  if (HIGH_INTENSITY_CATEGORIES.has(category)) return 'HIGH';
  return null;
}

function scoreCandidate(place, planContext, travelFromCurrentMinutes, requiredMinutes) {
  let score = 0.5;
  if (planContext.selfCareCategory && place.activityType === planContext.selfCareCategory) score += 0.25;
  if ((planContext.condition === 'TIRED' || planContext.condition === 'VERY_TIRED')
      && inferredIntensity(place.activityType) === 'LOW') score += 0.15;
  if ((planContext.continuityMode === 'EASY' || planContext.continuityMode === 'MINIMUM')
      && inferredIntensity(place.activityType) === 'LOW') score += 0.1;
  if (travelFromCurrentMinutes <= 10) score += 0.1;
  if (requiredMinutes <= planContext.availableWindow.usableMinutes * 0.6) score += 0.05;
  score += preferenceScore(place, planContext.personalization ?? planContext.profile);
  return score;
}

function preferenceScore(place, personalization = {}) {
  let score = 0;
  if (matchesAny(place, [...(personalization.preferredActivities ?? []), ...(personalization.selfCareGoals ?? [])])) score += 0.3;
  if (matchesAny(place, personalization.preferredAtmospheres)) score += 0.15;
  if (matchesAny(place, personalization.avoidAtmospheres)) score -= 0.3;

  const preferredIntensity = personalization.preferredIntensity;
  if (preferredIntensity && candidateIntensity(place) === preferredIntensity) score += 0.15;

  if (personalization.socialPreference === 'SOLO' && place.soloFriendly === false) score -= 0.08;
  if (personalization.socialPreference === 'SOCIAL' && place.soloFriendly === false) score += 0.05;
  return score;
}

function matchesAny(place, preferences = []) {
  if (!Array.isArray(preferences) || !preferences.length) return false;
  const haystack = [
    place.activityType,
    place.primaryCategory,
    ...(place.experienceCategories ?? []),
    ...(place.tags ?? []),
    place.indoorOutdoor
  ].filter(Boolean).map((value) => String(value).toUpperCase());
  return preferences.some((preference) => {
    const normalized = String(preference).toUpperCase();
    return haystack.includes(normalized) || haystack.some((value) => value.includes(normalized) || normalized.includes(value));
  });
}

function candidateIntensity(place) {
  return place.intensity ?? inferredIntensity(place.activityType);
}
