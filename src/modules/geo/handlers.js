import { ApiError } from '../../lib/errors.js';

export async function searchAddresses(context) {
  const query = context.query.query ? String(context.query.query) : '';
  if (!query) throw new ApiError(422, 'VALIDATION_ERROR', 'query가 필요합니다.');

  if (context.naverGeoClient?.isConfigured) {
    const candidates = await context.naverGeoClient.searchLocal(query);
    const results = [];
    for (const candidate of candidates) {
      if (!candidate.address) continue;
      const [location] = await context.naverGeoClient.geocode(candidate.address);
      if (location) results.push({ ...candidate, ...location, provider: 'NAVER' });
    }
    return { data: results };
  }

  if (context.naverGeoClient?.isMapsConfigured) {
    const results = await context.naverGeoClient.geocode(query);
    return { data: results.map((result) => ({ ...result, provider: 'NAVER_GEOCODING' })) };
  }

  return { data: [] };
}

export async function reverseGeocode(context) {
  const lat = Number(context.query.lat);
  const lng = Number(context.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'lat, lng가 필요합니다.');
  }
  if (context.naverGeoClient?.isMapsConfigured) {
    return { data: { ...(await context.naverGeoClient.reverseGeocode(lat, lng)), provider: 'NAVER' } };
  }
  return { data: { address: null, latitude: lat, longitude: lng, provider: 'UNAVAILABLE' } };
}
