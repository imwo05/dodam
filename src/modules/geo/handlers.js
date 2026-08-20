import { ApiError } from '../../lib/errors.js';

// 서울 시청 기준 근처로 mock
const BASE_LAT = 37.5665;
const BASE_LNG = 126.978;

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

  // Search API 키가 없어도 주소 자체의 좌표 검색은 실제 Maps API로 제공한다.
  if (context.naverGeoClient?.isMapsConfigured) {
    const results = await context.naverGeoClient.geocode(query);
    return { data: results.map((result) => ({ ...result, provider: 'NAVER_GEOCODING' })) };
  }

  // 환경변수 미설정 시 로컬 데모가 계속 동작하도록 mock 결과를 유지한다.
  const results = [0, 1, 2].map((i) => ({
    address: `서울 ${query} 일대 ${i + 1}번지`,
    latitude: Number((BASE_LAT + i * 0.002).toFixed(6)),
    longitude: Number((BASE_LNG + i * 0.002).toFixed(6))
  }));
  return { data: results.map((result) => ({ ...result, provider: 'MOCK' })) };
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
  return {
    data: {
      address: '서울 중구 세종대로 일대',
      latitude: lat,
      longitude: lng,
      provider: 'MOCK'
    }
  };
}
