// Geo 스텁. 실제로는 Kakao/Naver/Google Maps API를 백엔드나 클라에서 연결.
// 데모용으로 입력 쿼리를 기반으로 그럴듯한 mock 좌표/주소를 반환한다.
import { ApiError } from '../../lib/errors.js';

// 서울 시청 기준 근처로 mock
const BASE_LAT = 37.5665;
const BASE_LNG = 126.978;

export async function searchAddresses(context) {
  const query = context.query.query ? String(context.query.query) : '';
  if (!query) throw new ApiError(422, 'VALIDATION_ERROR', 'query가 필요합니다.');

  // 데모: 검색어를 포함한 mock 주소 3개
  const results = [0, 1, 2].map((i) => ({
    address: `서울 ${query} 일대 ${i + 1}번지`,
    latitude: Number((BASE_LAT + i * 0.002).toFixed(6)),
    longitude: Number((BASE_LNG + i * 0.002).toFixed(6))
  }));
  return { data: results };
}

export async function reverseGeocode(context) {
  const lat = Number(context.query.lat);
  const lng = Number(context.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'lat, lng가 필요합니다.');
  }
  return {
    data: {
      address: '서울 중구 세종대로 일대',
      latitude: lat,
      longitude: lng
    }
  };
}
